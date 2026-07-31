---
title: The internal Mesh-Plane CA
description: Why the Edge hands out a CA root instead of a cert, and what that buys you across a redeploy.
order: 8
---

# The internal Mesh-Plane CA

Every other explanation page on this site covers something reachable through the portal or an
`ct-agent` subcommand. This one covers a piece of plumbing that's easy to miss entirely: a single,
unauthenticated `GET /pki/ca`, live-checked for this page —

```
$ curl -s https://bunsenbrenner.org/pki/ca | openssl x509 -inform der -noout -subject -issuer -ext basicConstraints,keyUsage
subject=CN=ct-edge-ca
issuer=CN=ct-edge-ca
X509v3 Basic Constraints: critical
    CA:TRUE
X509v3 Key Usage: critical
    Digital Signature, Certificate Sign, CRL Sign
```

— a self-signed **Certificate Authority root**, not a server certificate. This is what a Mesh-Plane
Agent or Client actually trusts, and it's a different mechanism entirely from the
[Rot/Gelb/Grün]({{ '/explanation/certificate-tiers/' | relative_url }}) ACME story on this site —
that one is about *your* browser-facing subdomain's public HTTPS certificate; this one is about how
the tunnel's own internal QUIC/TLS transport establishes trust between an Edge and the Agents/Clients
connecting to it.

## Why a CA instead of just publishing the Edge's certificate

Source-grounded in `crates/edge/src/pki.rs` (`Ca::new`/`Ca::issue`), which frames it directly as a
fix for a real, numbered regression (issue #2): an earlier design had the Edge generate a fresh
self-signed certificate on every boot, and Clients pinned that exact certificate. Redeploy the Edge
— which regenerates the cert — and every pinned peer breaks with `BadSignature`, because the thing
they trusted no longer exists.

The fix, in place today: the Edge holds a **CA signing key**, persisted on disk
(`Ca::load_or_create`, written owner-only/`0600` so it's never world-readable) and reused across
restarts. On each boot the Edge asks its own CA to **issue a fresh leaf certificate** for its own
QUIC and TLS-TCP listeners (`Ca::issue`), but Agents and Clients never pin that leaf — they trust
the **CA root** (`build_client_endpoint_trusting_ca`), and rustls validates any leaf signed by a CA
in its root store. The Edge can rotate its own leaf on every restart without anyone re-pinning
anything, as long as the CA's own signing key stays the same. Regenerating the CA key would still
break every existing pin — the key file persisting is what makes the root, not just the leaf,
stable.

<div class="callout warn">
Checked directly against this deployment's own live root rather than assumed from source: its
validity window is <code>1975-01-01</code> to <code>4096-01-01</code> — <code>rcgen</code>'s default
for a self-signed cert with no explicit <code>not_before</code>/<code>not_after</code> set. In
practice this CA root never expires on any timescale that matters; nothing in this deployment
renews it on a schedule, and nothing needs to.
</div>

## Who fetches it, and how

Both `ct-agent` and `ct-client` need this root before they can trust the Edge, but they get it
differently — checked against both crates' source, not assumed symmetric:

- **`ct-agent`** self-serves it over HTTP when `CT_AGENT_EDGE_CERT_URL` is set — internally, exactly
  the `GET {url}/pki/ca` call demonstrated above (`ControlPlaneClient::fetch_edge_cert`, wired in
  `ct-agent`'s own `main.rs`). This is the same variable [documented in the environment-variables
  reference]({{ '/reference/environment-variables/' | relative_url }}) for the unset-it-hangs-forever
  gotcha; the CA-fetch mechanics are the missing half of why that variable exists at all. Unset, the
  agent instead polls a local shared-volume path for the cert file — no HTTP client involved on that
  path.
- **`ct-client`** is deliberately kept HTTP-client-free (its own source comment's words) — it never
  calls `/pki/ca` itself. The deploying operator is expected to `curl {cp_url}/pki/ca -o
  edge-cert.der` out of band and point `CT_CLIENT_EDGE_CERT` at the saved file's path, or drop it on
  a shared volume the client polls (`CT_CLIENT_EDGE_CERT_WAIT_SECS` bounds that wait, same pattern as
  the agent-side variables above).

## What this root actually secures

Every leaf `Ca::issue` signs is scoped to the Mesh-Plane transport: the shared QUIC/TLS-TCP Edge
listener (`build_dual_edge_from_ca`) and the dedicated Agent-Fabric channel front-door leg on `:443`
(`build_channel_front_door_acceptor`, ALPN `ct-edge-channel` — see
[Agent-Fabric channels]({{ '/explanation/agent-fabric-channels/' | relative_url }}) for what runs
over that leg). It has nothing to do with your own published subdomain's public certificate — that
one comes from a real public CA (Let's Encrypt) via the Rot/Gelb/Grün flow, precisely because
*browsers* need to trust it and browsers don't ship this deployment's internal root. The two systems
solve the same underlying problem — "how does a TLS client end up trusting the right server" — for
two audiences that can't share an answer: a tunnel's own transport, where the operator controls both
ends and can hand out a private root, and the public web, where it can't.
