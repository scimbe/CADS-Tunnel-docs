---
title: Manage your tunnel from the portal
description: View, and revoke, your tunnel — and what's still a planned feature.
order: 8
---

# Manage your tunnel from the portal

Everything below is the portal's own dashboard, not `ct-agent` — no terminal needed for any of this.

## View your tunnels

[bunsenbrenner.org/portal/tunnels](https://bunsenbrenner.org/portal/tunnels) (after signing in) lists
every tunnel you own, plus its hostname and current certificate tier (🔴/🟡/🟢 — see
[Certificate tiers explained]({{ '/explanation/certificate-tiers/' | relative_url }})). Standard tier
gives you exactly one, auto-provisioned the moment your account exists — see
[Your first tunnel]({{ '/tutorials/first-tunnel/' | relative_url }}).

Each row also shows live status pulled directly from the edge, not just what the control plane's own
database last recorded: a 🟢 **Connected** / ⚪ **Not connected** badge, and — once at least one byte has
actually moved — a `↓ received · ↑ sent` line (human-scaled, e.g. `3.4 KB`/`1.2 GB`, never more than one
decimal past the first unit boundary). Both are best-effort: if the edge is unreachable, or this particular
self-hosted deployment hasn't configured its portal-to-edge admin connection at all, the badge and byte
line are simply absent from that row rather than showing something misleading like "offline." A tunnel
that's connected but has never actually relayed anything (e.g. right after `ct-agent onboard`, before any
client has reached it) shows the Connected badge with no byte line yet — that's expected, not a bug.

**Install** on a tunnel's row takes you back to the same join-token page from onboarding — useful if you
need to re-run setup on a second machine or after a full local reset (see
[Install ct-agent]({{ '/how-to/install-ct-agent/' | relative_url }})'s "starting over" section).

## Connection history, uptime & a public status badge

Each tunnel row also has a **Connection history** disclosure — expand it for uptime over the last
24 hours / 7 days / 30 days and a table of recent sessions (start time UTC, duration or "open",
transport, bytes in/out, disconnect reason), newest first. Like the Connected badge above, this is
fed live from the edge and simply says "no sessions recorded yet" rather than showing anything
misleading when there's no history to show.

For more room, each row also links to a dedicated **Uptime & usage** page
(`/portal/tunnels/:id/uptime`) with the same three uptime windows, the longest outage in the last
30 days, 30-day session/byte totals, and the full session table (up to 200 rows — a tunnel that's
flapped more than that in 30 days under-counts its oldest sessions, noted on the page itself).

That page also has an opt-in **public status badge**: enabling it mints a shields-style SVG at
`https://bunsenbrenner.org/badge/<64-hex>.svg` — green at ≥99% 7-day uptime, yellow at ≥95%, red
below, grey "n/a" with no history yet — along with the URL and a ready-to-paste Markdown snippet.
The badge is deliberately anonymous: no hostname, tunnel id, or routing token appears in it or its
URL, and disabling it 404s the old link from the very next request. Owner-scoped like every other
control on this page.

## See usage across every tunnel you own

[bunsenbrenner.org/portal/usage](https://bunsenbrenner.org/portal/usage) ("Usage" in the portal
nav) is the account-wide view of the same 30-day figures — uptime, sessions, and bytes in/out for
every tunnel you own, plus a totals row. A tunnel whose edge doesn't answer shows "n/a" for that
row rather than blocking the rest of the page. `/portal/usage.csv` exports the same table as a
downloadable CSV (one row per tunnel, raw numbers) if you want it in a spreadsheet.

## Dead-man alert — a webhook when a tunnel goes down

Each tunnel's card has an alert block: a webhook URL and a threshold in minutes (1 minute to 7
days). A background check every minute asks the edge whether the tunnel is reachable; once it's
been down for longer than your threshold, the portal `POST`s a signed `tunnel.down` to your
webhook, then a `tunnel.up` the moment it recovers. There's no new notification system behind
this — the receiver is whatever you already run (a pager bridge, a chat webhook, your own script).

Saving the form shows your webhook secret **once** — copy it then, it's never shown again. Every
delivery carries `X-CT-Timestamp` (unix seconds) and `X-CT-Signature: sha256=<hex>`, an
HMAC-SHA256 over the string `"<X-CT-Timestamp>.<raw request body>"` keyed with that secret — the
same `"<timestamp>.<body>"` convention this platform's own payment webhooks use inbound, so a
Stripe-style verifier works unmodified. The JSON body:

```json
{
  "event": "tunnel.down",
  "tunnel_id": "<portal tunnel id>",
  "name": "<tunnel display name>",
  "since": 1735689600,
  "threshold_secs": 300,
  "sent_at": 1735689600
}
```

