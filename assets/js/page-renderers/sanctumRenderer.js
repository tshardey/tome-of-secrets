import { sanctumBenefits } from '../character-sheet/data.js';
import { slugifyId } from '../utils/slug.js';

function createSanctumCard(name, data) {
    const wrapper = document.createElement('section');
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
    const container = document.getElementById('sanctum-list');
    if (!container) return;
    container.innerHTML = '';

    for (const [name, data] of Object.entries(sanctumBenefits)) {
        container.appendChild(createSanctumCard(name, data));
    }
}


