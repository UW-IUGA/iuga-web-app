import assert from "node:assert/strict";
import { createRequire } from "node:module";
import mongoose from "mongoose";
import { test } from "node:test";
import { connectToDatabase, models } from "../models.js";
import { eventsSchema } from "../schemas/schemas.js";

test("model registry module loads shared schemas", () => {
    assert.equal(typeof connectToDatabase, "function");
});

test("backend and shared schemas resolve one Mongoose module", () => {
    const backendRequire = createRequire(import.meta.url);
    const schemaRequire = createRequire(
        new URL("../schemas/schemas.js", import.meta.url),
    );

    assert.equal(
        schemaRequire.resolve("mongoose"),
        backendRequire.resolve("mongoose"),
    );
    assert.equal(schemaRequire("mongoose").version, mongoose.version);
    assert.equal(eventsSchema.base, mongoose);
});
test("database startup fails clearly without DB_URI", async () => {
    const previousDbUri = process.env.DB_URI;
    delete process.env.DB_URI;

    try {
        await assert.rejects(
            connectToDatabase(),
            /DB_URI is not set/,
        );
    } finally {
        if (previousDbUri === undefined) delete process.env.DB_URI;
        else process.env.DB_URI = previousDbUri;
    }
});

test("database connection failures propagate to startup", async () => {
    const originalConnect = mongoose.connect;
    const connectionError = new Error("database unavailable");
    const previousDbUri = process.env.DB_URI;

    mongoose.connect = async () => {
        throw connectionError;
    };
    process.env.DB_URI = "mongodb://baseline-test.invalid/iuga";

    try {
        await assert.rejects(
            connectToDatabase(),
            (error) => error === connectionError,
        );
    } finally {
        mongoose.connect = originalConnect;
        if (previousDbUri === undefined) delete process.env.DB_URI;
        else process.env.DB_URI = previousDbUri;
    }
});

test("model registry registers every shared schema after connecting", async () => {
    const originalConnect = mongoose.connect;
    const originalModel = mongoose.model;
    const registeredModels = [];
    const previousDbUri = process.env.DB_URI;

    mongoose.connect = async () => mongoose;
    mongoose.model = (name, schema) => {
        registeredModels.push({ name, schema });
        return { modelName: name, schema };
    };
    process.env.DB_URI = "mongodb://baseline-test.invalid/iuga";

    try {
        await connectToDatabase();
    } finally {
        mongoose.connect = originalConnect;
        mongoose.model = originalModel;
        if (previousDbUri === undefined) delete process.env.DB_URI;
        else process.env.DB_URI = previousDbUri;
    }

    assert.deepEqual(
        registeredModels.map(({ name }) => name),
        [
            "Events",
            "Participants",
            "Users",
            "Feedback",
            "Roles",
            "RoleAssignments",
            "EventRequests",
            "EventReviews",
        ],
    );
    assert.deepEqual(Object.keys(models).sort(), [
        "EventRequests",
        "EventReviews",
        "Events",
        "Feedback",
        "Participants",
        "RoleAssignments",
        "Roles",
        "Users",
    ]);
    const schemaRuntime = createRequire(
        new URL("../schemas/schemas.js", import.meta.url),
    )("mongoose");

    assert.equal(schemaRuntime, mongoose);
    assert.ok(
        Object.values(models).every(
            ({ schema }) => schema.base === mongoose,
        ),
    );
});
