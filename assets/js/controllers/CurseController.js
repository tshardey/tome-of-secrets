/**
 * CurseController - Handles curse management
 * 
 * Manages:
 * - Adding curses
 * - Editing curses
 * - Completing curses
 * - Deleting curses
 */

import { BaseController } from './BaseController.js';
import { Validator, required } from '../services/Validator.js';
import { clearFormError, clearFieldError, showFieldError } from '../utils/formErrors.js';
import * as data from '../character-sheet/data.js';

export class CurseController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        this.editingCurseInfo = null;
    }

    initialize() {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        const cursePenaltySelect = document.getElementById('curse-penalty-select');
        const curseBookTitle = document.getElementById('curse-book-title');
        const addCurseButton = document.getElementById('add-curse-button');

        if (!cursePenaltySelect || !addCurseButton) return;

        // Populate curse dropdown
        if (Array.isArray(data.curseTableDetailed)) {
            cursePenaltySelect.innerHTML = '<option value="">-- Select Curse Penalty --</option>';
            data.curseTableDetailed
                .slice()
                .sort((a, b) => (a.number || 0) - (b.number || 0))
                .forEach(curse => {
                    if (!curse || !curse.name) return;
                    const opt = document.createElement('option');
                    opt.value = curse.name;
                    if (typeof curse.number === 'number') {
                        opt.textContent = `${curse.number}. ${curse.name}`;
                    } else {
                        opt.textContent = curse.name;
                    }
                    cursePenaltySelect.appendChild(opt);
                });
        }

        this.addEventListener(addCurseButton, 'click', () => {
            this.handleAddCurse();
        });
    }

    resetForm() {
        const cursePenaltySelect = document.getElementById('curse-penalty-select');
        const curseBookTitle = document.getElementById('curse-book-title');
        const addCurseButton = document.getElementById('add-curse-button');

        if (cursePenaltySelect) cursePenaltySelect.value = '';
        if (curseBookTitle) curseBookTitle.value = '';
        this.editingCurseInfo = null;
        if (addCurseButton) addCurseButton.textContent = 'Add Curse';
    }

    handleAddCurse() {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        const cursePenaltySelect = document.getElementById('curse-penalty-select');
        const curseBookTitle = document.getElementById('curse-book-title');
        const curseName = cursePenaltySelect?.value;
        const bookTitle = curseBookTitle?.value || '';

        // Clear previous errors
        const curseFormContainer = document.querySelector('.add-curse-form');
        if (curseFormContainer) {
            clearFormError(curseFormContainer);
            if (cursePenaltySelect) clearFieldError(cursePenaltySelect);
        }

        const validator = new Validator();
        validator.addRule('curseName', required('Please select a curse penalty.'));

        const validation = validator.validate({ curseName });
        if (!validation.valid) {
            if (curseFormContainer && validation.errors.curseName && cursePenaltySelect) {
                showFieldError(cursePenaltySelect, validation.errors.curseName);
            }
            return;
        }

        const curseData = data.curseTable[curseName];
        if (!curseData) return;

        if (this.editingCurseInfo !== null) {
            // Editing existing curse
            stateAdapter.updateActiveCurse(this.editingCurseInfo.index, {
                name: curseName,
                requirement: curseData.requirement,
                book: bookTitle
            });
            uiModule.renderActiveCurses();
            this.saveState();
            this.resetForm();
        } else {
            // Adding new curse
            stateAdapter.addActiveCurse({
                name: curseName,
                requirement: curseData.requirement,
                book: bookTitle
            });
            uiModule.renderActiveCurses();
            this.saveState();
            this.resetForm();
        }
    }

    /**
     * Handle curse-related clicks - called from main delegated handler
     */
    handleClick(target) {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        if (!target.dataset.index) return false;

        const index = parseInt(target.dataset.index || '0', 10);

        if (target.classList.contains('complete-curse-btn')) {
            stateAdapter.moveCurseToCompleted(index);
            uiModule.renderActiveCurses();
            uiModule.renderCompletedCurses();
            this.saveState();
            return true;
        }

        if (target.classList.contains('edit-curse-btn')) {
            const activeCurses = stateAdapter.getActiveCurses();
            const curse = activeCurses[index];
            if (!curse) return true;

            const cursePenaltySelect = document.getElementById('curse-penalty-select');
            const curseBookTitle = document.getElementById('curse-book-title');
            const addCurseButton = document.getElementById('add-curse-button');

            if (cursePenaltySelect) cursePenaltySelect.value = curse.name;
            if (curseBookTitle) curseBookTitle.value = curse.book || '';
            this.editingCurseInfo = { index };
            if (addCurseButton) addCurseButton.textContent = 'Update Curse';
            return true;
        }

        if (target.classList.contains('delete-curse-btn')) {
            const list = target.dataset.list;
            if (list === 'completed') {
                if (confirm(`Are you sure you want to delete this completed curse penalty?`)) {
                    stateAdapter.removeCompletedCurse(index);
                    uiModule.renderCompletedCurses();
                    this.saveState();
                }
            } else {
                if (confirm(`Are you sure you want to delete this curse penalty?`)) {
                    stateAdapter.removeActiveCurse(index);
                    uiModule.renderActiveCurses();
                    this.saveState();
                }
            }
            return true;
        }

        return false;
    }
}

