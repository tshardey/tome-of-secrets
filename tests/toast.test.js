/**
 * @jest-environment jsdom
 */

import { showToast, toast, TOAST_TYPES } from '../assets/js/ui/toast.js';

describe('Toast System', () => {
    beforeEach(() => {
        // Clear any existing toasts
        document.body.innerHTML = '';
    });

    afterEach(() => {
        // Ensure timer mode doesn't leak between tests
        jest.useRealTimers();
        jest.clearAllTimers();

        // Clean up toasts
        const container = document.getElementById('toast-container');
        if (container) {
            container.remove();
        }
    });

    describe('showToast', () => {
        it('should create a toast container if it does not exist', (done) => {
            showToast('Test message');
            
            // Wait for DOM update
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                expect(container).toBeTruthy();
                expect(container.classList.contains('toast-container')).toBe(true);
                done();
            }, 10);
        });

        it('should create a toast element with the message', (done) => {
            showToast('Test message');
            
            // Wait for DOM update
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                const toast = container.querySelector('.toast');
                
                expect(toast).toBeTruthy();
                expect(toast.querySelector('.toast-message').textContent).toBe('Test message');
                done();
            }, 10);
        });

        it('should set the correct toast type class', (done) => {
            showToast('Success message', { type: TOAST_TYPES.SUCCESS });
            
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                const toast = container.querySelector('.toast');
                
                expect(toast.classList.contains('toast-success')).toBe(true);
                done();
            }, 10);
        });

        it('should escape HTML in messages to prevent XSS', (done) => {
            showToast('<script>alert("xss")</script>');
            
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                const toast = container.querySelector('.toast');
                const message = toast.querySelector('.toast-message');
                
                expect(message.innerHTML).not.toContain('<script>');
                expect(message.innerHTML).toContain('&lt;script&gt;');
                done();
            }, 10);
        });

        it('should add toast-show class after creation', (done) => {
            showToast('Test message');
            
            const container = document.getElementById('toast-container');
            const toast = container.querySelector('.toast');
            
            // Use requestAnimationFrame to wait for the class to be added
            requestAnimationFrame(() => {
                expect(toast.classList.contains('toast-show')).toBe(true);
                done();
            });
        });

        it('should include a close button', (done) => {
            showToast('Test message');
            
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                const toast = container.querySelector('.toast');
                const closeButton = toast.querySelector('.toast-close');
                
                expect(closeButton).toBeTruthy();
                expect(closeButton.getAttribute('aria-label')).toBe('Close notification');
                done();
            }, 10);
        });

        it('should auto-dismiss after duration', () => {
            jest.useFakeTimers();
            
            showToast('Test message', { duration: 1000 });
            
            const container = document.getElementById('toast-container');
            const toast = container.querySelector('.toast');
            
            expect(toast).toBeTruthy();
            
            // Fast-forward time
            jest.advanceTimersByTime(1000);
            
            expect(toast.classList.contains('toast-hide')).toBe(true);
        });

        it('should return a dismiss function', (done) => {
            const dismiss = showToast('Test message');
            
            expect(typeof dismiss).toBe('function');
            
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                const toast = container.querySelector('.toast');
                
                expect(toast).toBeTruthy();
                
                // Call dismiss
                dismiss();
                
                setTimeout(() => {
                    expect(toast.classList.contains('toast-hide')).toBe(true);
                    done();
                }, 50);
            }, 10);
        });
    });

    describe('toast convenience methods', () => {
        it('toast.success should create a success toast', (done) => {
            toast.success('Success message');
            
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                const toastEl = container.querySelector('.toast');
                
                expect(toastEl.classList.contains('toast-success')).toBe(true);
                expect(toastEl.querySelector('.toast-icon').textContent).toBe('✓');
                done();
            }, 10);
        });

        it('toast.error should create an error toast', (done) => {
            toast.error('Error message');
            
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                const toastEl = container.querySelector('.toast');
                
                expect(toastEl.classList.contains('toast-error')).toBe(true);
                expect(toastEl.querySelector('.toast-icon').textContent).toBe('✗');
                done();
            }, 10);
        });

        it('toast.info should create an info toast', (done) => {
            toast.info('Info message');
            
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                const toastEl = container.querySelector('.toast');
                
                expect(toastEl.classList.contains('toast-info')).toBe(true);
                expect(toastEl.querySelector('.toast-icon').textContent).toBe('ℹ');
                done();
            }, 10);
        });

        it('toast.warning should create a warning toast', (done) => {
            toast.warning('Warning message');
            
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                const toastEl = container.querySelector('.toast');
                
                expect(toastEl.classList.contains('toast-warning')).toBe(true);
                expect(toastEl.querySelector('.toast-icon').textContent).toBe('⚠');
                done();
            }, 10);
        });
    });

    describe('close button functionality', () => {
        it('should close toast when close button is clicked', (done) => {
            showToast('Test message');
            
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                const toast = container.querySelector('.toast');
                const closeButton = toast.querySelector('.toast-close');
                
                expect(toast).toBeTruthy();
                
                // Click close button
                closeButton.click();
                
                setTimeout(() => {
                    expect(toast.classList.contains('toast-hide')).toBe(true);
                    done();
                }, 50);
            }, 10);
        });
    });

    describe('accessibility', () => {
        it('should have proper ARIA attributes', (done) => {
            showToast('Test message', { type: TOAST_TYPES.ERROR });
            
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                const toast = container.querySelector('.toast');
                
                expect(toast.getAttribute('role')).toBe('alert');
                expect(toast.getAttribute('aria-live')).toBe('assertive');
                done();
            }, 10);
        });

        it('should use polite aria-live for non-error toasts', (done) => {
            showToast('Test message', { type: TOAST_TYPES.INFO });
            
            setTimeout(() => {
                const container = document.getElementById('toast-container');
                const toast = container.querySelector('.toast');
                
                expect(toast.getAttribute('aria-live')).toBe('polite');
                done();
            }, 10);
        });
    });
});

