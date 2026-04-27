import fs from 'node:fs';
import path from 'node:path';
import { validateCharacterState } from '../assets/js/character-sheet/dataValidator.js';
import { migrateState } from '../assets/js/character-sheet/dataMigrator.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';

function loadJson(filename) {
    const repoRoot = path.resolve(process.cwd(), '..');
    const fullPath = path.join(repoRoot, 'assets', 'data', filename);
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

const bookTags = loadJson('bookTags.json');

describe('bookTags.json vocabulary', () => {
    test('no duplicate tag IDs', () => {
        const ids = bookTags.map(t => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    test('every tag has id, label, and category (genre or content)', () => {
        bookTags.forEach(tag => {
            expect(typeof tag.id).toBe('string');
            expect(tag.id.length).toBeGreaterThan(0);
            expect(typeof tag.label).toBe('string');
            expect(tag.label.length).toBeGreaterThan(0);
            expect(['genre', 'content']).toContain(tag.category);
        });
    });

    test('IDs use lowercase kebab-case', () => {
        bookTags.forEach(tag => {
            expect(tag.id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
        });
    });

    test('has expected counts: 9 genre tags and 14 content tags', () => {
        const genre = bookTags.filter(t => t.category === 'genre');
        const content = bookTags.filter(t => t.category === 'content');
        expect(genre).toHaveLength(10);
        expect(content).toHaveLength(15);
        expect(bookTags).toHaveLength(25);
    });
});

describe('Book validation - tags field', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('preserves valid tags array', () => {
        const state = {
            [STORAGE_KEYS.BOOKS]: {
                'book-1': {
                    id: 'book-1',
                    title: 'Test Book',
                    author: 'Author',
                    tags: ['fantasy', 'dragons']
                }
            }
        };
        const validated = validateCharacterState(state);
        expect(validated[STORAGE_KEYS.BOOKS]['book-1'].tags).toEqual(['fantasy', 'dragons']);
    });

    test('defaults to empty array when tags is missing', () => {
        const state = {
            [STORAGE_KEYS.BOOKS]: {
                'book-1': {
                    id: 'book-1',
                    title: 'Test Book',
                    author: 'Author'
                }
            }
        };
        const validated = validateCharacterState(state);
        expect(validated[STORAGE_KEYS.BOOKS]['book-1'].tags).toEqual([]);
    });

    test('filters non-string values from tags', () => {
        const state = {
            [STORAGE_KEYS.BOOKS]: {
                'book-1': {
                    id: 'book-1',
                    title: 'Test Book',
                    author: 'Author',
                    tags: ['fantasy', 42, null, 'horror', undefined, true]
                }
            }
        };
        const validated = validateCharacterState(state);
        expect(validated[STORAGE_KEYS.BOOKS]['book-1'].tags).toEqual(['fantasy', 'horror']);
    });
});

describe('Schema migration v16 - book tags', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('adds tags: [] to existing books without tags', () => {
        localStorage.setItem('tomeOfSecrets_schemaVersion', '15');
        const state = {
            [STORAGE_KEYS.BOOKS]: {
                'book-1': {
                    id: 'book-1',
                    title: 'Old Book',
                    author: 'Author'
                },
                'book-2': {
                    id: 'book-2',
                    title: 'Another Old Book',
                    author: 'Author 2'
                }
            }
        };
        const migrated = migrateState(state);
        expect(migrated[STORAGE_KEYS.BOOKS]['book-1'].tags).toEqual([]);
        expect(migrated[STORAGE_KEYS.BOOKS]['book-2'].tags).toEqual([]);
    });

    test('preserves existing tags during migration', () => {
        localStorage.setItem('tomeOfSecrets_schemaVersion', '15');
        const state = {
            [STORAGE_KEYS.BOOKS]: {
                'book-1': {
                    id: 'book-1',
                    title: 'Tagged Book',
                    author: 'Author',
                    tags: ['fantasy', 'dragons']
                }
            }
        };
        const migrated = migrateState(state);
        expect(migrated[STORAGE_KEYS.BOOKS]['book-1'].tags).toEqual(['fantasy', 'dragons']);
    });
});
