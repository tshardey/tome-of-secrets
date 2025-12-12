/**
 * Reusable Rendering Components
 * 
 * Extracted rendering functions for common UI elements.
 * All user-generated content is sanitized automatically.
 */

import { escapeHtml, decodeHtmlEntities } from '../utils/sanitize.js';
import { createElement } from '../utils/domHelpers.js';
import * as data from './data.js';

/**
 * Renders a quest row for tables
 * @param {Object} quest - Quest object
 * @param {number} index - Quest index
 * @param {string} listType - Type of list ('active', 'completed', 'discarded')
 * @returns {HTMLTableRowElement} The rendered row element
 */
export function renderQuestRow(quest, index, listType = 'active') {
    const row = document.createElement('tr');
    const rewards = quest.rewards || {};
    
    // Format buffs to remove prefixes for display
    const buffs = quest.buffs && quest.buffs.length > 0 
        ? quest.buffs.map(b => {
            const decoded = decodeHtmlEntities(b.replace(/^\[(Buff|Item|Background)\] /, ''));
            return escapeHtml(decoded);
        }).join(', ') 
        : '-';
    
    // Add indicator if quest will receive buffs (for active) or was modified (for completed)
    let rewardIndicator = '';
    if (listType === 'active' && quest.buffs && quest.buffs.length > 0) {
        rewardIndicator = ' <span style="color: #b89f62;">*</span>';
    } else if (listType === 'completed' && rewards.modifiedBy && rewards.modifiedBy.length > 0) {
        const modifiedBy = rewards.modifiedBy.map(m => {
            const decoded = decodeHtmlEntities(m);
            return escapeHtml(decoded);
        }).join(', ');
        rewardIndicator = ` <span style="color: #b89f62;" title="Modified by: ${modifiedBy}">✓</span>`;
    }
    
    // For Extra Credit, don't show prompt
    // Decode HTML entities first, then escape for innerHTML safety
    const rawPrompt = quest.type === '⭐ Extra Credit' ? '-' : (quest.prompt || '');
    const promptDisplay = rawPrompt === '-' ? '-' : escapeHtml(decodeHtmlEntities(rawPrompt));
    
    // Build cells - decode HTML entities first, then escape for innerHTML
    const cells = [
        escapeHtml(decodeHtmlEntities(quest.month || '')),
        escapeHtml(decodeHtmlEntities(quest.year || '')),
        escapeHtml(decodeHtmlEntities(quest.type || '')),
        promptDisplay,
        escapeHtml(decodeHtmlEntities(quest.book || '')),
        rewards.xp > 0 ? `+${rewards.xp}${rewardIndicator}` : '-',
        rewards.paperScraps > 0 ? `+${rewards.paperScraps}${rewardIndicator}` : '-',
        rewards.inkDrops > 0 ? `+${rewards.inkDrops}${rewardIndicator}` : '-',
        rewards.items && rewards.items.length > 0 
            ? rewards.items.map(item => {
                const decoded = decodeHtmlEntities(item);
                return escapeHtml(decoded);
            }).join(', ') 
            : '-',
        buffs,
        escapeHtml(decodeHtmlEntities(quest.notes || ''))
    ];
    
    cells.forEach(cellContent => {
        const cell = document.createElement('td');
        cell.innerHTML = cellContent;
        row.appendChild(cell);
    });
    
    // Add action cell
    const actionCell = document.createElement('td');
    actionCell.className = 'no-print action-cell';
    
    // Determine list name for edit button
    const listName = listType === 'active' ? 'activeAssignments' : 
                     listType === 'completed' ? 'completedQuests' : 
                     'discardedQuests';
    
    if (listType === 'active') {
        actionCell.appendChild(createActionButton('Complete', 'complete-quest-btn', index));
        actionCell.appendChild(createActionButton('Discard', 'discard-quest-btn', index));
    }
    
    actionCell.appendChild(createActionButton('Delete', 'delete-btn', index, { 'data-list': listType === 'active' ? 'active' : listType }));
    actionCell.appendChild(createActionButton('Edit', 'edit-quest-btn', index, { 'data-list': listName }));
    
    row.appendChild(actionCell);
    
    return row;
}

