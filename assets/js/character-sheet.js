document.addEventListener('DOMContentLoaded', function() {
    // --- DATABASES ---
    const allItems = { /* ... existing item database ... */ };
    
    const schoolBenefits = {
        "Abjuration": "Once per month, when you would gain a Worn Page penalty, you may instead draw a card from the deck and choose a quest from that draw to complete.", //
        "Divination": "Once per month, you may roll 2 dice instead of 1 for a Monthly Quest, and choose which result you want to use.", //
        "Evocation": "Once per month, when battling a monster in a dungeon, you may choose to defeat it quickly by reading a short story or novella instead of a novel.", //
        "Enchantment": "When you befriend a monster in a dungeon, you earn 1.5x the base XP for that quest.", //
        "Conjuration": "When you complete a quest while your Familiar slot is equipped, you gain an additional +5 Ink Drops for each quest.", //
        "Transmutation": "Once per month, you may transmute your currency. You can exchange 5 Ink Drops for 1 Paper Scrap, or 1 Paper Scrap for 5 Ink Drops." //
    };

    const sanctumBenefits = {
        "The Spire of Whispers": "Associated Buffs: Candle-lit Study, Cozy Hearth, Head in the Clouds. (Earn x2 Ink Drops from these buffs)", //
        "The Verdant Athenaeum": "Associated Buffs: Herbalist's Nook, Soaking in Nature, Soundscape Spire. (Earn x2 Ink Drops from these buffs)", //
        "The Sunken Archives": "Associated Buffs: Soundscape Spire, Wanderer's Path, Excavation. (Earn x2 Ink Drops from these buffs)" //
    };

    const masteryAbilities = {
        "Ward Against the Shroud": { school: "Abjuration", cost: 1, benefit: "Once per month, when you would gain a Worn Page penalty for an uncompleted quest, you may choose to completely negate it." }, //
        "Grand Dispelling": { school: "Abjuration", cost: 2, benefit: "Once per month, you may perform a powerful cleansing ritual. Remove all active Worn Page penalties you currently have." }, //
        "Flicker of Prophecy": { school: "Divination", cost: 1, benefit: "When rolling a d6 for a Genre Quest, you may choose to treat the result as one number higher or lower (e.g., a 2 can become a 1 or a 3)." }, //
        "Master of Fates": { school: "Divination", cost: 2, benefit: "Once per month, when establishing your Monthly Quest Pool, you may draw two additional cards." }, //
        "Quick Shot": { school: "Evocation", cost: 1, benefit: "The benefit of Evocation may now be used to complete any single dungeon room challenge with a short story, not just a monster encounter." }, //
        "Concussive Blast": { school: "Evocation", cost: 2, benefit: "When you use your Evocation benefit to complete a dungeon room challenge, the blast of power also completes a second prompt in the same room (if one exists)." }, //
        "Silver Tongue": { school: "Enchantment", cost: 1, benefit: "When you complete a Side Quest, you gain an additional +5 Paper Scraps." }, //
        "Irresistible Charm": { school: "Enchantment", cost: 2, benefit: "Once per month, you may choose to automatically succeed at befriending a monster without needing to read a book for the 'befriend' prompt." }, //
        "Empowered Bond": { school: "Conjuration", cost: 1, benefit: "The Ink Drop or Paper Scrap bonus granted by your equipped Familiar is permanently increased by +5." }, //
        "Echo Chamber": { school: "Conjuration", cost: 2, benefit: "You permanently unlock an additional Familiar slot on top of any Familiar slots you have already unlocked." }, //
        "Alchemic Focus": { school: "Transmutation", cost: 1, benefit: "You gain an additional +5 XP for every book you read outside of your monthly quest pool." }, //
        "Philosopher's Stone": { school: "Transmutation", cost: 2, benefit: "Once per month, you may sacrifice 50 XP to instantly gain 50 Ink Drops and 10 Paper Scraps." } //
    };

    // --- FORM ELEMENTS ---
    const form = document.getElementById('character-sheet');
    const wizardSchoolSelect = document.getElementById('wizardSchool');
    const librarySanctumSelect = document.getElementById('librarySanctum');
    const smpInput = document.getElementById('smp');

    // --- STATE MANAGEMENT ---
    let learnedAbilities = [];
    let equippedItems = [];
    let inventoryItems = [];
    let activeAssignments = [];
    let completedQuests = [];

    // --- RENDER FUNCTIONS ---
    const renderBenefits = () => {
        const school = wizardSchoolSelect.value;
        const sanctum = librarySanctumSelect.value;
        document.getElementById('magicalSchoolBenefitDisplay').textContent = schoolBenefits[school] || "-- Select a school to see its benefit --";
        document.getElementById('librarySanctumBenefitDisplay').textContent = sanctumBenefits[sanctum] || "-- Select a sanctum to see its benefit --";
    };

    const renderMasteryAbilities = () => {
        const smpDisplay = document.getElementById('smp-display');
        const abilitySelect = document.getElementById('ability-select');
        const learnedList = document.getElementById('learned-abilities-list');
        
        const currentSmp = parseInt(smpInput.value, 10) || 0;
        smpDisplay.textContent = currentSmp;
        learnedList.innerHTML = '';

        // Populate learned abilities
        learnedAbilities.forEach((abilityName, index) => {
            const ability = masteryAbilities[abilityName];
            learnedList.innerHTML += `
                <div class="item-card">
                    <div class="item-info">
                        <h4>${abilityName}</h4>
                        <p>${ability.benefit}</p>
                        <p class="ability-cost"><strong>School:</strong> ${ability.school} | <strong>Cost:</strong> ${ability.cost} SMP</p>
                        <button class="delete-ability-btn" data-index="${index}">Forget</button>
                    </div>
                </div>
            `;
        });
        
        // Populate dropdown with available, unlearned abilities
        abilitySelect.innerHTML = '<option value="">-- Select an ability to learn --</option>';
        for (const name in masteryAbilities) {
            if (!learnedAbilities.includes(name)) {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = `${name} (${masteryAbilities[name].school}, ${masteryAbilities[name].cost} SMP)`;
                abilitySelect.appendChild(option);
            }
        }
    };

    // (Keep your existing renderLoadout, renderActiveAssignments, and renderCompletedQuests functions here)

    // --- DATA HANDLING ---
    const loadData = () => {
        // ... (load other data)
        learnedAbilities = JSON.parse(localStorage.getItem('learnedAbilities')) || [];
        // ...
        renderBenefits();
        renderMasteryAbilities();
        // ... (call other render functions)
    };

    const saveData = () => {
        // ... (save other data)
        localStorage.setItem('learnedAbilities', JSON.stringify(learnedAbilities));
        // ...
    };

    // --- EVENT LISTENERS ---
    wizardSchoolSelect.addEventListener('change', renderBenefits);
    librarySanctumSelect.addEventListener('change', renderBenefits);
    smpInput.addEventListener('input', renderMasteryAbilities); // Update display when SMP changes

    document.getElementById('learn-ability-button').addEventListener('click', () => {
        const abilityName = document.getElementById('ability-select').value;
        if (!abilityName) return;

        const ability = masteryAbilities[abilityName];
        let currentSmp = parseInt(smpInput.value, 10) || 0;

        if (currentSmp >= ability.cost) {
            currentSmp -= ability.cost;
            smpInput.value = currentSmp;
            learnedAbilities.push(abilityName);
            renderMasteryAbilities();
            saveData();
        } else {
            alert('Not enough School Mastery Points to learn this ability!');
        }
    });

    document.querySelector('main').addEventListener('click', (e) => {
        // Handle forgetting an ability
        if (e.target.classList.contains('delete-ability-btn')) {
            const index = parseInt(e.target.dataset.index, 10);
            const abilityName = learnedAbilities[index];
            const ability = masteryAbilities[abilityName];
            let currentSmp = parseInt(smpInput.value, 10) || 0;
            
            if (confirm(`Are you sure you want to forget "${abilityName}"? This will refund ${ability.cost} SMP.`)) {
                currentSmp += ability.cost;
                smpInput.value = currentSmp;
                learnedAbilities.splice(index, 1);
                renderMasteryAbilities();
                saveData();
            }
        }
        // ... (existing equip/unequip/delete item logic) ...
    });

    // (Keep all other existing event listeners)

    // Initial Load
    loadData();
});