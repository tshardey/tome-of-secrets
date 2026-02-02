/**
 * Reusable Rendering Components
 * 
 * Extracted rendering functions for common UI elements.
 * All user-generated content is sanitized automatically.
 */

import { escapeHtml, decodeHtmlEntities } from '../utils/sanitize.js';
import { createElement } from '../utils/domHelpers.js';
import * as data from './data.js';
import { formatReceiptTooltip, calculateActiveQuestReceipt } from '../services/QuestService.js';
import { createQuestRowViewModel } from '../viewModels/questViewModel.js';
import { getEncounterImageFilename } from '../utils/encounterImageMap.js';
import { getDungeonRoomCardImage } from '../utils/dungeonRoomCardImage.js';
import { getGenreQuestCardImage, getSideQuestCardImage } from '../utils/questCardImage.js';
import { toCdnImageUrlIfConfigured } from '../utils/imageCdn.js';

/**
 * Extract name from a quest prompt (e.g., "The Archivist's Riddle: Read..." -> "The Archivist's Riddle")
 * @param {string} prompt - Quest prompt
 * @returns {string|null} Extracted name or null
 */
function extractNameFromPrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') return null;
    const colonIndex = prompt.indexOf(':');
    if (colonIndex > 0) {
        return prompt.substring(0, colonIndex).trim();
    }
    return null;
}

/**
 * Find room data by searching all rooms for a prompt match (for legacy quests without roomNumber)
 * @param {string} prompt - Quest prompt
 * @returns {{roomData: Object|null, roomNumber: string|null, encounterName: string|null}}
 */
function findRoomByPrompt(prompt) {
    if (!prompt || !data.dungeonRooms) return { roomData: null, roomNumber: null, encounterName: null };
    
    const extractedName = extractNameFromPrompt(prompt);
    
    for (const roomNumber in data.dungeonRooms) {
        const room = data.dungeonRooms[roomNumber];
        
        // Check if prompt matches room challenge or room name
        if (room.challenge === prompt || (extractedName && room.name === extractedName)) {
            return { roomData: room, roomNumber, encounterName: null };
        }
        
        // Check encounters
        if (room.encounters) {
            for (const encounterName in room.encounters) {
                const encounter = room.encounters[encounterName];
                if (encounter.befriend === prompt || encounter.defeat === prompt || 
                    (extractedName && encounterName === extractedName)) {
                    return { roomData: room, roomNumber, encounterName };
                }
            }
        }
    }
    
    return { roomData: null, roomNumber: null, encounterName: null };
}

/**
 * Pure rendering function for quest row - accepts view model
 * @param {Object} viewModel - Quest row view model from createQuestRowViewModel
 * @returns {HTMLTableRowElement} The rendered row element
 */
function renderQuestRowPure(viewModel) {
    const { quest, index, listType } = viewModel;
    const row = document.createElement('tr');
    
    // Build cells using view model data (already formatted and sanitized)
    const cells = [
        escapeHtml(viewModel.month),
        escapeHtml(viewModel.year),
        escapeHtml(viewModel.type),
        escapeHtml(viewModel.prompt),
        escapeHtml(viewModel.book),
        viewModel.xp, // Already formatted with indicator
        viewModel.paperScraps, // Already formatted with indicator
        viewModel.inkDrops, // Already formatted with indicator
        escapeHtml(viewModel.items),
        escapeHtml(viewModel.buffs),
        escapeHtml(viewModel.notes)
    ];
    
    cells.forEach(cellContent => {
        const cell = document.createElement('td');
        cell.innerHTML = cellContent;
        row.appendChild(cell);
    });
    
    // Add action cell
    const actionCell = document.createElement('td');
    actionCell.className = 'no-print action-cell';
    
    if (viewModel.showComplete) {
        actionCell.appendChild(createActionButton('Complete', 'complete-quest-btn', index));
    }
    if (viewModel.showDiscard) {
        actionCell.appendChild(createActionButton('Discard', 'discard-quest-btn', index));
    }
    if (viewModel.showDelete) {
        actionCell.appendChild(createActionButton('Delete', 'delete-btn', index, { 'data-list': listType === 'active' ? 'active' : listType }));
    }
    if (viewModel.showEdit) {
        actionCell.appendChild(createActionButton('Edit', 'edit-quest-btn', index, { 'data-list': viewModel.listName }));
    }
    
    row.appendChild(actionCell);
    
    return row;
}

