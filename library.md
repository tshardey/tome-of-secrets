---
layout: default
title: Library Restoration
---

<div class="library-page">
    <div class="library-map-banner">
        {% if site.images_cdn_base and site.images_cdn_base != "" %}
        <img src="{{ site.images_cdn_base }}/library-renovation-wo-room-labels.png" alt="Library Restoration Map" class="library-map-image">
        {% else %}
        <img src="{{ site.baseurl }}/assets/images/library-renovation-wo-room-labels.png" alt="Library Restoration Map" class="library-map-image">
        {% endif %}
    </div>

    <div class="library-header">
        <h2>📚 Library Restoration</h2>
        <p class="library-header-note"><em>Check your <strong>Dusty Blueprints</strong> in the status widget (bottom-right corner).</em></p>
    </div>

    <div class="restoration-progress">
        <div class="progress-bar-container">
            <div class="progress-bar" id="overall-progress-bar" style="width: 0%"></div>
        </div>
        <div class="progress-text">
            <span id="progress-projects">0/0</span> Projects Complete • 
            <span id="progress-wings">0/6</span> Wings Restored
        </div>
    </div>

    <div id="library-map" class="library-map">
        <!-- Wing cards will be rendered here by libraryRenderer.js -->
    </div>

    <div id="wing-detail-panel" class="wing-detail-panel" style="display: none;">
        <button class="close-panel-btn" id="close-wing-panel">&times;</button>
        <div id="wing-detail-content">
            <!-- Wing detail content will be rendered here -->
        </div>
    </div>
</div>

<script type="module">
    import { initializeLibraryPage } from '{{ site.baseurl }}/assets/js/page-renderers/libraryRenderer.js';
    
    document.addEventListener('DOMContentLoaded', () => {
        initializeLibraryPage();
    });
</script>

