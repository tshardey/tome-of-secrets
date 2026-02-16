/**
 * RoomVisualization - Pure DOM renderer for the room + layer visualization.
 * Uses isometric reference-based layers: base (walls + bookshelves) + one layer per
 * active buff. Layers share the same composition/scale, so they stack without positioning.
 */

import { toCdnImageUrlIfConfigured } from '../utils/imageCdn.js';

const ROOM_CLASS = 'room-visualization';
const BASE_CLASS = 'room-base';
const LAYER_CLASS = 'room-layer';
const LAYER_HIDDEN_CLASS = 'hidden';

/**
 * Full render: base image + one img per theme layer. Active buffs show their layer;
 * others are hidden. All layers are full-bleed (same dimensions as base).
 * @param {HTMLElement} containerEl - Parent element (e.g. #room-visualization-container)
 * @param {Object} theme - Room theme from getRoomTheme (id, baseImage, stickers)
 * @param {Array<Object>} activeStickers - List from getActiveStickers (each has slug)
 */
export function render(containerEl, theme, activeStickers) {
    if (!containerEl || !theme) return;

    const activeSlugs = new Set((activeStickers || []).map(s => s.slug));

    const baseUrl = toCdnImageUrlIfConfigured(theme.baseImage || '');

    let room = containerEl.querySelector(`.${ROOM_CLASS}`);
    if (!room) {
        room = document.createElement('div');
        room.className = ROOM_CLASS;
        room.style.position = 'relative';
        room.style.overflow = 'hidden';
        room.style.display = 'inline-block';
        room.style.maxWidth = '100%';
        containerEl.appendChild(room);
    }

    // Base image: full image in view — size room to image so nothing is cropped
    let baseImg = room.querySelector(`.${BASE_CLASS}`);
    if (!baseImg) {
        baseImg = document.createElement('img');
        baseImg.className = BASE_CLASS;
        baseImg.alt = '';
        baseImg.setAttribute('aria-hidden', 'true');
        room.appendChild(baseImg);
    }
    baseImg.src = baseUrl;
    baseImg.style.width = '100%';
    baseImg.style.height = 'auto';
    baseImg.style.display = 'block';
    baseImg.style.verticalAlign = 'top';

    // Layers: full-bleed overlay, same composition as base — no per-layer positioning
    const stickers = theme.stickers || {};
    for (const [slug, config] of Object.entries(stickers)) {
        const cfg = typeof config === 'object' ? config : { image: config };
        const imagePath = cfg?.image;
        if (!imagePath) continue;

        const zIndex = String(cfg.zIndex != null ? cfg.zIndex : 2);
        const scale = cfg.scale != null ? Number(cfg.scale) : 1;
        const transform = scale !== 1 ? `scale(${scale})` : '';

        let img = room.querySelector(`.${LAYER_CLASS}[data-sticker="${slug}"]`);
        if (!img) {
            img = document.createElement('img');
            img.className = LAYER_CLASS;
            img.setAttribute('data-sticker', slug);
            img.alt = '';
            img.setAttribute('aria-hidden', 'true');
            img.style.position = 'absolute';
            img.style.top = '0';
            img.style.left = '0';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.zIndex = zIndex;
            if (scale !== 1) {
                img.style.transformOrigin = 'center center';
                img.style.transform = transform;
            }
            img.src = toCdnImageUrlIfConfigured(imagePath);
            room.appendChild(img);
        } else {
            img.style.zIndex = zIndex;
            img.style.transformOrigin = scale !== 1 ? 'center center' : '';
            img.style.transform = transform;
            img.src = toCdnImageUrlIfConfigured(imagePath);
        }
        if (activeSlugs.has(slug)) {
            img.classList.remove(LAYER_HIDDEN_CLASS);
            img.style.opacity = '1';
        } else {
            img.classList.add(LAYER_HIDDEN_CLASS);
            img.style.opacity = '0';
        }
    }
}

/**
 * Show or hide a single layer by slug (e.g. on buff toggle).
 * @param {HTMLElement} containerEl - Same container passed to render
 * @param {string} stickerSlug - Layer slug (e.g. 'candlelight-study')
 * @param {boolean} isActive - True to show, false to hide
 */
export function toggleSticker(containerEl, stickerSlug, isActive) {
    if (!containerEl) return;
    const room = containerEl.querySelector(`.${ROOM_CLASS}`);
    if (!room) return;

    const img = room.querySelector(`.${LAYER_CLASS}[data-sticker="${stickerSlug}"]`);
    if (!img) return;

    if (isActive) {
        img.classList.remove(LAYER_HIDDEN_CLASS);
        img.style.opacity = '1';
    } else {
        img.classList.add(LAYER_HIDDEN_CLASS);
        img.style.opacity = '0';
    }
}
