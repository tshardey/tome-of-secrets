---
layout: default
title: Keeper's Character Sheet
permalink: /character-sheet.html
---

<form id="character-sheet">

<!-- Tab Navigation -->
<div class="tab-container">
    <nav class="tab-nav" role="tablist">
        <button type="button" data-tab-target="character" class="active" role="tab" aria-selected="true">
            <span>📊</span> Character
        </button>
        <button type="button" data-tab-target="abilities" role="tab" aria-selected="false">
            <span>⚡</span> Abilities
        </button>
        <button type="button" data-tab-target="inventory" role="tab" aria-selected="false">
            <span>🎒</span> Inventory
        </button>
        <button type="button" data-tab-target="environment" role="tab" aria-selected="false">
            <span>🌿</span> Environment
        </button>
        <button type="button" data-tab-target="quests" role="tab" aria-selected="false">
            <span>📅</span> Quests
        </button>
        <button type="button" data-tab-target="archived" role="tab" aria-selected="false">
            <span>📦</span> Archived
        </button>
        <button type="button" data-tab-target="curses" role="tab" aria-selected="false">
            <span>💀</span> Curses
        </button>
    </nav>

<!-- TAB 1: CHARACTER INFO & RESOURCES -->
<div class="tab-panel active" data-tab-panel="character" role="tabpanel">
    <div class="form-section">
        <h2>👤 Character Information</h2>
        <ul class="form-list">
            <li><label for="keeperName"><strong>Keeper Name:</strong></label> <input type="text" id="keeperName" /></li>
            <li><label for="level"><strong>🌟 Level:</strong></label> <input type="number" id="level" /></li>
            <li>
                <label for="keeperBackground"><strong>📖 Keeper Background:</strong></label>
                <select id="keeperBackground">
                    <option value="">-- Select a Background --</option>
                </select>
            </li>
            <li>
                <label for="wizardSchool"><strong>✨ Wizard School:</strong></label>
                <select id="wizardSchool">
                    <option value="">-- Select a School --</option>
                </select>
            </li>
            <li>
                <label for="librarySanctum"><strong>🏛️ Library Sanctum:</strong></label>
                <select id="librarySanctum">
                    <option value="">-- Select a Sanctum --</option>
                </select>
            </li>
        </ul>
    </div>

    <div class="form-section">
        <h2>📈 Resources & Progression</h2>
        <ul class="form-list">
            <li>
                <label for="xp-current"><strong>Experience Points (XP):</strong></label>
                <div class="xp-tracker">
                    <input type="number" id="xp-current" value="0" />
                    <span class="xp-divider">/</span>
                    <input type="text" id="xp-needed" value="100" readonly />
                </div>
            </li>

            <li class="resource-row">
                <div>
                    <label for="inkDrops"><strong>💧 Ink Drops:</strong></label>
                    <input type="number" id="inkDrops" />
                </div>
                <div>
                    <label for="paperScraps"><strong>📄 Paper Scraps:</strong></label>
                    <input type="number" id="paperScraps" />
                </div>
                <div>
                    <label for="dustyBlueprints"><strong>📜 Dusty Blueprints:</strong></label>
                    <input type="number" id="dustyBlueprints" />
                </div>
                <div>
                    <label for="smp"><strong>🎓 SMP:</strong></label>
                    <input type="number" id="smp" />
                </div>
            </li>
            <li id="currency-unsaved-warning" class="currency-warning" style="display: none;">
                <div class="warning-message">
                    <strong>⚠️ Warning:</strong> You have unsaved changes to your currency. Please save your character sheet before redeeming items on the <a href="{{ site.baseurl }}/shopping.html">Shopping</a> page to ensure your changes are preserved.
                </div>
            </li>
        </ul>
    </div>


    <div class="form-section">
        <h2>📚 Selected Genres</h2>
        <p class="description">Your selected genres for "Organize the Stacks" quests. <a href="{{ site.baseurl }}/quests.html">Change your selection here</a>.</p>
        <div id="selected-genres-display" class="selected-genres-display">
            <!-- Selected genres will be displayed here -->
        </div>
    </div>
</div>
<!-- END TAB 1: CHARACTER -->

