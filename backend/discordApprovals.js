import { neutralizeMentions, validateSubmission } from "./discordSubmissionRules.js";

const INTERACTION_COMMAND = 2;
const INTERACTION_COMPONENT = 3;
const INTERACTION_MODAL_SUBMIT = 5;

const RESPONSE_MESSAGE = 4;
const RESPONSE_UPDATE_MESSAGE = 7;
const RESPONSE_MODAL = 9;

const EPHEMERAL = 64;
const COMPONENT_ACTION_ROW = 1;
const COMPONENT_BUTTON = 2;
const COMPONENT_TEXT_INPUT = 4;
const BUTTON_SUCCESS = 3;
const BUTTON_DANGER = 4;
const TEXT_INPUT_PARAGRAPH = 2;

const ADMINISTRATOR = 1n << 3n;
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const PACIFIC = "America/Los_Angeles";
const NO_MENTIONS = { parse: [] };
const REASON_LIMIT = 500;

const COLOR_PENDING = 0xfee75c;
const COLOR_APPROVED = 0x57f287;
const COLOR_DENIED = 0xed4245;

const STALE_MESSAGE = "This request is no longer available.";
const REVIEWED_MESSAGE = "This request has already been reviewed.";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC,
  dateStyle: "medium",
  timeStyle: "short",
});
const timeFormat = new Intl.DateTimeFormat("en-US", { timeZone: PACIFIC, timeStyle: "short" });

/*
 * @behavior Run the /event submission and moderator approval flow for Discord interactions.
 *           Officers submit; moderators (or administrators) approve or deny; approval publishes
 *           exactly one Events row. Every reply disables mention parsing.
 * @param models — provides DiscordEventSubmissions and Events
 * @param registry — resolves a Discord user ID to { rsoKey, rsoName }
 * @param client — Discord REST client with postMessage and sendDirectMessage
 * @param config — { officerRoleId, modRoleId, approvalChannelId }
 * @param now — returns the current Date
 */
