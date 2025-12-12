// Renders rewards (items and familiars) and temp buffs on rewards.md from JSON exports
import { allItems, temporaryBuffsFromRewards } from '../character-sheet/data.js';
import { slugifyId } from '../utils/slug.js';

function createRewardCard(baseurl, name, item) {
    const container = document.createElement('div');
    container.className = 'reward-container';

    // Title (outside the tile)
    const h4 = document.createElement('h4');
    const id = slugifyId(name);
    h4.id = id;
    // Make header text a self-link so external anchors feel consistent
    const selfLink = document.createElement('a');
    selfLink.href = `#${id}`;
    selfLink.textContent = name;
    h4.appendChild(selfLink);
    container.appendChild(h4);

    // Description (outside the tile)
    const p = document.createElement('p');
    p.className = 'reward-description';
    p.innerHTML = `<strong>Bonus:</strong> ${item.bonus}`;
    container.appendChild(p);

    // Tile with image (inside reward-item)
    const wrapper = document.createElement('div');
    wrapper.className = 'reward-item';
    const imageDiv = document.createElement('div');
    imageDiv.className = 'reward-image';
    const img = document.createElement('img');
    img.src = `${baseurl}/${item.img}`;
    img.alt = name;
    imageDiv.appendChild(img);
    wrapper.appendChild(imageDiv);
    
    container.appendChild(wrapper);
    return container;
}

function createTempBuffCard(baseurl, name, buff) {
    const container = document.createElement('div');
    container.className = 'reward-container';

    // Title (outside the tile)
    const h4 = document.createElement('h4');
    const slug = slugifyId(name);
    h4.id = slug;
    const selfLink = document.createElement('a');
    selfLink.href = `#${slug}`;
    selfLink.textContent = name;
    h4.appendChild(selfLink);
    container.appendChild(h4);

    // Description (outside the tile)
    const p = document.createElement('p');
    p.className = 'reward-description';
    p.innerHTML = `<strong>Bonus:</strong> ${buff.description}`;
    container.appendChild(p);

    // Tile with image (inside reward-item)
    const wrapper = document.createElement('div');
    wrapper.className = 'reward-item';
    const imageDiv = document.createElement('div');
    imageDiv.className = 'reward-image';
    const img = document.createElement('img');
    // Use conventional image path by slug; existing assets follow this pattern
    img.src = `${baseurl}/assets/images/rewards/${slug}.png`;
    img.alt = name;
    imageDiv.appendChild(img);
    wrapper.appendChild(imageDiv);
    
    container.appendChild(wrapper);
    return container;
}

export function initializeRewardsPage() {
    const baseurl = (window.__BASEURL || '').replace(/\/+$/, '');
    const wearableContainer = document.getElementById('rewards-wearable');
    const nonWearableContainer = document.getElementById('rewards-non-wearable');
    const familiarContainer = document.getElementById('rewards-familiars');
    const tempBuffsContainer = document.getElementById('rewards-temp-buffs');

    if (!wearableContainer || !nonWearableContainer || !familiarContainer) return;

    // Clear containers
    wearableContainer.innerHTML = '';
    nonWearableContainer.innerHTML = '';
    familiarContainer.innerHTML = '';
    if (tempBuffsContainer) tempBuffsContainer.innerHTML = '';

    for (const [name, item] of Object.entries(allItems)) {
        const card = createRewardCard(baseurl, name, item);
        if (item.type === 'Wearable') {
            wearableContainer.appendChild(card);
        } else if (item.type === 'Non-Wearable') {
            nonWearableContainer.appendChild(card);
        } else if (item.type === 'Familiar') {
            familiarContainer.appendChild(card);
        }
    }

    // Render temporary buffs if a container exists
    if (tempBuffsContainer && temporaryBuffsFromRewards) {
        for (const [name, buff] of Object.entries(temporaryBuffsFromRewards)) {
            const card = createTempBuffCard(baseurl, name, buff);
            tempBuffsContainer.appendChild(card);
        }
    }
}


