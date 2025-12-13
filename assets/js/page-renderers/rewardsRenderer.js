// Renders rewards (items and familiars) and temp buffs on rewards.md from JSON exports
import { allItems, temporaryBuffsFromRewards } from '../character-sheet/data.js';
import { slugifyId } from '../utils/slug.js';

function createRewardCard(baseurl, name, item) {
    const card = document.createElement('div');
    card.className = 'reward-card';

    // Title (inside the card)
    const h4 = document.createElement('h4');
    const id = slugifyId(name);
    h4.id = id;
    // Make header text a self-link so external anchors feel consistent
    const selfLink = document.createElement('a');
    selfLink.href = `#${id}`;
    selfLink.textContent = name;
    h4.appendChild(selfLink);
    card.appendChild(h4);

    // Image (inside the card)
    const imageDiv = document.createElement('div');
    imageDiv.className = 'reward-image';
    const img = document.createElement('img');
    img.src = `${baseurl}/${item.img}`;
    img.alt = name;
    imageDiv.appendChild(img);
    card.appendChild(imageDiv);

    // Description (inside the card)
    const p = document.createElement('p');
    p.className = 'reward-description';
    p.innerHTML = `<strong>Bonus:</strong> ${item.bonus}`;
    card.appendChild(p);
    
    return card;
}

function createTempBuffCard(baseurl, name, buff) {
    const card = document.createElement('div');
    card.className = 'reward-card';

    // Title (inside the card)
    const h4 = document.createElement('h4');
    const slug = slugifyId(name);
    h4.id = slug;
    const selfLink = document.createElement('a');
    selfLink.href = `#${slug}`;
    selfLink.textContent = name;
    h4.appendChild(selfLink);
    card.appendChild(h4);

    // Image (inside the card)
    const imageDiv = document.createElement('div');
    imageDiv.className = 'reward-image';
    const img = document.createElement('img');
    // Use conventional image path by slug; existing assets follow this pattern
    img.src = `${baseurl}/assets/images/rewards/${slug}.png`;
    img.alt = name;
    imageDiv.appendChild(img);
    card.appendChild(imageDiv);

    // Description (inside the card)
    const p = document.createElement('p');
    p.className = 'reward-description';
    p.innerHTML = `<strong>Bonus:</strong> ${buff.description}`;
    card.appendChild(p);
    
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
        const card = createRewardCard(baseurl, name, item);
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
            const card = createTempBuffCard(baseurl, name, buff);
            tempBuffsGrid.appendChild(card);
        }
    }
}


