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
            <li><label for="xp"><strong>Experience Points (XP):</strong></label> <input type="text" id="xp" placeholder="Current / To Next Level" /></li>
            <li><label for="inkDrops"><strong>💧 Ink Drops:</strong></label> <input type="number" id="inkDrops" /></li>
            <li><label for="paperScraps"><strong>📄 Paper Scraps:</strong></label> <input type="number" id="paperScraps" /></li>
            <li><label for="smp"><strong>🎓 School Mastery Points (SMP):</strong></label> <input type="number" id="smp" /></li>
        </ul>
    </div>

    <div class="form-section">
        <h2>🔮 Abilities & Benefits</h2>
        <label for="magicalSchoolBenefit"><h3>✨ Magical School Benefit</h3></label>
        <textarea id="magicalSchoolBenefit" placeholder="Write your chosen school's starting benefit here"></textarea>

        <label for="librarySanctumBenefit"><h3>🏛️ Library Sanctum Benefit</h3></label>
        <textarea id="librarySanctumBenefit" placeholder="Write your chosen sanctum's benefit and its associated buffs here"></textarea>

        <label for="permanentBonuses"><h3>🏆 Permanent Bonuses (from Leveling)</h3></label>
        <textarea id="permanentBonuses" placeholder="Note bonuses as you unlock them"></textarea>

        <label for="schoolMasteryAbilities"><h3>🧙 School Mastery Abilities</h3></label>
        <textarea id="schoolMasteryAbilities" placeholder="List abilities acquired by spending SMP"></textarea>
    </div>
    
    <div class="form-section">
        <h2>🎒 Keeper's Loadout & Inventory</h2>
        <h3>Equipped Items</h3>
        <ul class="form-list">
            <li><label for="wearableSlot"><strong>👕 Wearable Slot:</strong></label> <input type="text" id="wearableSlot" /></li>
            <li><label for="nonWearableSlot"><strong>🗝️ Non-Wearable Slot:</strong></label> <input type="text" id="nonWearableSlot" /></li>
            <li><label for="familiarSlot"><strong>🐾 Familiar Slot:</strong></label> <input type="text" id="familiarSlot" /></li>
        </ul>
        <label for="unequippedItems"><h3>📦 Unequipped Items & Familiars (Inventory)</h3></label>
        <textarea id="unequippedItems" placeholder="Magical Items, Befriended Familiars"></textarea>
    </div>

    <div class="form-section">
        <h2>📅 Monthly Tracker</h2>
        <label for="currentMonthYear"><h3>Current Month & Year:</h3></label>
        <input type="text" id="currentMonthYear" class="full-width-input" />

        <label for="monthlyQuestPool"><h3>🃏 Monthly Quest Pool</h3></label>
        <textarea id="monthlyQuestPool" placeholder="List your card draws and results here"></textarea>

        <label for="activeAtmosphericBuffs"><h3>🕯️ Active Atmospheric Buffs</h3></label>
        <textarea id="activeAtmosphericBuffs" placeholder="List your drawn atmospheric buffs here"></textarea>

        <label for="shroudCurse"><h3>💀 The Shroud's Curse</h3></label>
        <ul class="form-list">
             <li><label for="wornPages"><strong>Current Worn Pages:</strong></label> <input type="number" id="wornPages" /></li>
        </ul>
        <textarea id="shroudCurse" placeholder="Track penalties from uncompleted quests"></textarea>
    </div>

    <div class="form-buttons no-print">
      <button type="submit">Save</button>
      <button type="button" id="print-button">Print</button>
    </div>
</form>