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

### Journaling: Organize the Stacks

These quests represent the routine duties of a Keeper. You are maintaining your Sanctum, sorting chaotic shelves, discovering lost wings, or simply performing slice-of-life maintenance tasks to keep the magic from overflowing.

* **The Mess:** Why was this section of the library in disarray? How do you go about removing the shroud in this area? Are the books static or do they inexplicably move around?
* **The Discovery:** Did you find anything unexpected tucked between the pages while cleaning? Did a certain book call to you as you went about your task?

## ♦️ Atmospheric Buffs (Roll a d8)
These buffs are daily bonuses. Once per day, when you set a mood for reading, you can earn +1 Ink Drop.

### Journaling: Atmospheric Buffs

These entries focus on the sensory experience of the Library. The Grand Library is an organism with its own weather, moods, and shifts. These entries are about how it feels to exist within the walls.

* **The Senses:** How did this atmospheric change affect your senses? What did the air smell like? Did the warmth of the hearth drive off the winter cold?
* **The Memory:** Did the atmosphere trigger a memory for your Keeper?
* **The Effect:** Did the atmosphere make your task harder or easier?

<div id="atmospheric-buffs-table"></div>

## ♣️ Side Quests (Roll a d8)
Completing a side quest rewards you with a magical item or a bonus.

**Note:** If you roll a side quest that you have already completed (grayed out in the table below), you may roll again.

### Journaling: Side Quests

These involve interactions with the Library's denizens. You are not alone here; there are ghosts, lost students, magical portraits, and other entities that require your aid.

* **The Encounter:** Who or what did you encounter in the stacks? What problem were they facing or what do they want you to do?
* **The Result:** How does the book and prompt tie into the encounter? Did the interaction change your relationship with the library? Did you gain a new ally or put a spirit to rest?

<div id="side-quests-table"></div>

<script type="module">
  import { initializeTables } from '{{ site.baseurl }}/assets/js/table-renderer.js';
  import { initializeQuestsPage } from '{{ site.baseurl }}/assets/js/quests.js';
  initializeTables();
  initializeQuestsPage();
</script>
