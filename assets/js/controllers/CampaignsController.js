/**
 * CampaignsController - Handles Campaigns tab: series (campaigns) CRUD, completion status, claim souvenir reward.
 *
 * - Add series: inline form (name + Add Series button)
 * - List series: name, book count, completed (Y/N), Claim reward button when complete and unclaimed, Edit name, Delete
 */

import { BaseController } from './BaseController.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { claimSeriesCompletionReward } from '../services/SeriesCompletionService.js';
import { trimOrEmpty } from '../utils/helpers.js';
import { toast } from '../ui/toast.js';

export class CampaignsController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
    }

    initialize() {
        const form = this.form;
        if (!form) return;

        this.renderSeriesList();

        const addBtn = document.getElementById('campaigns-add-series-btn');
        const nameInput = document.getElementById('campaigns-series-name');
        if (addBtn) {
            this.addEventListener(addBtn, 'click', (e) => {
                e.preventDefault();
                this.handleAddSeries();
            });
        }
        if (nameInput) {
            this.addEventListener(nameInput, 'keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleAddSeries();
                }
            });
        }

        form.addEventListener('click', (e) => {
            const claimBtn = e.target.closest('.campaigns-claim-reward-btn');
            const deleteBtn = e.target.closest('.campaigns-delete-series-btn');
            const editBtn = e.target.closest('.campaigns-edit-series-btn');
            if (claimBtn && claimBtn.dataset.seriesId) {
                e.preventDefault();
                this.handleClaimReward(claimBtn.dataset.seriesId);
                return;
            }
            if (deleteBtn && deleteBtn.dataset.seriesId) {
                e.preventDefault();
                this.handleDeleteSeries(deleteBtn.dataset.seriesId);
                return;
            }
            if (editBtn && editBtn.dataset.seriesId) {
                e.preventDefault();
                this._startEditSeriesName(editBtn.dataset.seriesId);
                return;
            }
        });

        this.stateAdapter.on(STATE_EVENTS.SERIES_CHANGED, () => this.renderSeriesList());
        this.stateAdapter.on(STATE_EVENTS.BOOKS_CHANGED, () => this.renderSeriesList());
        this.stateAdapter.on(STATE_EVENTS.CLAIMED_SERIES_REWARDS_CHANGED, () => this.renderSeriesList());
    }

    handleAddSeries() {
        const nameInput = document.getElementById('campaigns-series-name');
        const name = trimOrEmpty(nameInput?.value || '');
        if (!name) return;
        const series = this.stateAdapter.addSeries({ name });
        if (series) {
            if (nameInput) nameInput.value = '';
            this.renderSeriesList();
            this.saveState();
        }
    }

    handleDeleteSeries(seriesId) {
        if (!seriesId) return;
        this.stateAdapter.deleteSeries(seriesId);
        this.renderSeriesList();
        this.saveState();
    }

    _startEditSeriesName(seriesId) {
        const s = this.stateAdapter.getSeries(seriesId);
        if (!s) return;
        const listEl = document.getElementById('campaigns-series-list');
        if (!listEl) return;
        const card = listEl.querySelector(`[data-series-id="${this._escapeAttr(seriesId)}"]`);
        if (!card) return;
        const nameEl = card.querySelector('.campaigns-series-name');
        if (!nameEl) return;
        const currentName = s.name || '';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'campaigns-series-name-edit-input';
        input.value = currentName;
        input.dataset.seriesId = seriesId;
        nameEl.replaceWith(input);
        input.focus();
        input.select();

        const commit = () => {
            const newName = trimOrEmpty(input.value);
            if (newName && newName !== currentName) {
                this.stateAdapter.updateSeries(seriesId, { name: newName });
                this.saveState();
            }
            this.renderSeriesList();
        };

        this.addEventListener(input, 'blur', commit);
        this.addEventListener(input, 'keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
            if (e.key === 'Escape') {
                input.value = currentName;
                input.blur();
            }
        });
    }

    handleClaimReward(seriesId) {
        if (!seriesId) return;
        const updateCurrency = this.dependencies.updateCurrency;
        const result = claimSeriesCompletionReward(seriesId, this.stateAdapter, { updateCurrency });
        if (result.claimed && result.applied) {
            if (result.applied.applied && updateCurrency && result.reward?.reward) {
                // Reward may have been applied (currency, item, etc.) - updateCurrency already called by service for currency
                // If it was an item or buff, we just need to refresh; state is updated
            }
            this.renderSeriesList();
            this.saveState();
            if (result.reward) {
                toast.success(result.reward.reward || `Claimed: ${result.reward.name}`);
            }
        } else if (!result.claimed && result.error) {
            toast.info(result.error);
        }
    }

    renderSeriesList() {
        const container = document.getElementById('campaigns-series-list');
        if (!container) return;

        const list = this.stateAdapter.getSeriesList();
        if (!list || list.length === 0) {
            container.innerHTML = '<p class="campaigns-empty">No series yet. Add a campaign (series) above, then tag books to it from the Library when editing a book.</p>';
            return;
        }

        container.innerHTML = list
            .map((s) => {
                const bookCount = (s.bookIds && s.bookIds.length) || 0;
                const isComplete = this.stateAdapter.isSeriesComplete(s.id);
                const hasClaimed = this.stateAdapter.hasClaimedSeriesReward(s.id);
                const canClaim = isComplete && !hasClaimed;
                const nameEsc = this._escapeHtml(s.name || 'Unnamed');
                const idAttr = this._escapeAttr(s.id);
                const claimBtn = canClaim
                    ? `<button type="button" class="rpg-btn rpg-btn-primary campaigns-claim-reward-btn" data-series-id="${idAttr}" title="Claim series completion souvenir">Claim souvenir</button>`
                    : '';
                const statusText = hasClaimed ? 'Souvenir claimed' : isComplete ? 'Complete' : `${bookCount} book(s)`;
                return `
                    <div class="campaigns-series-card" data-series-id="${idAttr}">
                        <div class="campaigns-series-main">
                            <span class="campaigns-series-name">${nameEsc}</span>
                            <span class="campaigns-series-meta">${bookCount} book(s) · ${statusText}</span>
                        </div>
                        <div class="campaigns-series-actions">
                            ${claimBtn}
                            <button type="button" class="rpg-btn rpg-btn-secondary campaigns-edit-series-btn" data-series-id="${idAttr}" aria-label="Edit series name">Edit</button>
                            <button type="button" class="rpg-btn rpg-btn-secondary campaigns-delete-series-btn" data-series-id="${idAttr}" aria-label="Delete series">Delete</button>
                        </div>
                    </div>`;
            })
            .join('');
    }

    _escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    _escapeAttr(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}
