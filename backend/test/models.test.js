import assert from "node:assert/strict";
import mongoose from "mongoose";
import { test } from "node:test";
import { connectToDatabase } from "../models.js";

const originalConnect = mongoose.connect;
const originalModel = mongoose.model;
function mockDatabase({ init }) {
    mongoose.connect = async () => mongoose;
    mongoose.model = (name) => name === "ReceivedStripeEvent" ? { init } : {};
}

test("model registry module loads shared schemas", () => {
    assert.equal(typeof connectToDatabase, "function");
});

test("database readiness waits for the received event model index", async () => {
    const previousUri = process.env.DB_URI;
    let resolveInit;
    const initPromise = new Promise((resolve) => {
        resolveInit = resolve;
    });

    try {
        process.env.DB_URI = "mongodb://test.invalid";
        mockDatabase({ init: () => initPromise });
        const connection = connectToDatabase();
        await Promise.resolve();
        let settled = false;
        connection.then(() => { settled = true; });
        await Promise.resolve();
        assert.equal(settled, false);
        resolveInit();
        await connection;
    } finally {
        mongoose.connect = originalConnect;
        mongoose.model = originalModel;
        if (previousUri === undefined) delete process.env.DB_URI;
        else process.env.DB_URI = previousUri;
        resolveInit?.();
    }
});

test("database readiness propagates received event model index failures", async () => {
    const previousUri = process.env.DB_URI;
    const initError = new Error("received event index failed");

    try {
        process.env.DB_URI = "mongodb://test.invalid";
        mockDatabase({ init: () => Promise.reject(initError) });
        await assert.rejects(connectToDatabase(), initError);
    } finally {
        mongoose.connect = originalConnect;
        mongoose.model = originalModel;
        if (previousUri === undefined) delete process.env.DB_URI;
        else process.env.DB_URI = previousUri;
    }
});
