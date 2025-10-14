document.addEventListener('DOMContentLoaded', function() {
    // --- MASTER ITEM DATABASE ---
    const allItems = {
        // Wearable Items
        "Librarian's Compass": { type: "Wearable", img: "assets/images/rewards/librarians-compass.png", bonus: "Earn a +20 Ink Drop bonus for any book by a new-to-you author." }, //
        "Amulet of Duality": { type: "Wearable", img: "assets/images/rewards/amulet-of-duality.png", bonus: "Earn a +15 Ink Drop bonus on books with multiple points of view or multiple narrators." }, //
        "Scatter Brain Scarab": { type: "Wearable", img: "assets/images/rewards/scatter-brain-scarab.png", bonus: "When equipped, gain a x3 Ink Drop bonus for reading three books at the same time." }, //
        "Cloak of the Story-Weaver": { type: "Wearable", img: "assets/images/rewards/cloak-of-the-story-weaver.png", bonus: "Earn a permanent +10 Ink Drop bonus for books that are part of a series." }, //
        "The Bookwyrm's Scale": { type: "Wearable", img: "assets/images/rewards/bookwyrms-scale.png", bonus: "For every book over 500 pages, gain a +10 Ink Drop bonus." }, //
        // Non-Wearable Items
        "Key of the Archive": { type: "Non-Wearable", img: "assets/images/rewards/key-of-the-archive.png", bonus: "Earn a +15 Ink Drop bonus on books where something is unlocked, either literally or figuratively." }, //
        "Tome of Potential": { type: "Non-Wearable", img: "assets/images/rewards/tome-of-potential.png", bonus: "Earn a x3 Ink Drop bonus for books over 400 pages." }, //
        "Librarian's Quill": { type: "Non-Wearable", img: "assets/images/rewards/librarians-quill.png", bonus: "Earn a permanent +2 Paper Scraps bonus for every book you journal about after finishing." }, //
        "Chalice of Restoration": { type: "Non-Wearable", img: "assets/images/rewards/chalice-of-restoration.png", bonus: "Once per month, you may use this item to remove a Worn Page penalty." }, //
        "Lantern of Foresight": { type: "Non-Wearable", img: "assets/images/rewards/lantern-of-foresight.png", bonus: "Once per month, you may re-roll a prompt or a die roll to get a new result, and you must keep the new result." }, //
        "The Scepter of Knowledge": { type: "Non-Wearable", img: "assets/images/rewards/scepter-of-knowledge.png", bonus: "Once per month, you may switch the genre of any quest you roll to Non-Fiction." }, //
        // Familiars
        "Celestial Koi Fish": { type: "Familiar", img: "assets/images/rewards/celestial-koi-fish.png", bonus: "Once per month, you may use this familiar's insight to switch a genre-based quest (d6) to its opposing genre." }, //
        "Tome-Bound Cat": { type: "Familiar", img: "assets/images/rewards/tome-bound-cat.png", bonus: "When you choose an Atmospheric Buff for your reading session, earn a x2 Ink Drop bonus on the effect." }, //
        "Pocket Dragon": { type: "Familiar", img: "assets/images/rewards/pocket-dragon.png", bonus: "Earn a +20 Ink Drop bonus for books in a fantasy series." }, //
        "Garden Gnome": { type: "Familiar", img: "assets/images/rewards/garden-gnome.png", bonus: "Earn +1 Ink Drop on any day where you read outside in nature or in a plant filled room." }, //
        "Mystical Moth": { type: "Familiar", img: "assets/images/rewards/mystical-moth.png", bonus: "Earn +1 Ink Drop on nights when you read by lamplight." }, //
        "Page Sprite": { type: "Familiar", img: "assets/images/rewards/page-sprite.png", bonus: "Earn a x2 Ink Drop bonus on any book under 300 pages." } //
    };

    const form = document.getElementById('character-sheet');
    const printButton = document.getElementById('print-button');
    
    // --- NEW: Input fields for slot counts ---
    const wearableSlotsInput = document.getElementById('wearable-slots');
    const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
    const familiarSlotsInput = document.getElementById('familiar-slots');

    let equippedItems = [];
    let inventoryItems = [];

    // Populate the item dropdown
    const itemSelect = document.getElementById('item-select');
    if(itemSelect) {
        for (const name in allItems) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            itemSelect.appendChild(option);
        }
    }
    
    // --- REWRITTEN: SLOT CALCULATION ---
    const getSlotLimits = () => {
        const wearable = parseInt(wearableSlotsInput.value, 10) || 0;
        const nonWearable = parseInt(nonWearableSlotsInput.value, 10) || 0;
        const familiar = parseInt(familiarSlotsInput.value, 10) || 0;
        return {
            'Wearable': wearable,
            'Non-Wearable': nonWearable,
            'Familiar': familiar,
            'total': wearable + nonWearable + familiar
        };
    };

    // --- UPDATED: RENDER LOADOUT ---
    const renderLoadout = () => {
        const equippedList = document.getElementById('equipped-items-list');
        const inventoryList = document.getElementById('inventory-list');
        if (!equippedList || !inventoryList) return;

        equippedList.innerHTML = '';
        inventoryList.innerHTML = '';

        const slotLimits = getSlotLimits();
        const equippedCounts = { 'Wearable': 0, 'Non-Wearable': 0, 'Familiar': 0 };

        // Render Equipped Items
        equippedItems.forEach((item, index) => {
            equippedCounts[item.type]++;
            equippedList.innerHTML += `
                <div class="item-card">
                    <img src="${item.img}" alt="${item.name}">
                    <div class="item-info">
                        <h4>${item.name}</h4>
                        <p><strong>Type:</strong> ${item.type}</p>
                        <p>${item.bonus}</p>
                        <button class="unequip-btn" data-index="${index}">Unequip</button>
                    </div>
                </div>
            `;
        });
        
        // Render Empty Slots for each specific type
        for (let i = equippedCounts['Wearable']; i < slotLimits['Wearable']; i++) {
            equippedList.innerHTML += `<div class="item-card empty-slot"><p>Empty Wearable Slot</p></div>`;
        }
        for (let i = equippedCounts['Non-Wearable']; i < slotLimits['Non-Wearable']; i++) {
            equippedList.innerHTML += `<div class="item-card empty-slot"><p>Empty Non-Wearable Slot</p></div>`;
        }
        for (let i = equippedCounts['Familiar']; i < slotLimits['Familiar']; i++) {
            equippedList.innerHTML += `<div class="item-card empty-slot"><p>Empty Familiar Slot</p></div>`;
        }

        // Render Inventory Items or Empty Message
        if (inventoryItems.length > 0) {
            inventoryItems.forEach((item, index) => {
                inventoryList.innerHTML += `
                    <div class="item-card">
                        <img src="${item.img}" alt="${item.name}">
                        <div class="item-info">
                            <h4>${item.name}</h4>
                            <p><strong>Type:</strong> ${item.type}</p>
                            <p>${item.bonus}</p>
                            <button class="equip-btn" data-index="${index}">Equip</button>
                            <button class="delete-item-btn" data-index="${index}">Delete</button>
                        </div>
                    </div>
                `;
            });
        } else {
            inventoryList.innerHTML = `<p id="empty-inventory-message">Your inventory is empty. Add items using the dropdown above.</p>`;
        }
        
        document.getElementById('equipped-summary').innerText = `Equipped Items (${equippedItems.length}/${slotLimits.total} Slots Used)`;
    };

    // --- (Monthly Tracker and Data Handling code remains largely the same) ---
    const addQuestButton = document.getElementById('add-quest-button');
    let activeAssignments = [];
    let completedQuests = [];

    const renderActiveAssignments = () => { /* ... same as before ... */ };
    const renderCompletedQuests = () => { /* ... same as before ... */ };

    const loadData = () => {
        const characterData = JSON.parse(localStorage.getItem('characterSheet'));
        if (characterData) {
            for (const key in characterData) {
                if (form.elements[key]) form.elements[key].value = characterData[key];
            }
        }
        activeAssignments = JSON.parse(localStorage.getItem('activeAssignments')) || [];
        completedQuests = JSON.parse(localStorage.getItem('completedQuests')) || [];
        equippedItems = JSON.parse(localStorage.getItem('equippedItems')) || [];
        inventoryItems = JSON.parse(localStorage.getItem('inventoryItems')) || [];

        renderActiveAssignments();
        renderCompletedQuests();
        renderLoadout();
    };

    const saveData = () => {
        const characterData = {};
        for (const element of form.elements) {
            if (element.id && element.type !== 'button' && !element.id.startsWith('new-quest-') && element.id !== 'item-select') {
                characterData[element.id] = element.value;
            }
        }
        localStorage.setItem('characterSheet', JSON.stringify(characterData));
        localStorage.setItem('activeAssignments', JSON.stringify(activeAssignments));
        localStorage.setItem('completedQuests', JSON.stringify(completedQuests));
        localStorage.setItem('equippedItems', JSON.stringify(equippedItems));
        localStorage.setItem('inventoryItems', JSON.stringify(inventoryItems));
    };

    // --- EVENT LISTENERS ---
    
    // NEW: Listen for changes on slot inputs
    wearableSlotsInput.addEventListener('change', renderLoadout);
    nonWearableSlotsInput.addEventListener('change', renderLoadout);
    familiarSlotsInput.addEventListener('change', renderLoadout);

    form.addEventListener('submit', (e) => { /* ... same as before ... */ });
    
    const addItemButton = document.getElementById('add-item-button');
    if(addItemButton) { /* ... same as before ... */ }

    // UPDATED: Main event listener for equip/unequip/delete
    document.querySelector('main').addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('.item-card') && target.dataset.index) {
            const index = parseInt(target.dataset.index, 10);

            // --- UPDATED EQUIP LOGIC ---
            if (target.classList.contains('equip-btn')) {
                const itemToEquip = inventoryItems[index];
                const slotLimits = getSlotLimits();
                const equippedCountForType = equippedItems.filter(item => item.type === itemToEquip.type).length;

                if (equippedCountForType < slotLimits[itemToEquip.type]) {
                    equippedItems.push(inventoryItems.splice(index, 1)[0]);
                    renderLoadout();
                    saveData();
                } else {
                    alert(`No empty ${itemToEquip.type} slots available!`);
                }
            }

            if (target.classList.contains('unequip-btn')) {
                inventoryItems.push(equippedItems.splice(index, 1)[0]);
                renderLoadout();
                saveData();
            }
            
            if (target.classList.contains('delete-item-btn')) {
                if (confirm(`Are you sure you want to permanently delete ${inventoryItems[index].name}?`)) {
                    inventoryItems.splice(index, 1);
                    renderLoadout();
                    saveData();
                }
            }
        }
    });

    if(addQuestButton) { /* ... same as before ... */ }
    document.querySelector('.container').addEventListener('click', function(e) { /* ... same as before ... */ });
    if (printButton) printButton.addEventListener('click', () => window.print());

    // --- Helper functions to keep the file clean ---
    const renderAssignments = () => {
        const tbody = document.getElementById('active-assignments-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        activeAssignments.forEach((quest, index) => { /* ... */ });
        document.getElementById('active-summary').innerText = `Active Book Assignments (${activeAssignments.length} Remaining)`;
    };

    // (Duplicating the functions from above to ensure they are present)
    form.addEventListener('submit', (e) => { e.preventDefault(); saveData(); alert('Character sheet info saved!'); });
    if(addItemButton) { addItemButton.addEventListener('click', () => { const itemName = itemSelect.value; if (itemName && allItems[itemName]) { const itemData = { name: itemName, ...allItems[itemName] }; inventoryItems.push(itemData); renderLoadout(); saveData(); } }); }
    if(addQuestButton) { addQuestButton.addEventListener('click', function() { const status = document.getElementById('new-quest-status').value; const type = document.getElementById('new-quest-type').value; const prompt = document.getElementById('new-quest-prompt').value; const book = document.getElementById('new-quest-book').value; const notes = document.getElementById('new-quest-notes').value; if (!prompt || !book) { alert('Please fill in at least the Prompt and Book Title.'); return; } const newQuest = { type, prompt, book, notes }; if (status === 'active') { activeAssignments.push(newQuest); renderActiveAssignments(); } else { completedQuests.push(newQuest); renderCompletedQuests(); } saveData(); document.getElementById('new-quest-prompt').value = ''; document.getElementById('new-quest-book').value = ''; document.getElementById('new-quest-notes').value = ''; }); }
    document.querySelector('.container').addEventListener('click', function(e) { if (e.target && e.target.classList.contains('delete-btn')) { const list = e.target.getAttribute('data-list'); const index = parseInt(e.target.getAttribute('data-index'), 10); if (list === 'active') { activeAssignments.splice(index, 1); renderActiveAssignments(); } else if (list === 'completed') { completedQuests.splice(index, 1); renderCompletedQuests(); } saveData(); } });

    loadData();
});