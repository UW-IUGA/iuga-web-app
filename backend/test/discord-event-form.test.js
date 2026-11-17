import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EVENT_FORM_ACTION, eventForm, readEventForm } from "../discordEventForm.js";

const MODAL = 9;
const LABEL = 18;
const TEXT_INPUT = 4;
const STRING_SELECT = 3;

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

describe("eventForm", () => {
  it("opens a modal tagged with the RSO, within Discord's limits", () => {
    const response = eventForm("binfo");
    assert.equal(response.type, MODAL);
    assert.equal(response.data.custom_id, `${EVENT_FORM_ACTION}:binfo`);
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

  it("asks for name, when, location, categories, and description, with the When example shown", () => {
    const fields = eventForm("binfo").data.components.map((label) => label.component);
    assert.deepEqual(
      fields.map((field) => field.custom_id),
      ["name", "when", "location", "categories", "description"],
    );
    assert.equal(fields[1].placeholder, "12/1/2026 6:00 PM - 8:00 PM");
    assert.equal(fields[3].type, STRING_SELECT);
    assert.equal(fields[3].min_values, 1);
    assert.equal(fields[3].max_values, 3);
    assert.deepEqual(
      fields[3].options.map((option) => option.value),
      ["Academic", "Social", "Career"],
    );
  });
});

describe("readEventForm", () => {
  it("reads typed text and every picked category into plain fields", () => {
    const interaction = submitted(`${EVENT_FORM_ACTION}:binfo`, [
      ["name", "Game Night"],
      ["when", "12/1/2026 6:00 PM - 8:00 PM"],
      ["location", "MGH 142"],
      ["categories", ["Social", "Career"]],
      ["description", "Board games."],
    ]);
    assert.deepEqual(readEventForm(interaction), {
      rsoKey: "binfo",
      name: "Game Night",
      when: "12/1/2026 6:00 PM - 8:00 PM",
      location: "MGH 142",
      categories: ["Social", "Career"],
      description: "Board games.",
    });
  });

  it("returns empty strings for missing fields and keeps colons in the RSO key", () => {
    const interaction = submitted(`${EVENT_FORM_ACTION}:a:b`, [["categories", []]]);
    assert.deepEqual(readEventForm(interaction), {
      rsoKey: "a:b",
      name: "",
      when: "",
      location: "",
      categories: [],
      description: "",
    });
  });
});
