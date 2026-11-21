import { eventCardBase } from "./discordEventCard.js";
import { neutralizeMentions } from "./discordInteractions.js";

const EVENTS_PAGE_URL = "https://iuga.info/events";
const EXTERNAL_ENTITY_TYPE = 3;
const GUILD_ONLY_PRIVACY_LEVEL = 2;
const DISCORD_TEXT_LIMIT = 100;
const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_CHANNEL = 10003;
const UNKNOWN_SCHEDULED_EVENT = 10070;

function failureText(summary, error) {
  return error.likelyCause ? `${summary}: ${error.likelyCause}.` : `${summary}.`;
}

function clippedText(text) {
  return text.slice(0, DISCORD_TEXT_LIMIT).replace(/[\uD800-\uDBFF]$/, "");
}

function announcementMessage(submission) {
  const roleIds = submission.interestRoleIds ?? [];
  const pings = roleIds.map((roleId) => `<@&${roleId}>`).join(" ");
  const card = eventCardBase({
    rsoName: neutralizeMentions(submission.rsoName),
    eName: neutralizeMentions(submission.eName),
    eLocation: neutralizeMentions(submission.eLocation),
    eDescription: neutralizeMentions(submission.eDescription),
    eStartDate: submission.eStartDate,
    eEndDate: submission.eEndDate,
    eLabels: submission.eLabels,
    eLabel: submission.eLabel,
    rsvpUrl: submission.rsvpUrl,
  });
  return {
    content: pings || undefined,
    allowed_mentions: { roles: roleIds },
    embeds: [{ ...card, url: EVENTS_PAGE_URL }],
  };
}

function scheduledEventFields(submission) {
  return {
    name: clippedText(submission.eName),
    description: submission.eDescription,
    entity_type: EXTERNAL_ENTITY_TYPE,
    privacy_level: GUILD_ONLY_PRIVACY_LEVEL,
    scheduled_start_time: submission.eStartDate.toISOString(),
    scheduled_end_time: submission.eEndDate.toISOString(),
    entity_metadata: { location: clippedText(submission.eLocation) },
  };
}

async function ignoringGone(discordCodes, action) {
  try {
    await action();
  } catch (error) {
    if (discordCodes.includes(error.discordCode)) return;
    throw error;
  }
}

/*
 * @behavior Post an approved event to Discord and create its Scheduled Event. Each part runs on its own: a failure
 *   in one is reported in problems and does not stop the other. Parts whose IDs are already saved are skipped.
 *   withdraw deletes both parts; a part Discord reports as already gone counts as deleted.
 * @param client — Discord client with postMessage, createScheduledEvent, deleteMessage, deleteScheduledEvent
 * @param channelId — announcement channel ID; empty means no announcement
 * @param guildId — server ID that owns the Scheduled Event
 * @param now — returns the current Date
 * @returns announce → { announcementChannelId?, announcementMessageId?, scheduledEventId?, problems: string[] } with only the IDs created now
 */
export function createEventAnnouncements({ client, channelId, guildId, now }) {
  async function announce(submission) {
    const problems = [];
    const saved = {};

    if (!submission.announcementMessageId) {
      if (channelId) {
        try {
          const message = await client.postMessage(channelId, announcementMessage(submission));
          saved.announcementChannelId = channelId;
          saved.announcementMessageId = message.id;
        } catch (error) {
          console.error(`Event announcement failed: ${error.message}`);
          problems.push(failureText("Discord announcement failed", error));
        }
      } else {
        problems.push("No announcement channel configured.");
      }
    }

    const hasEnd = Boolean(submission.eEndDate);
    const hasStarted = submission.eStartDate <= now();
    if (!submission.scheduledEventId && hasEnd && !hasStarted) {
      try {
        const event = await client.createScheduledEvent(guildId, scheduledEventFields(submission));
        saved.scheduledEventId = event.id;
      } catch (error) {
        console.error(`Scheduled Event failed: ${error.message}`);
        problems.push(failureText("Discord Scheduled Event failed", error));
      }
    }

    return { ...saved, problems };
  }

  async function withdraw(submission) {
    if (submission.announcementMessageId) {
      await ignoringGone([UNKNOWN_MESSAGE, UNKNOWN_CHANNEL], () =>
        client.deleteMessage(submission.announcementChannelId, submission.announcementMessageId),
      );
    }
    if (submission.scheduledEventId) {
      await ignoringGone([UNKNOWN_SCHEDULED_EVENT], () =>
        client.deleteScheduledEvent(guildId, submission.scheduledEventId),
      );
    }
  }

  return { announce, withdraw };
}
