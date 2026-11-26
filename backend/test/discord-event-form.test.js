import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EVENT_FORM_ACTION, eventForm, readEventForm } from "../discord/events/form.js";

const MODAL = 9;
const LABEL = 18;
const TEXT_INPUT = 4;
const STRING_SELECT = 3;
const DRAFT_ID = "0123456789abcdef01234567";

function submitted(customId, fields) {
  return {
    type: 5,
    data: {
      custom_id: customId,
      components: fields.map(([fieldId, answer], index) => ({
        type: LABEL,
        id: index * 2 + 1,
        component: Array.isArray(answer)
          ? { type: STRING_SELECT, id: index * 2 + 2, custom_id: fieldId, values: answer }
          : { type: TEXT_INPUT, id: index * 2 + 2, custom_id: fieldId, value: answer },
      })),
    },
  };
}

const fieldsOf = (response) => Object.fromEntries(response.data.components.map((label) => [label.component.custom_id, label]));

describe("eventForm", () => {
  it("opens a modal tagged with the draft, within Discord's limits", () => {
    const response = eventForm(DRAFT_ID);
    assert.equal(response.type, MODAL);
    assert.equal(response.data.custom_id, `${EVENT_FORM_ACTION}:${DRAFT_ID}`);
    assert.ok(response.data.custom_id.length <= 100);
    assert.ok(response.data.title.length <= 45);
    assert.equal(response.data.components.length, 5);
    for (const label of response.data.components) {
      assert.equal(label.type, LABEL);
      assert.ok(label.label.length <= 45, label.label);
      assert.ok((label.description ?? "").length <= 100, label.description);
      assert.ok((label.component.placeholder ?? "").length <= 100);
      assert.equal(label.component.required, true, label.component.custom_id);
    }
  });

  it("asks for name, when, location, categories, and description, with a When example", () => {
    const fields = eventForm(DRAFT_ID).data.components.map((label) => label.component);
    assert.deepEqual(
      fields.map((field) => field.custom_id),
      ["name", "when", "location", "categories", "description"],
    );
    assert.equal(fields[1].placeholder, "Dec 1, 6-8pm");
    assert.equal(fields[3].type, STRING_SELECT);
    assert.equal(fields[3].min_values, 1);
    assert.equal(fields[3].max_values, 3);
    assert.deepEqual(
      fields[3].options.map((option) => option.value),
      ["Academic", "Social", "Career"],
    );
  });

  it("fills in earlier answers and picks earlier categories", () => {
    const fields = fieldsOf(
      eventForm(DRAFT_ID, {
        entries: { name: "Game Night", when: "Dec 1 6pm", location: "MGH", description: "Games", categories: ["Career"] },
      }),
    );
    assert.equal(fields.name.component.value, "Game Night");
    assert.equal(fields.when.component.value, "Dec 1 6pm");
    assert.equal(fields.location.component.value, "MGH");
    assert.equal(fields.description.component.value, "Games");
    assert.deepEqual(
      fields.categories.component.options.filter((option) => option.default).map((option) => option.value),
      ["Career"],
    );
  });

  it("leaves blank fields without a value, since Discord rejects an empty one", () => {
    const fields = fieldsOf(eventForm(DRAFT_ID, { entries: { name: "", categories: [] } }));
    assert.equal("value" in fields.name.component, false);
    assert.ok(fields.categories.component.options.every((option) => !option.default));
  });

  it("shows each problem under its field, within the 100-character hint limit", () => {
    const fields = fieldsOf(
      eventForm(DRAFT_ID, {
        problems: { when: "Couldn't read When. Try \"Dec 1, 6-8pm\" or \"Fri 6:30-8pm\".", location: "x".repeat(150) },
      }),
    );
    assert.match(fields.when.description, /^⚠ Couldn't read When/);
    assert.ok(fields.location.description.length <= 100);
    assert.doesNotMatch(fields.name.description ?? "", /⚠/);
  });
});

describe("readEventForm", () => {
  it("reads typed text and every picked category into plain fields", () => {
    const interaction = submitted(`${EVENT_FORM_ACTION}:${DRAFT_ID}`, [
      ["name", "Game Night"],
      ["when", "Dec 1 6-8pm"],
      ["location", "MGH 142"],
      ["categories", ["Social", "Career"]],
      ["description", "Board games."],
    ]);
    assert.deepEqual(readEventForm(interaction), {
      draftId: DRAFT_ID,
      entries: {
        name: "Game Night",
        when: "Dec 1 6-8pm",
        location: "MGH 142",
        categories: ["Social", "Career"],
        description: "Board games.",
      },
    });
  });

  it("returns empty answers for missing fields", () => {
    const interaction = submitted(`${EVENT_FORM_ACTION}:${DRAFT_ID}`, [["categories", []]]);
    assert.deepEqual(readEventForm(interaction), {
      draftId: DRAFT_ID,
      entries: { name: "", when: "", location: "", categories: [], description: "" },
    });
  });
});