/**
 * Renders an item card
 * @param {Object} item - Item object
 * @param {number} index - Item index
 * @param {Object} options - Options for rendering
 * @param {boolean} options.showEquip - Show equip button
 * @param {boolean} options.showUnequip - Show unequip button
 * @param {boolean} options.showDelete - Show delete button
 * @returns {HTMLElement} The rendered item card element
 */
export function renderItemCard(item, index, options = {}) {
    const { showEquip = false, showUnequip = false, showDelete = false } = options;
    
    // Quest type items cannot be equipped
    const canEquip = showEquip && item.type !== 'Quest';
    
    const card = createElement('div', { class: 'item-card' });
    
    // Item image
    if (item.img) {
        const img = createElement('img', { 
            src: escapeHtml(item.img), 
            alt: escapeHtml(item.name || '') 
        });
        card.appendChild(img);
    }
    
    // Item info
    const info = createElement('div', { class: 'item-info' });
    
    const name = createElement('h4');
    name.textContent = item.name || '';
    info.appendChild(name);
    
    if (item.type) {
        const type = createElement('p');
        type.innerHTML = `<strong>Type:</strong> ${escapeHtml(item.type)}`;
        info.appendChild(type);
    }
    
    if (item.bonus) {
        const bonus = createElement('p');
        bonus.textContent = item.bonus;
        info.appendChild(bonus);
    }
    
    // Action buttons
    if (canEquip) {
        info.appendChild(createActionButton('Equip', 'equip-btn', index));
    }
    if (showUnequip) {
        info.appendChild(createActionButton('Unequip', 'unequip-btn', index));
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
    const card = createElement('div', { class: 'item-card' });
    const info = createElement('div', { class: 'item-info' });
    
    const name = createElement('h4');
    name.textContent = abilityName;
    info.appendChild(name);
    
    if (ability.benefit) {
        const benefit = createElement('p');
        benefit.textContent = ability.benefit;
        info.appendChild(benefit);
    }
    
    if (ability.school || ability.cost !== undefined) {
        const cost = createElement('p', { class: 'ability-cost' });
        const parts = [];
        if (ability.school) parts.push(`<strong>School:</strong> ${escapeHtml(ability.school)}`);
        if (ability.cost !== undefined) parts.push(`<strong>Cost:</strong> ${ability.cost} SMP`);
        cost.innerHTML = parts.join(' | ');
        info.appendChild(cost);
    }
    
    info.appendChild(createActionButton('Forget', 'delete-ability-btn', index));
    card.appendChild(info);
    
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
    
    // Add indicator if quest will receive buffs (for active) or was modified (for completed)
    let rewardIndicator = '';
    if (listType === 'active' && quest.buffs && quest.buffs.length > 0) {
        rewardIndicator = ' <span class="reward-indicator" title="Will receive buffs">*</span>';
    } else if (listType === 'completed' && rewards.modifiedBy && rewards.modifiedBy.length > 0) {
        const modifiedBy = rewards.modifiedBy.map(m => {
            const decoded = decodeHtmlEntities(m);
            return escapeHtml(decoded);
        }).join(', ');
        rewardIndicator = ` <span class="reward-indicator" title="Modified by: ${modifiedBy}">✓</span>`;
    }
    
    // For Extra Credit, don't show prompt
    // Decode HTML entities first (in case data was previously encoded)
    const rawPrompt = quest.type === '⭐ Extra Credit' ? null : (quest.prompt || '');
    const promptDisplay = rawPrompt ? decodeHtmlEntities(rawPrompt) : null;
    
    // Get encounter action (befriend/defeat) for dungeon encounters
    const encounterAction = getEncounterAction(quest);
    
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
    
    if (rewards.items && rewards.items.length > 0) {
        // Render each item separately with its image if available
        rewards.items.forEach(itemName => {
            const itemData = data.allItems?.[itemName];
            const itemImg = itemData?.img;
            
            const itemReward = createElement('div', { class: 'reward-item item-reward' });
            
            if (itemImg) {
                const itemImage = createElement('img', {
                    class: 'reward-item-image',
                    src: itemImg,
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
    
    // Notes section
    if (quest.notes) {
        const notesSection = createElement('div', { class: 'quest-card-notes' });
        // Decode HTML entities first, then escape for safety
        const decodedNotes = decodeHtmlEntities(quest.notes);
        notesSection.innerHTML = `<strong>Notes:</strong> ${escapeHtml(decodedNotes)}`;
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

