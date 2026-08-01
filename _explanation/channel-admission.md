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

## Admission is only half the story: you still have to wait for your partner

Passing the authorize check above doesn't connect you to anything by itself — a channel is always
between exactly two holders, and the edge has to hold your admitted connection until *the other one*
shows up too. This parking/pairing step, source-grounded in `crates/edge/src/channel_broker.rs`'s
`ChannelPairer`, is what's actually behind the "waiting to be paired" feeling of a join that doesn't
immediately connect:

- The first admitted holder of a `(channel)` to arrive is **parked**, holding its connection open.
- When the *other* holder of that same channel is admitted, the two are paired and handed off to
  relay together — a same-holder retry instead supersedes its own earlier parked wait rather than
  pairing with itself.
- A lone parked holder isn't held forever: it has a deadline (30s), after which it's evicted rather
  than wedging the slot — this is genuinely why a join can sit for a while and then fail even though
  your own admission check succeeded cleanly. It just means your channel partner hasn't shown up yet.

<div class="callout warn">
Found live, fixed same day (2026-07-31, tracked as
<a href="https://github.com/scimbe/CADS-Tunnel/issues/256">scimbe/CADS-Tunnel#256</a>): that 30s
eviction deadline only actually fired for the QUIC-native broker (`:4435`), whose own accept loop
sweeps expired waiters on every iteration. Channel members reaching admission through the
<code>:443</code> front door instead — see the next section — went through a *separate* pairer with
no equivalent sweep anywhere, so a lone parked front-door member whose partner never showed up was
held forever: its TLS stream and socket leaked for the life of the edge process. The front door now
spawns its own periodic reaper alongside the QUIC broker's per-accept one, so both paths actually
honor the 30s deadline. Pure resource-leak fix — the pairing/eviction *decision* logic shown above
was already correct on both paths; only the front door was never actually acting on it.
</div>

## Two different wires into the same broker

Everything above happens identically regardless of *how* your join physically reached the edge, and
that's deliberate — but the wire itself comes in two forms:

- **The QUIC-native broker**, on `:4435` (or whatever `CT_CHANNEL_BROKER` port you're pointed at) —
  the default path, a real QUIC bi-stream per join.
- **The `:443` front door** — the same admission (length-framed join request, membership + grant
  verification, holder-possession challenge — byte-for-byte the identical exchange) but carried over
  TLS-over-TCP instead of QUIC, for a member whose network blocks the broker's UDP/TCP ports outright
  but still allows ordinary HTTPS egress. It's the same accommodation the browser tunnel's own `:443`
  termination makes, reused for channels (#106).

Both paths call into the exact same authorize-and-pair logic described on this page — there's no
second, weaker admission story hiding behind the front door. The only structural difference is which
`ChannelPairer` instance a given join's parked wait lives in, which is precisely why the reaper gap
above could exist on one wire and not the other: they're genuinely separate pairing states, not two
views onto one.

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

<div class="callout warn">
A third, separate bug in the same neighborhood, found live and fixed 2026-08-01
(<a href="https://github.com/scimbe/ct-agent/pull/2">scimbe/ct-agent#2</a>): a persistent
<code>ct-agent channel --serve</code> process's own retry dispatch — not the edge's admission logic
above — mis-forwarded a clean <code>Refused</code> verdict as <code>Ok</code> instead of
<code>Err</code>. That got it spawned as a full session (which then immediately failed there, which
is why it logged as happening <em>after</em> admission, not during it) and, because the outer loop saw
<code>Ok</code> not <code>Err</code>, silently reset the exponential backoff #231 added — so a
holder that will genuinely never be a member could hot-loop hundreds of admission attempts an hour
against production instead of backing off. Live-verified fixed: before, continuous spawn-then-fail
cycles with zero successful sessions over 6 hours; after, hours clean with zero repeats. If your
process logs <code>ct-agent channel: serve session ended with error (#200): edge broker refused the
channel join</code> repeatedly at a flat, unchanging rate rather than backing off, this is almost
certainly it — update past this ct-agent commit.
</div>

<div class="callout warn">
A gap in the fix's first cut, found live and closed the same day: the transport-class branch (the
one the fail-static cache exists to tolerate) returned silently — a real CP-unreachable incident
looked identical to routine operation in the edge's own log. The edge now logs
<code>ct-edge: channel-authorize UNRESOLVED [reason] channel=... holder=...</code> for every
transport-class outcome — <code>[transport]</code> (connection error/timeout), <code>[status=N]</code>
(a non-2xx, non-404/401 response), <code>[unparseable-body]</code>, or
<code>[bad-operator-pubkey]</code> — mirroring the existing <code>channel-join NO [tag]</code>
convention. Pure observability; the admission decision itself is unchanged.
</div>

## Related

- [Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}) — how a join
  actually connects once it's admitted.
- [Set up an Agent-Fabric channel]({{ '/how-to/join-a-channel/' | relative_url }}) — the
  operator-granted admission path this page's `(channel, holder)` membership check gates.