`event` is `"tunnel.down"`, `"tunnel.up"`, or `"tunnel.test"` (from the **Test** button, which
sends one immediately). `since` is when the current state began — the outage start for `down`,
the recovery moment for `up`. A failed delivery retries twice more in the same check, 2s then 8s
apart, and every attempt shows in the card's last-5-deliveries log regardless of outcome.
Deliveries are capped at 20 per account per hour — past that, a check is logged as "skipped" and
the tunnel's state doesn't advance, so you won't miss the eventual `tunnel.down`/`tunnel.up` once
the budget frees up. **Remove** deletes the alert; webhook URLs must be `https://` (plain `http://`
only to `127.0.0.1`/`localhost`, for testing a local receiver).

## Fleet view — every tunnel in one table

[bunsenbrenner.org/portal/fleet](https://bunsenbrenner.org/portal/fleet) ("Fleet" in the portal
nav) is one row per tunnel you own: online state, transport + 7-day uptime, Agent bridge mode and
sidecar presence, cached agent version, and readiness chips (things like "no registry", "no
login", "no docker", or "all ok") from the last successful bridge probe. Nothing on this page
dials your agent when it loads — the online/uptime/presence columns are the same fail-open edge
lookups the tunnels page and the Agent bridges page already make, and the version/readiness
columns come from whatever the last `bridge/status`/`bridge/config` call happened to cache; a
never-probed agent shows "unknown"/"not probed" rather than "offline". A **Probe now** button
appears for any tunnel with a bridge grant — it's the same `bridge/config` call the
[Agent bridges]({{ '/how-to/manage-your-tunnel/' | relative_url }}#agent-bridge--the-registry-toggle-for-real-remote-control)
page's own refresh button makes, just from here. A summary line at the top counts tunnels /
online / bridges served / readiness gaps, and if more than one cached agent version shows up
across your fleet, a "Version drift" hint calls it out (the edge doesn't currently learn an
agent's version from its own registration — only from a probe — so this is necessarily
best-effort, not a live inventory).

## Rename a tunnel

Each row has a **Rename** form — it only changes the display label shown here and in the portal's other
tunnel pickers (e.g. the topology editor's tunnel dropdown), not the hostname or routing token, so
renaming never breaks anything already pointing at your tunnel. Owner-scoped like every other action on
this page; a blank name is rejected.

## If your certificate offer lapses: automatic requeue, or stay on the shared certificate

When a tunnel is queued for its own Grün certificate and the 48-hour claim window closes before
`ct-agent certificate` completes the order (see the
[admission queue]({{ '/explanation/certificate-tiers/' | relative_url }}#the-gelbgrün-admission-queue)),
it no longer dead-ends — the tunnel is **automatically requeued** at the back of the line with a fresh
position, no click needed (<a href="https://github.com/scimbe/CADS-Tunnel/issues/758">#758</a>, live).
Get `ct-agent certificate` running again (or restart it if it's still running) before the next offer
arrives, since requeuing doesn't retry the ACME order for you.

Every non-offered Gelb row also has a checkbox: **"Bleib dauerhaft auf dem gemeinsamen Zertifikat (kein
eigenes Grün)"**. Check it to opt out of the Grün queue entirely — your tunnel stays on the shared Gelb
certificate indefinitely and is never reconsidered for its own Grün slot until you uncheck it again
(owner-scoped like every other action on this page).

<div class="callout">
An older manual <strong>Erneut anfragen</strong> ("request again") button still appears for any tunnel
that was already stuck in the pre-#758 <code>lapsed</code> state before this shipped — a one-time legacy
case, not something a newly-lapsed claim reaches anymore. It's a no-op on any tunnel that isn't actually
in that state.
</div>

## Revoke a tunnel

The **Revoke** button on your tunnel's row is a full, server-side teardown — not just a local reset. One
click does all of the following:

- removes the tunnel from the registry (so its routing token stops resolving),
- tells the edge to actively drop the live connection and refuse any re-registration attempt on that
  token,
- deletes the hostname's DNS `A` record, so nothing is left pointing at an address that no longer serves
  anything.

There's no confirmation dialog and no undo — a revoked tunnel needs a brand-new Install/onboard cycle to
come back, with a new token. This is also the *only* way to fully retire a tunnel: killing your local
`ct-agent` process, or clearing `CT_AGENT_STATE_DIR`, only ever touches your side (see
[Install ct-agent]({{ '/how-to/install-ct-agent/' | relative_url }})) — the tunnel keeps existing on the
platform, ready to be reconnected to, until you Revoke it here.

## Agent bridge — the registry toggle for real remote control

Each row also has an **Agent bridge** dropdown (`off` / `ephemeral` / `permanent`). Turning it on lists
this tunnel on the portal's [Agent bridges](https://bunsenbrenner.org/portal/agent-bridges) page —
`permanent` always shows it there (even offline), `ephemeral` only while the tunnel is actually
connected. Turning it on also force-enables **Require login** in the same action, atomically — a
bridge-listed tunnel is never reachable without an authenticated session.

<div class="callout warn">
<strong>Updated</strong> — this used to be registry-only ("lists you, doesn't do anything more"); the
dialer behind it is now real and live. This toggle still only *lists* the tunnel — it doesn't by
itself grant the portal access to your agent's channel. To actually make it callable: mint a grant
from your own agent admitting the platform's bridge identity (`ct-agent channel grant`,
`CT_GRANT_DIRECTION=initiate`) and paste the channel id + grant hex into the
<a href="/portal/agent-bridges">Agent bridges</a> page itself, which shows the exact pubkey to grant
and the paste form. Once granted, the portal can call the read-only tools
(<code>bridge/status</code>, <code>bridge/config</code>, <code>bridge/channel-members</code>,
<code>bridge/allowlist-list</code>, <code>bridge/manifest-list</code>) via one-click refresh buttons,
and now also the mutating ones through real per-action controls: an email field for allow-list
add/remove, and manifest-location/project-name fields for manifest install (an "Advanced" fallback
with the original generic tool-call form is still there for anything not covered by a dedicated
control). Manifest install can be disabled independently — see the callout below.
</div>

<div class="callout warn">
<strong>Easy to miss:</strong> granting the bridge into your channel is necessary but not sufficient.
Your own <code>channel --serve</code> process only registers the <code>bridge/*</code> tools at all
when it's started with <code>CT_CHANNEL_BRIDGE_PEER</code> set to the bridge's own <strong>Noise</strong>
pubkey — a separate value from the holder pubkey used to grant. The <a href="/portal/agent-bridges">Agent
bridges</a> page now publishes both ("This deployment's bridge holder pubkey" and "...Noise pubkey",
each with its own copy button) — see [Environment variables (channels, cards, offers)]({{ '/reference/channel-environment-variables/' | relative_url }})
for what the variable does. Without it, every bridge tool call fails with "caller is not this agent's
configured bridge peer" even though the grant itself is valid.
</div>

<div class="callout warn">
<strong>Opting out of just the manifest-install capability (ct-agent v0.7.23+):</strong> you don't have
to accept manifest-install just because you've otherwise granted the bridge — set
<code>CT_CHANNEL_BRIDGE_DISABLE_MANIFEST_INSTALL</code> on your own <code>channel --serve</code>
process and it refuses <code>bridge/manifest-install</code> unconditionally, for every caller
including the bridge itself, while leaving the rest of the tranche (status, config, channel
members, allow-list, manifest listing) working normally.
</div>

<div class="callout">
<strong>Updated (CADS-Tunnel#763):</strong> a granted bridge card now checks whether your
<code>channel --serve</code> sidecar is actually reachable at the edge before offering a call — it
reads <strong>Sidecar: serving (seen N s ago)</strong> when it recently saw an admission, or
<strong>Sidecar: not connected</strong> when it hasn't, and disables the call buttons and manifest
form in the latter case (an "Advanced: call anyway" option still lets you force it). This replaces
what used to be an always-on 45-second blocking dial that, if your sidecar wasn't actually running,
just ended in a raw connection error.
</div>

<div class="callout">
<strong>Updated (CADS-Tunnel#763/ct-agent#164):</strong> results are now rendered, not raw JSON:
<code>bridge/config</code> shows each feature's Feature / State / How-to-enable, naming the exact
missing sidecar setting (registry URL, login, trust allow-list, work dir, docker, and so on);
<code>bridge/manifest-list</code> ("Registry manifests") is a table with one inline **Install**
form per entry instead of a location you'd copy by hand. A genuine error from your own agent (a
malformed manifest, a disabled capability) now shows as "the agent refused the call" with a
message and a targeted hint, instead of the older generic "malformed reply from peer". Raw JSON is
still there for every tool, just behind a disclosure instead of being the only view.
</div>

## Sharing a tunnel — visible, not usable yet

You'll see a **Share** button next to Install/Revoke — it's disabled. The portal shows it so you know the
capability exists, but as of this writing it's a **planned paid-tier feature**: Standard tier ships one
tunnel per account with single-owner access, not shared access. The API surface behind it
(`GET`/`POST /portal/tunnels/:id/grants`, `POST /portal/tunnels/:id/grants/:grantee/delete`) is already
built and tested server-side — grants are keyed by the other account's opaque OIDC subject (visible on
their own [Account page](#your-account), not their email) — but there's no tier that currently exposes a
clickable path to it. If you're testing against a self-hosted deployment without the tier gate, the
routes work exactly as the UI's disabled state implies they eventually will; on the hosted platform,
treat this as "coming soon," not "broken."

## Your account

**Account** in the top nav (`/portal/account`) shows your OIDC **Subject** (the opaque ID above), your
internal **Account ID**, and your **credit balance** — plus a link out to your identity provider's own
Account Console for password changes, session review, or deleting your account entirely (none of that is
reimplemented in CADS-Tunnel itself). Buying credits from this page starts the same admin-gated
intent/webhook flow described in [API endpoints]({{ '/reference/api-endpoints/' | relative_url }})'s
billing section — the button just fills in your own account for you.
