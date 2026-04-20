---
layout: default
title: Keeper's Character Sheet
permalink: /character-sheet.html
---

<form id="character-sheet">

<!-- Tab Navigation -->
<div class="tab-container">
    {% include character-sheet/tabs/tab-nav.html %}
{% include character-sheet/tabs/character.html %}
{% include character-sheet/tabs/abilities.html %}
{% include character-sheet/tabs/inventory.html %}
{% include character-sheet/tabs/environment.html %}
{% include character-sheet/tabs/library.html %}
{% include character-sheet/tabs/campaigns.html %}
{% include character-sheet/tabs/quests.html %}
{% include character-sheet/tabs/external-curriculum.html %}
{% include character-sheet/tabs/archived.html %}
{% include character-sheet/tabs/curses.html %}
</div>
<!-- END TAB CONTAINER -->

{% include character-sheet/drawers/table-overlay.html %}
{% include character-sheet/drawers/leveling-rewards.html %}
{% include character-sheet/drawers/school-mastery.html %}
{% include character-sheet/drawers/keeper-backgrounds.html %}
{% include character-sheet/drawers/wizard-schools.html %}
{% include character-sheet/drawers/library-sanctums.html %}
{% include character-sheet/drawers/genre-quests.html %}
{% include character-sheet/drawers/atmospheric-buffs.html %}
{% include character-sheet/drawers/side-quests.html %}
{% include character-sheet/drawers/dungeons.html %}
{% include character-sheet/drawers/book-edit.html %}
{% include character-sheet/drawers/quest-edit.html %}

    <div class="form-buttons">
    <span id="save-indicator" class="save-indicator hidden">
        {% if site.images_cdn_base and site.images_cdn_base != "" %}
        <img src="{{ site.images_cdn_base }}/icons/save-icon.png" alt="Saved" class="save-icon" />
        {% else %}
        <img src="{{ site.baseurl }}/assets/images/icons/save-icon.png" alt="Saved" class="save-icon" />
        {% endif %}
        <span class="save-text">Saved</span>
    </span>
    </div>
</form>
