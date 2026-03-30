/**
 * OtherQuestDeckController - Card-based flow for Extra Credit and Restoration Projects
 *
 * - Extra Credit: Deck (cardback); click to draw a card. Drawn cards appear in the drawn area and can be
 *   selected like side/genre quests; "Add selected" adds them as Extra Credit quests.
 * - Restoration: Show wings as card backs; selecting a wing shows that wing's projects as card faces.
 *   User selects one or more project cards; "Add selected" adds them as restoration quests.
 */

import { BaseController } from './BaseController.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { characterState } from '../character-sheet/state.js';
import { RewardCalculator } from '../services/RewardCalculator.js';
import { assignQuestToPeriod, PERIOD_TYPES } from '../services/PeriodService.js';

/** Month names for fallback when assignQuestToPeriod does not set month/year (e.g. invalid period). */
const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Resolve month and year for a quest. Uses assigned period when present; otherwise current date.
 * @param {{ month?: string, year?: string }} assigned - Return value of assignQuestToPeriod
 * @returns {{ month: string, year: string }}
 */
function resolveQuestPeriod(assigned) {
    if (assigned && assigned.month != null && assigned.year != null) {
        return { month: assigned.month, year: String(assigned.year) };
    }
    const now = new Date();
    return {
        month: MONTH_NAMES[now.getMonth()],
        year: String(now.getFullYear())
    };
}
import * as data from '../character-sheet/data.js';
import { getExtraCreditCardImage, getRestorationCardbackImage } from '../utils/questCardImage.js';
import {
    createExtraCreditDeckViewModel,
    createRestorationDeckViewModel
} from '../viewModels/questDeckViewModel.js';
import {
    renderCardback,
    renderExtraCreditCard,
    renderRestorationProjectCard,
    renderRestorationWingCardback,
    wrapCardSelectable
} from '../character-sheet/cardRenderer.js';
import { clearElement } from '../utils/domHelpers.js';
import { toast } from '../ui/toast.js';
import {
    computeQuestDeckDrawCount,
    QUEST_DECK_EXTRA_CREDIT,
    DIVINATION_DIE_HELPER_TOAST,
    consumedHelperIsDivinationSchoolDie
} from '../services/QuestDrawBoost.js';

