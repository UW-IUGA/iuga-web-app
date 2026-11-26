import { canReview } from "../reviewers.js";
import {
  COLOR_APPROVED,
  COLOR_DENIED,
  COLOR_PENDING,
  INTERACTION_AUTOCOMPLETE,
  INTERACTION_COMMAND,
  INTERACTION_COMPONENT,
  INTERACTION_MODAL_SUBMIT,
  NO_MENTIONS,
  OBJECT_ID,
  RESPONSE_AUTOCOMPLETE,
  REVIEWED_MESSAGE,
  STALE_MESSAGE,
  commandOptions,
  displayName,
  modalText,
  neutralizeMentions,
  parseCustomId,
  reasonModal,
  reply,
  reviewButtons,
  updateCard,
} from "../platform/interactions.js";

const POSITION_LIMIT = 60;
const REASON_LIMIT = 500;
const STALE_CLAIM_MS = 2 * 60_000;
const DUPLICATE_KEY = 11000;
const LEFT_SERVER_REASON = "Left the server";

const NOT_REVIEWER = "Only moderators, IUGA officers, or server admins can review RSO officer requests.";

const REFUSAL_MESSAGES = {
  "name-taken": (row) =>
    `"${row.rsoName}" can't be approved as a new RSO: it matches a staff role, or a "${row.rsoName} Officer" role already exists that the bot didn't create. Deny it and ask for the RSO's full name, or have an admin delete the hand-made officer role and approve again.`,
  "bot-cannot-manage-roles": () =>
    "The bot isn't allowed to give roles. A server admin needs to give the bot the Manage Roles permission and drag its role above the RSO roles in Server Settings > Roles. Then approve again.",
};

/*
 * @behavior Run /rso-verify: members ask to be verified as an RSO officer, and reviewers approve or deny
 *           in the RSO approvals channel. Approval goes through the RSO directory; every review is
 *           recorded with who and when, and a request can be reviewed only once.
 * @param models — provides DiscordRsoRequests
 * @param directory — the RSO directory (suggest, identify, grantOfficer)
 * @param client — Discord REST client with postMessage and sendDirectMessage
 * @param config — { modRoleId, iugaOfficerRoleId, rsoApprovalChannelId }
 * @param now — returns the current Date
 */
