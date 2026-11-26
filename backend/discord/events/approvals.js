import { EVENT_COMMAND } from "../commandDefinition.js";
import { DRAFT_LIFETIME_MS } from "./drafts.js";
import { EVENT_FORM_ACTION, eventForm, readEventForm } from "./form.js";
import { createEventAnnouncements } from "./announcements.js";
import { AUDIENCE_ACTION, allowedAudience, audienceField, audiencePicker } from "./audience.js";
import { categoriesOf, eventCardBase } from "./card.js";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  BUTTON_SUCCESS,
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
  buttonRow,
  commandOptions,
  displayName,
  modalText,
  neutralizeMentions,
  parseCustomId,
  reasonModal,
  reply,
  reviewButtons,
  updateCard,
  updateMessage,
} from "../platform/interactions.js";
import { validateSubmission } from "./submissionRules.js";
import { publishApprovedEvent } from "../../eventPublication.js";

const REASON_LIMIT = 500;
const AUTOCOMPLETE_LIMIT = 25;
const NOT_VERIFIED = "Only verified RSO officers can submit events. Use /rso-verify to ask the IUGA board to verify you.";
const NOT_YOUR_RSO = "You can only submit events for an RSO you're verified for. Pick one from the rso list.";
const DRAFT_EXPIRED = "This draft expired. Run /event again.";
const PREVIEW_STATUS = "Preview: not sent yet. Reviewers see this card once you send it.";
const PREVIEW_PROMPT = "Here's your event. Check the date and time, pick any interest roles to notify, then send it for review.";
const ACTION_PREFIX = "event-";
const SEND_ACTION = "event-send";
const EDIT_ACTION = "event-edit";
const APPROVE_ACTION = "event-approve";
const DENY_ACTION = "event-deny";
const DENY_REASON_ACTION = "event-deny-reason";
// Approval cards posted before review buttons carried the event- prefix still use these names.
const EARLIER_ACTION_NAMES = { approve: APPROVE_ACTION, deny: DENY_ACTION, "deny-reason": DENY_REASON_ACTION };
const ENTRY_LIMITS = { name: 200, when: 200, location: 200, description: 2000 };
const CATEGORY_PICK_LIMIT = 10;
const ENTRY_LABELS = [
  ["name", "Event name"],
  ["when", "When"],
  ["location", "Location"],
  ["categories", "Categories"],
  ["description", "Description"],
];

/*
 * @behavior Run the /event submission and moderator approval flow for Discord interactions.
 *           Officers fill in a draft through the form, preview it, and send it for review; moderators
 *           (or administrators) approve or deny; approval publishes exactly one Events row. Every reply
 *           disables mention parsing.
 * @param models — provides DiscordEventDrafts, DiscordEventSubmissions, and Events
 * @param directory — the RSO directory; rsosOf(member) gives the RSOs a member represents
 * @param client — Discord REST client with postMessage and sendDirectMessage
 * @param roles — server roles; decides who may review and which roles officers may ping
 * @param config — { approvalChannelId, announcementChannelId, guildId }
 * @param now — returns the current Date
 */
