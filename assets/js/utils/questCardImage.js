/**
 * Quest card image helpers
 *
 * Centralizes image path derivation for atmospheric buffs, genre quests, and side quests.
 * Images are stored in Supabase at {quest-type}/ (e.g., atmospheric-buffs/, genre-quests/, side-quests/)
 */

import { toCdnImageUrlIfConfigured } from './imageCdn.js';

/**
 * Get image filename for atmospheric buff
 * Drops "The" prefix and replaces / with -
 * @param {string} buffName - Buff name (e.g., "The Candlight Study")
 * @returns {string} Image filename (e.g., "candlight-study.png")
 */
function getAtmosphericBuffImageFilename(buffName) {
  if (!buffName || typeof buffName !== 'string') return null;
  
  // Drop "The" prefix if present
  let name = buffName.trim();
  if (name.startsWith('The ')) {
    name = name.substring(4);
  }
  
  // Replace / with - and slugify
  return name
    .toLowerCase()
    .replace(/\//g, '-')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') + '.png';
}

/**
 * Get image filename for genre quest or side quest
 * Keeps "The" prefix and replaces / with -
 * @param {string} questName - Quest name (e.g., "The Arcane Grimoire")
 * @returns {string} Image filename (e.g., "the-arcane-grimoire.png")
 */
function getQuestImageFilename(questName) {
  if (!questName || typeof questName !== 'string') return null;
  
  // Replace / with - and slugify
  return questName
    .toLowerCase()
    .replace(/\//g, '-')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') + '.png';
}

/**
 * Get atmospheric buff card image path
 * @param {Object|string} buffData - Buff data object with name/id, or buff name string
 * @returns {string|null} Image path or null
 */
export function getAtmosphericBuffCardImage(buffData) {
  if (!buffData) return null;
  
  let buffName;
  if (typeof buffData === 'string') {
    buffName = buffData;
  } else {
    buffName = buffData.name || buffData.id || null;
  }
  
  if (!buffName) return null;
  
  const filename = getAtmosphericBuffImageFilename(buffName);
  if (!filename) return null;
  
  return toCdnImageUrlIfConfigured(`assets/images/atmospheric-buffs/${filename}`);
}

/**
 * Get genre quest card image path
 * @param {Object|string} questData - Quest data object with genre/name/id, or quest name string
 * @returns {string|null} Image path or null
 */
export function getGenreQuestCardImage(questData) {
  if (!questData) return null;
  
  let questName;
  if (typeof questData === 'string') {
    questName = questData;
  } else {
    // Genre quests use the genre name as the display name
    questName = questData.genre || questData.name || questData.id || null;
  }
  
  if (!questName) return null;
  
  const filename = getQuestImageFilename(questName);
  if (!filename) return null;
  
  return toCdnImageUrlIfConfigured(`assets/images/genre-quests/${filename}`);
}

/**
 * Get side quest card image path
 * @param {Object|string} questData - Quest data object with name/id, or quest name string
 * @returns {string|null} Image path or null
 */
export function getSideQuestCardImage(questData) {
  if (!questData) return null;
  
  let questName;
  if (typeof questData === 'string') {
    questName = questData;
  } else {
    questName = questData.name || questData.id || null;
  }
  
  if (!questName) return null;
  
  const filename = getQuestImageFilename(questName);
  if (!filename) return null;
  
  return toCdnImageUrlIfConfigured(`assets/images/side-quests/${filename}`);
}

/**
 * Get cardback image path for a quest type
 * @param {string} questType - Quest type: 'atmospheric-buffs', 'genre-quests', or 'side-quests'
 * @returns {string} Cardback image path
 */
export function getQuestCardbackImage(questType) {
  const cardbackFilename = `tos-cardback-${questType}.png`;
  return toCdnImageUrlIfConfigured(`assets/images/${questType}/${cardbackFilename}`);
}
