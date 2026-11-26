import {
  BUTTON_DANGER,
  BUTTON_SUCCESS,
  COMPONENT_ACTION_ROW,
  COMPONENT_TEXT_INPUT,
  RESPONSE_MODAL,
  TEXT_INPUT_PARAGRAPH,
  buttonRow,
} from "./platform/interactions.js";

// How the event and RSO review flows look and answer, so a moderator sees the same thing in both:
// card colors, the Approve and Deny buttons, the deny-reason pop-up, and the replies for a request
// that is gone or already decided. Each flow keeps its own rules for approving.

export const COLOR_PENDING = 0xfee75c;
export const COLOR_APPROVED = 0x57f287;
export const COLOR_DENIED = 0xed4245;

export const STALE_MESSAGE = "This request is no longer available.";
export const REVIEWED_MESSAGE = "This request has already been reviewed.";

const RECORD_ID = /^[0-9a-f]{24}$/i;

// Ids arrive inside client-controlled button IDs, so check the shape before looking a record up.
export function isRecordId(id) {
  return RECORD_ID.test(id);
}

export function reviewButtons(prefix, id) {
  return buttonRow([
    { label: "Approve", customId: `${prefix}approve:${id}`, style: BUTTON_SUCCESS },
    { label: "Deny", customId: `${prefix}deny:${id}`, style: BUTTON_DANGER },
  ]);
}

export function reasonModal({ customId, title, label, required, maxLength }) {
  return {
    type: RESPONSE_MODAL,
    data: {
      custom_id: customId,
      title,
      components: [
        {
          type: COMPONENT_ACTION_ROW,
          components: [
            {
              type: COMPONENT_TEXT_INPUT,
              custom_id: "reason",
              style: TEXT_INPUT_PARAGRAPH,
              label,
              required,
              max_length: maxLength,
            },
          ],
        },
      ],
    },
  };
}
