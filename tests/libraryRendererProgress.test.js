/**
 * @jest-environment jsdom
 */

import { calculateWingProgressPercent } from '../assets/js/page-renderers/libraryRenderer.js';

describe('Library renderer wing progress helpers', () => {
    test('returns 0% (not NaN) for zero-room wings', () => {
        const percent = calculateWingProgressPercent({ completedCount: 0, totalRooms: 0 });
        expect(Number.isFinite(percent)).toBe(true);
        expect(percent).toBe(0);
    });

    test('returns bounded percentage for normal wings', () => {
        expect(calculateWingProgressPercent({ completedCount: 2, totalRooms: 4 })).toBe(50);
        expect(calculateWingProgressPercent({ completedCount: 6, totalRooms: 4 })).toBe(100);
        expect(calculateWingProgressPercent({ completedCount: -2, totalRooms: 4 })).toBe(0);
    });
});
