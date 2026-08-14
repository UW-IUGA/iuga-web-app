# Commenting Conventions

Comments exist to answer one question: **why does this code do what it does?**
The code itself answers *what* and *how*. If a comment doesn't add information
the code doesn't already show, it shouldn't be there.

This document describes the conventions used across the repository.

## Where comments are expected

**File headers.** Every source file starts with a short block comment
explaining the file's purpose. For files that expose an API surface — routes,
pipelines, shared helpers — the header also states who is allowed to call it
and what it expects and returns.

```js
/*
Purpose: Gate routes by session state so protected endpoints are only
         reachable by the right kind of user.

Authentication/Authorization Requirements: N/A (helper module, not a route)

Expected Request Information:
- req.session.isAuthenticated (set at /user/login)

Expected Response Information:
- 401 { status: "error", message: "Not authenticated" }
- 403 { status: "error", message: "Not authorized" }
*/
```

**Definitions.** Every route and every non-trivial function gets a short block
above it describing what it does and any access requirements:

```js
/*
    @endpoint: /login
    @method: POST
    @description: Exchange a Microsoft access token for a session.
*/
router.post("/login", async function (req, res) { ... });
```

```js
/*
Purpose: Save a new feedback form to the database.
Authentication/Authorization Requirements: Logged in.
*/
router.post("/", async (req, res) => { ... });
```

Either format is fine; stay consistent within a file.

**Inline.** For lines whose purpose isn't obvious from reading them:

```js
next(); // session is OK -> pass through
```

Keep inline comments short and specific. Do not restate the code
(`// increment i by 1`). If a line needs a long explanation, the code likely
needs a better name or a helper function instead.

## What comments should never contain

- **Internal jargon** — phase labels, internal tooling terms, anything that
  only makes sense to people who were in the room. Use plain software language.
- **Commented-out code.** Delete it; version control keeps history.
- **Stale descriptions.** A comment that describes behavior must stay true.
  When behavior changes, update the comment in the same change.
- **Attribution** — names, dates, "who wrote this". Version control is the
  source of truth for authorship.

## The test

A reviewer who reads only the comment blocks should be able to say: what this
endpoint does, who may call it, and what it returns. If the blocks don't tell
that story, they need more information — not more words.