function generateQuestId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export class OtherQuestDeckController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        /** @type {string|null} */
        this.selectedWingId = null;
        /** @type {Set<number>} selected indices in the restoration projects list */
        this.selectedIndices = new Set();
        /** @type {Array<{cardImage: string}>} drawn Extra Credit cards */
        this.drawnExtraCredit = [];
        /** @type {Set<number>} selected indices in the drawn Extra Credit list */
        this.selectedIndicesExtraCredit = new Set();
    }

    initialize() {
        const { stateAdapter } = this;
        const { ui: uiModule } = this.dependencies;

        if (!uiModule) return;

        const extraCreditDeckContainer = document.getElementById('extra-credit-deck-container');
        const extraCreditDrawnDisplay = document.getElementById('extra-credit-drawn-card-display');
        const restorationEntryContainer = document.getElementById('restoration-entry-container');
        const restorationExpandable = document.getElementById('restoration-expandable');
        const wingCardsContainer = document.getElementById('restoration-wing-cards-container');
        const restorationDrawnDisplay = document.getElementById('restoration-drawn-card-display');

        if (!extraCreditDeckContainer || !extraCreditDrawnDisplay || !restorationEntryContainer || !restorationExpandable || !wingCardsContainer || !restorationDrawnDisplay) return;

        this.extraCreditDeckContainer = extraCreditDeckContainer;
        this.extraCreditDrawnDisplay = extraCreditDrawnDisplay;
        this.restorationEntryContainer = restorationEntryContainer;
        this.restorationExpandable = restorationExpandable;
        this.wingCardsContainer = wingCardsContainer;
        this.restorationDrawnDisplay = restorationDrawnDisplay;

        this.renderExtraCredit();
        this.renderRestoration();

        this.addEventListener(extraCreditDeckContainer, 'click', () => this.handleExtraCreditDeckClick());

        const toggleRestorationExpandable = () => {
            const isExpanded = this.restorationExpandable.style.display !== 'none';
            this.restorationExpandable.style.display = isExpanded ? 'none' : 'block';
            this.restorationEntryContainer.setAttribute('aria-expanded', String(!isExpanded));
        };
        this.addEventListener(restorationEntryContainer, 'click', toggleRestorationExpandable);
        this.addEventListener(restorationEntryContainer, 'keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleRestorationExpandable();
            }
        });

        this.addEventListener(wingCardsContainer, 'click', (e) => {
            const wingEl = e.target.closest('[data-wing-id]');
            if (wingEl && wingEl.classList.contains('available')) {
                this.handleWingSelect(wingEl.dataset.wingId);
            }
        });

        stateAdapter.on(STATE_EVENTS.ACTIVE_ASSIGNMENTS_CHANGED, () => {
            this.renderRestoration();
        });
        stateAdapter.on(STATE_EVENTS.COMPLETED_RESTORATION_PROJECTS_CHANGED, () => {
            this.renderRestoration();
        });
    }

    renderExtraCredit() {
        if (!this.extraCreditDeckContainer || !this.extraCreditDrawnDisplay) return;

        const viewModel = createExtraCreditDeckViewModel(this.drawnExtraCredit);

        clearElement(this.extraCreditDeckContainer);
        const deck = renderCardback(
            viewModel.deck.cardbackImage,
            viewModel.deck.available,
            viewModel.deck.availableCount
        );
        this.extraCreditDeckContainer.appendChild(deck);

        clearElement(this.extraCreditDrawnDisplay);
        viewModel.drawnCards.forEach((cardData, index) => {
            const card = renderExtraCreditCard(cardData);
            if (!card) return;
            const wrapper = wrapCardSelectable(card, index, this.selectedIndicesExtraCredit.has(index), (idx, ev) => {
                if (ev.ctrlKey || ev.metaKey) {
                    if (this.selectedIndicesExtraCredit.has(idx)) this.selectedIndicesExtraCredit.delete(idx);
                    else this.selectedIndicesExtraCredit.add(idx);
                } else {
                    this.selectedIndicesExtraCredit = new Set([idx]);
                }
                this.renderExtraCredit();
                this.dependencies.updateDeckActionsLabel?.();
            });
            this.extraCreditDrawnDisplay.appendChild(wrapper);
        });

        this.dependencies.updateDeckActionsLabel?.();
    }

    handleExtraCreditDeckClick() {
        const { drawCount, consumedHelper } = computeQuestDeckDrawCount(
            this.stateAdapter,
            QUEST_DECK_EXTRA_CREDIT
        );
        const count = Math.max(1, drawCount);
        for (let i = 0; i < count; i++) {
            this.drawnExtraCredit.push({ cardImage: getExtraCreditCardImage() });
            this.selectedIndicesExtraCredit.add(this.drawnExtraCredit.length - 1);
        }
        if (consumedHelper) {
            const msg = consumedHelperIsDivinationSchoolDie(consumedHelper)
                ? DIVINATION_DIE_HELPER_TOAST
                : `Monthly draw helper used: ${consumedHelper.name} (${count} Extra Credit card${count !== 1 ? 's' : ''})`;
            toast.info(msg);
            this.dependencies.ui?.renderQuestDrawHelpers?.();
            this.saveState();
        }
        this.renderExtraCredit();
        this.dependencies.updateDeckActionsLabel?.();
    }

    renderRestoration() {
        if (!this.restorationEntryContainer || !this.wingCardsContainer || !this.restorationDrawnDisplay) return;

        // Entry card: card-back-restoration.png (click to expand wings)
        clearElement(this.restorationEntryContainer);
        const entryImg = document.createElement('img');
        entryImg.className = 'cardback-image';
        entryImg.src = getRestorationCardbackImage();
        entryImg.alt = 'Restoration Projects';
        this.restorationEntryContainer.appendChild(entryImg);

        const viewModel = createRestorationDeckViewModel(characterState, this.selectedWingId);

        clearElement(this.wingCardsContainer);
        viewModel.wings.forEach((wing) => {
            const el = renderRestorationWingCardback(wing);
            if (el) this.wingCardsContainer.appendChild(el);
        });

        clearElement(this.restorationDrawnDisplay);
        if (this.selectedWingId && viewModel.projects.length > 0) {
            viewModel.projects.forEach((cardData, index) => {
                const card = renderRestorationProjectCard(cardData);
                if (!card) return;
                const wrapper = wrapCardSelectable(card, index, this.selectedIndices.has(index), (idx, ev) => {
                    if (ev.ctrlKey || ev.metaKey) {
                        if (this.selectedIndices.has(idx)) this.selectedIndices.delete(idx);
                        else this.selectedIndices.add(idx);
                    } else {
                        this.selectedIndices = new Set([idx]);
                    }
                    this.renderRestoration();
                    this.dependencies.updateDeckActionsLabel?.();
                });
                this.restorationDrawnDisplay.appendChild(wrapper);
            });
        }

        this.dependencies.updateDeckActionsLabel?.();
    }

    handleWingSelect(wingId) {
        this.selectedWingId = wingId || null;
        this.selectedIndices = new Set();
        this.renderRestoration();
        this.dependencies.updateDeckActionsLabel?.();
    }

    /**
     * Add selected drawn Extra Credit cards as quests. Called from shared "Add selected" button.
     */
    handleAddExtraCreditFromCard() {
        const toAdd = Array.from(this.selectedIndicesExtraCredit)
            .filter((i) => i >= 0 && i < this.drawnExtraCredit.length);
        if (toAdd.length === 0) return;

        const rewards = RewardCalculator.getBaseRewards('⭐ Extra Credit', '');
        const rewardsJson = rewards && typeof rewards.toJSON === 'function' ? rewards.toJSON() : rewards;
        const questJSONs = [];

        for (let i = 0; i < toAdd.length; i++) {
            const quest = {
                id: generateQuestId(),
                type: '⭐ Extra Credit',
                prompt: '',
                rewards: rewardsJson,
                buffs: [],
                dateAdded: new Date().toISOString(),
                book: '',
                bookAuthor: '',
                bookId: null
            };
            const assigned = assignQuestToPeriod(quest, PERIOD_TYPES.MONTHLY);
            const { month, year } = resolveQuestPeriod(assigned);
            questJSONs.push({ ...quest, month, year });
        }

        this.stateAdapter.addActiveQuests(questJSONs);
        if (this.dependencies.ui) this.dependencies.ui.renderActiveAssignments();
        this.drawnExtraCredit = [];
        this.selectedIndicesExtraCredit = new Set();
        this.renderExtraCredit();
        this.saveState();
        this.dependencies.updateDeckActionsLabel?.();
        toast.success(`${questJSONs.length} Extra Credit quest(s) added.`);
    }

    /**
     * Add selected restoration projects as quests. Called from shared "Add selected" button.
     */
    handleAddRestorationFromCard() {
        if (!this.selectedWingId) return;
        const viewModel = createRestorationDeckViewModel(characterState, this.selectedWingId);
        const toAdd = Array.from(this.selectedIndices)
            .filter((i) => i >= 0 && i < viewModel.projects.length)
            .map((i) => viewModel.projects[i]);
        if (toAdd.length === 0) return;

        const wing = data.wings?.[this.selectedWingId];
        const activeQuests = [...(characterState[STORAGE_KEYS.ACTIVE_ASSIGNMENTS] || [])];
        const questJSONs = [];

        for (const cardData of toAdd) {
            const project = cardData.project;
            const projectId = cardData.projectId;
            const prompt = `${project.name}: ${project.completionPrompt}`;

            const existing = activeQuests.some(
                (q) => q.type === '🔨 Restoration Project' && q.restorationData?.projectId === projectId
            );
            if (existing) {
                toast.warning(`"${project.name}" is already in your quest log.`);
                continue;
            }

            const quest = {
                id: generateQuestId(),
                type: '🔨 Restoration Project',
                prompt,
                rewards: {
                    xp: 0,
                    inkDrops: 0,
                    paperScraps: 0,
                    blueprints: 0,
                    items: []
                },
                buffs: [],
                dateAdded: new Date().toISOString(),
                book: '',
                bookAuthor: '',
                bookId: null,
                restorationData: {
                    wingId: this.selectedWingId,
                    wingName: wing?.name || '',
                    projectId,
                    projectName: project.name,
                    cost: project.cost || 0,
                    rewardType: project.reward?.type || null,
                    rewardSuggestedItems: project.reward?.suggestedItems || []
                }
            };
            const assigned = assignQuestToPeriod(quest, PERIOD_TYPES.MONTHLY);
            const { month, year } = resolveQuestPeriod(assigned);
            questJSONs.push({ ...quest, month, year });
            activeQuests.push(quest);
        }

        if (questJSONs.length === 0) return;

        this.stateAdapter.addActiveQuests(questJSONs);
        if (this.dependencies.ui) this.dependencies.ui.renderActiveAssignments();
        this.handleClearDraw();
        this.saveState();
        toast.success(`${questJSONs.length} Restoration project(s) added.`);
    }

    /**
     * Clear restoration and Extra Credit drawn/selection. Called from shared "Clear draw" button.
     */
    handleClearDraw() {
        this.selectedWingId = null;
        this.selectedIndices = new Set();
        this.drawnExtraCredit = [];
        this.selectedIndicesExtraCredit = new Set();
        this.renderExtraCredit();
        this.renderRestoration();
        this.dependencies.updateDeckActionsLabel?.();
    }
}
