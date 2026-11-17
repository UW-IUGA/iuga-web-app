import { EVENT_COMMAND } from "./discordCommandDefinition.js";
import { EVENT_FORM_ACTION, eventForm, readEventForm } from "./discordEventForm.js";
import { canReview } from "./discordReviewers.js";
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
} from "./discordInteractions.js";
import { validateSubmission } from "./discordSubmissionRules.js";

const PACIFIC = "America/Los_Angeles";
const REASON_LIMIT = 500;
const AUTOCOMPLETE_LIMIT = 25;
const NOT_VERIFIED = "Only verified RSO officers can submit events. Use /rso-verify to ask the IUGA board to verify you.";
const NOT_YOUR_RSO = "You can only submit events for an RSO you're verified for. Pick one from the rso list.";
const ENTRY_LABELS = [
  ["name", "Event name"],
  ["when", "When"],
  ["location", "Location"],
  ["category", "Category"],
  ["description", "Description"],
];

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
 * @param directory — the RSO directory; rsosOf(member) gives the RSOs a member represents
 * @param client — Discord REST client with postMessage and sendDirectMessage
 * @param config — { modRoleId, iugaOfficerRoleId, approvalChannelId }
 * @param now — returns the current Date
 */
export function createDiscordApprovals({ models, directory, client, config, now = () => new Date() }) {
  const submissions = () => models.DiscordEventSubmissions;

  function isReviewer(member) {
    return canReview(member, config);
  }

  async function handle(interaction) {
    if (interaction.data?.name === EVENT_COMMAND.name) {
      if (interaction.type === INTERACTION_COMMAND) return handleCommand(interaction);
      if (interaction.type === INTERACTION_AUTOCOMPLETE) return handleAutocomplete(interaction);
    }
    if (interaction.type === INTERACTION_COMPONENT) {
      const [action, id] = parseCustomId(interaction.data?.custom_id);
      if (action === "approve") return handleApprove(interaction, id);
      if (action === "deny") return handleDenyStart(interaction, id);
    }
    if (interaction.type === INTERACTION_MODAL_SUBMIT) {
      const [action, id] = parseCustomId(interaction.data?.custom_id);
      if (action === EVENT_FORM_ACTION) return handleFormSubmit(interaction);
      if (action === "deny-reason") return handleDenySubmit(interaction, id);
    }
    return reply("This command is not available yet.");
  }

  /*
   * Decide which RSO an event is for, trusting only the RSOs the directory says this member represents.
   * Returns { rso } or { refusal } with the private message to send instead.
   */
  async function chooseRso(who, pickedKey) {
    const rsos = await directory.rsosOf(who);
    if (rsos.length === 0) return { refusal: NOT_VERIFIED };
    if (pickedKey) {
      const rso = rsos.find((candidate) => candidate.rsoKey === pickedKey);
      return rso ? { rso } : { refusal: NOT_YOUR_RSO };
    }
    if (rsos.length > 1) {
      const names = rsos.map((rso) => rso.rsoName).join(", ");
      return { refusal: `You're verified for more than one RSO (${names}). Run /event again and pick one in the rso option.` };
    }
    return { rso: rsos[0] };
  }

  async function handleCommand(interaction) {
    const who = interaction.member;
    if (!who?.user) return reply("Use /event inside the IUGA server.");
    const { rso, refusal } = await chooseRso(who, commandOptions(interaction).rso);
    if (refusal) return reply(refusal);
    return eventForm(rso.rsoKey);
  }

  async function handleAutocomplete(interaction) {
    const who = interaction.member;
    const typed = String(interaction.data?.options?.find((option) => option.focused)?.value ?? "").toLowerCase();
    let rsos = [];
    try {
      if (who?.user) rsos = await directory.rsosOf(who);
    } catch (error) {
      console.error(`RSO suggestions failed: ${error.message}`);
    }
    const choices = rsos
      .filter((rso) => rso.rsoName.toLowerCase().includes(typed))
      .slice(0, AUTOCOMPLETE_LIMIT)
      .map((rso) => ({ name: rso.rsoName, value: rso.rsoKey }));
    return { type: RESPONSE_AUTOCOMPLETE, data: { choices } };
  }

  async function handleFormSubmit(interaction) {
    const who = interaction.member;
    if (!who?.user) return reply("Use /event inside the IUGA server.");
    const { rsoKey, ...entries } = readEventForm(interaction);
    const { rso, refusal } = await chooseRso(who, rsoKey);
    if (refusal) return reply(withEntries(refusal, entries));

    const checked = validateSubmission(entries, now());
    if (!checked.ok) {
      const problems = checked.errors.map((error) => `- ${error}`).join("\n");
      return reply(withEntries(`Your event was not submitted:\n${problems}`, entries));
    }

    const row = await submissions().create({
      submitterDiscordId: who.user.id,
      rsoKey: rso.rsoKey,
      rsoName: rso.rsoName,
      ...checked.value,
      status: "pending",
    });
    const id = String(row._id);
    const card = cardEmbed(row, {
      color: COLOR_PENDING,
      statusText: `Submitted by ${displayName(who)}. Waiting for approval.`,
    });

    let message;
    try {
      message = await client.postMessage(config.approvalChannelId, {
        allowed_mentions: NO_MENTIONS,
        embeds: [card],
        components: reviewButtons("", id),
      });
    } catch (error) {
      console.error(`Approval card post failed: ${error.message}`);
      await submissions().deleteOne({ _id: row._id });
      return reply("The approval post failed, so your event was not submitted. Try again in a few minutes.");
    }

    await submissions().updateOne({ _id: row._id }, { $set: { discordMessageId: message.id } });
    return reply(`Submitted **${row.eName}** for moderator approval. This is what reviewers see:`, { embeds: [card] });
  }

  async function handleApprove(interaction, id) {
    const reviewer = interaction.member;
    if (!isReviewer(reviewer)) return reply("Only moderators or IUGA officers can approve events.");
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
    if (!isReviewer(reviewer)) return reply("Only moderators or IUGA officers can deny events.");
    if (!OBJECT_ID.test(id)) return reply(STALE_MESSAGE);

    const row = await submissions().findById(id);
    if (!row) return reply(STALE_MESSAGE);
    if (row.status !== "pending") return reply(REVIEWED_MESSAGE);
    if (row.submitterDiscordId === reviewer.user.id) return reply("You cannot deny your own event.");

    return reasonModal({
      customId: `deny-reason:${id}`,
      title: "Deny event",
      label: "Reason (optional)",
      required: false,
      maxLength: REASON_LIMIT,
    });
  }

  async function handleDenySubmit(interaction, id) {
    const reviewer = interaction.member;
    if (!isReviewer(reviewer)) return reply("Only moderators or IUGA officers can deny events.");
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

// Discord can't reopen a form after submit, so failed submits hand the officer's entries back to copy.
function withEntries(message, entries) {
  const lines = ENTRY_LABELS.map(([key, label]) => `${label}: ${entries[key]}`).join("\n");
  const safeLines = lines.replaceAll("```", "'''");
  return `${message}\n\nWhat you entered, to paste into /event again:\n` + "```\n" + safeLines + "\n```";
}