/**
 * Renders a quest row for tables - maintains backward compatibility
 * Accepts either a view model or (quest, index, listType) for legacy calls
 * @param {Object|Object} questOrViewModel - Quest object or view model
 * @param {number} [index] - Quest index (for legacy calls)
 * @param {string} [listType] - Type of list ('active', 'completed', 'discarded') (for legacy calls)
 * @returns {HTMLTableRowElement} The rendered row element
 */
export function renderQuestRow(questOrViewModel, index, listType = 'active') {
    // Check if first param is a view model (has quest property) or a quest object
    if (questOrViewModel && typeof questOrViewModel === 'object' && questOrViewModel.quest !== undefined) {
        // It's a view model, use it directly
        return renderQuestRowPure(questOrViewModel);
    } else {
        // Legacy call - create view model
        const quest = questOrViewModel;
        const bgSelect = document.getElementById('keeperBackground');
        const schoolSelect = document.getElementById('wizardSchool');
        const background = bgSelect ? bgSelect.value : '';
        const wizardSchool = schoolSelect ? schoolSelect.value : '';
        
        const viewModel = createQuestRowViewModel(quest, index, listType, background, wizardSchool);
        return renderQuestRowPure(viewModel);
    }
}

/**
 * Renders an item card
 * @param {Object} item - Item object
 * @param {number} index - Item index
 * @param {Object} options - Options for rendering
 * @param {boolean} options.showEquip - Show equip button
 * @param {boolean} options.showUnequip - Show unequip button (item is equipped)
 * @param {boolean} options.showDelete - Show delete button
 * @param {boolean} options.isInPassiveSlot - Whether item is in a passive slot
 * @param {boolean} options.showDisplay - Show "Display" button for passive item slots
 * @param {boolean} options.showAdopt - Show "Adopt" button for passive familiar slots
 * @returns {HTMLElement} The rendered item card element
 */
