---
layout: default
title: Shopping Episode
---

Use your collected Ink Drops and Paper Scraps to embark on a trip to a bookstore. This is more than simply buying a book—it's a chance to immerse yourself in the sights, scents, and atmosphere of shelves brimming with potential adventures.

<div id="shopping-options-container"></div>

<script>
  window.__BASEURL = '{{ site.baseurl }}';
</script>
<script type="module">
  import { initializeShoppingPage } from '{{ site.baseurl }}/assets/js/page-renderers/shoppingRenderer.js';
  initializeShoppingPage();
</script>
