# Discord bot: RSO officer verification and event approval

The bot does two jobs, both run from inside Discord with no developer step:

1. **RSO officer verification.** An RSO officer runs `/rso-verify`, and the IUGA board approves or denies it in a private `#rso-approvals` channel. Approval gives the officer their RSO's officer role, such as "BINFO Officer."
2. **Event approval.** A verified officer submits an event with `/event`, and moderators approve it in `#events-approvals`.

## Setting up the server (one time, no code)

Do these once in Discord. After that, the board runs everything with buttons.

1. **Create `#rso-approvals`.** In the channel's settings, under Permissions, turn off View Channel for `@everyone` and turn it on for the moderator role and the IUGA officer role. RSO officers and members must not see it.
2. **Let the bot give roles.** In Server Settings > Roles, give the bot's role the **Manage Roles** permission. Nothing else is needed for verification.
3. **Put the bot's role in the right spot.** In Server Settings > Roles, drag the bot's role **below** the moderator and admin roles and **above** every RSO role. Discord only lets a bot give roles that sit below its own, so this keeps the bot away from moderator and admin roles.
4. **Copy the channel ID** of `#rso-approvals` (turn on Developer Mode in User Settings > Advanced, then right-click the channel > Copy Channel ID) and give it to whoever manages the Jenkins credentials as `DISCORD_RSO_APPROVAL_CHANNEL_ID`.
5. **Register the commands** (see [Interactions Endpoint URL](#interactions-endpoint-url)) so `/rso-verify` shows up.

## How RSO officer verification moves

1. An officer runs `/rso-verify`, picks their RSO from the list (or types the full name if it's new), and enters their position. Suggestions combine RSOs in the database with the server's RSO membership roles; staff, bot, and "… Officer" roles are left out, and server roles are read at most once a minute.
2. A card appears in `#rso-approvals` with the requester, the RSO, and the position. An RSO the bot hasn't seen yet is marked **New RSO**. RSO names match ignoring capitals and extra spaces, so "HCI Club" and "hci club" are the same RSO.
3. A moderator, IUGA officer, or server admin clicks **Approve** or **Deny**. Nobody can review their own request, and anyone else who clicks gets a private refusal.
4. **Approve:** the bot gives the officer "<RSO> Officer" and the general RSO officer role. It creates "<RSO> Officer" the first time, with **no permissions**. Membership roles such as "BINFO" are never changed or handed out, so a member of an RSO can't post as it. The card shows who approved, and the officer gets a DM saying they can now use `/event`.
5. **Deny:** a reason is required. The officer gets it by DM, and the card shows who denied it.

What the board might see:

- **"… can't be approved as a new RSO"**: the name matches a staff role such as "Moderator," or an "… Officer" role was made by hand. Deny it, or have an admin delete the hand-made role and approve again.
- **"The bot isn't allowed to give roles…"**: redo setup steps 2 and 3, then click Approve again.
- **"Closed: the requester left the server."**: the bot closed the request on its own. Nothing to do.
- **"already been reviewed"**: someone else got there first.

Each member can have one open request per RSO. To take someone's officer status away, remove their RSO role in Discord; the bot reads roles every time, so nothing else needs changing.

The RSO list and each RSO's officer role live in the `DiscordRsos` collection, and requests live in `DiscordRsoRequests`. `backend/rsoDirectory.js` is the only code that reads or writes RSOs or gives RSO roles.

## Event approval

Verified RSO officers and IUGA officers can submit an event from Discord with `/event`. The request lands in the `#events-approvals` channel with Approve and Deny buttons. When a moderator approves it, the event is published to the same `Events` collection the website already reads from.

The website database is still the source of truth. A social post is not an event listing, and nothing gets published from Discord text alone.

## How a submission moves

1. An officer runs `/event`. The bot checks the RSO before anything opens: it reads the officer's RSOs from their "<RSO> Officer" roles. Members with the IUGA officer role (`DISCORD_IUGA_OFFICER_ROLE_ID`) also represent IUGA, with no `/rso-verify` needed, and their events list IUGA as the organizer. A member with neither is told to use `/rso-verify`. An officer of one RSO goes straight to the form. An officer of several picks one in the optional `rso` option, which only suggests their own RSOs. Without a pick, they're asked to choose and nothing opens. A picked RSO they don't hold is refused.
2. A pop-up form asks for five things, all required: event name, When, location, categories (a dropdown where they pick one or more of Academic, Social, Career), and description. When takes the date and time range the way people type it: `Dec 1 6-8pm`, `12/1 6:30-8pm`, `Fri 6-8pm`, `tomorrow 7-9pm`, `12/1 11-1pm`, or 24-hour times. A date without a year means its next occurrence. The bot refuses rather than guesses when the date, the end time, or am/pm is missing, and says which. Events are same-day. Each `/event` starts a draft that holds the answers; drafts delete themselves an hour after the last change.
3. On submit, the bot checks the RSO again, because the form can be faked. Then the input goes through the same rules every time. Names and locations are capped at 120 characters and descriptions at 1000. When must start in the future, and the end must come after the start. Times are read as Pacific time and stored in UTC. Mentions in free text are stripped. If anything fails, the officer gets the problems and a **Fix it** button that reopens the form with their answers filled in and each problem shown under its field. If everything reads, they get a private preview of the card reviewers will see, showing the date the bot understood, with **Send for review** and **Edit**. Nothing reaches `#events-approvals` until they click Send, which checks the RSO and the rules once more.

Discord submissions no longer take an RSVP link: the form holds five fields at most, and RSVP was the one left out. Requests submitted before this change keep their link when approved.
4. If the input passes, the request is saved as `pending` in `DiscordEventSubmissions`, and an approval card is posted to `DISCORD_APPROVAL_CHANNEL_ID`. If that post fails, the pending row is deleted and the officer is asked to try again.
5. The officer gets a private confirmation. Nobody else sees it.

Who can see the cards is set in Discord's channel permissions, not in code. Anyone who can view `#events-approvals` sees every card, including the RSO, the event details, and the submitter's display name. The bot only checks who can click. Only members with the moderator role, the IUGA officer role, or Discord's Administrator permission can approve or deny. Anyone else who clicks gets a private "Only moderators or IUGA officers can approve events" reply.

To keep the cards to moderators, limit the channel's View Channel permission to the moderator and IUGA officer roles in Discord's channel settings. The RSO officer role (`DISCORD_OFFICER_ROLE_ID`), the "… Officer" roles, and membership roles must not have View Channel on this channel, because RSO officers submit with `/event` and should never see the cards. Check this before testing.

## How a review moves

- **Who can review.** Anyone with `DISCORD_MOD_ROLE_ID` or `DISCORD_IUGA_OFFICER_ROLE_ID`, or anyone with the Discord Administrator permission, can use the buttons. The submitter can't approve or deny their own event.
- **Approve.** The approval checks that the request is still pending before it does anything. Then it marks the request approved, creates the `Events` row, and updates the card to show who approved it. The buttons come off the card.
- **A second approve.** Clicking again gets "already reviewed." No second event is created. Two clicks at the same moment can't publish twice, because only one update can move the row out of `pending`.
- **Publish fails.** If the `Events` insert fails, the request goes back to `pending`, and the moderator is asked to try again.
- **Deny.** The button opens a short form with an optional reason. Submitting it marks the request denied, updates the card, and sends the officer a DM. If the DM fails, the denial still stands.

## What gets published

| Field | Value |
|---|---|
| `eName` | Event name |
| `eOrganizers` | The RSO's name, from the officer's RSO role |
| `eStartDate`, `eEndDate` | Pacific wall-clock time, stored as UTC |
| `eLocation`, `eDescription` | From the form |
| `eLabels` | The picked categories, in the order Academic, Social, Career. Requests submitted before multi-pick publish their single category. |
| `eAltLink` | `{ title: "RSVP", url }`, only for requests submitted with an RSVP link before the form dropped it |
| `eThumbnailPath` | Not set. Discord attachment URLs expire, and v1 has no poster upload. |
| `eHost` | Not set. It's a snapshot of a website user, and a Discord officer isn't one. |

Every `Events` row is public the moment it's inserted, which is why pending requests live in their own collection until a moderator approves them.

## Environment variables

| Variable | What it does |
|---|---|
| `DISCORD_APP_ID` | The application ID, used to register the slash commands. |
| `DISCORD_GUILD_ID` | The IUGA server ID, where the slash commands are registered. |
| `DISCORD_PUBLIC_KEY` | Verifies that requests really come from Discord. The interactions route is not mounted when this is unset. |
| `DISCORD_BOT_TOKEN` | Lets the bot post cards and send DMs. Never log it. |
| `DISCORD_OFFICER_ROLE_ID` | General RSO officer role the bot gives with every RSO role, used for channel visibility. Keep it out of the approval channels' permissions. |
| `DISCORD_MOD_ROLE_ID` | Role that may approve or deny. |
| `DISCORD_IUGA_OFFICER_ROLE_ID` | IUGA board role that may also approve or deny. |
| `DISCORD_APPROVAL_CHANNEL_ID` | Channel where event approval cards are posted. |
| `DISCORD_RSO_APPROVAL_CHANNEL_ID` | Channel where RSO officer verification cards are posted (`#rso-approvals`). |

These are set once. Day-to-day changes (new RSOs, new officers) happen in Discord and never need a redeploy. The old `DISCORD_RSO_OFFICERS` list was removed; officers on it need to run `/rso-verify` once.

## Secrets in Jenkins

Create each of these as a Secret text credential:

- `DISCORD_BOT_TOKEN`
- `DISCORD_APP_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_OFFICER_ROLE_ID`
- `DISCORD_MOD_ROLE_ID`
- `DISCORD_IUGA_OFFICER_ROLE_ID`
- `DISCORD_APPROVAL_CHANNEL_ID`
- `DISCORD_RSO_APPROVAL_CHANNEL_ID`

`DISCORD_PUBLIC_KEY` is a Secret text credential too. `dev.jenkinsfile` and `prod.jenkinsfile` bind all of them in the Deploy stage, and `ci/deploy.groovy` passes them to the container with `docker run -e`. The image itself doesn't contain any of them. If a credential is missing in Jenkins, the Deploy stage fails before the container starts.

## Interactions Endpoint URL

Discord needs to know where to send interactions. In the Developer Portal, open the application, go to General Information, and set the Interactions Endpoint URL to:

```
https://iuga.info/api/v1/discord/interactions
```

Discord sends every interaction to this one URL, so only the site it names handles `/event` and `/rso-verify`. To test bot changes on dev, point it at `https://dev.iuga.info/api/v1/discord/interactions` and switch it back afterwards.

Save this only after the route is deployed and `DISCORD_PUBLIC_KEY` is set on that container. When you save, Discord sends a signed PING to the URL, and the route has to answer it or Discord rejects the save. Unsigned requests get a 401.

## Slash command registration

Discord keeps its own copy of each slash command's name, description, and options, and deploying the bot doesn't change that copy. So the server registers `/event` and `/rso-verify` itself every time it starts, replacing whatever the IUGA server showed before. Changes to `backend/discordCommandDefinition.js` show up right after the deploy, with no manual step.

Registration runs in the background after the server starts listening, so a Discord problem never delays startup or fails the deploy. Only the container that goes live registers: the deploy's trial container doesn't get the IDs, so a build that fails its health check never changes Discord, and a rollback re-registers the last good build's commands. Check the container log for `Discord commands registered: /event, /rso-verify`. If `DISCORD_APP_ID` or `DISCORD_GUILD_ID` is missing, the log says so and the commands Discord already has stay as they were.

To register by hand, for example from a local checkout, run this from `backend/`:

```
DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node scripts/registerDiscordCommands.mjs
```

## Why the route mounts before the JSON parser

In `backend/app.js`, the Discord router is mounted before `express.json`. That order matters. Discord signs the exact bytes it sends, and `express.json` would parse and re-serialize the body, which breaks the signature. The router reads the raw body itself.

The mount also sits outside the session and CSRF stack, because Discord doesn't carry a session cookie. It's rate-limited to 60 requests per minute. If you move it below `express.json`, every real interaction starts failing verification.

## When something fails

Officers and moderators only ever see a short, generic reply, such as "The approval post failed, so your event was not submitted." The details go to the server log, not to Discord.

Read them on the VM, from `iuga-web-prod` for production or `iuga-web-dev` for dev:

```sh
docker logs iuga-web-prod --tail 200 | grep -E "Approval card post failed|Event publish failed|Denial DM failed|RSO request card post failed|RSO request DM failed|Duplicate RSO role cleanup failed|Discord interaction failed"
```

A failed Discord call logs the route, the HTTP status, Discord's error code and message, and a likely cause when the code is a common one. Example:

```text
Approval card post failed: Discord POST /channels/<id>/messages failed with status 403, code 50001 "Missing Access". Likely cause: the bot is not in the server or cannot view this channel
```

When Discord rejects a card's content, the log lists the invalid fields by path and error code (for example `embeds.0.title BASE_TYPE_MAX_LENGTH`), without the submitted values. Unexpected errors log the full stack trace.

## Code map

- `backend/discordDispatcher.js`: sends each interaction to the flow that owns it
- `backend/discordRsoVerification.js`: `/rso-verify` request, approve, and deny
- `backend/rsoDirectory.js`: RSOs, their roles, and who represents each one
- `backend/discordRsos.js`, `backend/discordRsoRequests.js`: RSO and verification request schemas
- `backend/discordApprovals.js`: event submission, approve, deny, and publish
- `backend/discordReviewers.js`: who may approve or deny
- `backend/discordInteractions.js`: shared Discord protocol values and reply shapes
- `backend/discordSubmissionRules.js`: input rules and time conversion
- `backend/discordSubmissions.js`: the pending event schema
- `backend/discordClient.js`: REST calls as the bot
- `backend/discordCommandDefinition.js`: the `/event` and `/rso-verify` command shapes
- `backend/routes/api/v1/controllers/discord.js`: signature check and routing
- `backend/scripts/registerDiscordCommands.mjs`: command registration

Run the tests from `backend/` with `npm test`. `test/discord-approvals.test.js`, `test/discord-rso-verification.test.js`, and `test/rso-directory.test.js` cover the flows with in-memory fakes.
