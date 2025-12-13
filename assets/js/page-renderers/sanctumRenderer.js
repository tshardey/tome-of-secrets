import { sanctumBenefits } from '../character-sheet/data.js';
import { slugifyId } from '../utils/slug.js';

function getSanctumHeroImage(name) {
    const mapping = {
        'The Spire of Whispers': 'spire-of-whispers-hero.png',
        'The Verdant Athenaeum': 'verdant-athenaeum-hero.png',
        'The Sunken Archives': 'sunken-archives-hero.png'
    };
    return mapping[name] || null;
}

function createSanctumHero(baseurl, name) {
    const heroImage = getSanctumHeroImage(name);
    if (!heroImage) return null;

    const hero = document.createElement('div');
    hero.className = 'sanctum-hero';
    hero.style.backgroundImage = `url(${baseurl}/assets/images/${heroImage})`;

    return hero;
}

function createSanctumCard(baseurl, name, data) {
    const wrapper = document.createElement('section');
    
    // Create and add hero section
    const hero = createSanctumHero(baseurl, name);
    if (hero) {
        wrapper.appendChild(hero);
    }

    const h3 = document.createElement('h3');
    const id = slugifyId(name);
    h3.id = id;
    const selfLink = document.createElement('a');
    selfLink.href = `#${id}`;
    selfLink.textContent = name;
    h3.appendChild(selfLink);

    const pDesc = document.createElement('p');
    pDesc.textContent = data.description;

    const pBenefit = document.createElement('p');
    pBenefit.innerHTML = data.benefit;

    wrapper.appendChild(h3);
    wrapper.appendChild(pDesc);
    wrapper.appendChild(pBenefit);
    return wrapper;
}

export function initializeSanctumPage() {
    const baseurl = (window.__BASEURL || '').replace(/\/+$/, '');
    const container = document.getElementById('sanctum-list');
    if (!container) return;
    container.innerHTML = '';

    for (const [name, data] of Object.entries(sanctumBenefits)) {
        container.appendChild(createSanctumCard(baseurl, name, data));
    }
}


