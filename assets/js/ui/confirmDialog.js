/**
 * In-page confirm dialog (Plan 4, D10; lqt0 §4).
 *
 * - It can't be suppressed: there is no "don't ask again".
 * - It has no default action: focus starts on the dialog itself, never on the confirm button,
 *   and Enter on the dialog does nothing. Escape, a backdrop click and the cancel button
 *   resolve false; only the confirm button resolves true.
 * - Dialogs never stack: a second call waits until the first has closed.
 */

let queue = Promise.resolve();
let dialogSeq = 0;

function focusableIn(root) {
    return [...root.querySelectorAll('button:not([disabled])')];
}

function showDialog({ title, body, confirmLabel, cancelLabel }) {
    return new Promise((resolve) => {
        const id = `tos-confirm-${++dialogSeq}`;
        const previousFocus = document.activeElement;

        const backdrop = document.createElement('div');
        backdrop.className = 'tos-confirm-backdrop';

        const dialog = document.createElement('div');
        dialog.className = 'tos-confirm-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', `${id}-title`);
        dialog.setAttribute('aria-describedby', `${id}-body`);
        dialog.tabIndex = -1;

        const heading = document.createElement('h2');
        heading.className = 'tos-confirm-title';
        heading.id = `${id}-title`;
        heading.textContent = title || '';

        const text = document.createElement('p');
        text.className = 'tos-confirm-body';
        text.id = `${id}-body`;
        text.textContent = body || '';

        const actions = document.createElement('div');
        actions.className = 'tos-confirm-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'rpg-btn rpg-btn-secondary tos-confirm-cancel';
        cancel.textContent = cancelLabel || 'Cancel';
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'rpg-btn tos-confirm-confirm';
        confirm.textContent = confirmLabel || 'Confirm';
        actions.append(cancel, confirm);

        dialog.append(heading, text, actions);
        backdrop.appendChild(dialog);

        let closed = false;
        const close = (answer) => {
            if (closed) return;
            closed = true;
            document.removeEventListener('keydown', onKeydown, true);
            backdrop.remove();
            if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
                previousFocus.focus();
            }
            resolve(answer);
        };

        function onKeydown(event) {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close(false);
                return;
            }
            if (event.key === 'Tab') {
                // Keep focus inside the dialog.
                const items = focusableIn(dialog);
                if (items.length === 0) return;
                const first = items[0];
                const last = items[items.length - 1];
                const active = document.activeElement;
                if (event.shiftKey && (active === first || active === dialog)) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && active === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        }

        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) close(false);
        });
        cancel.addEventListener('click', () => close(false));
        confirm.addEventListener('click', () => close(true));
        document.addEventListener('keydown', onKeydown, true);

        document.body.appendChild(backdrop);
        dialog.focus();
    });
}

/**
 * Ask the player to confirm, in the page.
 * @param {{ title: string, body: string, confirmLabel: string, cancelLabel?: string }} options
 * @returns {Promise<boolean>} true only when the confirm button was pressed
 */
export function confirmDialog(options = {}) {
    const answer = queue.then(() => showDialog(options));
    queue = answer.then(() => {}, () => {});
    return answer;
}
