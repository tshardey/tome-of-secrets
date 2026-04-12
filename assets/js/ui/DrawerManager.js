/**
 * DrawerManager — Reusable drawer/overlay open-close infrastructure.
 *
 * Manages backdrop, scroll lock, close-button, backdrop-click, and Escape-key
 * behavior for any number of named drawer panels.  Domain-specific rendering
 * is handled by callers via onBeforeOpen / onAfterClose lifecycle hooks.
 *
 * Config shape per drawer:
 *   backdrop      : string  — DOM id of backdrop element
 *   drawer        : string  — DOM id of drawer element
 *   closeBtn      : string  — DOM id of close button (optional)
 *   onBeforeOpen  : (drawerEl: HTMLElement) => void  (optional)
 *   onAfterClose  : (drawerEl: HTMLElement) => void  (optional)
 */
export class DrawerManager {
    /** @param {Object<string, object>} config */
    constructor(config) {
        this._config = config;
        this._activeDrawerId = null;
        // Resolved DOM element cache (lazy, per drawer id)
        this._elements = {};

        // Bound handlers for cleanup
        this._onEscape = (e) => {
            if (e.key === 'Escape' && this._activeDrawerId) {
                this.close(this._activeDrawerId);
            }
        };
        document.addEventListener('keydown', this._onEscape);

        // Wire close-button and backdrop-click for each drawer
        this._backdropHandlers = {};
        this._closeBtnHandlers = {};
        Object.keys(config).forEach((id) => this._wireCloseListeners(id));
    }

    // --- Public API ---

    open(drawerId) {
        const els = this._resolve(drawerId);
        if (!els) return;

        // Wire close listeners if not already done (handles lazy DOM resolution)
        if (!this._backdropHandlers[drawerId]) {
            this._wireCloseListeners(drawerId);
        }

        // Close any currently-open drawer first
        if (this._activeDrawerId && this._activeDrawerId !== drawerId) {
            this.close(this._activeDrawerId);
        }

        // Already open — no-op (idempotent)
        if (this._activeDrawerId === drawerId) return;

        const cfg = this._config[drawerId];
        if (cfg.onBeforeOpen) cfg.onBeforeOpen(els.drawer);

        els.drawer.style.display = cfg.displayStyle || 'flex';
        els.backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
        this._activeDrawerId = drawerId;
    }

    close(drawerId) {
        const els = this._resolve(drawerId);
        if (!els) return;

        els.drawer.style.display = 'none';
        els.backdrop.classList.remove('active');
        document.body.style.overflow = '';

        if (this._activeDrawerId === drawerId) {
            this._activeDrawerId = null;
        }

        const cfg = this._config[drawerId];
        if (cfg.onAfterClose) cfg.onAfterClose(els.drawer);
    }

    closeAll() {
        if (this._activeDrawerId) {
            this.close(this._activeDrawerId);
        }
    }

    isOpen(drawerId) {
        return this._activeDrawerId === drawerId;
    }

    destroy() {
        document.removeEventListener('keydown', this._onEscape);

        Object.keys(this._config).forEach((id) => {
            const els = this._elements[id];
            if (!els) return;
            if (this._backdropHandlers[id]) {
                els.backdrop.removeEventListener('click', this._backdropHandlers[id]);
            }
            if (this._closeBtnHandlers[id] && els.closeBtn) {
                els.closeBtn.removeEventListener('click', this._closeBtnHandlers[id]);
            }
        });

        this._elements = {};
        this._activeDrawerId = null;
    }

    // --- Internal ---

    _resolve(drawerId) {
        if (this._elements[drawerId]) return this._elements[drawerId];

        const cfg = this._config[drawerId];
        if (!cfg) return null;

        const backdrop = document.getElementById(cfg.backdrop);
        const drawer = document.getElementById(cfg.drawer);
        if (!backdrop || !drawer) return null;

        const closeBtn = cfg.closeBtn ? document.getElementById(cfg.closeBtn) : null;

        this._elements[drawerId] = { backdrop, drawer, closeBtn };
        return this._elements[drawerId];
    }

    _wireCloseListeners(drawerId) {
        const els = this._resolve(drawerId);
        if (!els) return;

        this._backdropHandlers[drawerId] = () => this.close(drawerId);
        els.backdrop.addEventListener('click', this._backdropHandlers[drawerId]);

        if (els.closeBtn) {
            this._closeBtnHandlers[drawerId] = () => this.close(drawerId);
            els.closeBtn.addEventListener('click', this._closeBtnHandlers[drawerId]);
        }
    }
}
