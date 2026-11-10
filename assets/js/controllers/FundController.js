/**
 * FundController - the real-dollar Fund widget in the Character tab's Resources panel.
 *
 * Handles:
 * - Editing the balance directly (corrections)
 * - Deducting a purchase (amount, optional note, date) with an overdraft confirm
 * - The deduction receipt: ledger grouped by month, each entry deletable (refunds)
 *
 * All Fund state goes through StateAdapter; the panel re-renders on FUND_CHANGED, so quest
 * payouts and level-up rewards show up here too.
 */

import { BaseController } from './BaseController.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { parseDollarInput, formatCents, todayIsoDate } from '../services/FundLedgerService.js';
import { buildFundLedgerViewModel } from '../viewModels/fundLedgerViewModel.js';
import { createElement } from '../utils/domHelpers.js';

const INVALID_AMOUNT_MESSAGE = 'Enter an amount greater than $0.';
const OVERDRAFT_MESSAGE = 'This will take your Fund below $0. Continue?';
const DELETE_ACTION = 'delete-fund-deduction';

/** Cents → the plain number shown in the type="number" balance input ("15", "12.34", "-22"). */
function centsToInputValue(cents) {
    return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export class FundController extends BaseController {
    initialize() {
        this.balanceInput = document.getElementById('fund-balance');
        this.amountInput = document.getElementById('fund-deduct-amount');
        this.noteInput = document.getElementById('fund-deduct-note');
        this.dateInput = document.getElementById('fund-deduct-date');
        this.submitButton = document.getElementById('fund-deduct-submit');
        this.errorEl = document.getElementById('fund-deduct-error');
        this.ledgerEl = document.getElementById('fund-ledger');

        if (!this.balanceInput && !this.ledgerEl) return;

        if (this.dateInput && !this.dateInput.value) {
            this.dateInput.value = todayIsoDate();
        }

        this.addEventListener(this.balanceInput, 'change', () => this.handleBalanceChange());
        this.addEventListener(this.submitButton, 'click', () => this.handleDeductSubmit());

        // Enter in a deduct field deducts; it must not submit the whole character-sheet form.
        const submitOnEnter = (e) => {
            if (e.key !== 'Enter' || e.isComposing) return;
            e.preventDefault();
            this.handleDeductSubmit();
        };
        [this.amountInput, this.noteInput, this.dateInput].forEach(input => {
            this.addEventListener(input, 'keydown', submitOnEnter);
        });

        this.unsubscribeFund = this.stateAdapter.on(STATE_EVENTS.FUND_CHANGED, () => this.render());
        this.render();
    }

    destroy() {
        if (this.unsubscribeFund) {
            this.unsubscribeFund();
            this.unsubscribeFund = null;
        }
        super.destroy();
    }

    handleBalanceChange() {
        const raw = this.balanceInput.value;
        const value = Number(raw);
        if (raw.trim() === '' || !Number.isFinite(value)) {
            // Not a number: put the stored balance back rather than zeroing it.
            this.renderBalance();
            return;
        }
        this.stateAdapter.setFundBalanceCents(Math.round(value * 100));
        this.saveState();
    }

    handleDeductSubmit() {
        const amountCents = parseDollarInput(this.amountInput?.value);
        if (amountCents === null) {
            this.showError(INVALID_AMOUNT_MESSAGE);
            return;
        }
        this.showError('');

        if (this.stateAdapter.getFundBalanceCents() - amountCents < 0 && !window.confirm(OVERDRAFT_MESSAGE)) {
            return;
        }

        const entry = this.stateAdapter.deductFunds({
            amountCents,
            note: this.noteInput?.value || '',
            date: this.dateInput?.value
        });
        if (!entry) return;

        if (this.amountInput) this.amountInput.value = '';
        if (this.noteInput) this.noteInput.value = '';
        this.saveState();
    }

    /**
     * Delegated click handler (see delegatedClickHandler.js).
     * @param {HTMLElement} target
     * @returns {boolean} true when the click was a Fund action
     */
    handleClick(target) {
        const button = target?.closest?.(`[data-action="${DELETE_ACTION}"]`);
        if (!button) return false;

        const id = button.dataset.id;
        const entry = this.stateAdapter.getFundLedger().find(e => e.id === id);
        if (!entry) return true;

        const prompt = `Delete this ${formatCents(entry.amountCents)} deduction? It will be refunded to your Fund.`;
        if (window.confirm(prompt) && this.stateAdapter.deleteFundDeduction(id)) {
            this.saveState();
        }
        return true;
    }

    showError(message) {
        if (!this.errorEl) return;
        this.errorEl.textContent = message;
        this.errorEl.hidden = !message;
    }

    render() {
        this.renderBalance();
        this.renderLedger();
    }

    renderBalance() {
        if (!this.balanceInput) return;
        this.balanceInput.value = centsToInputValue(this.stateAdapter.getFundBalanceCents());
    }

    renderLedger() {
        if (!this.ledgerEl) return;
        this.ledgerEl.innerHTML = '';

        const months = buildFundLedgerViewModel(this.stateAdapter.getFundLedger());
        if (months.length === 0) {
            this.ledgerEl.appendChild(createElement('p', { class: 'fund-ledger-empty' }, 'No deductions yet.'));
            return;
        }

        months.forEach(month => {
            const section = createElement('section', { class: 'fund-ledger-month', 'data-month': month.monthKey });
            const header = createElement('div', { class: 'fund-ledger-month-header' });
            header.appendChild(createElement('h3', { class: 'fund-ledger-month-label' }, month.label));
            header.appendChild(createElement('span', { class: 'fund-ledger-month-total' }, `${month.totalLabel} spent`));
            section.appendChild(header);

            const list = createElement('ul', { class: 'fund-ledger-entries' });
            month.entries.forEach(entry => {
                const row = createElement('li', { class: 'fund-ledger-entry' });
                row.appendChild(createElement('span', { class: 'fund-ledger-entry-date' }, entry.dateLabel));
                row.appendChild(createElement('span', { class: 'fund-ledger-entry-amount' }, entry.amountLabel));
                row.appendChild(createElement('span', { class: 'fund-ledger-entry-note' }, entry.note));
                row.appendChild(createElement('button', {
                    type: 'button',
                    class: 'fund-ledger-delete-btn',
                    'data-action': DELETE_ACTION,
                    'data-id': entry.id,
                    'aria-label': `Delete ${entry.amountLabel} deduction from ${entry.dateLabel} and refund it`,
                    title: 'Delete and refund'
                }, '✕'));
                list.appendChild(row);
            });
            section.appendChild(list);
            this.ledgerEl.appendChild(section);
        });
    }
}
