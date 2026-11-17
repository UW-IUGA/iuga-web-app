# Discord events: board guide

How the IUGA Discord server handles RSO officers and events, written for the board and moderators who run it. For environment variables, deployment, logs, and code, see [DISCORD.md](DISCORD.md).

Everything day to day happens in Discord with buttons. Nobody needs to edit settings, touch code, or redeploy to add an RSO or an officer.

## The two flows

| Command | Who runs it | Where the card goes | Who reviews |
|---|---|---|---|
| `/rso-verify` | Anyone who leads an RSO | `#rso-approvals` | Moderators, IUGA officers, server admins |
| `/event` | Verified RSO officers | `#events-approvals` | Moderators, IUGA officers, server admins |

An officer verifies once with `/rso-verify`, then submits events with `/event` as often as needed.

### 1. Getting verified as an RSO officer

1. The officer runs `/rso-verify`, picks their RSO from the list (or types the full name if it's new), and enters their position, such as "President." The list includes RSOs the bot already knows and the server's RSO roles, such as BINFO or DubHacks.
2. A card appears in `#rso-approvals` showing who asked, the RSO, and the position. An RSO that isn't in the list is marked **New RSO**. Names match ignoring capitals and extra spaces.
3. A reviewer clicks **Approve** or **Deny**. Nobody can review their own request.
4. **Approve:** the officer gets their RSO's officer role, such as **BINFO Officer**, and the general **RSO Officer** role, plus a direct message saying they're verified and can use `/event`. The bot creates the officer role the first time, with no permissions.
5. **Deny:** the reviewer must give a reason. The officer gets it by direct message.

### Members and officers

The server has two kinds of RSO roles, and the bot keeps them apart:

| Role | Example | Who has it | Who gives it |
|---|---|---|---|
| Membership role | BINFO | Anyone in the RSO | Members pick it, or moderators give it, as before |
| Officer role | BINFO Officer | Verified officers only | The bot, when the board approves `/rso-verify` |

A BINFO member can't post events as BINFO. Only someone holding **BINFO Officer** can. The bot never changes, gives, or removes membership roles.

Officers can't create an RSO on their own. A new RSO exists only after a reviewer approves a request that names it. An officer of a second RSO sends a second request.

### 2. Submitting an event

1. A verified officer runs `/event`. Officers of more than one RSO pick which one in the `rso` option; it only lists their own.
2. A form pops up with five required fields: event name, When (such as `12/1/2026 6:00 PM - 8:00 PM`), location, category, and description. The RSO comes from the officer's role, so they never type it.
3. If something's wrong, the officer gets the problems and a copy of what they typed to paste into a new `/event`. If it's fine, they see the card reviewers will see.
4. A card appears in `#events-approvals`. A reviewer approves it, which publishes it to the website's Events page, or denies it with an optional reason.

## What reviewers might see

| Message | What it means | What to do |
|---|---|---|
| "… can't be approved as a new RSO" | The name matches a staff role such as "Moderator," or someone made an "… Officer" role by hand. | Deny and ask for the RSO's full name, or have an admin delete the hand-made officer role and approve again. |
| "The bot isn't allowed to give roles…" | The bot lacks Manage Roles, or its role sits too low. | Fix the role order below, then approve again. |
| "Closed: the requester left the server." | The bot closed the request itself. | Nothing. |
| "This request has already been reviewed." | Someone else got there first. | Nothing. |

Members can have one open request per RSO. Members with no RSO role who run `/event` are told to use `/rso-verify`.

## Server setup

### Roles

Server Settings → Roles. Higher roles can manage lower ones, so the order matters.

| Order | Role | Setup |
|---|---|---|
| 1 | Admin | Existing. |
| 2 | Moderator | Existing. Reviews both flows. |
| 3 | IUGA Officer | Existing. Reviews both flows. |
| 4 | The bot's role | Turn on **Manage Roles** only. Never Administrator. |
| 5 | RSO Officer | The general role the bot gives on approval. Must sit **below the bot's role**. |
| 6 | RSO officer roles ("BINFO Officer", …) | Created by the bot. Never create these by hand. |
| any | RSO membership roles ("BINFO", …) | Unchanged. Anywhere in the list. |
| 7 | @everyone | |

- An "… Officer" role created by hand blocks approval of that RSO, because the bot can't tell whether it's safe to reuse.
- Roles never suggested as RSOs: Moderator, IUGA Officer, RSO Officer, bot roles, anything ending in "Officer," and roles with moderation permissions (Administrator, Kick, Ban, Manage Server, Channels, Roles, or Messages, Timeout).
- There's no "unapproved" role. A pending request lives on its card, so **RSO Officer** always means the board approved that person.
- Moderators and admins can still drag roles onto people by hand. That's useful for fixing mistakes, but `/rso-verify` is the normal path.

### Channels

Both approval channels are private. Create a channel, turn on **Private Channel**, then set:

| Who | `#rso-approvals` | `#events-approvals` |
|---|---|---|
| @everyone | No View Channel | No View Channel |
| Moderator | View Channel, Read Message History | View Channel, Read Message History |
| IUGA Officer | View Channel, Read Message History | View Channel, Read Message History |
| The bot's role | View Channel, Send Messages, Embed Links | View Channel, Send Messages, Embed Links |
| RSO Officer, RSO officer roles, membership roles | No access | No access |
| Admins | See everything automatically | See everything automatically |

Without Send Messages and Embed Links, the bot can't post cards and the requester is told to try again later.

### Check who can see what

Server Settings → Roles → pick a role → **⋯** → **View Server As Role**.

| View as | `#rso-approvals` | `#events-approvals` |
|---|---|---|
| @everyone | Hidden | Hidden |
| RSO Officer | Hidden | Hidden |
| An RSO officer or membership role | Hidden | Hidden |
| Moderator | Visible | Visible |
| IUGA Officer | Visible | Visible |

### Live test

Use one plain member account and one moderator account.

1. As the member, run `/rso-verify` with a new RSO name. A **New RSO** card appears in `#rso-approvals`.
2. Click **Approve** from an account without a reviewer role. It's refused privately.
3. Approve as the moderator. The member gets "<RSO> Officer," RSO Officer, and a "you're verified" message, and `/event` works for them.
4. Request an existing membership role's RSO, such as BINFO. It's suggested as you type, isn't marked New RSO, and approval creates **BINFO Officer** without touching the BINFO role.
5. Send another request and deny it with a reason. The member gets the reason by direct message.
6. Request an RSO named "Moderator" and approve it. It's refused with the look-alike message.

## One-time technical steps

These need someone with Jenkins or developer access. Details are in [DISCORD.md](DISCORD.md).

1. Copy the `#rso-approvals` channel ID (User Settings → Advanced → Developer Mode, then right-click the channel → Copy Channel ID) and save it in Jenkins as the `DISCORD_RSO_APPROVAL_CHANNEL_ID` Secret text credential.
2. After a deploy, register the commands so `/rso-verify` and `/event` appear.

## Where this is heading

These Discord issues build on the flows above, in order. Update this guide when one lands.

| Issue | What changes for the board |
|---|---|
| #366 | Approved events publish to the website exactly once, with clear failure handling. |
| #367 | Recorded demos of the approve, deny, unauthorized, and failed-publish cases. |
| #368 | Moderators can take a published event off the website. |
| #372 | Events show their RSO's name and logo. |
| #370 | A checked table of what each role can see and do in each channel. |
| #371 | Editing an approved event (after launch). |
