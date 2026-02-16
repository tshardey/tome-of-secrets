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
    <!-- RPG Hero Section -->
    <div class="rpg-hero-section">
        <div class="rpg-hero-content">
            <div class="rpg-hero-main">
                <div class="rpg-hero-name-section">
                    <label for="keeperName" class="rpg-hero-label">Keeper Name</label>
                    <input type="text" id="keeperName" class="rpg-hero-name-input" placeholder="Enter your name" />
                </div>
                <div class="rpg-hero-level-section">
                    <label for="level" class="rpg-hero-label">Level</label>
                    <div class="rpg-level-container">
                        <span class="rpg-level-badge" id="rpg-level-badge">
                            <span class="rpg-level-number" id="rpg-level-number">1</span>
                        </span>
                        <input type="number" id="level" class="rpg-level-input" value="1" min="1" />
                    </div>
                </div>
            </div>
            <div class="rpg-hero-attributes">
                <div class="rpg-attribute-item">
                    <label for="keeperBackground" class="rpg-attribute-label">📖 Background</label>
                    <select id="keeperBackground" class="rpg-attribute-select">
                        <option value="">-- Select --</option>
                    </select>
                </div>
                <div class="rpg-attribute-item">
                    <label for="wizardSchool" class="rpg-attribute-label">✨ School</label>
                    <select id="wizardSchool" class="rpg-attribute-select">
                        <option value="">-- Select --</option>
                    </select>
                </div>
                <div class="rpg-attribute-item">
                    <label for="librarySanctum" class="rpg-attribute-label">🏛️ Sanctum</label>
                    <select id="librarySanctum" class="rpg-attribute-select">
                        <option value="">-- Select --</option>
                    </select>
                </div>
            </div>
        </div>
    </div>

    <!-- XP Progress Bar Panel -->
    <div class="rpg-panel rpg-xp-panel">
        <div class="rpg-panel-header">
            <h2 class="rpg-panel-title">📈 Experience & Progression</h2>
        </div>
        <div class="rpg-panel-body">
            <div class="rpg-xp-container">
                <div class="rpg-xp-info">
                    <label for="xp-current" class="rpg-xp-label">Current XP</label>
                    <div class="rpg-xp-values">
                        <input type="number" id="xp-current" class="rpg-xp-current-input" value="0" min="0" />
                        <span class="rpg-xp-divider">/</span>
                        <span class="rpg-xp-needed" id="xp-needed">100</span>
                    </div>
                </div>
                <div class="rpg-xp-progress-bar">
                    <div class="rpg-xp-progress-fill" id="rpg-xp-progress-fill" style="width: 0%;"></div>
                    <span class="rpg-xp-progress-text" id="rpg-xp-progress-text">0 / 100 XP</span>
                </div>
                <div class="rpg-xp-actions">
                    <button type="button" id="level-up-btn" class="rpg-level-up-btn" disabled>✨ Level Up</button>
                </div>
            </div>
        </div>
    </div>

    <!-- Quick Stats Grid Panel -->
    <div class="rpg-panel rpg-stats-panel">
        <div class="rpg-panel-header">
            <h2 class="rpg-panel-title">💰 Resources</h2>
        </div>
        <div class="rpg-panel-body">
            <div class="rpg-stats-grid">
                <div class="rpg-stat-card">
                    <label for="inkDrops" class="rpg-stat-icon">💧</label>
                    <div class="rpg-stat-content">
                        <label for="inkDrops" class="rpg-stat-label">Ink Drops</label>
                        <input type="number" id="inkDrops" class="rpg-stat-input" value="0" min="0" />
                    </div>
                </div>
                <div class="rpg-stat-card">
                    <label for="paperScraps" class="rpg-stat-icon">📄</label>
                    <div class="rpg-stat-content">
                        <label for="paperScraps" class="rpg-stat-label">Paper Scraps</label>
                        <input type="number" id="paperScraps" class="rpg-stat-input" value="0" min="0" />
                    </div>
                </div>
                <div class="rpg-stat-card">
                    <label for="dustyBlueprints" class="rpg-stat-icon">📜</label>
                    <div class="rpg-stat-content">
                        <label for="dustyBlueprints" class="rpg-stat-label">Blueprints</label>
                        <input type="number" id="dustyBlueprints" class="rpg-stat-input" value="0" min="0" />
                    </div>
                </div>
                <div class="rpg-stat-card">
                    <label for="smp" class="rpg-stat-icon">🎓</label>
                    <div class="rpg-stat-content">
                        <label for="smp" class="rpg-stat-label">SMP</label>
                        <input type="number" id="smp" class="rpg-stat-input" value="0" min="0" />
                    </div>
                </div>
            </div>
            <div id="currency-unsaved-warning" class="currency-warning" style="display: none;">
                <div class="warning-message">
                    <strong>⚠️ Warning:</strong> You have unsaved changes to your currency. Please save your character sheet before redeeming items on the <a href="{{ site.baseurl }}/shopping.html">Shopping</a> page to ensure your changes are preserved.
                </div>
            </div>
        </div>
    </div>

    <!-- Selected Genres Panel (used for Organize the Stacks / Genre selection) -->
    <div class="rpg-panel rpg-genres-panel">
        <div class="rpg-panel-header">
            <h2 class="rpg-panel-title">📚 Selected Genres</h2>
        </div>
        <div class="rpg-panel-body">
            <div id="selected-genres-display"></div>
        </div>
    </div>

