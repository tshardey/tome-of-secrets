// Renders rewards (items and familiars) and temp buffs on rewards.md from JSON exports
import { allItems, temporaryBuffsFromRewards } from '../character-sheet/data.js';
import { slugifyId } from '../utils/slug.js';
import { safeGetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';

/**
 * Check if an item is acquired and its status (equipped or in inventory)
 * @param {string} itemName - Name of the item to check
 * @returns {{isAcquired: boolean, isEquipped: boolean}} - Status object
 */
function getItemStatus(itemName) {
    const inventoryItems = safeGetJSON(STORAGE_KEYS.INVENTORY_ITEMS, []);
    const equippedItems = safeGetJSON(STORAGE_KEYS.EQUIPPED_ITEMS, []);
    const temporaryBuffs = safeGetJSON(STORAGE_KEYS.TEMPORARY_BUFFS, []);
    
    const equippedNames = new Set(equippedItems.map(i => i.name));
    const inventoryNames = new Set(inventoryItems.map(i => i.name));
    const temporaryBuffNames = new Set(
        Array.isArray(temporaryBuffs) ? temporaryBuffs.map(b => b?.name).filter(Boolean) : []
    );
    
    const isEquipped = equippedNames.has(itemName);
    const isAcquired = isEquipped || inventoryNames.has(itemName) || temporaryBuffNames.has(itemName);
    
    return { isAcquired, isEquipped };
}

/**
 * Get a border image path based on item status
 * @param {string} baseurl - Base URL for assets
 * @param {boolean} isEquipped - Whether the item is equipped
 * @returns {string} - Path to border image
 */
function getBorderImage(baseurl, isEquipped) {
    // border-7 for obtained (inventory), border-9 for equipped
    const borderNum = isEquipped ? 9 : 7;
    return `${baseurl}/assets/images/borders/border-${borderNum}.PNG`;
}

function createRewardCard(baseurl, name, item, status = { isAcquired: false, isEquipped: false }) {
    const card = document.createElement('div');
    card.className = 'reward-card';

    // Add acquired class and corner borders if item is acquired
    if (status.isAcquired) {
        card.classList.add('acquired');
        if (status.isEquipped) {
            card.classList.add('equipped');
        }
        
        const borderImage = getBorderImage(baseurl, status.isEquipped);
        
        // Top-left corner border
        const topLeftBorder = document.createElement('div');
        topLeftBorder.className = 'reward-corner-border reward-corner-top-left';
        const topLeftImg = document.createElement('img');
        topLeftImg.src = borderImage;
        topLeftImg.alt = '';
        topLeftImg.className = 'reward-corner-image';
        topLeftBorder.appendChild(topLeftImg);
        card.appendChild(topLeftBorder);
        
        // Bottom-right corner border
        const bottomRightBorder = document.createElement('div');
        bottomRightBorder.className = 'reward-corner-border reward-corner-bottom-right';
        const bottomRightImg = document.createElement('img');
        bottomRightImg.src = borderImage;
        bottomRightImg.alt = '';
        bottomRightImg.className = 'reward-corner-image';
        bottomRightBorder.appendChild(bottomRightImg);
        card.appendChild(bottomRightBorder);
    }

    // Inner wrapper (lets shimmer be clipped while borders can extend outside the card)
    const inner = document.createElement('div');
    inner.className = 'reward-card-inner';
    card.appendChild(inner);

    // Title (inside the card)
    const h4 = document.createElement('h4');
    const id = slugifyId(name);
    h4.id = id;
    // Make header text a self-link so external anchors feel consistent
    const selfLink = document.createElement('a');
    selfLink.href = `#${id}`;
    selfLink.textContent = name;
    h4.appendChild(selfLink);
    inner.appendChild(h4);

    // Image (inside the card)
    const imageDiv = document.createElement('div');
    imageDiv.className = 'reward-image';
    const img = document.createElement('img');
    img.src = `${baseurl}/${item.img}`;
    img.alt = name;
    imageDiv.appendChild(img);
    inner.appendChild(imageDiv);

    // Description (inside the card)
    const p = document.createElement('p');
    p.className = 'reward-description';
    p.innerHTML = `<strong>Bonus:</strong> ${item.bonus}`;
    inner.appendChild(p);
    
    return card;
}

function createTempBuffCard(baseurl, name, buff, status = { isAcquired: false, isEquipped: false }) {
    const card = document.createElement('div');
    card.className = 'reward-card';

    // Add acquired class and corner borders if item is acquired
    if (status.isAcquired) {
        card.classList.add('acquired');
        if (status.isEquipped) {
            card.classList.add('equipped');
        }
        
        const borderImage = getBorderImage(baseurl, status.isEquipped);
        
        // Top-left corner border
        const topLeftBorder = document.createElement('div');
        topLeftBorder.className = 'reward-corner-border reward-corner-top-left';
        const topLeftImg = document.createElement('img');
        topLeftImg.src = borderImage;
        topLeftImg.alt = '';
        topLeftImg.className = 'reward-corner-image';
        topLeftBorder.appendChild(topLeftImg);
        card.appendChild(topLeftBorder);
        
        // Bottom-right corner border
        const bottomRightBorder = document.createElement('div');
        bottomRightBorder.className = 'reward-corner-border reward-corner-bottom-right';
        const bottomRightImg = document.createElement('img');
        bottomRightImg.src = borderImage;
        bottomRightImg.alt = '';
        bottomRightImg.className = 'reward-corner-image';
        bottomRightBorder.appendChild(bottomRightImg);
        card.appendChild(bottomRightBorder);
    }

    // Inner wrapper (lets shimmer be clipped while borders can extend outside the card)
    const inner = document.createElement('div');
    inner.className = 'reward-card-inner';
    card.appendChild(inner);

    // Title (inside the card)
    const h4 = document.createElement('h4');
    const slug = slugifyId(name);
    h4.id = slug;
    const selfLink = document.createElement('a');
    selfLink.href = `#${slug}`;
    selfLink.textContent = name;
    h4.appendChild(selfLink);
    inner.appendChild(h4);

    // Image (inside the card)
    const imageDiv = document.createElement('div');
    imageDiv.className = 'reward-image';
    const img = document.createElement('img');
    // Use conventional image path by slug; existing assets follow this pattern
    img.src = `${baseurl}/assets/images/rewards/${slug}.png`;
    img.alt = name;
    imageDiv.appendChild(img);
    inner.appendChild(imageDiv);

    // Description (inside the card)
    const p = document.createElement('p');
    p.className = 'reward-description';
    p.innerHTML = `<strong>Bonus:</strong> ${buff.description}`;
    inner.appendChild(p);
    
    return card;
}

export function initializeRewardsPage() {
    const baseurl = (window.__BASEURL || '').replace(/\/+$/, '');
    const wearableContainer = document.getElementById('rewards-wearable');
    const nonWearableContainer = document.getElementById('rewards-non-wearable');
    const familiarContainer = document.getElementById('rewards-familiars');
    const tempBuffsContainer = document.getElementById('rewards-temp-buffs');

    if (!wearableContainer || !nonWearableContainer || !familiarContainer) return;

    // Clear containers and wrap in grid containers
    wearableContainer.innerHTML = '';
    nonWearableContainer.innerHTML = '';
    familiarContainer.innerHTML = '';
    if (tempBuffsContainer) tempBuffsContainer.innerHTML = '';

    // Create grid containers
    const wearableGrid = document.createElement('div');
    wearableGrid.className = 'rewards-cards-container';
    wearableContainer.appendChild(wearableGrid);

    const nonWearableGrid = document.createElement('div');
    nonWearableGrid.className = 'rewards-cards-container';
    nonWearableContainer.appendChild(nonWearableGrid);

    const familiarGrid = document.createElement('div');
    familiarGrid.className = 'rewards-cards-container';
    familiarContainer.appendChild(familiarGrid);

    let tempBuffsGrid = null;
    if (tempBuffsContainer) {
        tempBuffsGrid = document.createElement('div');
        tempBuffsGrid.className = 'rewards-cards-container';
        tempBuffsContainer.appendChild(tempBuffsGrid);
    }

    // Create and append cards to appropriate grid containers
    for (const [name, item] of Object.entries(allItems)) {
        const status = getItemStatus(name);
        const card = createRewardCard(baseurl, name, item, status);
        if (item.type === 'Wearable') {
            wearableGrid.appendChild(card);
        } else if (item.type === 'Non-Wearable') {
            nonWearableGrid.appendChild(card);
        } else if (item.type === 'Familiar') {
            familiarGrid.appendChild(card);
        }
    }

    // Render temporary buffs if a container exists
    if (tempBuffsGrid && temporaryBuffsFromRewards) {
        for (const [name, buff] of Object.entries(temporaryBuffsFromRewards)) {
            const status = getItemStatus(name);
            const card = createTempBuffCard(baseurl, name, buff, status);
            tempBuffsGrid.appendChild(card);
        }
    }
}


