/**
 * CardRenderer - Pure rendering functions for card visuals
 *
 * All rendering functions are pure - they only manipulate DOM.
 * No business logic or state mutations here.
 */

import { createElement } from '../utils/domHelpers.js';
import { escapeHtml } from '../utils/sanitize.js';

/**
 * Wrap a card element so it can be selected via click / Ctrl+click.
 * - Click: select only this card (deselect others).
 * - Ctrl+click or Cmd+click: toggle this card in the selection.
 * @param {HTMLElement} cardElement - The card DOM element to wrap
 * @param {number} index - Index of this card in the drawn list
 * @param {boolean} isSelected - Whether this card is currently selected
 * @param {(index: number, event: MouseEvent) => void} onCardClick - Called when the card is clicked (index, event)
 * @returns {HTMLElement} Wrapper div containing the card
 */
export function wrapCardSelectable(cardElement, index, isSelected, onCardClick) {
    if (!cardElement) return null;
    const wrapper = createElement('div', { class: 'card-selectable-wrapper' });
    if (isSelected) wrapper.classList.add('selected');
    wrapper.appendChild(cardElement);
    wrapper.addEventListener('click', (e) => {
        e.preventDefault();
        onCardClick(index, e);
    });
    wrapper.style.cursor = 'pointer';
    return wrapper;
}

/**
 * Render a cardback (deck stack)
 * @param {string} cardbackImage - Path to cardback image
 * @param {boolean} available - Whether the deck is available
 * @param {number} count - Number of available cards
 * @returns {HTMLElement} Cardback element
 */
export function renderCardback(cardbackImage, available, count = 0) {
    const cardback = createElement('div', { class: 'card-deck' });
    
    if (!available) {
        cardback.classList.add('empty');
    } else {
        cardback.classList.add('available');
    }
    
    const cardbackImg = createElement('img', {
        class: 'cardback-image',
        src: cardbackImage,
        alt: 'Card deck'
    });
    cardback.appendChild(cardbackImg);
    
    if (available && count > 0) {
        const countBadge = createElement('div', { class: 'deck-count-badge' });
        countBadge.textContent = count;
        cardback.appendChild(countBadge);
    }
    
    return cardback;
}

/**
 * Render a room card (2:3 aspect ratio)
 * @param {Object} roomCardData - Room card data from view model
 * @returns {HTMLElement} Room card element
 */
export function renderRoomCard(roomCardData) {
    if (!roomCardData) return null;
    
    const card = createElement('div', { class: 'card room-card' });
    
    // Card image
    if (roomCardData.cardImage) {
        const cardImg = createElement('img', {
            class: 'card-image',
            src: roomCardData.cardImage,
            alt: escapeHtml(roomCardData.name || 'Room card')
        });
        card.appendChild(cardImg);
    }
    
    // Card content overlay
    const content = createElement('div', { class: 'card-content' });
    
    // Room name
    const name = createElement('h3', { class: 'card-title' });
    name.textContent = roomCardData.name || '';
    content.appendChild(name);
    
    // Room description
    if (roomCardData.description) {
        const desc = createElement('p', { class: 'card-description' });
        desc.textContent = roomCardData.description;
        content.appendChild(desc);
    }
    
    // Challenge
    if (roomCardData.challenge) {
        const challenge = createElement('div', { class: 'card-challenge' });
        challenge.innerHTML = `<strong>Challenge:</strong> ${escapeHtml(roomCardData.challenge)}`;
        content.appendChild(challenge);
    }
    
    card.appendChild(content);
    
    return card;
}

/**
 * Render an encounter card (1:1 aspect ratio)
 * @param {Object} encounterCardData - Encounter card data from view model
 * @returns {HTMLElement} Encounter card element
 */
export function renderEncounterCard(encounterCardData) {
    if (!encounterCardData) return null;
    
    const card = createElement('div', { class: 'card encounter-card' });
    
    // Card image
    if (encounterCardData.cardImage) {
        const cardImg = createElement('img', {
            class: 'card-image',
            src: encounterCardData.cardImage,
            alt: escapeHtml(encounterCardData.name || 'Encounter card')
        });
        card.appendChild(cardImg);
    }
    
    // Card content overlay
    const content = createElement('div', { class: 'card-content' });
    
    // Encounter name
    const name = createElement('h3', { class: 'card-title' });
    name.textContent = encounterCardData.name || '';
    content.appendChild(name);
    
    // Encounter type
    if (encounterCardData.type) {
        const type = createElement('div', { class: 'card-type' });
        type.textContent = encounterCardData.type;
        content.appendChild(type);
    }
    
    // Encounter description
    if (encounterCardData.description) {
        const desc = createElement('p', { class: 'card-description' });
        desc.textContent = encounterCardData.description;
        content.appendChild(desc);
    }
    
    // Prompt (befriend or defeat)
    if (encounterCardData.befriend) {
        const prompt = createElement('div', { class: 'card-prompt' });
        prompt.innerHTML = `<strong>Befriend:</strong> ${escapeHtml(encounterCardData.befriend)}`;
        content.appendChild(prompt);
    } else if (encounterCardData.defeat) {
        const prompt = createElement('div', { class: 'card-prompt' });
        prompt.innerHTML = `<strong>Defeat:</strong> ${escapeHtml(encounterCardData.defeat)}`;
        content.appendChild(prompt);
    }
    
    card.appendChild(content);
    
    return card;
}

