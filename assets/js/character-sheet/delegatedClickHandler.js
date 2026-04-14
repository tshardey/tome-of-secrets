import { safeSetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from './storageKeys.js';

/**
 * Attaches the consolidated delegated click handler to the form element.
 *
 * @param {HTMLElement} form - The form element to attach the click handler to
 * @param {{ ability, inventory, quest, curse, buff }} controllers - Controller instances
 * @param {object} ui - The ui module (for renderCompletedQuests)
 */
export function initializeDelegatedClickHandler(form, controllers, ui) {
    const isTouchFlipMode = window.matchMedia?.('(hover: none)')?.matches ?? false;

    // Delegated click handler for all interactive elements
    form.addEventListener('click', (e) => {
        const target = e.target;

        // Archive tab: jump links smooth-scroll to section
        const jumpLink = target.closest('.archive-jump-link');
        if (jumpLink && jumpLink.getAttribute('href')?.startsWith('#')) {
            const id = jumpLink.getAttribute('href').slice(1);
            const section = document.getElementById(id);
            if (section) {
                e.preventDefault();
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            return;
        }

        // Archive tab: card face toggle (Poster vs Cover)
        const faceBtn = target.closest('.archive-face-toggle-btn');
        if (faceBtn) {
            const mode = faceBtn.getAttribute('data-archive-face');
            if (mode === 'poster' || mode === 'cover') {
                safeSetJSON(STORAGE_KEYS.ARCHIVE_CARD_FACE_MODE, mode);
                ui.renderCompletedQuests();
            }
            return;
        }

        // Archive tab: group by (Month/Year vs Quest type)
        const groupByBtn = target.closest('.archive-group-by-btn');
        if (groupByBtn) {
            const mode = groupByBtn.getAttribute('data-archive-group-by');
            if (mode === 'month' || mode === 'type') {
                safeSetJSON(STORAGE_KEYS.ARCHIVE_GROUP_BY, mode);
                ui.renderCompletedQuests();
            }
            return;
        }

        // Handle archive card clicks:
        // - Desktop pointers: hover flips (CSS), click opens edit drawer
        // - Touch devices: tap flips (JS), double-tap opens edit drawer
        const tomeCard = target.closest('.tome-card');
        const dungeonCard = target.closest('.dungeon-archive-card');
        const archiveCard = tomeCard || dungeonCard;
        if (archiveCard && !target.closest('button')) {
            const editButton = archiveCard.querySelector('.edit-quest-btn');
            if (editButton && editButton.dataset.list && editButton.dataset.index) {
                if (tomeCard) {
                    if (!isTouchFlipMode) {
                        editButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        return;
                    }

                    const now = Date.now();
                    const sameCard = window._tomeCardLastClickCard === tomeCard;
                    const recent = sameCard && (now - (window._tomeCardLastClickTime || 0)) < 400;
                    if (recent) {
                        window._tomeCardLastClickCard = null;
                        window._tomeCardLastClickTime = 0;
                        editButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                        return;
                    }
                    window._tomeCardLastClickCard = tomeCard;
                    window._tomeCardLastClickTime = now;
                    tomeCard.classList.toggle('tome-card-flipped');
                    return;
                }
                editButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                return;
            }
        }

        // Allow buttons without index if they're special buttons (delete-ability-btn, remove-passive-item-btn, equip-from-passive-btn, curse helper actions)
        if (!target.dataset.index &&
            !target.classList.contains('delete-ability-btn') &&
            !target.classList.contains('remove-passive-item-btn') &&
            !target.classList.contains('equip-from-passive-btn') &&
            !target.classList.contains('mark-helper-used-btn') &&
            !target.classList.contains('undo-helper-used-btn') &&
            !target.classList.contains('mark-quest-draw-helper-used-btn') &&
            !target.classList.contains('undo-quest-draw-helper-used-btn') &&
            !target.classList.contains('activate-ability-btn')) {
            return;
        }

        // Route to appropriate controller
        if (controllers.ability.handleDeleteAbilityClick && controllers.ability.handleDeleteAbilityClick(target)) {
            return;
        }
        if (controllers.inventory.handleClick && controllers.inventory.handleClick(target)) {
            return;
        }
        if (controllers.quest.handleClick && controllers.quest.handleClick(target)) {
            return;
        }
        if (controllers.curse.handleClick && controllers.curse.handleClick(target)) {
            return;
        }
        if (controllers.buff.handleClick && controllers.buff.handleClick(target)) {
            return;
        }
    });
}
