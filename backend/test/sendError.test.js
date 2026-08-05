import { describe, it } from "node:test";
import assert from "node:assert";
import { sendError } from "../routes/api/v1/helpers/sendError.js";
import { makeFakeRes } from "./makeFakeRes.js";


describe("sendError", () => {
  it("returns 404 with the error message", () => {
    // arrange
    const res = makeFakeRes();

    // act
    sendError(res, 404, "Event not found");

    // assert
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, {
      status: "error",
      message: "Event not found",
    });
  });

  it("falls back to the default message for 500", () => {
    const res = makeFakeRes();

    sendError(res, 500);

    assert.strictEqual(res.body.message, "There was an error on our side :(");
  });

  it("uses the explicit message when one is given", () => {
    const res = makeFakeRes();

    sendError(res, 500, "message was given");

    assert.strictEqual(res.body.message, "message was given");
  });
});