/**
 * Render an atmospheric buff card (2:3 aspect ratio)
 * @param {Object} buffCardData - Buff card data from view model
 * @returns {HTMLElement} Atmospheric buff card element
 */
export function renderAtmosphericBuffCard(buffCardData) {
    if (!buffCardData) return null;
    
    const card = createElement('div', { class: 'card quest-card' });
    
    // Card image
    if (buffCardData.cardImage) {
        const cardImg = createElement('img', {
            class: 'card-image',
            src: buffCardData.cardImage,
            alt: escapeHtml(buffCardData.name || 'Atmospheric buff card')
        });
        card.appendChild(cardImg);
    }
    
    // Card content overlay
    const content = createElement('div', { class: 'card-content' });
    
    // Buff name
    const name = createElement('h3', { class: 'card-title' });
    name.textContent = buffCardData.name || '';
    content.appendChild(name);
    
    // Buff description
    if (buffCardData.description) {
        const desc = createElement('p', { class: 'card-description' });
        desc.textContent = buffCardData.description;
        content.appendChild(desc);
    }
    
    card.appendChild(content);
    
    return card;
}

/**
 * Render a genre quest card (2:3 aspect ratio)
 * @param {Object} questCardData - Genre quest card data from view model (includes questData with rewards and blueprintReward)
 * @returns {HTMLElement} Genre quest card element
 */
export function renderGenreQuestCard(questCardData) {
    if (!questCardData) return null;

    const card = createElement('div', { class: 'card quest-card' });

    // Card image
    if (questCardData.cardImage) {
        const cardImg = createElement('img', {
            class: 'card-image',
            src: questCardData.cardImage,
            alt: escapeHtml(questCardData.genre || 'Genre quest card')
        });
        card.appendChild(cardImg);
    }

    // Card content overlay
    const content = createElement('div', { class: 'card-content' });

    // Genre name
    const name = createElement('h3', { class: 'card-title' });
    name.textContent = questCardData.genre || '';
    content.appendChild(name);

    // Genre description
    if (questCardData.description) {
        const desc = createElement('p', { class: 'card-description' });
        desc.textContent = questCardData.description;
        content.appendChild(desc);
    }

    // Rewards section (includes dusty blueprints from blueprintReward)
    const questData = questCardData.questData;
    const rewards = questData?.rewards || {};
    const blueprintReward = questData?.blueprintReward ?? 0;
    const hasRewards = (rewards.xp > 0) || (rewards.inkDrops > 0) || (rewards.paperScraps > 0) || (blueprintReward > 0);
    if (hasRewards) {
        const rewardsSection = createElement('div', { class: 'quest-card-rewards' });
        const rewardsTitle = createElement('h4', { class: 'quest-rewards-title' });
        rewardsTitle.textContent = 'Rewards';
        rewardsSection.appendChild(rewardsTitle);
        const rewardsGrid = createElement('div', { class: 'quest-rewards-grid' });
        if (rewards.xp > 0) {
            const xpReward = createElement('div', { class: 'reward-item xp-reward' });
            xpReward.innerHTML = `<span class="reward-label">XP</span><span class="reward-value">+${rewards.xp}</span>`;
            rewardsGrid.appendChild(xpReward);
        }
        if (rewards.inkDrops > 0) {
            const idReward = createElement('div', { class: 'reward-item ink-drops-reward' });
            idReward.innerHTML = `<span class="reward-label">💧</span><span class="reward-value">+${rewards.inkDrops}</span>`;
            rewardsGrid.appendChild(idReward);
        }
        if (rewards.paperScraps > 0) {
            const psReward = createElement('div', { class: 'reward-item paper-scraps-reward' });
            psReward.innerHTML = `<span class="reward-label">📄</span><span class="reward-value">+${rewards.paperScraps}</span>`;
            rewardsGrid.appendChild(psReward);
        }
        if (blueprintReward > 0) {
            const bpReward = createElement('div', { class: 'reward-item blueprints-reward' });
            bpReward.innerHTML = `<span class="reward-label">📜</span><span class="reward-value">+${blueprintReward}</span>`;
            rewardsGrid.appendChild(bpReward);
        }
        rewardsSection.appendChild(rewardsGrid);
        content.appendChild(rewardsSection);
    }

    card.appendChild(content);

    return card;
}

