/**
 * @jest-environment jsdom
 */

let mockGetRoomThemeImpl;

jest.mock('../../assets/js/character-sheet/data.js', () => ({
    getRoomTheme: (themeId) => (typeof mockGetRoomThemeImpl === 'function' ? mockGetRoomThemeImpl(themeId) : null),
    atmosphericBuffs: {
        'The Candlight Study': { id: 'the-candlight-study', name: 'The Candlight Study', stickerSlug: 'candlelight-study' },
        'The Soaking in Nature': { id: 'the-soaking-in-nature', name: 'The Soaking in Nature', stickerSlug: 'soaking-in-nature' }
    },
    allItems: {
        'Garden Gnome': {
            name: 'Garden Gnome',
            atmosphericReward: true,
            atmosphericStickerSlug: 'garden-gnome'
        }
    },
    roomThemes: {
        'cozy-modern': {
            id: 'cozy-modern',
            name: 'Cozy Modern Library',
            baseImage: 'assets/images/atmospheric-buffs/cozy-modern-plain-base.png',
            stickers: {
                'candlelight-study': { image: 'candlelight.png', category: 'atmospheric', top: '10%', left: '5%', width: '30%', zIndex: 2 },
                'soaking-in-nature': { image: 'soaking.png', category: 'atmospheric', top: '50%', left: '20%', width: '28%', zIndex: 2 },
                'garden-gnome': { image: 'garden-gnome.png' }
            }
        }
    }
}));

jest.mock('../../assets/js/services/AtmosphericBuffService.js', () => ({
    isGroveTenderBuff: (buffName, background) => background === 'groveTender' && buffName === 'The Soaking in Nature'
}));

import { STORAGE_KEYS } from '../../assets/js/character-sheet/storageKeys.js';
import {
    isAtmosphericBuffActiveForSticker,
    getStickerForBuff,
    getActiveStickers
} from '../../assets/js/services/RoomVisualizationService.js';

const cozyModernTheme = {
    id: 'cozy-modern',
    stickers: {
        'candlelight-study': { image: 'candlelight.png', category: 'atmospheric', top: '10%', left: '5%', width: '30%', zIndex: 2 },
        'soaking-in-nature': { image: 'soaking.png', category: 'atmospheric', top: '50%', left: '20%', width: '28%', zIndex: 2 },
        'garden-gnome': { image: 'garden-gnome.png' }
    }
};

describe('RoomVisualizationService', () => {
    beforeEach(() => {
        mockGetRoomThemeImpl = (themeId) => (themeId === 'cozy-modern' ? cozyModernTheme : null);
    });

    describe('isAtmosphericBuffActiveForSticker', () => {
        test('returns true when buff is active in state', () => {
            const state = { 'The Candlight Study': { isActive: true } };
            expect(isAtmosphericBuffActiveForSticker('The Candlight Study', state)).toBe(true);
        });

        test('returns false when buff is not active', () => {
            const state = { 'The Candlight Study': { isActive: false } };
            expect(isAtmosphericBuffActiveForSticker('The Candlight Study', state)).toBe(false);
        });

        test('returns true for Grove Tender Soaking in Nature without state', () => {
            expect(isAtmosphericBuffActiveForSticker('The Soaking in Nature', {}, 'groveTender')).toBe(true);
        });

        test('returns false for unknown buff', () => {
            const state = {};
            expect(isAtmosphericBuffActiveForSticker('Unknown Buff', state)).toBe(false);
        });
    });

    describe('getStickerForBuff', () => {
        test('returns layer config for known buff', () => {
            const sticker = getStickerForBuff('The Candlight Study', 'cozy-modern');
            expect(sticker).not.toBeNull();
            expect(sticker.slug).toBe('candlelight-study');
            expect(sticker.image).toBe('candlelight.png');
        });

        test('returns null for buff without stickerSlug in data', () => {
            const sticker = getStickerForBuff('Unknown Buff', 'cozy-modern');
            expect(sticker).toBeNull();
        });

        test('returns null for unknown theme', () => {
            mockGetRoomThemeImpl = () => null;
            const sticker = getStickerForBuff('The Candlight Study', 'unknown-theme');
            expect(sticker).toBeNull();
        });
    });

    describe('getActiveStickers', () => {
        test('returns empty array when no buffs active', () => {
            const state = { [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: {} };
            const stickers = getActiveStickers(state, 'cozy-modern');
            expect(stickers).toEqual([]);
        });

        test('returns sticker configs for active buffs', () => {
            const state = {
                [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: {
                    'The Candlight Study': { isActive: true, daysUsed: 0 }
                }
            };
            const stickers = getActiveStickers(state, 'cozy-modern');
            expect(stickers.length).toBe(1);
            expect(stickers[0].slug).toBe('candlelight-study');
        });

        test('includes Grove Tender Soaking in Nature when keeperBackground is groveTender', () => {
            const state = { [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: {} };
            const stickers = getActiveStickers(state, 'cozy-modern', { keeperBackground: 'groveTender' });
            expect(stickers.length).toBe(1);
            expect(stickers[0].slug).toBe('soaking-in-nature');
        });

        test('includes sticker for equipped atmospheric reward item', () => {
            const state = {
                [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: {},
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Garden Gnome' }]
            };
            const stickers = getActiveStickers(state, 'cozy-modern');
            expect(stickers.length).toBe(1);
            expect(stickers[0].slug).toBe('garden-gnome');
            expect(stickers[0].image).toBe('garden-gnome.png');
        });

        test('includes sticker for atmospheric reward item in passive familiar slot', () => {
            const state = {
                [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: {},
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [{ itemName: 'Garden Gnome' }]
            };
            const stickers = getActiveStickers(state, 'cozy-modern');
            expect(stickers.length).toBe(1);
            expect(stickers[0].slug).toBe('garden-gnome');
        });

        test('does not add duplicate sticker when same item is in both equipped and passive slot', () => {
            const state = {
                [STORAGE_KEYS.ATMOSPHERIC_BUFFS]: {},
                [STORAGE_KEYS.EQUIPPED_ITEMS]: [{ name: 'Garden Gnome' }],
                [STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS]: [{ itemName: 'Garden Gnome' }]
            };
            const stickers = getActiveStickers(state, 'cozy-modern');
            expect(stickers.length).toBe(1);
            expect(stickers[0].slug).toBe('garden-gnome');
        });
    });
});
