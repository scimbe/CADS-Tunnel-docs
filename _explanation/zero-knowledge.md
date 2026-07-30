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

- It does not mean the operator can't see that a tunnel exists, its hostname, or coarse metadata (when
  it connects, roughly how much traffic). The transport is encrypted; the platform is not invisible.
- It does not protect the device your service runs on. The tunnel exposes exactly the one service you
  point it at — it doesn't scan, harden, or secure the rest of your machine, and the platform has no
  visibility into what else runs there. That's explicitly your own responsibility; see the Nutzungsbedingungen.
- It does not make your own application code secure. A vulnerability in what you built is yours to fix,
  encrypted transport notwithstanding.
