import { describe, it } from "node:test";
import assert from "node:assert";
import { sendSuccess } from "../routes/api/v1/helpers/sendSuccess.js";
import { makeFakeRes } from "./makeFakeRes.js";


describe("sendSuccess", () => {
  it("returns 200 with the success status", () => {
    const res = makeFakeRes();
    sendSuccess(res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, {
      status: "success",
    });
  });

  it("includes the data payload when one is given", () => {
    const res = makeFakeRes();
    sendSuccess(res, { message: "RSVP successful!" });
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, {
      status: "success",
      message: "RSVP successful!",
    });
  });
});