<!-- TAB 2: ABILITIES -->
<div class="tab-panel" data-tab-panel="abilities" role="tabpanel">
    <div class="form-section">
    <h2>🔮 Abilities & Benefits</h2>

    <div class="benefit-display">
        <h3>📖 Keeper Background</h3>
        <p id="keeperBackgroundDescriptionDisplay" class="description">-- Select a background to see its description --</p>
        <strong>Benefit:</strong>
        <p id="keeperBackgroundBenefitDisplay">-- Select a background to see its benefit --</p>
    </div>

    <div class="benefit-display">
        <h3>✨ Magical School</h3>
        <p id="magicalSchoolDescriptionDisplay" class="description">-- Select a school to see its description --</p>
        <strong>Benefit:</strong>
        <p id="magicalSchoolBenefitDisplay">-- Select a school to see its benefit --</p>
    </div>

    <div class="benefit-display">
        <h3>🏛️ Library Sanctum</h3>
        <p id="librarySanctumDescriptionDisplay" class="description">-- Select a sanctum to see its description --</p>
        <strong>Benefit:</strong>
        <p id="librarySanctumBenefitDisplay">-- Select a sanctum to see its benefit --</p>
    </div>

    <div class="mastery-abilities-container">
        <h3>🧙 School Mastery Abilities</h3>
        <p>Use your School Mastery Points (SMP) to learn new abilities. Your current SMP: <strong id="smp-display">0</strong></p>
        
        <div class="add-item-form">
            <div class="form-row">
                <select id="ability-select">
                    <option value="">-- Select an ability to learn --</option>
                    </select>
                <button type="button" id="learn-ability-button">Learn Ability</button>
            </div>
        </div>

        <div id="learned-abilities-list" class="item-grid">
            </div>
    </div>

    <div class="benefit-display">
        <h3>🏆 Permanent Bonuses (from Leveling)</h3>
        <ul id="permanentBonusesList">
            <li>-- No bonuses unlocked at this level --</li>
        </ul>
    </div>
</div>
</div>
<!-- END TAB 2: ABILITIES -->

<!-- TAB 3: INVENTORY -->
<div class="tab-panel" data-tab-panel="inventory" role="tabpanel">
<div class="form-section">
    <h2>🎒 Keeper's Loadout & Inventory</h2>

    <div class="slot-management">
        <h3>Equipment Slots</h3>
        <ul class="form-list slot-inputs">
            <li><label for="wearable-slots">Wearable Slots:</label> <input type="number" id="wearable-slots" value="1" min="0" max="9"></li>
            <li><label for="non-wearable-slots">Non-Wearable Slots:</label> <input type="number" id="non-wearable-slots" value="1" min="0" max="9"></li>
            <li><label for="familiar-slots">Familiar Slots:</label> <input type="number" id="familiar-slots" value="1" min="0" max="9"></li>
        </ul>
    </div>

    <div class="add-item-form">
        <label for="item-select"><h3>Add Item to Inventory</h3></label>
        <div class="form-row">
            <select id="item-select">
                <option value="">-- Select an item to add --</option>
            </select>
            <button type="button" id="add-item-button">Add Item</button>
        </div>
    </div>

    <div class="equipped-items-container">
        <h3 id="equipped-summary">Equipped Items (0/0 Slots Used)</h3>
        <div id="equipped-items-list" class="item-grid">
            </div>
    </div>

    <div class="inventory-container">
        <h3>📦 Inventory (Unequipped)</h3>
        <div id="inventory-list" class="item-grid">
            </div>
    </div>

    <div id="passive-equipment-section" class="passive-equipment-section">
        <h3>🌟 Passive Equipment</h3>
        <p class="passive-equipment-description">
            Items and familiars placed in passive slots provide half their normal bonus automatically. Complete restoration projects in the <a href="{{ site.baseurl }}/library.html">Library Restoration</a> to unlock passive slots.
        </p>
        <div class="passive-equipment-grid">
            <div class="passive-equipment-column">
                <h4>Display Slots</h4>
                <div id="passive-item-slots-character-sheet" class="passive-slots-container">
                    <p class="no-slots-message">Complete restoration projects to unlock display slots.</p>
                </div>
            </div>
            <div class="passive-equipment-column">
                <h4>Adoption Slots</h4>
                <div id="passive-familiar-slots-character-sheet" class="passive-slots-container">
                    <p class="no-slots-message">Complete restoration projects to unlock adoption slots.</p>
                </div>
            </div>
        </div>
    </div>
</div>
</div>
<!-- END TAB 3: INVENTORY -->

