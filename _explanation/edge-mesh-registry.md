---
title: The edge mesh registry — durable ownership, and a relay leg waiting for a second edge
description: A no-op today with exactly one edge, but it already fixed a real outage, and the edge-to-edge relay it enables is real, tested code sitting behind a flag.
order: 10
---

# The edge mesh registry

Today's deployment runs exactly one edge. This page explains a mechanism that mostly looks
invisible *because* of that — `crates/control-plane/src/edge_mesh.rs` (`SqliteEdgeMesh`,
[ADR-0021](https://github.com/scimbe/CADS-Tunnel/blob/main/docs/adr/0021-multi-edge-mesh-relay-and-core-system-federation.md))
— but it is real, running in production right now, and it already fixed a genuine outage before
a second edge ever existed.

## What it actually is

A durable SQLite-backed registry the control plane keeps: which edge instance currently owns
which `(routing token, hostname)` pair, and which edges have heartbeated recently. Two tables,
`mesh_edges` and `mesh_ownership`, behind three admin-token-gated routes:

- `POST /internal/edges/heartbeat` — an edge announces itself (`id`, `peer_addr`) every 30
  seconds.
- `GET /internal/edges/lookup?token=|host=` — which edge (id, peer address) owns a given
  token/hostname.
- `GET /internal/edges/rehydrate/:edge_id` — every `(token, hostname)` pair a given edge owns,
  for that edge to replay into its own local state.

## The bug it already fixed, before any second edge existed

`crates/edge/src/state.rs`'s `host_auth` map — which hostnames this edge is currently
authorized to serve — was purely in-process memory with no persistence. Every edge container
recreation silently forgot every hostname authorization. That caused a real production outage
this session (tracked in issue #214).

Because the control plane already originates every hostname authorization (it mints the routing
token and pushes `authorize-host` to the edge), the fix didn't need new infrastructure: record
that fact durably in `mesh_ownership`, and have a booting edge replay it. Confirmed live, not
assumed — a fresh edge process today logs exactly this on startup:

```
ct-edge: mesh-registry heartbeat/rehydration enabled against http://control-plane:8090 (CT_EDGE_ID=primary)
ct-edge: rehydrated 38 hostname authorization(s) from http://control-plane:8090 (edge_id=primary)
```

`CT_EDGE_ID` defaults to `primary`, matching the control plane's own default local-edge id, so a
single-edge deployment needs zero extra configuration for any of this to work — it's on whenever
`CT_EDGE_CP_URL` is set, which self-hosted deployments already set for the channel broker.

## The relay leg: real, tested, and off by default

The registry also lays real groundwork for horizontal scale: once a second edge exists,
[`assign_edge`] round-robins new tunnels across whichever edges heartbeated recently (least-loaded
by ownership-row count), and any edge can look up which peer holds a token/hostname it doesn't
have locally via the `lookup` route above.

What that lookup enables — an edge-to-edge byte relay for the case where a client lands on edge A
but the hostname it wants is owned by edge B — **is implemented**, not just designed:
`relay_via_peer_edge` in `crates/edge/src/serve.rs` dials the owning edge's `peer_addr` over the
same TLS-over-TCP mechanism the client fallback path already uses, presents a minimal `'M'`-framed
role byte carrying the shared edge admin token, and — once the peer edge confirms it can actually
serve that hostname locally — relays bytes opaquely in both directions, the same provider-blind
relay every other leg uses. Covered by two real tests
(`mesh_relay_reaches_a_hostname_owned_by_a_peer_edge`,
`mesh_relay_is_rejected_with_the_wrong_admin_token`), not mocked around.

It stays off by default (`CT_EDGE_MESH_RELAY_ENABLED`, unset) because with exactly one edge every
hostname lookup always resolves locally — the relay path is dead code in that topology, correctly
so. It only starts mattering the moment a second edge is deployed for real capacity, which hasn't
happened yet.

<div class="callout warn">
Two small inaccuracies were found and fixed while writing this page: <code>edge_mesh.rs</code>'s
own module doc still said the byte-relay was "not yet built," and ADR-0021 still listed itself as
"Proposed" — both predated the relay leg actually landing. Corrected in both places; this is a
documentation fix, not a behavior change (confirmed via the hermetic test suite before and after).
</div>

## Related

- [How the edge decides whether to admit a channel join]({{ '/explanation/channel-admission/' | relative_url }})
  — a different edge↔control-plane round-trip (channel membership, not hostname ownership), with
  its own real fail-closed/fail-static distinction.
- [The internal Mesh-Plane CA]({{ '/explanation/mesh-plane-ca/' | relative_url }}) — the same
  internal PKI root the mesh-relay leg trusts for edge-to-edge TLS, no new certificate machinery.
