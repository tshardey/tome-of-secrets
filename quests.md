---
layout: default
title: Quests and Challenges
---

## ♥️ Organize the Stacks (Roll a d6)
Completing an Organize the Stacks quest rewards you with **+15 XP** and **+10 Ink Drops**

<div class="genre-selection-container">
    <h3>📚 Choose Your 6 Favorite Genres</h3>
    <p class="description">Select your 6 favorite genres for your "Organize the Stacks" quests. You can change these anytime without affecting your existing quest tracker entries.</p>
    
    <div class="selected-genres-grid" id="selected-genres-display">
        <!-- Selected genres will be displayed here -->
    </div>
    
    <div class="genre-selection-controls">
        <label for="genre-selector"><strong>Add Genre:</strong></label>
        <select id="genre-selector">
            <option value="">-- Select a genre to add --</option>
        </select>
        <button type="button" id="add-genre-button">Add Genre</button>
    </div>
    
    <div class="genre-quests-preview">
        <h3>Your Custom Genre Quests (Roll a d6)</h3>
        <div id="custom-genre-quests-display">
            <!-- Custom genre quests will be displayed here -->
        </div>
    </div>
</div>

## ♦️ Atmospheric Buffs (Roll a d8)
These buffs are daily bonuses. Once per day, when you set a mood for reading, you can earn +1 Ink Drop.

<div id="atmospheric-buffs-table"></div>

## ♣️ Side Quests (Roll a d8)
Completing a side quest rewards you with a magical item or a bonus.

<div id="side-quests-table"></div>

<script type="module">
  import { initializeTables } from '{{ site.baseurl }}/assets/js/table-renderer.js';
  import { initializeQuestsPage } from '{{ site.baseurl }}/assets/js/quests.js';
  initializeTables();
  initializeQuestsPage();
</script>
