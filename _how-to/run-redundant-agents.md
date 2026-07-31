---
title: Run redundant agents for high availability
description: Two or more agents, one identity — the tunnel survives losing any one of them.
order: 7
---

# Run redundant agents for high availability

A real, tested capability (issue #8) that wasn't documented anywhere on this site: run **two or more
`ct-agent` processes for one tunnel**, sharing a single identity, so the tunnel survives one agent (or
its host) dying. The edge tracks every agent registered for a routing token and routes to the most
recent, failing over to a survivor when one drops.

## The one rule: share the identity, not just the origin

Redundant agents must present the **same** routing token and the **same** origin key — that's what makes
the edge treat them as interchangeable servers for one tunnel rather than two separate tunnels. Point
every instance at the same `CT_AGENT_ORIGIN_KEY` and `CT_AGENT_CAPABILITY_OUT` paths on a volume all
instances can read. The **first** agent to start generates and persists that identity; every later one
loads it instead of generating its own — so bring up the primary first and let it finish before starting
the others.

```bash
# agent 1 (primary — creates the shared identity)
CT_AGENT_JOIN_TOKEN=<token> CT_AGENT_ORIGIN_KEY=/shared/origin.key \
CT_AGENT_CAPABILITY_OUT=/shared/capability.bin CT_AGENT_ORIGIN=127.0.0.1:8081 \
  ct-agent onboard

# agent 2+ (redundant — load the same identity, same origin)
CT_AGENT_JOIN_TOKEN=<token-2> CT_AGENT_ORIGIN_KEY=/shared/origin.key \
CT_AGENT_CAPABILITY_OUT=/shared/capability.bin CT_AGENT_ORIGIN=127.0.0.1:8081 \
  ct-agent onboard
```

Each instance still needs its own single-use `CT_AGENT_JOIN_TOKEN` to onboard — sharing the *origin
identity* isn't the same as sharing the onboarding credential.

## What actually happens on failover

Confirmed real and currently passing — `ct-edge`'s own test suite (`cargo test -p ct-edge
redundant_agents`, re-run hermetically for this page: `1 passed; 0 failed`) exercises exactly this:
multiple agent registrations for one token, the edge routing to the most recent, and — on that
registration dropping — failing over to a survivor while evicting only the dropped registration, never
the others.

For a full live rehearsal against a running deployment, `scripts/redundancy-smoke.sh` (in the
[CADS-Tunnel repo](https://github.com/scimbe/CADS-Tunnel)) brings up one origin and two agents on one
identity, confirms a real client round-trip, kills the serving agent, and re-confirms the client still
gets through off the survivor. Not run against production for this page — it needs its own control-plane
+ edge and would register real throwaway state, so this is validated via the hermetic test suite instead,
consistent with how [Mesh Plane]({{ '/explanation/mesh-plane-and-capabilities/' | relative_url }})'s
connection mechanics were validated on this site.

Keep the shared `origin.key` file owner-only — it's your origin's static Noise private key, the thing
that makes possession of your [Capability]({{ '/explanation/mesh-plane-and-capabilities/' | relative_url }})
sufficient to be trusted as *your* origin. Every redundant agent needs read access to it, and nothing
else should.

## See also

[ct-agent CLI commands]({{ '/reference/cli/' | relative_url }}) and
[Environment variables (core tunnel)]({{ '/reference/environment-variables/' | relative_url }}) for
`CT_AGENT_ORIGIN_KEY` and the related `CT_AGENT_ORIGIN_KEY_DIR` (used for zero-downtime origin-key
rotation — a related but distinct procedure: swapping *which* key an already-redundant or single agent
serves, without breaking clients mid-flight).