/**
 * Render a side quest card (2:3 aspect ratio)
 * @param {Object} questCardData - Side quest card data from view model
 * @returns {HTMLElement} Side quest card element
 */
export function renderSideQuestCard(questCardData) {
    if (!questCardData) return null;
    
    const card = createElement('div', { class: 'card quest-card' });
    
    // Card image
    if (questCardData.cardImage) {
        const cardImg = createElement('img', {
            class: 'card-image',
            src: questCardData.cardImage,
            alt: escapeHtml(questCardData.name || 'Side quest card')
        });
        card.appendChild(cardImg);
    }
    
    // Card content overlay
    const content = createElement('div', { class: 'card-content' });
    
    // Quest name
    const name = createElement('h3', { class: 'card-title' });
    name.textContent = questCardData.name || '';
    content.appendChild(name);
    
    // Quest description
    if (questCardData.description) {
        const desc = createElement('p', { class: 'card-description' });
        desc.textContent = questCardData.description;
        content.appendChild(desc);
    }
    
    // Quest prompt
    if (questCardData.prompt) {
        const prompt = createElement('div', { class: 'card-prompt' });
        prompt.innerHTML = `<strong>Prompt:</strong> ${escapeHtml(questCardData.prompt)}`;
        content.appendChild(prompt);
    }
    
    card.appendChild(content);
    
    return card;
}

/**
 * Render an archived dungeon quest card (card front only, clickable)
 * @param {Object} quest - Quest object
 * @param {number} index - Quest index
 * @param {string} cardImage - Path to card image
 * @param {string} title - Card title (room name or encounter name)
 * @param {string} cardType - Card type: 'room' or 'encounter' (defaults to 'room')
 * @returns {HTMLElement} Archived dungeon card element
 */
export function renderDungeonArchiveCard(quest, index, cardImage, title, cardType = 'room') {
    const card = createElement('div', { 
        class: `dungeon-archive-card ${cardType === 'encounter' ? 'encounter' : ''}`
    });
    
    // Add data attributes for click handler
    card.dataset.questIndex = index.toString();
    card.dataset.list = 'completedQuests';
    
    // Card image
    if (cardImage) {
        const cardImg = createElement('img', {
            class: 'archive-card-image',
            src: cardImage,
            alt: escapeHtml(title || 'Dungeon card')
        });
        card.appendChild(cardImg);
    }
    
    // Book name overlay (semi-transparent)
    if (quest.book) {
        const bookOverlay = createElement('div', { class: 'archive-card-book-overlay' });
        bookOverlay.textContent = quest.book;
        card.appendChild(bookOverlay);
    }
    
    // Card title overlay
    const titleOverlay = createElement('div', { class: 'archive-card-title' });
    titleOverlay.textContent = title || '';
    card.appendChild(titleOverlay);
    
    // Add hidden edit button for delegated click handler
    const editButton = createElement('button', {
        class: 'edit-quest-btn',
        type: 'button',
        style: 'display: none;'
    });
    editButton.dataset.list = 'completedQuests';
    editButton.dataset.index = index.toString();
    card.appendChild(editButton);
    
    return card;
}

/**
 * Render an archived quest card (genre quest or side quest) - card front only, clickable
 * @param {Object} quest - Quest object
 * @param {number} index - Quest index
 * @param {string} cardImage - Path to card image
 * @param {string} title - Card title (genre name or quest name)
 * @returns {HTMLElement} Archived quest card element
 */
export function renderQuestArchiveCard(quest, index, cardImage, title) {
    const card = createElement('div', { 
        class: 'dungeon-archive-card'
    });
    
    // Add data attributes for click handler
    card.dataset.questIndex = index.toString();
    card.dataset.list = 'completedQuests';
    
    // Card image
    if (cardImage) {
        const cardImg = createElement('img', {
            class: 'archive-card-image',
            src: cardImage,
            alt: escapeHtml(title || 'Quest card')
        });
        card.appendChild(cardImg);
    }
    
    // Book name overlay (semi-transparent)
    if (quest.book) {
        const bookOverlay = createElement('div', { class: 'archive-card-book-overlay' });
        bookOverlay.textContent = quest.book;
        card.appendChild(bookOverlay);
    }
    
    // Card title overlay
    const titleOverlay = createElement('div', { class: 'archive-card-title' });
    titleOverlay.textContent = title || '';
    card.appendChild(titleOverlay);
    
    // Add hidden edit button for delegated click handler
    const editButton = createElement('button', {
        class: 'edit-quest-btn',
        type: 'button',
        style: 'display: none;'
    });
    editButton.dataset.list = 'completedQuests';
    editButton.dataset.index = index.toString();
    card.appendChild(editButton);
    
    return card;
}

