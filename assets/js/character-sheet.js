document.addEventListener('DOMContentLoaded', function() {
    // --- MASTER ITEM DATABASE ---
    // All items from rewards.md are stored here for easy access.
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
    const levelInput = document.getElementById('level');

    // --- State Management for Loadout ---
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
    
    // --- SLOT CALCULATION ---
    const calculateSlots = () => {
        const level = parseInt(levelInput.value, 10) || 1;
        let totalSlots = 3; // Starting slots at level 1
        if (level >= 4) totalSlots++; //
        if (level >= 8) totalSlots++; //
        if (level >= 12) totalSlots++; //
        if (level >= 16) totalSlots++; //
        if (level >= 19) totalSlots++; //
        
        // Define slot types and how many of each are available.
        // For now, it's 1 of each base, and we can assume new slots are flexible.
        // A more complex system could be built if needed. This is a simple interpretation.
        let slots = {
            Wearable: 1,
            "Non-Wearable": 1,
            Familiar: 1,
            Flexible: totalSlots - 3
        };
        return { slots, totalSlots };
    };

    // --- RENDER FUNCTIONS for Loadout ---
    const renderLoadout = () => {
        const equippedList = document.getElementById('equipped-items-list');
        const inventoryList = document.getElementById('inventory-list');
        const emptyInventoryMsg = document.getElementById('empty-inventory-message');
        if (!equippedList || !inventoryList) return; // Exit if elements aren't on page

        equippedList.innerHTML = '';
        inventoryList.innerHTML = '';

        const { slots, totalSlots } = calculateSlots();
        let equippedCounts = { Wearable: 0, "Non-Wearable": 0, Familiar: 0 };

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
        
        // Render Empty Slots
        for (let i = equippedCounts.Wearable; i < slots.Wearable; i++) {
             equippedList.innerHTML += `<div class="item-card empty-slot"><p>Empty Wearable Slot</p></div>`;
        }
        for (let i = equippedCounts["Non-Wearable"]; i < slots["Non-Wearable"]; i++) {
             equippedList.innerHTML += `<div class="item-card empty-slot"><p>Empty Non-Wearable Slot</p></div>`;
        }
        for (let i = equippedCounts.Familiar; i < slots.Familiar; i++) {
             equippedList.innerHTML += `<div class="item-card empty-slot"><p>Empty Familiar Slot</p></div>`;
        }
        // Simplified: Display remaining total slots as empty generic slots.
        const usedSlots = equippedItems.length;
        for (let i=usedSlots; i < totalSlots; i++){
            if(i >= (slots.Wearable + slots["Non-Wearable"] + slots.Familiar)){
                 equippedList.innerHTML += `<div class="item-card empty-slot"><p>Empty Item Slot</p></div>`;
            }
        }


        // Render Inventory Items
        if (inventoryItems.length > 0) {
            emptyInventoryMsg.style.display = 'none';
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
            emptyInventoryMsg.style.display = 'block';
        }
        
        document.getElementById('equipped-summary').innerText = `Equipped Items (${equippedItems.length}/${totalSlots} Slots Used)`;
    };

    // --- MONTHLY TRACKER (Existing Code) ---
    const addQuestButton = document.getElementById('add-quest-button');
    let activeAssignments = [];
    let completedQuests = [];

    const renderActiveAssignments = () => {
        const tbody = document.getElementById('active-assignments-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        activeAssignments.forEach((quest, index) => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${quest.type}</td>
                <td>${quest.prompt}</td>
                <td>${quest.book}</td>
                <td>${quest.notes}</td>
                <td class="no-print"><button class="delete-btn" data-index="${index}" data-list="active">Delete</button></td>
            `;
        });
        document.getElementById('active-summary').innerText = `Active Book Assignments (${activeAssignments.length} Remaining)`;
    };

    const renderCompletedQuests = () => {
        const tbody = document.getElementById('completed-quests-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        completedQuests.forEach((quest, index) => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${quest.type}</td>
                <td>${quest.prompt}</td>
                <td>${quest.book}</td>
                <td>${quest.notes}</td>
                <td class="no-print"><button class="delete-btn" data-index="${index}" data-list="completed">Delete</button></td>
            `;
        });
        document.getElementById('completed-summary').innerText = `Completed Quests (${completedQuests.length} Books Read)`;
    };


    // --- DATA HANDLING (Combined) ---
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
    
    if(levelInput) levelInput.addEventListener('change', renderLoadout);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        saveData();
        alert('Character sheet info saved!');
    });
    
    const addItemButton = document.getElementById('add-item-button');
    if(addItemButton) {
        addItemButton.addEventListener('click', () => {
            const itemName = itemSelect.value;
            if (itemName && allItems[itemName]) {
                const itemData = { name: itemName, ...allItems[itemName] };
                inventoryItems.push(itemData);
                renderLoadout();
                saveData();
            }
        });
    }

    document.querySelector('main').addEventListener('click', (e) => {
        const target = e.target;
        if (!target.dataset.index) return;
        const index = parseInt(target.dataset.index, 10);

        if (target.classList.contains('equip-btn')) {
            const itemToEquip = inventoryItems[index];
            const { totalSlots } = calculateSlots();
            
            if (equippedItems.length < totalSlots) {
                equippedItems.push(itemToEquip);
                inventoryItems.splice(index, 1);
                renderLoadout();
                saveData();
            } else {
                alert(`No empty item slots available!`);
            }
        }

        if (target.classList.contains('unequip-btn')) {
            const itemToUnequip = equippedItems[index];
            inventoryItems.push(itemToUnequip);
            equippedItems.splice(index, 1);
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
    });

    if(addQuestButton) {
        addQuestButton.addEventListener('click', function() {
            const status = document.getElementById('new-quest-status').value;
            const type = document.getElementById('new-quest-type').value;
            const prompt = document.getElementById('new-quest-prompt').value;
            const book = document.getElementById('new-quest-book').value;
            const notes = document.getElementById('new-quest-notes').value;
            if (!prompt || !book) {
                alert('Please fill in at least the Prompt and Book Title.');
                return;
            }
            const newQuest = { type, prompt, book, notes };
            if (status === 'active') {
                activeAssignments.push(newQuest);
                renderActiveAssignments();
            } else {
                completedQuests.push(newQuest);
                renderCompletedQuests();
            }
            saveData();
            document.getElementById('new-quest-prompt').value = '';
            document.getElementById('new-quest-book').value = '';
            document.getElementById('new-quest-notes').value = '';
        });
    }

    document.querySelector('.container').addEventListener('click', function(e) {
        if (e.target && e.target.classList.contains('delete-btn')) {
            const list = e.target.getAttribute('data-list');
            const index = parseInt(e.target.getAttribute('data-index'), 10);
            if (list === 'active') {
                activeAssignments.splice(index, 1);
                renderActiveAssignments();
            } else if (list === 'completed') {
                completedQuests.splice(index, 1);
                renderCompletedQuests();
            }
            saveData();
        }
    });
    
    if (printButton) printButton.addEventListener('click', () => window.print());

    loadData();
});