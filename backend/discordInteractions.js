// Discord interaction protocol values and response shapes shared by the bot's flows.

export const INTERACTION_COMMAND = 2;
export const INTERACTION_COMPONENT = 3;
export const INTERACTION_AUTOCOMPLETE = 4;
export const INTERACTION_MODAL_SUBMIT = 5;

export const RESPONSE_MESSAGE = 4;
export const RESPONSE_UPDATE_MESSAGE = 7;
export const RESPONSE_AUTOCOMPLETE = 8;
export const RESPONSE_MODAL = 9;

const EPHEMERAL = 64;
const COMPONENT_ACTION_ROW = 1;
const COMPONENT_BUTTON = 2;
export const COMPONENT_STRING_SELECT = 3;
export const COMPONENT_TEXT_INPUT = 4;
export const COMPONENT_LABEL = 18;
export const BUTTON_PRIMARY = 1;
export const BUTTON_SECONDARY = 2;
export const BUTTON_SUCCESS = 3;
const BUTTON_DANGER = 4;
export const TEXT_INPUT_SHORT = 1;
export const TEXT_INPUT_PARAGRAPH = 2;

export const NO_MENTIONS = { parse: [] };
export const OBJECT_ID = /^[0-9a-f]{24}$/i;

export const COLOR_PENDING = 0xfee75c;
export const COLOR_APPROVED = 0x57f287;
export const COLOR_DENIED = 0xed4245;

export const STALE_MESSAGE = "This request is no longer available.";
export const REVIEWED_MESSAGE = "This request has already been reviewed.";

/*
 * @behavior Stop mention tokens from pinging anyone when text is posted back into Discord.
 */
export function neutralizeMentions(text) {
  return text.replace(/<[@#][!&]?\d+>/g, "").replace(/@/g, "@​");
}

export function reply(content, { embeds, components } = {}) {
  const data = { content, flags: EPHEMERAL, allowed_mentions: NO_MENTIONS };
  if (embeds) data.embeds = embeds;
  if (components) data.components = components;
  return { type: RESPONSE_MESSAGE, data };
}

// Replace the message a button was clicked on, such as a private preview.
export function updateMessage(content, { embeds = [], components = [] } = {}) {
  return { type: RESPONSE_UPDATE_MESSAGE, data: { content, embeds, components, allowed_mentions: NO_MENTIONS } };
}

export function buttonRow(buttons) {
  return [
    {
      type: COMPONENT_ACTION_ROW,
      components: buttons.map(({ label, customId, style }) => ({ type: COMPONENT_BUTTON, style, label, custom_id: customId })),
    },
  ];
}

export function updateCard(embed, components = []) {
  return { type: RESPONSE_UPDATE_MESSAGE, data: { embeds: [embed], components, allowed_mentions: NO_MENTIONS } };
}

export function reviewButtons(prefix, id) {
  return [
    {
      type: COMPONENT_ACTION_ROW,
      components: [
        { type: COMPONENT_BUTTON, style: BUTTON_SUCCESS, label: "Approve", custom_id: `${prefix}approve:${id}` },
        { type: COMPONENT_BUTTON, style: BUTTON_DANGER, label: "Deny", custom_id: `${prefix}deny:${id}` },
      ],
    },
  ];
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

export function commandOptions(interaction) {
  return Object.fromEntries((interaction.data?.options ?? []).map((option) => [option.name, option.value]));
}

export function parseCustomId(customId) {
  const text = String(customId ?? "");
  const index = text.indexOf(":");
  if (index < 0) return [text, ""];
  return [text.slice(0, index), text.slice(index + 1)];
}

export function displayName(member) {
  return member.nick || member.user?.global_name || member.user?.username || "Unknown";
}

export function modalText(interaction, fieldId) {
  for (const row of interaction.data?.components ?? []) {
    for (const input of row.components ?? []) {
      if (input.custom_id === fieldId) return String(input.value ?? "");
    }
  }
  return "";
}
