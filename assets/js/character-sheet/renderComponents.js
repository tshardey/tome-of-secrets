/**
 * Reusable Rendering Components
 * 
 * Extracted rendering functions for common UI elements.
 * All user-generated content is sanitized automatically.
 */

import { escapeHtml } from '../utils/sanitize.js';
import { createElement } from '../utils/domHelpers.js';

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
        ? quest.buffs.map(b => escapeHtml(b.replace(/^\[(Buff|Item|Background)\] /, ''))).join(', ') 
        : '-';
    
    // Add indicator if quest will receive buffs (for active) or was modified (for completed)
    let rewardIndicator = '';
    if (listType === 'active' && quest.buffs && quest.buffs.length > 0) {
        rewardIndicator = ' <span style="color: #b89f62;">*</span>';
    } else if (listType === 'completed' && rewards.modifiedBy && rewards.modifiedBy.length > 0) {
        const modifiedBy = rewards.modifiedBy.map(m => escapeHtml(m)).join(', ');
        rewardIndicator = ` <span style="color: #b89f62;" title="Modified by: ${modifiedBy}">✓</span>`;
    }
    
    // For Extra Credit, don't show prompt
    const promptDisplay = quest.type === '⭐ Extra Credit' ? '-' : escapeHtml(quest.prompt || '');
    
    // Build cells
    const cells = [
        escapeHtml(quest.month || ''),
        escapeHtml(quest.year || ''),
        escapeHtml(quest.type || ''),
        promptDisplay,
        escapeHtml(quest.book || ''),
        rewards.xp > 0 ? `+${rewards.xp}${rewardIndicator}` : '-',
        rewards.paperScraps > 0 ? `+${rewards.paperScraps}${rewardIndicator}` : '-',
        rewards.inkDrops > 0 ? `+${rewards.inkDrops}${rewardIndicator}` : '-',
        rewards.items && rewards.items.length > 0 
            ? rewards.items.map(item => escapeHtml(item)).join(', ') 
            : '-',
        buffs,
        escapeHtml(quest.notes || '')
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
    if (showEquip) {
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
        { content: escapeHtml(buff.name || ''), attrs: statusClass },
        { content: escapeHtml(buff.description || ''), attrs: statusClass },
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