export function createDiscordApprovals({ models, directory, client, roles, config, now = () => new Date() }) {
  const submissions = () => models.DiscordEventSubmissions;
  const drafts = () => models.DiscordEventDrafts;
  const announcements = createEventAnnouncements({
    client,
    channelId: config.announcementChannelId,
    guildId: config.guildId,
    now,
  });

  function isCommand(interaction) {
    const named = interaction.type === INTERACTION_COMMAND || interaction.type === INTERACTION_AUTOCOMPLETE;
    return named && interaction.data?.name === EVENT_COMMAND.name;
  }

  function actionOf(interaction) {
    const [name, id] = parseCustomId(interaction.data?.custom_id);
    return [Object.hasOwn(EARLIER_ACTION_NAMES, name) ? EARLIER_ACTION_NAMES[name] : name, id];
  }

  function owns(interaction) {
    return isCommand(interaction) || actionOf(interaction)[0].startsWith(ACTION_PREFIX);
  }

  // Approving publishes to the website and posts to Discord, which can outlast Discord's reply deadline.
  function shouldAcknowledgeFirst(interaction) {
    return interaction.type === INTERACTION_COMPONENT && actionOf(interaction)[0] === APPROVE_ACTION;
  }

  async function handle(interaction) {
    if (isCommand(interaction)) {
      return interaction.type === INTERACTION_COMMAND ? handleCommand(interaction) : handleAutocomplete(interaction);
    }
    const [action, id] = actionOf(interaction);
    if (interaction.type === INTERACTION_COMPONENT) {
      if (action === SEND_ACTION) return handleSend(interaction, id);
      if (action === EDIT_ACTION) return handleEdit(interaction, id);
      if (action === AUDIENCE_ACTION) return handleAudience(interaction, id);
      if (action === APPROVE_ACTION) return handleApprove(interaction, id);
      if (action === DENY_ACTION) return handleDenyStart(interaction, id);
    }
    if (interaction.type === INTERACTION_MODAL_SUBMIT) {
      if (action === EVENT_FORM_ACTION) return handleFormSubmit(interaction);
      if (action === DENY_REASON_ACTION) return handleDenySubmit(interaction, id);
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
    const draft = await drafts().create({
      submitterDiscordId: who.user.id,
      rsoKey: rso.rsoKey,
      rsoName: rso.rsoName,
      expiresAt: draftExpiry(),
    });
    return eventForm(String(draft._id));
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

  function draftExpiry() {
    return new Date(now().getTime() + DRAFT_LIFETIME_MS);
  }

  /*
   * Load a draft for the member acting on it, re-checking that it's theirs, still current, and for an
   * RSO they still represent. Draft ids arrive in client-controlled custom_ids, so nothing else is trusted.
   * Returns { draft, rso } or { refusal } with the private reply to send instead.
   */
  async function ownDraft(who, draftId) {
    if (!who?.user) return { refusal: reply("Use /event inside the IUGA server.") };
    const draft = OBJECT_ID.test(draftId) ? await drafts().findById(draftId) : null;
    if (!draft || draft.submitterDiscordId !== who.user.id || new Date(draft.expiresAt) <= now()) {
      return { refusal: reply(DRAFT_EXPIRED) };
    }
    const { rso, refusal } = await chooseRso(who, draft.rsoKey);
    if (refusal) return { refusal: reply(refusal) };
    return { draft, rso };
  }

  async function handleFormSubmit(interaction) {
    const { draftId, entries } = readEventForm(interaction);
    const { draft, rso, refusal } = await ownDraft(interaction.member, draftId);
    if (refusal) return refusal;

    const saved = clippedEntries(entries);
    await drafts().updateOne({ _id: draft._id }, { $set: { entries: saved, expiresAt: draftExpiry() } });

    const checked = validateSubmission(saved, now());
    if (!checked.ok) return reply(problemNote(checked.errors), { components: fixButton(draftId) });
    return reply(PREVIEW_PROMPT, preview(draftId, rso, checked.value, audienceOf(draft)));
  }

  async function handleAudience(interaction, draftId) {
    const { draft, rso, refusal } = await ownDraft(interaction.member, draftId);
    if (refusal) return refusal;

    const checked = validateSubmission(entriesOf(draft), now());
    if (!checked.ok) return updateMessage(problemNote(checked.errors), { components: fixButton(draftId) });

    const { roleIds, refused } = allowedAudience(interaction.data?.values ?? [], interaction.data?.resolved?.roles, {
      guildId: config.guildId,
      roles,
    });
    await drafts().updateOne({ _id: draft._id }, { $set: { interestRoleIds: roleIds, expiresAt: draftExpiry() } });

    const note = refused.length
      ? `${neutralizeMentions(refused.join(", "))} can't be notified. Only interest roles that anyone can mention are allowed.`
      : PREVIEW_PROMPT;
    return updateMessage(note, preview(draftId, rso, checked.value, roleIds));
  }

  async function handleEdit(interaction, draftId) {
    const { draft, refusal } = await ownDraft(interaction.member, draftId);
    if (refusal) return refusal;
    const entries = entriesOf(draft);
    const checked = validateSubmission(entries, now());
    return eventForm(draftId, { entries, problems: checked.ok ? {} : checked.errors });
  }

  async function handleSend(interaction, draftId) {
    const who = interaction.member;
    const { draft, rso, refusal } = await ownDraft(who, draftId);
    if (refusal) return refusal;

    const checked = validateSubmission(entriesOf(draft), now());
    if (!checked.ok) return updateMessage(problemNote(checked.errors), { components: fixButton(draftId) });

    // Claim the draft before submitting, so a double-click can't send it twice.
    const claimed = await drafts().findOneAndDelete({ _id: draft._id });
    if (!claimed) return reply(DRAFT_EXPIRED);

    const row = await submissions().create({
      submitterDiscordId: who.user.id,
      rsoKey: rso.rsoKey,
      rsoName: rso.rsoName,
      ...checked.value,
      interestRoleIds: audienceOf(claimed),
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
        components: reviewButtons(ACTION_PREFIX, id),
      });
    } catch (error) {
      console.error(`Approval card post failed: ${error.message}`);
      await submissions().deleteOne({ _id: row._id });
      await drafts().create(restorableDraft(claimed));
      return reply("The approval post failed, so your event wasn't sent. Click Send for review again in a few minutes.");
    }

    await submissions().updateOne({ _id: row._id }, { $set: { discordMessageId: message.id } });
    return updateMessage(`Sent **${row.eName}** for review. A reviewer will approve or deny it.`, { embeds: [card] });
  }

  async function handleApprove(interaction, id) {
    const reviewer = interaction.member;
    if (!roles.canReview(reviewer)) return reply("Only moderators or IUGA officers can approve events.");
    if (!OBJECT_ID.test(id)) return reply(STALE_MESSAGE);

    let result;
    try {
      result = await publishApprovedEvent({
        Events: models.Events,
        submissions: submissions(),
        id,
        reviewableStatuses: ["pending"],
        prepareApproval: (row) => row.submitterDiscordId === reviewer.user.id ? null : {
          eventFields: eventFields(row),
          approvalFields: { reviewerDiscordId: reviewer.user.id },
        },
      });
    } catch (error) {
      console.error(`Event publish failed: ${error.message}`);
      return reply("Couldn't confirm publication. Try approving again to check the current status.");
    }
    if (result.kind === "missing") return reply(STALE_MESSAGE);
    if (result.kind === "reviewed") return reply(REVIEWED_MESSAGE);
    if (result.kind === "refused") return reply("You cannot approve your own event.");

    const approved = result.submission;
    const problems = await announceApproved(id, approved);
    const statusText = [`Approved by ${displayName(reviewer)}. Published to the Events page.`, ...problems].join(" ");
    return updateCard(cardEmbed(approved, { color: COLOR_APPROVED, statusText }));
  }

  // The event is already published, so a failed announcement is reported on the card, not undone.
  async function announceApproved(id, row) {
    const { problems, ...created } = await announcements.announce(row);
    if (Object.keys(created).length) {
      try {
        await submissions().updateOne({ _id: id }, { $set: created });
      } catch (error) {
        console.error(`Saving announcement IDs failed: ${error.message}`);
      }
    }
    return problems;
  }

  async function handleDenyStart(interaction, id) {
    const reviewer = interaction.member;
    if (!roles.canReview(reviewer)) return reply("Only moderators or IUGA officers can deny events.");
    if (!OBJECT_ID.test(id)) return reply(STALE_MESSAGE);

    const row = await submissions().findById(id);
    if (!row) return reply(STALE_MESSAGE);
    if (row.status !== "pending") return reply(REVIEWED_MESSAGE);
    if (row.submitterDiscordId === reviewer.user.id) return reply("You cannot deny your own event.");

    return reasonModal({
      customId: `${DENY_REASON_ACTION}:${id}`,
      title: "Deny event",
      label: "Reason (optional)",
      required: false,
      maxLength: REASON_LIMIT,
    });
  }

  async function handleDenySubmit(interaction, id) {
    const reviewer = interaction.member;
    if (!roles.canReview(reviewer)) return reply("Only moderators or IUGA officers can deny events.");
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

  return { owns, shouldAcknowledgeFirst, handle };
}

function cardEmbed(row, { color, statusText }) {
  const card = eventCardBase(row);
  card.fields.push(audienceField(row.interestRoleIds));
  if (row.denyReason) card.fields.push({ name: "Denial reason", value: row.denyReason });
  return { ...card, color, footer: { text: statusText } };
}

function eventFields(row) {
  const fields = {
    eName: row.eName,
    eOrganizers: row.rsoName,
    eStartDate: row.eStartDate,
    eLocation: row.eLocation,
    eDescription: row.eDescription,
    eLabels: categoriesOf(row),
  };
  if (row.eEndDate) fields.eEndDate = row.eEndDate;
  if (row.rsvpUrl) fields.eAltLink = { title: "RSVP", url: row.rsvpUrl };
  return fields;
}

function clippedEntries(entries) {
  const text = (key) => String(entries[key] ?? "").slice(0, ENTRY_LIMITS[key]);
  const categories = (entries.categories ?? []).map(String).slice(0, CATEGORY_PICK_LIMIT);
  return { name: text("name"), when: text("when"), location: text("location"), categories, description: text("description") };
}

function entriesOf(draft) {
  const entries = draft.entries ?? {};
  return clippedEntries({ ...entries, categories: [...(entries.categories ?? [])] });
}

function restorableDraft(draft) {
  const { _id, submitterDiscordId, rsoKey, rsoName, expiresAt } = draft;
  return { _id, submitterDiscordId, rsoKey, rsoName, entries: entriesOf(draft), interestRoleIds: audienceOf(draft), expiresAt };
}

function audienceOf(draft) {
  return [...(draft.interestRoleIds ?? [])].map(String);
}

function preview(draftId, rso, value, roleIds) {
  const card = cardEmbed(
    { rsoName: rso.rsoName, ...value, interestRoleIds: roleIds },
    { color: COLOR_PENDING, statusText: PREVIEW_STATUS },
  );
  return {
    embeds: [card],
    components: [
      ...audiencePicker(draftId, roleIds),
      ...buttonRow([
        { label: "Send for review", customId: `${SEND_ACTION}:${draftId}`, style: BUTTON_SUCCESS },
        { label: "Edit", customId: `${EDIT_ACTION}:${draftId}`, style: BUTTON_SECONDARY },
      ]),
    ],
  };
}

function problemNote(errors) {
  const lines = ENTRY_LABELS.filter(([key]) => errors[key]).map(([key, label]) => `- ${label}: ${errors[key]}`);
  return `Almost there. Fix these, then submit again:\n${lines.join("\n")}`;
}

function fixButton(draftId) {
  return buttonRow([{ label: "Fix it", customId: `${EDIT_ACTION}:${draftId}`, style: BUTTON_PRIMARY }]);
}
