import { CATEGORIES, WHEN_EXAMPLE } from "./discordSubmissionRules.js";
import {
  COMPONENT_LABEL,
  COMPONENT_STRING_SELECT,
  COMPONENT_TEXT_INPUT,
  RESPONSE_MODAL,
  TEXT_INPUT_PARAGRAPH,
  TEXT_INPUT_SHORT,
  parseCustomId,
} from "./discordInteractions.js";

export const EVENT_FORM_ACTION = "event-form";

const FIELD_IDS = ["name", "when", "location", "category", "description"];

function textField({ id, label, description, placeholder, maxLength, style = TEXT_INPUT_SHORT }) {
  return {
    type: COMPONENT_LABEL,
    label,
    description,
    component: { type: COMPONENT_TEXT_INPUT, custom_id: id, style, placeholder, max_length: maxLength, required: true },
  };
}

/*
 * @behavior Build the /event pop-up form for an RSO the submitter has already been checked against.
 *           The RSO travels in the form's custom_id, so the submit must check it again.
 * @param rsoKey — the RSO the event is for
 * @returns the Discord modal response
 */
export function eventForm(rsoKey) {
  return {
    type: RESPONSE_MODAL,
    data: {
      custom_id: `${EVENT_FORM_ACTION}:${rsoKey}`,
      title: "Submit an event for review",
      components: [
        textField({ id: "name", label: "Event name", placeholder: "Game Night", maxLength: 120 }),
        textField({
          id: "when",
          label: "When",
          description: "Date, start - end, Pacific time. Use the format shown.",
          placeholder: WHEN_EXAMPLE,
          maxLength: 40,
        }),
        textField({ id: "location", label: "Location", placeholder: "Mary Gates Hall 142", maxLength: 120 }),
        {
          type: COMPONENT_LABEL,
          label: "Category",
          component: {
            type: COMPONENT_STRING_SELECT,
            custom_id: "category",
            placeholder: "Pick one",
            required: true,
            options: CATEGORIES.map((category) => ({ label: category, value: category })),
          },
        },
        textField({
          id: "description",
          label: "Description",
          placeholder: "What the event is and who it's for",
          maxLength: 1000,
          style: TEXT_INPUT_PARAGRAPH,
        }),
      ],
    },
  };
}

/*
 * @behavior Read a submitted /event form into plain strings. Values are untrusted and still need validateSubmission.
 * @returns { rsoKey, name, when, location, category, description }; missing fields are ""
 */
export function readEventForm(interaction) {
  const answers = {};
  for (const label of interaction.data?.components ?? []) {
    const field = label.component;
    if (!field?.custom_id) continue;
    answers[field.custom_id] = String((field.values ? field.values[0] : field.value) ?? "");
  }
  const [, rsoKey] = parseCustomId(interaction.data?.custom_id);
  return { rsoKey, ...Object.fromEntries(FIELD_IDS.map((id) => [id, answers[id] ?? ""])) };
}
