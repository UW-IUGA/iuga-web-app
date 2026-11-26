import { createEventAnnouncements } from "./announcements.js";
import { categoriesOf, statusCard } from "./card.js";
import { NO_MENTIONS, displayName, modalText, neutralizeMentions, reply, updateCard } from "../platform/interactions.js";
import {
  COLOR_APPROVED,
  COLOR_DENIED,
  isRecordId,
  reasonModal,
  reviewButtons,
  REVIEWED_MESSAGE,
  STALE_MESSAGE,
} from "../review.js";
import { publishApprovedEvent } from "../../eventPublication.js";

const REVIEW_PREFIX = "event-";
export const APPROVE_ACTION = `${REVIEW_PREFIX}approve`;
export const DENY_ACTION = `${REVIEW_PREFIX}deny`;
export const DENY_REASON_ACTION = `${REVIEW_PREFIX}deny-reason`;
const REASON_LIMIT = 500;

// The Approve and Deny buttons on a submission's approval card.
export function approvalCardButtons(submissionId) {
  return reviewButtons(REVIEW_PREFIX, submissionId);
}

/*
 * @behavior Let moderators (or administrators) approve or deny a submitted event. Approval publishes
 *           exactly one Events row, then announces it in Discord; denial tells the officer why.
 *           A submission is reviewed once, never by the officer who sent it.
 * @param models — provides DiscordEventSubmissions and Events
 * @param client — Discord REST client with postMessage, createScheduledEvent, and sendDirectMessage
 * @param roles — server roles; decides who may review
 * @param config — { announcementChannelId, guildId }
 * @param now — returns the current Date
 */
export function createEventReviewing({ models, client, roles, config, now }) {
  const submissions = () => models.DiscordEventSubmissions;
  const announcements = createEventAnnouncements({
    client,
    channelId: config.announcementChannelId,
    guildId: config.guildId,
    now,
  });

  async function approve(interaction, id) {
    const reviewer = interaction.member;
    if (!roles.canReview(reviewer)) return reply("Only moderators or IUGA officers can approve events.");
    if (!isRecordId(id)) return reply(STALE_MESSAGE);

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
    return updateCard(statusCard(approved, { color: COLOR_APPROVED, statusText }));
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

  async function startDeny(interaction, id) {
    const reviewer = interaction.member;
    if (!roles.canReview(reviewer)) return reply("Only moderators or IUGA officers can deny events.");
    if (!isRecordId(id)) return reply(STALE_MESSAGE);

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

  async function deny(interaction, id) {
    const reviewer = interaction.member;
    if (!roles.canReview(reviewer)) return reply("Only moderators or IUGA officers can deny events.");
    if (!isRecordId(id)) return reply(STALE_MESSAGE);

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

    return updateCard(statusCard(claimed, { color: COLOR_DENIED, statusText: `Denied by ${displayName(reviewer)}.` }));
  }

  return { approve, startDeny, deny };
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
