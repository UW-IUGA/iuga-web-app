# Commenting Conventions

Comments exist to answer one question: **why does this code do what it does?**
The code itself answers *what* and *how*. If a comment doesn't add information
the code doesn't already show, it shouldn't be there.

This document describes the conventions used across the repository.

## Where comments are expected

Two block forms, split by scope: a **file header** names the file with the
`Purpose:` labels, and a **definition** block uses the `@behavior` tags.

**File headers.** Every source file starts with a block comment whose first
line is `Purpose:` — a sentence or two on what the file does. For files that
expose an API surface — routes, pipelines, shared helpers — follow it with the
labels that apply:

- `Authentication/Authorization Requirements:`
- `Expected Request Information:`
- `Expected Response Information:`

Omit a label the file has nothing to say under. A file header uses these
labels only; it does not carry `@behavior`.

```js
/*
 * Purpose: Serve the feedback form: read one form, save a new one, and let an
 * administrator delete one.
 * Authentication/Authorization Requirements: Reading and saving need a
 * signed-in user; deleting needs an administrator.
 * Expected Request Information:
 * - GET /?fID=<id> — the form to read
 * Expected Response Information:
 * - 200 with the form, or 404 when it does not exist
 */
```

**Definitions.** Every route and every non-trivial function gets a short block
above it, using the tag form — `@behavior` / `@param` / `@returns` /
`@exceptions`, the one this team calls the BERT block. `@behavior` states
observable behavior concisely, and any tag the code already makes obvious is
omitted. A trivial helper whose name says what it does needs no block at all.
The tag form belongs to definitions; a file header never uses it.

```js
/*
 * @behavior Build the express-session options for the current deployment environment.
 * @param sessionSecret — the operator-provided signing secret
 * @param deployEnv — the configured deployment environment
 * @returns explicit session persistence and cookie settings
 */
export function createSessionOptions(sessionSecret, deployEnv) { ... }
```

A route may instead use the endpoint form:

```js
/*
    @endpoint: /login
    @method: POST
    @description: Exchange a Microsoft access token for a session.
*/
router.post("/login", async function (req, res) { ... });
```

For API surfaces, either form is fine; stay consistent within a file.

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
