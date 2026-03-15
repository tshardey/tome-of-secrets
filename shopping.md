---
layout: default
title: Shopping Episode
---

Use your collected Ink Drops and Paper Scraps to embark on a trip to a bookstore. This is more than simply buying a book—it's a chance to immerse yourself in the sights, scents, and atmosphere of shelves brimming with potential adventures.

<div class="shopping-tabs">
  <nav class="shopping-tab-nav" role="tablist">
    <button type="button" class="shopping-tab-btn active" data-shopping-tab="shop" role="tab" aria-selected="true">Shop</button>
    <button type="button" class="shopping-tab-btn" data-shopping-tab="subscriptions" role="tab" aria-selected="false">Book Box Subscriptions</button>
  </nav>
  <div class="shopping-tab-panel active" id="shopping-tab-panel-shop" data-shopping-panel="shop" role="tabpanel">
    <div id="shopping-options-container"></div>
  </div>
  <div class="shopping-tab-panel" id="shopping-tab-panel-subscriptions" data-shopping-panel="subscriptions" role="tabpanel" aria-hidden="true">
    <div id="shopping-subscriptions-container">
      <!-- Rendered by shoppingRenderer: add form + subscription list -->
    </div>
  </div>
</div>

<script>
  window.__BASEURL = '{{ site.baseurl }}';
</script>
<script type="module">
  import { initializeShoppingPage } from '{{ site.baseurl }}/assets/js/page-renderers/shoppingRenderer.js';
  initializeShoppingPage();
</script>