export function renderItemCard(item, index, options = {}) {
    const { 
        showEquip = false, 
        showUnequip = false, 
        showDelete = false, 
        isInPassiveSlot = false,
        showDisplay = false,
        showAdopt = false
    } = options;
    
    // Quest type items cannot be equipped or put in passive slots
    const canEquip = showEquip && item.type !== 'Quest';
    const canDisplay = showDisplay && item.type !== 'Quest' && (item.type === 'Wearable' || item.type === 'Non-Wearable');
    const canAdopt = showAdopt && item.type === 'Familiar';
    
    // Determine bonus display logic:
    // - In passive slot: show only passive bonus
    // - Equipped: show only active bonus
    // - In inventory (neither): show both active and passive bonuses
    const isEquipped = showUnequip;
    const showActiveBonus = !isInPassiveSlot; // Show active bonus unless in passive slot
    const showPassiveBonus = !isEquipped && !isInPassiveSlot && item.passiveBonus; // Show passive bonus only when in inventory (not equipped, not in passive slot)
    const showOnlyPassiveBonus = isInPassiveSlot && item.passiveBonus; // Show only passive bonus when in passive slot
    
    const card = createElement('div', { class: 'item-card' });
    if (isInPassiveSlot) {
        card.classList.add('item-in-passive-slot');
    }
    
    // Item image
    if (item.img) {
        const img = createElement('img', { 
            src: escapeHtml(toCdnImageUrlIfConfigured(item.img)), 
            loading: 'lazy',
            decoding: 'async',
            alt: escapeHtml(item.name || '') 
        });
        card.appendChild(img);
    }
    
    // Item info
    const info = createElement('div', { class: 'item-info' });
    
    const name = createElement('h4');
    name.textContent = item.name || '';
    if (isInPassiveSlot) {
        const passiveBadge = createElement('span', { 
            class: 'passive-slot-badge',
            style: 'background: rgba(184, 159, 98, 0.2); color: #b89f62; padding: 2px 6px; border-radius: 3px; font-size: 0.8em; margin-left: 8px;'
        });
        passiveBadge.textContent = '🌟 Passive';
        name.appendChild(passiveBadge);
    }
    info.appendChild(name);
    
    if (item.type) {
        const type = createElement('p');
        type.innerHTML = `<strong>Type:</strong> ${escapeHtml(item.type)}`;
        info.appendChild(type);
    }
    
    // Show bonuses based on item state
    if (showOnlyPassiveBonus) {
        // In passive slot: show only passive bonus
        const passiveBonus = createElement('p');
        passiveBonus.textContent = item.passiveBonus;
        info.appendChild(passiveBonus);
    } else {
        // Not in passive slot: show active bonus if available
        if (showActiveBonus && item.bonus) {
            const bonus = createElement('p');
            bonus.textContent = item.bonus;
            info.appendChild(bonus);
        }
        
        // In inventory: also show passive bonus
        if (showPassiveBonus) {
            const passiveBonus = createElement('p');
            passiveBonus.style.fontStyle = 'italic';
            passiveBonus.style.color = '#8a7a61';
            passiveBonus.style.fontSize = '0.9em';
            passiveBonus.textContent = `Passive: ${item.passiveBonus}`;
            info.appendChild(passiveBonus);
        }
    }
    
    // Action buttons
    if (canEquip) {
        info.appendChild(createActionButton('Equip', 'equip-btn', index));
    }
    if (showUnequip) {
        info.appendChild(createActionButton('Unequip', 'unequip-btn', index));
    }
    if (canDisplay) {
        info.appendChild(createActionButton('Display', 'display-item-btn', index));
    }
    if (canAdopt) {
        info.appendChild(createActionButton('Adopt', 'adopt-familiar-btn', index));
    }
    if (showDelete) {
        info.appendChild(createActionButton('Delete', 'delete-item-btn', index));
    }
    
    card.appendChild(info);
    return card;
}

/**
 * Renders an empty slot card
 * @param {string} slotType - Type of slot ('Wearable', 'Non-Wearable', 'Familiar')
 * @returns {HTMLElement} The rendered empty slot element
 */
export function renderEmptySlot(slotType) {
    const card = createElement('div', { class: 'item-card empty-slot' });
    const text = createElement('p');
    text.textContent = `Empty ${slotType} Slot`;
    card.appendChild(text);
    return card;
}

/**
 * Renders a curse row
 * @param {Object} curse - Curse object
 * @param {number} index - Curse index
 * @param {string} status - Status ('Active' or 'Completed')
 * @returns {HTMLTableRowElement} The rendered row element
 */
export function renderCurseRow(curse, index, status = 'Active') {
    const row = document.createElement('tr');
    
    const cells = [
        escapeHtml(curse.name || ''),
        escapeHtml(curse.requirement || ''),
        escapeHtml(curse.book || ''),
        status
    ];
    
    cells.forEach(cellContent => {
        const cell = document.createElement('td');
        cell.textContent = cellContent;
        row.appendChild(cell);
    });
    
    // Action cell
    const actionCell = document.createElement('td');
    actionCell.className = 'no-print action-cell';
    
    if (status === 'Active') {
        actionCell.appendChild(createActionButton('Complete', 'complete-curse-btn', index));
        actionCell.appendChild(createActionButton('Edit', 'edit-curse-btn', index));
    }
    actionCell.appendChild(createActionButton('Delete', 'delete-curse-btn', index, { 
        'data-list': status === 'Active' ? undefined : 'completed' 
    }));
    
    row.appendChild(actionCell);
    return row;
}

/**
 * Renders a temporary buff row
 * @param {Object} buff - Temporary buff object
 * @param {number} index - Buff index
 * @returns {HTMLTableRowElement} The rendered row element
 */