</div>
<!-- END TAB 1: CHARACTER -->

<!-- TAB 2: ABILITIES -->
<div class="tab-panel" data-tab-panel="abilities" role="tabpanel">
    <!-- Character Benefits Panel -->
    <div class="rpg-panel rpg-benefits-panel">
        <div class="rpg-panel-header">
            <h2 class="rpg-panel-title">🔮 Character Benefits</h2>
        </div>
        <div class="rpg-panel-body">
            <div class="rpg-benefits-grid">
                <div class="rpg-benefit-card">
                    <div class="rpg-benefit-icon">📖</div>
                    <div class="rpg-benefit-content">
                        <h3 class="rpg-benefit-title">Keeper Background</h3>
                        <p id="keeperBackgroundDescriptionDisplay" class="rpg-benefit-description">-- Select a background to see its description --</p>
                        <div class="rpg-benefit-effect">
                            <strong>Benefit:</strong>
                            <p id="keeperBackgroundBenefitDisplay" class="rpg-benefit-text">-- Select a background to see its benefit --</p>
                        </div>
                    </div>
                </div>

                <div class="rpg-benefit-card">
                    <div class="rpg-benefit-icon">✨</div>
                    <div class="rpg-benefit-content">
                        <h3 class="rpg-benefit-title">Magical School</h3>
                        <p id="magicalSchoolDescriptionDisplay" class="rpg-benefit-description">-- Select a school to see its description --</p>
                        <div class="rpg-benefit-effect">
                            <strong>Benefit:</strong>
                            <p id="magicalSchoolBenefitDisplay" class="rpg-benefit-text">-- Select a school to see its benefit --</p>
                        </div>
                    </div>
                </div>

                <div class="rpg-benefit-card">
                    <div class="rpg-benefit-icon">🏛️</div>
                    <div class="rpg-benefit-content">
                        <h3 class="rpg-benefit-title">Library Sanctum</h3>
                        <p id="librarySanctumDescriptionDisplay" class="rpg-benefit-description">-- Select a sanctum to see its description --</p>
                        <div class="rpg-benefit-effect">
                            <strong>Benefit:</strong>
                            <p id="librarySanctumBenefitDisplay" class="rpg-benefit-text">-- Select a sanctum to see its benefit --</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Mastery Abilities Panel -->
    <div class="rpg-panel rpg-mastery-panel">
        <div class="rpg-panel-header">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                <div>
                    <h2 class="rpg-panel-title">🧙 School Mastery Abilities</h2>
                    <p class="rpg-panel-subtitle">Use your School Mastery Points (SMP) to learn new abilities. Your current SMP: <strong id="smp-display">0</strong></p>
                </div>
                <button type="button" id="open-school-mastery-btn" class="rpg-btn rpg-btn-secondary" title="View School Mastery Abilities Guide">📖 View Guide</button>
            </div>
        </div>
        <div class="rpg-panel-body">
            <div class="rpg-mastery-form">
                <div class="form-row">
                    <select id="ability-select" class="rpg-select">
                        <option value="">-- Select an ability to learn --</option>
                    </select>
                    <button type="button" id="learn-ability-button" class="rpg-btn rpg-btn-primary">Learn Ability</button>
                </div>
            </div>
            <div id="learned-abilities-list" class="rpg-abilities-grid">
            </div>
        </div>
    </div>

    <!-- Permanent Bonuses Panel -->
    <div class="rpg-panel rpg-bonuses-panel">
        <div class="rpg-panel-header">
            <h2 class="rpg-panel-title">🏆 Permanent Bonuses</h2>
            <p class="rpg-panel-subtitle">Bonuses unlocked through leveling up</p>
        </div>
        <div class="rpg-panel-body">
            <ul id="permanentBonusesList" class="rpg-bonuses-list">
                <li>-- No bonuses unlocked at this level --</li>
            </ul>
        </div>
    </div>
