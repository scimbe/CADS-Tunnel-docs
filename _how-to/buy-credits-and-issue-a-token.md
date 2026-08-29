---
title: Buy credits and issue an extra routing token
description: What credits are actually for, how to buy them, and the one honest gap in the loop today.
order: 21
---

# Buy credits and issue an extra routing token

Standard tier auto-provisions exactly **one** tunnel the moment your account exists — no credits
needed for that (see [Your first tunnel]({{ '/tutorials/first-tunnel/' | relative_url }})). Credits are
for the case beyond that: minting an **additional** routing token, e.g. for a second tunnel. This page
covers the whole loop honestly, including the one step that genuinely can't be self-tested on this
deployment.

Checked directly against the source (`crates/control-plane/src/service.rs`'s `me_issue`/
`payment_webhook`, `crates/control-plane/src/billing.rs`) and click-tested live against
`bunsenbrenner.org` with the docs-test account for everything except the payment confirmation step
itself (see the callout below for why).

## 1. Buy credits

[bunsenbrenner.org/portal/account](https://bunsenbrenner.org/portal/account), **Buy credits** — pick an
amount and submit:

<figure>
<img src="{{ '/assets/img/credits-intent-created.png' | relative_url }}" alt="The portal's 'Payment intent created' confirmation page: Credits 100, an Intent ID, and text explaining the balance updates once the provider's signed webhook confirms the payment.">
<figcaption>This only creates an <strong>intent</strong> — a record of what you want to buy, not a charge. Your balance is still 0 at this point.</figcaption>
</figure>

Equivalently, from your own machine (`$TOKEN` per
[Getting a bearer token without a browser]({{ '/reference/api-endpoints/' | relative_url }}#getting-a-bearer-token-without-a-browser)
— note this specific flow doesn't have an OIDC-bearer equivalent, only the portal session form above; see
[API endpoints]({{ '/reference/api-endpoints/' | relative_url }}) for the admin-gated `/payment/intent`
variant a payment-provider integration itself would call).

<div class="callout warn">
<strong>Honest gap: confirmation can't be demonstrated on this page.</strong> The intent above sits
unconfirmed forever unless a real payment provider POSTs a signed <code>/payment/webhook</code> event
(<code>X-CT-Webhook-Timestamp</code> + <code>X-CT-Webhook-Signature</code>, verified against
<code>CT_PAYMENT_WEBHOOK_SECRET</code> — a secret shared with that external provider, never something
this site or a customer holds). This deployment has no payment provider wired up for docs-testing
purposes, and forging a webhook event against the live secret would mean actually crediting a real
account's balance in production — not something this page will do just to get a screenshot. So: this
step is confirmed against source and the endpoint's own passing test suite, not click-tested live, same
"Honest gap" discipline as <a href="{{ '/explanation/topology-editor/' | relative_url }}">The Topology
Editor</a>'s overlay-mode caveat elsewhere on this site.
</div>

## 2. Spend a confirmed balance on a routing token

Once a webhook has confirmed a payment, `POST /me/issue` mints a routing token — the same kind of token
[install]({{ '/how-to/install-ct-agent/' | relative_url }}) walks you through redeeming for a tunnel:

```bash
curl -X POST https://bunsenbrenner.org/me/issue \
  -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"price": 1}'
```

A routing token costs exactly **1 credit** (`TOKEN_PRICE`). Confirmed live against the docs-test
account (balance genuinely 0, no confirmed payment):

```
402 Payment Required
insufficient credit: balance 0, requested 1
```

— a real, honest rejection, not a stub. `price` must be at least `TOKEN_PRICE` (`400` if you send `0`,
a deliberate underpayment guard). Optionally pass `idempotency_key` (32-byte hex) so a retried request
returns the *same* token instead of debiting twice — the endpoint is safe to retry on a network timeout.

<div class="callout warn">
<strong>Honest gap: no portal button for this yet.</strong> Unlike buying credits, there's no
"issue another token" button anywhere in <code>/portal/account</code> or <code>/portal/tunnels</code>
today — <code>POST /me/issue</code> is API-only. If you want a second tunnel today, mint the token via
the API call above, then follow <a href="{{ '/how-to/install-ct-agent/' | relative_url }}">Install
ct-agent</a> with that token the same way the portal's own Install button would hand it to you.
</div>

Full reference for every billing endpoint, including the admin-gated trio a payment-provider
integration itself uses server-side: [API endpoints]({{ '/reference/api-endpoints/' | relative_url }}).