<!-- TAB 4: ENVIRONMENT -->
<div class="tab-panel" data-tab-panel="environment" role="tabpanel">
    <div class="form-section">
        <h2>🌿 Reading Environment</h2>
        <p class="description">Manage your temporary buffs and atmospheric conditions to enhance your reading experience. Future: Decorate your study to unlock permanent bonuses!</p>

        <div id="temporary-buffs-container">
            <h3>✨ Active Temporary Buffs</h3>
            <p class="description"><strong>Remember:</strong> Don't forget to roll on the <a href="{{ site.baseurl }}/dungeons.html#dungeon-completion-rewards">Dungeon Completion Rewards</a> table when you complete all dungeon rooms! Some rewards are temporary buffs that will be automatically added.</p>
            <p class="description">Temporary buffs are automatically added when earned from side quests and dungeon rewards. Buffs last for the remainder of the current month and the next month unless otherwise specified. One-time buffs are consumed when used.</p>
            
            <div class="add-temp-buff-form">
                <h4>Add Temporary Buff</h4>
                <div class="form-row">
                    <select id="temp-buff-select">
                        <option value="">-- Select a predefined buff --</option>
                    </select>
                    <button type="button" id="add-temp-buff-from-dropdown-button">Add Buff</button>
                </div>
            </div>

            <div id="active-temp-buffs-list">
                <table class="tracker-table">
                    <thead>
                        <tr>
                            <th>Buff Name</th>
                            <th>Effect</th>
                            <th>Duration</th>
                            <th>Status</th>
                            <th class="no-print">Action</th>
                        </tr>
                    </thead>
                    <tbody id="active-temp-buffs-body">
                    </tbody>
                </table>
            </div>
        </div>

        <div id="atmospheric-buffs-container">
            <h3>♦️ Atmospheric Buffs</h3>
            <table class="tracker-table" style="width: 50%; margin-left: auto; margin-right: auto;">
                <thead>
                    <tr>
                        <th>Atmospheric Buff</th>
                        <th>Daily Buff</th>
                        <th>Active</th>
                        <th>Total Days Used</th>
                        <th>Monthly Total</th>
                    </tr>
                </thead>
                <tbody id="atmospheric-buffs-body">
                </tbody>
            </table>
            <div class="form-row" style="margin-top: 10px;">
                <button type="button" class="end-of-month-button no-print">End of Month</button>
            </div>
        </div>
    </div>
</div>
<!-- END TAB 4: ENVIRONMENT -->