</div>
<!-- END TAB 2: ABILITIES -->

<!-- TAB 3: INVENTORY -->
<div class="tab-panel" data-tab-panel="inventory" role="tabpanel">
<div class="rpg-tab-content">
    <div class="rpg-panel rpg-slot-management-panel">
        <div class="rpg-panel-header">
            <h2 class="rpg-panel-title">⚔️ Equipment Slots</h2>
            <p class="rpg-panel-subtitle">Manage your available equipment slots</p>
        </div>
        <div class="rpg-panel-body">
            <div class="rpg-slot-grid">
                <div class="rpg-slot-item">
                    <label for="wearable-slots" class="rpg-slot-label">Wearable Slots</label>
                    <input type="number" id="wearable-slots" class="rpg-stat-input" value="1" min="0" max="9">
                </div>
                <div class="rpg-slot-item">
                    <label for="non-wearable-slots" class="rpg-slot-label">Non-Wearable Slots</label>
                    <input type="number" id="non-wearable-slots" class="rpg-stat-input" value="1" min="0" max="9">
                </div>
                <div class="rpg-slot-item">
                    <label for="familiar-slots" class="rpg-slot-label">Familiar Slots</label>
                    <input type="number" id="familiar-slots" class="rpg-stat-input" value="1" min="0" max="9">
                </div>
            </div>
        </div>
    </div>

    <div class="rpg-panel rpg-add-item-panel">
        <div class="rpg-panel-header">
            <h3 class="rpg-panel-title">📥 Add Item to Inventory</h3>
        </div>
        <div class="rpg-panel-body">
            <div class="form-row" style="gap: 12px; align-items: center;">
                <select id="item-select" class="rpg-select" style="flex: 1;">
                    <option value="">-- Select an item to add --</option>
                </select>
                <button type="button" id="add-item-button" class="rpg-btn rpg-btn-primary">Add Item</button>
            </div>
        </div>
    </div>

    <div class="rpg-panel rpg-equipped-panel">
        <div class="rpg-panel-header">
            <h3 class="rpg-panel-title" id="equipped-summary">⚡ Equipped Items (0/0 Slots Used)</h3>
        </div>
        <div class="rpg-panel-body">
            <div id="equipped-items-list" class="item-grid">
            </div>
        </div>
    </div>

    <div class="rpg-panel rpg-inventory-panel">
        <div class="rpg-panel-header">
            <h3 class="rpg-panel-title">📦 Inventory (Unequipped)</h3>
        </div>
        <div class="rpg-panel-body">
            <div id="inventory-list" class="item-grid">
            </div>
        </div>
    </div>

    <div class="rpg-panel rpg-passive-equipment-panel">
        <div class="rpg-panel-header">
            <h3 class="rpg-panel-title">🌟 Passive Equipment</h3>
            <p class="rpg-panel-subtitle">
                Items and familiars placed in passive slots provide half their normal bonus automatically. Complete restoration projects in the <a href="{{ site.baseurl }}/library.html">Library Restoration</a> to unlock passive slots.
            </p>
        </div>
        <div class="rpg-panel-body">
            <div class="rpg-passive-grid">
                <div class="rpg-passive-column">
                    <h4 class="rpg-passive-column-title">Display Slots</h4>
                    <div id="passive-item-slots-character-sheet" class="passive-slots-container">
                        <p class="no-slots-message">Complete restoration projects to unlock display slots.</p>
                    </div>
                </div>
                <div class="rpg-passive-column">
                    <h4 class="rpg-passive-column-title">Adoption Slots</h4>
                    <div id="passive-familiar-slots-character-sheet" class="passive-slots-container">
                        <p class="no-slots-message">Complete restoration projects to unlock adoption slots.</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
</div>
<!-- END TAB 3: INVENTORY -->

