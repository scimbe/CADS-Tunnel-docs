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

## Rename a tunnel

Each row has a **Rename** form — it only changes the display label shown here and in the portal's other
tunnel pickers (e.g. the topology editor's tunnel dropdown), not the hostname or routing token, so
renaming never breaks anything already pointing at your tunnel. Owner-scoped like every other action on
this page; a blank name is rejected.

## If your certificate offer lapsed: Erneut anfragen

When a tunnel is queued for its own Grün certificate and the 48-hour claim window closes before
`ct-agent certificate` completes the order (see the
[admission queue]({{ '/explanation/certificate-tiers/' | relative_url }}#the-gelbgrün-admission-queue)),
its row shows a German **Erneut anfragen** ("request again") button instead of a queue position. This is
the only way back in — a lapsed claim does not automatically re-enter the queue on its own. Clicking it:

- is a no-op if your tunnel isn't actually in the `lapsed` state (confirmed against this control plane's
  own test suite — calling it early, or twice, never does anything unexpected),
- otherwise puts your hostname back at the **end** of the queue with a fresh position, not its old spot,
- is owner-scoped like every other action on this page — nobody else can reclaim your slot for you.

Once you click it, get `ct-agent certificate` running again (or restart it if it's still running) before
the next offer arrives — the button re-enters the queue, it doesn't retry the ACME order for you.

<div class="callout">
An automatic-requeue fix plus a permanent shared-certificate opt-out checkbox are merged
(<a href="https://github.com/scimbe/CADS-Tunnel/issues/758">#758</a>) but not deployed to this control
plane yet — this page describes the button you'll actually see today. Once that ships, a lapsed claim
will re-enter the queue on its own and this section will be rewritten accordingly.
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
