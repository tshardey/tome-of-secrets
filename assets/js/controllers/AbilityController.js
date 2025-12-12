/**
 * AbilityController - Handles ability learning and management
 * 
 * Manages:
 * - Learning abilities
 * - Forgetting abilities (refund SMP)
 */

import { BaseController } from './BaseController.js';
import { parseIntOr } from '../utils/helpers.js';
import { clearFormError, showFormError } from '../utils/formErrors.js';
import * as data from '../character-sheet/data.js';

export class AbilityController extends BaseController {
    initialize() {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        const smpInput = document.getElementById('smp');
        const learnButton = document.getElementById('learn-ability-button');

        if (!smpInput || !learnButton) return;

        this.addEventListener(smpInput, 'input', () => {
            uiModule.renderMasteryAbilities(smpInput);
        });

        this.addEventListener(learnButton, 'click', () => {
            const abilityName = document.getElementById('ability-select').value;
            if (!abilityName) return;

            const ability = data.masteryAbilities[abilityName];
            if (!ability) return;

            let currentSmp = parseIntOr(smpInput.value, 0);
            if (currentSmp >= ability.cost) {
                smpInput.value = currentSmp - ability.cost;
                stateAdapter.addLearnedAbility(abilityName);
                uiModule.renderMasteryAbilities(smpInput);
                this.saveState();
            } else {
                const container = document.querySelector('.mastery-abilities-container');
                if (container) {
                    clearFormError(container);
                    showFormError(container, 'Not enough School Mastery Points to learn this ability!');
                }
            }
        });

        // Handle ability deletion (via delegated click handler)
        this.handleDeleteAbility = (index) => {
            const learnedAbilities = stateAdapter.getLearnedAbilities();
            const abilityName = learnedAbilities[index];
            if (!abilityName) return;

            const ability = data.masteryAbilities[abilityName];
            if (!ability) return;

            if (confirm(`Are you sure you want to forget "${abilityName}"? This will refund ${ability.cost} SMP.`)) {
                let currentSmp = parseIntOr(smpInput.value, 0);
                smpInput.value = currentSmp + ability.cost;
                stateAdapter.removeLearnedAbility(index);
                uiModule.renderMasteryAbilities(smpInput);
                this.saveState();
            }
        };
    }

    /**
     * Handle delete ability click - called from main delegated handler
     */
    handleDeleteAbilityClick(target) {
        if (target.classList.contains('delete-ability-btn')) {
            const index = parseInt(target.dataset.index || '0', 10);
            this.handleDeleteAbility(index);
            return true;
        }
        return false;
    }
}

