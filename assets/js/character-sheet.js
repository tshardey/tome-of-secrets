document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('character-sheet');
    const printButton = document.getElementById('print-button');

    // Load data from localStorage
    const loadData = () => {
        const data = JSON.parse(localStorage.getItem('characterSheet'));
        if (data) {
            for (const key in data) {
                if (form.elements[key]) {
                    form.elements[key].value = data[key];
                }
            }
        }
    };

    // Save data to localStorage
    const saveData = () => {
        const data = {};
        for (const element of form.elements) {
            if (element.id) {
                data[element.id] = element.value;
            }
        }
        localStorage.setItem('characterSheet', JSON.stringify(data));
    };

    form.addEventListener('submit', function(event) {
        event.preventDefault();
        saveData();
        alert('Character sheet saved!');
    });

    if (printButton) {
        printButton.addEventListener('click', function() {
            window.print();
        });
    }

    loadData();
});