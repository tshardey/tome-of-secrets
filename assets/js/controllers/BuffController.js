/**
 * BuffController - Handles temporary and atmospheric buffs
 * 
 * Manages:
 * - Adding custom temporary buffs
 * - Marking buffs as used
 * - Removing buffs
 * - Atmospheric buff tracking
 */

import { BaseController } from './BaseController.js';
import { parseIntOr, trimOrEmpty } from '../utils/helpers.js';
import { Validator, required } from '../services/Validator.js';
import { clearFormError, clearFieldError, showFieldError } from '../utils/formErrors.js';

export class BuffController extends BaseController {
    initialize() {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        const tempBuffNameInput = document.getElementById('temp-buff-name');
        const tempBuffDescInput = document.getElementById('temp-buff-description');
        const tempBuffDurationSelect = document.getElementById('temp-buff-duration');
        const addTempBuffButton = document.getElementById('add-temp-buff-button');
        const keeperBackgroundSelect = document.getElementById('keeperBackground');

        // Add custom temporary buff
        if (addTempBuffButton) {
            this.addEventListener(addTempBuffButton, 'click', () => {
                this.handleAddTemporaryBuff();
            });
        }

        // Atmospheric buff active checkbox clicks
        this.addEventListener(this.form, 'click', (e) => {
            if (e.target.classList.contains('buff-active-check')) {
                this.handleAtmosphericBuffToggle(e.target);
            }
        }, true);

        // Atmospheric buff days input
        const atmosphericBuffsBody = document.getElementById('atmospheric-buffs-body');
        if (atmosphericBuffsBody) {
            this.addEventListener(atmosphericBuffsBody, 'input', (e) => {
                if (e.target.classList.contains('buff-days-input')) {
                    const buffName = e.target.dataset.buffName;
                    const daysUsed = parseIntOr(e.target.value, 0);
                    stateAdapter.setAtmosphericBuffDaysUsed(buffName, daysUsed);
                    uiModule.updateBuffTotal(e.target);
                }
            });
        }

        this.keeperBackgroundSelect = keeperBackgroundSelect;
    }

    handleAddTemporaryBuff() {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        const tempBuffNameInput = document.getElementById('temp-buff-name');
        const tempBuffDescInput = document.getElementById('temp-buff-description');
        const tempBuffDurationSelect = document.getElementById('temp-buff-duration');

        if (!tempBuffNameInput || !tempBuffDescInput || !tempBuffDurationSelect) return;

        const name = trimOrEmpty(tempBuffNameInput.value);
        const description = trimOrEmpty(tempBuffDescInput.value);
        const duration = tempBuffDurationSelect.value;

        // Clear previous errors
        const buffFormContainer = document.querySelector('.add-temp-buff-form');
        if (buffFormContainer) {
            clearFormError(buffFormContainer);
            clearFieldError(tempBuffNameInput);
            clearFieldError(tempBuffDescInput);
        }

        const validator = new Validator();
        validator.addRule('name', required('Buff name is required'));
        validator.addRule('description', required('Buff description is required'));

        const validation = validator.validate({ name, description });
        if (!validation.valid) {
            if (buffFormContainer && validation.errors) {
                if (validation.errors.name) showFieldError(tempBuffNameInput, validation.errors.name);
                if (validation.errors.description) showFieldError(tempBuffDescInput, validation.errors.description);
            }
            return;
        }

        // Calculate initial monthsRemaining based on duration
        let monthsRemaining = 0;
        if (duration === 'two-months') {
            monthsRemaining = 2;
        } else if (duration === 'until-end-month') {
            monthsRemaining = 1;
        }

        stateAdapter.addTemporaryBuff({
            name,
            description,
            duration,
            monthsRemaining,
            status: 'active'
        });

        // Clear inputs
        tempBuffNameInput.value = '';
        tempBuffDescInput.value = '';
        tempBuffDurationSelect.value = 'two-months';

        const wearableSlotsInput = document.getElementById('wearable-slots');
        const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
        const familiarSlotsInput = document.getElementById('familiar-slots');
        
        uiModule.renderTemporaryBuffs();
        uiModule.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
        this.saveState();
    }

    handleAtmosphericBuffToggle(checkbox) {
        const { stateAdapter } = this;
        const buffName = checkbox.dataset.buffName;
        const background = this.keeperBackgroundSelect?.value || '';

        // Grove Tender's "Soaking in Nature" is always active and can't be toggled
        if (background === 'groveTender' && buffName === 'The Soaking in Nature') {
            checkbox.checked = true; // Keep it checked
            return;
        }

        stateAdapter.setAtmosphericBuffActive(buffName, checkbox.checked);
        // No need to save state on every check, it's temporary for the day
    }

    /**
     * Handle buff-related clicks - called from main delegated handler
     */
    handleClick(target) {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        if (!target.dataset.index) return false;

        const index = parseInt(target.dataset.index || '0', 10);

        if (target.classList.contains('mark-buff-used-btn')) {
            const temporaryBuffs = stateAdapter.getTemporaryBuffs();
            if (temporaryBuffs[index]) {
                stateAdapter.updateTemporaryBuff(index, { status: 'used' });
                
                const wearableSlotsInput = document.getElementById('wearable-slots');
                const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
                const familiarSlotsInput = document.getElementById('familiar-slots');
                
                uiModule.renderTemporaryBuffs();
                uiModule.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                this.saveState();
            }
            return true;
        }

        if (target.classList.contains('remove-buff-btn')) {
            if (confirm('Are you sure you want to remove this buff?')) {
                stateAdapter.removeTemporaryBuff(index);
                
                const wearableSlotsInput = document.getElementById('wearable-slots');
                const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
                const familiarSlotsInput = document.getElementById('familiar-slots');
                
                uiModule.renderTemporaryBuffs();
                uiModule.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                this.saveState();
            }
            return true;
        }

        return false;
    }
}

