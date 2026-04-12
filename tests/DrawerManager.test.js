/**
 * @jest-environment jsdom
 */

import { DrawerManager } from '../assets/js/ui/DrawerManager.js';

function createDrawerDOM(id) {
    const backdrop = document.createElement('div');
    backdrop.id = `${id}-backdrop`;
    document.body.appendChild(backdrop);

    const drawer = document.createElement('div');
    drawer.id = `${id}-drawer`;
    drawer.style.display = 'none';
    document.body.appendChild(drawer);

    const closeBtn = document.createElement('button');
    closeBtn.id = `close-${id}`;
    drawer.appendChild(closeBtn);

    return { backdrop, drawer, closeBtn };
}

describe('DrawerManager', () => {
    let manager;

    afterEach(() => {
        if (manager) manager.destroy();
        document.body.innerHTML = '';
        document.body.style.overflow = '';
    });

    describe('open and close', () => {
        it('should open a drawer by showing it and activating backdrop', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');

            expect(document.getElementById('test-drawer').style.display).toBe('flex');
            expect(document.getElementById('test-backdrop').classList.contains('active')).toBe(true);
            expect(document.body.style.overflow).toBe('hidden');
        });

        it('should close a drawer by hiding it and deactivating backdrop', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            manager.close('test');

            expect(document.getElementById('test-drawer').style.display).toBe('none');
            expect(document.getElementById('test-backdrop').classList.contains('active')).toBe(false);
            expect(document.body.style.overflow).toBe('');
        });

        it('should do nothing when opening an unknown drawer id', () => {
            manager = new DrawerManager({});
            manager.open('nonexistent');
            expect(document.body.style.overflow).toBe('');
        });

        it('should do nothing when closing an unknown drawer id', () => {
            manager = new DrawerManager({});
            manager.close('nonexistent');
            expect(document.body.style.overflow).toBe('');
        });

        it('should use custom displayStyle when configured', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test', displayStyle: 'block' }
            });

            manager.open('test');

            expect(document.getElementById('test-drawer').style.display).toBe('block');
        });
    });

    describe('isOpen', () => {
        it('should return true when drawer is open', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            expect(manager.isOpen('test')).toBe(true);
        });

        it('should return false when drawer is closed', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            expect(manager.isOpen('test')).toBe(false);
        });

        it('should return false for unknown drawer id', () => {
            manager = new DrawerManager({});
            expect(manager.isOpen('nonexistent')).toBe(false);
        });
    });

    describe('single-drawer constraint', () => {
        it('should close the current drawer when opening a different one', () => {
            createDrawerDOM('alpha');
            createDrawerDOM('beta');
            manager = new DrawerManager({
                alpha: { backdrop: 'alpha-backdrop', drawer: 'alpha-drawer', closeBtn: 'close-alpha' },
                beta: { backdrop: 'beta-backdrop', drawer: 'beta-drawer', closeBtn: 'close-beta' }
            });

            manager.open('alpha');
            manager.open('beta');

            expect(document.getElementById('alpha-drawer').style.display).toBe('none');
            expect(document.getElementById('alpha-backdrop').classList.contains('active')).toBe(false);
            expect(document.getElementById('beta-drawer').style.display).toBe('flex');
            expect(document.getElementById('beta-backdrop').classList.contains('active')).toBe(true);
            expect(manager.isOpen('alpha')).toBe(false);
            expect(manager.isOpen('beta')).toBe(true);
        });

        it('should not re-close when opening the same drawer that is already open', () => {
            const onAfterClose = jest.fn();
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test', onAfterClose }
            });

            manager.open('test');
            manager.open('test');

            expect(onAfterClose).not.toHaveBeenCalled();
            expect(manager.isOpen('test')).toBe(true);
        });

        it('should not call onBeforeOpen again when drawer is already open', () => {
            const onBeforeOpen = jest.fn();
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test', onBeforeOpen }
            });

            manager.open('test');
            expect(onBeforeOpen).toHaveBeenCalledTimes(1);

            manager.open('test');
            expect(onBeforeOpen).toHaveBeenCalledTimes(1);
        });
    });

    describe('closeAll', () => {
        it('should close the active drawer', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            manager.closeAll();

            expect(manager.isOpen('test')).toBe(false);
            expect(document.getElementById('test-drawer').style.display).toBe('none');
        });

        it('should do nothing when no drawer is open', () => {
            manager = new DrawerManager({});
            manager.closeAll(); // should not throw
        });
    });

    describe('lifecycle hooks', () => {
        it('should call onBeforeOpen with the drawer element', () => {
            const onBeforeOpen = jest.fn();
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test', onBeforeOpen }
            });

            manager.open('test');

            expect(onBeforeOpen).toHaveBeenCalledTimes(1);
            expect(onBeforeOpen).toHaveBeenCalledWith(document.getElementById('test-drawer'));
        });

        it('should call onBeforeOpen before the drawer becomes visible', () => {
            let displayAtCallTime;
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: {
                    backdrop: 'test-backdrop',
                    drawer: 'test-drawer',
                    closeBtn: 'close-test',
                    onBeforeOpen: (el) => { displayAtCallTime = el.style.display; }
                }
            });

            manager.open('test');

            expect(displayAtCallTime).toBe('none');
        });

        it('should call onAfterClose with the drawer element', () => {
            const onAfterClose = jest.fn();
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test', onAfterClose }
            });

            manager.open('test');
            manager.close('test');

            expect(onAfterClose).toHaveBeenCalledTimes(1);
            expect(onAfterClose).toHaveBeenCalledWith(document.getElementById('test-drawer'));
        });

        it('should call onAfterClose after the drawer is hidden', () => {
            let displayAtCallTime;
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: {
                    backdrop: 'test-backdrop',
                    drawer: 'test-drawer',
                    closeBtn: 'close-test',
                    onAfterClose: (el) => { displayAtCallTime = el.style.display; }
                }
            });

            manager.open('test');
            manager.close('test');

            expect(displayAtCallTime).toBe('none');
        });
    });

    describe('Escape key', () => {
        it('should close the active drawer on Escape', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

            expect(manager.isOpen('test')).toBe(false);
            expect(document.getElementById('test-drawer').style.display).toBe('none');
        });

        it('should do nothing on Escape when no drawer is open', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            expect(manager.isOpen('test')).toBe(false);
        });
    });

    describe('backdrop click', () => {
        it('should close the drawer when backdrop is clicked', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            document.getElementById('test-backdrop').click();

            expect(manager.isOpen('test')).toBe(false);
            expect(document.getElementById('test-drawer').style.display).toBe('none');
        });
    });

    describe('close button', () => {
        it('should close the drawer when close button is clicked', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            document.getElementById('close-test').click();

            expect(manager.isOpen('test')).toBe(false);
            expect(document.getElementById('test-drawer').style.display).toBe('none');
        });

        it('should work without a closeBtn configured', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer' }
            });

            manager.open('test');
            expect(manager.isOpen('test')).toBe(true);

            manager.close('test');
            expect(manager.isOpen('test')).toBe(false);
        });
    });

    describe('destroy', () => {
        it('should stop responding to Escape after destroy', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.open('test');
            manager.destroy();

            // Re-open manually to test Escape no longer works
            const drawer = document.getElementById('test-drawer');
            drawer.style.display = 'flex';

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            // Drawer stays visible because manager is destroyed
            expect(drawer.style.display).toBe('flex');
        });

        it('should stop responding to backdrop click after destroy', () => {
            createDrawerDOM('test');
            manager = new DrawerManager({
                test: { backdrop: 'test-backdrop', drawer: 'test-drawer', closeBtn: 'close-test' }
            });

            manager.destroy();

            // Manually show drawer
            const drawer = document.getElementById('test-drawer');
            drawer.style.display = 'flex';

            document.getElementById('test-backdrop').click();
            expect(drawer.style.display).toBe('flex');
        });
    });

    describe('lazy DOM resolution', () => {
        it('should resolve elements lazily on first open', () => {
            // Create manager before DOM elements exist
            manager = new DrawerManager({
                lazy: { backdrop: 'lazy-backdrop', drawer: 'lazy-drawer' }
            });

            // Elements don't exist yet — open should be a no-op
            manager.open('lazy');
            expect(manager.isOpen('lazy')).toBe(false);

            // Now add elements to the DOM
            createDrawerDOM('lazy');

            // Open should work now
            manager.open('lazy');
            expect(manager.isOpen('lazy')).toBe(true);
            expect(document.getElementById('lazy-drawer').style.display).toBe('flex');

            // Backdrop click should also work after lazy resolution
            document.getElementById('lazy-backdrop').click();
            expect(manager.isOpen('lazy')).toBe(false);
            expect(document.getElementById('lazy-drawer').style.display).toBe('none');
        });

        it('should wire close button handlers after lazy resolution', () => {
            manager = new DrawerManager({
                lazy: { backdrop: 'lazy-backdrop', drawer: 'lazy-drawer', closeBtn: 'close-lazy' }
            });

            createDrawerDOM('lazy');

            manager.open('lazy');
            expect(manager.isOpen('lazy')).toBe(true);

            document.getElementById('close-lazy').click();
            expect(manager.isOpen('lazy')).toBe(false);
        });
    });
});