<!-- TAB 4: ENVIRONMENT -->
<div class="tab-panel" data-tab-panel="environment" role="tabpanel">
<div class="rpg-tab-content">
    <div class="rpg-panel rpg-environment-header-panel">
        <div class="rpg-panel-header">
            <h2 class="rpg-panel-title">🌿 Reading Environment</h2>
            <p class="rpg-panel-subtitle">Manage your temporary buffs and atmospheric conditions to enhance your reading experience. Future: Decorate your study to unlock permanent bonuses!</p>
        </div>
        <div class="rpg-panel-body">
            <div class="form-row" style="justify-content: center;">
                <button type="button" class="rpg-btn rpg-btn-secondary open-quest-info-drawer-btn" data-drawer="atmospheric-buffs">
                    ♦ View Atmospheric Buffs
                </button>
            </div>
        </div>
    </div>

    <div class="rpg-panel rpg-temporary-buffs-panel">
        <div class="rpg-panel-header">
            <h3 class="rpg-panel-title">✨ Active Temporary Buffs</h3>
            <p class="rpg-panel-subtitle"><strong>Remember:</strong> When you complete all dungeon rooms, open the Quests tab and click “♠ View Dungeons” to roll on the Dungeon Completion Rewards table. Some rewards are temporary buffs that will be automatically added.</p>
            <p class="rpg-panel-subtitle">Temporary buffs are automatically added when earned from side quests and dungeon rewards. Buffs last for the remainder of the current month and the next month unless otherwise specified. One-time buffs are consumed when used.</p>
        </div>
        <div class="rpg-panel-body">
            <div class="rpg-add-buff-form">
                <div class="form-row" style="gap: 12px; align-items: center;">
                    <select id="temp-buff-select" class="rpg-select" style="flex: 1;">
                        <option value="">-- Select a predefined buff --</option>
                    </select>
                    <button type="button" id="add-temp-buff-from-dropdown-button" class="rpg-btn rpg-btn-primary">Add Buff</button>
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
    </div>

    <div class="rpg-panel rpg-atmospheric-buffs-panel">
        <div class="rpg-panel-header">
            <h3 class="rpg-panel-title">♦️ Atmospheric Buffs</h3>
        </div>
        <div class="rpg-panel-body">
            <div id="room-visualization-container" class="room-visualization-wrapper" aria-hidden="true">
                <!-- Rendered by RoomVisualization.js -->
            </div>
            <div style="overflow-x: auto;">
                <table class="tracker-table" style="width: 100%; margin: 0 auto;">
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
            </div>
            <div class="form-row" style="margin-top: 20px; justify-content: center;">
                <button type="button" class="rpg-btn rpg-btn-primary end-of-month-button no-print">End of Month</button>
            </div>
        </div>
    </div>
</div>
</div>
<!-- END TAB 4: ENVIRONMENT -->

