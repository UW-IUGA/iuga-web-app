# Discord event approval

Officers of a registered student organization (RSO) can submit an event from Discord with `/event`. The request lands in the `#events-approvals` channel with Approve and Deny buttons. When a moderator approves it, the event is published to the same `Events` collection the website already reads from.

The website database is still the source of truth. A social post is not an event listing, and nothing gets published from Discord text alone.

Status: the backend flow is in place and tested with fakes. It has not run end to end against the Discord test server yet. The Jenkins and container wiring is written but not pushed, and it needs the five credentials to exist first (see [Secrets](#secrets-in-jenkins)).

## How a submission moves

1. An officer runs `/event` and fills in the name, date, start time, location, category, and description. End time and RSVP link are optional.
2. The bot checks that the officer has the officer role, then looks up their Discord user ID in `DISCORD_RSO_OFFICERS` to find their RSO. Each RSO has one officer, so the command never asks which RSO they mean.
3. The input goes through the same rules every time. Names and locations are capped at 120 characters, descriptions at 1000, and RSVP links at 300. The RSVP link must be `https://`. The date must be a real date in the future. Times are read as Pacific time and stored in UTC, and the end time must come after the start. Mentions in free text are stripped.
4. If the input passes, the request is saved as `pending` in `DiscordEventSubmissions`, and an approval card is posted to `DISCORD_APPROVAL_CHANNEL_ID`. If that post fails, the pending row is deleted and the officer is asked to try again.
5. The officer gets a private confirmation. Nobody else sees it.

Who can see the cards is set in Discord's channel permissions, not in code. Anyone who can view `#events-approvals` sees every card, including the RSO, the event details, and the submitter's display name. The bot only checks who can click. Only members with the moderator role, or Discord's Administrator permission, can approve or deny. Anyone else who clicks gets a private "Only moderators can approve events" reply.

To keep the cards to moderators, limit the channel's View Channel permission to the moderator role in Discord's channel settings. The officer role (`DISCORD_OFFICER_ROLE_ID`) must not have View Channel on this channel, because officers submit with `/event` and should never see the cards. Check this before testing.

## How a review moves

- **Who can review.** Anyone with `DISCORD_MOD_ROLE_ID`, or anyone with the Discord Administrator permission, can use the buttons. The submitter can't approve or deny their own event.
- **Approve.** The approval checks that the request is still pending before it does anything. Then it marks the request approved, creates the `Events` row, and updates the card to show who approved it. The buttons come off the card.
- **A second approve.** Clicking again gets "already reviewed." No second event is created. Two clicks at the same moment can't publish twice, because only one update can move the row out of `pending`.
- **Publish fails.** If the `Events` insert fails, the request goes back to `pending`, and the moderator is asked to try again.
- **Deny.** The button opens a short form with an optional reason. Submitting it marks the request denied, updates the card, and sends the officer a DM. If the DM fails, the denial still stands.

## What gets published

| Field | Value |
|---|---|
| `eName` | Event name |
| `eOrganizers` | The RSO's name from the registry |
| `eStartDate`, `eEndDate` | Pacific wall-clock time, stored as UTC |
| `eLocation`, `eDescription` | From the command |
| `eLabels` | The category as a one-item list: Academic, Social, or Career |
| `eAltLink` | `{ title: "RSVP", url }`, only when an RSVP link was given |
| `eThumbnailPath` | Not set. Discord attachment URLs expire, and v1 has no poster upload. |
| `eHost` | Not set. It's a snapshot of a website user, and a Discord officer isn't one. |

Every `Events` row is public the moment it's inserted, which is why pending requests live in their own collection until a moderator approves them.

## Environment variables

| Variable | What it does |
|---|---|
| `DISCORD_APP_ID` | The application ID. Only the command registration script uses it. |
| `DISCORD_GUILD_ID` | The server ID for guild command registration. Only the registration script uses it. |
| `DISCORD_PUBLIC_KEY` | Verifies that requests really come from Discord. The interactions route is not mounted when this is unset. |
| `DISCORD_BOT_TOKEN` | Lets the bot post cards and send DMs. Never log it. |
| `DISCORD_OFFICER_ROLE_ID` | Role that may run `/event`. Keep it out of the approval channel's permissions. |
| `DISCORD_MOD_ROLE_ID` | Role that may approve or deny. |
| `DISCORD_APPROVAL_CHANNEL_ID` | Channel where approval cards are posted. |
| `DISCORD_RSO_OFFICERS` | JSON object keyed by Discord user ID. See below. |

Startup reads `DISCORD_RSO_OFFICERS` and stops if it's malformed. That's on purpose, so a bad value shows up at deploy time instead of as silent refusals. An unset value means no officers, which is safe but means nobody can submit.

### The officer registry

`DISCORD_RSO_OFFICERS` maps each officer's Discord user ID to their RSO:

```json
{"000000000000000001": {"rsoKey": "example-rso", "rsoName": "Example RSO"}}
```

Each entry needs a non-empty `rsoKey` and `rsoName`. The value stays out of git on purpose, because it holds personal Discord IDs. Store the real value as a Jenkins credential.

The lookup sits behind one function, `resolveRso`, in `backend/rsoRegistry.js`. If the registry moves into the database later, only that function changes.

## Secrets in Jenkins

Create each of these as a Secret text credential:

- `DISCORD_BOT_TOKEN`
- `DISCORD_OFFICER_ROLE_ID`
- `DISCORD_MOD_ROLE_ID`
- `DISCORD_APPROVAL_CHANNEL_ID`
- `DISCORD_RSO_OFFICERS`

`dev.jenkinsfile` binds all five as credentials in the Deploy stage, and `ci/deploy.groovy` passes them to the dev container with `docker run -e`. The image itself doesn't contain any of them. Only dev forwards these values for now. If a credential is missing in Jenkins, the Deploy stage fails before the container starts.

## Interactions Endpoint URL

Discord needs to know where to send interactions. In the Developer Portal, open the application, go to General Information, and set the Interactions Endpoint URL to:

```
https://dev.iuga.info/api/v1/discord/interactions
```

Save this only after the route is deployed and `DISCORD_PUBLIC_KEY` is set on that container. When you save, Discord sends a signed PING to the URL, and the route has to answer it or Discord rejects the save. Unsigned requests get a 401.

To register `/event` in the test server, run this from `backend/` with the variables set:

```
DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node scripts/registerDiscordCommands.mjs
```

The script replaces every guild command for the application with `/event`. Guild commands show up right away. Global commands can take up to an hour.

## Why the route mounts before the JSON parser

In `backend/app.js`, the Discord router is mounted before `express.json`. That order matters. Discord signs the exact bytes it sends, and `express.json` would parse and re-serialize the body, which breaks the signature. The router reads the raw body itself.

The mount also sits outside the session and CSRF stack, because Discord doesn't carry a session cookie. It's rate-limited to 60 requests per minute. If you move it below `express.json`, every real interaction starts failing verification.

## Code map

- `backend/discordApprovals.js`: submission, approve, deny, and publish
- `backend/discordSubmissionRules.js`: input rules and time conversion
- `backend/discordSubmissions.js`: the pending-request schema
- `backend/rsoRegistry.js`: officer lookup
- `backend/discordClient.js`: REST calls as the bot
- `backend/discordCommandDefinition.js`: the `/event` command shape
- `backend/routes/api/v1/controllers/discord.js`: signature check and routing
- `backend/scripts/registerDiscordCommands.mjs`: command registration

Run the tests from `backend/` with `npm test`. `test/discord-flow.test.js` covers the flow with in-memory fakes.

## Still open

- Create the five Jenkins credentials, then verify the dev deploy passes them through.
- Run the full path on the test server: `/event` as an officer, approve as a moderator, approve again, and try as a non-officer and a non-moderator.
- Test the approve claim against a real MongoDB replica set under concurrent clicks. The fakes can't show that.