export function createRsoVerification({ models, directory, client, config, now = () => new Date() }) {
  const requests = () => models.DiscordRsoRequests;
  const isReviewer = (member) => canReview(member, config);

  // An approval left in progress longer than STALE_CLAIM_MS (for example after a crash) is open again.
  function openFilter() {
    const staleBefore = new Date(now().getTime() - STALE_CLAIM_MS);
    return { $or: [{ status: "pending" }, { status: "approving", claimedAt: { $lt: staleBefore } }] };
  }

  async function handle(interaction) {
    if (interaction.type === INTERACTION_AUTOCOMPLETE) return handleAutocomplete(interaction);
    if (interaction.type === INTERACTION_COMMAND) return handleRequest(interaction);
    const [action, id] = parseCustomId(interaction.data?.custom_id);
    if (interaction.type === INTERACTION_COMPONENT && action === "rso-approve") return handleApprove(interaction, id);
    if (interaction.type === INTERACTION_COMPONENT && action === "rso-deny") return handleDenyStart(interaction, id);
    if (interaction.type === INTERACTION_MODAL_SUBMIT && action === "rso-deny-reason") {
      return handleDenySubmit(interaction, id);
    }
    return reply("This command is not available yet.");
  }

  async function handleAutocomplete(interaction) {
    const focused = (interaction.data?.options ?? []).find((option) => option.focused);
    const names = await directory.suggest(String(focused?.value ?? ""), interaction.guild_id);
    return { type: RESPONSE_AUTOCOMPLETE, data: { choices: names.map((name) => ({ name, value: name })) } };
  }

  async function handleRequest(interaction) {
    const who = interaction.member;
    if (!who?.user) return reply("Use /rso-verify inside the IUGA server.");

    const options = commandOptions(interaction);
    const identity = await directory.identify(options.rso, interaction.guild_id);
    if (!identity) return reply("The RSO name must be 1 to 80 characters.");
    const position = neutralizeMentions(String(options.position ?? "").trim());
    if (!position || position.length > POSITION_LIMIT) {
      return reply(`Position must be 1 to ${POSITION_LIMIT} characters.`);
    }

    let row;
    try {
      row = await requests().create({
        requesterDiscordId: who.user.id,
        rsoKey: identity.rsoKey,
        rsoName: identity.name,
        position,
        status: "pending",
        openKey: `${who.user.id}:${identity.rsoKey}`,
      });
    } catch (error) {
      if (error?.code !== DUPLICATE_KEY) throw error;
      return reply(`Your request for **${identity.name}** is already waiting for the board.`);
    }
    const id = String(row._id);

    let message;
    try {
      message = await client.postMessage(config.rsoApprovalChannelId, {
        allowed_mentions: NO_MENTIONS,
        embeds: [
          cardEmbed(row, {
            color: COLOR_PENDING,
            isNew: identity.isNew,
            statusText: `Requested by ${displayName(who)}. Waiting for the board.`,
          }),
        ],
        components: reviewButtons("rso-", id),
      });
    } catch (error) {
      console.error(`RSO request card post failed: ${error.message}`);
      await requests().deleteOne({ _id: row._id });
      return reply("Your request was not sent because posting to the board failed. Try again in a few minutes.");
    }

    await requests().updateOne({ _id: row._id }, { $set: { discordMessageId: message.id } });
    return reply(`Sent your request to verify as an officer of **${row.rsoName}**. You'll get a direct message when the board decides.`);
  }

  async function reviewable(interaction, id, ownMessage) {
    const reviewer = interaction.member;
    if (!isReviewer(reviewer)) return { response: reply(NOT_REVIEWER) };
    if (!OBJECT_ID.test(id)) return { response: reply(STALE_MESSAGE) };
    const row = await requests().findById(id);
    if (!row) return { response: reply(STALE_MESSAGE) };
    if (row.requesterDiscordId === reviewer.user.id) return { response: reply(ownMessage) };
    return { reviewer, row };
  }

  async function handleApprove(interaction, id) {
    const { response, reviewer } = await reviewable(interaction, id, "You cannot approve your own request.");
    if (response) return response;

    const claimed = await requests().findOneAndUpdate(
      { _id: id, ...openFilter() },
      { $set: { status: "approving", claimedAt: now(), reviewerDiscordId: reviewer.user.id } },
      { returnDocument: "after" },
    );
    if (!claimed) return reply(REVIEWED_MESSAGE);
    const release = () =>
      requests().updateOne(
        { _id: id, status: "approving", claimedAt: claimed.claimedAt },
        { $set: { status: "pending" }, $unset: { claimedAt: "", reviewerDiscordId: "" } },
      );

    let result;
    try {
      result = await directory.grantOfficer({
        guildId: interaction.guild_id,
        userId: claimed.requesterDiscordId,
        rsoKey: claimed.rsoKey,
        rsoName: claimed.rsoName,
        grantedBy: reviewer.user.id,
      });
    } catch (error) {
      await release();
      throw error;
    }

    if (result.ok) {
      await requests().updateOne(
        { _id: id },
        { $set: { status: "approved", reviewedAt: now() }, $unset: { openKey: "" } },
      );
      await notify(
        claimed.requesterDiscordId,
        `You're verified as an officer of **${result.rso.rsoName}** in the IUGA Discord. You can now submit events with /event.`,
      );
      const created = result.created ? ` Created the ${result.rso.rsoName} role.` : "";
      return updateCard(
        cardEmbed(claimed, { color: COLOR_APPROVED, statusText: `Approved by ${displayName(reviewer)}.${created}` }),
      );
    }

    if (result.reason === "member-gone") {
      const closed = { ...claimed, denyReason: LEFT_SERVER_REASON };
      await requests().updateOne(
        { _id: id },
        { $set: { status: "denied", reviewedAt: now(), denyReason: LEFT_SERVER_REASON }, $unset: { openKey: "" } },
      );
      return updateCard(cardEmbed(closed, { color: COLOR_DENIED, statusText: "Closed: the requester left the server." }));
    }

    await release();
    const explain = REFUSAL_MESSAGES[result.reason];
    return reply(explain ? explain(claimed) : "This request can't be approved right now.");
  }

  async function handleDenyStart(interaction, id) {
    const { response, row } = await reviewable(interaction, id, "You cannot deny your own request.");
    if (response) return response;
    const stillOpen = await requests().findOne({ _id: row._id, ...openFilter() });
    if (!stillOpen) return reply(REVIEWED_MESSAGE);
    return reasonModal({
      customId: `rso-deny-reason:${id}`,
      title: "Deny RSO officer request",
      label: "Reason (sent to the requester)",
      required: true,
      maxLength: REASON_LIMIT,
    });
  }

  async function handleDenySubmit(interaction, id) {
    const { response, reviewer } = await reviewable(interaction, id, "You cannot deny your own request.");
    if (response) return response;

    const reason = neutralizeMentions(modalText(interaction, "reason").trim()).slice(0, REASON_LIMIT);
    if (!reason) return reply("A reason is required to deny a request.");

    const denied = await requests().findOneAndUpdate(
      { _id: id, ...openFilter() },
      {
        $set: { status: "denied", reviewerDiscordId: reviewer.user.id, reviewedAt: now(), denyReason: reason },
        $unset: { openKey: "" },
      },
      { returnDocument: "after" },
    );
    if (!denied) return reply(REVIEWED_MESSAGE);

    await notify(
      denied.requesterDiscordId,
      `Your request to be verified as an officer of "${denied.rsoName}" was not approved. Reason: ${reason}`,
    );
    return updateCard(cardEmbed(denied, { color: COLOR_DENIED, statusText: `Denied by ${displayName(reviewer)}.` }));
  }

  async function notify(userId, content) {
    try {
      await client.sendDirectMessage(userId, { allowed_mentions: NO_MENTIONS, content });
    } catch (error) {
      console.error(`RSO request DM failed: ${error.message}`);
    }
  }

  return { handle };
}

function cardEmbed(row, { color, statusText, isNew = false }) {
  const fields = [
    { name: "Requester", value: `<@${row.requesterDiscordId}>`, inline: true },
    { name: "RSO", value: isNew ? `${row.rsoName} (New RSO)` : row.rsoName, inline: true },
    { name: "Position", value: row.position, inline: true },
  ];
  if (row.denyReason) fields.push({ name: "Denial reason", value: row.denyReason });
  return { title: "RSO officer verification", color, fields, footer: { text: statusText } };
}
