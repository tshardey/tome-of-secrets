/**
 * Print Handler - manages print button and beforeprint/afterprint events
 */

export function initializePrintHandler() {
    const printButton = document.getElementById('print-button');
    if (!printButton) return;

    // Store the original active tab before printing (captured once, never overwritten)
    let originalActiveTab = null;
    let isPrinting = false;

    // Prepare for printing: show all tabs
    const prepareForPrint = () => {
        const tabContainer = document.querySelector('.tab-container');
        if (tabContainer) {
            tabContainer.classList.add('printing');
        }

        // Only capture the active tab if we haven't already stored it
        // This prevents overwriting if beforeprint fires after a tab change
        if (!isPrinting) {
            // Get the currently active tab from the DOM, not localStorage
            const activePanel = document.querySelector('[data-tab-panel].active');
            originalActiveTab = activePanel ? activePanel.dataset.tabPanel : 'character';
            isPrinting = true;
        }

        // Ensure all tab panels are visible for printing
        const tabPanels = document.querySelectorAll('[data-tab-panel]');
        tabPanels.forEach(panel => {
            panel.classList.add('active');
        });
    };

    // Restore state after printing
    const restoreAfterPrint = () => {
        const tabContainer = document.querySelector('.tab-container');
        if (tabContainer) {
            tabContainer.classList.remove('printing');
        }

        // Restore the original active tab
        if (originalActiveTab) {
            const tabPanels = document.querySelectorAll('[data-tab-panel]');
            tabPanels.forEach(panel => {
                panel.classList.remove('active');
            });

            // Try to restore the original tab, with fallback to first tab if it doesn't exist
            let activePanel = document.querySelector(`[data-tab-panel="${originalActiveTab}"]`);
            if (!activePanel) {
                // Fallback: activate the first tab if the stored tab doesn't exist
                const firstPanel = tabPanels[0];
                if (firstPanel) {
                    activePanel = firstPanel;
                    originalActiveTab = firstPanel.dataset.tabPanel;
                }
            }

            if (activePanel) {
                activePanel.classList.add('active');
                // Update localStorage to match the restored tab
                localStorage.setItem('activeCharacterTab', originalActiveTab);
            }

            originalActiveTab = null;
            isPrinting = false;
        }
    };

    // Use beforeprint and afterprint events for better reliability
    window.addEventListener('beforeprint', prepareForPrint);
    window.addEventListener('afterprint', restoreAfterPrint);

    // Also handle the print button click
    printButton.addEventListener('click', () => {
        // Capture the active tab immediately when button is clicked
        const activePanel = document.querySelector('[data-tab-panel].active');
        originalActiveTab = activePanel ? activePanel.dataset.tabPanel : 'character';
        isPrinting = true;

        prepareForPrint();
        // Small delay to ensure DOM is updated before print dialog opens
        setTimeout(() => {
            window.print();
        }, 50);
    });
}
