import { EVENT_COMMAND } from "../commandDefinition.js";
import { EVENT_FORM_ACTION } from "./form.js";
import { AUDIENCE_ACTION } from "./audience.js";
import { EDIT_ACTION, SEND_ACTION, createEventDrafting } from "./drafting.js";
import { APPROVE_ACTION, DENY_ACTION, DENY_REASON_ACTION, createEventReviewing } from "./reviewing.js";
import {
  INTERACTION_AUTOCOMPLETE,
  INTERACTION_COMMAND,
  INTERACTION_COMPONENT,
  INTERACTION_MODAL_SUBMIT,
  parseCustomId,
  reply,
} from "../platform/interactions.js";

const ACTION_PREFIX = "event-";
// Approval cards posted before review buttons carried the event- prefix still use these names.
const EARLIER_ACTION_NAMES = { approve: APPROVE_ACTION, deny: DENY_ACTION, "deny-reason": DENY_REASON_ACTION };

/*
 * @behavior Own the /event command and every event- button and form: officers draft and send events
 *           (drafting.js), and moderators approve or deny them (reviewing.js). Every reply disables
 *           mention parsing.
 * @param models — provides DiscordEventDrafts, DiscordEventSubmissions, and Events
 * @param directory — the RSO directory; rsosOf(member) gives the RSOs a member represents
 * @param client — Discord REST client
 * @param roles — server roles; decides who may review and which roles officers may ping
 * @param config — { approvalChannelId, announcementChannelId, guildId }
 * @param now — returns the current Date
 */
export function createEventFlow({ models, directory, client, roles, config, now = () => new Date() }) {
  const drafting = createEventDrafting({ models, directory, client, roles, config, now });
  const reviewing = createEventReviewing({ models, client, roles, config, now });

  const buttonActions = {
    [SEND_ACTION]: drafting.send,
    [EDIT_ACTION]: drafting.edit,
    [AUDIENCE_ACTION]: drafting.chooseAudience,
    [APPROVE_ACTION]: reviewing.approve,
    [DENY_ACTION]: reviewing.startDeny,
  };
  const formActions = {
    [EVENT_FORM_ACTION]: drafting.saveForm,
    [DENY_REASON_ACTION]: reviewing.deny,
  };

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

  function handle(interaction) {
    if (isCommand(interaction)) {
      return interaction.type === INTERACTION_COMMAND ? drafting.start(interaction) : drafting.suggestRsos(interaction);
    }
    const [action, id] = actionOf(interaction);
    const actions = { [INTERACTION_COMPONENT]: buttonActions, [INTERACTION_MODAL_SUBMIT]: formActions }[interaction.type];
    const run = actions?.[action];
    return run ? run(interaction, id) : reply("This command is not available yet.");
  }

  return { owns, shouldAcknowledgeFirst, handle };
}
