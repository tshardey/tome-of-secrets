/**
 * CharacterController - Handles character info changes
 * 
 * Manages:
 * - Level changes
 * - Background selection
 * - Wizard School selection
 * - Library Sanctum selection
 */

import { BaseController } from './BaseController.js';

export class CharacterController extends BaseController {
    initialize() {
        const { stateAdapter, form } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        const levelInput = document.getElementById('level');
        const xpNeededInput = document.getElementById('xp-needed');
        const keeperBackgroundSelect = document.getElementById('keeperBackground');
        const wizardSchoolSelect = document.getElementById('wizardSchool');
        const librarySanctumSelect = document.getElementById('librarySanctum');

        if (!levelInput || !keeperBackgroundSelect) return;

        // Level changes
        this.addEventListener(levelInput, 'change', () => {
            uiModule.updateXpNeeded(levelInput, xpNeededInput);
            uiModule.renderPermanentBonuses(levelInput);
        });

        // Character selection changes
        const onSanctumChange = () => {
            uiModule.renderBenefits(wizardSchoolSelect, librarySanctumSelect, keeperBackgroundSelect);
            uiModule.renderAtmosphericBuffs(librarySanctumSelect);
        };

        this.addEventListener(keeperBackgroundSelect, 'change', () => {
            uiModule.renderBenefits(wizardSchoolSelect, librarySanctumSelect, keeperBackgroundSelect);
            uiModule.renderAtmosphericBuffs(librarySanctumSelect);
            // Update quest buffs dropdown with new background bonuses
            const wearableSlotsInput = document.getElementById('wearable-slots');
            const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
            const familiarSlotsInput = document.getElementById('familiar-slots');
            if (wearableSlotsInput) {
                uiModule.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
            }
            this.saveState();
        });

        this.addEventListener(wizardSchoolSelect, 'change', () => {
            uiModule.renderBenefits(wizardSchoolSelect, librarySanctumSelect, keeperBackgroundSelect);
            this.saveState();
        });

        this.addEventListener(librarySanctumSelect, 'change', () => {
            onSanctumChange();
            this.saveState();
        });
    }
}

