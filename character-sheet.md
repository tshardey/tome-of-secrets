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
                    <label for="smp"><strong>🎓 School Mastery Points (SMP):</strong></label>
                    <input type="number" id="smp" />
                </div>
            </li>
        </ul>
    </div>

    <div class="form-section">
    <h2>🔮 Abilities & Benefits</h2>

    <div class="benefit-display">
        <h3>✨ Magical School Benefit</h3>
        <p id="magicalSchoolBenefitDisplay">-- Select a school to see its benefit --</p>
    </div>

    <div class="benefit-display">
        <h3>🏛️ Library Sanctum Benefit</h3>
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

    <div>
        <label for="permanentBonuses"><h3>🏆 Permanent Bonuses (from Leveling)</h3></label>
        <textarea id="permanentBonuses" placeholder="Note bonuses as you unlock them, e.g., Atmospheric Forecaster, Novice's Focus..."></textarea>
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

        <div class="add-quest-form">
            <div class="form-row">
                <select id="new-quest-status">
                    <option value="active">Active Assignment</option>
                    <option value="completed">Completed Quest</option>
                </select>
                <select id="new-quest-type">
                    <option value="">-- Quest Type --</option>
                    <option value="♠ Dungeon Crawl">♠ Dungeon Crawl</option> <option value="♣ Side Quest">♣ Side Quest</option> <option value="♥ Genre Quest">♥ Genre Quest</option> <option value="♦ Atmospheric Buff">♦ Atmospheric Buff</option> </select>
                <input type="text" id="new-quest-prompt" placeholder="Prompt Name">
            </div>
            <div class="form-row">
                <input type="text" id="new-quest-book" placeholder="Book Title">
                <input type="text" id="new-quest-notes" placeholder="Notes / Reward Earned">
            </div>
            <div class="form-row">
                <button type="button" id="add-quest-button">Add Quest</button>
            </div>
        </div>

        <div id="active-assignments-container">
            <h3 id="active-summary">Active Book Assignments</h3>
            <table class="tracker-table">
                <thead>
                    <tr>
                        <th>Quest Type</th>
                        <th>Prompt</th>
                        <th>Book Title</th>
                        <th>Notes</th>
                        <th class="no-print">Action</th>
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
                        <th>Quest Type</th>
                        <th>Prompt</th>
                        <th>Book Title</th>
                        <th>Reward Earned</th>
                        <th class="no-print">Action</th>
                    </tr>
                </thead>
                <tbody id="completed-quests-body">
                    </tbody>
            </table>
        </div>
    </div>

    <div class="form-buttons no-print">
    <button type="submit">Save Character Info</button>
    <button type="button" id="print-button">Print</button>
    </div>
</form>