# Writing Project Scripts

This guide explains when to add a script to the repository, where it goes, and the rules it must follow. It is for developers who want to add a helper the whole team can run. For the scripts you already have, see [Development](DEVELOPMENT.md#project-scripts-root-packagejson).

## Why scripts live in the repository

A script in the repo runs the same way on every checkout, is reviewed like any other code, and is documented where developers look. A command typed from memory or copied from chat drifts, and the next developer has to rediscover it. If the team will run a command more than once, make it a script.

Keep one-off diagnostics out of the repo. A script that answers a single question for you today belongs in your scratchpad, not in `scripts/`.

## Where it goes

| Location | Use it for | Example |
|---|---|---|
| `scripts/` (repo root) | Starting or orchestrating the whole app. Uses only Node built-ins or tools installed at the root. | `scripts/dev.mjs` |
| `backend/scripts/` | Backend tooling that needs the backend's models, schemas, or dependencies. | `backend/scripts/seed-shop-orders.mjs` |

If a backend script is useful from the root, add a root alias in the root `package.json` that points at it, as `seed:shop` does. Do not copy the script.

## Naming and npm wiring

- Name npm scripts `<area>:<action>`, such as `seed:shop`. Use the same area name as the feature.
- Add a root alias only when developers run the script from the root. Keep backend-only scripts in `backend/package.json`.
- Add the command to the scripts table in [Development](DEVELOPMENT.md#project-scripts-root-packagejson) when you add it.

## Header comment

Start every script with a short header in the same shape as `scripts/dev.mjs` and `backend/scripts/seed-shop-orders.mjs`:

```js
/*
Purpose: One sentence on what the script does and why a developer runs it.
Usage:   The exact command, with any flags and the variables it reads.
Safety:  What it refuses to do, and what it will change.
Not touched: Data or systems it deliberately leaves alone.
*/
```

The header is the rationale. A developer who opens the file should learn why it exists without reading the code.

## Rules for scripts that write data

Any script that writes to a database follows these rules. They exist because a developer can point the script at the wrong database, and a mistake should cost nothing.

1. **Refuse anything that is not local.** Check the connection string before connecting. The seed script rejects non-loopback hosts and `mongodb+srv://` URIs.
2. **Tag every record you create.** Use a marker such as a `seed-` login prefix or a `catalogVersion` value. A later run can then find and remove only its own records.
3. **Never touch real records.** Delete only what your tag matches. Real users, real orders, and role assignments stay as they are.
4. **Make re-runs safe.** Remove the tagged records first, then insert fresh ones. Running the script twice should give the same result as running it once.
5. **Print one summary line, and fail loudly.** On success, say what was written and where. On error, print the reason and exit with code 1. Never swallow an error with an empty `catch`.
6. **Keep the fake data fictional.** Use the reserved `example.com` domain for emails. Names can look realistic, but never copy a real student's name, email, or Venmo handle.

## Testing

Test the rules, not the output format:

- **Guards and argument parsing:** run the script as a child process with bad input and assert it exits with code 1 and prints the reason. These checks fail before any database connection, so they need no MongoDB. See `backend/test/seedShopOrders.test.js`.
- **Write behavior:** run the script against a scratch database and check the records. Use a database name that is not `iuga`, and drop it afterward. The seed script's first run and re-run were checked this way.

Run the backend tests with `npm test --prefix backend`.

## Before you commit a script

- The header comment explains why the script exists and how to run it.
- Every write is tagged, and the script refuses non-local databases.
- A re-run gives the same result as a first run.
- There is a test for each guard.
- The command appears in the scripts table in [Development](DEVELOPMENT.md).
- The script is in its own commit, separate from feature work.
