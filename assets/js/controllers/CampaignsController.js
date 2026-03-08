/**
 * CampaignsController - Handles Campaigns tab: series (campaigns) CRUD, completion status, expedition map.
 *
 * - Add series: inline form (name + Add Series button)
 * - Expedition map: shows shared expedition track, current stop, and stop detail (name, story, reward)
 * - List series: name, book count, completed (Y/N), Edit name, Delete. Progression is automatic when a series completes.
 */

import { BaseController } from './BaseController.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import {
    getSeriesExpedition,
    getSeriesExpeditionStopIndex,
    getCurrentSeriesExpeditionStop,
    getNextSeriesExpeditionStop,
    canClaimSeriesCompletionReward,
    advanceSeriesExpedition
} from '../services/SeriesCompletionService.js';
import { toLocalOrCdnUrl } from '../utils/imageCdn.js';
import { trimOrEmpty } from '../utils/helpers.js';
import { toast } from '../ui/toast.js';

export class CampaignsController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
    }

    initialize() {
        const form = this.form;
        if (!form) return;

        this.tryAdvanceExpedition();
        this.renderExpeditionMap();
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

        this.addEventListener(form, 'click', (e) => {
            const deleteBtn = e.target.closest('.campaigns-delete-series-btn');
            const editBtn = e.target.closest('.campaigns-edit-series-btn');
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

        this.stateAdapter.on(STATE_EVENTS.SERIES_CHANGED, () => {
            this.tryAdvanceExpedition();
            this.renderExpeditionMap();
            this.renderSeriesList();
        });
        this.stateAdapter.on(STATE_EVENTS.BOOKS_CHANGED, () => {
            this.tryAdvanceExpedition();
            this.renderExpeditionMap();
            this.renderSeriesList();
        });
        this.stateAdapter.on(STATE_EVENTS.CLAIMED_SERIES_REWARDS_CHANGED, () => this.renderSeriesList());
        this.stateAdapter.on(STATE_EVENTS.SERIES_EXPEDITION_PROGRESS_CHANGED, () => {
            this.renderExpeditionMap();
            this.renderSeriesList();
        });
    }

    /**
     * If any completed series has not yet advanced the expedition, advance by one stop and show toast.
     */
    tryAdvanceExpedition() {
        const list = this.stateAdapter.getSeriesList() || [];
        const canClaimSeries = list.find(s => canClaimSeriesCompletionReward(s.id, this.stateAdapter));
        if (!canClaimSeries) return;
        const updateCurrency = this.dependencies?.updateCurrency;
        const result = advanceSeriesExpedition(canClaimSeries.id, this.stateAdapter, { updateCurrency });
        if (result.advanced && result.stop) {
            this.saveState();
            // Refresh character UI so XP, level, and permanent bonuses (including expedition passives) update
            const ui = this.dependencies?.ui;
            if (ui) {
                const levelInput = document.getElementById('level');
                const xpNeededInput = document.getElementById('xp-needed');
                if (levelInput) ui.updateXpNeeded(levelInput, xpNeededInput);
                ui.updateXpProgressBar();
                if (levelInput) ui.renderPermanentBonuses(levelInput);
            }
            const rewardText = result.applied?.rewardText || result.stop.reward?.text || '';
            toast.success(result.stop.name + (rewardText ? ` — ${rewardText}` : ''));
        }
    }

    /**
     * Render the expedition map: map image, stop markers (past/current/locked), and detail panel.
     */
    renderExpeditionMap() {
        const container = document.getElementById('expedition-map-container');
        const imgEl = document.getElementById('expedition-map-image');
        const markersEl = document.getElementById('expedition-map-markers');
        const placeholderEl = document.getElementById('expedition-detail-placeholder');
        const contentEl = document.getElementById('expedition-detail-content');
        const nameEl = document.getElementById('expedition-detail-name');
        const storyEl = document.getElementById('expedition-detail-story');
        const rewardEl = document.getElementById('expedition-detail-reward');

        if (!container || !markersEl) return;

        const expedition = getSeriesExpedition();
        const stopIndex = getSeriesExpeditionStopIndex(this.stateAdapter);
        const currentStop = getCurrentSeriesExpeditionStop(this.stateAdapter);
        const nextStop = getNextSeriesExpeditionStop(this.stateAdapter);
        const stops = expedition.stops || [];

        if (!expedition.mapImage || stops.length === 0) {
            container.setAttribute('aria-hidden', 'true');
            if (placeholderEl) placeholderEl.hidden = false;
            if (contentEl) contentEl.hidden = true;
            if (imgEl) imgEl.removeAttribute('src');
            markersEl.innerHTML = '';
            return;
        }

        container.setAttribute('aria-hidden', 'false');
        const baseurl = typeof window !== 'undefined' && window.__BASEURL ? window.__BASEURL : '';
        if (imgEl) {
            imgEl.src = toLocalOrCdnUrl(expedition.mapImage, baseurl);
            imgEl.alt = expedition.name || 'Expedition map';
        }

        markersEl.innerHTML = stops
            .map((stop, i) => {
                const isPast = i < stopIndex;
                const isCurrent = i === stopIndex - 1;
                const isLocked = i >= stopIndex;
                const stateClass = isPast
                    ? 'expedition-stop-marker--past'
                    : isCurrent
                        ? 'expedition-stop-marker--current'
                        : 'expedition-stop-marker--locked';
                // Data uses normalized-100 with origin bottom-left (y up); CSS uses top-left (y down). Flip y.
                const x = typeof stop.position?.x === 'number' ? stop.position.x : 0;
                const yData = typeof stop.position?.y === 'number' ? stop.position.y : 0;
                const yCss = 100 - yData;
                const name = stop.name || `Stop ${i + 1}`;
                return `<span class="expedition-stop-marker ${stateClass}" style="left:${x}%;top:${yCss}%;" data-stop-index="${i}" title="${this._escapeAttr(name)}" role="listitem">${i + 1}</span>`;
            })
            .join('');

        const detailStop = currentStop || nextStop;
        if (detailStop && nameEl && storyEl && rewardEl) {
            if (placeholderEl) placeholderEl.hidden = true;
            if (contentEl) contentEl.hidden = false;
            nameEl.textContent = detailStop.name || '';
            storyEl.textContent = detailStop.story || '';
            const rewardText = detailStop.reward && typeof detailStop.reward.text === 'string' ? detailStop.reward.text : '';
            rewardEl.textContent = rewardText ? `Reward: ${rewardText}` : '';
            rewardEl.style.display = rewardText ? '' : 'none';
        } else {
            if (placeholderEl) placeholderEl.hidden = false;
            if (contentEl) contentEl.hidden = true;
        }
    }

    handleAddSeries() {
        const nameInput = document.getElementById('campaigns-series-name');
        const name = trimOrEmpty(nameInput?.value || '');
        if (!name) return;
        const releasedInput = document.getElementById('campaigns-released-count');
        const expectedInput = document.getElementById('campaigns-expected-count');
        const isCompletedInput = document.getElementById('campaigns-is-completed-series');
        const releasedCount = releasedInput && !isNaN(Number(releasedInput.value)) && Number(releasedInput.value) >= 0
            ? Math.floor(Number(releasedInput.value)) : 0;
        const expectedCount = expectedInput && !isNaN(Number(expectedInput.value)) && Number(expectedInput.value) >= 0
            ? Math.floor(Number(expectedInput.value)) : 0;
        const isCompletedSeries = isCompletedInput ? !!isCompletedInput.checked : false;
        const series = this.stateAdapter.addSeries({ name, releasedCount, expectedCount, isCompletedSeries });
        if (series) {
            if (nameInput) nameInput.value = '';
            if (releasedInput) releasedInput.value = '0';
            if (expectedInput) expectedInput.value = '0';
            if (isCompletedInput) isCompletedInput.checked = false;
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

    /**
     * Get linked library books for a series in stable order (by bookIds).
     * @param {string} seriesId
     * @returns {{ book: Object, completed: boolean }[]}
     */
    _getLinkedBooksForSeries(seriesId) {
        const s = this.stateAdapter.getSeries(seriesId);
        if (!s || !Array.isArray(s.bookIds)) return [];
        return s.bookIds
            .map(bookId => {
                const book = this.stateAdapter.getBook(bookId);
                return book ? { book, completed: book.status === 'completed' } : null;
            })
            .filter(Boolean);
    }

    _startEditSeriesName(seriesId) {
        const s = this.stateAdapter.getSeries(seriesId);
        if (!s) return;
        const listEl = document.getElementById('campaigns-series-list');
        if (!listEl) return;
        const card = listEl.querySelector(`[data-series-id="${this._escapeAttr(seriesId)}"]`);
        if (!card) return;
        const mainBlock = card.querySelector('.campaigns-series-main');
        if (!mainBlock) return;
        const currentName = s.name || '';
        const currentReleased = typeof s.releasedCount === 'number' && s.releasedCount >= 0 ? s.releasedCount : 0;
        const currentExpected = typeof s.expectedCount === 'number' && s.expectedCount >= 0 ? s.expectedCount : 0;
        const currentIsCompleted = !!s.isCompletedSeries;

        const editForm = document.createElement('div');
        editForm.className = 'campaigns-series-edit-form';
        editForm.innerHTML = `
            <div class="campaigns-edit-fields">
                <label class="campaigns-edit-label">Name</label>
                <input type="text" class="campaigns-series-name-edit-input" data-edit="name" value="${this._escapeAttr(currentName)}" />
                <label class="campaigns-edit-label">Released</label>
                <input type="number" class="campaigns-number-edit" data-edit="releasedCount" min="0" value="${currentReleased}" />
                <label class="campaigns-edit-label">Expected total</label>
                <input type="number" class="campaigns-number-edit" data-edit="expectedCount" min="0" value="${currentExpected}" />
                <label class="campaigns-checkbox-label campaigns-author-finished campaigns-checkbox-edit-label">
                    <input type="checkbox" class="campaigns-checkbox-edit campaigns-seal-input" data-edit="isCompletedSeries" ${currentIsCompleted ? 'checked' : ''} aria-label="Author has finished the series" />
                    <span class="campaigns-seal" aria-hidden="true"></span>
                    <span class="campaigns-author-finished-text">Author finished series</span>
                </label>
            </div>
            <div class="campaigns-edit-actions">
                <button type="button" class="rpg-btn rpg-btn-primary campaigns-save-edit-btn" data-series-id="${this._escapeAttr(seriesId)}">Save</button>
                <button type="button" class="rpg-btn rpg-btn-secondary campaigns-cancel-edit-btn" data-series-id="${this._escapeAttr(seriesId)}">Cancel</button>
            </div>
        `;
        mainBlock.replaceWith(editForm);
        const nameInput = editForm.querySelector('[data-edit="name"]');
        if (nameInput) {
            nameInput.focus();
            nameInput.select();
        }

        const saveBtn = editForm.querySelector('.campaigns-save-edit-btn');
        const cancelBtn = editForm.querySelector('.campaigns-cancel-edit-btn');
        const commit = () => {
            const newName = trimOrEmpty(editForm.querySelector('[data-edit="name"]')?.value ?? '');
            const releasedInput = editForm.querySelector('[data-edit="releasedCount"]');
            const expectedInput = editForm.querySelector('[data-edit="expectedCount"]');
            const isCompletedInput = editForm.querySelector('[data-edit="isCompletedSeries"]');
            const releasedCount = releasedInput && !isNaN(Number(releasedInput.value)) && Number(releasedInput.value) >= 0
                ? Math.floor(Number(releasedInput.value)) : 0;
            const expectedCount = expectedInput && !isNaN(Number(expectedInput.value)) && Number(expectedInput.value) >= 0
                ? Math.floor(Number(expectedInput.value)) : 0;
            const isCompletedSeries = isCompletedInput ? !!isCompletedInput.checked : false;
            if (newName) {
                this.stateAdapter.updateSeries(seriesId, {
                    name: newName,
                    releasedCount,
                    expectedCount,
                    isCompletedSeries
                });
                this.saveState();
            }
            this.renderSeriesList();
        };
        const cancel = () => this.renderSeriesList();

        if (saveBtn) this.addEventListener(saveBtn, 'click', (e) => { e.preventDefault(); commit(); });
        if (cancelBtn) this.addEventListener(cancelBtn, 'click', (e) => { e.preventDefault(); cancel(); });
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
                const linked = this._getLinkedBooksForSeries(s.id);
                const completedCount = linked.filter(({ completed }) => completed).length;
                const linkedCount = linked.length;
                const released = typeof s.releasedCount === 'number' && s.releasedCount >= 0 ? s.releasedCount : 0;
                const expected = typeof s.expectedCount === 'number' && s.expectedCount >= 0 ? s.expectedCount : 0;
                const authorFinished = !!s.isCompletedSeries;
                const isComplete = this.stateAdapter.isSeriesComplete(s.id);
                const hasAdvanced = this.stateAdapter.hasSeriesAdvancedExpedition && this.stateAdapter.hasSeriesAdvancedExpedition(s.id);
                const nameEsc = this._escapeHtml(s.name || 'Unnamed');
                const idAttr = this._escapeAttr(s.id);
                const statusText = isComplete
                    ? (hasAdvanced ? 'Complete · Expedition advanced' : 'Complete')
                    : `${completedCount}/${linkedCount} read`;
                const metaParts = [];
                if (released > 0 || expected > 0) {
                    metaParts.push(`${released} released / ${expected} expected`);
                }
                metaParts.push(authorFinished ? 'Author finished' : 'Ongoing');
                const metaLine = metaParts.join(' · ');
                const coverStrip = linked.length > 0
                    ? `<div class="campaigns-series-covers" aria-label="Linked books">
                           ${linked.map(({ book, completed }) => {
                               const coverUrl = book.cover || book.coverUrl || '';
                               const title = book.title || book.name || 'Book';
                               const coverClass = completed ? 'campaigns-cover campaigns-cover-completed' : 'campaigns-cover campaigns-cover-in-progress';
                               if (coverUrl) {
                                   return `<span class="${coverClass}" title="${this._escapeAttr(title)}"><img src="${this._escapeAttr(coverUrl)}" alt="" /></span>`;
                               }
                               return `<span class="${coverClass} campaigns-cover-placeholder" title="${this._escapeAttr(title)}"><span class="campaigns-cover-placeholder-text">📖</span></span>`;
                           }).join('')}
                       </div>`
                    : '';
                const completeClass = isComplete ? ' campaigns-series-card--complete' : '';
                return `
                    <div class="campaigns-series-card${completeClass}" data-series-id="${idAttr}">
                        <div class="campaigns-series-main">
                            <span class="campaigns-series-name">${isComplete ? '✓ ' : ''}${nameEsc}</span>
                            <span class="campaigns-series-meta">${this._escapeHtml(metaLine)}</span>
                            <span class="campaigns-series-progress">${completedCount} of ${linkedCount} linked read · ${statusText}</span>
                            ${coverStrip}
                        </div>
                        <div class="campaigns-series-actions">
                            <button type="button" class="rpg-btn rpg-btn-secondary campaigns-edit-series-btn" data-series-id="${idAttr}" aria-label="Edit series">Edit</button>
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
