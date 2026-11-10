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
    expect(GAME_CONFIG.rewards.questBase).toBeDefined();
    expect(GAME_CONFIG.rewards.secondaryQuestBase).toBeDefined();
    expect(GAME_CONFIG.rewards.organizeTheStacks).toBeDefined();
    expect(GAME_CONFIG.rewards.defaultQuestCompletion).toBeDefined();
    expect(GAME_CONFIG.rewards.encounter).toBeDefined();
  });

  it('should pay a $15 quest base and a $10 secondary quest base', () => {
    expect(GAME_CONFIG.rewards.questBase).toEqual({ dollars: 15 });
    expect(GAME_CONFIG.rewards.secondaryQuestBase).toEqual({ dollars: 10 });
  });

  it('should keep the XP bases unchanged', () => {
    expect(GAME_CONFIG.rewards.organizeTheStacks).toEqual({ xp: 15 });
    expect(GAME_CONFIG.rewards.defaultQuestCompletion).toEqual({ xp: 25 });
    expect(GAME_CONFIG.rewards.encounter).toEqual({ monster: { xp: 30 } });
  });

  it('should carry no Ink Drop or Paper Scrap values', () => {
    const json = JSON.stringify(GAME_CONFIG);
    expect(json).not.toMatch(/inkDrops|paperScraps/);
    expect(GAME_CONFIG.backgrounds).toBeUndefined();
  });

  it('should have end of month configuration', () => {
    expect(GAME_CONFIG.endOfMonth).toBeDefined();
    expect(GAME_CONFIG.endOfMonth.bookCompletionXP).toBe(15);
  });

  it('should have UI configuration', () => {
    expect(GAME_CONFIG.ui).toBeDefined();
    expect(GAME_CONFIG.ui.tabPersistenceKey).toBe('activeCharacterTab');
    expect(GAME_CONFIG.ui.notificationDuration).toBe(5000);
  });

  it('should have atmospheric configuration', () => {
    expect(GAME_CONFIG.atmospheric).toEqual({ resource: 'dollars', baseValue: 1, sanctumBonus: 2 });
  });

  it('should configure the monthly Transmutation and Philosopher\'s Stone exchanges', () => {
    expect(GAME_CONFIG.activations.transmutation).toEqual({ blueprints: 20, dollars: 2 });
    expect(GAME_CONFIG.activations.philosophersStone).toEqual({ xpCost: 50, dollars: 5 });
  });
});
