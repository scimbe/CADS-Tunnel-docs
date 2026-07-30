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

Verified, not assumed: **nothing in production currently calls `convene`/`convene_with_policy` at all.**
Grepping the whole workspace for real callers outside `pipeline.rs`'s own tests turns up none. Both
flagship demos' own "auction" displays are hardcoded, fixed fixtures instead of the real clearing
mechanism — `crew_bridge.rs::demo_auction()` for flappy-demo, `cookbook_bridge.rs::demo_auction()` for
cookbook-demo, same pattern in both (tracked as an open proposal,
[CADS-Tunnel#180](https://github.com/scimbe/CADS-Tunnel/issues/180), to wire flappy-demo's to real signed
offers — cookbook-demo isn't mentioned in that issue yet, so treat it as the same known gap, not a
separately-tracked one).

None of that makes the mechanism fake — the auction, cross-role exclusivity, and all three selection
policies are real, tested (`ct_common::pipeline`'s own test suite), and directly usable by anyone
building on the platform. It just means: if you're evaluating whether *today's* example pipelines
demonstrate live competitive bidding, they don't yet — the primitive is ready, the flagship demo hasn't
adopted it. Build your own pipeline's bridge to call `convene_with_policy` yourself and the real market
is available now.

## See also

- [One service, several devices]({{ '/tutorials/first-tunnel/' | relative_url }}) touches the basic
  concept from a new-user angle.
- [Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}) — how the
  role-serving agents actually connect to each other once convened.
- [Serve a callable service over a channel]({{ '/how-to/serve-a-channel-service/' | relative_url }}) —
  the real mechanism a role-serving agent uses to answer a request, once convened.
