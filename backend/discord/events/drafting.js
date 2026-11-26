import { DRAFT_LIFETIME_MS } from "./drafts.js";
import { eventForm, readEventForm } from "./form.js";
import { allowedAudience, audiencePicker } from "./audience.js";
import { statusCard } from "./card.js";
import { approvalCardButtons } from "./reviewing.js";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  BUTTON_SUCCESS,
  NO_MENTIONS,
  RESPONSE_AUTOCOMPLETE,
  buttonRow,
  commandOptions,
  displayName,
  neutralizeMentions,
  reply,
  updateMessage,
} from "../platform/interactions.js";
import { COLOR_PENDING, isRecordId } from "../review.js";
import { validateSubmission } from "./submissionRules.js";

export const SEND_ACTION = "event-send";
export const EDIT_ACTION = "event-edit";
const AUTOCOMPLETE_LIMIT = 25;
const NOT_VERIFIED = "Only verified RSO officers can submit events. Use /rso-verify to ask the IUGA board to verify you.";
const NOT_YOUR_RSO = "You can only submit events for an RSO you're verified for. Pick one from the rso list.";
const DRAFT_EXPIRED = "This draft expired. Run /event again.";
const PREVIEW_STATUS = "Preview: not sent yet. Reviewers see this card once you send it.";
const PREVIEW_PROMPT = "Here's your event. Check the date and time, pick any interest roles to notify, then send it for review.";
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
 * @behavior Let an RSO officer draft an event: open the form, save and check their answers, preview the
 *           card, pick interest roles to notify, and send it to the approval channel. Every step re-checks
 *           that the draft is theirs and that they still represent its RSO.
 * @param models — provides DiscordEventDrafts and DiscordEventSubmissions
 * @param directory — the RSO directory; rsosOf(member) gives the RSOs a member represents
 * @param client — Discord REST client with postMessage
 * @param roles — server roles; decides which roles officers may ping
 * @param config — { approvalChannelId, guildId }
 * @param now — returns the current Date
 */
export function createEventDrafting({ models, directory, client, roles, config, now }) {
  const submissions = () => models.DiscordEventSubmissions;
  const drafts = () => models.DiscordEventDrafts;

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

  async function start(interaction) {
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

  async function suggestRsos(interaction) {
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
    const draft = isRecordId(draftId) ? await drafts().findById(draftId) : null;
    if (!draft || draft.submitterDiscordId !== who.user.id || new Date(draft.expiresAt) <= now()) {
      return { refusal: reply(DRAFT_EXPIRED) };
    }
    const { rso, refusal } = await chooseRso(who, draft.rsoKey);
    if (refusal) return { refusal: reply(refusal) };
    return { draft, rso };
  }

  async function saveForm(interaction) {
    const { draftId, entries } = readEventForm(interaction);
    const { draft, rso, refusal } = await ownDraft(interaction.member, draftId);
    if (refusal) return refusal;

    const saved = clippedEntries(entries);
    await drafts().updateOne({ _id: draft._id }, { $set: { entries: saved, expiresAt: draftExpiry() } });

    const checked = validateSubmission(saved, now());
    if (!checked.ok) return reply(problemNote(checked.errors), { components: fixButton(draftId) });
    return reply(PREVIEW_PROMPT, preview(draftId, rso, checked.value, audienceOf(draft)));
  }

  async function chooseAudience(interaction, draftId) {
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

  async function edit(interaction, draftId) {
    const { draft, refusal } = await ownDraft(interaction.member, draftId);
    if (refusal) return refusal;
    const entries = entriesOf(draft);
    const checked = validateSubmission(entries, now());
    return eventForm(draftId, { entries, problems: checked.ok ? {} : checked.errors });
  }

  async function send(interaction, draftId) {
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
    const card = statusCard(row, {
      color: COLOR_PENDING,
      statusText: `Submitted by ${displayName(who)}. Waiting for approval.`,
    });

    let message;
    try {
      message = await client.postMessage(config.approvalChannelId, {
        allowed_mentions: NO_MENTIONS,
        embeds: [card],
        components: approvalCardButtons(id),
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

  return { start, suggestRsos, saveForm, chooseAudience, edit, send };
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
  const card = statusCard(
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
