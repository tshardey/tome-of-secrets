/**
 * BookBoxSubscriptionController - Handles Book Box Subscriptions on the Character Sheet.
 *
 * - Add subscription: company, tier, default monthly cost, skips per year
 * - List subscriptions with summary: skips remaining this year, thumbs-up ratio (thumbsUp / rated months)
 * - Edit and delete subscriptions
 */

import { BaseController } from './BaseController.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { trimOrEmpty } from '../utils/helpers.js';

export class BookBoxSubscriptionController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
    }

    initialize() {
        const form = this.form;
        if (!form) return;

        this.renderSubscriptionsList();

        const addBtn = document.getElementById('book-box-sub-add-btn');
        if (addBtn) {
            this.addEventListener(addBtn, 'click', (e) => {
                e.preventDefault();
                this.handleAddSubscription();
            });
        }

        form.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.book-box-sub-delete-btn');
            const editBtn = e.target.closest('.book-box-sub-edit-btn');
            const cancelEditBtn = e.target.closest('.book-box-sub-cancel-edit-btn');
            const saveEditBtn = e.target.closest('.book-box-sub-save-edit-btn');
            if (deleteBtn && deleteBtn.dataset.subscriptionId) {
                e.preventDefault();
                this.handleDeleteSubscription(deleteBtn.dataset.subscriptionId);
                return;
            }
            if (editBtn && editBtn.dataset.subscriptionId) {
                e.preventDefault();
                this.startEditSubscription(editBtn.dataset.subscriptionId);
                return;
            }
            if (cancelEditBtn && cancelEditBtn.dataset.subscriptionId) {
                e.preventDefault();
                this.cancelEditSubscription(cancelEditBtn.dataset.subscriptionId);
                return;
            }
            if (saveEditBtn && saveEditBtn.dataset.subscriptionId) {
                e.preventDefault();
                this.saveEditSubscription(saveEditBtn.dataset.subscriptionId);
                return;
            }
        });

        this.stateAdapter.on(STATE_EVENTS.BOOK_BOX_SUBSCRIPTIONS_CHANGED, () => this.renderSubscriptionsList());
        this.stateAdapter.on(STATE_EVENTS.BOOK_BOX_HISTORY_CHANGED, () => this.renderSubscriptionsList());
    }

    handleAddSubscription() {
        const company = trimOrEmpty(document.getElementById('book-box-sub-company')?.value || '');
        const tier = trimOrEmpty(document.getElementById('book-box-sub-tier')?.value || '');
        const defaultCostEl = document.getElementById('book-box-sub-default-cost');
        const skipsEl = document.getElementById('book-box-sub-skips');
        const defaultMonthlyCost = defaultCostEl && defaultCostEl.value !== '' ? parseFloat(defaultCostEl.value) : null;
        const skipsAllowedPerYear = skipsEl ? Math.max(0, parseInt(skipsEl.value, 10) || 0) : 0;

        if (!company) {
            const listEl = document.getElementById('book-box-subscriptions-list');
            if (listEl) {
                const msg = document.createElement('p');
                msg.className = 'book-box-sub-error';
                msg.setAttribute('role', 'alert');
                msg.textContent = 'Company name is required.';
                listEl.insertBefore(msg, listEl.firstChild);
                setTimeout(() => msg.remove(), 3000);
            }
            return;
        }

        this.stateAdapter.addBookBoxSubscription({
            company,
            tier,
            defaultMonthlyCost: typeof defaultMonthlyCost === 'number' && !isNaN(defaultMonthlyCost) ? defaultMonthlyCost : null,
            skipsAllowedPerYear
        });
        this.saveState();

        const companyEl = document.getElementById('book-box-sub-company');
        const tierEl = document.getElementById('book-box-sub-tier');
        if (companyEl) companyEl.value = '';
        if (tierEl) tierEl.value = '';
        if (defaultCostEl) defaultCostEl.value = '';
        if (skipsEl) skipsEl.value = '0';
    }

    handleDeleteSubscription(subscriptionId) {
        if (!subscriptionId) return;
        if (!confirm('Remove this subscription? Monthly history will be kept, but the subscription definition will be removed.')) return;
        this.stateAdapter.deleteBookBoxSubscription(subscriptionId);
        this.saveState();
        this.renderSubscriptionsList();
    }

    startEditSubscription(subscriptionId) {
        const sub = this.stateAdapter.getBookBoxSubscription(subscriptionId);
        if (!sub) return;
        const card = document.querySelector(`[data-book-box-subscription-id="${subscriptionId}"]`);
        if (!card) return;

        const viewEl = card.querySelector('.book-box-sub-card-view');
        const editEl = card.querySelector('.book-box-sub-card-edit');
        if (!viewEl || !editEl) return;

        const companyInput = editEl.querySelector('.book-box-sub-edit-company');
        const tierInput = editEl.querySelector('.book-box-sub-edit-tier');
        const costInput = editEl.querySelector('.book-box-sub-edit-cost');
        const skipsInput = editEl.querySelector('.book-box-sub-edit-skips');
        if (companyInput) companyInput.value = sub.company || '';
        if (tierInput) tierInput.value = sub.tier || '';
        if (costInput) costInput.value = sub.defaultMonthlyCost != null ? String(sub.defaultMonthlyCost) : '';
        if (skipsInput) skipsInput.value = String(sub.skipsAllowedPerYear ?? 0);

        viewEl.hidden = true;
        editEl.hidden = false;
    }

    cancelEditSubscription(subscriptionId) {
        const card = document.querySelector(`[data-book-box-subscription-id="${subscriptionId}"]`);
        if (!card) return;
        const viewEl = card.querySelector('.book-box-sub-card-view');
        const editEl = card.querySelector('.book-box-sub-card-edit');
        if (viewEl) viewEl.hidden = false;
        if (editEl) editEl.hidden = true;
    }

    saveEditSubscription(subscriptionId) {
        const card = document.querySelector(`[data-book-box-subscription-id="${subscriptionId}"]`);
        if (!card) return;
        const editEl = card.querySelector('.book-box-sub-card-edit');
        if (!editEl) return;

        const companyInput = editEl.querySelector('.book-box-sub-edit-company');
        const tierInput = editEl.querySelector('.book-box-sub-edit-tier');
        const costInput = editEl.querySelector('.book-box-sub-edit-cost');
        const skipsInput = editEl.querySelector('.book-box-sub-edit-skips');
        const company = companyInput ? trimOrEmpty(companyInput.value) : '';
        const tier = tierInput ? trimOrEmpty(tierInput.value) : '';
        const defaultMonthlyCost = costInput && costInput.value !== '' ? parseFloat(costInput.value) : null;
        const skipsAllowedPerYear = skipsInput ? Math.max(0, parseInt(skipsInput.value, 10) || 0) : 0;

        if (!company) return;

        this.stateAdapter.updateBookBoxSubscription(subscriptionId, {
            company,
            tier,
            defaultMonthlyCost: typeof defaultMonthlyCost === 'number' && !isNaN(defaultMonthlyCost) ? defaultMonthlyCost : null,
            skipsAllowedPerYear
        });
        this.saveState();

        const viewEl = card.querySelector('.book-box-sub-card-view');
        if (viewEl) viewEl.hidden = false;
        if (editEl) editEl.hidden = true;
        this.renderSubscriptionsList();
    }

    renderSubscriptionsList() {
        const container = document.getElementById('book-box-subscriptions-list');
        if (!container) return;

        const list = this.stateAdapter.getBookBoxSubscriptionsList() || [];
        container.innerHTML = '';

        if (list.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'book-box-subscriptions-empty';
            empty.textContent = 'No subscriptions yet. Add one above, then log each month on the Shopping page.';
            container.appendChild(empty);
            return;
        }

        list.forEach((sub) => {
            const skipsRemaining = this.stateAdapter.getSubscriptionSkipsRemaining(sub.id);
            const { thumbsUp, ratedMonths } = this.stateAdapter.getSubscriptionThumbsSummary(sub.id);
            const thumbsLabel = ratedMonths > 0 ? `👍 ${thumbsUp}/${ratedMonths} rated` : '—';

            const card = document.createElement('div');
            card.className = 'book-box-sub-card';
            card.dataset.bookBoxSubscriptionId = sub.id;

            const viewDiv = document.createElement('div');
            viewDiv.className = 'book-box-sub-card-view';
            viewDiv.innerHTML = `
                <div class="book-box-sub-card-header">
                    <strong class="book-box-sub-card-title">${escapeHtml(sub.company || 'Unnamed')}${sub.tier ? ` · ${escapeHtml(sub.tier)}` : ''}</strong>
                    <div class="book-box-sub-card-actions">
                        <button type="button" class="rpg-btn rpg-btn-secondary book-box-sub-edit-btn" data-subscription-id="${escapeHtml(sub.id)}" aria-label="Edit subscription">Edit</button>
                        <button type="button" class="rpg-btn rpg-btn-secondary book-box-sub-delete-btn" data-subscription-id="${escapeHtml(sub.id)}" aria-label="Delete subscription">Delete</button>
                    </div>
                </div>
                <div class="book-box-sub-card-meta">
                    ${sub.defaultMonthlyCost != null ? `<span>Default: $${Number(sub.defaultMonthlyCost).toFixed(2)}/mo</span>` : ''}
                    <span>Skips this year: <strong>${skipsRemaining}</strong> / ${sub.skipsAllowedPerYear ?? 0}</span>
                    <span>${thumbsLabel}</span>
                </div>
            `;

            const editDiv = document.createElement('div');
            editDiv.className = 'book-box-sub-card-edit';
            editDiv.hidden = true;
            editDiv.innerHTML = `
                <div class="book-box-sub-edit-row">
                    <label>Company</label>
                    <input type="text" class="book-box-sub-edit-company" value="${escapeHtml(sub.company || '')}" />
                </div>
                <div class="book-box-sub-edit-row">
                    <label>Tier</label>
                    <input type="text" class="book-box-sub-edit-tier" value="${escapeHtml(sub.tier || '')}" />
                </div>
                <div class="book-box-sub-edit-row">
                    <label>Default cost ($)</label>
                    <input type="number" class="book-box-sub-edit-cost" min="0" step="0.01" value="${sub.defaultMonthlyCost != null ? escapeHtml(String(sub.defaultMonthlyCost)) : ''}" placeholder="Optional" />
                </div>
                <div class="book-box-sub-edit-row">
                    <label>Skips per year</label>
                    <input type="number" class="book-box-sub-edit-skips" min="0" value="${sub.skipsAllowedPerYear ?? 0}" />
                </div>
                <div class="book-box-sub-edit-actions">
                    <button type="button" class="rpg-btn rpg-btn-primary book-box-sub-save-edit-btn" data-subscription-id="${escapeHtml(sub.id)}">Save</button>
                    <button type="button" class="rpg-btn rpg-btn-secondary book-box-sub-cancel-edit-btn" data-subscription-id="${escapeHtml(sub.id)}">Cancel</button>
                </div>
            `;

            card.appendChild(viewDiv);
            card.appendChild(editDiv);
            container.appendChild(card);
        });
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
