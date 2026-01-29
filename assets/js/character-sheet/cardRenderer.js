/**
 * CardRenderer - Pure rendering functions for card visuals
 * 
 * All rendering functions are pure - they only manipulate DOM.
 * No business logic or state mutations here.
 */

import { createElement } from '../utils/domHelpers.js';
import { escapeHtml } from '../utils/sanitize.js';

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
 * @param {Object} questCardData - Genre quest card data from view model
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
