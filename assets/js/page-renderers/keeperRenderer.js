import { keeperBackgrounds, schoolBenefits } from '../character-sheet/data.js';
import { slugifyId } from '../utils/slug.js';

function createBackgroundCard(bg) {
    const wrapper = document.createElement('section');
    const h3 = document.createElement('h3');
    const id = slugifyId(bg.name);
    h3.id = id;
    const selfLink = document.createElement('a');
    selfLink.href = `#${id}`;
    selfLink.textContent = bg.name;
    h3.appendChild(selfLink);

    const pDesc = document.createElement('p');
    pDesc.textContent = bg.description;

    const pBenefit = document.createElement('p');
    pBenefit.innerHTML = `<strong>Benefit:</strong> ${bg.benefit}`;

    wrapper.appendChild(h3);
    wrapper.appendChild(pDesc);
    wrapper.appendChild(pBenefit);
    return wrapper;
}

function createSchoolCard(name, data) {
    const wrapper = document.createElement('section');
    const h3 = document.createElement('h3');
    const id = slugifyId(`School of ${name}`);
    h3.id = id;
    const selfLink = document.createElement('a');
    selfLink.href = `#${id}`;
    selfLink.textContent = `School of ${name}`;
    h3.appendChild(selfLink);

    const pDesc = document.createElement('p');
    pDesc.textContent = data.description;

    const pBenefit = document.createElement('p');
    pBenefit.innerHTML = `<strong>Benefit:</strong> ${data.benefit}`;

    wrapper.appendChild(h3);
    wrapper.appendChild(pDesc);
    wrapper.appendChild(pBenefit);
    return wrapper;
}

export function initializeKeeperPage() {
    const backgroundsContainer = document.getElementById('keeper-backgrounds');
    const schoolsContainer = document.getElementById('wizard-schools');

    if (backgroundsContainer) {
        backgroundsContainer.innerHTML = '';
        for (const [key, bg] of Object.entries(keeperBackgrounds)) {
            // Skip placeholder/empty entry if present
            if (!bg || !bg.name || key === '') continue;
            backgroundsContainer.appendChild(createBackgroundCard(bg));
        }
    }

    if (schoolsContainer) {
        schoolsContainer.innerHTML = '';
        for (const [name, data] of Object.entries(schoolBenefits)) {
            schoolsContainer.appendChild(createSchoolCard(name, data));
        }
    }
}


