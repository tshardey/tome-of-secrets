/**
 * Dungeon room card image helpers
 *
 * We show room card art in multiple places (active quest cards, archive cards,
 * and the deck draw UI). This file centralizes the path derivation so we don't
 * end up with divergent slug rules.
 */

import { toCdnImageUrlIfConfigured } from './imageCdn.js';

/**
 * Slugify a dungeon room name into the image filename segment.
 * Matches the historical behavior used by quest cards, but also:
 * - collapses consecutive hyphens
 * - trims leading/trailing hyphens
 *
 * Examples:
 * - "The Shroud's Heart" -> "the-shrouds-heart"
 * - "Author’s Study" -> "authors-study"
 */
function slugifyRoomName(name) {
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    // Remove punctuation/symbols but keep whitespace and hyphens.
    .replace(/[^a-z0-9\s-]/g, '')
    // Convert whitespace runs to hyphen.
    .replace(/\s+/g, '-')
    // Collapse multiple hyphens and trim.
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Get the dungeon room card image path.
 *
 * Order of preference:
 * 1) `roomData.cardImage` (explicit override, if present)
 * 2) derive from `roomData.id` when it follows `dungeon-room-<slug>`
 * 3) derive from `roomData.name` using our canonical slug rules
 *
 * @param {Object} roomData
 * @returns {string|null}
 */
export function getDungeonRoomCardImage(roomData) {
  if (!roomData) return null;

  if (roomData.cardImage) {
    return toCdnImageUrlIfConfigured(roomData.cardImage);
  }

  const roomId = roomData.id || '';
  if (typeof roomId === 'string' && roomId.startsWith('dungeon-room-')) {
    const slug = roomId.replace('dungeon-room-', '');
    if (slug) return toCdnImageUrlIfConfigured(`assets/images/dungeons/${slug}.png`);
  }

  const slug = slugifyRoomName(roomData.name);
  if (!slug) return null;

  return toCdnImageUrlIfConfigured(`assets/images/dungeons/${slug}.png`);
}

