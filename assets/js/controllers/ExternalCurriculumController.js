/**
 * ExternalCurriculumController - Handles External Curriculum tab: curriculums, categories, prompts
 *
 * - Add Curriculum: inline form
 * - For each curriculum: editable name, add category, list of categories
 * - For each category: editable name, "Add Prompts" textarea (batch, one per line), list of prompts
 * - Each prompt: text, linked book (book selector), completed badge, mark complete, delete
 * - Delete curriculum / category / prompt buttons
 */

import { BaseController } from './BaseController.js';
import { STATE_EVENTS } from '../character-sheet/stateAdapter.js';
import { escapeHtml } from '../utils/sanitize.js';
import { createBookSelector } from '../utils/bookSelector.js';
import { trimOrEmpty } from '../utils/helpers.js';

function escapeAttr(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export class ExternalCurriculumController extends BaseController {
    constructor(stateAdapter, form, dependencies) {
        super(stateAdapter, form, dependencies);
        /** @type {Array<{ destroy: function() }>} */
        this._bookSelectors = [];
    }

    initialize() {
        const form = this.form;
        if (!form) return;

        this.renderCurriculums();

        const addBtn = document.getElementById('external-curriculum-add-btn');
        const nameInput = document.getElementById('external-curriculum-name');
        if (addBtn) {
            this.addEventListener(addBtn, 'click', (e) => {
                e.preventDefault();
                this.handleAddCurriculum();
            });
        }
        if (nameInput) {
            this.addEventListener(nameInput, 'keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleAddCurriculum();
                }
            });
        }

        form.addEventListener('click', (e) => {
            const addCatBtn = e.target.closest('.curriculum-add-category-btn');
            const addPromptsBtn = e.target.closest('.curriculum-add-prompts-btn');
            const addPromptsToggleBtn = e.target.closest('.curriculum-add-prompts-toggle-btn');
            const collapseBtn = e.target.closest('.curriculum-collapse-toggle');
            const bingoAddBtn = e.target.closest('.curriculum-bingo-add-btn');
            const bingoRandomizeBtn = e.target.closest('.curriculum-bingo-randomize-btn');
            const bingoToggleBtn = e.target.closest('.curriculum-bingo-toggle-btn');
            const markCompleteBtn = e.target.closest('.curriculum-prompt-complete-btn');
            const deleteCurriculumBtn = e.target.closest('.curriculum-delete-curriculum-btn');
            const deleteCategoryBtn = e.target.closest('.curriculum-delete-category-btn');
            const deletePromptBtn = e.target.closest('.curriculum-delete-prompt-btn');
            if (collapseBtn) {
                e.preventDefault();
                const card = collapseBtn.closest('.curriculum-card');
                if (card) {
                    card.classList.toggle('collapsed');
                    const body = card.querySelector('.curriculum-card-body');
                    if (body) {
                        const isCollapsed = card.classList.contains('collapsed');
                        body.style.display = isCollapsed ? 'none' : '';
                        collapseBtn.textContent = isCollapsed ? '+' : '−';
                    }
                }
                return;
            }
            if (bingoAddBtn && bingoAddBtn.dataset.curriculumId) {
                e.preventDefault();
                this.handleBingoAddPrompts(bingoAddBtn.dataset.curriculumId);
                return;
            }
            if (bingoRandomizeBtn && bingoRandomizeBtn.dataset.curriculumId) {
                e.preventDefault();
                this.handleBingoRandomize(bingoRandomizeBtn.dataset.curriculumId);
                return;
            }
            if (bingoToggleBtn && bingoToggleBtn.dataset.curriculumId) {
                e.preventDefault();
                const currId = bingoToggleBtn.dataset.curriculumId;
                const body = this.form?.querySelector(`.curriculum-bingo-controls-body[data-curriculum-id="${escapeAttr(currId)}"]`);
                if (body) {
                    const isHidden = body.style.display === 'none';
                    body.style.display = isHidden ? '' : 'none';
                    bingoToggleBtn.textContent = isHidden ? 'Hide' : 'Show';
                }
                return;
            }
            if (addCatBtn && addCatBtn.dataset.curriculumId) {
                e.preventDefault();
                this.handleAddCategory(addCatBtn.dataset.curriculumId);
                return;
            }
            if (addPromptsToggleBtn && addPromptsToggleBtn.dataset.categoryId) {
                e.preventDefault();
                const block = addPromptsToggleBtn.closest('.curriculum-category-block');
                if (block) {
                    const row = block.querySelector('.curriculum-add-prompts-row');
                    if (row) {
                        const isHidden = row.style.display === 'none' || row.style.display === '';
                        row.style.display = isHidden ? 'block' : 'none';
                    }
                }
                return;
            }
            if (addPromptsBtn && addPromptsBtn.dataset.curriculumId && addPromptsBtn.dataset.categoryId) {
                e.preventDefault();
                this.handleAddPrompts(addPromptsBtn.dataset.curriculumId, addPromptsBtn.dataset.categoryId);
                return;
            }
            if (markCompleteBtn && markCompleteBtn.dataset.promptId) {
                e.preventDefault();
                this.handleMarkPromptComplete(markCompleteBtn.dataset.promptId);
                return;
            }
            if (deleteCurriculumBtn && deleteCurriculumBtn.dataset.curriculumId) {
                e.preventDefault();
                this.handleDeleteCurriculum(deleteCurriculumBtn.dataset.curriculumId);
                return;
            }
            if (deleteCategoryBtn && deleteCategoryBtn.dataset.curriculumId && deleteCategoryBtn.dataset.categoryId) {
                e.preventDefault();
                this.handleDeleteCategory(deleteCategoryBtn.dataset.curriculumId, deleteCategoryBtn.dataset.categoryId);
                return;
            }
            if (deletePromptBtn && deletePromptBtn.dataset.promptId) {
                e.preventDefault();
                this.handleDeletePrompt(deletePromptBtn.dataset.promptId);
                return;
            }
        });

        form.addEventListener('change', (e) => {
            const curriculumNameInput = e.target.closest('.curriculum-name-input-inline');
            const categoryNameInput = e.target.closest('.curriculum-category-name-input-inline');
            if (curriculumNameInput && curriculumNameInput.dataset.curriculumId) {
                this.handleCurriculumNameChange(curriculumNameInput.dataset.curriculumId, curriculumNameInput.value);
                return;
            }
            if (categoryNameInput && categoryNameInput.dataset.curriculumId && categoryNameInput.dataset.categoryId) {
                this.handleCategoryNameChange(
                    categoryNameInput.dataset.curriculumId,
                    categoryNameInput.dataset.categoryId,
                    categoryNameInput.value
                );
                return;
            }
        });

        form.addEventListener('blur', (e) => {
            const curriculumNameInput = e.target.closest('.curriculum-name-input-inline');
            const categoryNameInput = e.target.closest('.curriculum-category-name-input-inline');
            if (curriculumNameInput && curriculumNameInput.dataset.curriculumId) {
                this.handleCurriculumNameChange(curriculumNameInput.dataset.curriculumId, curriculumNameInput.value);
                return;
            }
            if (categoryNameInput && categoryNameInput.dataset.curriculumId && categoryNameInput.dataset.categoryId) {
                this.handleCategoryNameChange(
                    categoryNameInput.dataset.curriculumId,
                    categoryNameInput.dataset.categoryId,
                    categoryNameInput.value
                );
                return;
            }
        }, true);

        this.stateAdapter.on(STATE_EVENTS.EXTERNAL_CURRICULUM_CHANGED, () => {
            this.renderCurriculums();
        });
        this.stateAdapter.on(STATE_EVENTS.BOOKS_CHANGED, () => {
            this.renderCurriculums();
        });
    }

    handleAddCurriculum() {
        const nameInput = document.getElementById('external-curriculum-name');
        const name = trimOrEmpty(nameInput?.value);
        if (!name) return;
        const typeSelect = document.getElementById('external-curriculum-type');
        const rawType = typeSelect && typeof typeSelect.value === 'string' ? typeSelect.value : 'prompt';
        const type = rawType === 'book-club' || rawType === 'bingo' ? rawType : 'prompt';
        this.stateAdapter.addCurriculum(name, type);
        if (nameInput) nameInput.value = '';
        if (typeSelect) typeSelect.value = 'prompt';
        this.renderCurriculums();
        this.saveState();
    }

    handleCurriculumNameChange(curriculumId, value) {
        const name = typeof value === 'string' ? value.trim() : '';
        if (!name) return;
        this.stateAdapter.updateCurriculum(curriculumId, { name });
        this.saveState();
    }

    handleAddCategory(curriculumId) {
        const wrapper = this.form?.querySelector(`[data-curriculum-id="${escapeAttr(curriculumId)}"] .curriculum-add-category-row`);
        const input = wrapper?.querySelector('.curriculum-add-category-input');
        const name = trimOrEmpty(input?.value);
        if (!name) return;
        this.stateAdapter.addCategory(curriculumId, name);
        if (input) input.value = '';
        this.renderCurriculums();
        this.saveState();
    }

    handleCategoryNameChange(curriculumId, categoryId, value) {
        const name = typeof value === 'string' ? value.trim() : '';
        this.stateAdapter.updateCategory(curriculumId, categoryId, { name });
        this.saveState();
    }

    handleAddPrompts(curriculumId, categoryId) {
        const wrapper = this.form?.querySelector(
            `[data-curriculum-id="${escapeAttr(curriculumId)}"] [data-category-id="${escapeAttr(categoryId)}"] .curriculum-add-prompts-row`
        );
        const textarea = wrapper?.querySelector('.curriculum-add-prompts-textarea');
        const raw = (textarea?.value || '').trim();
        if (!raw) return;
        const promptTexts = raw.split(/\n/).map((s) => s.trim()).filter(Boolean);
        if (promptTexts.length === 0) return;
        this.stateAdapter.addPrompts(curriculumId, categoryId, promptTexts);
        if (textarea) textarea.value = '';
        this.renderCurriculums();
        this.saveState();
    }

    _ensureDefaultCategoryId(curriculumId) {
        const data = this.stateAdapter.getExternalCurriculum();
        const curriculum = data[curriculumId];
        if (!curriculum) return null;
        const categories = curriculum.categories || {};
        const ids = Object.keys(categories);
        if (ids.length > 0) return ids[0];
        const created = this.stateAdapter.addCategory(curriculumId, '');
        return created && created.id ? created.id : null;
    }

    handleAddBookClubEntry(curriculumId, bookId) {
        const categoryId = this._ensureDefaultCategoryId(curriculumId);
        if (!categoryId) return;
        const added = this.stateAdapter.addPrompts(curriculumId, categoryId, ['(book)']);
        if (added.length > 0 && bookId) {
            this.stateAdapter.linkBookToPrompt(added[0].id, bookId);
        }
        this.renderCurriculums();
        this.saveState();
    }

    handleBingoAddPrompts(curriculumId) {
        const textarea = this.form?.querySelector(`.curriculum-bingo-add-textarea[data-curriculum-id="${escapeAttr(curriculumId)}"]`);
        const raw = (textarea?.value || '').trim();
        if (!raw) return;
        const promptTexts = raw.split(/\n/).map((s) => s.trim()).filter(Boolean);
        if (promptTexts.length === 0) return;
        const categoryId = this._ensureDefaultCategoryId(curriculumId);
        if (!categoryId) return;
        const added = this.stateAdapter.addPrompts(curriculumId, categoryId, promptTexts) || [];
        if (textarea) textarea.value = '';

        if (added.length > 0) {
            const data = this.stateAdapter.getExternalCurriculum();
            const curriculum = data[curriculumId];
            const existing = Array.isArray(curriculum.boardPromptIds) ? curriculum.boardPromptIds : [];
            const next = [...existing, ...added.map((p) => p.id)];
            this.stateAdapter.updateCurriculum(curriculumId, { boardPromptIds: next });
        }
        this.renderCurriculums();
        this.saveState();
    }

    handleBingoRandomize(curriculumId) {
        const data = this.stateAdapter.getExternalCurriculum();
        const curriculum = data[curriculumId];
        if (!curriculum) return;
        const categories = curriculum.categories || {};
        const promptIds = [];
        Object.keys(categories).forEach((catId) => {
            const category = categories[catId] || {};
            const prompts = category.prompts || {};
            Object.keys(prompts).forEach((pid) => {
                promptIds.push(pid);
            });
        });
        if (promptIds.length === 0) return;
        const ids = [...promptIds];
        for (let i = ids.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = ids[i];
            ids[i] = ids[j];
            ids[j] = tmp;
        }
        const boardPromptIds = ids.slice(0, 25);
        this.stateAdapter.updateCurriculum(curriculumId, { boardPromptIds });
        this.renderCurriculums();
        this.saveState();
    }

    handleMarkPromptComplete(promptId) {
        this.stateAdapter.markPromptComplete(promptId);
        this.renderCurriculums();
        this.saveState();
    }

    handleDeleteCurriculum(curriculumId) {
        this.stateAdapter.deleteCurriculum(curriculumId);
        this.renderCurriculums();
        this.saveState();
    }

    handleDeleteCategory(curriculumId, categoryId) {
        this.stateAdapter.deleteCategory(curriculumId, categoryId);
        this.renderCurriculums();
        this.saveState();
    }

    handleDeletePrompt(promptId) {
        this.stateAdapter.deletePrompt(promptId);
        this.renderCurriculums();
        this.saveState();
    }

    renderCurriculums() {
        this._destroyBookSelectors();
        const container = document.getElementById('external-curriculum-list');
        if (!container) return;

        const curriculums = this.stateAdapter.getExternalCurriculum();
        const curriculumIds = Object.keys(curriculums);
        if (curriculumIds.length === 0) {
            container.innerHTML = '<p class="curriculum-empty">No curriculums yet. Add one above.</p>';
            return;
        }

        const html = curriculumIds.map((curriculumId) => this._renderCurriculum(curriculums[curriculumId])).join('');
        container.innerHTML = html;

        curriculumIds.forEach((curriculumId) => {
            const curriculum = curriculums[curriculumId];
            const categories = curriculum.categories || {};
            Object.keys(categories).forEach((categoryId) => {
                const category = categories[categoryId];
                const prompts = category.prompts || {};
                Object.keys(prompts).forEach((promptId) => {
                    this._attachBookSelector(container, curriculumId, categoryId, promptId);
                });
            });

            if (curriculum.type === 'book-club') {
                this._attachBookClubAddSelector(container, curriculumId);
            }
        });
    }

    _destroyBookSelectors() {
        this._bookSelectors.forEach((sel) => {
            try {
                sel.destroy();
            } catch (_) {}
        });
        this._bookSelectors = [];
    }

    _attachBookSelector(container, curriculumId, categoryId, promptId) {
        const promptEl = container.querySelector(`[data-prompt-id="${escapeAttr(promptId)}"] .curriculum-prompt-book-selector-container`);
        if (!promptEl || !this.stateAdapter) return;
        const prompt = this._getPromptForSelector(curriculumId, promptId);
        const selectedBookId = prompt && typeof prompt.bookId === 'string' ? prompt.bookId : null;
        const selector = createBookSelector(promptEl, this.stateAdapter, {
            selectedBookId,
            onSelect: (bookId) => {
                this.stateAdapter.linkBookToPrompt(promptId, bookId);
                this.saveState();
            },
            placeholder: 'Link Book',
            unlinkLabel: 'Unlink',
            appendTo: 'body'
        });
        this._bookSelectors.push(selector);
    }

    _attachBookClubAddSelector(container, curriculumId) {
        const el = container.querySelector(`.curriculum-book-club-add-selector[data-curriculum-id="${escapeAttr(curriculumId)}"]`);
        if (!el || !this.stateAdapter) return;
        const selector = createBookSelector(el, this.stateAdapter, {
            selectedBookId: null,
            onSelect: (bookId) => {
                if (bookId) {
                    this.handleAddBookClubEntry(curriculumId, bookId);
                }
            },
            placeholder: 'Link Book',
            unlinkLabel: 'Unlink',
            appendTo: 'body'
        });
        this._bookSelectors.push(selector);
    }

    _getPromptForSelector(curriculumId, promptId) {
        const curriculums = this.stateAdapter.getExternalCurriculum();
        const curriculum = curriculums[curriculumId];
        if (!curriculum) return null;
        const categories = curriculum.categories || {};
        for (const catId of Object.keys(categories)) {
            const category = categories[catId] || {};
            const prompts = category.prompts || {};
            if (prompts[promptId]) {
                return prompts[promptId];
            }
        }
        return null;
    }

    _renderCurriculum(curriculum) {
        const type = curriculum.type || 'prompt';
        if (type === 'book-club') {
            return this._renderBookClubCurriculum(curriculum);
        }
        if (type === 'bingo') {
            return this._renderBingoCurriculum(curriculum);
        }
        return this._renderPromptBasedCurriculum(curriculum);
    }

    _renderPromptBasedCurriculum(curriculum) {
        const id = curriculum.id;
        const categories = curriculum.categories || {};
        const categoryIds = Object.keys(categories);
        const type = curriculum.type || 'prompt';
        let typeLabel = 'Prompt-based';
        const deleteBtn = `<button type="button" class="rpg-btn rpg-btn-secondary curriculum-delete-curriculum-btn" data-curriculum-id="${escapeAttr(id)}" aria-label="Delete curriculum" title="Delete curriculum">Delete</button>`;
        const addCategoryRow = `
            <div class="curriculum-add-category-row form-row">
                <input type="text" class="curriculum-add-category-input" placeholder="Category name" aria-label="New category name" />
                <button type="button" class="rpg-btn rpg-btn-secondary curriculum-add-category-btn" data-curriculum-id="${escapeAttr(id)}" aria-label="Add category">Add Category</button>
            </div>`;
        const categoriesHtml = categoryIds.map((catId) => this._renderCategory(id, categories[catId])).join('');
        return `
            <div class="curriculum-card" data-curriculum-id="${escapeAttr(id)}">
                <div class="curriculum-card-header">
                    <button type="button" class="curriculum-collapse-toggle" aria-label="Toggle curriculum details" title="Toggle details">−</button>
                    <input type="text" class="curriculum-name-input-inline curriculum-name-input" data-curriculum-id="${escapeAttr(id)}" value="${escapeAttr(curriculum.name || '')}" aria-label="Curriculum name" />
                    <span class="curriculum-type-pill">${escapeHtml(typeLabel)}</span>
                    ${deleteBtn}
                </div>
                <div class="curriculum-card-body">
                    ${addCategoryRow}
                    <div class="curriculum-categories-list">${categoriesHtml}</div>
                </div>
            </div>`;
    }

    _renderBookClubCurriculum(curriculum) {
        const id = curriculum.id;
        const categories = curriculum.categories || {};
        const typeLabel = 'Book Club';
        const deleteBtn = `<button type="button" class="rpg-btn rpg-btn-secondary curriculum-delete-curriculum-btn" data-curriculum-id="${escapeAttr(id)}" aria-label="Delete curriculum" title="Delete curriculum">Delete</button>`;
        const promptEntries = [];
        Object.keys(categories).forEach((catId) => {
            const category = categories[catId] || {};
            const prompts = category.prompts || {};
            Object.keys(prompts).forEach((pid) => {
                promptEntries.push({ categoryId: catId, prompt: prompts[pid] });
            });
        });
        const rowsHtml = promptEntries
            .map(({ categoryId, prompt }) => this._renderBookClubRow(id, categoryId, prompt))
            .join('');
        return `
            <div class="curriculum-card" data-curriculum-id="${escapeAttr(id)}">
                <div class="curriculum-card-header">
                    <button type="button" class="curriculum-collapse-toggle" aria-label="Toggle curriculum details" title="Toggle details">−</button>
                    <input type="text" class="curriculum-name-input-inline curriculum-name-input" data-curriculum-id="${escapeAttr(id)}" value="${escapeAttr(curriculum.name || '')}" aria-label="Curriculum name" />
                    <span class="curriculum-type-pill">${escapeHtml(typeLabel)}</span>
                    ${deleteBtn}
                </div>
                <div class="curriculum-card-body">
                    <ul class="curriculum-prompts-list curriculum-book-club-list" aria-label="Books in this club">
                        ${rowsHtml || ''}
                    </ul>
                    <div class="curriculum-book-club-add-selector" data-curriculum-id="${escapeAttr(id)}" aria-label="Link a new book"></div>
                </div>
            </div>`;
    }

    _renderBookClubRow(curriculumId, categoryId, prompt) {
        const promptId = prompt.id;
        const completed = !!prompt.completedAt;
        const rowClass = completed
            ? 'curriculum-prompt-row curriculum-book-club-row curriculum-prompt-completed curriculum-book-club-row-completed'
            : 'curriculum-prompt-row curriculum-book-club-row';
        const completedBadge = completed
            ? '<span class="curriculum-prompt-completed-badge curriculum-book-club-completed-badge" aria-label="Book completed">✓ Completed</span>'
            : '';
        return `
            <li class="${rowClass}" data-prompt-id="${escapeAttr(promptId)}" data-category-id="${escapeAttr(categoryId)}">
                <span class="curriculum-prompt-book-selector-container" aria-label="Link book"></span>
                <span class="curriculum-prompt-actions">
                    ${completedBadge}
                    <button type="button" class="rpg-btn rpg-btn-secondary curriculum-delete-prompt-btn" data-prompt-id="${escapeAttr(promptId)}" aria-label="Delete book row" title="Delete book row">✕</button>
                </span>
            </li>`;
    }

    _renderBingoCurriculum(curriculum) {
        const id = curriculum.id;
        const typeLabel = 'Bingo Board';
        const deleteBtn = `<button type="button" class="rpg-btn rpg-btn-secondary curriculum-delete-curriculum-btn" data-curriculum-id="${escapeAttr(id)}" aria-label="Delete curriculum" title="Delete curriculum">Delete</button>`;
        const categories = curriculum.categories || {};
        const flat = [];
        Object.keys(categories).forEach((catId) => {
            const category = categories[catId] || {};
            const prompts = category.prompts || {};
            Object.keys(prompts).forEach((pid) => {
                flat.push({ categoryId: catId, prompt: prompts[pid] });
            });
        });
        const byId = {};
        flat.forEach(({ categoryId, prompt }) => {
            if (prompt && prompt.id) {
                byId[prompt.id] = { categoryId, prompt };
            }
        });
        const boardOrder = Array.isArray(curriculum.boardPromptIds) ? curriculum.boardPromptIds : [];
        const ordered = [];
        boardOrder.forEach((pid) => {
            if (byId[pid]) {
                ordered.push(byId[pid]);
            }
        });
        flat.forEach((entry) => {
            if (!ordered.find((e) => e.prompt.id === entry.prompt.id) && ordered.length < 25) {
                ordered.push(entry);
            }
        });
        const cells = [];
        for (let i = 0; i < 25; i += 1) {
            const entry = ordered[i];
            if (entry && entry.prompt && entry.prompt.id) {
                const pid = entry.prompt.id;
                const text = escapeHtml(entry.prompt.text || '');
                const completed = !!entry.prompt.completedAt;
                const completedClass = completed ? ' curriculum-bingo-cell-completed' : '';
                cells.push(`
                    <div class="curriculum-bingo-cell${completedClass}" data-prompt-id="${escapeAttr(pid)}" data-curriculum-id="${escapeAttr(id)}" data-category-id="${escapeAttr(entry.categoryId)}">
                        <div class="curriculum-bingo-text">${text || '&nbsp;'}</div>
                        <div class="curriculum-prompt-book-selector-container curriculum-bingo-book-selector" aria-label="Link book"></div>
                    </div>`);
            } else {
                cells.push(`
                    <div class="curriculum-bingo-cell curriculum-bingo-empty">
                        <div class="curriculum-bingo-text">—</div>
                    </div>`);
            }
        }

        return `
            <div class="curriculum-card" data-curriculum-id="${escapeAttr(id)}">
                <div class="curriculum-card-header">
                    <button type="button" class="curriculum-collapse-toggle" aria-label="Toggle curriculum details" title="Toggle details">−</button>
                    <input type="text" class="curriculum-name-input-inline curriculum-name-input" data-curriculum-id="${escapeAttr(id)}" value="${escapeAttr(curriculum.name || '')}" aria-label="Curriculum name" />
                    <span class="curriculum-type-pill">${escapeHtml(typeLabel)}</span>
                    ${deleteBtn}
                </div>
                <div class="curriculum-card-body">
                    <div class="curriculum-bingo-controls">
                        <div class="curriculum-bingo-controls-header">
                            <span class="curriculum-bingo-controls-title"><strong>Add prompts</strong></span>
                            <button type="button" class="panel-toggle-btn curriculum-bingo-toggle-btn" data-curriculum-id="${escapeAttr(id)}">Hide</button>
                        </div>
                        <div class="curriculum-bingo-controls-body" data-curriculum-id="${escapeAttr(id)}">
                            <label for="curriculum-bingo-add-${escapeAttr(id)}"><strong>Prompts (one per line):</strong></label>
                            <textarea id="curriculum-bingo-add-${escapeAttr(id)}" class="curriculum-bingo-add-textarea" data-curriculum-id="${escapeAttr(id)}" rows="3" placeholder="Enter prompt text, one per line" aria-label="Add prompts for bingo"></textarea>
                            <div class="curriculum-bingo-buttons">
                                <button type="button" class="rpg-btn rpg-btn-secondary curriculum-bingo-add-btn" data-curriculum-id="${escapeAttr(id)}">Add Prompts</button>
                                <button type="button" class="rpg-btn rpg-btn-secondary curriculum-bingo-randomize-btn" data-curriculum-id="${escapeAttr(id)}">Randomize Board</button>
                            </div>
                        </div>
                    </div>
                    <div class="curriculum-bingo-grid" aria-label="Bingo board">
                        ${cells.join('')}
                    </div>
                </div>
            </div>`;
    }

    _renderCategory(curriculumId, category) {
        const catId = category.id;
        const prompts = category.prompts || {};
        const promptIds = Object.keys(prompts);
        const addPromptsRow = `
            <div class="curriculum-add-prompts-row form-row" style="display: none;">
                <label for="curriculum-add-prompts-${escapeAttr(catId)}"><strong>Add prompts (one per line):</strong></label>
                <textarea id="curriculum-add-prompts-${escapeAttr(catId)}" class="curriculum-add-prompts-textarea" rows="3" placeholder="Enter prompt text, one per line" aria-label="Add prompts"></textarea>
                <button type="button" class="rpg-btn rpg-btn-secondary curriculum-add-prompts-btn" data-curriculum-id="${escapeAttr(curriculumId)}" data-category-id="${escapeAttr(catId)}" aria-label="Add prompts">Add Prompts</button>
            </div>`;
        const promptsHtml = promptIds.map((pId) => this._renderPrompt(curriculumId, catId, prompts[pId])).join('');
        const deleteCatBtn = `<button type="button" class="rpg-btn rpg-btn-secondary curriculum-delete-category-btn" data-curriculum-id="${escapeAttr(curriculumId)}" data-category-id="${escapeAttr(catId)}" aria-label="Delete category" title="Delete category">Delete</button>`;
        return `
            <div class="curriculum-category-block" data-curriculum-id="${escapeAttr(curriculumId)}" data-category-id="${escapeAttr(catId)}">
                <div class="curriculum-category-header">
                    <input type="text" class="curriculum-category-name-input-inline curriculum-category-name-input" data-curriculum-id="${escapeAttr(curriculumId)}" data-category-id="${escapeAttr(catId)}" value="${escapeAttr(category.name || '')}" aria-label="Category name" />
                    <button type="button" class="rpg-btn rpg-btn-secondary curriculum-add-prompts-toggle-btn" data-curriculum-id="${escapeAttr(curriculumId)}" data-category-id="${escapeAttr(catId)}" aria-label="Show add prompts" title="Add prompts">+</button>
                    ${deleteCatBtn}
                </div>
                ${addPromptsRow}
                <ul class="curriculum-prompts-list" aria-label="Prompts">${promptsHtml}</ul>
            </div>`;
    }

    _renderPrompt(curriculumId, categoryId, prompt) {
        const promptId = prompt.id;
        const text = escapeHtml(prompt.text || '');
        const completed = prompt.completedAt != null;
        const completedBadge = completed
            ? `<span class="curriculum-prompt-completed-badge" aria-label="Completed">✓</span>`
            : `<button type="button" class="rpg-btn rpg-btn-secondary curriculum-prompt-complete-btn" data-prompt-id="${escapeAttr(promptId)}" aria-label="Mark complete" title="Mark complete">✓</button>`;
        const promptRowClass = completed ? 'curriculum-prompt-row curriculum-prompt-completed' : 'curriculum-prompt-row';
        return `
            <li class="${promptRowClass}" data-prompt-id="${escapeAttr(promptId)}">
                <span class="curriculum-prompt-text">${text}</span>
                <span class="curriculum-prompt-book-selector-container" aria-label="Link book"></span>
                <span class="curriculum-prompt-actions">${completedBadge}
                <button type="button" class="rpg-btn rpg-btn-secondary curriculum-delete-prompt-btn" data-prompt-id="${escapeAttr(promptId)}" aria-label="Delete prompt" title="Delete prompt">✕</button></span>
            </li>`;
    }

    destroy() {
        this._destroyBookSelectors();
        super.destroy();
    }
}