export function renderTemporaryBuffRow(buff, index) {
    const row = document.createElement('tr');
    
    let durationText = '';
    if (buff.duration === 'one-time') {
        durationText = 'One-Time Use';
    } else if (buff.duration === 'until-end-month') {
        durationText = 'Until End of Month';
    } else if (buff.duration === 'two-months') {
        const monthsLeft = buff.monthsRemaining || 2;
        durationText = `${monthsLeft} Month${monthsLeft !== 1 ? 's' : ''} Remaining`;
    }
    
    const statusText = buff.status === 'used' ? 'Used' : 'Active';
    const statusClass = buff.status === 'used' ? 'style="color: #999;"' : '';
    
    const cells = [
        { content: buff.name || '', attrs: statusClass },
        { content: buff.description || '', attrs: statusClass },
        { content: durationText, attrs: statusClass },
        { content: statusText, attrs: statusClass }
    ];
    
    cells.forEach(({ content, attrs }) => {
        const cell = document.createElement('td');
        if (attrs && attrs.includes('color: #999;')) {
            cell.style.color = '#999';
        }
        cell.textContent = content;
        row.appendChild(cell);
    });
    
    // Action cell
    const actionCell = document.createElement('td');
    actionCell.className = 'no-print action-cell';
    
    if (buff.status === 'active' && buff.duration === 'one-time') {
        actionCell.appendChild(createActionButton('Mark as Used', 'mark-buff-used-btn', index));
    }
    if (buff.status === 'active') {
        actionCell.appendChild(createActionButton('Remove', 'remove-buff-btn', index));
    }
    if (buff.status === 'used') {
        actionCell.appendChild(createActionButton('Delete', 'remove-buff-btn', index));
    }
    
    row.appendChild(actionCell);
    return row;
}

/**
 * Renders an ability card
 * @param {string} abilityName - Name of the ability
 * @param {Object} ability - Ability data object
 * @param {number} index - Ability index
 * @returns {HTMLElement} The rendered ability card element
 */
export function renderAbilityCard(abilityName, ability, index) {
    const card = createElement('div', { class: 'rpg-ability-card' });
    
    // Add badge if school exists
    if (ability.school) {
        const badge = createElement('span', { class: 'rpg-ability-badge' });
        badge.textContent = ability.school;
        card.appendChild(badge);
    }
    
    // Ability name/title
    const name = createElement('h4', { class: 'rpg-ability-title' });
    name.textContent = abilityName;
    card.appendChild(name);
    
    // Ability description/benefit
    if (ability.benefit) {
        const benefit = createElement('p', { class: 'rpg-ability-description' });
        benefit.textContent = ability.benefit;
        card.appendChild(benefit);
    }
    
    // Cost information (if applicable)
    if (ability.cost !== undefined) {
        const cost = createElement('p', { class: 'rpg-ability-cost' });
        cost.style.cssText = 'margin-top: 8px; font-size: 0.85em; color: #8a7a61; font-style: italic;';
        cost.innerHTML = `<strong>Cost:</strong> ${ability.cost} SMP`;
        card.appendChild(cost);
    }
    
    // Delete button
    const deleteBtn = createActionButton('Forget', 'delete-ability-btn', index);
    card.appendChild(deleteBtn);
    
    return card;
}

/**
 * Determines if a dungeon encounter was befriended or defeated
 * @param {Object} quest - Quest object
 * @returns {string|null} - 'befriend', 'defeat', or null if not an encounter
 */
