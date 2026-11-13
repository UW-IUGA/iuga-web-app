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
 *           replies with a private placeholder for every other interaction until commands exist.
 * @param publicKey — the application's Ed25519 public key, as hex
 */
export function createDiscordRouter({ publicKey }) {
  const router = express.Router();

  // Parse the body as raw bytes: the signature covers the exact bytes Discord sent.
  router.post(
    "/interactions",
    express.raw({ type: "application/json", limit: REQUEST_BODY_LIMIT }),
    (req, res) => {
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

      return res.json({
        type: INTERACTION_RESPONSE_MESSAGE,
        data: { content: "This command is not available yet.", flags: EPHEMERAL_FLAG },
      });
    },
  );

  return router;
}
