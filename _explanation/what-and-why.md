---
title: What CADS-Tunnel is, and why
description: The pitch, backed by what the code actually does — selling points with proof, and an explicit list of what we don't claim.
order: 13
---

# What CADS-Tunnel is, and why

A tunnel that exposes a local service (any TCP/UDP) to clients through a thin hosted control
plane, with the payload encrypted end-to-end so the operator can route your traffic but never
read it.

Every claim below is backed by something the code actually does — see the linked proof. We
deliberately do **not** market anything we can't stand behind (see
["What we don't claim"](#what-we-dont-claim) below).

## Selling points

### We can't read what you send
Payload is encrypted **end-to-end** with Noise (client ↔ origin). The edge and control plane
relay only ciphertext — operator access to your bytes is cryptographically impossible, not a
policy promise. See [Zero-knowledge architecture]({{ '/explanation/zero-knowledge/' | relative_url }}).

### Onboard in one command
Install → enroll → tunnel in a single step: the agent generates its own identity, redeems a
join token, and starts serving. The operator handles one short-lived secret. See the
[onboarding quickstart]({{ '/tutorials/' | relative_url }}).

### Deploy your way
Run it fully hosted, or self-host the core with one compose file. Same binaries, same
protocol.

### Durable and self-healing
State (accounts, enrollment, tunnel registry, credit ledger) is persisted and survives
restarts; liveness/readiness probes keep unhealthy instances out of rotation.

### Certificate rotation without re-pinning
The edge runs an internal CA; clients trust the CA root, so edge certificates rotate without
any client change. See [Certificate tiers]({{ '/explanation/certificate-tiers/' | relative_url }}).

### Abuse-resistant
A proof-of-work gate plus per-account rate limits keep a single account from exhausting the
service.

### Payments you can trust
Credits are applied only from a payment-provider webhook whose signature we verify — the
control plane can never credit an account on its own.

## What we don't claim

Honesty is part of the pitch. We do **not** claim:

- **Anonymity / pseudonymity.** Accounts are conventional (Keycloak/OIDC). The operator knows
  who you are for billing; the honest claim is confidentiality of the payload, not anonymity
  of the user.
- **Metadata blindness.** The control plane sees routing and billing metadata (account,
  tunnel, byte counts) — just not payload contents.
- **Censorship immunity or immunity from lawful process.** Those are operational and
  jurisdictional questions, out of scope for the software.

## Who it's for

Teams that need to expose a service to clients over untrusted networks and want provider-blind
payload confidentiality, simple onboarding, and the choice to self-host — without buying into
anonymity claims they can't verify.

## Related

- [How CADS-Tunnel compares]({{ '/explanation/how-it-compares/' | relative_url }}) — the same
  proof-backed, no-overclaiming approach, applied to the tunneling/mesh-VPN/zero-trust
  landscape rather than to CADS-Tunnel on its own.
- [Zero-knowledge architecture]({{ '/explanation/zero-knowledge/' | relative_url }}) — what
  payload confidentiality actually covers, and what it doesn't.
