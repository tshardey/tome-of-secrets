/**
 * BuffController - Handles temporary and atmospheric buffs
 * 
 * Manages:
 * - Adding predefined temporary buffs from dropdown
 * - Marking buffs as used
 * - Removing buffs
 * - Atmospheric buff tracking
 * - Room visualization (sticker show/hide when atmospheric buffs toggle)
 */

import { BaseController } from './BaseController.js';
import { parseIntOr } from '../utils/helpers.js';
import * as dataModule from '../character-sheet/data.js';
import { getActiveStickers } from '../services/RoomVisualizationService.js';
import * as RoomVisualization from '../components/RoomVisualization.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { getRoomTheme } from '../character-sheet/data.js';

const DEFAULT_THEME_ID = 'cozy-modern';

export class BuffController extends BaseController {
    initialize(updateCurrency) {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;
        
        this.updateCurrency = updateCurrency;

        if (!uiModule) return;

        const tempBuffSelect = document.getElementById('temp-buff-select');
        const addTempBuffFromDropdownButton = document.getElementById('add-temp-buff-from-dropdown-button');
        const keeperBackgroundSelect = document.getElementById('keeperBackground');

        // Add temporary buff from dropdown
        if (addTempBuffFromDropdownButton) {
            this.addEventListener(addTempBuffFromDropdownButton, 'click', () => {
                this.handleAddTemporaryBuffFromDropdown();
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

        // Room visualization: initial render and sync on atmospheric buff changes
        const roomContainer = document.getElementById('room-visualization-container');
        if (roomContainer) {
            this.renderRoomVisualization();
            stateAdapter.on(STATE_EVENTS.ATMOSPHERIC_BUFFS_CHANGED, () => {
                this.renderRoomVisualization();
            });
        }
    }

    /**
     * Render the room visualization from current atmospheric buff state.
     */
    renderRoomVisualization() {
        const roomContainer = document.getElementById('room-visualization-container');
        if (!roomContainer) return;

        const theme = getRoomTheme(DEFAULT_THEME_ID);
        if (!theme) return;

        const keeperBackground = this.keeperBackgroundSelect?.value || '';
        const activeStickers = getActiveStickers(this.stateAdapter.state, DEFAULT_THEME_ID, { keeperBackground });
        RoomVisualization.render(roomContainer, theme, activeStickers);
    }

    handleAddTemporaryBuffFromDropdown() {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        const tempBuffSelect = document.getElementById('temp-buff-select');
        if (!tempBuffSelect || !tempBuffSelect.value) return;

        const buffName = tempBuffSelect.value;
        const buffData = dataModule.temporaryBuffs?.[buffName] || dataModule.temporaryBuffsFromRewards?.[buffName];
        if (!buffData) return;

        // Calculate initial monthsRemaining based on duration
        let monthsRemaining = 0;
        if (buffData.duration === 'two-months') {
            monthsRemaining = 2;
        } else if (buffData.duration === 'until-end-month') {
            monthsRemaining = 1;
        }

        stateAdapter.addTemporaryBuff({
            name: buffName,
            description: buffData.description,
            duration: buffData.duration,
            monthsRemaining,
            status: 'active'
        });

        // Clear selection
        tempBuffSelect.value = '';

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
        // Room visualization updates via ATMOSPHERIC_BUFFS_CHANGED listener
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
            const buff = temporaryBuffs[index];
            if (buff) {
                // Apply currency rewards when marking buff as used
                if (this.updateCurrency && buff.duration === 'one-time') {
                    // Get buff data to check for rewardModifier (check both new and legacy sources)
                    const buffData = dataModule.temporaryBuffs?.[buff.name] || dataModule.temporaryBuffsFromRewards?.[buff.name];
                    if (buffData && buffData.rewardModifier) {
                        const inkDrops = buffData.rewardModifier.inkDrops || 0;
                        const paperScraps = buffData.rewardModifier.paperScraps || 0;
                        
                        // Only apply currency if there are actual rewards (not just an empty rewardModifier object)
                        if (inkDrops > 0 || paperScraps > 0) {
                            const rewards = {
                                xp: 0,
                                inkDrops: inkDrops,
                                paperScraps: paperScraps,
                                items: []
                            };
                            this.updateCurrency(rewards);
                        }
                    }
                }
                
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
