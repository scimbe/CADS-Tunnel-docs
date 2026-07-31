---
title: How the edge decides whether to admit a channel join
description: The broker never stores membership itself — every join asks the control plane, live, and that round-trip has real failure semantics worth knowing.
order: 9
---

# How the edge decides whether to admit a channel join

[Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}) covers how a
broker-mediated connection gets *established* — rendezvous, the fallback ladder, ciphertext-only
routing. This page covers what happens the instant before that: how the edge's broker decides
whether to admit a presenting `(channel, holder)` pair at all, source-grounded in
`crates/edge/src/channel_authorize.rs`.

## The broker holds no membership state of its own

Every single channel join — not just the first one, every one — makes the edge call
`POST {control-plane}/internal/channel/authorize` with the channel id and the presenting holder's
public key, over the shared edge↔CP admin token. The control plane's durable `channel_members`
table is the only source of truth; the edge never caches "who's allowed in" as its own registry.
The response is a real, resolved verdict, not a guess:

- The holder **is** a current member → the CP returns the channel's operator public key (which
  the broker uses to verify the grant the joiner presented) plus, when available, the member's
  attested Noise key — the actual mechanism that lets the broker relay a peer's public key without
  an out-of-band exchange.
- The holder **is not** a member, or the query itself fails — the join is refused. What "fails"
  meant here, and what changed about it, is the rest of this page.

## Two different kinds of "no" — and why they used to be the same

Until a fix landed on `main` (2026-07-31, tracked as
[scimbe/CADS-Tunnel#231](https://github.com/scimbe/CADS-Tunnel/issues/231)), every non-success
outcome from that CP round-trip — a clean `404` (genuinely not a member), a clean `401` (edge↔CP
admin-token mismatch), a connection timeout, or the CP simply being mid-restart — collapsed to the
exact same refusal. That's a real problem for a coordination-only architecture like this one: the
control plane restarting for a few seconds (routine during active development, and not something a
channel member should ever notice) made every presenting grant get refused **plane-wide**, for
every holder, indistinguishable from every membership having been revoked simultaneously — even
though membership rows are durable and the CP hadn't touched them.

<div class="callout warn">
Live-reproduced before the fix, not theoretical: a completely fresh <code>ct-agent channel --serve</code>
process — never run before, so it can't have "gotten stuck" — failed its very first admission
attempt with <code>edge broker refused the channel join</code> the moment the CP blipped. That
proved the refusal was happening at this authorize lookup, not anywhere in client-side state.
</div>

The fix draws a real distinction the code now enforces:

- **A clean, authoritative refusal** (CP responds `404` or `401`) still fails **closed**,
  immediately, and evicts any previously-cached resolution for that exact `(channel, holder)` — a
  revoked member cannot keep riding a stale "yes" past the moment the CP actually says no.
- **A transport-class failure** — timeout, connection error, or the CP responding with something
  that isn't really an answer at all — now fails **static**: if this holder resolved successfully
  at some point in roughly the last 30 seconds, that cached resolution is reused instead of
  refusing outright. A holder the edge has never successfully resolved still fails closed on a
  transport error exactly as before — the cache only ever lets an *already-attested* membership
  ride out a brief CP hiccup, it never invents one.

That 30-second window is a deliberate trade: long enough to bridge a routine restart, short enough
that a member revoked mid-outage can't ride the stale cache for long. It's also why the underlying
HTTP client for this specific call deliberately does **not** reuse pooled connections — a
half-dead pooled connection surviving a CP restart is exactly the ambiguous "not really resolved"
state the fix exists to eliminate; a fresh connection per authorize call fails fast and
predictably instead.

## What this means if your own channel join gets refused

If you see `edge broker refused the channel join` (or, server-side in the edge's own log,
`channel-join NO [not-member] channel=... holder=...: unknown channel or holder not a member`),
the two now-distinguished causes read very differently:

- If it's persistent across retries with no change in behavior, your grant/membership is genuinely
  not registered for that channel — check your operator registered you (`ct-agent channel
  register`, see [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }})).
- If it clears up on its own within seconds without you doing anything, it was very likely a brief
  control-plane blip your join simply retried past — exactly the case this fix now tolerates for
  anyone who was already a member moments earlier.

## Related

- [Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}) — how a join
  actually connects once it's admitted.
- [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) — the
  operator-granted admission path this page's `(channel, holder)` membership check gates.
