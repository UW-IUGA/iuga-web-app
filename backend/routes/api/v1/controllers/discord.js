import express from "express";
import { REQUEST_BODY_LIMIT } from "../../../../http/boundary.js";
import { sendError } from "../helpers/sendError.js";
import { verifyDiscordSignature } from "../utils/discordSignature.js";

const INTERACTION_PING = 1;
const INTERACTION_RESPONSE_PONG = 1;
const INTERACTION_RESPONSE_MESSAGE = 4;
const EPHEMERAL_FLAG = 64;

/*
 * @behavior Receive Discord interaction requests. Rejects unsigned requests, answers PING, and
 *           hands every other verified interaction to the flow. A thrown flow error becomes a
 *           private generic reply, and only the error message is logged.
 * @param publicKey — the application's Ed25519 public key, as hex
 * @param flow — { handle(interaction) } returning a Discord interaction response
 */
export function createDiscordRouter({ publicKey, flow }) {
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

      try {
        return res.json(await flow.handle(interaction));
      } catch (error) {
        console.error("Discord interaction failed:", error);
        return res.json({
          type: INTERACTION_RESPONSE_MESSAGE,
          data: { content: "Something went wrong. Try again in a few minutes.", flags: EPHEMERAL_FLAG },
        });
      }
    },
  );

  return router;
}
