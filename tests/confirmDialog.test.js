/**
 * @jest-environment jsdom
 *
 * The in-page confirm dialog (Plan 4, D10; lqt0 §4): no default action, Escape and the
 * backdrop cancel, and two dialogs never stack.
 */
import { confirmDialog } from '../assets/js/ui/confirmDialog.js';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const OPTIONS = {
  title: 'Remove books?',
  body: 'Remove 3 books from Tome of Secrets.',
  confirmLabel: 'Remove 3 books',
  cancelLabel: 'Cancel'
};

function dialogs() {
  return document.querySelectorAll('.tos-confirm-dialog');
}

function confirmButton() {
  return document.querySelector('.tos-confirm-confirm');
}

function cancelButton() {
  return document.querySelector('.tos-confirm-cancel');
}

describe('confirmDialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="opener">Open</button>';
  });

  afterEach(async () => {
    // Close anything a failed test left open so the queue never carries over.
    while (cancelButton()) {
      cancelButton().click();
      await flush();
    }
  });

  test('shows the title, body and both labels', async () => {
    const answer = confirmDialog(OPTIONS);
    await flush();
    const dialog = dialogs()[0];
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('Remove books?');
    expect(dialog.textContent).toContain('Remove 3 books from Tome of Secrets.');
    expect(confirmButton().textContent).toBe('Remove 3 books');
    expect(cancelButton().textContent).toBe('Cancel');
    cancelButton().click();
    await expect(answer).resolves.toBe(false);
  });

  test('Escape resolves false and removes the dialog', async () => {
    const answer = confirmDialog(OPTIONS);
    await flush();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await expect(answer).resolves.toBe(false);
    expect(dialogs()).toHaveLength(0);
  });

  test('a backdrop click resolves false', async () => {
    const answer = confirmDialog(OPTIONS);
    await flush();
    document.querySelector('.tos-confirm-backdrop').click();
    await expect(answer).resolves.toBe(false);
  });

  test('a click inside the dialog is not a backdrop click', async () => {
    const answer = confirmDialog(OPTIONS);
    await flush();
    dialogs()[0].click();
    await flush();
    expect(dialogs()).toHaveLength(1);
    cancelButton().click();
    await expect(answer).resolves.toBe(false);
  });

  test('the cancel button resolves false', async () => {
    const answer = confirmDialog(OPTIONS);
    await flush();
    cancelButton().click();
    await expect(answer).resolves.toBe(false);
  });

  test('the confirm button resolves true', async () => {
    const answer = confirmDialog(OPTIONS);
    await flush();
    confirmButton().click();
    await expect(answer).resolves.toBe(true);
    expect(dialogs()).toHaveLength(0);
  });

  test('the confirm button is not focused on open, and Enter does not confirm', async () => {
    document.getElementById('opener').focus();
    const answer = confirmDialog(OPTIONS);
    await flush();
    expect(document.activeElement).not.toBe(confirmButton());
    expect(dialogs()[0].contains(document.activeElement)).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(dialogs()).toHaveLength(1);
    cancelButton().click();
    await expect(answer).resolves.toBe(false);
    // Focus goes back where it was.
    expect(document.activeElement).toBe(document.getElementById('opener'));
  });

  test('two dialogs never stack: the second waits for the first', async () => {
    const first = confirmDialog({ ...OPTIONS, title: 'First' });
    const second = confirmDialog({ ...OPTIONS, title: 'Second' });
    await flush();
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].textContent).toContain('First');
    confirmButton().click();
    await expect(first).resolves.toBe(true);
    await flush();
    expect(dialogs()).toHaveLength(1);
    expect(dialogs()[0].textContent).toContain('Second');
    cancelButton().click();
    await expect(second).resolves.toBe(false);
  });
});
