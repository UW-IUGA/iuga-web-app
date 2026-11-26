import { reply } from "./platform/interactions.js";

const NOT_AVAILABLE = "This command is not available yet.";

/*
 * @behavior Send each Discord interaction to the flow that owns it. Each flow decides what it owns and
 *           which of its interactions take long enough that Discord must be acknowledged first.
 * @param flows — each { owns(interaction), shouldAcknowledgeFirst(interaction), handle(interaction) }
 */
export function createDiscordDispatcher({ flows }) {
  const ownerOf = (interaction) => flows.find((flow) => flow.owns(interaction));

  return {
    handle(interaction) {
      const flow = ownerOf(interaction);
      return flow ? flow.handle(interaction) : reply(NOT_AVAILABLE);
    },
    shouldAcknowledgeFirst(interaction) {
      return Boolean(ownerOf(interaction)?.shouldAcknowledgeFirst(interaction));
    },
  };
}
