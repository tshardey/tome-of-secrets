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
import { parseIntOr } from '../utils/helpers.js';
import { safeGetJSON, safeSetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import * as data from '../character-sheet/data.js';

export class CharacterController extends BaseController {
    initialize() {
        const { stateAdapter, form } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        const levelInput = document.getElementById('level');
        const xpNeededInput = document.getElementById('xp-needed');
        const inkDropsInput = document.getElementById('inkDrops');
        const paperScrapsInput = document.getElementById('paperScraps');
        const smpInput = document.getElementById('smp');
        const keeperBackgroundSelect = document.getElementById('keeperBackground');
        const wizardSchoolSelect = document.getElementById('wizardSchool');
        const librarySanctumSelect = document.getElementById('librarySanctum');

        if (!levelInput || !keeperBackgroundSelect) return;

        // Initialize previous level tracking if not set
        const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
        if (!formData.previousLevel) {
            formData.previousLevel = parseIntOr(levelInput.value, 1);
            safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, formData);
        }

        // Level changes - handle automatic rewards
        this.addEventListener(levelInput, 'change', () => {
            const newLevel = parseIntOr(levelInput.value, 1);
            const previousLevel = parseIntOr(formData.previousLevel, 1);
            
            // Update UI first
            uiModule.updateXpNeeded(levelInput, xpNeededInput);
            uiModule.renderPermanentBonuses(levelInput);
            
            // If level increased, apply rewards for all levels between previous and new
            if (newLevel > previousLevel && data.levelRewards) {
                let totalInkDrops = 0;
                let totalPaperScraps = 0;
                let totalSmp = 0;
                let totalInventorySlots = 0;
                
                // Apply rewards for each level gained
                for (let level = previousLevel + 1; level <= newLevel; level++) {
                    const levelStr = String(level);
                    const rewards = data.levelRewards[levelStr];
                    if (rewards) {
                        totalInkDrops += rewards.inkDrops || 0;
                        totalPaperScraps += rewards.paperScraps || 0;
                        totalSmp += rewards.smp || 0;
                        totalInventorySlots += rewards.inventorySlot || 0;
                    }
                }
                
                // Apply currency rewards
                if (totalInkDrops > 0 && inkDropsInput) {
                    const currentInk = parseIntOr(inkDropsInput.value, 0);
                    inkDropsInput.value = currentInk + totalInkDrops;
                }
                
                if (totalPaperScraps > 0 && paperScrapsInput) {
                    const currentPaper = parseIntOr(paperScrapsInput.value, 0);
                    paperScrapsInput.value = currentPaper + totalPaperScraps;
                }
                
                if (totalSmp > 0 && smpInput) {
                    const currentSmp = parseIntOr(smpInput.value, 0);
                    smpInput.value = currentSmp + totalSmp;
                    // Update SMP display
                    uiModule.renderMasteryAbilities(smpInput);
                }
                
                // Update inventory UI to show unallocated slots note if needed
                // (Note: unallocated slots are now calculated dynamically in renderLoadout)
                if (totalInventorySlots > 0) {
                    uiModule.renderLoadout(
                        document.getElementById('wearable-slots'),
                        document.getElementById('non-wearable-slots'),
                        document.getElementById('familiar-slots')
                    );
                }
                
                // Update previous level
                formData.previousLevel = newLevel;
                safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, formData);
            } else if (newLevel < previousLevel) {
                // Level decreased - update previous level but don't remove rewards
                formData.previousLevel = newLevel;
                safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, formData);
            }
            
            this.saveState();
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

