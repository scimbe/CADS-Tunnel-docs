# CADS-Tunnel-docs

Documentation for [CADS-Tunnel](https://github.com/scimbe/CADS-Tunnel), published at
[docs.bunsenbrenner.org](https://docs.bunsenbrenner.org) via GitHub Pages (native Jekyll build, no
custom Actions workflow needed).

## Structure

Organized around the [Diátaxis](https://diataxis.fr) framework — tutorials, how-to guides, reference,
explanation — as four Jekyll collections (`_config.yml`). Add a page by creating a Markdown file in the
matching directory (`tutorials/`, `how-to/`, `reference/`, `explanation/`) with front matter:

```yaml
---
title: Page title
description: One sentence, shown on the section index card.
order: 1
---
```

## Validation standard

Every procedure documented here should be actually run against the live deployment (or the real test
suite) before being written up as fact, not described from the source alone. Where that wasn't possible,
say so explicitly in the page rather than presenting it as confirmed.

## Local preview

```bash
bundle install
bundle exec jekyll serve
```
