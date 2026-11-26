import crypto from "node:crypto";

// Prefix that wraps a raw 32-byte Ed25519 public key in SPKI DER form.
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/*
 * @behavior Check that a request really came from Discord by verifying its Ed25519 signature over
 *           the timestamp and the exact raw body bytes.
 * @returns true only for a valid signature; any malformed input returns false
 */
export function verifyDiscordSignature({ publicKeyHex, signature, timestamp, rawBody }) {
  if (!signature || !timestamp || !Buffer.isBuffer(rawBody)) return false;
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]),
      format: "der",
      type: "spki",
    });
    return crypto.verify(
      null,
      Buffer.concat([Buffer.from(timestamp), rawBody]),
      key,
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}