<!-- TAB 5: QUESTS -->
<div class="tab-panel" data-tab-panel="quests" role="tabpanel">
    <div class="form-section">
        <h2>📅 Monthly Tracker</h2>

        <div class="completed-reads-shelf-container">
            <svg id="completed-reads-shelf" viewBox="0 0 360 140" xmlns="http://www.w3.org/2000/svg" aria-label="Completed Reads Bookshelf">
                <!-- Shelf wood grain background -->
                <defs>
                    <pattern id="wood-grain" patternUnits="userSpaceOnUse" width="100" height="10">
                        <line x1="0" y1="3" x2="100" y2="3" stroke="#5c4033" stroke-width="0.5" opacity="0.3"/>
                        <line x1="0" y1="7" x2="100" y2="7" stroke="#5c4033" stroke-width="0.3" opacity="0.2"/>
                    </pattern>
                </defs>
                
                <!-- Shelf base -->
                <rect x="0" y="118" width="360" height="22" fill="#8b6914" stroke="#3d2914" stroke-width="2"/>
                <rect x="0" y="118" width="360" height="22" fill="url(#wood-grain)"/>
                <line x1="0" y1="120" x2="360" y2="120" stroke="#a67c00" stroke-width="1" opacity="0.5"/>
                
                <!-- Book shapes - each has id="shelf-book-N" for JS to fill -->
                <!-- Book 0: Slim book -->
                <rect id="shelf-book-0" x="15" y="14" width="20" height="102" 
                      fill="transparent" stroke="#2a1f1a" stroke-width="2"/>
                
                <!-- Book 1: Tall straight -->
                <rect id="shelf-book-1" x="39" y="8" width="28" height="108" 
                      fill="transparent" stroke="#2a1f1a" stroke-width="2"/>
                
                <!-- Book 2: Medium height -->
                <rect id="shelf-book-2" x="71" y="32" width="26" height="84" 
                      fill="transparent" stroke="#2a1f1a" stroke-width="2"/>
                
                <!-- Book 3: Tall -->
                <rect id="shelf-book-3" x="101" y="12" width="30" height="104" 
                      fill="transparent" stroke="#2a1f1a" stroke-width="2"/>
                
                <!-- Book 4: Horizontal stack - bottom (longest, offset left) -->
                <rect id="shelf-book-4" x="140" y="96" width="90" height="20" 
                      fill="transparent" stroke="#2a1f1a" stroke-width="2"/>
                
                <!-- Book 5: Horizontal stack - middle (offset right) -->
                <rect id="shelf-book-5" x="148" y="74" width="86" height="20" 
                      fill="transparent" stroke="#2a1f1a" stroke-width="2"/>
                
                <!-- Book 6: Horizontal stack - top (offset left) -->
                <rect id="shelf-book-6" x="144" y="52" width="78" height="20" 
                      fill="transparent" stroke="#2a1f1a" stroke-width="2"/>
                
                <!-- Book 7: Tall after stack -->
                <rect id="shelf-book-7" x="238" y="6" width="30" height="110" 
                      fill="transparent" stroke="#2a1f1a" stroke-width="2"/>
                
                <!-- Book 8: Short book -->
                <rect id="shelf-book-8" x="272" y="48" width="28" height="68" 
                      fill="transparent" stroke="#2a1f1a" stroke-width="2"/>
                
                <!-- Book 9: Tall rightmost -->
                <rect id="shelf-book-9" x="304" y="10" width="32" height="106" 
                      fill="transparent" stroke="#2a1f1a" stroke-width="2"/>
                
                <!-- Decorative spine lines (subtle) -->
                <g stroke="#2a1f1a" stroke-width="0.5" opacity="0.4">
                    <line x1="53" y1="14" x2="53" y2="110"/>
                    <line x1="116" y1="18" x2="116" y2="110"/>
                    <line x1="253" y1="12" x2="253" y2="110"/>
                    <line x1="320" y1="16" x2="320" y2="110"/>
                </g>
            </svg>
        </div>

        <div class="form-row" style="margin-bottom: 20px; display: flex; gap: 20px; align-items: center; flex-wrap: wrap;">
            <label for="books-completed-month" style="display: flex; align-items: center; gap: 10px;">
                <strong>📚 Books Completed This Month:</strong>
                <input type="number" id="books-completed-month" value="0" min="0" max="10" style="width: 80px;" />
            </label>
            <label for="journal-entries-completed" style="display: flex; align-items: center; gap: 10px;">
                <strong>📝 Journal Entries Completed:</strong>
                <input type="number" id="journal-entries-completed" value="0" min="0" style="width: 80px;" />
            </label>
            <button type="button" class="end-of-month-button no-print" style="margin-left: auto;">End of Month</button>
        </div>
        <p class="description" style="margin-top: -10px; margin-bottom: 20px;">
            <strong>End of Month:</strong> Awards 15 XP per book completed, 5 Paper Scraps per journal entry (+3 for Scribe's Acolyte), processes atmospheric buffs, and resets all monthly counters.
        </p>

        <div class="add-quest-form">
            <div class="form-row">
                <input type="text" id="quest-month" placeholder="Month (e.g., October)">
                <input type="text" id="quest-year" placeholder="Year (e.g., 2025)">
            </div>
            <div class="form-row">
                <select id="new-quest-status">
                <option value="active">Add as Active</option>
                <option value="completed">Add as Completed</option>
                </select>
                <select id="new-quest-type">
                    <option value="">-- Quest Type --</option>
                    <option value="♠ Dungeon Crawl">♠ Dungeon Crawl</option>
                    <option value="♣ Side Quest">♣ Side Quest</option>
                    <option value="♥ Organize the Stacks">♥ Organize the Stacks</option>
                    <option value="🔨 Restoration Project">🔨 Restoration Project</option>
                    <option value="⭐ Extra Credit">⭐ Extra Credit</option>
                </select>
                <div id="standard-prompt-container" class="prompt-container">
                    <input type="text" id="new-quest-prompt" placeholder="Prompt Name">
                </div>
                <div id="genre-prompt-container" class="prompt-container" style="display: none;">
                    <select id="genre-quest-select"><option value="">-- Select a Genre Quest --</option></select>
                </div>
                <div id="side-prompt-container" class="prompt-container" style="display: none;">
                    <select id="side-quest-select"><option value="">-- Select a Side Quest --</option></select>
                </div>
                <div id="dungeon-prompt-container" class="prompt-container" style="display: none;">
                    <select id="dungeon-room-select"><option value="">-- Select a Room --</option></select>
                    <select id="dungeon-encounter-select" style="display: none;"><option value="">-- Select an Encounter --</option></select>
                    <div id="dungeon-action-container" style="display: none;">
                        <label class="switch">
                            <input type="checkbox" id="dungeon-action-toggle">
                            <span class="slider"></span>
                        </label>
                        <span id="dungeon-action-label">Defeat</span>
                    </div>
                </div>
                <div id="restoration-prompt-container" class="prompt-container" style="display: none;">
                    <select id="restoration-wing-select"><option value="">-- Select a Wing --</option></select>
                    <select id="restoration-project-select" style="display: none;"><option value="">-- Select a Project --</option></select>
                </div>
            </div>
            <div class="form-row">
                <input type="text" id="new-quest-book" placeholder="Book Title">
                <input type="text" id="new-quest-book-author" placeholder="Book Author (optional)">
            </div>
            <div class="form-row">
                <input type="text" id="new-quest-notes" placeholder="Notes (optional)">
            </div>
            <div class="form-row">
                <label for="quest-buffs-select" style="display: inline-block; margin-right: 10px;"><strong>Applicable Buffs & Items:</strong></label>
                <select id="quest-buffs-select" multiple style="width: 100%; min-height: 60px;">
                </select>
                <small style="display: block; margin-top: 5px;">Hold Ctrl/Cmd to select multiple buffs/items. Shows active temp buffs and equipped items.</small>
            </div>
            <div class="form-row">
                <button type="button" id="add-quest-button">Add Quest</button>
                <button type="button" id="cancel-edit-quest-button" style="display: none;">Cancel</button>
            </div>
        </div>

        <div id="active-assignments-container">
            <h3 id="active-summary">Active Book Assignments</h3>
            <div class="quest-cards-container"></div>
        </div>
    </div>
</div>
<!-- END TAB 5: QUESTS -->

<!-- TAB 6: ARCHIVED QUESTS -->
<div class="tab-panel" data-tab-panel="archived" role="tabpanel">
    <div class="form-section">
        <h2>📦 Archived Quests</h2>
        <p class="description">View your quest history - completed books and discarded quests.</p>

        <div id="completed-quests-container">
            <h3 id="completed-summary">Completed Quests</h3>
            <div class="quest-cards-container"></div>
        </div>

        <div id="discarded-quests-container">
            <h3 id="discarded-summary">Discarded Quests</h3>
            <div class="quest-cards-container"></div>
        </div>
    </div>
</div>
<!-- END TAB 6: ARCHIVED QUESTS -->

<!-- TAB 7: CURSES -->
<div class="tab-panel" data-tab-panel="curses" role="tabpanel">
    <div class="form-section">
        <h2>📜 The Shroud's Curse</h2>
        <p class="description">When you fail to complete your monthly quest pool, the Shroud advances and you receive a Worn Page penalty for each book you missed. For each Worn Page you have, roll on the Curse Table at the start of your next month's quest.</p>

        <div class="add-curse-form">
            <h3>Add Curse Penalty</h3>
            <div class="form-row">
                <select id="curse-penalty-select">
                    <option value="">-- Select Curse Penalty --</option>
                </select>
                <input type="text" id="curse-book-title" placeholder="Book/Activity Title">
                <button type="button" id="add-curse-button">Add Curse</button>
            </div>
        </div>

        <div id="active-curses-container">
            <h3 id="active-curses-summary">Active Curse Penalties</h3>
            <table class="tracker-table">
                <thead>
                    <tr>
                        <th class="col-curse">Curse Penalty</th>
                        <th class="col-requirement">Requirement</th>
                        <th class="col-book">Book/Activity</th>
                        <th class="col-status">Status</th>
                        <th class="col-action no-print">Action</th>
                    </tr>
                </thead>
                <tbody id="active-curses-body">
                </tbody>
            </table>
        </div>

        <div id="completed-curses-container">
            <h3 id="completed-curses-summary">Completed Curse Penalties</h3>
            <table class="tracker-table">
                <thead>
                    <tr>
                        <th class="col-curse">Curse Penalty</th>
                        <th class="col-requirement">Requirement</th>
                        <th class="col-book">Book/Activity</th>
                        <th class="col-status">Status</th>
                        <th class="col-action no-print">Action</th>
                    </tr>
                </thead>
                <tbody id="completed-curses-body">
                </tbody>
            </table>
        </div>

    </div>
</div>
<!-- END TAB 7: CURSES -->

</div>
<!-- END TAB CONTAINER -->

    <div class="form-buttons no-print">
    <button type="submit">Save Character Info</button>
    <button type="button" id="print-button">Print</button>
    <span id="save-indicator" class="save-indicator hidden">
        <img src="{{ site.baseurl }}/assets/images/icons/save-icon.png" alt="Saved" class="save-icon" />
        <span class="save-text">Saved</span>
    </span>
    </div>
</form>
