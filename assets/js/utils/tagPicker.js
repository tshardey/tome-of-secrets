/**
 * The shared book tag picker (Library tab Add form, book drawer, and the selector's
 * `Tags & series` panel). Built with DOM calls, so tag labels never pass through innerHTML.
 *
 * - Type-derived tags (Audio) come from the book type, never from the picker (D3).
 * - Reader-scoped tags are marked "just you": they stay with this reader (D3).
 * - Columns follow the categories the tag data carries, so a new category always shows up.
 */
import { bookTags } from '../character-sheet/data.js';
import { isTypeDerivedTag } from './bookTagRules.js';

// Stable display order for the columns. A category not listed here is appended after
// these, in the order it appears in the tag data.
const TAG_CATEGORY_ORDER = ['genre', 'content', 'provenance', 'agency', 'form'];
const TAG_CATEGORY_LABELS = {
    genre: 'Genre',
    content: 'Content',
    provenance: 'Provenance',
    agency: 'Agency',
    form: 'Form'
};

function tagCategoryLabel(category) {
    if (TAG_CATEGORY_LABELS[category]) return TAG_CATEGORY_LABELS[category];
    return String(category)
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Ids the picker offers (every known tag except type-derived ones).
 * @returns {string[]}
 */
export function pickerTagIds() {
    return (bookTags || []).filter(tag => !isTypeDerivedTag(tag.id)).map(tag => tag.id);
}

/**
 * Render the picker into `container` (cleared first).
 * @param {HTMLElement} container
 * @param {string[]} [selectedTags]
 * @param {Set<string>} [applicableTags] - tags an equipped item or ability rewards (highlighted)
 */
export function renderTagPicker(container, selectedTags = [], applicableTags = new Set()) {
    if (!container) return;
    const selected = Array.isArray(selectedTags) ? selectedTags : [];
    const applicable = applicableTags instanceof Set ? applicableTags : new Set();
    const tags = (bookTags || []).filter(tag => !isTypeDerivedTag(tag.id));
    container.innerHTML = '';

    const categories = new Map();
    for (const tag of tags) {
        const category = tag.category || 'other';
        if (!categories.has(category)) categories.set(category, []);
        categories.get(category).push(tag);
    }

    const orderedCategories = [
        ...TAG_CATEGORY_ORDER.filter(category => categories.has(category)),
        ...Array.from(categories.keys()).filter(category => !TAG_CATEGORY_ORDER.includes(category))
    ];

    const name = (container.id || 'book') + '-tag';
    for (const category of orderedCategories) {
        const column = document.createElement('div');
        column.className = 'library-tag-column';

        const heading = document.createElement('div');
        heading.className = 'library-tag-category';
        heading.textContent = tagCategoryLabel(category);
        column.appendChild(heading);

        for (const tag of categories.get(category)) {
            const label = document.createElement('label');
            label.className = 'library-tag-option' + (applicable.has(tag.id) ? ' tag--applicable' : '');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = name;
            checkbox.value = tag.id;
            checkbox.checked = selected.includes(tag.id);
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + tag.label));
            if (tag.scope === 'reader') {
                const note = document.createElement('span');
                note.className = 'library-tag-note';
                note.textContent = 'just you';
                label.appendChild(document.createTextNode(' '));
                label.appendChild(note);
            }
            column.appendChild(label);
        }

        container.appendChild(column);
    }
}

/**
 * The checked tag ids.
 * @param {HTMLElement} container
 * @returns {string[]}
 */
export function readTagPicker(container) {
    if (!container) return [];
    const checked = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
}
