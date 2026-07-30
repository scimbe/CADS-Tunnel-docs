---
title: Reference
layout: default
permalink: /reference/
---

# Reference

Precise facts to look up — environment variables, API endpoints, CLI commands. No narration.

<div class="card-grid">
{% assign pages = site.reference | sort: 'order' %}
{% for p in pages %}
 <a class="card" href="{{ p.url | relative_url }}">
  <h3>{{ p.title }}</h3>
  <p>{{ p.description }}</p>
 </a>
{% endfor %}
</div>
