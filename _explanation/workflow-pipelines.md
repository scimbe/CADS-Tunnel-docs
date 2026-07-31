---
title: Workflow pipelines & the auction model
description: How several agents compose into one published service — and what's actually live today.
order: 4
---

# Workflow pipelines & the auction model

<figure>
<img src="{{ '/assets/img/usecase-pipeline.png' | relative_url }}" alt="The landing page's Workflow pipelines section, showing three devices each publishing an offer into an auction that produces one composed service.">
<figcaption>The live diagram on the landing page.</figcaption>
</figure>

A workflow pipeline is a spec naming a set of roles (e.g. `physics`, `art`, `safety`) that, together,
deliver one service. No single device has to serve every role — this page covers the actual mechanism
that lets several independent agents each cover one role, grounded in `ct_common::pipeline`
(`PipelineSpec::convene`/`convene_with_policy`), not just the concept.

## The auction, precisely

Each agent that can serve a role publishes a signed **capacity offer** for it (a `min_price` and units
available). `convene`/`convene_with_policy` clears the market: for every role in the spec, it picks a
winner from that role's currently-valid offers, and — **cross-role exclusive** (#172) — no single
provider wins more than one role in the same convene, so N roles genuinely need N distinct providers.

Three selection policies decide *which* qualifying offer wins a role (all offers considered are already
equally valid — the policy never decides whether a role is fillable, only which winner among those that
already are):

| Policy | Rule | Use |
|---|---|---|
| `LowestFloor` (default) | Cheapest `min_price` wins, ties broken by holder key. Stateless. | Priority failover — a preferred provider publishes a lower floor than its standby. |
| `RoundRobin` | Rotates to the next qualifying provider after whoever last won, deterministic wrap-around order. Stateful. | Even load spreading across N interchangeable providers. |
| `LeastCalls` | Whoever has served the fewest jobs so far wins (ties: floor, then holder key). Stateful. | Self-balancing — a freshly added replica starts at zero and is preferred until it catches up, no reconfiguration needed. |

## Failover is designed in — but the caller has to actually re-convene

This is worth being precise about, because it's easy to read this system as automatically self-healing
when what's actually true is narrower: convening is **stateless per call** — it works from whichever
offers are currently valid *at that moment*. If the winning provider's offer goes stale (its short-TTL
heartbeat stops), the **next** convene call simply re-picks from whoever is still live. That's genuine
failover — but only if something actually calls `convene` again. The auction engine itself doesn't run on
a timer or watch for staleness; a caller (a pipeline's own bridge process, typically) is responsible for
re-convening on whatever cadence it wants failover to react on.

## What's actually live today

This split between "the flagship demos" and "the real mechanism" no longer fully holds — updated after
checking both, live. **The two original pipeline demos still don't call it**: flappy-demo's
`crew_bridge.rs::demo_auction()` and cookbook-demo's `cookbook_bridge.rs::demo_auction()` are still
hardcoded, fixed fixtures (tracked as an open proposal,
[CADS-Tunnel#180](https://github.com/scimbe/CADS-Tunnel/issues/180), to wire flappy-demo's to real signed
offers — cookbook-demo isn't mentioned in that issue yet, so treat it as the same known gap, not a
separately-tracked one).

But a third, dedicated demo now does call it for real:
[auction-demo.bunsenbrenner.org](https://auction-demo.bunsenbrenner.org/) runs six genuinely separate
provider processes (confirmed live in its own logs: `submitted a real signed offer to
http://auction-demo-bridge:8789`, one process per provider, not one process faking six), each publishing
its own real signed `CapacityOffer` to a bridge that calls `PipelineSpec::auction_view` — which itself
runs `convene_with_policy` internally, then annotates every qualifying bid with the real winner — per
round, live, on demand. Switching the demo's policy selector between `LowestFloor`/`RoundRobin`/
`LeastCalls` visibly changes which of the six providers wins, because it's the real policy logic
deciding, not a scripted outcome.

None of that makes the older claim about flappy/cookbook wrong — they still don't call it. It does mean
the mechanism is no longer just "ready but unadopted": it's live, adopted, and dialable by anyone who
wants to see (or build) a real pipeline auction rather than take this page's word for it.

## See also

- [One service, several devices]({{ '/tutorials/first-tunnel/' | relative_url }}) touches the basic
  concept from a new-user angle.
- [Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}) — how the
  role-serving agents actually connect to each other once convened.
- [Serve a callable service over a channel]({{ '/how-to/serve-a-channel-service/' | relative_url }}) —
  the real mechanism a role-serving agent uses to answer a request, once convened.
- [Publish your own pipeline]({{ '/how-to/publish-a-pipeline/' | relative_url }}) — the practical
  companion to this page: the exact `PipelineSpec` shape and `POST /me/pipelines` call that gets a
  pipeline like the ones described above actually published and discoverable.
