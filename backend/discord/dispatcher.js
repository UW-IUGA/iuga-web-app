import { RSO_VERIFY_COMMAND } from "./commandDefinition.js";
import { INTERACTION_AUTOCOMPLETE, INTERACTION_COMMAND } from "./platform/interactions.js";

function isRsoVerification(interaction) {
  if (interaction.type === INTERACTION_COMMAND || interaction.type === INTERACTION_AUTOCOMPLETE) {
    return interaction.data?.name === RSO_VERIFY_COMMAND.name;
  }
  return String(interaction.data?.custom_id ?? "").startsWith("rso-");
}

/*
 * @behavior Send each Discord interaction to the flow that owns it: /rso-verify and its rso- buttons
 *           to RSO verification, everything else to the /event flow.
 * @param events — the /event flow, { handle(interaction) }
 * @param rsoVerification — the /rso-verify flow, { handle(interaction) }
 */
export function createDiscordDispatcher({ events, rsoVerification }) {
  return {
    handle(interaction) {
      return isRsoVerification(interaction) ? rsoVerification.handle(interaction) : events.handle(interaction);
    },
  };
}
