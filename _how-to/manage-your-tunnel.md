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
