import assert from "node:assert/strict";
import { test } from "node:test";
import recruitmentRouter from "../routes/api/v1/controllers/recruitment.js";
import { makeTestApi } from "./testApi.js";

async function requestCreativeRecruitment(application, error) {
    let queryFilter;
    const models = {
        CommitteeRecruitment: {
            findOne(filter) {
                queryFilter = filter;

                if (error) {
                    throw error;
                }

                const isOpen =
                    application?.committee === filter.committee &&
                    application.closesAt > filter.closesAt.$gt;
                const result = isOpen ? application : null;

                return {
                    lean: () => ({ exec: async () => result }),
                };
            },
        },
    };
    const api = await makeTestApi({
        router: recruitmentRouter,
        mountPath: "/api/v1/recruitment",
        models,
    });

    try {
        return {
        ...(await api.request("GET", "/api/v1/recruitment/creative")),
            queryFilter,
        };
    } finally {
        await api.close();
    }
}

test("GET /creative returns the form and deadline while recruitment is open", async () => {
    const application = {
        committee: "Creative",
        formUrl: "https://docs.google.com/forms/d/e/example/viewform",
        closesAt: new Date(Date.now() + 60_000),
    };

    const { status, body, queryFilter } = await requestCreativeRecruitment(application);

    assert.equal(status, 200);
    assert.deepEqual(body, {
        status: "success",
        application: {
            isOpen: true,
            formUrl: application.formUrl,
            closesAt: application.closesAt.toISOString(),
        },
    });
    assert.equal(queryFilter.committee, "Creative");
    assert.ok(queryFilter.closesAt.$gt instanceof Date);
});

test("GET /creative reports closed when the deadline has passed or no campaign exists", async (t) => {
    await t.test("deadline has passed", async () => {
        const { status, body } = await requestCreativeRecruitment({
            committee: "Creative",
            formUrl: "https://docs.google.com/forms/d/e/example/viewform",
            closesAt: new Date(Date.now() - 60_000),
        });

        assert.equal(status, 200);
        assert.deepEqual(body, {
            status: "success",
            application: { isOpen: false },
        });
    });

    await t.test("campaign is not configured", async () => {
        const { status, body } = await requestCreativeRecruitment(null);

        assert.equal(status, 200);
        assert.deepEqual(body, {
            status: "success",
            application: { isOpen: false },
        });
    });
});

test("GET /creative returns an error response when the database lookup fails", async () => {
    const { status, body } = await requestCreativeRecruitment(null, new Error("database unavailable"));

    assert.equal(status, 500);
    assert.equal(body.status, "error");
});
