import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from './storageKeys.js';

export function initializeCollapsiblePanels() {
    const configs = [
        { buttonSelector: '.rpg-library-add-panel .panel-toggle-btn', storageKey: 'library-add-panel-body' },
        { buttonSelector: '.rpg-campaigns-add-panel .panel-toggle-btn', storageKey: 'campaigns-add-panel-body' },
        { buttonSelector: '.rpg-external-curriculum-add-panel .panel-toggle-btn', storageKey: 'external-curriculum-add-panel-body' },
        { buttonSelector: '.rpg-temporary-buffs-panel .panel-toggle-btn', storageKey: 'temporary-buffs-panel-body' },
        { buttonSelector: '.rpg-quest-card-draw-panel .panel-toggle-btn', storageKey: 'quest-card-draw-panel-body' },
        { buttonSelector: '.rpg-quest-draw-helpers-panel .panel-toggle-btn', storageKey: 'quest-draw-helpers-panel-body' }
    ];

    const stored = safeGetJSON(STORAGE_KEYS.COLLAPSED_PANELS, {});

    const saveCollapsed = (bodyId, isCollapsed) => {
        const next = { ...safeGetJSON(STORAGE_KEYS.COLLAPSED_PANELS, {}) };
        if (isCollapsed) next[bodyId] = true;
        else delete next[bodyId];
        safeSetJSON(STORAGE_KEYS.COLLAPSED_PANELS, next);
    };

    configs.forEach((cfg, index) => {
        const btn = document.querySelector(cfg.buttonSelector);
        if (!btn) return;
        const targetId = btn.getAttribute('data-panel-target');
        const body = targetId ? document.getElementById(targetId) : btn.closest('.rpg-panel')?.querySelector('.rpg-panel-body');
        if (!body) return;

        // Derive a stable storage key even if id/target attributes are missing
        const bodyKey = body.id || targetId || cfg.storageKey || `${cfg.buttonSelector || 'panel'}-${index}`;
        let collapsed = Boolean(stored[bodyKey]);

        const applyState = () => {
            body.style.display = collapsed ? 'none' : '';
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            btn.textContent = collapsed ? 'Show' : 'Hide';
        };

        applyState();

        btn.addEventListener('click', () => {
            collapsed = !collapsed;
            saveCollapsed(bodyKey, collapsed);
            applyState();
        });
    });
}

export function initializeQuestDrawHelpersToggle() {
    const btn = document.getElementById('quest-draw-helpers-help-toggle');
    const details = document.getElementById('quest-draw-helpers-help-details');
    if (!btn || !details) return;

    btn.addEventListener('click', () => {
        const open = details.hasAttribute('hidden');
        if (open) {
            details.removeAttribute('hidden');
            btn.setAttribute('aria-expanded', 'true');
        } else {
            details.setAttribute('hidden', '');
            btn.setAttribute('aria-expanded', 'false');
        }
    });
}
