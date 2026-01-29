/**
 * Toast Notification System
 * 
 * Provides a non-intrusive notification system to replace alert() calls.
 * Supports stacking, auto-dismiss, and multiple types (success, error, info, warning).
 */

// Toast types
export const TOAST_TYPES = Object.freeze({
    SUCCESS: 'success',
    ERROR: 'error',
    INFO: 'info',
    WARNING: 'warning'
});

// Default options
const DEFAULT_OPTIONS = {
    duration: 4000, // 4 seconds
    position: 'top-center',
    type: TOAST_TYPES.INFO
};

// Container for toasts
let toastContainer = null;

/**
 * Initialize the toast container if it doesn't exist
 */
function ensureContainer() {
    // If tests or other code replace `document.body` / clear the DOM, our cached reference
    // can become detached. Reuse an existing DOM node if present; otherwise recreate.
    const existing = document.getElementById('toast-container');
    if (existing) {
        toastContainer = existing;
        return toastContainer;
    }

    if (!toastContainer || !toastContainer.isConnected) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    return toastContainer;
}

/**
 * Create a toast element
 * @param {string} message - The message to display
 * @param {string} type - Toast type (success, error, info, warning)
 * @returns {HTMLElement} The toast element
 */
function createToastElement(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', type === TOAST_TYPES.ERROR ? 'assertive' : 'polite');
    
    const icon = getToastIcon(type);
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Close notification" type="button">×</button>
    `;
    
    return toast;
}

/**
 * Get icon for toast type
 * @param {string} type - Toast type
 * @returns {string} Icon character/emoji
 */
function getToastIcon(type) {
    const icons = {
        [TOAST_TYPES.SUCCESS]: '✓',
        [TOAST_TYPES.ERROR]: '✗',
        [TOAST_TYPES.INFO]: 'ℹ',
        [TOAST_TYPES.WARNING]: '⚠'
    };
    return icons[type] || icons[TOAST_TYPES.INFO];
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {Object} options - Toast options (type, duration, position)
 * @returns {Function} Function to dismiss the toast manually
 */
export function showToast(message, options = {}) {
    if (!message) return () => {};
    
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const container = ensureContainer();
    
    // Create toast element
    const toast = createToastElement(message, opts.type);
    
    // Add to container
    container.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('toast-show');
    });
    
    // Auto-dismiss
    let dismissTimeout = null;
    const dismiss = () => {
        if (dismissTimeout) {
            clearTimeout(dismissTimeout);
            dismissTimeout = null;
        }
        
        toast.classList.remove('toast-show');
        toast.classList.add('toast-hide');
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300); // Match CSS transition duration
    };
    
    if (opts.duration > 0) {
        dismissTimeout = setTimeout(dismiss, opts.duration);
    }
    
    // Close button
    const closeButton = toast.querySelector('.toast-close');
    if (closeButton) {
        closeButton.addEventListener('click', dismiss);
    }
    
    // Click to dismiss (optional - disabled by default to avoid accidental dismissals)
    // toast.addEventListener('click', dismiss);
    
    return dismiss;
}

/**
 * Convenience methods for each toast type
 */
export const toast = {
    success: (message, duration) => showToast(message, { type: TOAST_TYPES.SUCCESS, duration }),
    error: (message, duration) => showToast(message, { type: TOAST_TYPES.ERROR, duration }),
    info: (message, duration) => showToast(message, { type: TOAST_TYPES.INFO, duration }),
    warning: (message, duration) => showToast(message, { type: TOAST_TYPES.WARNING, duration })
};

