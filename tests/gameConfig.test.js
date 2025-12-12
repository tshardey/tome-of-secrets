/**
 * @jest-environment jsdom
 */
import { GAME_CONFIG } from '../assets/js/config/gameConfig.js';

describe('Game Configuration', () => {
  it('should export a frozen config object', () => {
    expect(GAME_CONFIG).toBeDefined();
    expect(Object.isFrozen(GAME_CONFIG)).toBe(true);
  });

  it('should have all required reward configurations', () => {
    expect(GAME_CONFIG.rewards).toBeDefined();
    expect(GAME_CONFIG.rewards.extraCredit).toBeDefined();
    expect(GAME_CONFIG.rewards.organizeTheStacks).toBeDefined();
    expect(GAME_CONFIG.rewards.defaultQuestCompletion).toBeDefined();
    expect(GAME_CONFIG.rewards.defaultFallback).toBeDefined();
    expect(GAME_CONFIG.rewards.encounter).toBeDefined();
  });

  it('should have correct extra credit reward value', () => {
    expect(GAME_CONFIG.rewards.extraCredit.paperScraps).toBe(10);
  });

  it('should have correct organize the stacks reward values', () => {
    expect(GAME_CONFIG.rewards.organizeTheStacks.xp).toBe(15);
    expect(GAME_CONFIG.rewards.organizeTheStacks.inkDrops).toBe(10);
  });

  it('should have correct default quest completion values', () => {
    expect(GAME_CONFIG.rewards.defaultQuestCompletion.xp).toBe(25);
    expect(GAME_CONFIG.rewards.defaultQuestCompletion.inkDrops).toBe(10);
    expect(GAME_CONFIG.rewards.defaultQuestCompletion.paperScraps).toBe(0);
  });

  it('should have correct encounter reward values', () => {
    expect(GAME_CONFIG.rewards.encounter.monster.xp).toBe(30);
    expect(GAME_CONFIG.rewards.encounter.friendlyCreature.inkDrops).toBe(10);
    expect(GAME_CONFIG.rewards.encounter.familiar.paperScraps).toBe(5);
  });

  it('should have end of month configuration', () => {
    expect(GAME_CONFIG.endOfMonth).toBeDefined();
    expect(GAME_CONFIG.endOfMonth.bookCompletionXP).toBe(15);
    expect(GAME_CONFIG.endOfMonth.journalEntry).toBeDefined();
    expect(GAME_CONFIG.endOfMonth.journalEntry.basePaperScraps).toBe(5);
    expect(GAME_CONFIG.endOfMonth.journalEntry.scribeBonus).toBe(3);
  });

  it('should have background bonus configuration', () => {
    expect(GAME_CONFIG.backgrounds).toBeDefined();
    expect(GAME_CONFIG.backgrounds.biblioslinker).toBeDefined();
    expect(GAME_CONFIG.backgrounds.biblioslinker.dungeonCrawlPaperScraps).toBe(10);
    expect(GAME_CONFIG.backgrounds.backgroundBonus).toBeDefined();
    expect(GAME_CONFIG.backgrounds.backgroundBonus.inkDrops).toBe(15);
  });

  it('should have UI configuration', () => {
    expect(GAME_CONFIG.ui).toBeDefined();
    expect(GAME_CONFIG.ui.tabPersistenceKey).toBe('activeCharacterTab');
    expect(GAME_CONFIG.ui.notificationDuration).toBe(5000);
  });

  it('should have atmospheric configuration', () => {
    expect(GAME_CONFIG.atmospheric).toBeDefined();
    expect(GAME_CONFIG.atmospheric.baseValue).toBe(1);
    expect(GAME_CONFIG.atmospheric.sanctumBonus).toBe(2);
  });
});

