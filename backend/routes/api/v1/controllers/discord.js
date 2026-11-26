import express from "express";
import { reply } from "../../../../discord/platform/interactions.js";
import { REQUEST_BODY_LIMIT } from "../../../../http/boundary.js";
import { sendError } from "../helpers/sendError.js";
import { verifyDiscordSignature } from "../../../../discord/platform/signature.js";

const INTERACTION_PING = 1;
const INTERACTION_RESPONSE_PONG = 1;
const DEFERRED_UPDATE_MESSAGE = 6;
const GENERIC_FAILURE = "Something went wrong. Try again in a few minutes.";

/*
 * @behavior Receive Discord interaction requests. Rejects unsigned requests, answers PING, and
 *           hands every other verified interaction to the flow. When the flow says an interaction
 *           is slow, Discord is acknowledged right away and the outcome follows. A thrown flow error
 *           becomes a private generic reply, and only the error message is logged.
 * @param publicKey — the application's Ed25519 public key, as hex
 * @param flow — { handle(interaction), shouldAcknowledgeFirst(interaction) }
 * @param client — sends the outcome of interactions acknowledged before their work finished
 */
export function createDiscordRouter({ publicKey, flow, client }) {
  const router = express.Router();

  // Parse the body as raw bytes: the signature covers the exact bytes Discord sent.
  router.post(
    "/interactions",
    express.raw({ type: "application/json", limit: REQUEST_BODY_LIMIT }),
    async (req, res) => {
      const verified = verifyDiscordSignature({
        publicKeyHex: publicKey,
        signature: req.get("X-Signature-Ed25519"),
        timestamp: req.get("X-Signature-Timestamp"),
        rawBody: req.body,
      });
      if (!verified) {
        return sendError(res, 401, "invalid request signature");
      }

      let interaction;
      try {
        interaction = JSON.parse(req.body.toString("utf8"));
      } catch {
        return sendError(res, 400, "invalid interaction body");
      }

      if (interaction.type === INTERACTION_PING) {
        return res.json({ type: INTERACTION_RESPONSE_PONG });
      }

      async function handle() {
        try {
          return await flow.handle(interaction);
        } catch (error) {
          console.error("Discord interaction failed:", error);
          return reply(GENERIC_FAILURE);
        }
      }

      if (!flow.shouldAcknowledgeFirst(interaction)) return res.json(await handle());

      res.json({ type: DEFERRED_UPDATE_MESSAGE });
      const result = await handle();
      try {
        await client.completeDeferredInteraction(interaction, result);
      } catch (error) {
        console.error("Discord could not deliver the deferred interaction result:", error.message);
      }
    },
  );

  return router;
}
