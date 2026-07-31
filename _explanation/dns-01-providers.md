---
title: The three DNS-01 backends behind every cert on this platform
description: One challenge type, three interchangeable ways to answer it — and which one this deployment actually uses.
order: 11
---

# The three DNS-01 backends behind every cert on this platform

Every Let's Encrypt/ZeroSSL certificate this platform issues — the portal's own, and every customer
tunnel's Gelb→Grün promotion (see [Certificate tiers explained]({{ '/explanation/certificate-tiers/' | relative_url }}))
— proves domain control the same way: DNS-01, a `_acme-challenge.<host> TXT` record the CA checks
before issuing. What actually publishes that record is a pluggable abstraction
(`ct_dns::provider::Dns01Provider`, `crates/dns`) with three interchangeable backends. None of this
is documented anywhere else on this site, despite `docs.bunsenbrenner.org` itself having been issued
through one of them.

## The three backends

- **`SelfHosted`** — an in-process, fully authoritative DNS server this platform runs itself
  (`crates/dns`'s own `AcmeDnsStore` + a hand-rolled DNS wire codec, real UDP/TCP `:53` server,
  22 passing tests). Built for registrars with **no DNS API at all** (the docs cite Strato by name,
  [ADR-0019](https://github.com/scimbe/CADS-Tunnel/blob/main/docs/adr/0019-unified-443-gateway.md)) —
  you delegate just the challenge subdomain (`NS`/glue pointing `auth.<zone>` at the plane), the rest
  of the zone stays wherever it already is. A loopback-only mutation API (`CT_DNS_API_LISTEN`,
  default `127.0.0.1:8053`) is the only way to publish/clear records; `:53` itself only ever answers
  queries, never accepts writes.
- **`Desec`** — [deSEC](https://desec.io), a free managed DNS provider with a real REST API.
  **Operator-side only**: holds the zone-wide API token, so it's never constructed on an agent.
  This is the backend this actual production deployment uses — see
  [ADR-0019](https://github.com/scimbe/CADS-Tunnel/blob/main/docs/adr/0019-unified-443-gateway.md)
  and `docs/dns01-desec.md` in the CADS-Tunnel repo for the operator-side setup.
- **`RemoteAgent`** — what an **agent** actually uses for its own tunnel's certificate
  (`ct-agent certificate`, see [Go from Gelb to Grün]({{ '/how-to/gelb-to-gruen/' | relative_url }})).
  Instead of holding any DNS credential, it proves hostname ownership to the control plane's
  `POST /agent/dns01-challenge` (and `.../clear`) using its own routing token — the same token that
  already authorizes it to serve that hostname. The zone-wide credential (deSEC token or the
  self-hosted store) never leaves the operator's control plane; an agent can publish a challenge only
  for a hostname it's already the authorized routing-token owner of.

## Why three, not one

Each solves a different trust boundary:

- Self-hosted exists because some registrars (confirmed: Strato) genuinely have no API to automate
  against — the only alternative is a manual/mail-based process, so this platform runs its own
  minimal authoritative DNS instead.
- deSEC exists because most operators don't want to run public `:53` themselves (a second,
  security-relevant open port) when a managed provider with a real API is available.
- Remote-agent exists because neither of the other two can safely be handed to an agent directly —
  both credential shapes are zone-wide (or full-store) authority, and an agent should only ever be
  able to prove *its own* hostname, never anyone else's on the same zone. `POST
  /agent/dns01-challenge` is the actual enforcement point: it's scoped to exactly the routing token's
  own authorized hostname, confirmed by reading `crates/control-plane/src/dns01_challenge.rs`
  directly.

## Related

- [Certificate tiers explained]({{ '/explanation/certificate-tiers/' | relative_url }}) — what Rot/
  Gelb/Grün mean; DNS-01 is specifically how a tunnel earns Grün.
- [Go from Gelb to Grün]({{ '/how-to/gelb-to-gruen/' | relative_url }}) — `ct-agent certificate`'s
  real, click-tested run, which is the `RemoteAgent` backend in practice.
- [Authorize a new pipeline hostname]({{ '/how-to/authorize-a-pipeline-hostname/' | relative_url }})
  — the routing-token ownership `RemoteAgent` depends on has to exist first.
