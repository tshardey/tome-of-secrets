/**
 * BaseController - Base class for all feature controllers
 * 
 * Provides common functionality for controllers:
 * - State adapter reference
 * - Form reference
 * - Save state helper
 * - Event listener cleanup
 */

export class BaseController {
    /**
     * @param {StateAdapter} stateAdapter - State adapter instance
     * @param {HTMLFormElement} form - Character sheet form element
     * @param {Object} dependencies - Additional dependencies (ui, data, etc.)
     */
    constructor(stateAdapter, form, dependencies = {}) {
        this.stateAdapter = stateAdapter;
        this.form = form;
        this.dependencies = dependencies;
        this.eventListeners = [];
    }

    /**
     * Save state helper
     */
    saveState() {
        // Use saveState from dependencies (passed from main init)
        if (this.dependencies.saveState) {
            // saveState may be async (IndexedDB-backed). Controllers shouldn't block on persistence.
            void this.dependencies.saveState(this.form);
        }
    }

    /**
     * Register an event listener for cleanup
     * @param {HTMLElement} element - Element to attach listener to
     * @param {string} event - Event type
     * @param {Function} handler - Event handler
     * @param {Object} options - Event listener options
     */
    addEventListener(element, event, handler, options) {
        if (!element) return;
        element.addEventListener(event, handler, options);
        this.eventListeners.push({ element, event, handler, options });
    }

    /**
     * Clean up all registered event listeners
     */
    destroy() {
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            element.removeEventListener(event, handler, options);
        });
        this.eventListeners = [];
    }

    /**
     * Initialize the controller - override in subclasses
     */
    initialize() {
        // Override in subclasses
    }
}