<!-- TAB 5: QUESTS -->
<div class="tab-panel" data-tab-panel="quests" role="tabpanel">
<div class="rpg-tab-content">
    <div class="rpg-panel rpg-monthly-tracker-panel">
        <div class="rpg-panel-header">
            <h2 class="rpg-panel-title">📅 Monthly Tracker</h2>
        </div>
        <div class="rpg-panel-body">

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

            <div class="rpg-monthly-stats">
                <div class="rpg-monthly-stat-item">
                    <label for="books-completed-month" class="rpg-monthly-stat-label">📚 Books Completed</label>
                    <input type="number" id="books-completed-month" class="rpg-stat-input" value="0" min="0" max="10" />
                </div>
                <div class="rpg-monthly-stat-item">
                    <label for="journal-entries-completed" class="rpg-monthly-stat-label">📝 Journal Entries</label>
                    <input type="number" id="journal-entries-completed" class="rpg-stat-input" value="0" min="0" />
                </div>
                <div class="rpg-monthly-stat-item">
                    <button type="button" class="rpg-btn rpg-btn-primary end-of-month-button no-print">End of Month</button>
                </div>
            </div>
            <p class="rpg-panel-subtitle" style="margin-top: 12px;">
                <strong>End of Month:</strong> Awards 15 XP per book completed, 5 Paper Scraps per journal entry (+3 for Scribe's Acolyte), processes atmospheric buffs, and resets all monthly counters.
            </p>
        </div>
    </div>

    <div class="rpg-panel rpg-quest-tables-panel">
        <div class="rpg-panel-header">
            <h3 class="rpg-panel-title">🎴 Quest Tables</h3>
        </div>
        <div class="rpg-panel-body">
            <div class="rpg-quest-table-buttons">
                <button type="button" class="rpg-btn rpg-btn-secondary open-quest-info-drawer-btn" data-drawer="genre-quests">
                    ♥ View Genre Quests
                </button>
                <button type="button" class="rpg-btn rpg-btn-secondary open-quest-info-drawer-btn" data-drawer="side-quests">
                    ♣ View Side Quests
                </button>
                <button type="button" class="rpg-btn rpg-btn-secondary open-quest-info-drawer-btn" data-drawer="dungeons">
                    ♠ View Dungeons
                </button>
            </div>
        </div>
    </div>

    <!-- Quest Card Draw Interface -->
    <div class="rpg-panel rpg-quest-card-draw-panel">
        <div class="rpg-panel-header">
            <h3 class="rpg-panel-title">🎴 Draw Quest Cards</h3>
        </div>
        <div class="rpg-panel-body">
            <div class="quest-deck-interface">
                <div class="deck-section">
                    <div class="deck-group">
                        <h4 class="deck-title">♦ Atmospheric Buffs</h4>
                        <div id="atmospheric-buff-deck-container" class="card-deck available"></div>
                    </div>
                    <div class="deck-group">
                        <h4 class="deck-title">♥ Genre Quests</h4>
                        <div id="genre-quest-deck-container" class="card-deck available"></div>
                    </div>
                    <div class="deck-group">
                        <h4 class="deck-title">♣ Side Quests</h4>
                        <div id="side-quest-deck-container" class="card-deck available"></div>
                    </div>
                    <div class="deck-group">
                        <h4 class="deck-title">♠ Dungeon Rooms</h4>
                        <div id="room-deck-container" class="card-deck available"></div>
                        <div id="encounter-deck-container" class="card-deck available" style="display: none;"></div>
                    </div>
                </div>
                
                <!-- Drawn Cards Display -->
                <div class="drawn-cards-section">
                    <div id="atmospheric-buff-drawn-card-display" class="drawn-card-area"></div>
                    <div id="genre-quest-drawn-card-display" class="drawn-card-area"></div>
                    <div id="side-quest-drawn-card-display" class="drawn-card-area"></div>
                    <div id="drawn-card-display" class="drawn-card-area"></div>
                </div>
                
                <!-- Action Buttons (shared for all deck types) -->
                <div class="deck-actions">
                    <button type="button" id="add-selected-cards-btn" class="rpg-btn rpg-btn-primary">Add selected</button>
                    <button type="button" id="clear-drawn-cards-btn" class="rpg-btn rpg-btn-secondary">Clear draw</button>
                </div>
            </div>
        </div>
    </div>

    <div class="rpg-panel rpg-add-quest-panel">
        <div class="rpg-panel-header">
            <h3 class="rpg-panel-title">➕ Add Quest</h3>
        </div>
        <div class="rpg-panel-body">
            <div class="add-quest-form">
            <div class="form-row">
                <select id="quest-month">
                    <option value="">-- Select Month --</option>
                    <option value="January">January</option>
                    <option value="February">February</option>
                    <option value="March">March</option>
                    <option value="April">April</option>
                    <option value="May">May</option>
                    <option value="June">June</option>
                    <option value="July">July</option>
                    <option value="August">August</option>
                    <option value="September">September</option>
                    <option value="October">October</option>
                    <option value="November">November</option>
                    <option value="December">December</option>
                </select>
                <select id="quest-year">
                    <option value="">-- Select Year --</option>
                </select>
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
                <textarea id="new-quest-notes" placeholder="Notes (optional)" rows="5"></textarea>
            </div>
            <div class="form-row">
                <label style="display: block; margin-bottom: 10px;"><strong>Applicable Buffs & Items:</strong></label>
                <div id="quest-bonus-selection-container" class="quest-bonus-selection-container">
                    <p class="no-bonuses-message" style="color: #8a7a61; font-style: italic; padding: 20px; text-align: center;">No bonuses available. Equip items or activate buffs to see them here.</p>
                </div>
                <input type="hidden" id="quest-buffs-select" />
            </div>
            <div class="form-row">
                <button type="button" id="add-quest-button">Add Quest</button>
                <button type="button" id="cancel-edit-quest-button" style="display: none;">Cancel</button>
            </div>
            </div>
        </div>
    </div>

    <div class="rpg-panel rpg-active-quests-panel" id="active-assignments-container">
        <div class="rpg-panel-header">
            <h3 class="rpg-panel-title" id="active-summary">⚡ Active Book Assignments</h3>
        </div>
        <div class="rpg-panel-body">
            <div class="quest-cards-container"></div>
        </div>
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
            <div class="completed-quests-sections">
                <!-- Dungeon Section -->
                <div class="dungeon-archive-section">
                    <h4>Dungeon Rooms</h4>
                    <div id="dungeon-rooms-archive-container" class="dungeon-archive-cards-grid"></div>
                </div>
                
                <div class="dungeon-archive-section">
                    <h4>Dungeon Encounters</h4>
                    <div id="dungeon-encounters-archive-container" class="dungeon-archive-cards-grid"></div>
                </div>
                
                <!-- Genre Quests Section -->
                <div class="dungeon-archive-section">
                    <h4>Organize the Stacks (Genre Quests)</h4>
                    <div id="genre-quests-archive-container" class="dungeon-archive-cards-grid"></div>
                </div>
                
                <!-- Side Quests Section -->
                <div class="dungeon-archive-section">
                    <h4>Side Quests</h4>
                    <div id="side-quests-archive-container" class="dungeon-archive-cards-grid"></div>
                </div>
                
                <!-- Other Quests Section -->
                <div class="other-quests-section">
                    <h4>Other Quests</h4>
                    <div class="quest-cards-container"></div>
                </div>
            </div>
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

<!-- Table Overlay Panels -->
<div id="table-overlay-backdrop" class="table-overlay-backdrop"></div>
<div id="table-overlay-panel" class="table-overlay-panel" style="display: none;">
    <button class="close-table-overlay-btn" id="close-table-overlay" aria-label="Close table overlay">&times;</button>
    <div id="table-overlay-content">
        <!-- Table content will be rendered here -->
    </div>
</div>

<!-- Quest Edit Drawer -->
<!-- Leveling Rewards Drawer -->
<div id="leveling-rewards-backdrop" class="info-drawer-backdrop"></div>
<div id="leveling-rewards-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>📈 Leveling Up & Rewards</h2>
        <button class="close-info-drawer-btn" id="close-leveling-rewards" aria-label="Close leveling rewards drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>This document details the Leveling Up & Class Customization expansion for The Tome of Secrets. As the Keeper gains experience, they unlock permanent bonuses and gain School Mastery Points (SMP) to acquire powerful abilities tied to their chosen Magical School.</p>
            
            <h3>Leveling Up Rewards (Levels 1–20)</h3>
            <p>Upon reaching a new level, the Keeper gains the rewards listed in the table below. Permanent Bonuses are gained at levels 3, 6, 7, and 9, and are detailed in the "Permanent Bonuses" section further down.</p>
            
            <div id="leveling-rewards-table" class="tracker-table-container"></div>
            
            <h3>Permanent Bonuses</h3>
            <p>As you level up, you unlock the following permanent abilities at the specified levels.</p>
            
            <div id="permanent-bonuses-table"></div>
        </div>
    </div>
</div>

<!-- School Mastery Abilities Drawer -->
<div id="school-mastery-backdrop" class="info-drawer-backdrop"></div>
<div id="school-mastery-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>🧙 School Mastery Abilities</h2>
        <button class="close-info-drawer-btn" id="close-school-mastery" aria-label="Close school mastery drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>Use a School Mastery Point (SMP) to acquire a new, permanent ability from your chosen school. Once you have acquired both abilities from your primary school, you may spend future SMPs to acquire the first ability (costing 1 SMP) from any other Magical School (Multiclassing).</p>
            
            <div id="school-mastery-abilities-content"></div>
        </div>
    </div>
</div>

<!-- Genre Quests Info Drawer -->
<div id="genre-quests-backdrop" class="info-drawer-backdrop"></div>
<div id="genre-quests-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>♥ Organize the Stacks (Roll a die)</h2>
        <button class="close-info-drawer-btn" id="close-genre-quests" aria-label="Close genre quests drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>Completing an Organize the Stacks quest rewards you with <strong>+15 XP</strong> and <strong>+10 Ink Drops</strong></p>
            
            <blockquote>
                <p><strong>Note:</strong> Genre selection for "Organize the Stacks" quests has been moved to the Character Sheet. Open the Character Sheet and go to the Quests tab, then click "View Genre Quests Table" to select your genres.</p>
            </blockquote>
            
            <h3>Journaling: Organize the Stacks</h3>
            
            <p>These quests represent the routine duties of a Keeper. You are maintaining your Sanctum, sorting chaotic shelves, discovering lost wings, or simply performing slice-of-life maintenance tasks to keep the magic from overflowing.</p>
            
            <ul>
                <li><strong>The Mess:</strong> Why was this section of the library in disarray? How do you go about removing the shroud in this area? Are the books static or do they inexplicably move around?</li>
                <li><strong>The Discovery:</strong> Did you find anything unexpected tucked between the pages while cleaning? Did a certain book call to you as you went about your task?</li>
            </ul>
            
            <div id="genre-quests-table-container"></div>
        </div>
    </div>
</div>

<!-- Atmospheric Buffs Info Drawer -->
<div id="atmospheric-buffs-info-backdrop" class="info-drawer-backdrop"></div>
<div id="atmospheric-buffs-info-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>♦ Atmospheric Buffs (Roll a d8)</h2>
        <button class="close-info-drawer-btn" id="close-atmospheric-buffs-info" aria-label="Close atmospheric buffs drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>These buffs are daily bonuses. Once per day, when you set a mood for reading, you can earn +1 Ink Drop.</p>
            
            <h3>Journaling: Atmospheric Buffs</h3>
            
            <p>These entries focus on the sensory experience of the Library. The Grand Library is an organism with its own weather, moods, and shifts. These entries are about how it feels to exist within the walls.</p>
            
            <ul>
                <li><strong>The Senses:</strong> How did this atmospheric change affect your senses? What did the air smell like? Did the warmth of the hearth drive off the winter cold?</li>
                <li><strong>The Memory:</strong> Did the atmosphere trigger a memory for your Keeper?</li>
                <li><strong>The Effect:</strong> Did the atmosphere make your task harder or easier?</li>
            </ul>
            
            <div id="atmospheric-buffs-table-container"></div>
        </div>
    </div>
</div>

<!-- Side Quests Info Drawer -->
<div id="side-quests-info-backdrop" class="info-drawer-backdrop"></div>
<div id="side-quests-info-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>♣ Side Quests (Roll a d8)</h2>
        <button class="close-info-drawer-btn" id="close-side-quests-info" aria-label="Close side quests drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>Completing a side quest rewards you with a magical item or a bonus.</p>
            
            <p><strong>Note:</strong> If you roll a side quest that you have already completed (grayed out in the table below), you may roll again.</p>
            
            <h3>Journaling: Side Quests</h3>
            
            <p>These involve interactions with the Library's denizens. You are not alone here; there are ghosts, lost students, magical portraits, and other entities that require your aid.</p>
            
            <ul>
                <li><strong>The Encounter:</strong> Who or what did you encounter in the stacks? What problem were they facing or what do they want you to do?</li>
                <li><strong>The Result:</strong> How does the book and prompt tie into the encounter? Did the interaction change your relationship with the library? Did you gain a new ally or put a spirit to rest?</li>
            </ul>
            
            <div id="side-quests-table-container"></div>
        </div>
    </div>
</div>

<!-- Dungeons Info Drawer -->
<div id="dungeons-info-backdrop" class="info-drawer-backdrop"></div>
<div id="dungeons-info-drawer" class="info-drawer" style="display: none;">
    <div class="info-drawer-header">
        <h2>♠ Dungeon Rooms (Roll a d20)</h2>
        <button class="close-info-drawer-btn" id="close-dungeons-info" aria-label="Close dungeons drawer">&times;</button>
    </div>
    <div class="info-drawer-body">
        <div class="info-drawer-content">
            <p>Draw cards to determine your dungeon room and encounter. Each room offers a narrative challenge and encounter. Complete both to earn the rewards for the room. Complete all dungeon rooms to be able to roll on the <a href="#dungeon-completion-rewards">Dungeon Completion Rewards</a> table. Each room belongs to a wing of the library—explore the <a href="{{ site.baseurl }}/library.html">Library Restoration</a> page to see how your progress unlocks restoration projects.</p>
            
            <p><strong>Note:</strong> Rooms stay in the deck until all encounters are completed. If you have only completed one encounter in a room, you may draw from that room again to complete the remaining encounters.</p>
            
            <h3>Journaling: Dungeon Crawls</h3>
            
            <p>These are the high-stakes moments of your story. You are venturing into dangerous, unchecked parts of the library to face hostile magical threats. You must weave together the Room, the Creature, and the Book into a narrative.</p>
            
            <ul>
                <li><strong>The Setting:</strong> Describe the room. What made it dangerous or unique? How did the room's mechanics physically manifest around you?</li>
                <li><strong>The Encounter:</strong> How did the creature appear? Did it crawl out of a book? Did it form from the shadows? Was it friendly or confrontational? What elements of the book impacted the encounter? How did fulfilling the specific prompt translate into something useful for dealing with the creature?</li>
            </ul>
            
            <h3>Dungeon Rewards & Penalties</h3>
            <div id="dungeon-rewards-table-container"></div>
            
            <br>
            
            <div id="dungeon-rooms-table-container"></div>
            
            <h3 id="dungeon-completion-rewards">♠ Dungeon Completion Rewards</h3>
            <p>Complete a dungeon room and click "Claim Reward" above to earn a draw. You have <strong><span id="dungeon-completion-draws-available">0</span></strong> draw(s) to use.</p>
            <div class="form-row" style="margin-bottom: 12px;">
                <button type="button" id="draw-dungeon-completion-card-btn" class="rpg-btn rpg-btn-primary">Draw item</button>
            </div>
            <div id="dungeon-completion-drawn-card-container" style="min-height: 0; margin-bottom: 12px;"></div>
            <div id="dungeon-completion-rewards-table-container"></div>
        </div>
    </div>
</div>

<div id="quest-edit-backdrop" class="quest-edit-backdrop"></div>
<div id="quest-edit-drawer" class="quest-edit-drawer" style="display: none;">
    <div class="quest-edit-header">
        <h2 id="quest-edit-header-title">Editing Quest</h2>
        <button class="close-quest-edit-btn" id="close-quest-edit" aria-label="Close quest edit drawer">&times;</button>
    </div>
    <div class="quest-edit-body">
        <form id="quest-edit-form">
            <div class="form-row">
                <label for="edit-quest-month"><strong>Month:</strong></label>
                <select id="edit-quest-month">
                    <option value="">-- Select Month --</option>
                    <option value="January">January</option>
                    <option value="February">February</option>
                    <option value="March">March</option>
                    <option value="April">April</option>
                    <option value="May">May</option>
                    <option value="June">June</option>
                    <option value="July">July</option>
                    <option value="August">August</option>
                    <option value="September">September</option>
                    <option value="October">October</option>
                    <option value="November">November</option>
                    <option value="December">December</option>
                </select>
            </div>
            <div class="form-row">
                <label for="edit-quest-year"><strong>Year:</strong></label>
                <select id="edit-quest-year">
                    <option value="">-- Select Year --</option>
                </select>
            </div>
            <div class="form-row">
                <label for="edit-quest-type"><strong>Quest Type:</strong></label>
                <select id="edit-quest-type" disabled>
                    <option value="">-- Quest Type --</option>
                    <option value="♠ Dungeon Crawl">♠ Dungeon Crawl</option>
                    <option value="♣ Side Quest">♣ Side Quest</option>
                    <option value="♥ Organize the Stacks">♥ Organize the Stacks</option>
                    <option value="🔨 Restoration Project">🔨 Restoration Project</option>
                    <option value="⭐ Extra Credit">⭐ Extra Credit</option>
                </select>
            </div>
            <div class="form-row">
                <label><strong>Status:</strong></label>
                <span id="edit-quest-status-display" class="quest-status-badge"></span>
            </div>
            <div id="edit-quest-prompt-section" class="quest-edit-section">
                <label><strong>Prompt:</strong></label>
                <div id="edit-quest-prompt-display" class="quest-prompt-display"></div>
            </div>
            <div class="form-row">
                <label for="edit-quest-book"><strong>Book Title:</strong></label>
                <input type="text" id="edit-quest-book" placeholder="Book Title">
            </div>
            <div class="form-row">
                <label for="edit-quest-book-author"><strong>Book Author (optional):</strong></label>
                <input type="text" id="edit-quest-book-author" placeholder="Book Author">
            </div>
            <div class="form-row">
                <label for="edit-quest-notes"><strong>Notes (optional):</strong></label>
                <textarea id="edit-quest-notes" placeholder="Notes" rows="5"></textarea>
            </div>
            <div class="form-row">
                <label style="display: block; margin-bottom: 10px;"><strong>Applicable Buffs & Items:</strong></label>
                <div id="edit-quest-bonus-selection-container" class="quest-bonus-selection-container">
                    <p class="no-bonuses-message" style="color: #8a7a61; font-style: italic; padding: 20px; text-align: center;">No bonuses available. Equip items or activate buffs to see them here.</p>
                </div>
                <input type="hidden" id="edit-quest-buffs-select" />
            </div>
            <div class="quest-edit-actions">
                <button type="button" id="save-quest-changes-btn" class="save-quest-btn">Save Changes</button>
                <button type="button" id="cancel-quest-edit-btn" class="cancel-quest-btn">Cancel</button>
            </div>
        </form>
    </div>
</div>


    <div class="form-buttons no-print">
    <button type="submit">Save Character Info</button>
    <button type="button" id="print-button">Print</button>
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
