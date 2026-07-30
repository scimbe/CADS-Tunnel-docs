---
title: Explanation
layout: default
permalink: /explanation/
---

# Explanation

Understand why the system is built the way it is — background and design reasoning, not steps to follow.

<div class="card-grid">
{% assign pages = site.explanation | sort: 'order' %}
{% for p in pages %}
 <a class="card" href="{{ p.url | relative_url }}">
  <h3>{{ p.title }}</h3>
  <p>{{ p.description }}</p>
 </a>
{% endfor %}
</div>
