document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('character-sheet');
    const printButton = document.getElementById('print-button');
    const addQuestButton = document.getElementById('add-quest-button');

    // Arrays to hold the state of our quest trackers
    let activeAssignments = [];
    let completedQuests = [];

    // --- RENDER FUNCTIONS ---
    // These functions take the data arrays and build the HTML for the tables

    const renderActiveAssignments = () => {
        const tbody = document.getElementById('active-assignments-body');
        tbody.innerHTML = ''; // Clear the table first
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
        tbody.innerHTML = ''; // Clear the table first
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

    // --- DATA HANDLING FUNCTIONS ---

    const loadData = () => {
        // Load simple form data
        const characterData = JSON.parse(localStorage.getItem('characterSheet'));
        if (characterData) {
            for (const key in characterData) {
                if (form.elements[key]) {
                    form.elements[key].value = characterData[key];
                }
            }
        }
        // Load tracker data
        activeAssignments = JSON.parse(localStorage.getItem('activeAssignments')) || [];
        completedQuests = JSON.parse(localStorage.getItem('completedQuests')) || [];

        renderActiveAssignments();
        renderCompletedQuests();
    };

    const saveData = () => {
        // Save simple form data
        const characterData = {};
        const formElements = form.elements;
        for (let i = 0; i < formElements.length; i++) {
            const element = formElements[i];
            if (element.id && element.type !== 'button') {
                 // Exclude tracker inputs from this part
                if (!element.id.startsWith('new-quest-')) {
                    characterData[element.id] = element.value;
                }
            }
        }
        localStorage.setItem('characterSheet', JSON.stringify(characterData));

        // Save tracker data
        localStorage.setItem('activeAssignments', JSON.stringify(activeAssignments));
        localStorage.setItem('completedQuests', JSON.stringify(completedQuests));
    };

    // --- EVENT LISTENERS ---

    // Save button for the main character sheet info
    form.addEventListener('submit', function(event) {
        event.preventDefault();
        saveData();
        alert('Character sheet info saved!');
    });

    // Add Quest button
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

        saveData(); // Save everything after adding
        
        // Clear input fields
        document.getElementById('new-quest-prompt').value = '';
        document.getElementById('new-quest-book').value = '';
        document.getElementById('new-quest-notes').value = '';
    });

    // Listener for delete buttons (using event delegation)
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
            saveData(); // Save after deleting
        }
    });

    // Print button
    if (printButton) {
        printButton.addEventListener('click', function() {
            window.print();
        });
    }

    // Load all data when the page loads
    loadData();
});