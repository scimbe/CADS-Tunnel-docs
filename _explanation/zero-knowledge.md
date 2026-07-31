---
title: Zero-knowledge architecture
description: What "the operator cannot see your payload" actually covers — and doesn't.
order: 2
---

# Zero-knowledge architecture

CADS-Tunnel is built so that every hop that actually touches the network is encrypted, and the operator
never holds the keys needed to decrypt the traffic flowing through a tunnel. This page is deliberately
precise about what that does and doesn't mean — a vague security claim is worse than none.

## What's actually encrypted, and how

- **Browser ↔ edge**: real TLS, always — whether the edge is terminating with the shared Gelb
  certificate or passing through to your own Grün certificate. The QUIC-to-TCP fallback path (for
  clients that can't reach the edge over UDP) is dispatched only *after* a real TLS handshake completes;
  there's no code path that serves a client over plaintext.
- **Agent ↔ edge** (the tunnel itself, carrying your service's traffic): QUIC, which mandates TLS 1.3 at
  the protocol level. The TCP-fallback rendezvous connection is separately TLS-terminated before use.
- **Agent ↔ agent** (Agent-Fabric channels, the MCP/A2A layer): Noise_IK, end-to-end. The broker/relay
  that helps two agents find and connect to each other only ever handles ciphertext, or — during
  rendezvous — an attested public key needed for the two agents to verify each other, never plaintext
  application data. This holds across every fallback rung, including the `:443` front-door escape hatch
  for restrictive networks — same session, only the transport route changes.

## The one honest caveat: Gelb-tier termination

While a hostname is at the Gelb tier, the edge terminates the browser's TLS connection (since it's using
the shared certificate) and forwards the decrypted application bytes onward — but only over the
still-encrypted agent↔edge tunnel, to an origin that's expected to stay loopback-only behind the agent,
never exposed raw to the network. This is a deliberate, documented tradeoff (a shared wildcard
certificate can't be handed to a customer's own origin to hold), not an oversight. Every hop that
actually touches the open network is still encrypted in this case; the edge process itself briefly holds
plaintext in memory during termination, the same way any TLS-terminating reverse proxy does.

If that distinction matters for your threat model, Grün's own-certificate model avoids it entirely — see
[Certificate tiers]({{ '/explanation/certificate-tiers/' | relative_url }}).

## What "zero-knowledge" does *not* mean

- It does not mean the operator can't see that a tunnel exists, roughly when it connects, or coarse
  metadata — concretely: your account, which tunnel it is, and byte counts each direction (the edge's
  relay function returns exactly that pair, `(bytes a→b, bytes b→a)`, never the bytes themselves). The
  transport is encrypted; the platform is not invisible.
- **It does not mean anonymity.** Accounts are conventional Keycloak/OIDC — the operator knows who you
  are for billing and abuse-handling, the same as almost any hosted service. The honest claim here is
  confidentiality of what flows through the tunnel, not anonymity of who's running it.
- It does not mean immunity from lawful process or censorship resistance in a legal/jurisdictional sense
  — those are operational and legal questions the software doesn't attempt to answer, not a technical
  guarantee this platform makes.
- **The hostname specifically depends on which access mode you're on** — this page and most of this site
  describe Browser Plane, where the edge genuinely does read your hostname from the TLS SNI to route the
  connection (that's the actual tradeoff that gets you an ordinary browser-reachable site). It does
  **not** apply to [Mesh Plane]({{ '/explanation/mesh-plane-and-capabilities/' | relative_url }}) —
  opaque-token routed by design, specifically so the hostname is never visible to the operator at all.
  Traffic volume follows the same split: on Browser Plane the edge always sees it (there's no P2P
  alternative); on Mesh Plane it's only visible during relay fallback, not when a direct P2P path forms.
- It does not protect the device your service runs on. The tunnel exposes exactly the one service you
  point it at — it doesn't scan, harden, or secure the rest of your machine, and the platform has no
  visibility into what else runs there. That's explicitly your own responsibility; see the Nutzungsbedingungen.
- It does not make your own application code secure. A vulnerability in what you built is yours to fix,
  encrypted transport notwithstanding.