function getEncounterAction(quest) {
    // Only check dungeon crawl quests
    // Ensure prompt is a string before using string methods
    if (quest.type !== '♠ Dungeon Crawl' || !quest.prompt || typeof quest.prompt !== 'string') {
        return null;
    }
    
    // Primary check: use new fields if available
    if (quest.isEncounter && quest.roomNumber && quest.encounterName) {
        const roomData = data.dungeonRooms?.[quest.roomNumber];
        if (roomData && roomData.encounters) {
            const encounter = roomData.encounters[quest.encounterName];
            if (encounter) {
                // Check if prompt matches befriend or defeat
                if (encounter.befriend && quest.prompt === encounter.befriend) {
                    return 'befriend';
                }
                if (encounter.defeat && quest.prompt === encounter.defeat) {
                    return 'defeat';
                }
            }
        }
    }
    
    // Fallback: search all rooms and encounters for prompt match (for old quests)
    if (data.dungeonRooms) {
        for (const roomNumber in data.dungeonRooms) {
            const room = data.dungeonRooms[roomNumber];
            if (!room.encounters) continue;
            
            for (const encounterName in room.encounters) {
                const encounter = room.encounters[encounterName];
                
                // Check for exact prompt match
                if (encounter.befriend && quest.prompt === encounter.befriend) {
                    return 'befriend';
                }
                if (encounter.defeat && quest.prompt === encounter.defeat) {
                    return 'defeat';
                }
                
                // Also check for prompts with name prefix (e.g., "Zombies: Read a book...")
                if (encounter.befriend && quest.prompt.includes(encounterName) && quest.prompt.includes(encounter.befriend)) {
                    return 'befriend';
                }
                if (encounter.defeat && quest.prompt.includes(encounterName) && quest.prompt.includes(encounter.defeat)) {
                    return 'defeat';
                }
            }
        }
    }
    
    return null;
}

/**
 * Renders a quest card (responsive card-based layout)
 * @param {Object} quest - Quest object
 * @param {number} index - Quest index
 * @param {string} listType - Type of list ('active', 'completed', 'discarded')
 * @returns {HTMLElement} The rendered card element
 */
