---
layout: default
title: The Grand Library
---

## Your Library Sanctum
The heart of your adventure is your library, which is also your home. Choosing a type of library grants you a permanent ability that enhances certain Atmospheric Buffs. For any buff listed in your chosen library's description, you now earn x2 Ink Drops whenever that buff would normally provide an Ink Drop bonus.

> **Journaling Prompt:** What does your sanctum look, feel, and smell like? Is it a place of comfort and refuge, or one of mystery and ancient dust?

<div id="sanctum-list"></div>

<script>
  window.__BASEURL = '{{ site.baseurl }}';
</script>
<script type="module">
  import { initializeSanctumPage } from '{{ site.baseurl }}/assets/js/page-renderers/sanctumRenderer.js';
  initializeSanctumPage();
</script>
