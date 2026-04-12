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
import { escapeHtml } from '../utils/sanitize.js';
import { DrawerManager } from '../ui/DrawerManager.js';

export class AbilityController extends BaseController {
    initialize() {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        this.drawerManager = new DrawerManager({
            'school-mastery': {
                backdrop: 'school-mastery-backdrop',
                drawer: 'school-mastery-drawer',
                closeBtn: 'close-school-mastery',
                onBeforeOpen: (drawerEl) => {
                    const contentContainer = document.getElementById('school-mastery-abilities-content');
                    if (contentContainer) {
                        this.renderSchoolMasteryAbilities(contentContainer);
                    }
                }
            }
        });

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
                if (uiModule.renderActivatedAbilities) {
                    uiModule.renderActivatedAbilities();
                }
                this.saveState();
            } else {
                const container = document.querySelector('.mastery-abilities-container');
                if (container) {
                    clearFormError(container);
                    showFormError(container, 'Not enough School Mastery Points to learn this ability!');
                }
            }
        });

        // School Mastery Guide button handler
        const openSchoolMasteryBtn = document.getElementById('open-school-mastery-btn');
        if (openSchoolMasteryBtn) {
            this.addEventListener(openSchoolMasteryBtn, 'click', () => {
                this.openSchoolMasteryDrawer();
            });
        }

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
                if (uiModule.renderActivatedAbilities) {
                    uiModule.renderActivatedAbilities();
                }
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

    /**
     * Open the school mastery abilities drawer
     */
    openSchoolMasteryDrawer() {
        this.drawerManager.open('school-mastery');
    }

    /**
     * Close the school mastery abilities drawer
     */
    closeSchoolMasteryDrawer() {
        this.drawerManager.close('school-mastery');
    }

    /**
     * Render school mastery abilities from JSON data
     */
    renderSchoolMasteryAbilities(container) {
        if (!container || !data.masteryAbilities || !data.schoolBenefits) return;
        
        // Group abilities by school
        const abilitiesBySchool = {};
        for (const [name, ability] of Object.entries(data.masteryAbilities)) {
            const school = ability.school;
            if (!abilitiesBySchool[school]) {
                abilitiesBySchool[school] = [];
            }
            abilitiesBySchool[school].push({ name, ...ability });
        }
        
        // School display order (using the order from schoolBenefits)
        const schoolOrder = ['Abjuration', 'Divination', 'Evocation', 'Enchantment', 'Conjuration', 'Transmutation'];
        
        let html = '';
        
        // Render each school in order
        for (const school of schoolOrder) {
            const abilities = abilitiesBySchool[school] || [];
            if (abilities.length === 0) continue;
            
            const schoolData = data.schoolBenefits[school];
            if (!schoolData) continue;
            
            // Sort abilities by cost (1 SMP first, then 2 SMP)
            abilities.sort((a, b) => (a.cost || 0) - (b.cost || 0));
            
            // Construct title from school name
            const schoolTitle = `School of ${school}`;
            const schoolDescription = schoolData.description || '';
            
            html += `
            <h3>${escapeHtml(schoolTitle)}</h3>
            <p>${escapeHtml(schoolDescription)}</p>
            <table class="tracker-table">
                <thead>
                    <tr>
                        <th>Ability Name</th>
                        <th>Cost</th>
                        <th>Benefit</th>
                    </tr>
                </thead>
                <tbody>
`;
            
            abilities.forEach(ability => {
                // Note: benefit is plain text from JSON, so we escape it
                const benefit = escapeHtml(ability.benefit || '');
                html += `
                    <tr>
                        <td><strong>${escapeHtml(ability.name)}</strong></td>
                        <td>${ability.cost || 0} SMP</td>
                        <td>${benefit}</td>
                    </tr>
`;
            });
            
            html += `
                </tbody>
            </table>
`;
        }
        
        container.innerHTML = html;
    }
}

