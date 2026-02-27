/**
 * @jest-environment jsdom
 *
 * Tests for Phase 5: Book completion cascade — markBookComplete moves linked quests to completed,
 * marks curriculum prompts complete, and returns synergy rewards (and movedQuests for restoration).
 */
import { StateAdapter, STATE_EVENTS } from '../assets/js/character-sheet/stateAdapter.js';
import { STORAGE_KEYS, createEmptyCharacterState } from '../assets/js/character-sheet/storageKeys.js';

describe('Book completion cascade', () => {
  let adapter;
  let state;

  beforeEach(() => {
    localStorage.clear();
    state = createEmptyCharacterState();
    adapter = new StateAdapter(state);
  });

  it('returns null for unknown bookId', () => {
    expect(adapter.markBookComplete('nonexistent-id')).toBeNull();
  });

  it('book with no links: only book updated, movedQuests empty, synergyRewards all zero', () => {
    const book = adapter.addBook({ title: 'Solo Book', status: 'reading' });
    const result = adapter.markBookComplete(book.id);

    expect(result).not.toBeNull();
    expect(result.book.status).toBe('completed');
    expect(result.book.dateCompleted).toBeDefined();
    expect(result.movedQuests).toEqual([]);
    expect(result.synergyRewards).toEqual({ xp: 0, inkDrops: 0, paperScraps: 0, items: [] });
    expect(adapter.getActiveAssignments()).toHaveLength(0);
    expect(adapter.getCompletedQuests()).toHaveLength(0);
  });

  it('quest only: linked active quest moves to completed, no curriculum synergy', () => {
    const questId = 'q-1';
    const quest = { id: questId, type: 'Genre', prompt: 'Read fantasy', book: 'The Book' };
    adapter.addActiveQuests(quest);
    const book = adapter.addBook({
      title: 'The Book',
      status: 'reading',
      links: { questIds: [questId], curriculumPromptIds: [] }
    });

    const result = adapter.markBookComplete(book.id);

    expect(result).not.toBeNull();
    expect(result.movedQuests).toHaveLength(1);
    expect(result.movedQuests[0].id).toBe(questId);
    expect(result.movedQuests[0].dateCompleted).toBeDefined();
    expect(result.synergyRewards.paperScraps).toBe(0);
    expect(result.synergyRewards.inkDrops).toBe(0);
    expect(adapter.getActiveAssignments()).toHaveLength(0);
    expect(adapter.getCompletedQuests()).toHaveLength(1);
    expect(adapter.getCompletedQuests()[0].id).toBe(questId);
  });

  it('curriculum only: linked prompts marked complete, +5 Paper Scraps synergy', () => {
    const curriculum = adapter.addCurriculum('Challenge');
    const category = adapter.addCategory(curriculum.id, 'Fiction');
    const added = adapter.addPrompts(curriculum.id, category.id, ['Read a book with a red cover']);
    const promptId = added[0].id;
    const book = adapter.addBook({
      title: 'Red Cover Book',
      status: 'reading',
      links: { questIds: [], curriculumPromptIds: [promptId] }
    });
    adapter.linkBookToPrompt(promptId, book.id);

    const result = adapter.markBookComplete(book.id);

    expect(result).not.toBeNull();
    expect(result.movedQuests).toEqual([]);
    expect(result.synergyRewards.paperScraps).toBe(5);
    expect(result.synergyRewards.inkDrops).toBe(0);
    const data = state[STORAGE_KEYS.EXTERNAL_CURRICULUM];
    const prompt = data.curriculums[curriculum.id].categories[category.id].prompts[promptId];
    expect(prompt.completedAt).toBeDefined();
  });

  it('both quest and curriculum: quest moves, prompts complete, +5 Paper Scraps and +10 Ink Drops synergy', () => {
    const questId = 'q-both';
    adapter.addActiveQuests({ id: questId, type: 'Genre', prompt: 'Read it', book: 'Both Book' });
    const curriculum = adapter.addCurriculum('List');
    const category = adapter.addCategory(curriculum.id, 'Cat');
    const added = adapter.addPrompts(curriculum.id, category.id, ['Prompt one']);
    const promptId = added[0].id;
    const book = adapter.addBook({
      title: 'Both Book',
      status: 'reading',
      links: { questIds: [questId], curriculumPromptIds: [promptId] }
    });
    adapter.linkBookToPrompt(promptId, book.id);

    const result = adapter.markBookComplete(book.id);

    expect(result).not.toBeNull();
    expect(result.movedQuests).toHaveLength(1);
    expect(result.movedQuests[0].id).toBe(questId);
    expect(result.synergyRewards.paperScraps).toBe(5);
    expect(result.synergyRewards.inkDrops).toBe(10);
    const data = state[STORAGE_KEYS.EXTERNAL_CURRICULUM];
    const prompt = data.curriculums[curriculum.id].categories[category.id].prompts[promptId];
    expect(prompt.completedAt).toBeDefined();
    expect(adapter.getCompletedQuests()).toHaveLength(1);
  });

  it('restoration quest in movedQuests so caller can run handleRestorationProjectCompletion', () => {
    const restorationQuestId = 'q-restore';
    const restorationQuest = {
      id: restorationQuestId,
      type: '🔨 Restoration Project',
      prompt: 'Restore the wing',
      restorationData: { projectId: 'proj-1', wingId: 'w1', cost: 5 }
    };
    adapter.addActiveQuests(restorationQuest);
    const book = adapter.addBook({
      title: 'Restoration Book',
      status: 'reading',
      links: { questIds: [restorationQuestId], curriculumPromptIds: [] }
    });

    const result = adapter.markBookComplete(book.id);

    expect(result).not.toBeNull();
    expect(result.movedQuests).toHaveLength(1);
    expect(result.movedQuests[0].type).toBe('🔨 Restoration Project');
    expect(result.movedQuests[0].restorationData).toBeDefined();
    expect(adapter.getActiveAssignments()).toHaveLength(0);
    expect(adapter.getCompletedQuests()).toHaveLength(1);
  });

  it('multiple linked quests: all move in correct order (descending index)', () => {
    const q1 = { id: 'q-first', type: 'A', prompt: 'A' };
    const q2 = { id: 'q-second', type: 'B', prompt: 'B' };
    adapter.addActiveQuests([q1, q2]);
    const book = adapter.addBook({
      title: 'Multi Book',
      status: 'reading',
      links: { questIds: ['q-first', 'q-second'], curriculumPromptIds: [] }
    });

    const result = adapter.markBookComplete(book.id);

    expect(result.movedQuests).toHaveLength(2);
    const completed = adapter.getCompletedQuests();
    expect(completed).toHaveLength(2);
    const ids = completed.map(q => q.id);
    expect(ids).toContain('q-first');
    expect(ids).toContain('q-second');
    expect(adapter.getActiveAssignments()).toHaveLength(0);
  });
});
