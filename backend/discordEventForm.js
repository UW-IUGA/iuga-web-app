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

const TEXT_FIELD_IDS = ["name", "when", "location", "description"];
const HINT_LIMIT = 100;

function hint(normal, problem) {
  if (!problem) return normal;
  const text = `⚠ ${problem}`;
  return text.length <= HINT_LIMIT ? text : `${text.slice(0, HINT_LIMIT - 1)}…`;
}

function textField({ id, label, description, placeholder, maxLength, style = TEXT_INPUT_SHORT }, { entries, problems }) {
  const component = { type: COMPONENT_TEXT_INPUT, custom_id: id, style, placeholder, max_length: maxLength, required: true };
  if (entries[id]) component.value = String(entries[id]).slice(0, maxLength);
  return { type: COMPONENT_LABEL, label, description: hint(description, problems[id]), component };
}

/*
 * @behavior Build the /event pop-up form for a draft, filled in with what the officer typed before and
 *           with each problem shown under its field. The draft id travels in the form's custom_id, so the
 *           submit must check who owns the draft.
 * @param draftId — the officer's draft
 * @param entries — earlier answers to fill in: { name, when, location, description, categories }
 * @param problems — messages keyed by field, from validateSubmission
 * @returns the Discord modal response
 */
export function eventForm(draftId, { entries = {}, problems = {} } = {}) {
  const filled = { entries, problems };
  const picked = new Set(entries.categories ?? []);
  return {
    type: RESPONSE_MODAL,
    data: {
      custom_id: `${EVENT_FORM_ACTION}:${draftId}`,
      title: "Submit an event for review",
      components: [
        textField({ id: "name", label: "Event name", placeholder: "Game Night", maxLength: 120 }, filled),
        textField(
          {
            id: "when",
            label: "When",
            description: "Date and time range, Pacific. e.g. Fri 6-8pm or 12/1 6:30-8pm",
            placeholder: WHEN_EXAMPLE,
            maxLength: 60,
          },
          filled,
        ),
        textField({ id: "location", label: "Location", placeholder: "Mary Gates Hall 142", maxLength: 120 }, filled),
        {
          type: COMPONENT_LABEL,
          label: "Categories",
          description: hint(undefined, problems.categories),
          component: {
            type: COMPONENT_STRING_SELECT,
            custom_id: "categories",
            placeholder: "Pick one or more",
            min_values: 1,
            max_values: CATEGORIES.length,
            required: true,
            options: CATEGORIES.map((category) => ({ label: category, value: category, default: picked.has(category) })),
          },
        },
        textField(
          {
            id: "description",
            label: "Description",
            placeholder: "What the event is and who it's for",
            maxLength: 1000,
            style: TEXT_INPUT_PARAGRAPH,
          },
          filled,
        ),
      ],
    },
  };
}

/*
 * @behavior Read a submitted /event form. Values are untrusted and still need validateSubmission.
 * @returns { draftId, entries: { name, when, location, categories, description } }; missing text is "", missing categories []
 */
export function readEventForm(interaction) {
  const answers = {};
  for (const label of interaction.data?.components ?? []) {
    const field = label.component;
    if (field?.custom_id) answers[field.custom_id] = field.values ?? field.value;
  }
  const [, draftId] = parseCustomId(interaction.data?.custom_id);
  const text = Object.fromEntries(TEXT_FIELD_IDS.map((id) => [id, String(answers[id] ?? "")]));
  const categories = Array.isArray(answers.categories) ? answers.categories.map(String) : [];
  return { draftId, entries: { ...text, categories } };
}