export function renderQuestCard(quest, index, listType = 'active') {
    const card = createElement('div', { class: 'quest-card' });
    const rewards = quest.rewards || {};
    
    // Format buffs to remove prefixes for display
    const buffs = quest.buffs && quest.buffs.length > 0 
        ? quest.buffs.map(b => {
            const decoded = decodeHtmlEntities(b.replace(/^\[(Buff|Item|Background)\] /, ''));
            return escapeHtml(decoded);
        }).join(', ') 
        : null;
    
    // Calculate receipt for tooltip
    let receipt = null;
    if (listType === 'active' && (quest.buffs && quest.buffs.length > 0)) {
        // Calculate preview receipt for active quests with buffs
        receipt = calculateActiveQuestReceipt(quest);
    } else if (listType === 'completed' && quest.receipt) {
        // Use stored receipt for completed quests
        receipt = quest.receipt;
    }
    
    // Format receipt as tooltip text
    const tooltipText = receipt ? formatReceiptTooltip(receipt, listType) : null;
    
    // Add indicator if quest will receive buffs (for active) or was modified (for completed)
    let rewardIndicator = '';
    if (listType === 'active' && quest.buffs && quest.buffs.length > 0) {
        const tooltip = tooltipText || 'Will receive buffs';
        rewardIndicator = ` <span class="reward-indicator" style="cursor: help;" title="${escapeHtml(tooltip)}">*</span>`;
    } else if (listType === 'completed' && (rewards.modifiedBy && rewards.modifiedBy.length > 0 || receipt)) {
        const tooltip = tooltipText || (rewards.modifiedBy ? `Modified by: ${rewards.modifiedBy.map(m => escapeHtml(decodeHtmlEntities(m))).join(', ')}` : 'Modified');
        rewardIndicator = ` <span class="reward-indicator" style="cursor: help;" title="${escapeHtml(tooltip)}">✓</span>`;
    }
    
    // For Extra Credit, don't show prompt
    // Decode HTML entities first (in case data was previously encoded)
    const rawPrompt = quest.type === '⭐ Extra Credit' ? null : (quest.prompt || '');
    const promptDisplay = rawPrompt ? decodeHtmlEntities(rawPrompt) : null;
    
    // Get encounter action (befriend/defeat) for dungeon encounters
    const encounterAction = getEncounterAction(quest);
    
    // Get wing name and color for restoration quests
    let wingName = null;
    let wingAccentColor = null;
    if (quest.type === '🔨 Restoration Project' && quest.restorationData?.wingId) {
        const wingId = quest.restorationData.wingId;
        const wing = data.wings?.[wingId];
        if (wing) {
            wingName = quest.restorationData.wingName || wing.name;
            wingAccentColor = wing.colorPalette?.accent;
        }
    }
    
    // Card header
    const header = createElement('div', { class: 'quest-card-header' });
    
    // Quest type and date
    const meta = createElement('div', { class: 'quest-card-meta' });
    const typeBadge = createElement('span', { class: 'quest-type-badge' });
    typeBadge.textContent = decodeHtmlEntities(quest.type || '');
    meta.appendChild(typeBadge);
    
    const date = createElement('span', { class: 'quest-date' });
    date.textContent = `${decodeHtmlEntities(quest.month || '')} ${decodeHtmlEntities(quest.year || '')}`;
    meta.appendChild(date);
    
    // Encounter action badge
    if (encounterAction) {
        const actionBadge = createElement('span', { 
            class: `encounter-action-badge ${encounterAction}` 
        });
        actionBadge.textContent = encounterAction === 'befriend' ? '🤝 Befriended' : '⚔️ Defeated';
        meta.appendChild(actionBadge);
    }
    
    // Wing badge for restoration quests
    if (wingName) {
        const wingBadge = createElement('span', { 
            class: 'restoration-wing-badge' 
        });
        // textContent automatically handles escaping, but we need to decode HTML entities first if present
        // Since wingName comes from restorationData which might have encoded entities, decode it
        wingBadge.textContent = decodeHtmlEntities(wingName);
        // Apply the wing's accent color if available
        if (wingAccentColor) {
            wingBadge.style.backgroundColor = `${wingAccentColor}30`; // Add transparency (hex 30 = ~19% opacity)
            wingBadge.style.borderColor = `${wingAccentColor}66`; // Add transparency (hex 66 = ~40% opacity)
            wingBadge.style.color = wingAccentColor;
        }
        meta.appendChild(wingBadge);
    }
    
    header.appendChild(meta);
    card.appendChild(header);
    
    // Book info section
    if (quest.book) {
        const bookSection = createElement('div', { class: 'quest-card-book' });
        const bookTitle = createElement('h3', { class: 'quest-book-title' });
        // Decode HTML entities first (in case data was previously encoded), then escape for safety
        const decodedBook = decodeHtmlEntities(quest.book);
        bookTitle.textContent = decodedBook;
        bookSection.appendChild(bookTitle);
        
        // Always show author section, even if empty (for consistent layout)
        const bookAuthor = createElement('p', { class: 'quest-book-author' });
        if (quest.bookAuthor) {
            const decodedAuthor = decodeHtmlEntities(quest.bookAuthor);
            bookAuthor.textContent = decodedAuthor;
        } else {
            bookAuthor.textContent = '';
        }
        bookSection.appendChild(bookAuthor);
        
        card.appendChild(bookSection);
    }
    
    // Prompt section
    if (promptDisplay) {
        const promptSection = createElement('div', { class: 'quest-card-prompt' });
        promptSection.textContent = promptDisplay;
        card.appendChild(promptSection);
    }

    // Quest card image (for dungeon, genre, and side quests)
    let cardImage = null;
    let cardImageAlt = null;
    
    if (quest.type === '♠ Dungeon Crawl') {
        // Try to get room data - primary from roomNumber, fallback to prompt matching
        let roomData = quest.roomNumber ? data.dungeonRooms?.[quest.roomNumber] : null;
        let encounterName = quest.encounterName;
        let isEncounter = quest.isEncounter;
        
        // Fallback for legacy quests without roomNumber
        if (!roomData && quest.prompt) {
            const found = findRoomByPrompt(quest.prompt);
            roomData = found.roomData;
            if (found.encounterName) {
                encounterName = found.encounterName;
                isEncounter = true;
            }
        }
        
        if (roomData) {
            if (isEncounter && encounterName) {
                // Encounter quest - use encounter image
                const filename = getEncounterImageFilename(encounterName);
                cardImage = toCdnImageUrlIfConfigured(`assets/images/encounters/${filename}`);
                cardImageAlt = encounterName || 'Encounter';
            } else {
                // Room challenge quest - use room card image
                cardImage = getDungeonRoomCardImage(roomData);
                cardImageAlt = roomData.name || 'Room';
            }
        }
    } else if (quest.type === '♥ Organize the Stacks') {
        // Genre quest - extract genre name from prompt (format: "Genre: description")
        if (quest.prompt) {
            const colonIndex = quest.prompt.indexOf(':');
            if (colonIndex > 0) {
                const genreName = quest.prompt.substring(0, colonIndex).trim();
                cardImage = getGenreQuestCardImage(genreName);
                cardImageAlt = genreName || 'Genre Quest';
            }
        }
    } else if (quest.type === '♣ Side Quest') {
        // Side quest - extract quest name from prompt (format: "Name: prompt")
        if (quest.prompt) {
            const colonIndex = quest.prompt.indexOf(':');
            if (colonIndex > 0) {
                const questName = quest.prompt.substring(0, colonIndex).trim();
                cardImage = getSideQuestCardImage(questName);
                cardImageAlt = questName || 'Side Quest';
            }
        }
    }
    
    // Render card image if available
    if (cardImage) {
        const imageSection = createElement('div', { class: 'quest-card-image-section' });
        const img = createElement('img', {
            src: cardImage,
            loading: 'lazy',
            decoding: 'async',
            alt: escapeHtml(cardImageAlt || 'Quest card'),
            class: 'quest-card-dungeon-image'
        });
        imageSection.appendChild(img);
        card.appendChild(imageSection);
    }
    
    // Rewards section
    const rewardsSection = createElement('div', { class: 'quest-card-rewards' });
    const rewardsTitle = createElement('h4', { class: 'quest-rewards-title' });
    rewardsTitle.textContent = 'Rewards';
    rewardsSection.appendChild(rewardsTitle);
    
    const rewardsGrid = createElement('div', { class: 'quest-rewards-grid' });
    
    if (rewards.xp > 0) {
        const xpReward = createElement('div', { class: 'reward-item xp-reward' });
        xpReward.innerHTML = `<span class="reward-label">XP</span><span class="reward-value">+${rewards.xp}${rewardIndicator}</span>`;
        rewardsGrid.appendChild(xpReward);
    }
    
    if (rewards.paperScraps > 0) {
        const psReward = createElement('div', { class: 'reward-item paper-scraps-reward' });
        psReward.innerHTML = `<span class="reward-label">📄</span><span class="reward-value">+${rewards.paperScraps}${rewardIndicator}</span>`;
        rewardsGrid.appendChild(psReward);
    }
    
    if (rewards.inkDrops > 0) {
        const idReward = createElement('div', { class: 'reward-item ink-drops-reward' });
        idReward.innerHTML = `<span class="reward-label">💧</span><span class="reward-value">+${rewards.inkDrops}${rewardIndicator}</span>`;
        rewardsGrid.appendChild(idReward);
    }
    
    if (rewards.blueprints > 0) {
        const bpReward = createElement('div', { class: 'reward-item blueprints-reward' });
        bpReward.innerHTML = `<span class="reward-label">📜</span><span class="reward-value">+${rewards.blueprints}${rewardIndicator}</span>`;
        rewardsGrid.appendChild(bpReward);
    }
    
    if (rewards.items && rewards.items.length > 0) {
        // Render each item separately with its image if available
        rewards.items.forEach(itemName => {
            const itemData = data.allItems?.[itemName];
            const itemImg = itemData?.img;
            
            const itemReward = createElement('div', { class: 'reward-item item-reward' });
            
            if (itemImg) {
                const itemImage = createElement('img', {
                    class: 'reward-item-image',
                    src: toCdnImageUrlIfConfigured(itemImg),
                    loading: 'lazy',
                    decoding: 'async',
                    alt: escapeHtml(itemName),
                    title: escapeHtml(itemName)
                });
                itemReward.appendChild(itemImage);
            }
            
            const itemNameSpan = createElement('span', { class: 'reward-item-name' });
            itemNameSpan.textContent = escapeHtml(itemName);
            itemReward.appendChild(itemNameSpan);
            
            rewardsGrid.appendChild(itemReward);
        });
    }

    // Restoration Projects: show slot unlock as a reward even if there are no currency/item rewards yet
    if (quest.type === '🔨 Restoration Project' && rewardsGrid.children.length === 0) {
        const rewardType = quest.restorationData?.rewardType;
        if (rewardType === 'passiveItemSlot' || rewardType === 'passiveFamiliarSlot') {
            const slotReward = createElement('div', { class: 'reward-item slot-reward' });
            const label = createElement('span', { class: 'reward-label' });
            // Empty box emoji stands in for a “slot” icon and matches the inline reward style
            label.textContent = '⬜';
            slotReward.appendChild(label);

            const value = createElement('span', { class: 'reward-value' });
            value.textContent = rewardType === 'passiveItemSlot' ? 'Display Slot' : 'Adoption Slot';
            slotReward.appendChild(value);

            rewardsGrid.appendChild(slotReward);
        }
    }
    
    if (rewardsGrid.children.length === 0) {
        const noRewards = createElement('div', { class: 'reward-item no-rewards' });
        noRewards.textContent = 'No rewards';
        rewardsGrid.appendChild(noRewards);
    }
    
    rewardsSection.appendChild(rewardsGrid);
    card.appendChild(rewardsSection);
    
    // Buffs/Items section
    if (buffs) {
        const buffsSection = createElement('div', { class: 'quest-card-buffs' });
        buffsSection.innerHTML = `<strong>Buffs/Items:</strong> ${buffs}`;
        card.appendChild(buffsSection);
    }
    
    // Notes section (with scrollable wrapper so long notes have a scrollbar)
    if (quest.notes) {
        const notesSection = createElement('div', { class: 'quest-card-notes' });
        // Decode HTML entities first, then escape for safety
        const decodedNotes = decodeHtmlEntities(quest.notes);
        // Use scrollable wrapper for all quests so notes have a scrollbar when long
        const notesContent = createElement('div', { class: 'quest-card-notes-scrollable' });
        notesContent.innerHTML = `<strong>Notes:</strong> ${escapeHtml(decodedNotes)}`;
        notesSection.appendChild(notesContent);
        card.appendChild(notesSection);
    }
    
    // Action buttons
    const actions = createElement('div', { class: 'quest-card-actions no-print' });
    
    // Determine list name for edit button
    const listName = listType === 'active' ? 'activeAssignments' : 
                     listType === 'completed' ? 'completedQuests' : 
                     'discardedQuests';
    
    if (listType === 'active') {
        actions.appendChild(createActionButton('Complete', 'complete-quest-btn', index));
        actions.appendChild(createActionButton('Discard', 'discard-quest-btn', index));
    }
    
    if (listType === 'discarded') {
        actions.appendChild(createActionButton('Restore', 'restore-quest-btn', index));
    }
    
    actions.appendChild(createActionButton('Delete', 'delete-btn', index, { 'data-list': listType === 'active' ? 'active' : listType }));
    actions.appendChild(createActionButton('Edit', 'edit-quest-btn', index, { 'data-list': listName }));
    
    card.appendChild(actions);
    
    return card;
}

/**
 * Creates an action button element
 * @param {string} text - Button text
 * @param {string} className - CSS class name
 * @param {number} index - Data index attribute
 * @param {Object} extraAttrs - Extra attributes to set (will be set as data attributes or regular attributes)
 * @returns {HTMLButtonElement} The button element
 */
function createActionButton(text, className, index, extraAttrs = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.index = String(index);
    button.textContent = text;
    
    // Set extra attributes
    Object.entries(extraAttrs).forEach(([key, value]) => {
        if (key.startsWith('data-')) {
            // Convert data-list to dataset.list
            const dataKey = key.replace('data-', '').replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            button.dataset[dataKey] = String(value);
        } else if (value !== null && value !== undefined) {
            button.setAttribute(key, String(value));
        }
    });
    
    return button;
}
