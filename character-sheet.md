---
layout: default
title: Keeper's Character Sheet
---

<form id="character-sheet">
    <h2>👤 Character Information</h2>
    <ul>
        <li><strong>Keeper Name:</strong> <input type="text" id="keeperName" /></li>
        <li><strong>🌟 Level:</strong> <input type="number" id="level" /></li>
        <li><strong>✨ Wizard School:</strong> <input type="text" id="wizardSchool" /></li>
        <li><strong>🏛️ Library Sanctum:</strong> <input type="text" id="librarySanctum" /></li>
    </ul>

    <h2>📈 Resources & Progression</h2>
    <ul>
        <li><strong>Experience Points (XP):</strong> <input type="text" id="xp" placeholder="Current / To Next Level" /></li>
        <li><strong>💧 Ink Drops:</strong> <input type="number" id="inkDrops" /></li>
        <li><strong>📄 Paper Scraps:</strong> <input type="number" id="paperScraps" /></li>
        <li><strong>🎓 School Mastery Points (SMP):</strong> <input type="number" id="smp" /></li>
    </ul>

    <h2>🔮 Abilities & Benefits</h2>
    <div>
        <h3>✨ Magical School Benefit</h3>
        <textarea id="magicalSchoolBenefit" placeholder="Write your chosen school's starting benefit here"></textarea>
    </div>
    <div>
        <h3>🏛️ Library Sanctum Benefit</h3>
        <textarea id="librarySanctumBenefit" placeholder="Write your chosen sanctum's benefit and its associated buffs here"></textarea>
    </div>
    <div>
        <h3>🏆 Permanent Bonuses (from Leveling)</h3>
        <textarea id="permanentBonuses" placeholder="Note bonuses as you unlock them"></textarea>
    </div>
    <div>
        <h3>🧙 School Mastery Abilities</h3>
        <textarea id="schoolMasteryAbilities" placeholder="List abilities acquired by spending SMP"></textarea>
    </div>

    <h2>🎒 Keeper's Loadout & Inventory</h2>
    <div>
        <h3>Equipped Items</h3>
        <ul>
            <li><strong>👕 Wearable Slot:</strong> <input type="text" id="wearableSlot" /></li>
            <li><strong>🗝️ Non-Wearable Slot:</strong> <input type="text" id="nonWearableSlot" /></li>
            <li><strong>🐾 Familiar Slot:</strong> <input type="text" id="familiarSlot" /></li>
        </ul>
    </div>
    <div>
        <h3>📦 Unequipped Items & Familiars (Inventory)</h3>
        <textarea id="unequippedItems" placeholder="Magical Items, Befriended Familiars"></textarea>
    </div>

    <h2>📅 Monthly Tracker</h2>
    <div>
        <h3>Current Month & Year:</h3>
        <input type="text" id="currentMonthYear" />
    </div>
    <div>
        <h3>🃏 Monthly Quest Pool</h3>
        <textarea id="monthlyQuestPool" placeholder="List your card draws and results here"></textarea>
    </div>
    <div>
        <h3>🕯️ Active Atmospheric Buffs</h3>
        <textarea id="activeAtmosphericBuffs" placeholder="List your drawn atmospheric buffs here"></textarea>
    </div>
    <div>
        <h3>💀 The Shroud's Curse</h3>
        <strong>Current Worn Pages:</strong> <input type="number" id="wornPages" />
        <textarea id="shroudCurse" placeholder="Track penalties from uncompleted quests"></textarea>
    </div>

    <div class="no-print">
      <button type="submit">Save</button>
      <button type="button" id="print-button">Print</button>
    </div>
</form>