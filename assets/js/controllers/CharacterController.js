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
import { renderLevelingRewardsTable, processLinks } from '../table-renderer.js';
import { escapeHtml } from '../utils/sanitize.js';

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

        // Level badge click handler - open leveling rewards drawer
        const levelBadge = document.getElementById('rpg-level-badge');
        
        if (levelBadge) {
            this.addEventListener(levelBadge, 'click', () => {
                this.openLevelingRewardsDrawer();
            });
        }

        // XP current input change handler - update progress bar
        const xpCurrentInput = document.getElementById('xp-current');
        if (xpCurrentInput) {
            this.addEventListener(xpCurrentInput, 'input', () => {
                uiModule.updateXpProgressBar();
            });
            this.addEventListener(xpCurrentInput, 'change', () => {
                uiModule.updateXpProgressBar();
            });
        }

        // Level Up button handler
        const levelUpBtn = document.getElementById('level-up-btn');
        if (levelUpBtn) {
            this.addEventListener(levelUpBtn, 'click', () => {
                this.handleLevelUp();
            });
        }

        // Level changes - handle automatic rewards
        this.addEventListener(levelInput, 'change', () => {
            const newLevel = parseIntOr(levelInput.value, 1);
            const previousLevel = parseIntOr(formData.previousLevel, 1);
            
            // Skip if level didn't actually change (e.g., from handleLevelUp)
            if (newLevel === previousLevel) {
                // Still update UI
                uiModule.updateXpNeeded(levelInput, xpNeededInput);
                uiModule.updateXpProgressBar();
                uiModule.renderPermanentBonuses(levelInput);
                return;
            }
            
            // Update UI first
            uiModule.updateXpNeeded(levelInput, xpNeededInput);
            uiModule.updateXpProgressBar();
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

    /**
     * Handle level up button click
     * Resets XP to (current XP - required XP) and increments level
     * Carries over excess XP to the new level
     */
    handleLevelUp() {
        const { stateAdapter, form } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        const levelInput = document.getElementById('level');
        const xpCurrentInput = document.getElementById('xp-current');
        const xpNeededInput = document.getElementById('xp-needed');

        if (!levelInput || !xpCurrentInput) return;

        const currentLevel = parseIntOr(levelInput.value, 1);
        const currentXP = parseIntOr(xpCurrentInput.value, 0);
        // xpLevels is keyed by strings ("1", "2", ...) from JSON
        const xpNeeded = data.xpLevels[String(currentLevel)];

        // Check if we can level up
        if (!xpNeeded || xpNeeded === "Max" || xpNeeded === 0) {
            // Already at max level
            return;
        }

        const xpNeededNum = parseInt(xpNeeded);
        if (currentXP < xpNeededNum) {
            // Not enough XP
            return;
        }

        // Calculate remaining XP (carry over excess)
        const remainingXP = currentXP - xpNeededNum;
        
        // Get form data for level rewards tracking
        const formData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
        const previousLevel = parseIntOr(formData.previousLevel, currentLevel);
        
        // Increment level
        const newLevel = currentLevel + 1;
        
        // Update previousLevel BEFORE setting the value to prevent duplicate rewards in change handler
        formData.previousLevel = newLevel;
        safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, formData);
        
        // Now set the values - this will trigger the change event, but it will see newLevel === previousLevel
        levelInput.value = newLevel;
        xpCurrentInput.value = remainingXP;

        // Handle automatic level rewards for the new level
        if (data.levelRewards) {
            const inkDropsInput = document.getElementById('inkDrops');
            const paperScrapsInput = document.getElementById('paperScraps');
            const smpInput = document.getElementById('smp');
            
            let totalInkDrops = 0;
            let totalPaperScraps = 0;
            let totalSmp = 0;
            let totalInventorySlots = 0;
            
            // Apply rewards for the new level only
            const levelStr = String(newLevel);
            const rewards = data.levelRewards[levelStr];
            if (rewards) {
                totalInkDrops += rewards.inkDrops || 0;
                totalPaperScraps += rewards.paperScraps || 0;
                totalSmp += rewards.smp || 0;
                totalInventorySlots += rewards.inventorySlot || 0;
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
                uiModule.renderMasteryAbilities(smpInput);
            }
            
            // Update inventory UI if needed
            if (totalInventorySlots > 0) {
                uiModule.renderLoadout(
                    document.getElementById('wearable-slots'),
                    document.getElementById('non-wearable-slots'),
                    document.getElementById('familiar-slots')
                );
            }
        }

        // Update UI (this will also be called by the change event, but that's fine - it's idempotent)
        uiModule.updateXpNeeded(levelInput, xpNeededInput);
        uiModule.updateXpProgressBar();
        uiModule.renderPermanentBonuses(levelInput);

        this.saveState();
    }

    /**
     * Open the leveling rewards drawer
     */
    openLevelingRewardsDrawer() {
        const backdrop = document.getElementById('leveling-rewards-backdrop');
        const drawer = document.getElementById('leveling-rewards-drawer');
        const levelingRewardsTable = document.getElementById('leveling-rewards-table');
        
        if (!backdrop || !drawer) return;
        
        // Render the leveling rewards table if it's empty or needs updating
        if (levelingRewardsTable && (!levelingRewardsTable.innerHTML || levelingRewardsTable.innerHTML.trim() === '')) {
            try {
                const tableHtml = renderLevelingRewardsTable();
                levelingRewardsTable.innerHTML = processLinks(tableHtml);
            } catch (err) {
                console.error('Error rendering leveling rewards table:', err);
            }
        }
        
        // Render permanent bonuses table from JSON data
        const permanentBonusesTable = document.getElementById('permanent-bonuses-table');
        if (permanentBonusesTable) {
            this.renderPermanentBonusesTable(permanentBonusesTable);
        }
        
        // Show drawer
        drawer.style.display = 'flex';
        backdrop.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Close button handler
        const closeBtn = document.getElementById('close-leveling-rewards');
        if (closeBtn) {
            const closeHandler = () => {
                this.closeLevelingRewardsDrawer();
                closeBtn.removeEventListener('click', closeHandler);
            };
            closeBtn.addEventListener('click', closeHandler);
        }
        
        // Backdrop click handler
        const backdropHandler = (e) => {
            if (e.target === backdrop) {
                this.closeLevelingRewardsDrawer();
                backdrop.removeEventListener('click', backdropHandler);
            }
        };
        backdrop.addEventListener('click', backdropHandler);
        
        // Escape key handler
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeLevelingRewardsDrawer();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }

    /**
     * Close the leveling rewards drawer
     */
    closeLevelingRewardsDrawer() {
        const backdrop = document.getElementById('leveling-rewards-backdrop');
        const drawer = document.getElementById('leveling-rewards-drawer');
        
        if (!backdrop || !drawer) return;
        
        drawer.style.display = 'none';
        backdrop.classList.remove('active');
        document.body.style.overflow = '';
    }

    /**
     * Render permanent bonuses table from JSON data
     */
    renderPermanentBonusesTable(container) {
        if (!container || !data.permanentBonuses) return;
        
        let html = `
<table class="tracker-table">
  <thead>
    <tr>
      <th>Level</th>
      <th>Permanent Bonus Unlocked</th>
    </tr>
  </thead>
  <tbody>
`;
        
        // Sort levels numerically
        const levels = Object.keys(data.permanentBonuses).map(Number).sort((a, b) => a - b);
        
        levels.forEach(level => {
            const bonus = data.permanentBonuses[String(level)];
            if (bonus) {
                // Note: bonus already contains HTML from JSON (e.g., <strong> tags)
                html += `
    <tr>
      <td>${escapeHtml(String(level))}</td>
      <td>${bonus}</td>
    </tr>
`;
            }
        });
        
        html += `
  </tbody>
</table>
`;
        
        container.innerHTML = html;
    }
}

