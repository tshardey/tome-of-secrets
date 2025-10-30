---
layout: default
title: Keeper's Character Sheet
---

<form id="character-sheet">
    <div class="form-section">
        <h2>👤 Character Information</h2>
        <ul class="form-list">
            <li><label for="keeperName"><strong>Keeper Name:</strong></label> <input type="text" id="keeperName" /></li>
            <li><label for="level"><strong>🌟 Level:</strong></label> <input type="number" id="level" /></li>
            <li>
                <label for="wizardSchool"><strong>✨ Wizard School:</strong></label>
                <select id="wizardSchool">
                    <option value="">-- Select a School --</option>
                    <option value="Abjuration">Abjuration</option> <option value="Divination">Divination</option> <option value="Evocation">Evocation</option> <option value="Enchantment">Enchantment</option> <option value="Conjuration">Conjuration</option> <option value="Transmutation">Transmutation</option> </select>
            </li>
            <li>
                <label for="librarySanctum"><strong>🏛️ Library Sanctum:</strong></label>
                <select id="librarySanctum">
                    <option value="">-- Select a Sanctum --</option>
                    <option value="The Spire of Whispers">The Spire of Whispers</option> <option value="The Verdant Athenaeum">The Verdant Athenaeum</option> <option value="The Sunken Archives">The Sunken Archives</option> </select>
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
                    <label for="smp"><strong>🎓 SMP:</strong></label>
                    <input type="number" id="smp" />
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

    <div class="form-section">
    <h2>🔮 Abilities & Benefits</h2>

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
</div>

    <div class="form-section">
        <h2>📅 Monthly Tracker</h2>

        <div class="form-row" style="margin-bottom: 20px; display: flex; gap: 20px;">
            <label for="books-completed-month" style="display: flex; align-items: center; gap: 10px;">
                <strong>📚 Books Completed This Month:</strong>
                <input type="number" id="books-completed-month" value="0" min="0" style="width: 80px;" />
            </label>
            <label for="journal-entries-completed" style="display: flex; align-items: center; gap: 10px;">
                <strong>📝 Journal Entries Completed:</strong>
                <input type="number" id="journal-entries-completed" value="0" min="0" style="width: 80px;" />
            </label>
        </div>

        <div id="temporary-buffs-container">
            <h3>✨ Active Temporary Buffs</h3>
            <p class="description">Temporary buffs are automatically added when earned from side quests and dungeon rewards. Buffs last for the remainder of the current month and the next month unless otherwise specified. One-time buffs are consumed when used.</p>
            
            <div class="add-temp-buff-form">
                <h4>Add Custom Buff (Optional)</h4>
                <div class="form-row">
                    <input type="text" id="temp-buff-name" placeholder="Buff Name">
                    <input type="text" id="temp-buff-description" placeholder="Buff Effect Description">
                    <select id="temp-buff-duration">
                        <option value="two-months">Two Months (Current + Next)</option>
                        <option value="one-time">One-Time Use</option>
                        <option value="until-end-month">Until End of Month</option>
                    </select>
                    <button type="button" id="add-temp-buff-button">Add Custom Buff</button>
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
                <button type="button" id="end-of-month-button" class="no-print">End of Month</button>
            </div>
        </div>

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
                    <option value="♠ Dungeon Crawl">♠ Dungeon Crawl</option> <option value="♣ Side Quest">♣ Side Quest</option> <option value="♥ Organize the Stacks">♥ Organize the Stacks</option> </select>
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
            </div>
            <div class="form-row">
                <input type="text" id="new-quest-book" placeholder="Book Title">
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
            <table class="tracker-table">
                <thead>
                    <tr>
                        <th class="col-month">Month</th>
                        <th class="col-year">Year</th>
                        <th class="col-quest-type">Quest Type</th>
                        <th class="col-prompt">Prompt</th>
                        <th class="col-book-title">Book Title</th>
                        <th colspan="4" class="col-rewards-header">Rewards</th>
                        <th class="col-buffs">Buffs/Items</th>
                        <th class="col-notes">Notes</th>
                        <th class="col-action no-print">Action</th>
                    </tr>
                    <tr class="rewards-subheader">
                        <th colspan="5"></th>
                        <th class="col-xp">XP</th>
                        <th class="col-paper-scraps">📄</th>
                        <th class="col-ink-drops">💧</th>
                        <th class="col-items">Items</th>
                        <th colspan="3"></th>
                    </tr>
                </thead>
                <tbody id="active-assignments-body">
</tbody>
            </table>
        </div>

        <div id="completed-quests-container">
            <h3 id="completed-summary">Completed Quests</h3>
            <table class="tracker-table">
                <thead>
                    <tr>
                        <th class="col-month">Month</th>
                        <th class="col-year">Year</th>
                        <th class="col-quest-type">Quest Type</th>
                        <th class="col-prompt">Prompt</th>
                        <th class="col-book-title">Book Title</th>
                        <th colspan="4" class="col-rewards-header">Rewards</th>
                        <th class="col-buffs">Buffs/Items</th>
                        <th class="col-notes">Notes</th>
                        <th class="col-action no-print">Action</th>
                    </tr>
                    <tr class="rewards-subheader">
                        <th colspan="5"></th>
                        <th class="col-xp">XP</th>
                        <th class="col-paper-scraps">📄</th>
                        <th class="col-ink-drops">💧</th>
                        <th class="col-items">Items</th>
                        <th colspan="3"></th>
                    </tr>
                </thead>
                <tbody id="completed-quests-body">
                    </tbody>
            </table>
        </div>

        <div id="discarded-quests-container">
            <h3 id="discarded-summary">Discarded Quests</h3>
            <table class="tracker-table">
                <thead>
                    <tr>
                        <th class="col-month">Month</th>
                        <th class="col-year">Year</th>
                        <th class="col-quest-type">Quest Type</th>
                        <th class="col-prompt">Prompt</th>
                        <th class="col-book-title">Book Title</th>
                        <th colspan="4" class="col-rewards-header">Rewards</th>
                        <th class="col-buffs">Buffs/Items</th>
                        <th class="col-notes">Notes</th>
                        <th class="col-action no-print">Action</th>
                    </tr>
                    <tr class="rewards-subheader">
                        <th colspan="5"></th>
                        <th class="col-xp">XP</th>
                        <th class="col-paper-scraps">📄</th>
                        <th class="col-ink-drops">💧</th>
                        <th class="col-items">Items</th>
                        <th colspan="3"></th>
                    </tr>
                </thead>
                <tbody id="discarded-quests-body">
                    </tbody>
            </table>
        </div>
    </div>

    <div class="form-section">
        <h2>📜 The Shroud's Curse</h2>
        <p class="description">When you fail to complete your monthly quest pool, the Shroud advances and you receive a Worn Page penalty for each book you missed. For each Worn Page you have, roll on the Curse Table at the start of your next month's quest.</p>
        
        <div class="add-curse-form">
            <h3>Add Curse Penalty</h3>
            <div class="form-row">
                <select id="curse-penalty-select">
                    <option value="">-- Select Curse Penalty --</option>
                    <option value="The Unread Tome">1. The Unread Tome</option>
                    <option value="The Lost Lore">2. The Lost Lore</option>
                    <option value="The Forgotten Pages">3. The Forgotten Pages</option>
                    <option value="The Ravenous Shadow">4. The Ravenous Shadow</option>
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

    <div class="form-buttons no-print">
    <button type="submit">Save Character Info</button>
    <button type="button" id="print-button">Print</button>
    </div>
</form>