/**
 * Format completion date for stat block (e.g. "February 2026")
 * @param {string|null} dateCompleted - ISO date string
 * @returns {string}
 */
function formatCompletionDate(dateCompleted) {
    if (!dateCompleted || typeof dateCompleted !== 'string') return '—';
    const d = new Date(dateCompleted);
    if (isNaN(d.getTime())) return '—';
    const month = d.toLocaleString('default', { month: 'long' });
    const year = d.getFullYear();
    return `${month} ${year}`;
}

/**
 * Render a Tome Card (flip card: cover front, stat block back) for the Grimoire Gallery.
 * Used for genre and side quests. Click opens edit drawer.
 * @param {Object} quest - Quest object (may include coverUrl, pageCountRaw, pageCountEffective)
 * @param {number} index - Quest index in completedQuests
 * @param {string|null} frontImageUrl - Cover image URL (quest.coverUrl or fallback card art)
 * @param {string} cardTitle - Display title (genre or quest name)
 * @returns {HTMLElement} Tome card element with .tome-card class
 */
export function renderTomeArchiveCard(quest, index, frontImageUrl, cardTitle) {
    const card = createElement('div', { class: 'tome-card' });
    card.dataset.questIndex = index.toString();
    card.dataset.list = 'completedQuests';

    const inner = createElement('div', { class: 'tome-card-inner' });

    // Front: cover or fallback
    const front = createElement('div', { class: 'tome-card-front' });
    if (frontImageUrl) {
        const img = createElement('img', {
            class: 'tome-card-cover',
            src: frontImageUrl,
            alt: escapeHtml((quest.book || cardTitle) || 'Book cover')
        });
        front.appendChild(img);
    } else {
        const fallback = createElement('div', { class: 'tome-card-fallback' });
        fallback.textContent = quest.book || cardTitle || 'No cover';
        front.appendChild(fallback);
    }
    inner.appendChild(front);

    // Back: stat block
    const back = createElement('div', { class: 'tome-card-back' });

    const header = createElement('div', { class: 'tome-card-stat-header' });
    const titleEl = createElement('div', { class: 'tome-card-stat-title' });
    titleEl.textContent = quest.book || cardTitle || '—';
    header.appendChild(titleEl);
    const authorEl = createElement('div', { class: 'tome-card-stat-author' });
    authorEl.textContent = quest.bookAuthor || '—';
    header.appendChild(authorEl);
    const dateEl = createElement('div', { class: 'tome-card-stat-date' });
    dateEl.textContent = formatCompletionDate(quest.dateCompleted);
    header.appendChild(dateEl);
    back.appendChild(header);

    const promptEl = createElement('div', { class: 'tome-card-stat-prompt' });
    promptEl.textContent = quest.prompt || '—';
    back.appendChild(promptEl);

    const pageCount = quest.pageCountEffective ?? quest.pageCountRaw ?? null;
    if (pageCount != null) {
        const pageEl = createElement('div', { class: 'tome-card-stat-pages' });
        pageEl.textContent = `${pageCount} pp`;
        back.appendChild(pageEl);
    }

    const rewards = quest.rewards && typeof quest.rewards === 'object' ? quest.rewards : {};
    const hasRewards = (rewards.xp > 0) || (rewards.inkDrops > 0) || (rewards.paperScraps > 0);
    if (hasRewards) {
        const rewardsRow = createElement('div', { class: 'tome-card-stat-rewards' });
        const parts = [];
        if (rewards.xp > 0) parts.push(`+${rewards.xp} XP`);
        if (rewards.inkDrops > 0) parts.push(`+${rewards.inkDrops} 💧`);
        if (rewards.paperScraps > 0) parts.push(`+${rewards.paperScraps} 📄`);
        rewardsRow.textContent = parts.join(' ');
        back.appendChild(rewardsRow);
    }

    if (Array.isArray(quest.buffs) && quest.buffs.length > 0) {
        const buffsEl = createElement('div', { class: 'tome-card-stat-buffs' });
        buffsEl.textContent = quest.buffs.join(', ');
        back.appendChild(buffsEl);
    }

    if (quest.notes && typeof quest.notes === 'string' && quest.notes.trim()) {
        const notesEl = createElement('div', { class: 'tome-card-stat-notes' });
        const trimmedFull = quest.notes.trim();
        const trimmed = trimmedFull.slice(0, 100);
        notesEl.textContent = trimmed + (trimmedFull.length > 100 ? '…' : '');
        back.appendChild(notesEl);
    }

    const editButton = createElement('button', {
        class: 'edit-quest-btn',
        type: 'button',
        style: 'display: none;'
    });
    editButton.dataset.list = 'completedQuests';
    editButton.dataset.index = index.toString();
    back.appendChild(editButton);

    inner.appendChild(back);
    card.appendChild(inner);
    return card;
}