export function createDiscordApprovals({ models, registry, client, config, now = () => new Date() }) {
  const submissions = () => models.DiscordEventSubmissions;

  function reply(content) {
    return { type: RESPONSE_MESSAGE, data: { content, flags: EPHEMERAL, allowed_mentions: NO_MENTIONS } };
  }

  function updateCard(embed, components = []) {
    return {
      type: RESPONSE_UPDATE_MESSAGE,
      data: { embeds: [embed], components, allowed_mentions: NO_MENTIONS },
    };
  }

  function hasRole(who, roleId) {
    return Array.isArray(who?.roles) && who.roles.includes(roleId);
  }

  function isModerator(who) {
    if (!who?.user) return false;
    if (hasRole(who, config.modRoleId)) return true;
    return (BigInt(who.permissions ?? 0) & ADMINISTRATOR) === ADMINISTRATOR;
  }

  async function handle(interaction) {
    if (interaction.type === INTERACTION_COMMAND && interaction.data?.name === "event") {
      return handleSubmit(interaction);
    }
    if (interaction.type === INTERACTION_COMPONENT) {
      const [action, id] = parseCustomId(interaction.data?.custom_id);
      if (action === "approve") return handleApprove(interaction, id);
      if (action === "deny") return handleDenyStart(interaction, id);
    }
    if (interaction.type === INTERACTION_MODAL_SUBMIT) {
      const [action, id] = parseCustomId(interaction.data?.custom_id);
      if (action === "deny-reason") return handleDenySubmit(interaction, id);
    }
    return reply("This command is not available yet.");
  }

  async function handleSubmit(interaction) {
    const who = interaction.member;
    if (!who?.user || !hasRole(who, config.officerRoleId)) {
      return reply("Only RSO officers can submit events.");
    }
    const rso = registry.resolveRso(who.user.id);
    if (!rso) {
      return reply("Your account is not linked to an RSO. Ask a moderator to link it.");
    }

    const options = Object.fromEntries((interaction.data.options ?? []).map((o) => [o.name, o.value]));
    const checked = validateSubmission(
      {
        name: options.name,
        date: options.date,
        startTime: options.start_time,
        endTime: options.end_time,
        location: options.location,
        category: options.category,
        description: options.description,
        rsvpUrl: options.rsvp_url,
      },
      now(),
    );
    if (!checked.ok) {
      return reply(`Your event was not submitted:\n${checked.errors.map((error) => `- ${error}`).join("\n")}`);
    }

    const row = await submissions().create({
      submitterDiscordId: who.user.id,
      rsoKey: rso.rsoKey,
      rsoName: rso.rsoName,
      ...checked.value,
      status: "pending",
    });
    const id = String(row._id);

    let message;
    try {
      message = await client.postMessage(config.approvalChannelId, {
        allowed_mentions: NO_MENTIONS,
        embeds: [
          cardEmbed(row, {
            color: COLOR_PENDING,
            statusText: `Submitted by ${displayName(who)}. Waiting for approval.`,
          }),
        ],
        components: [
          {
            type: COMPONENT_ACTION_ROW,
            components: [
              { type: COMPONENT_BUTTON, style: BUTTON_SUCCESS, label: "Approve", custom_id: `approve:${id}` },
              { type: COMPONENT_BUTTON, style: BUTTON_DANGER, label: "Deny", custom_id: `deny:${id}` },
            ],
          },
        ],
      });
    } catch (error) {
      console.error(`Approval card post failed: ${error.message}`);
      await submissions().deleteOne({ _id: row._id });
      return reply("The approval post failed, so your event was not submitted. Try again in a few minutes.");
    }

    await submissions().updateOne({ _id: row._id }, { $set: { discordMessageId: message.id } });
    return reply(`Submitted **${row.eName}** for moderator approval.`);
  }

  async function handleApprove(interaction, id) {
    const reviewer = interaction.member;
    if (!isModerator(reviewer)) return reply("Only moderators can approve events.");
    if (!OBJECT_ID.test(id)) return reply(STALE_MESSAGE);

    const row = await submissions().findById(id);
    if (!row) return reply(STALE_MESSAGE);
    if (row.status !== "pending") return reply(REVIEWED_MESSAGE);
    if (row.submitterDiscordId === reviewer.user.id) return reply("You cannot approve your own event.");

    const claimed = await submissions().findOneAndUpdate(
      { _id: id, status: "pending" },
      { $set: { status: "approved", reviewerDiscordId: reviewer.user.id } },
      { new: true },
    );
    if (!claimed) return reply(REVIEWED_MESSAGE);

    let event;
    try {
      event = await models.Events.create(eventFields(claimed));
    } catch (error) {
      console.error(`Event publish failed: ${error.message}`);
      await submissions().findOneAndUpdate(
        { _id: id, status: "approved" },
        { $set: { status: "pending" }, $unset: { reviewerDiscordId: "" } },
        { new: true },
      );
      return reply("Publishing failed, so the request is still pending. Try approving again.");
    }

    await submissions().updateOne({ _id: id }, { $set: { publishedEventId: event._id } });
    return updateCard(
      cardEmbed(claimed, {
        color: COLOR_APPROVED,
        statusText: `Approved by ${displayName(reviewer)}. Published to the Events page.`,
      }),
    );
  }

  async function handleDenyStart(interaction, id) {
    const reviewer = interaction.member;
    if (!isModerator(reviewer)) return reply("Only moderators can deny events.");
    if (!OBJECT_ID.test(id)) return reply(STALE_MESSAGE);

    const row = await submissions().findById(id);
    if (!row) return reply(STALE_MESSAGE);
    if (row.status !== "pending") return reply(REVIEWED_MESSAGE);
    if (row.submitterDiscordId === reviewer.user.id) return reply("You cannot deny your own event.");

    return {
      type: RESPONSE_MODAL,
      data: {
        custom_id: `deny-reason:${id}`,
        title: "Deny event",
        components: [
          {
            type: COMPONENT_ACTION_ROW,
            components: [
              {
                type: COMPONENT_TEXT_INPUT,
                custom_id: "reason",
                style: TEXT_INPUT_PARAGRAPH,
                label: "Reason (optional)",
                required: false,
                max_length: REASON_LIMIT,
              },
            ],
          },
        ],
      },
    };
  }

  async function handleDenySubmit(interaction, id) {
    const reviewer = interaction.member;
    if (!isModerator(reviewer)) return reply("Only moderators can deny events.");
    if (!OBJECT_ID.test(id)) return reply(STALE_MESSAGE);

    const existing = await submissions().findById(id);
    if (!existing) return reply(STALE_MESSAGE);
    if (existing.submitterDiscordId === reviewer.user.id) return reply("You cannot deny your own event.");

    const reason = neutralizeMentions(modalText(interaction, "reason").trim()).slice(0, REASON_LIMIT);
    const set = { status: "denied", reviewerDiscordId: reviewer.user.id };
    if (reason) set.denyReason = reason;

    const claimed = await submissions().findOneAndUpdate({ _id: id, status: "pending" }, { $set: set }, { new: true });
    if (!claimed) return reply(REVIEWED_MESSAGE);

    try {
      await client.sendDirectMessage(claimed.submitterDiscordId, {
        allowed_mentions: NO_MENTIONS,
        content: `Your event "${claimed.eName}" was not approved.${reason ? ` Reason: ${reason}` : ""}`,
      });
    } catch (error) {
      console.error(`Denial DM failed: ${error.message}`);
    }

    return updateCard(
      cardEmbed(claimed, {
        color: COLOR_DENIED,
        statusText: `Denied by ${displayName(reviewer)}.`,
      }),
    );
  }

  return { handle };
}

function parseCustomId(customId) {
  const text = String(customId ?? "");
  const index = text.indexOf(":");
  if (index < 0) return [text, ""];
  return [text.slice(0, index), text.slice(index + 1)];
}

function displayName(who) {
  return who.nick || who.user?.global_name || who.user?.username || "Unknown";
}

function modalText(interaction, fieldId) {
  for (const row of interaction.data?.components ?? []) {
    for (const input of row.components ?? []) {
      if (input.custom_id === fieldId) return String(input.value ?? "");
    }
  }
  return "";
}

function formatWhen(start, end) {
  const startText = `${dateFormat.format(start)} Pacific`;
  return end ? `${startText} to ${timeFormat.format(end)}` : startText;
}

function cardEmbed(row, { color, statusText }) {
  const fields = [
    { name: "RSO", value: row.rsoName, inline: true },
    { name: "Category", value: row.eLabel, inline: true },
    { name: "When", value: formatWhen(row.eStartDate, row.eEndDate) },
    { name: "Location", value: row.eLocation },
  ];
  if (row.rsvpUrl) fields.push({ name: "RSVP", value: row.rsvpUrl });
  if (row.denyReason) fields.push({ name: "Denial reason", value: row.denyReason });
  return {
    title: row.eName,
    description: row.eDescription,
    color,
    fields,
    footer: { text: statusText },
  };
}

function eventFields(row) {
  const fields = {
    eName: row.eName,
    eOrganizers: row.rsoName,
    eStartDate: row.eStartDate,
    eLocation: row.eLocation,
    eDescription: row.eDescription,
    eLabels: [row.eLabel],
  };
  if (row.eEndDate) fields.eEndDate = row.eEndDate;
  if (row.rsvpUrl) fields.eAltLink = { title: "RSVP", url: row.rsvpUrl };
  return fields;
}
