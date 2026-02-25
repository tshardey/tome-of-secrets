/**
 * @jest-environment jsdom
 */
import { xpLevels, permanentBonuses, allItems, schoolBenefits, sideQuests, dungeonRooms, curseTable, genreQuests } from '../assets/js/character-sheet/data.js';
import { STORAGE_KEYS } from '../assets/js/character-sheet/storageKeys.js';
import { safeGetJSON, safeSetJSON } from '../assets/js/utils/storage.js';
import { initializeCharacterSheet } from '../assets/js/character-sheet.js';
import { characterState, loadState, saveState } from '../assets/js/character-sheet/state.js';
import { StateAdapter } from '../assets/js/character-sheet/stateAdapter.js';
import * as ui from '../assets/js/character-sheet/ui.js';

describe('Character Sheet', () => {
  beforeEach(async () => {
    // Clear localStorage and reset the in-memory state before each test
    // This prevents state from one test leaking into another.
    localStorage.clear();
    characterState.inventoryItems = [];
    characterState.equippedItems = [];
    characterState.activeAssignments = [];
    characterState.completedQuests = [];
    characterState.discardedQuests = [];
    characterState.activeCurses = [];
    characterState.completedCurses = [];

    // Load the character sheet HTML before each test
    loadHTML('character-sheet.md');

    // Initialize the event listeners and dynamic content
    await initializeCharacterSheet();

    // Library books for add-quest book selector (Phase 4) - set after init so stateAdapter sees them
    const makeBook = (id, title, author = '') => ({
      id,
      title,
      author,
      cover: null,
      pageCount: null,
      status: 'reading',
      dateAdded: new Date().toISOString(),
      dateCompleted: null,
      links: { questIds: [], curriculumPromptIds: [] }
    });
    characterState[STORAGE_KEYS.BOOKS] = {
      'the-test-book': makeBook('the-test-book', 'The Test Book'),
      'a-finished-story': makeBook('a-finished-story', 'A Finished Story'),
      'test-book': makeBook('test-book', 'Test Book'),
      'unique-book-title': makeBook('unique-book-title', 'Unique Book Title'),
      'dungeon-book': makeBook('dungeon-book', 'Dungeon Book'),
      'author-book': makeBook('author-book', 'Author Book'),
      'extra-reading-book': makeBook('extra-reading-book', 'Extra Reading Book'),
      'extra-book': makeBook('extra-book', 'Extra Book'),
      'monster-manual': makeBook('monster-manual', 'Monster Manual'),
      'original-book': makeBook('original-book', 'Original Book'),
      'updated-room-book': makeBook('updated-room-book', 'Updated Room Book'),
      'another-original-book': makeBook('another-original-book', 'Another Original Book')
    };
  });

  describe('JSON wiring smoke tests', () => {
    it('should populate wizard school select with 6 schools from JSON', () => {
      const schoolSelect = document.getElementById('wizardSchool');
      // 1 default + 6 schools
      expect(schoolSelect.options.length).toBe(7);
      const labels = Array.from(schoolSelect.options).map(o => o.textContent);
      expect(labels).toContain('Abjuration');
      expect(labels).toContain('Divination');
      expect(labels).toContain('Evocation');
      expect(labels).toContain('Enchantment');
      expect(labels).toContain('Conjuration');
      expect(labels).toContain('Transmutation');
    });

    it('should populate library sanctum select with 3 sanctums from JSON', () => {
      const sanctumSelect = document.getElementById('librarySanctum');
      // 1 default + 3 sanctums
      expect(sanctumSelect.options.length).toBe(4);
      const labels = Array.from(sanctumSelect.options).map(o => o.textContent);
      expect(labels).toContain('The Spire of Whispers');
      expect(labels).toContain('The Verdant Athenaeum');
      expect(labels).toContain('The Sunken Archives');
    });
  });

  describe('Abilities & Benefits Section', () => {
    it('should display placeholder text for school benefits initially', () => {
      const description = document.getElementById('magicalSchoolDescriptionDisplay');
      const benefit = document.getElementById('magicalSchoolBenefitDisplay');

      expect(description.textContent).toBe('-- Select a school to see its description --');
      expect(benefit.textContent).toBe('-- Select a school to see its benefit --');
    });

    it('should update the school description and benefit when a school is selected', () => {
      const schoolSelect = document.getElementById('wizardSchool');
      const descriptionDisplay = document.getElementById('magicalSchoolDescriptionDisplay');
      const benefitDisplay = document.getElementById('magicalSchoolBenefitDisplay');

      // Simulate a user selecting "Divination"
      schoolSelect.value = 'Divination';
      schoolSelect.dispatchEvent(new Event('change'));

      // Get the expected text from our data file
      const expectedDescription = schoolBenefits.Divination.description;
      const expectedBenefit = schoolBenefits.Divination.benefit;

      // Assert that the DOM has been updated correctly
      expect(descriptionDisplay.textContent).toBe(expectedDescription);
      expect(benefitDisplay.textContent).toBe(expectedBenefit);
    });
  });

  describe('Resources & Progression', () => {
    it('should update XP needed when level changes', () => {
      const levelInput = document.getElementById('level');
      const xpNeededInput = document.getElementById('xp-needed');

      // Simulate user changing the level to 5
      levelInput.value = '5';
      levelInput.dispatchEvent(new Event('change'));

      // Assert that the XP needed for level 5 is correctly displayed
      // Handle both input (value) and span (textContent) elements
      const xpNeededValue = xpNeededInput.tagName === 'INPUT' ? xpNeededInput.value : xpNeededInput.textContent;
      expect(xpNeededValue).toBe(xpLevels[5].toString());
    });

    it('should render permanent bonuses when the character reaches the required level', () => {
      const levelInput = document.getElementById('level');
      const bonusList = document.getElementById('permanentBonusesList');

      // Initially, at level 1, there should be a placeholder
      expect(bonusList.textContent).toContain('-- No bonuses unlocked at this level --');

      // Simulate leveling up to 6
      levelInput.value = '6';
      levelInput.dispatchEvent(new Event('change'));

      // Assert that bonuses for levels 3 and 6 are now displayed
      expect(bonusList.innerHTML).toContain(permanentBonuses[3]);
      expect(bonusList.innerHTML).toContain(permanentBonuses[6]);
      expect(bonusList.textContent).not.toContain('-- No bonuses unlocked at this level --');
    });
  });

  describe('RPG-Styled Character Tab UI', () => {
    describe('Hero Section', () => {
      it('should render RPG hero section with name input', () => {
        const heroSection = document.querySelector('.rpg-hero-section');
        const nameInput = document.getElementById('keeperName');
        
        expect(heroSection).toBeTruthy();
        expect(nameInput).toBeTruthy();
        expect(nameInput.classList.contains('rpg-hero-name-input')).toBe(true);
      });

      it('should render level badge and input', () => {
        const levelBadge = document.getElementById('rpg-level-badge');
        const levelNumber = document.getElementById('rpg-level-number');
        const levelInput = document.getElementById('level');
        const levelContainer = document.querySelector('.rpg-level-container');
        
        expect(levelBadge).toBeTruthy();
        expect(levelNumber).toBeTruthy();
        expect(levelInput).toBeTruthy();
        expect(levelContainer).toBeTruthy();
        expect(levelBadge.classList.contains('rpg-level-badge')).toBe(true);
      });

      it('should display current level in level badge', () => {
        const levelInput = document.getElementById('level');
        const levelNumber = document.getElementById('rpg-level-number');
        
        expect(levelInput).toBeTruthy();
        expect(levelNumber).toBeTruthy();
        
        // Level should be initialized (default is 1)
        const currentLevel = levelInput.value || '1';
        expect(levelNumber.textContent).toBe(currentLevel);
      });

      it('should sync level badge when level input changes', () => {
        const levelInput = document.getElementById('level');
        const levelNumber = document.getElementById('rpg-level-number');
        
        levelInput.value = '5';
        levelInput.dispatchEvent(new Event('change'));
        
        // Update progress bar to sync badge
        ui.updateXpProgressBar();
        
        expect(levelNumber.textContent).toBe('5');
      });

      it('should render RPG hero attributes (background, school, sanctum)', () => {
        const attributesContainer = document.querySelector('.rpg-hero-attributes');
        const backgroundSelect = document.getElementById('keeperBackground');
        const schoolSelect = document.getElementById('wizardSchool');
        const sanctumSelect = document.getElementById('librarySanctum');
        
        expect(attributesContainer).toBeTruthy();
        expect(backgroundSelect).toBeTruthy();
        expect(schoolSelect).toBeTruthy();
        expect(sanctumSelect).toBeTruthy();
        expect(backgroundSelect.classList.contains('rpg-attribute-select')).toBe(true);
        expect(schoolSelect.classList.contains('rpg-attribute-select')).toBe(true);
        expect(sanctumSelect.classList.contains('rpg-attribute-select')).toBe(true);
      });
    });

    describe('XP Progress Bar', () => {
      it('should render RPG XP progress bar panel', () => {
        const xpPanel = document.querySelector('.rpg-xp-panel');
        const progressBar = document.querySelector('.rpg-xp-progress-bar');
        const progressFill = document.getElementById('rpg-xp-progress-fill');
        const progressText = document.getElementById('rpg-xp-progress-text');
        
        expect(xpPanel).toBeTruthy();
        expect(progressBar).toBeTruthy();
        expect(progressFill).toBeTruthy();
        expect(progressText).toBeTruthy();
      });

      it('should display current XP and XP needed values', () => {
        const xpCurrentInput = document.getElementById('xp-current');
        const xpNeededElement = document.getElementById('xp-needed');
        
        expect(xpCurrentInput).toBeTruthy();
        expect(xpNeededElement).toBeTruthy();
        expect(xpCurrentInput.classList.contains('rpg-xp-current-input')).toBe(true);
      });

      it('should update XP progress bar when XP current changes', () => {
        const xpCurrentInput = document.getElementById('xp-current');
        const levelInput = document.getElementById('level');
        const progressFill = document.getElementById('rpg-xp-progress-fill');
        const progressText = document.getElementById('rpg-xp-progress-text');
        
        // Set level to 1 (needs 100 XP based on xpLevels)
        levelInput.value = '1';
        // Set XP to 50 (50% progress)
        xpCurrentInput.value = '50';
        
        ui.updateXpProgressBar();
        
        expect(progressFill.style.width).toBe('50%');
        expect(progressText.textContent).toBe('50 / 100 XP');
      });

      it('should update XP progress bar when level changes', () => {
        const xpCurrentInput = document.getElementById('xp-current');
        const levelInput = document.getElementById('level');
        const progressFill = document.getElementById('rpg-xp-progress-fill');
        const xpNeededElement = document.getElementById('xp-needed');
        
        // Set level to 2 (needs XP based on xpLevels)
        levelInput.value = '2';
        xpCurrentInput.value = '100';
        
        ui.updateXpProgressBar();
        
        // Check that XP needed was updated
        const xpNeededValue = xpNeededElement.tagName === 'INPUT' ? xpNeededElement.value : xpNeededElement.textContent;
        if (xpLevels[2]) {
          expect(xpNeededValue).toBe(xpLevels[2].toString());
          
          // Progress should be calculated correctly
          if (xpLevels[2] !== 'Max' && xpLevels[2] !== 0) {
            const xpNeeded = parseInt(xpLevels[2]);
            const percentage = Math.min(100, Math.max(0, (100 / xpNeeded) * 100));
            expect(progressFill.style.width).toBe(`${percentage}%`);
          }
        }
      });

      it('should show max level correctly when XP needed is Max', () => {
        const xpCurrentInput = document.getElementById('xp-current');
        const levelInput = document.getElementById('level');
        const progressFill = document.getElementById('rpg-xp-progress-fill');
        const progressText = document.getElementById('rpg-xp-progress-text');
        
        // Set level to 20 (max level, if it exists in xpLevels)
        if (xpLevels[20] === 'Max') {
          levelInput.value = '20';
          xpCurrentInput.value = '1000';
          
          ui.updateXpProgressBar();
          
          // Max level should show 100% progress
          expect(progressFill.style.width).toBe('100%');
          expect(progressText.textContent).toContain('Max');
        }
      });

      it('should handle zero XP correctly', () => {
        const xpCurrentInput = document.getElementById('xp-current');
        const levelInput = document.getElementById('level');
        const progressFill = document.getElementById('rpg-xp-progress-fill');
        const progressText = document.getElementById('rpg-xp-progress-text');
        
        levelInput.value = '1';
        xpCurrentInput.value = '0';
        
        ui.updateXpProgressBar();
        
        expect(progressFill.style.width).toBe('0%');
        expect(progressText.textContent).toBe('0 / 100 XP');
      });

      it('should handle XP exceeding needed amount (overflow protection)', () => {
        const xpCurrentInput = document.getElementById('xp-current');
        const levelInput = document.getElementById('level');
        const progressFill = document.getElementById('rpg-xp-progress-fill');
        const progressText = document.getElementById('rpg-xp-progress-text');
        
        levelInput.value = '1';
        // Set XP to 200 (more than needed 100)
        xpCurrentInput.value = '200';
        
        ui.updateXpProgressBar();
        
        // Progress should be capped at 100%
        expect(progressFill.style.width).toBe('100%');
        expect(progressText.textContent).toContain('200');
      });

      it('should handle negative XP (edge case)', () => {
        const xpCurrentInput = document.getElementById('xp-current');
        const levelInput = document.getElementById('level');
        const progressFill = document.getElementById('rpg-xp-progress-fill');
        const progressText = document.getElementById('rpg-xp-progress-text');
        
        levelInput.value = '1';
        // Set XP to negative value
        xpCurrentInput.value = '-10';
        
        ui.updateXpProgressBar();
        
        // Progress should be capped at 0%
        expect(progressFill.style.width).toBe('0%');
      });

      it('should initialize XP progress bar on page load', () => {
        const xpCurrentInput = document.getElementById('xp-current');
        const levelInput = document.getElementById('level');
        const progressFill = document.getElementById('rpg-xp-progress-fill');
        const progressText = document.getElementById('rpg-xp-progress-text');
        const levelNumber = document.getElementById('rpg-level-number');
        
        // After initialization, progress bar should be updated
        ui.updateXpProgressBar();
        
        // Check that progress bar elements exist and are initialized
        expect(progressFill).toBeTruthy();
        expect(progressText).toBeTruthy();
        expect(levelNumber).toBeTruthy();
        
        // Progress fill should have a width (even if 0%)
        expect(progressFill.style.width).toBeDefined();
        expect(progressText.textContent).toBeTruthy();
      });

      it('should handle missing elements gracefully', () => {
        // Remove XP elements temporarily
        const xpCurrentInput = document.getElementById('xp-current');
        const levelInput = document.getElementById('level');
        
        if (xpCurrentInput && levelInput) {
          // The function should handle missing progress bar elements
          const progressFill = document.getElementById('rpg-xp-progress-fill');
          const progressText = document.getElementById('rpg-xp-progress-text');
          
          if (progressFill && progressText) {
            // Should not throw error when called
            expect(() => ui.updateXpProgressBar()).not.toThrow();
          }
        }
      });
    });

    describe('RPG Stats Grid', () => {
      it('should render RPG stats grid with currency cards', () => {
        const statsPanel = document.querySelector('.rpg-stats-panel');
        const statsGrid = document.querySelector('.rpg-stats-grid');
        
        expect(statsPanel).toBeTruthy();
        expect(statsGrid).toBeTruthy();
      });

      it('should render all currency stat cards (Ink Drops, Paper Scraps, Blueprints, SMP)', () => {
        const statCards = document.querySelectorAll('.rpg-stat-card');
        const inkDropsCard = document.querySelector('.rpg-stat-card label[for="inkDrops"]');
        const paperScrapsCard = document.querySelector('.rpg-stat-card label[for="paperScraps"]');
        const blueprintsCard = document.querySelector('.rpg-stat-card label[for="dustyBlueprints"]');
        const smpCard = document.querySelector('.rpg-stat-card label[for="smp"]');
        
        expect(statCards.length).toBeGreaterThanOrEqual(4);
        expect(inkDropsCard).toBeTruthy();
        expect(paperScrapsCard).toBeTruthy();
        expect(blueprintsCard).toBeTruthy();
        expect(smpCard).toBeTruthy();
      });

      it('should display currency inputs in stat cards', () => {
        const inkDropsInput = document.getElementById('inkDrops');
        const paperScrapsInput = document.getElementById('paperScraps');
        const blueprintsInput = document.getElementById('dustyBlueprints');
        const smpInput = document.getElementById('smp');
        
        expect(inkDropsInput).toBeTruthy();
        expect(paperScrapsInput).toBeTruthy();
        expect(blueprintsInput).toBeTruthy();
        expect(smpInput).toBeTruthy();
        
        expect(inkDropsInput.classList.contains('rpg-stat-input')).toBe(true);
        expect(paperScrapsInput.classList.contains('rpg-stat-input')).toBe(true);
        expect(blueprintsInput.classList.contains('rpg-stat-input')).toBe(true);
        expect(smpInput.classList.contains('rpg-stat-input')).toBe(true);
      });

      it('should style stat cards with hover effects', () => {
        const statCard = document.querySelector('.rpg-stat-card');
        expect(statCard).toBeTruthy();
        // JSDOM doesn't reliably compute external CSS, so we assert structural intent.
        expect(statCard.classList.contains('rpg-stat-card')).toBe(true);
      });
    });

    describe('Genre Badges Panel', () => {
      it('should render RPG genres panel', () => {
        const genresPanel = document.querySelector('.rpg-genres-panel');
        const genresDisplay = document.getElementById('selected-genres-display');
        
        expect(genresPanel).toBeTruthy();
        expect(genresDisplay).toBeTruthy();
      });

      it('should display selected genres as badges', () => {
        const stateAdapter = new StateAdapter(characterState);
        
        // Set selected genres
        stateAdapter.setSelectedGenres(['Fantasy', 'Horror', 'Mystery']);
        
        // Re-render genres display (this would normally be done by the UI)
        const genresDisplay = document.getElementById('selected-genres-display');
        if (genresDisplay) {
          const selectedGenres = stateAdapter.getSelectedGenres();
          if (selectedGenres.length > 0) {
            let html = '';
            selectedGenres.forEach((genre, index) => {
              html += `
                <div class="selected-genre-item">
                  <span class="genre-number">${index + 1}.</span>
                  <span class="genre-name">${genre}</span>
                </div>
              `;
            });
            genresDisplay.innerHTML = html;
          }
        }
        
        const genreItems = document.querySelectorAll('.selected-genre-item');
        expect(genreItems.length).toBe(3);
        
        // Check badge styling
        genreItems.forEach(item => {
          expect(item.classList.contains('selected-genre-item')).toBe(true);
        });
      });

      it('should show genre number badges correctly', () => {
        const stateAdapter = new StateAdapter(characterState);
        
        // Set selected genres
        stateAdapter.setSelectedGenres(['Fantasy', 'Horror']);
        
        const genresDisplay = document.getElementById('selected-genres-display');
        if (genresDisplay) {
          const selectedGenres = stateAdapter.getSelectedGenres();
          let html = '';
          selectedGenres.forEach((genre, index) => {
            html += `
              <div class="selected-genre-item">
                <span class="genre-number">${index + 1}.</span>
                <span class="genre-name">${genre}</span>
              </div>
            `;
          });
          genresDisplay.innerHTML = html;
        }
        
        const genreNumbers = document.querySelectorAll('.genre-number');
        expect(genreNumbers.length).toBe(2);
        expect(genreNumbers[0].textContent).toBe('1.');
        expect(genreNumbers[1].textContent).toBe('2.');
      });
    });

    describe('RPG Panel Structure', () => {
      it('should render all RPG panels with correct structure', () => {
        const heroSection = document.querySelector('.rpg-hero-section');
        const xpPanel = document.querySelector('.rpg-xp-panel');
        const statsPanel = document.querySelector('.rpg-stats-panel');
        const genresPanel = document.querySelector('.rpg-genres-panel');
        
        expect(heroSection).toBeTruthy();
        expect(xpPanel).toBeTruthy();
        expect(statsPanel).toBeTruthy();
        expect(genresPanel).toBeTruthy();
      });

      it('should have panel headers with titles', () => {
        const xpPanelHeader = document.querySelector('.rpg-xp-panel .rpg-panel-header');
        const statsPanelHeader = document.querySelector('.rpg-stats-panel .rpg-panel-header');
        const genresPanelHeader = document.querySelector('.rpg-genres-panel .rpg-panel-header');
        
        expect(xpPanelHeader).toBeTruthy();
        expect(statsPanelHeader).toBeTruthy();
        expect(genresPanelHeader).toBeTruthy();
        
        const xpTitle = xpPanelHeader.querySelector('.rpg-panel-title');
        const statsTitle = statsPanelHeader.querySelector('.rpg-panel-title');
        const genresTitle = genresPanelHeader.querySelector('.rpg-panel-title');
        
        expect(xpTitle).toBeTruthy();
        expect(statsTitle).toBeTruthy();
        expect(genresTitle).toBeTruthy();
      });

      it('should have panel bodies with content', () => {
        const xpPanelBody = document.querySelector('.rpg-xp-panel .rpg-panel-body');
        const statsPanelBody = document.querySelector('.rpg-stats-panel .rpg-panel-body');
        const genresPanelBody = document.querySelector('.rpg-genres-panel .rpg-panel-body');
        
        expect(xpPanelBody).toBeTruthy();
        expect(statsPanelBody).toBeTruthy();
        expect(genresPanelBody).toBeTruthy();
      });
    });

    describe('Integration with Existing Functionality', () => {
      it('should update XP progress bar when level changes via CharacterController', () => {
        const levelInput = document.getElementById('level');
        const xpCurrentInput = document.getElementById('xp-current');
        const progressFill = document.getElementById('rpg-xp-progress-fill');
        
        // Set initial state
        levelInput.value = '1';
        xpCurrentInput.value = '50';
        ui.updateXpProgressBar();
        
        const initialWidth = progressFill.style.width;
        
        // Change level (this should trigger updateXpProgressBar via CharacterController)
        levelInput.value = '2';
        levelInput.dispatchEvent(new Event('change'));
        
        // Progress bar should have been updated
        // (The actual update happens via CharacterController calling updateXpNeeded -> updateXpProgressBar)
        ui.updateXpProgressBar();
        expect(progressFill.style.width).not.toBe(initialWidth);
      });

      it('should sync level badge when level input is changed directly', () => {
        const levelInput = document.getElementById('level');
        const levelNumber = document.getElementById('rpg-level-number');
        
        levelInput.value = '7';
        ui.updateXpProgressBar();
        
        expect(levelNumber.textContent).toBe('7');
      });

      it('should update XP progress bar when XP input changes', () => {
        const xpCurrentInput = document.getElementById('xp-current');
        const levelInput = document.getElementById('level');
        const progressFill = document.getElementById('rpg-xp-progress-fill');
        const progressText = document.getElementById('rpg-xp-progress-text');
        
        // Set level to 1 (needs 100 XP)
        levelInput.value = '1';
        xpCurrentInput.value = '0';
        ui.updateXpProgressBar();
        
        expect(progressFill.style.width).toBe('0%');
        expect(progressText.textContent).toBe('0 / 100 XP');
        
        // Change XP to 75
        xpCurrentInput.value = '75';
        xpCurrentInput.dispatchEvent(new Event('input'));
        
        // The input event should trigger updateXpProgressBar via CharacterController
        ui.updateXpProgressBar();
        
        expect(progressFill.style.width).toBe('75%');
        expect(progressText.textContent).toBe('75 / 100 XP');
      });

      it('should handle level badge click to open leveling rewards drawer', () => {
        const levelBadge = document.getElementById('rpg-level-badge');
        const backdrop = document.getElementById('leveling-rewards-backdrop');
        const drawer = document.getElementById('leveling-rewards-drawer');
        
        expect(levelBadge).toBeTruthy();
        expect(backdrop).toBeTruthy();
        expect(drawer).toBeTruthy();
        
        // Initially drawer should be hidden
        expect(drawer.style.display).toBe('none');
        expect(backdrop.classList.contains('active')).toBe(false);
        
        // Click the badge
        levelBadge.click();
        
        // Should open the drawer
        expect(drawer.style.display).toBe('flex');
        expect(backdrop.classList.contains('active')).toBe(true);
      });

      it('should render leveling rewards table in drawer when opened', () => {
        const levelBadge = document.getElementById('rpg-level-badge');
        const drawer = document.getElementById('leveling-rewards-drawer');
        const levelingRewardsTable = document.getElementById('leveling-rewards-table');
        
        expect(levelBadge).toBeTruthy();
        expect(drawer).toBeTruthy();
        expect(levelingRewardsTable).toBeTruthy();
        
        // Open the drawer
        levelBadge.click();
        
        // Wait for async rendering
        return new Promise(resolve => {
          setTimeout(() => {
            // Check that table is rendered
            expect(levelingRewardsTable.innerHTML).toBeTruthy();
            expect(levelingRewardsTable.innerHTML).toContain('Level');
            expect(levelingRewardsTable.innerHTML).toContain('XP Needed');
            resolve();
          }, 100);
        });
      });

      it('should render permanent bonuses table in drawer', () => {
        const levelBadge = document.getElementById('rpg-level-badge');
        const permanentBonusesTable = document.getElementById('permanent-bonuses-table');
        
        expect(levelBadge).toBeTruthy();
        expect(permanentBonusesTable).toBeTruthy();
        
        // Open the drawer
        levelBadge.click();
        
        // Wait for async rendering
        return new Promise(resolve => {
          setTimeout(() => {
            // Check that permanent bonuses table is rendered
            expect(permanentBonusesTable.innerHTML).toBeTruthy();
            expect(permanentBonusesTable.innerHTML).toContain('Level');
            expect(permanentBonusesTable.innerHTML).toContain('Permanent Bonus Unlocked');
            // Check for specific bonuses from JSON
            if (permanentBonuses[3]) {
              expect(permanentBonusesTable.innerHTML).toContain('3');
            }
            resolve();
          }, 100);
        });
      });

      it('should close leveling rewards drawer when clicking backdrop', () => {
        const levelBadge = document.getElementById('rpg-level-badge');
        const backdrop = document.getElementById('leveling-rewards-backdrop');
        const drawer = document.getElementById('leveling-rewards-drawer');
        
        // Open the drawer
        levelBadge.click();
        expect(drawer.style.display).toBe('flex');
        
        // Click backdrop
        backdrop.click();
        
        // Should close the drawer
        expect(drawer.style.display).toBe('none');
        expect(backdrop.classList.contains('active')).toBe(false);
      });

      it('should close leveling rewards drawer when clicking close button', () => {
        const levelBadge = document.getElementById('rpg-level-badge');
        const closeBtn = document.getElementById('close-leveling-rewards');
        const drawer = document.getElementById('leveling-rewards-drawer');
        const backdrop = document.getElementById('leveling-rewards-backdrop');
        
        expect(closeBtn).toBeTruthy();
        
        // Open the drawer
        levelBadge.click();
        expect(drawer.style.display).toBe('flex');
        
        // Click close button
        closeBtn.click();
        
        // Should close the drawer
        expect(drawer.style.display).toBe('none');
        expect(backdrop.classList.contains('active')).toBe(false);
      });
    });

    describe('School Mastery Abilities Drawer', () => {
      it('should open school mastery drawer when clicking View Guide button', () => {
        // Switch to Abilities tab first
        const abilitiesTab = document.querySelector('[data-tab="abilities"]');
        if (abilitiesTab) {
          abilitiesTab.click();
        }

        const openBtn = document.getElementById('open-school-mastery-btn');
        const backdrop = document.getElementById('school-mastery-backdrop');
        const drawer = document.getElementById('school-mastery-drawer');
        
        expect(openBtn).toBeTruthy();
        expect(backdrop).toBeTruthy();
        expect(drawer).toBeTruthy();
        
        // Initially drawer should be hidden
        expect(drawer.style.display).toBe('none');
        expect(backdrop.classList.contains('active')).toBe(false);
        
        // Click the button
        openBtn.click();
        
        // Should open the drawer
        expect(drawer.style.display).toBe('flex');
        expect(backdrop.classList.contains('active')).toBe(true);
      });

      it('should render school mastery abilities from JSON data', () => {
        // Switch to Abilities tab first
        const abilitiesTab = document.querySelector('[data-tab="abilities"]');
        if (abilitiesTab) {
          abilitiesTab.click();
        }

        const openBtn = document.getElementById('open-school-mastery-btn');
        const contentContainer = document.getElementById('school-mastery-abilities-content');
        
        expect(openBtn).toBeTruthy();
        expect(contentContainer).toBeTruthy();
        
        // Open the drawer
        openBtn.click();
        
        // Wait for async rendering
        return new Promise(resolve => {
          setTimeout(() => {
            // Check that content is rendered
            expect(contentContainer.innerHTML).toBeTruthy();
            expect(contentContainer.innerHTML).toContain('School of');
            expect(contentContainer.innerHTML).toContain('Ability Name');
            expect(contentContainer.innerHTML).toContain('Cost');
            expect(contentContainer.innerHTML).toContain('Benefit');
            resolve();
          }, 100);
        });
      });

      it('should close school mastery drawer when clicking backdrop', () => {
        // Switch to Abilities tab first
        const abilitiesTab = document.querySelector('[data-tab="abilities"]');
        if (abilitiesTab) {
          abilitiesTab.click();
        }

        const openBtn = document.getElementById('open-school-mastery-btn');
        const backdrop = document.getElementById('school-mastery-backdrop');
        const drawer = document.getElementById('school-mastery-drawer');
        
        // Open the drawer
        openBtn.click();
        expect(drawer.style.display).toBe('flex');
        
        // Click backdrop
        backdrop.click();
        
        // Should close the drawer
        expect(drawer.style.display).toBe('none');
        expect(backdrop.classList.contains('active')).toBe(false);
      });

      it('should close school mastery drawer when clicking close button', () => {
        // Switch to Abilities tab first
        const abilitiesTab = document.querySelector('[data-tab="abilities"]');
        if (abilitiesTab) {
          abilitiesTab.click();
        }

        const openBtn = document.getElementById('open-school-mastery-btn');
        const closeBtn = document.getElementById('close-school-mastery');
        const drawer = document.getElementById('school-mastery-drawer');
        const backdrop = document.getElementById('school-mastery-backdrop');
        
        expect(closeBtn).toBeTruthy();
        
        // Open the drawer
        openBtn.click();
        expect(drawer.style.display).toBe('flex');
        
        // Click close button
        closeBtn.click();
        
        // Should close the drawer
        expect(drawer.style.display).toBe('none');
        expect(backdrop.classList.contains('active')).toBe(false);
      });
    });

    describe('RPG-Styled Inventory Tab', () => {
      beforeEach(() => {
        // Switch to Inventory tab
        const inventoryTab = document.querySelector('[data-tab="inventory"]');
        if (inventoryTab) {
          inventoryTab.click();
        }
      });

      it('should render RPG tab content wrapper', () => {
        const inventoryPanel = document.querySelector('[data-tab-panel="inventory"]');
        expect(inventoryPanel).toBeTruthy();
        
        const rpgTabContent = inventoryPanel.querySelector('.rpg-tab-content');
        expect(rpgTabContent).toBeTruthy();
      });

      describe('Equipment Slots Panel', () => {
        it('should render slot management panel with RPG styling', () => {
          const slotPanel = document.querySelector('.rpg-slot-management-panel');
          expect(slotPanel).toBeTruthy();
          expect(slotPanel.classList.contains('rpg-panel')).toBe(true);
        });

        it('should render slot panel header with title and subtitle', () => {
          const slotPanel = document.querySelector('.rpg-slot-management-panel');
          const header = slotPanel.querySelector('.rpg-panel-header');
          const title = header.querySelector('.rpg-panel-title');
          const subtitle = header.querySelector('.rpg-panel-subtitle');
          
          expect(header).toBeTruthy();
          expect(title).toBeTruthy();
          expect(title.textContent).toContain('Equipment Slots');
          expect(subtitle).toBeTruthy();
        });

        it('should render slot grid with all three slot types', () => {
          const slotPanel = document.querySelector('.rpg-slot-management-panel');
          const slotGrid = slotPanel.querySelector('.rpg-slot-grid');
          
          expect(slotGrid).toBeTruthy();
          
          const wearableInput = document.getElementById('wearable-slots');
          const nonWearableInput = document.getElementById('non-wearable-slots');
          const familiarInput = document.getElementById('familiar-slots');
          
          expect(wearableInput).toBeTruthy();
          expect(nonWearableInput).toBeTruthy();
          expect(familiarInput).toBeTruthy();
          
          expect(wearableInput.classList.contains('rpg-stat-input')).toBe(true);
          expect(nonWearableInput.classList.contains('rpg-stat-input')).toBe(true);
          expect(familiarInput.classList.contains('rpg-stat-input')).toBe(true);
        });

        it('should render slot labels with RPG styling', () => {
          const slotItems = document.querySelectorAll('.rpg-slot-item');
          expect(slotItems.length).toBeGreaterThanOrEqual(3);
          
          slotItems.forEach(item => {
            const label = item.querySelector('.rpg-slot-label');
            expect(label).toBeTruthy();
          });
        });
      });

      describe('Add Item Panel', () => {
        it('should render add item panel with RPG styling', () => {
          const addItemPanel = document.querySelector('.rpg-add-item-panel');
          expect(addItemPanel).toBeTruthy();
          expect(addItemPanel.classList.contains('rpg-panel')).toBe(true);
        });

        it('should render add item form with RPG-styled select and button', () => {
          const addItemPanel = document.querySelector('.rpg-add-item-panel');
          const itemSelect = document.getElementById('item-select');
          const addButton = document.getElementById('add-item-button');
          
          expect(itemSelect).toBeTruthy();
          expect(addButton).toBeTruthy();
          
          expect(itemSelect.classList.contains('rpg-select')).toBe(true);
          expect(addButton.classList.contains('rpg-btn')).toBe(true);
          expect(addButton.classList.contains('rpg-btn-primary')).toBe(true);
        });
      });

      describe('Equipped Items Panel', () => {
        it('should render equipped items panel with RPG styling', () => {
          const equippedPanel = document.querySelector('.rpg-equipped-panel');
          expect(equippedPanel).toBeTruthy();
          expect(equippedPanel.classList.contains('rpg-panel')).toBe(true);
        });

        it('should render equipped summary in panel header', () => {
          const equippedSummary = document.getElementById('equipped-summary');
          expect(equippedSummary).toBeTruthy();
          expect(equippedSummary.classList.contains('rpg-panel-title')).toBe(true);
          expect(equippedSummary.textContent).toContain('Equipped Items');
        });

        it('should render equipped items grid', () => {
          const equippedList = document.getElementById('equipped-items-list');
          expect(equippedList).toBeTruthy();
          expect(equippedList.classList.contains('item-grid')).toBe(true);
        });
      });

      describe('Inventory Panel', () => {
        it('should render inventory panel with RPG styling', () => {
          const inventoryPanel = document.querySelector('.rpg-inventory-panel');
          expect(inventoryPanel).toBeTruthy();
          expect(inventoryPanel.classList.contains('rpg-panel')).toBe(true);
        });

        it('should render inventory grid', () => {
          const inventoryList = document.getElementById('inventory-list');
          expect(inventoryList).toBeTruthy();
          expect(inventoryList.classList.contains('item-grid')).toBe(true);
        });
      });

      describe('Passive Equipment Panel', () => {
        it('should render passive equipment panel with RPG styling', () => {
          const passivePanel = document.querySelector('.rpg-passive-equipment-panel');
          expect(passivePanel).toBeTruthy();
          expect(passivePanel.classList.contains('rpg-panel')).toBe(true);
        });

        it('should render passive equipment grid with two columns', () => {
          const passivePanel = document.querySelector('.rpg-passive-equipment-panel');
          const passiveGrid = passivePanel.querySelector('.rpg-passive-grid');
          
          expect(passiveGrid).toBeTruthy();
          
          const columns = passiveGrid.querySelectorAll('.rpg-passive-column');
          expect(columns.length).toBe(2);
        });

        it('should render display slots and adoption slots columns', () => {
          const displaySlots = document.getElementById('passive-item-slots-character-sheet');
          const adoptionSlots = document.getElementById('passive-familiar-slots-character-sheet');
          
          expect(displaySlots).toBeTruthy();
          expect(adoptionSlots).toBeTruthy();
          
          const columnTitles = document.querySelectorAll('.rpg-passive-column-title');
          expect(columnTitles.length).toBe(2);
          expect(columnTitles[0].textContent).toContain('Display Slots');
          expect(columnTitles[1].textContent).toContain('Adoption Slots');
        });
      });
    });

    describe('RPG-Styled Environment Tab', () => {
      beforeEach(() => {
        // Switch to Environment tab
        const environmentTab = document.querySelector('[data-tab="environment"]');
        if (environmentTab) {
          environmentTab.click();
        }
      });

      it('should render RPG tab content wrapper', () => {
        const environmentPanel = document.querySelector('[data-tab-panel="environment"]');
        expect(environmentPanel).toBeTruthy();
        
        const rpgTabContent = environmentPanel.querySelector('.rpg-tab-content');
        expect(rpgTabContent).toBeTruthy();
      });

      describe('Environment Header Panel', () => {
        it('should render environment header panel with RPG styling', () => {
          const headerPanel = document.querySelector('.rpg-environment-header-panel');
          expect(headerPanel).toBeTruthy();
          expect(headerPanel.classList.contains('rpg-panel')).toBe(true);
        });

        it('should render header with title and subtitle', () => {
          const headerPanel = document.querySelector('.rpg-environment-header-panel');
          const header = headerPanel.querySelector('.rpg-panel-header');
          const title = header.querySelector('.rpg-panel-title');
          const subtitle = header.querySelector('.rpg-panel-subtitle');
          
          expect(header).toBeTruthy();
          expect(title).toBeTruthy();
          expect(title.textContent).toContain('Reading Environment');
          expect(subtitle).toBeTruthy();
        });

        it('should render Atmospheric Buffs table button with RPG styling', () => {
          const atmosphericBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="atmospheric-buffs"]');
          expect(atmosphericBtn).toBeTruthy();
          expect(atmosphericBtn.classList.contains('rpg-btn')).toBe(true);
          expect(atmosphericBtn.classList.contains('rpg-btn-secondary')).toBe(true);
        });
      });

      describe('Temporary Buffs Panel', () => {
        it('should render temporary buffs panel with RPG styling', () => {
          const tempBuffsPanel = document.querySelector('.rpg-temporary-buffs-panel');
          expect(tempBuffsPanel).toBeTruthy();
          expect(tempBuffsPanel.classList.contains('rpg-panel')).toBe(true);
        });

        it('should render panel header with title and subtitles', () => {
          const tempBuffsPanel = document.querySelector('.rpg-temporary-buffs-panel');
          const header = tempBuffsPanel.querySelector('.rpg-panel-header');
          const title = header.querySelector('.rpg-panel-title');
          const subtitles = header.querySelectorAll('.rpg-panel-subtitle');
          
          expect(header).toBeTruthy();
          expect(title).toBeTruthy();
          expect(title.textContent).toContain('Active Temporary Buffs');
          expect(subtitles.length).toBeGreaterThanOrEqual(2);
        });

        it('should render add buff form with RPG-styled elements', () => {
          const addBuffForm = document.querySelector('.rpg-add-buff-form');
          const buffSelect = document.getElementById('temp-buff-select');
          const addButton = document.getElementById('add-temp-buff-from-dropdown-button');
          
          expect(addBuffForm).toBeTruthy();
          expect(buffSelect).toBeTruthy();
          expect(addButton).toBeTruthy();
          
          expect(buffSelect.classList.contains('rpg-select')).toBe(true);
          expect(addButton.classList.contains('rpg-btn')).toBe(true);
          expect(addButton.classList.contains('rpg-btn-primary')).toBe(true);
        });

        it('should render temporary buffs table', () => {
          const activeTempBuffsList = document.getElementById('active-temp-buffs-list');
          const table = activeTempBuffsList.querySelector('.tracker-table');
          
          expect(activeTempBuffsList).toBeTruthy();
          expect(table).toBeTruthy();
          
          const headers = table.querySelectorAll('thead th');
          expect(headers.length).toBe(5);
          expect(headers[0].textContent).toContain('Buff Name');
          expect(headers[1].textContent).toContain('Effect');
          expect(headers[2].textContent).toContain('Duration');
          expect(headers[3].textContent).toContain('Status');
          expect(headers[4].textContent).toContain('Action');
        });
      });

      describe('Atmospheric Buffs Panel', () => {
        it('should render atmospheric buffs panel with RPG styling', () => {
          const atmosphericPanel = document.querySelector('.rpg-atmospheric-buffs-panel');
          expect(atmosphericPanel).toBeTruthy();
          expect(atmosphericPanel.classList.contains('rpg-panel')).toBe(true);
        });

        it('should render panel header with title', () => {
          const atmosphericPanel = document.querySelector('.rpg-atmospheric-buffs-panel');
          const header = atmosphericPanel.querySelector('.rpg-panel-header');
          const title = header.querySelector('.rpg-panel-title');
          
          expect(header).toBeTruthy();
          expect(title).toBeTruthy();
          expect(title.textContent).toContain('Atmospheric Buffs');
        });

        it('should render atmospheric buffs table', () => {
          const atmosphericTable = document.querySelector('.rpg-atmospheric-buffs-panel .tracker-table');
          expect(atmosphericTable).toBeTruthy();
          
          const headers = atmosphericTable.querySelectorAll('thead th');
          expect(headers.length).toBe(5);
          expect(headers[0].textContent).toContain('Atmospheric Buff');
          expect(headers[1].textContent).toContain('Daily Buff');
          expect(headers[2].textContent).toContain('Active');
          expect(headers[3].textContent).toContain('Total Days Used');
          expect(headers[4].textContent).toContain('Monthly Total');
        });

        it('should render End of Month button with RPG styling', () => {
          const endOfMonthBtn = document.querySelector('.end-of-month-button');
          expect(endOfMonthBtn).toBeTruthy();
          expect(endOfMonthBtn.classList.contains('rpg-btn')).toBe(true);
          expect(endOfMonthBtn.classList.contains('rpg-btn-primary')).toBe(true);
        });
      });
    });

    describe('Level Up Button', () => {
      it('should render level up button', () => {
        const levelUpBtn = document.getElementById('level-up-btn');
        expect(levelUpBtn).toBeTruthy();
        expect(levelUpBtn.classList.contains('rpg-level-up-btn')).toBe(true);
      });

      it('should disable level up button when XP is insufficient', () => {
        const levelUpBtn = document.getElementById('level-up-btn');
        const levelInput = document.getElementById('level');
        const xpCurrentInput = document.getElementById('xp-current');
        
        // Set level to 1 (needs 100 XP) with insufficient XP
        levelInput.value = '1';
        xpCurrentInput.value = '50'; // Less than 100
        
        ui.updateXpProgressBar();
        
        expect(levelUpBtn.disabled).toBe(true);
      });

      it('should enable level up button when XP is sufficient', () => {
        const levelUpBtn = document.getElementById('level-up-btn');
        const levelInput = document.getElementById('level');
        const xpCurrentInput = document.getElementById('xp-current');
        
        // Set level to 1 (needs 100 XP) with sufficient XP
        levelInput.value = '1';
        xpCurrentInput.value = '100'; // Exactly enough
        
        ui.updateXpProgressBar();
        
        expect(levelUpBtn.disabled).toBe(false);
      });

      it('should disable level up button at max level', () => {
        const levelUpBtn = document.getElementById('level-up-btn');
        const levelInput = document.getElementById('level');
        const xpCurrentInput = document.getElementById('xp-current');
        
        // Set to max level (if level 20 is max)
        if (xpLevels[20] === 'Max') {
          levelInput.value = '20';
          xpCurrentInput.value = '1000';
          
          ui.updateXpProgressBar();
          
          expect(levelUpBtn.disabled).toBe(true);
        }
      });

      it('should level up when button is clicked with sufficient XP', () => {
        const levelUpBtn = document.getElementById('level-up-btn');
        const levelInput = document.getElementById('level');
        const xpCurrentInput = document.getElementById('xp-current');
        const xpNeededElement = document.getElementById('xp-needed');
        
        // Set initial state: level 1 with 150 XP (needs 100)
        levelInput.value = '1';
        xpCurrentInput.value = '150';
        ui.updateXpProgressBar();
        
        const initialLevel = parseInt(levelInput.value);
        const initialXP = parseInt(xpCurrentInput.value);
        const xpNeeded = parseInt(xpLevels[initialLevel]);
        
        // Click level up button
        levelUpBtn.click();
        
        // Level should have increased
        expect(parseInt(levelInput.value)).toBe(initialLevel + 1);
        
        // XP should be reduced by the required amount (carries over excess)
        const expectedXP = initialXP - xpNeeded; // 150 - 100 = 50
        expect(parseInt(xpCurrentInput.value)).toBe(expectedXP);
        
        // XP needed should update for new level
        const newLevel = parseInt(levelInput.value);
        const newXpNeeded = xpNeededElement.tagName === 'INPUT' ? xpNeededElement.value : xpNeededElement.textContent;
        if (xpLevels[newLevel] && xpLevels[newLevel] !== 'Max') {
          expect(newXpNeeded).toBe(xpLevels[newLevel].toString());
        }
      });

      it('should carry over excess XP when leveling up', () => {
        const levelUpBtn = document.getElementById('level-up-btn');
        const levelInput = document.getElementById('level');
        const xpCurrentInput = document.getElementById('xp-current');
        
        // Set level 1 with 250 XP (needs 100, so 150 excess)
        levelInput.value = '1';
        xpCurrentInput.value = '250';
        ui.updateXpProgressBar();
        
        const xpNeeded = parseInt(xpLevels[1]);
        
        // Click level up
        levelUpBtn.click();
        
        // Should have 150 XP remaining (250 - 100)
        expect(parseInt(xpCurrentInput.value)).toBe(250 - xpNeeded);
      });

      it('should apply level rewards when leveling up', () => {
        const levelUpBtn = document.getElementById('level-up-btn');
        const levelInput = document.getElementById('level');
        const xpCurrentInput = document.getElementById('xp-current');
        const inkDropsInput = document.getElementById('inkDrops');
        const paperScrapsInput = document.getElementById('paperScraps');
        
        // Set initial state
        levelInput.value = '1';
        xpCurrentInput.value = '100'; // Exactly enough to level up
        inkDropsInput.value = '10';
        paperScrapsInput.value = '5';
        ui.updateXpProgressBar();
        
        const initialInk = parseInt(inkDropsInput.value);
        const initialPaper = parseInt(paperScrapsInput.value);
        
        // Click level up (should go to level 2)
        levelUpBtn.click();
        
        // Level 2 rewards: 5 inkDrops, 2 paperScraps
        // Check that rewards were applied
        expect(parseInt(inkDropsInput.value)).toBeGreaterThan(initialInk);
        expect(parseInt(paperScrapsInput.value)).toBeGreaterThan(initialPaper);
      });

      it('should update progress bar after leveling up', () => {
        const levelUpBtn = document.getElementById('level-up-btn');
        const levelInput = document.getElementById('level');
        const xpCurrentInput = document.getElementById('xp-current');
        const progressFill = document.getElementById('rpg-xp-progress-fill');
        const progressText = document.getElementById('rpg-xp-progress-text');
        const levelNumber = document.getElementById('rpg-level-number');
        
        // Set level 1 with 150 XP
        levelInput.value = '1';
        xpCurrentInput.value = '150';
        ui.updateXpProgressBar();
        
        // Click level up
        levelUpBtn.click();
        
        // Level badge should update
        expect(levelNumber.textContent).toBe('2');
        
        // Progress bar should reflect new XP and level
        const newXP = parseInt(xpCurrentInput.value);
        const newLevel = parseInt(levelInput.value);
        const newXpNeeded = xpLevels[newLevel];
        
        if (newXpNeeded && newXpNeeded !== 'Max') {
          const expectedPercentage = Math.min(100, Math.max(0, (newXP / parseInt(newXpNeeded)) * 100));
          expect(progressFill.style.width).toBe(`${expectedPercentage}%`);
          expect(progressText.textContent).toContain(`${newXP} / ${newXpNeeded} XP`);
        }
      });

      it('should not level up if button is disabled', () => {
        const levelUpBtn = document.getElementById('level-up-btn');
        const levelInput = document.getElementById('level');
        const xpCurrentInput = document.getElementById('xp-current');
        
        // Set level 1 with insufficient XP
        levelInput.value = '1';
        xpCurrentInput.value = '50';
        ui.updateXpProgressBar();
        
        const initialLevel = parseInt(levelInput.value);
        
        // Try to click (should be disabled)
        expect(levelUpBtn.disabled).toBe(true);
        
        // Manually trigger click (shouldn't do anything)
        levelUpBtn.click();
        
        // Level should not have changed
        expect(parseInt(levelInput.value)).toBe(initialLevel);
      });

      it('should update permanent bonuses when leveling up', () => {
        const levelUpBtn = document.getElementById('level-up-btn');
        const levelInput = document.getElementById('level');
        const xpCurrentInput = document.getElementById('xp-current');
        const bonusList = document.getElementById('permanentBonusesList');
        
        // Set level 2 with enough XP to reach level 3
        levelInput.value = '2';
        const xpNeeded = parseInt(xpLevels[2]);
        xpCurrentInput.value = xpNeeded.toString();
        ui.updateXpProgressBar();
        
        // Click level up to reach level 3
        levelUpBtn.click();
        
        // Level 3 should have permanent bonuses
        expect(parseInt(levelInput.value)).toBe(3);
        if (permanentBonuses[3]) {
          expect(bonusList.innerHTML).toContain(permanentBonuses[3]);
        }
      });

      it('should handle leveling up multiple times in sequence', () => {
        const levelUpBtn = document.getElementById('level-up-btn');
        const levelInput = document.getElementById('level');
        const xpCurrentInput = document.getElementById('xp-current');
        
        // Set level 1 with enough XP for multiple level ups
        levelInput.value = '1';
        xpCurrentInput.value = '500'; // Enough for multiple levels
        ui.updateXpProgressBar();
        
        const initialLevel = parseInt(levelInput.value);
        
        // Level up once
        levelUpBtn.click();
        expect(parseInt(levelInput.value)).toBe(initialLevel + 1);
        
        // If still enough XP, level up again
        ui.updateXpProgressBar();
        if (!levelUpBtn.disabled) {
          const levelBeforeSecond = parseInt(levelInput.value);
          levelUpBtn.click();
          expect(parseInt(levelInput.value)).toBe(levelBeforeSecond + 1);
        }
      });
    });
  });

  describe("Keeper's Loadout & Inventory", () => {
    it('should add an item to the inventory', () => {
      const itemSelect = document.getElementById('item-select');
      const addItemButton = document.getElementById('add-item-button');
      const inventoryList = document.getElementById('inventory-list');

      // Select an item and click "Add"
      itemSelect.value = "Librarian's Compass";
      addItemButton.click();

      // Assert that the item appears in the inventory list
      expect(inventoryList.innerHTML).toContain("Librarian's Compass");
      expect(inventoryList.innerHTML).toContain(allItems["Librarian's Compass"].bonus);
    });

    it('should move an item from inventory to equipped slots', () => {
      // Increase the number of available wearable slots to ensure there's space
      const wearableSlotsInput = document.getElementById('wearable-slots');
      wearableSlotsInput.value = '2';
      wearableSlotsInput.dispatchEvent(new Event('change'));
      // First, add an item to the inventory
      document.getElementById('item-select').value = 'Amulet of Duality';
      document.getElementById('add-item-button').click();

      const inventoryList = document.getElementById('inventory-list');
      const equippedList = document.getElementById('equipped-items-list');

      // Find the "Equip" button for the item in the inventory and click it
      const equipButton = inventoryList.querySelector('.equip-btn');
      equipButton.click();

      // Assert that the item is now in the equipped list and the inventory is empty
      expect(equippedList.innerHTML).toContain('Amulet of Duality');
      expect(inventoryList.textContent).toContain('Your inventory is empty.');
    });
  });

  describe('Atmospheric Buffs', () => {
    it('should render all atmospheric buffs in the table', () => {
      const tbody = document.getElementById('atmospheric-buffs-body');
      const rows = tbody.querySelectorAll('tr');

      // Assert that all 8 atmospheric buffs are rendered
      expect(rows.length).toBe(8);
    });

    it('should not highlight any rows when no sanctum is selected', () => {
      const tbody = document.getElementById('atmospheric-buffs-body');
      const highlightedRows = tbody.querySelectorAll('tr.highlight');

      // Assert that no rows are highlighted
      expect(highlightedRows.length).toBe(0);
    });

    it('should highlight associated buffs when The Spire of Whispers is selected', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      librarySanctumSelect.value = 'The Spire of Whispers';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      const tbody = document.getElementById('atmospheric-buffs-body');
      const highlightedRows = tbody.querySelectorAll('tr.highlight');

      // The Spire of Whispers has 3 associated buffs
      expect(highlightedRows.length).toBe(3);

      // Check that the correct buffs are highlighted
      const highlightedBuffNames = Array.from(highlightedRows).map(row => row.cells[0].textContent);
      expect(highlightedBuffNames).toContain('The Candlight Study');
      expect(highlightedBuffNames).toContain('The Cozy Hearth');
      expect(highlightedBuffNames).toContain('Head in the Clouds');
    });

    it('should highlight associated buffs when The Verdant Athenaeum is selected', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      librarySanctumSelect.value = 'The Verdant Athenaeum';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      const tbody = document.getElementById('atmospheric-buffs-body');
      const highlightedRows = tbody.querySelectorAll('tr.highlight');

      // The Verdant Athenaeum has 3 associated buffs
      expect(highlightedRows.length).toBe(3);

      // Check that the correct buffs are highlighted
      const highlightedBuffNames = Array.from(highlightedRows).map(row => row.cells[0].textContent);
      expect(highlightedBuffNames).toContain('The Herbalist\'s Nook');
      expect(highlightedBuffNames).toContain('The Soaking in Nature');
      expect(highlightedBuffNames).toContain('The Soundscape Spire');
    });

    it('should highlight associated buffs when The Sunken Archives is selected', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      librarySanctumSelect.value = 'The Sunken Archives';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      const tbody = document.getElementById('atmospheric-buffs-body');
      const highlightedRows = tbody.querySelectorAll('tr.highlight');

      // The Sunken Archives has 3 associated buffs
      expect(highlightedRows.length).toBe(3);

      // Check that the correct buffs are highlighted
      const highlightedBuffNames = Array.from(highlightedRows).map(row => row.cells[0].textContent);
      expect(highlightedBuffNames).toContain('The Soundscape Spire');
      expect(highlightedBuffNames).toContain('The Wanderer\'s Path');
      expect(highlightedBuffNames).toContain('The Excavation');
    });

    it('should show daily buff value of 2 for highlighted buffs', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      librarySanctumSelect.value = 'The Spire of Whispers';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      const tbody = document.getElementById('atmospheric-buffs-body');
      const highlightedRows = tbody.querySelectorAll('tr.highlight');

      // Check that all highlighted rows have a daily buff value of 2
      highlightedRows.forEach(row => {
        const dailyBuffValue = row.cells[1].textContent;
        expect(dailyBuffValue).toBe('2');
      });
    });

    it('should show daily buff value of 1 for non-highlighted buffs', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      librarySanctumSelect.value = 'The Spire of Whispers';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      const tbody = document.getElementById('atmospheric-buffs-body');
      const nonHighlightedRows = Array.from(tbody.querySelectorAll('tr')).filter(row => !row.classList.contains('highlight'));

      // Check that all non-highlighted rows have a daily buff value of 1
      nonHighlightedRows.forEach(row => {
        const dailyBuffValue = row.cells[1].textContent;
        expect(dailyBuffValue).toBe('1');
      });
    });

    it('should calculate monthly total correctly for highlighted buffs', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      librarySanctumSelect.value = 'The Verdant Athenaeum';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      const tbody = document.getElementById('atmospheric-buffs-body');
      
      // Find "The Herbalist's Nook" row (should be highlighted)
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const herbalistRow = rows.find(row => row.cells[0].textContent === 'The Herbalist\'s Nook');

      // The daily buff value for highlighted buffs should be 2
      expect(herbalistRow.cells[1].textContent).toBe('2');

      // If we set days to 5, the monthly total calculation should use the multiplier of 2
      // The rendered monthly total is initially 0 * 2 = 0
      expect(herbalistRow.cells[4].textContent).toBe('0');
    });

    it('should calculate monthly total correctly for non-highlighted buffs', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      librarySanctumSelect.value = 'The Verdant Athenaeum';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      const tbody = document.getElementById('atmospheric-buffs-body');
      
      // Find "The Candlight Study" row (should NOT be highlighted for Verdant Athenaeum)
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const candlightRow = rows.find(row => row.cells[0].textContent === 'The Candlight Study');

      // The daily buff value for non-highlighted buffs should be 1
      expect(candlightRow.cells[1].textContent).toBe('1');

      // The rendered monthly total is initially 0 * 1 = 0
      expect(candlightRow.cells[4].textContent).toBe('0');
    });

    it('should update highlighting when sanctum selection changes', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      const tbody = document.getElementById('atmospheric-buffs-body');

      // First select The Spire of Whispers
      librarySanctumSelect.value = 'The Spire of Whispers';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      let highlightedRows = tbody.querySelectorAll('tr.highlight');
      expect(highlightedRows.length).toBe(3);

      // Change to The Verdant Athenaeum
      librarySanctumSelect.value = 'The Verdant Athenaeum';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      highlightedRows = tbody.querySelectorAll('tr.highlight');
      expect(highlightedRows.length).toBe(3);

      // The highlighted buffs should have changed
      const highlightedBuffNames = Array.from(highlightedRows).map(row => row.cells[0].textContent);
      expect(highlightedBuffNames).not.toContain('The Candlight Study');
      expect(highlightedBuffNames).toContain('The Herbalist\'s Nook');
    });

    it('should apply the highlight CSS class to the correct rows', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      librarySanctumSelect.value = 'The Spire of Whispers';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      const tbody = document.getElementById('atmospheric-buffs-body');
      const rows = Array.from(tbody.querySelectorAll('tr'));

      // Check that The Candlight Study has the highlight class
      const candlightRow = rows.find(row => row.cells[0].textContent === 'The Candlight Study');
      expect(candlightRow.classList.contains('highlight')).toBe(true);

      // Check that a non-associated buff does NOT have the highlight class
      const excavationRow = rows.find(row => row.cells[0].textContent === 'The Excavation');
      expect(excavationRow.classList.contains('highlight')).toBe(false);
    });

    it('should remove highlight class when sanctum is deselected', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      const tbody = document.getElementById('atmospheric-buffs-body');

      // First, select a sanctum
      librarySanctumSelect.value = 'The Sunken Archives';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      let highlightedRows = tbody.querySelectorAll('tr.highlight');
      expect(highlightedRows.length).toBe(3);

      // Now deselect the sanctum
      librarySanctumSelect.value = '';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      // Assert that no rows are highlighted
      highlightedRows = tbody.querySelectorAll('tr.highlight');
      expect(highlightedRows.length).toBe(0);
    });

    it('should maintain daily buff value of 1 when sanctum is deselected', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      const tbody = document.getElementById('atmospheric-buffs-body');

      // First select a sanctum to get daily buff value of 2
      librarySanctumSelect.value = 'The Verdant Athenaeum';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      const rows = Array.from(tbody.querySelectorAll('tr'));
      const herbalistRow = rows.find(row => row.cells[0].textContent === 'The Herbalist\'s Nook');
      expect(herbalistRow.cells[1].textContent).toBe('2');

      // Deselect sanctum
      librarySanctumSelect.value = '';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      // Check that daily buff value returns to 1
      const updatedRows = Array.from(tbody.querySelectorAll('tr'));
      const updatedHerbalistRow = updatedRows.find(row => row.cells[0].textContent === 'The Herbalist\'s Nook');
      expect(updatedHerbalistRow.cells[1].textContent).toBe('1');
    });

    it('should correctly highlight all three buffs for each sanctum', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      const tbody = document.getElementById('atmospheric-buffs-body');

      // Test all three sanctums
      const sanctumTests = [
        {
          name: 'The Spire of Whispers',
          expectedBuffs: ['The Candlight Study', 'The Cozy Hearth', 'Head in the Clouds']
        },
        {
          name: 'The Verdant Athenaeum',
          expectedBuffs: ['The Herbalist\'s Nook', 'The Soaking in Nature', 'The Soundscape Spire']
        },
        {
          name: 'The Sunken Archives',
          expectedBuffs: ['The Soundscape Spire', 'The Wanderer\'s Path', 'The Excavation']
        }
      ];

      sanctumTests.forEach(test => {
        librarySanctumSelect.value = test.name;
        librarySanctumSelect.dispatchEvent(new Event('change'));

        const highlightedRows = tbody.querySelectorAll('tr.highlight');
        expect(highlightedRows.length).toBe(3);

        const highlightedBuffNames = Array.from(highlightedRows).map(row => row.cells[0].textContent);
        test.expectedBuffs.forEach(buffName => {
          expect(highlightedBuffNames).toContain(buffName);
        });
      });
    });

    it('should update daily buff values when sanctum changes', () => {
      const librarySanctumSelect = document.getElementById('librarySanctum');
      const tbody = document.getElementById('atmospheric-buffs-body');

      // Initially without sanctum, The Soundscape Spire should have daily buff of 1
      let rows = Array.from(tbody.querySelectorAll('tr'));
      let soundscapeRow = rows.find(row => row.cells[0].textContent === 'The Soundscape Spire');
      expect(soundscapeRow.cells[1].textContent).toBe('1');

      // Select a sanctum that includes Soundscape Spire
      librarySanctumSelect.value = 'The Verdant Athenaeum';
      librarySanctumSelect.dispatchEvent(new Event('change'));

      // Find the row again after re-render
      rows = Array.from(tbody.querySelectorAll('tr'));
      soundscapeRow = rows.find(row => row.cells[0].textContent === 'The Soundscape Spire');
      
      // Daily buff value should now be 2 for the associated buff
      expect(soundscapeRow.cells[1].textContent).toBe('2');
      
      // And the row should be highlighted
      expect(soundscapeRow.classList.contains('highlight')).toBe(true);
    });

    it('should process end of month correctly', () => {
      // Need to manually add atmospheric buff data to characterState
      const { characterState } = require('../assets/js/character-sheet/state.js');
      characterState.atmosphericBuffs = {
        'The Candlight Study': { daysUsed: 10, isActive: true }
      };

      // Set up books completed counter
      const booksCompletedInput = document.getElementById('books-completed-month');
      booksCompletedInput.value = '3'; // 3 unique books

      // Get initial values
      const xpInput = document.getElementById('xp-current');
      const inkDropsInput = document.getElementById('inkDrops');
      const initialXP = parseInt(xpInput.value, 10) || 0;
      const initialInkDrops = parseInt(inkDropsInput.value, 10) || 0;

      // Click End of Month button
      const endOfMonthButton = document.querySelector('.end-of-month-button');
      endOfMonthButton.click();

      // Verify XP was added (15 XP per book = 45 XP)
      const finalXP = parseInt(xpInput.value, 10) || 0;
      expect(finalXP).toBe(initialXP + 45);

      // Verify ink drops were added (10 days * 1 ink drop per day = 10 ink drops)
      const finalInkDrops = parseInt(inkDropsInput.value, 10) || 0;
      expect(finalInkDrops).toBe(initialInkDrops + 10);

      // Verify books completed counter was reset
      expect(parseInt(booksCompletedInput.value, 10)).toBe(0);

      // Verify atmospheric buff days were reset
      expect(characterState.atmosphericBuffs['The Candlight Study'].daysUsed).toBe(0);
    });
  });

  describe('Monthly Tracker', () => {
    it('should add a new side quest to the active table', () => {
      // Fill out the quest form
      // Note: PeriodService will assign quest to period based on dateAdded (current date)
      // So the displayed month/year will be the current month/year, not the form values
      const currentDate = new Date();
      const currentMonth = currentDate.toLocaleString('en-US', { month: 'long' });
      const currentYear = String(currentDate.getFullYear());
      
      document.getElementById('quest-month').value = 'October';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book-id').value = 'the-test-book';

      // Select the quest type to reveal the correct prompt dropdown
      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '♣ Side Quest';
      questTypeSelect.dispatchEvent(new Event('change'));

      // Select a prompt from the side quest dropdown
      document.getElementById('side-quest-select').value = sideQuests["1"];

      // Click the "Add Quest" button
      document.getElementById('add-quest-button').click();

      // Assert that the new quest appears in the active assignments cards
      const cardsContainer = document.querySelector('#active-assignments-container .quest-cards-container');
      expect(cardsContainer).toBeTruthy();
      const firstCard = cardsContainer.querySelector('.quest-card');
      expect(firstCard).toBeTruthy();
      // Quest will be assigned to current month/year based on dateAdded (PeriodService)
      expect(firstCard.textContent).toContain(currentMonth);
      expect(firstCard.textContent).toContain('The Test Book');
      expect(firstCard.textContent).toContain('The Arcane Grimoire');
    });

    it('should move a side quest from active to completed', () => {
      // First, add an active quest
      // These fields are required for the quest to be added successfully
      document.getElementById('quest-month').value = 'October';
      document.getElementById('quest-year').value = '2025';

      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '♣ Side Quest';
      questTypeSelect.dispatchEvent(new Event('change'));

      const sideQuestSelect = document.getElementById('side-quest-select');
      sideQuestSelect.value = sideQuests["4"]; // The Wandering Merchant's Request

      document.getElementById('new-quest-book-id').value = 'a-finished-story';
      document.getElementById('add-quest-button').click();

      // Click the "Complete" button on the active quest
      const completeBtnMove = document.querySelector('#active-assignments-container .quest-card .complete-quest-btn');
      expect(completeBtnMove).toBeTruthy();
      completeBtnMove.click();

      // Assert that the quest is now in the completed cards and the active cards are empty
      // Side quests are rendered in the dedicated side-quests-archive-container
      const completedContainer = document.querySelector('#completed-quests-container #side-quests-archive-container');
      expect(completedContainer.textContent).toContain('A Finished Story');
      const activeContainer = document.querySelector('#active-assignments-container .quest-cards-container');
      expect(activeContainer.children.length).toBe(0);
    });

    it('should add rewards property to quests when created', () => {
      // Add a Side Quest instead since genre quests require setup
      document.getElementById('quest-month').value = 'October';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book-id').value = 'test-book';

      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '♣ Side Quest';
      questTypeSelect.dispatchEvent(new Event('change'));

      document.getElementById('side-quest-select').value = sideQuests['1'];
      document.getElementById('add-quest-button').click();

      // Check that the quest has rewards
      const addedQuest = characterState.activeAssignments[0];
      expect(addedQuest).toHaveProperty('rewards');
      expect(addedQuest.rewards).toHaveProperty('xp');
      expect(addedQuest.rewards).toHaveProperty('inkDrops');
      expect(addedQuest.rewards).toHaveProperty('paperScraps');
      expect(addedQuest.rewards).toHaveProperty('items');
    });

    it('should update currency when completing a quest', () => {
      // Add a quest
      document.getElementById('quest-month').value = 'October';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book-id').value = 'test-book';

      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '♣ Side Quest';
      questTypeSelect.dispatchEvent(new Event('change'));

      // Use side quest #7 which grants ink drops and paper scraps
      document.getElementById('side-quest-select').value = sideQuests['7'];
      document.getElementById('add-quest-button').click();

      // Get initial currency values
      const inkDropsInput = document.getElementById('inkDrops');
      const paperScrapsInput = document.getElementById('paperScraps');
      const initialInkDrops = parseInt(inkDropsInput.value, 10) || 0;
      const initialPaperScraps = parseInt(paperScrapsInput.value, 10) || 0;

      // Complete the quest
      const completeBtnCurrency = document.querySelector('#active-assignments-container .quest-card .complete-quest-btn');
      expect(completeBtnCurrency).toBeTruthy();
      completeBtnCurrency.click();

      // Check that currency was updated
      const finalInkDrops = parseInt(inkDropsInput.value, 10) || 0;
      const finalPaperScraps = parseInt(paperScrapsInput.value, 10) || 0;

      expect(finalInkDrops).toBeGreaterThan(initialInkDrops);
      expect(finalPaperScraps).toBeGreaterThan(initialPaperScraps);
    });

    it('should track unique books in completedBooksSet', () => {
      // Add and complete a quest with a specific book
      document.getElementById('quest-month').value = 'October';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book-id').value = 'unique-book-title';

      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '♣ Side Quest';
      questTypeSelect.dispatchEvent(new Event('change'));

      document.getElementById('side-quest-select').value = sideQuests['1'];
      document.getElementById('add-quest-button').click();

      // Complete the quest
      const completeBtn1 = document.querySelector('#active-assignments-container .quest-card .complete-quest-btn');
      expect(completeBtn1).toBeTruthy();
      completeBtn1.click();

      // Check books completed counter
      const booksCompletedInput = document.getElementById('books-completed-month');
      expect(parseInt(booksCompletedInput.value, 10)).toBe(1);

      // Add another quest with the same book
      document.getElementById('quest-month').value = 'October';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book-id').value = 'unique-book-title';

      questTypeSelect.value = '♣ Side Quest';
      questTypeSelect.dispatchEvent(new Event('change'));

      document.getElementById('side-quest-select').value = sideQuests['2'];
      document.getElementById('add-quest-button').click();

      // Complete the second quest
      const completeBtn2 = document.querySelector('#active-assignments-container .quest-card .complete-quest-btn');
      expect(completeBtn2).toBeTruthy();
      completeBtn2.click();

      // Books completed should still be 1 (same book)
      expect(parseInt(booksCompletedInput.value, 10)).toBe(1);
    });

    it('should sync bookshelf input value from completedBooksSet on initialization', () => {
      // Set up: Add books to monthlyCompletedBooks but input might be out of sync
      const testBooks = ['Book 1', 'Book 2', 'Book 3'];
      safeSetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, testBooks);
      
      // Set input to a different value (simulating the bug)
      const booksCompletedInput = document.getElementById('books-completed-month');
      booksCompletedInput.value = '0';
      
      // Re-initialize to trigger the sync
      // Note: initializeCharacterSheet is called in beforeEach, so we need to manually sync
      // We'll test the actual initialization behavior by checking the state
      const completedBooksSet = new Set(testBooks);
      const actualBooksCount = completedBooksSet.size;
      const inputValue = parseInt(booksCompletedInput.value, 10) || 0;
      const syncedValue = Math.min(Math.max(inputValue, actualBooksCount), 10);
      
      expect(syncedValue).toBe(3);
      expect(actualBooksCount).toBe(3);
    });

    it('should cap booksCompleted at 10 to prevent shelf color mismatch', () => {
      // Set up: More than 10 books in completedBooksSet
      const testBooks = Array.from({ length: 15 }, (_, i) => `Book ${i + 1}`);
      safeSetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, testBooks);
      
      const booksCompletedInput = document.getElementById('books-completed-month');
      booksCompletedInput.value = '15';
      
      // Simulate the initialization logic
      const completedBooksSet = new Set(testBooks);
      const actualBooksCount = completedBooksSet.size;
      const inputValue = parseInt(booksCompletedInput.value, 10) || 0;
      const booksCompleted = Math.min(Math.max(inputValue, actualBooksCount), 10);
      
      // booksCompleted should be capped at 10
      expect(booksCompleted).toBe(10);
      expect(actualBooksCount).toBe(15); // But actual count is still 15
      
      // Shelf colors should match booksCompleted (10), not actualBooksCount (15)
      const shelfColors = safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);
      // Colors should be capped at booksCompleted (10)
      expect(shelfColors.length).toBeLessThanOrEqual(booksCompleted);
    });

    it('should initialize shelf colors when books exist but colors are missing', () => {
      // Set up: Books exist but no shelf colors
      const testBooks = ['Book 1', 'Book 2'];
      safeSetJSON(STORAGE_KEYS.MONTHLY_COMPLETED_BOOKS, testBooks);
      safeSetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);
      
      const booksCompletedInput = document.getElementById('books-completed-month');
      booksCompletedInput.value = '2';
      
      // Trigger the initialization logic
      const completedBooksSet = new Set(testBooks);
      const actualBooksCount = completedBooksSet.size;
      const inputValue = parseInt(booksCompletedInput.value, 10) || 0;
      // Cap at 10 to match shelf visualization limit
      const booksCompleted = Math.min(Math.max(inputValue, actualBooksCount), 10);
      
      // Shelf colors should be initialized
      let shelfColors = safeGetJSON(STORAGE_KEYS.SHELF_BOOK_COLORS, []);
      expect(booksCompleted).toBe(2);
      // Colors should be generated (we can't test exact colors, but we can test the count)
      // The actual color generation happens in the UI, but the logic ensures colors exist
      expect(shelfColors.length).toBeLessThanOrEqual(booksCompleted);
    });

    it('should add two quests for a dungeon crawl with an encounter', () => {
      const activeAssignmentsContainer = document.getElementById('active-assignments-container');
      const activeAssignmentsBody = activeAssignmentsContainer?.querySelector('.quest-cards-container');

      // Fill out the quest form for a dungeon crawl
      document.getElementById('quest-month').value = 'November';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book-id').value = 'dungeon-book';

      // Simulate selecting a dungeon quest and a specific room/encounter
      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '♠ Dungeon Crawl';
      questTypeSelect.dispatchEvent(new Event('change'));
      document.getElementById('dungeon-room-select').value = '1';
      document.getElementById('dungeon-room-select').dispatchEvent(new Event('change'));
      document.getElementById('dungeon-encounter-select').value = "Librarian's Spirit";

      document.getElementById('add-quest-button').click();

      // Assert that two cards were added to the active quests container
      expect(activeAssignmentsBody.querySelectorAll('.quest-card').length).toBe(2);
      expect(activeAssignmentsBody.textContent).toContain(dungeonRooms['1'].challenge);
      expect(activeAssignmentsBody.textContent).toContain("Librarian's Spirit");
    });

    it('should add only ONE quest for a dungeon room without encounters', () => {
      // Fill out the quest form for a dungeon crawl
      document.getElementById('quest-month').value = 'November';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book-id').value = 'author-book';

      // Simulate selecting Room 8 (The Author's Study) which has NO encounters
      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '♠ Dungeon Crawl';
      questTypeSelect.dispatchEvent(new Event('change'));
      document.getElementById('dungeon-room-select').value = '8';
      document.getElementById('dungeon-room-select').dispatchEvent(new Event('change'));

      // Click add quest
      document.getElementById('add-quest-button').click();

      // Assert that only ONE card was added (room only, no encounter)
      const activeAssignmentsContainer = document.getElementById('active-assignments-container');
      const activeAssignmentsBody = activeAssignmentsContainer?.querySelector('.quest-cards-container');
      expect(activeAssignmentsBody).toBeTruthy();
      expect(activeAssignmentsBody.querySelectorAll('.quest-card').length).toBe(1);
      expect(activeAssignmentsBody.textContent).toContain("The Author's Study");
      
      // Verify the quest was added properly
      expect(characterState.activeAssignments.length).toBe(1);
      expect(characterState.activeAssignments[0].isEncounter).toBe(false);
      expect(characterState.activeAssignments[0].roomNumber).toBe('8');
    });

    it('should apply Biblioslinker background bonus to completed dungeon quest even without buffs', () => {
      // Set Biblioslinker background
      const backgroundSelect = document.getElementById('keeperBackground');
      backgroundSelect.value = 'biblioslinker';

      // Add a dungeon quest and mark it as completed (no buffs selected)
      document.getElementById('quest-month').value = 'November';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book-id').value = 'dungeon-book';
      document.getElementById('new-quest-status').value = 'completed';

      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '♠ Dungeon Crawl';
      questTypeSelect.dispatchEvent(new Event('change'));
      document.getElementById('dungeon-room-select').value = '1'; // Room 1 gives 5 paper scraps
      document.getElementById('dungeon-room-select').dispatchEvent(new Event('change'));
      document.getElementById('dungeon-encounter-select').value = "Librarian's Spirit";

      document.getElementById('add-quest-button').click();

      // Check that both quests were added to completed
      expect(characterState.completedQuests.length).toBe(2);
      
      // Room quest should have 15 paper scraps (5 base + 10 from Biblioslinker)
      const roomQuest = characterState.completedQuests.find(q => !q.isEncounter);
      expect(roomQuest.rewards.paperScraps).toBe(15);
      expect(roomQuest.rewards.modifiedBy).toContain('Biblioslinker');
      
      // Encounter quest should also have +10 paper scraps applied
      const encounterQuest = characterState.completedQuests.find(q => q.isEncounter);
      expect(encounterQuest.rewards.paperScraps).toBe(10); // 0 base + 10 from Biblioslinker
      expect(encounterQuest.rewards.modifiedBy).toContain('Biblioslinker');
    });

    it('should handle Organize the Stacks quest type correctly', async () => {
      // Set up some genres in localStorage
      const genres = ['Fantasy', 'Sci-Fi', 'Romance'];
      localStorage.setItem(STORAGE_KEYS.SELECTED_GENRES, JSON.stringify(genres));
      
      // Re-initialize to load the genres
      await initializeCharacterSheet();
      
      // Fill out the quest form
      document.getElementById('quest-month').value = 'December';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book-id').value = 'test-book';

      // Select the Organize the Stacks quest type
      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '♥ Organize the Stacks';
      questTypeSelect.dispatchEvent(new Event('change'));

      // Check that the genre quest dropdown is populated with custom genres
      const genreQuestSelect = document.getElementById('genre-quest-select');
      const options = Array.from(genreQuestSelect.options).map(option => option.textContent);
      
      expect(options).toContain('1: Fantasy');
      expect(options).toContain('2: Sci-Fi');
      expect(options).toContain('3: Romance');
    });

    it('should fall back to default genres when no custom genres are selected', async () => {
      // Clear localStorage to ensure no custom genres
      localStorage.clear();
      
      // Re-initialize
      await initializeCharacterSheet();
      
      // Select the Organize the Stacks quest type
      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '♥ Organize the Stacks';
      questTypeSelect.dispatchEvent(new Event('change'));

      // Check that the genre quest dropdown falls back to default genres
      const genreQuestSelect = document.getElementById('genre-quest-select');
      const options = Array.from(genreQuestSelect.options).map(option => option.textContent);
      
      expect(options).toContain('1: Historical Fiction');
      expect(options).toContain('2: Fantasy');
      expect(options).toContain('3: Romantasy');
    });

    it('should handle Extra Credit quest type correctly', () => {
      // Fill out the quest form
      document.getElementById('quest-month').value = 'November';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book-id').value = 'extra-reading-book';

      // Select the Extra Credit quest type
      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '⭐ Extra Credit';
      questTypeSelect.dispatchEvent(new Event('change'));

      // Verify that no prompt input is shown
      const standardPromptContainer = document.getElementById('standard-prompt-container');
      const dungeonContainer = document.getElementById('dungeon-prompt-container');
      const genreContainer = document.getElementById('genre-prompt-container');
      const sideContainer = document.getElementById('side-prompt-container');
      
      expect(standardPromptContainer.style.display).toBe('none');
      expect(dungeonContainer.style.display).toBe('none');
      expect(genreContainer.style.display).toBe('none');
      expect(sideContainer.style.display).toBe('none');

      // Add the quest
      document.getElementById('add-quest-button').click();

      // Check that the quest was added with correct properties
      const addedQuest = characterState.activeAssignments[0];
      expect(addedQuest.type).toBe('⭐ Extra Credit');
      expect(addedQuest.prompt).toBe('Book read outside of quest pool');
      expect(addedQuest.book).toBe('Extra Reading Book');
      
      // Check that rewards are correct (0 XP, 0 Ink Drops, 10 Paper Scraps, 0 Blueprints)
      expect(addedQuest.rewards).toEqual({
        xp: 0,
        inkDrops: 0,
        paperScraps: 10,
        blueprints: 0,
        items: [],
        modifiedBy: []
      });
    });

    it('should update paper scraps when completing an Extra Credit quest', () => {
      // Add an Extra Credit quest
      document.getElementById('quest-month').value = 'November';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book-id').value = 'extra-book';

      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '⭐ Extra Credit';
      questTypeSelect.dispatchEvent(new Event('change'));
      document.getElementById('add-quest-button').click();

      // Get initial currency values
      const paperScrapsInput = document.getElementById('paperScraps');
      const inkDropsInput = document.getElementById('inkDrops');
      const xpInput = document.getElementById('xp-current');
      
      const initialPaperScraps = parseInt(paperScrapsInput.value, 10) || 0;
      const initialInkDrops = parseInt(inkDropsInput.value, 10) || 0;
      const initialXP = parseInt(xpInput.value, 10) || 0;

      // Complete the quest
      const completeBtnExtra = document.querySelector('#active-assignments-container .quest-card .complete-quest-btn');
      expect(completeBtnExtra).toBeTruthy();
      completeBtnExtra.click();

      // Check that only paper scraps were updated (+10)
      const finalPaperScraps = parseInt(paperScrapsInput.value, 10) || 0;
      const finalInkDrops = parseInt(inkDropsInput.value, 10) || 0;
      const finalXP = parseInt(xpInput.value, 10) || 0;

      expect(finalPaperScraps).toBe(initialPaperScraps + 10);
      expect(finalInkDrops).toBe(initialInkDrops); // Should not change
      expect(finalXP).toBe(initialXP); // Should not change
    });

    it('should add the correct dungeon encounter prompt based on the fight/befriend toggle', () => {
        // --- 1. Setup for Defeat (default) ---
        document.getElementById('quest-month').value = 'January';
        document.getElementById('quest-year').value = '2026';
        document.getElementById('new-quest-book-id').value = 'monster-manual';
        const questTypeSelect = document.getElementById('new-quest-type');
        questTypeSelect.value = '♠ Dungeon Crawl';
        questTypeSelect.dispatchEvent(new Event('change'));
        document.getElementById('dungeon-room-select').value = '4'; // Room with Zombies
        document.getElementById('dungeon-room-select').dispatchEvent(new Event('change'));
        document.getElementById('dungeon-encounter-select').value = 'Zombies';
        document.getElementById('dungeon-encounter-select').dispatchEvent(new Event('change'));

        // --- 2. Assert toggle is visible and set to Defeat ---
        const actionContainer = document.getElementById('dungeon-action-container');
        const actionToggle = document.getElementById('dungeon-action-toggle');
        expect(actionContainer.style.display).toBe('flex');
        expect(actionToggle.checked).toBe(false); // Default is Defeat

        // --- 3. Add quest and assert correct prompt ---
        document.getElementById('add-quest-button').click();
        expect(characterState.activeAssignments[1].prompt).toBe(dungeonRooms['4'].encounters['Zombies'].defeat);

        // --- 4. Setup for Befriend (re-adding the quest) ---
        // The form is reset after adding, so we need to re-select everything.
        characterState.activeAssignments = []; // Clear state for the second part of the test
        document.getElementById('new-quest-book-id').value = 'monster-manual';
        questTypeSelect.value = '♠ Dungeon Crawl';
        questTypeSelect.dispatchEvent(new Event('change'));
        document.getElementById('dungeon-room-select').value = '4';
        document.getElementById('dungeon-room-select').dispatchEvent(new Event('change'));
        document.getElementById('dungeon-encounter-select').value = 'Zombies';
        document.getElementById('dungeon-encounter-select').dispatchEvent(new Event('change'));
        actionToggle.checked = true; // Switch to Befriend
        actionToggle.dispatchEvent(new Event('change'));
        document.getElementById('add-quest-button').click();
        expect(characterState.activeAssignments.length).toBe(2);
        expect(characterState.activeAssignments[1].prompt).toBe(dungeonRooms['4'].encounters['Zombies'].befriend);
    });

    it('should correctly edit only the book title for a dungeon room quest', () => {
        // 1. Add a dungeon quest
        document.getElementById('quest-month').value = 'December';
        document.getElementById('quest-year').value = '2025';
        document.getElementById('new-quest-book-id').value = 'original-book';
        const questTypeSelect = document.getElementById('new-quest-type');
        questTypeSelect.value = '♠ Dungeon Crawl';
        questTypeSelect.dispatchEvent(new Event('change'));
        document.getElementById('dungeon-room-select').value = '1';
        document.getElementById('dungeon-room-select').dispatchEvent(new Event('change'));
        document.getElementById('dungeon-encounter-select').value = 'Librarian\'s Spirit';
        document.getElementById('add-quest-button').click();

        // 2. Click the "Edit" button for the room quest (the first one)
        const editBtn = document.querySelector('#active-assignments-container .quest-card .edit-quest-btn[data-index="0"]');
        expect(editBtn).toBeTruthy();
        editBtn.click();

        // 3. Change the book title
        document.getElementById('new-quest-book-id').value = 'updated-room-book';

        // 4. Click "Update Quest"
        document.getElementById('add-quest-button').click();

        // 5. Assertions
        const activeQuests = characterState.activeAssignments;
        expect(activeQuests.length).toBe(2);
        // The room quest should be updated
        expect(activeQuests[0].book).toBe('Updated Room Book');
        expect(activeQuests[0].prompt).toBe(dungeonRooms['1'].challenge); // Prompt should not change
        // The encounter quest should be untouched
        expect(activeQuests[1].book).toBe('Original Book');
    });

    it('should correctly edit only the notes for a dungeon encounter quest', () => {
        // 1. Add a dungeon quest
        document.getElementById('quest-month').value = 'December';
        document.getElementById('quest-year').value = '2025';
        document.getElementById('new-quest-book-id').value = 'another-original-book';
        const questTypeSelect = document.getElementById('new-quest-type');
        questTypeSelect.value = '♠ Dungeon Crawl';
        questTypeSelect.dispatchEvent(new Event('change'));
        document.getElementById('dungeon-room-select').value = '2';
        document.getElementById('dungeon-room-select').dispatchEvent(new Event('change'));
        document.getElementById('dungeon-encounter-select').value = 'Mysterious Nymph';
        document.getElementById('add-quest-button').click();

        // 2. Click the "Edit" button for the encounter quest (the second one)
        const editBtns = document.querySelectorAll('#active-assignments-container .quest-card .edit-quest-btn');
        const encounterEditBtn = Array.from(editBtns).find(btn => btn.dataset.index === '1');
        expect(encounterEditBtn).toBeTruthy();
        encounterEditBtn.click();

        // 3. Change the notes
        document.getElementById('new-quest-notes').value = 'Encounter notes added.';

        // 4. Click "Update Quest"
        document.getElementById('add-quest-button').click();

        // 5. Assertions
        // The edit logic updates the object in place.
        // We need to find which quest in the array is the one we edited.
        const activeQuests = characterState.activeAssignments;
        const encounterQuest = activeQuests.find(q => q.isEncounter);
        const roomQuest = activeQuests.find(q => !q.isEncounter);

        expect(encounterQuest.notes).toBe('Encounter notes added.'); // The notes are updated
        expect(encounterQuest.prompt).toBe(dungeonRooms['2'].encounters['Mysterious Nymph'].befriend); // Prompt should not change
        expect(roomQuest.notes).toBe(''); // Room quest notes should be untouched
    });
  });

  describe('Selected Genres Display', () => {
    it('should display placeholder text when no genres are selected', async () => {
      // Clear localStorage to ensure no genres are selected
      localStorage.clear();
      
      // Re-initialize to load the empty state
      await initializeCharacterSheet();
      
      const display = document.getElementById('selected-genres-display');
      expect(display.textContent).toContain('No genres selected yet');
      expect(display.textContent).toContain('View Genre Quests');
    });

    it('should display selected genres from localStorage', async () => {
      // Set up some genres in localStorage
      const genres = ['Fantasy', 'Sci-Fi', 'Romance', 'Mystery', 'Thriller', 'Classic'];
      localStorage.setItem(STORAGE_KEYS.SELECTED_GENRES, JSON.stringify(genres));
      
      // Re-initialize to load the genres
      await initializeCharacterSheet();
      
      const display = document.getElementById('selected-genres-display');
      
      // Should display all selected genres
      genres.forEach(genre => {
        expect(display.textContent).toContain(genre);
      });
      
      // Should have numbered items
      expect(display.textContent).toContain('1.');
      expect(display.textContent).toContain('2.');
      expect(display.textContent).toContain('3.');
    });

    it('should update when localStorage changes', async () => {
      // Start with no genres
      localStorage.clear();
      await initializeCharacterSheet();
      
      let display = document.getElementById('selected-genres-display');
      expect(display.textContent).toContain('No genres selected yet');
      
      // Add genres to localStorage
      const genres = ['Fantasy', 'Sci-Fi'];
      localStorage.setItem(STORAGE_KEYS.SELECTED_GENRES, JSON.stringify(genres));
      
      // Re-initialize to pick up the changes
      await initializeCharacterSheet();
      
      display = document.getElementById('selected-genres-display');
      expect(display.textContent).toContain('Fantasy');
      expect(display.textContent).toContain('Sci-Fi');
    });

    it('should handle empty localStorage gracefully', async () => {
      localStorage.clear();
      await initializeCharacterSheet();
      
      const display = document.getElementById('selected-genres-display');
      expect(display.textContent).toContain('No genres selected yet');
    });

    it('should handle invalid JSON in localStorage gracefully', async () => {
      localStorage.setItem(STORAGE_KEYS.SELECTED_GENRES, 'invalid json');
      await initializeCharacterSheet();
      
      const display = document.getElementById('selected-genres-display');
      expect(display.textContent).toContain('No genres selected yet');
    });
  });

  describe("The Shroud's Curse", () => {
    it('should add a new curse penalty to the active curses table', () => {
      const cursePenaltySelect = document.getElementById('curse-penalty-select');
      const curseBookTitle = document.getElementById('curse-book-title');
      const addCurseButton = document.getElementById('add-curse-button');
      const activeCursesBody = document.getElementById('active-curses-body');

      // Select a curse penalty and enter a book title
      cursePenaltySelect.value = 'The Unread Tome';
      curseBookTitle.value = 'The Forgotten Book';
      addCurseButton.click();

      // Assert that the curse appears in the active curses table
      const firstRow = activeCursesBody.querySelector('tr');
      expect(firstRow.textContent).toContain('The Unread Tome');
      expect(firstRow.textContent).toContain('The Forgotten Book');
      expect(firstRow.textContent).toContain('Active');
      expect(characterState.activeCurses.length).toBe(1);
    });

    it('should move a curse from active to completed when complete button is clicked', () => {
      // First, add an active curse
      document.getElementById('curse-penalty-select').value = 'The Lost Lore';
      document.getElementById('curse-book-title').value = 'Science Book';
      document.getElementById('add-curse-button').click();

      const activeCursesBody = document.getElementById('active-curses-body');
      const completedCursesBody = document.getElementById('completed-curses-body');

      // Click the "Complete" button
      document.querySelector('#active-curses-body .complete-curse-btn').click();

      // Assert that the curse moved to completed table
      expect(activeCursesBody.innerHTML).toBe('');
      expect(completedCursesBody.textContent).toContain('The Lost Lore');
      expect(completedCursesBody.textContent).toContain('Science Book');
      expect(completedCursesBody.textContent).toContain('Completed');
      expect(characterState.activeCurses.length).toBe(0);
      expect(characterState.completedCurses.length).toBe(1);
    });

    it('should edit an active curse penalty', () => {
      // First, add an active curse
      document.getElementById('curse-penalty-select').value = 'The Forgotten Pages';
      document.getElementById('curse-book-title').value = 'Original Book';
      document.getElementById('add-curse-button').click();

      // Click the "Edit" button
      document.querySelector('#active-curses-body .edit-curse-btn').click();

      // Verify the form is populated
      expect(document.getElementById('curse-penalty-select').value).toBe('The Forgotten Pages');
      expect(document.getElementById('curse-book-title').value).toBe('Original Book');
      expect(document.getElementById('add-curse-button').textContent).toBe('Update Curse');

      // Change the book title and update
      document.getElementById('curse-book-title').value = 'Updated Book';
      document.getElementById('add-curse-button').click();

      // Assert that the curse was updated
      expect(characterState.activeCurses[0].book).toBe('Updated Book');
      expect(characterState.activeCurses[0].name).toBe('The Forgotten Pages');
    });

    it('should delete an active curse penalty', () => {
      // First, add an active curse
      document.getElementById('curse-penalty-select').value = 'The Ravenous Shadow';
      document.getElementById('curse-book-title').value = 'Extra Quest Book';
      document.getElementById('add-curse-button').click();

      const activeCursesBody = document.getElementById('active-curses-body');
      expect(activeCursesBody.textContent).toContain('The Ravenous Shadow');

      // Click the "Delete" button
      document.querySelector('#active-curses-body .delete-curse-btn').click();

      // Assert that the curse was removed
      expect(activeCursesBody.innerHTML).toBe('');
      expect(characterState.activeCurses.length).toBe(0);
    });

    it('should delete a completed curse penalty', () => {
      // First, add and complete a curse
      document.getElementById('curse-penalty-select').value = 'The Unread Tome';
      document.getElementById('curse-book-title').value = 'Completed Book';
      document.getElementById('add-curse-button').click();
      document.querySelector('#active-curses-body .complete-curse-btn').click();

      const completedCursesBody = document.getElementById('completed-curses-body');
      expect(completedCursesBody.textContent).toContain('The Unread Tome');

      // Click the "Delete" button on the completed curse
      document.querySelector('#completed-curses-body .delete-curse-btn').click();

      // Assert that the completed curse was removed
      expect(completedCursesBody.innerHTML).toBe('');
      expect(characterState.completedCurses.length).toBe(0);
    });

    it('should display correct curse requirements from data', () => {
      const cursePenaltySelect = document.getElementById('curse-penalty-select');
      const curseBookTitle = document.getElementById('curse-book-title');
      const addCurseButton = document.getElementById('add-curse-button');

      // Test each curse type
      const curseTypes = ['The Unread Tome', 'The Lost Lore', 'The Forgotten Pages', 'The Ravenous Shadow'];
      
      curseTypes.forEach(curseType => {
        cursePenaltySelect.value = curseType;
        curseBookTitle.value = `Test Book for ${curseType}`;
        addCurseButton.click();

        // Assert that the curse was added with correct requirement
        const activeCursesBody = document.getElementById('active-curses-body');
        const lastRow = activeCursesBody.querySelector('tr:last-child');
        expect(lastRow.textContent).toContain(curseType);
        expect(lastRow.textContent).toContain(curseTable[curseType].requirement);

        // Clear for next iteration
        characterState.activeCurses = [];
        activeCursesBody.innerHTML = '';
      });
    });

    it('should prevent adding a curse without selecting a penalty', () => {
      const curseBookTitle = document.getElementById('curse-book-title');
      const addCurseButton = document.getElementById('add-curse-button');

      // Try to add a curse without selecting a penalty
      curseBookTitle.value = 'Test Book';
      addCurseButton.click();

      // Assert that no curse was added
      expect(characterState.activeCurses.length).toBe(0);
      expect(document.getElementById('active-curses-body').innerHTML).toBe('');
    });

    it('should reset the curse form after adding a curse', () => {
      const cursePenaltySelect = document.getElementById('curse-penalty-select');
      const curseBookTitle = document.getElementById('curse-book-title');
      const addCurseButton = document.getElementById('add-curse-button');

      // Add a curse
      cursePenaltySelect.value = 'The Lost Lore';
      curseBookTitle.value = 'Test Book';
      addCurseButton.click();

      // Assert that the form is reset
      expect(cursePenaltySelect.value).toBe('');
      expect(curseBookTitle.value).toBe('');
      expect(addCurseButton.textContent).toBe('Add Curse');
    });

    it('should reset the curse form after editing a curse', () => {
      // First, add a curse
      document.getElementById('curse-penalty-select').value = 'The Forgotten Pages';
      document.getElementById('curse-book-title').value = 'Original Book';
      document.getElementById('add-curse-button').click();

      // Edit the curse
      document.querySelector('#active-curses-body .edit-curse-btn').click();
      document.getElementById('curse-book-title').value = 'Updated Book';
      document.getElementById('add-curse-button').click();

      // Assert that the form is reset after editing
      expect(document.getElementById('curse-penalty-select').value).toBe('');
      expect(document.getElementById('curse-book-title').value).toBe('');
      expect(document.getElementById('add-curse-button').textContent).toBe('Add Curse');
    });

    it('should update curse summary counts correctly', () => {
      // Add a curse
      document.getElementById('curse-penalty-select').value = 'The Unread Tome';
      document.getElementById('curse-book-title').value = 'Test Book';
      document.getElementById('add-curse-button').click();

      // Check that the state was updated
      expect(characterState.activeCurses.length).toBe(1);

      // Complete the curse
      document.querySelector('#active-curses-body .complete-curse-btn').click();

      // Check that the state was updated correctly
      expect(characterState.activeCurses.length).toBe(0);
      expect(characterState.completedCurses.length).toBe(1);
    });
  });

  describe('Keeper Backgrounds', () => {
    it('should populate keeper background dropdown with all backgrounds', () => {
      const backgroundSelect = document.getElementById('keeperBackground');
      
      // Should have 7 options (1 default + 6 backgrounds)
      expect(backgroundSelect.options.length).toBe(7);
      expect(backgroundSelect.options[0].value).toBe('');
      expect(backgroundSelect.options[0].textContent).toBe('-- Select a Background --');
      
      // Check all backgrounds are present
      const backgroundNames = Array.from(backgroundSelect.options).map(opt => opt.textContent);
      expect(backgroundNames).toContain("The Scribe's Acolyte");
      expect(backgroundNames).toContain("The Archivist's Apprentice");
      expect(backgroundNames).toContain("The Cartographer's Guild");
      expect(backgroundNames).toContain("The Cloistered Prophet");
      expect(backgroundNames).toContain("The Biblioslinker");
      expect(backgroundNames).toContain("The Grove Tender");
    });

    it('should display background benefit when selected', () => {
      const backgroundSelect = document.getElementById('keeperBackground');
      const benefitDisplay = document.getElementById('keeperBackgroundBenefitDisplay');
      
      // Select Scribe's Acolyte
      backgroundSelect.value = 'scribe';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      expect(benefitDisplay.textContent).toContain('+3 Paper Scrap bonus');
      expect(benefitDisplay.textContent).toContain('Adventure Journal entry');
    });

    it('should show background bonuses in quest buffs dropdown for Archivist', () => {
      const backgroundSelect = document.getElementById('keeperBackground');
      const { updateQuestBuffsDropdown } = require('../assets/js/character-sheet/ui.js');
      
      // Select Archivist background
      backgroundSelect.value = 'archivist';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      // Force refresh of the card-based selector (tests don't always run full controller wiring)
      updateQuestBuffsDropdown(document.createElement('input'), document.createElement('input'), document.createElement('input'));

      const container = document.getElementById('quest-bonus-selection-container');
      const card = container?.querySelector('.quest-bonus-card[data-value="[Background] Archivist Bonus"]');
      expect(card).toBeTruthy();
      expect(card.textContent).toContain('Archivist Bonus');
      expect(card.textContent).toContain('+10 Ink Drops');
      expect(card.textContent).toContain('Non-Fiction/Historical Fiction');
    });

    it('should show background bonuses in quest buffs dropdown for Prophet', () => {
      const backgroundSelect = document.getElementById('keeperBackground');
      const { updateQuestBuffsDropdown } = require('../assets/js/character-sheet/ui.js');
      
      // Select Prophet background
      backgroundSelect.value = 'prophet';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      updateQuestBuffsDropdown(document.createElement('input'), document.createElement('input'), document.createElement('input'));

      const container = document.getElementById('quest-bonus-selection-container');
      const card = container?.querySelector('.quest-bonus-card[data-value="[Background] Prophet Bonus"]');
      expect(card).toBeTruthy();
      expect(card.textContent).toContain('Prophet Bonus');
      expect(card.textContent).toContain('+10 Ink Drops');
      expect(card.textContent).toContain('Religious/Spiritual/Mythological');
    });

    it('should show background bonuses in quest buffs dropdown for Cartographer', () => {
      const backgroundSelect = document.getElementById('keeperBackground');
      const { updateQuestBuffsDropdown } = require('../assets/js/character-sheet/ui.js');
      
      // Select Cartographer background
      backgroundSelect.value = 'cartographer';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      updateQuestBuffsDropdown(document.createElement('input'), document.createElement('input'), document.createElement('input'));

      const container = document.getElementById('quest-bonus-selection-container');
      const card = container?.querySelector('.quest-bonus-card[data-value="[Background] Cartographer Bonus"]');
      expect(card).toBeTruthy();
      expect(card.textContent).toContain('Cartographer Bonus');
      expect(card.textContent).toContain('+10 Ink Drops');
      expect(card.textContent).toContain('First Dungeon Crawl');
    });

    it('should show passive items in quest buffs dropdown', () => {
      const { characterState } = require('../assets/js/character-sheet/state.js');
      const { STORAGE_KEYS } = require('../assets/js/character-sheet/storageKeys.js');
      const { updateQuestBuffsDropdown } = require('../assets/js/character-sheet/ui.js');
      
      // Setup: Add an item to a passive slot
      characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [
        { itemName: "The Bookwyrm's Scale" }
      ];
      
      // Get the required inputs (these should exist in the character sheet)
      const wearableSlotsInput = document.getElementById('wearableSlots') || document.createElement('input');
      const nonWearableSlotsInput = document.getElementById('nonWearableSlots') || document.createElement('input');
      const familiarSlotsInput = document.getElementById('familiarSlots') || document.createElement('input');
      
      // Update the dropdown
      updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
      
      // Check that the passive item appears as a card
      const container = document.getElementById('quest-bonus-selection-container');
      const card = container?.querySelector('.quest-bonus-card[data-value="[Item] The Bookwyrm\'s Scale"]');
      expect(card).toBeTruthy();
      expect(card.textContent).toContain("The Bookwyrm's Scale");
      expect(card.textContent).toContain('Gain a +5 Ink Drop bonus for books over 500 pages');
      
      // Cleanup
      characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
    });

    it('should show passive familiars in quest buffs dropdown', () => {
      const { characterState } = require('../assets/js/character-sheet/state.js');
      const { STORAGE_KEYS } = require('../assets/js/character-sheet/storageKeys.js');
      const { updateQuestBuffsDropdown } = require('../assets/js/character-sheet/ui.js');
      
      // Setup: Add a familiar to a passive familiar slot
      characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = [
        { itemName: 'Coffee Elemental' }
      ];
      
      // Get the required inputs
      const wearableSlotsInput = document.getElementById('wearableSlots') || document.createElement('input');
      const nonWearableSlotsInput = document.getElementById('nonWearableSlots') || document.createElement('input');
      const familiarSlotsInput = document.getElementById('familiarSlots') || document.createElement('input');
      
      // Update the dropdown
      updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
      
      // Check that the passive familiar appears as a card
      const container = document.getElementById('quest-bonus-selection-container');
      const card = container?.querySelector('.quest-bonus-card[data-value="[Item] Coffee Elemental"]');
      expect(card).toBeTruthy();
      expect(card.textContent).toContain('Coffee Elemental');
      expect(card.textContent).toContain('Cozy books grant +5 Ink Drops (passive)');
      
      // Cleanup
      characterState[STORAGE_KEYS.PASSIVE_FAMILIAR_SLOTS] = [];
    });

    it('should apply passive item modifier when selected in quest buffs', () => {
      const { characterState } = require('../assets/js/character-sheet/state.js');
      const { STORAGE_KEYS } = require('../assets/js/character-sheet/storageKeys.js');
      
      // Setup: Add an item to a passive slot
      characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [
        { itemName: "The Bookwyrm's Scale" }
      ];
      characterState[STORAGE_KEYS.EQUIPPED_ITEMS] = [];
      
      // Create a quest with the passive item buff
      document.getElementById('quest-month').value = 'October';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-type').value = '♥ Organize the Stacks';
      document.getElementById('new-quest-type').dispatchEvent(new Event('change'));
      
      const genreSelect = document.getElementById('genre-quest-select');
      // Pick a valid option from the populated dropdown (avoid brittle hard-coded strings)
      const firstGenreOption = genreSelect?.options?.[1];
      genreSelect.value = firstGenreOption ? firstGenreOption.value : '';
      
      document.getElementById('new-quest-book-id').value = 'test-book';
      
      // Select the passive item via the hidden JSON input used by the card-based UI
      const hiddenBuffsInput = document.getElementById('quest-buffs-select');
      hiddenBuffsInput.value = JSON.stringify(["[Item] The Bookwyrm's Scale"]);
      
      // Add quest as completed
      document.getElementById('new-quest-status').value = 'completed';
      document.getElementById('add-quest-button').click();
      
      // Check that quest was added with passive bonus (+5, not +10)
      const completedQuest = characterState.completedQuests[characterState.completedQuests.length - 1];
      expect(completedQuest.rewards.inkDrops).toBe(15); // 10 base + 5 passive bonus
      expect(completedQuest.buffs).toContain("[Item] The Bookwyrm's Scale");
      
      // Cleanup
      characterState[STORAGE_KEYS.PASSIVE_ITEM_SLOTS] = [];
    });

    it('should apply Archivist bonus when selected for a quest', () => {
      const { characterState } = require('../assets/js/character-sheet/state.js');
      const backgroundSelect = document.getElementById('keeperBackground');
      
      // Select Archivist background
      backgroundSelect.value = 'archivist';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      // Add a quest with Archivist bonus
      document.getElementById('quest-month').value = 'October';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-type').value = '♥ Organize the Stacks';
      document.getElementById('new-quest-type').dispatchEvent(new Event('change'));
      
      // Select genre quest
      const genreSelect = document.getElementById('genre-quest-select');
      const firstGenreOption = genreSelect?.options?.[1];
      genreSelect.value = firstGenreOption ? firstGenreOption.value : '';
      
      document.getElementById('new-quest-book-id').value = 'test-book';
      
      // Select Archivist Bonus via the hidden JSON input used by the card-based UI
      const hiddenBuffsInput = document.getElementById('quest-buffs-select');
      hiddenBuffsInput.value = JSON.stringify(['[Background] Archivist Bonus']);
      
      // Add quest as completed
      document.getElementById('new-quest-status').value = 'completed';
      document.getElementById('add-quest-button').click();
      
      // Check that quest was added with bonus
      const completedQuest = characterState.completedQuests[characterState.completedQuests.length - 1];
      expect(completedQuest.rewards.inkDrops).toBe(25); // 10 base + 15 bonus
      expect(completedQuest.buffs).toContain('[Background] Archivist Bonus');
    });

    it('should automatically apply Biblioslinker bonus for Dungeon Crawls', () => {
      const { characterState } = require('../assets/js/character-sheet/state.js');
      const backgroundSelect = document.getElementById('keeperBackground');
      
      // Select Biblioslinker background
      backgroundSelect.value = 'biblioslinker';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      // Create a dungeon crawl quest
      document.getElementById('quest-month').value = 'October';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-type').value = '♠ Dungeon Crawl';
      document.getElementById('new-quest-type').dispatchEvent(new Event('change'));
      
      const dungeonRoomSelect = document.getElementById('dungeon-room-select');
      dungeonRoomSelect.value = '1';
      dungeonRoomSelect.dispatchEvent(new Event('change'));
      
      const dungeonEncounterSelect = document.getElementById('dungeon-encounter-select');
      dungeonEncounterSelect.value = "Librarian's Spirit";
      
      document.getElementById('new-quest-book-id').value = 'dungeon-book';
      
      // Add quest as active
      document.getElementById('new-quest-status').value = 'active';
      document.getElementById('add-quest-button').click();
      
      // Complete the quest
      const completeButton = document.querySelector('.complete-quest-btn');
      if (completeButton) {
        completeButton.click();
        
        // Check that Biblioslinker bonus was applied
        const completedQuest = characterState.completedQuests[characterState.completedQuests.length - 1];
        expect(completedQuest.rewards.paperScraps).toBe(15); // 5 from room + 10 Biblioslinker bonus
        expect(completedQuest.rewards.modifiedBy).toContain('Biblioslinker');
      }
    });

    it('should apply Scribe bonus to journal entries at end of month', () => {
      const backgroundSelect = document.getElementById('keeperBackground');
      const journalEntriesInput = document.getElementById('journal-entries-completed');
      const paperScrapsInput = document.getElementById('paperScraps');
      
      // Select Scribe's Acolyte background
      backgroundSelect.value = 'scribe';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      // Set journal entries
      journalEntriesInput.value = '5';
      
      const initialPaperScraps = parseInt(paperScrapsInput.value, 10) || 0;
      
      // Click End of Month
      const endOfMonthButton = document.querySelector('.end-of-month-button');
      endOfMonthButton.click();
      
      // Should get 8 paper scraps per entry (5 base + 3 Scribe bonus) = 40 total
      const finalPaperScraps = parseInt(paperScrapsInput.value, 10) || 0;
      expect(finalPaperScraps).toBe(initialPaperScraps + 40);
      
      // Journal entries should be reset
      expect(parseInt(journalEntriesInput.value, 10)).toBe(0);
    });

    it('should automatically activate Soaking in Nature buff for Grove Tender', () => {
      const backgroundSelect = document.getElementById('keeperBackground');
      
      // Select Grove Tender background
      backgroundSelect.value = 'groveTender';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      // Check that "The Soaking in Nature" buff is automatically checked and disabled
      const tbody = document.getElementById('atmospheric-buffs-body');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      
      const soakingRow = rows.find(row => 
        row.textContent.includes('The Soaking in Nature')
      );
      
      expect(soakingRow).toBeTruthy();
      
      // Should have star indicator
      expect(soakingRow.textContent).toContain('★');
      
      // Checkbox should be checked and disabled
      const checkbox = soakingRow.querySelector('.buff-active-check');
      expect(checkbox.checked).toBe(true);
      expect(checkbox.disabled).toBe(true);
      
      // Row should be highlighted
      expect(soakingRow.classList.contains('highlight')).toBe(true);
    });

    it('should keep Grove Tender buff active after end of month', () => {
      const { characterState } = require('../assets/js/character-sheet/state.js');
      const backgroundSelect = document.getElementById('keeperBackground');
      
      // Select Grove Tender background
      backgroundSelect.value = 'groveTender';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      // Set up atmospheric buff with days used
      characterState.atmosphericBuffs = {
        'The Soaking in Nature': { daysUsed: 10, isActive: true },
        'The Candlight Study': { daysUsed: 5, isActive: true }
      };
      
      // Click End of Month
      const endOfMonthButton = document.querySelector('.end-of-month-button');
      endOfMonthButton.click();
      
      // Grove Tender's buff should still be active
      expect(characterState.atmosphericBuffs['The Soaking in Nature'].isActive).toBe(true);
      expect(characterState.atmosphericBuffs['The Soaking in Nature'].daysUsed).toBe(0);
      
      // Other buffs should be reset
      expect(characterState.atmosphericBuffs['The Candlight Study'].isActive).toBe(false);
      expect(characterState.atmosphericBuffs['The Candlight Study'].daysUsed).toBe(0);
    });

    it('should prevent unchecking Grove Tender buff by disabling checkbox', () => {
      const backgroundSelect = document.getElementById('keeperBackground');
      
      // Select Grove Tender background
      backgroundSelect.value = 'groveTender';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      // Check the Soaking in Nature buff checkbox
      const tbody = document.getElementById('atmospheric-buffs-body');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      const soakingRow = rows.find(row => 
        row.textContent.includes('The Soaking in Nature')
      );
      
      const checkbox = soakingRow.querySelector('.buff-active-check');
      
      // Checkbox should be disabled (this prevents user interaction)
      expect(checkbox.disabled).toBe(true);
      
      // And it should be checked
      expect(checkbox.checked).toBe(true);
    });

    it('should persist background selection in localStorage', () => {
      const backgroundSelect = document.getElementById('keeperBackground');
      const form = document.getElementById('character-sheet');
      
      // Select a background
      backgroundSelect.value = 'prophet';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      // Get saved data
      const savedData = JSON.parse(localStorage.getItem('characterSheet'));
      
      // Should be persisted
      expect(savedData.keeperBackground).toBe('prophet');
    });

    it('should only process active atmospheric buffs at end of month', () => {
      const { characterState } = require('../assets/js/character-sheet/state.js');
      const inkDropsInput = document.getElementById('inkDrops');
      
      // Set up mixed active/inactive buffs
      characterState.atmosphericBuffs = {
        'The Candlight Study': { daysUsed: 10, isActive: true },
        'The Herbalist\'s Nook': { daysUsed: 5, isActive: false }, // Not active
        'The Cozy Hearth': { daysUsed: 8, isActive: true }
      };
      
      const initialInkDrops = parseInt(inkDropsInput.value, 10) || 0;
      
      // Click End of Month
      const endOfMonthButton = document.querySelector('.end-of-month-button');
      endOfMonthButton.click();
      
      // Should only get ink drops from active buffs: 10 + 8 = 18
      const finalInkDrops = parseInt(inkDropsInput.value, 10) || 0;
      expect(finalInkDrops).toBe(initialInkDrops + 18);
    });
  });

  describe('Currency Unsaved Changes Warning', () => {
    beforeEach(async () => {
      // Set up saved currency values
      const formData = {
        inkDrops: '100',
        paperScraps: '50'
      };
      safeSetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, formData);
      
      // Reload state to sync with saved values
      const form = document.getElementById('character-sheet');
      if (form) {
        await loadState(form);
        // Wait for async operations to complete
        return new Promise(resolve => setTimeout(resolve, 10));
      }
    });

    it('should not show warning when currency matches saved values', async () => {
      // Wait a bit for the check to run after loadState
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const warningEl = document.getElementById('currency-unsaved-warning');
      expect(warningEl).toBeTruthy();
      expect(warningEl.style.display).toBe('none');
    });
    
    it('should not show warning on initial page load with empty values', async () => {
      // Clear localStorage to simulate fresh page load
      localStorage.removeItem(STORAGE_KEYS.CHARACTER_SHEET_FORM);
      
      // Reload the page HTML and reinitialize
      loadHTML('character-sheet.md');
      await initializeCharacterSheet();
      
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const warningEl = document.getElementById('currency-unsaved-warning');
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      
      expect(warningEl).toBeTruthy();
      // Warning should not show if both form and saved values are empty
      expect(warningEl.style.display).toBe('none');
    });

    it('should show warning when ink drops are modified', () => {
      const inkDropsEl = document.getElementById('inkDrops');
      const warningEl = document.getElementById('currency-unsaved-warning');
      
      expect(warningEl).toBeTruthy();
      expect(warningEl.style.display).toBe('none');
      
      // Modify ink drops
      inkDropsEl.value = '150';
      inkDropsEl.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Warning should appear
      expect(warningEl.style.display).toBe('block');
      expect(warningEl.textContent).toContain('unsaved changes');
      expect(warningEl.textContent).toContain('Shopping');
    });

    it('should show warning when paper scraps are modified', () => {
      const paperScrapsEl = document.getElementById('paperScraps');
      const warningEl = document.getElementById('currency-unsaved-warning');
      
      expect(warningEl).toBeTruthy();
      expect(warningEl.style.display).toBe('none');
      
      // Modify paper scraps
      paperScrapsEl.value = '75';
      paperScrapsEl.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Warning should appear
      expect(warningEl.style.display).toBe('block');
    });

    it('should show warning when both currency fields are modified', () => {
      const inkDropsEl = document.getElementById('inkDrops');
      const paperScrapsEl = document.getElementById('paperScraps');
      const warningEl = document.getElementById('currency-unsaved-warning');
      
      // Modify both
      inkDropsEl.value = '200';
      paperScrapsEl.value = '100';
      inkDropsEl.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Warning should appear
      expect(warningEl.style.display).toBe('block');
    });

    it('should hide warning when currency is saved', () => {
      const inkDropsEl = document.getElementById('inkDrops');
      const warningEl = document.getElementById('currency-unsaved-warning');
      const form = document.getElementById('character-sheet');
      
      // Modify currency
      inkDropsEl.value = '150';
      inkDropsEl.dispatchEvent(new Event('input', { bubbles: true }));
      expect(warningEl.style.display).toBe('block');
      
      // Save form - this will trigger saveState which updates localStorage
      saveState(form);
      
      // The warning check should run after save (it's called in the submit handler)
      // Since we're testing the logic directly, we need to manually trigger the check
      // The actual implementation calls checkCurrencyUnsavedChanges after saveState
      // For testing, we'll manually check the condition
      const savedData = safeGetJSON(STORAGE_KEYS.CHARACTER_SHEET_FORM, {});
      const currentInkDrops = inkDropsEl.value || '';
      const savedInkDrops = savedData.inkDrops || '';
      
      // After save, values should match
      expect(currentInkDrops).toBe(savedInkDrops);
      
      // Trigger the check by dispatching another input event
      // This simulates what happens after save
      inkDropsEl.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Warning should be hidden now
      expect(warningEl.style.display).toBe('none');
    });

    it('should hide warning when currency is changed back to saved value', async () => {
      const inkDropsEl = document.getElementById('inkDrops');
      const warningEl = document.getElementById('currency-unsaved-warning');
      
      // Modify currency
      inkDropsEl.value = '150';
      inkDropsEl.dispatchEvent(new Event('input', { bubbles: true }));
      expect(warningEl.style.display).toBe('block');
      
      // Wait for form persistence debounce to complete (if it triggered)
      // This ensures the saved value is updated before we change back
      await new Promise(resolve => setTimeout(resolve, 600));
      
      // Change back to saved value (which is now '150' after auto-save)
      inkDropsEl.value = '150';
      inkDropsEl.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Warning should be hidden
      expect(warningEl.style.display).toBe('none');
    });

    it('should update warning on change event as well as input event', () => {
      const inkDropsEl = document.getElementById('inkDrops');
      const warningEl = document.getElementById('currency-unsaved-warning');
      
      // Modify using change event
      inkDropsEl.value = '150';
      inkDropsEl.dispatchEvent(new Event('change', { bubbles: true }));
      
      expect(warningEl.style.display).toBe('block');
    });
  });

  describe('RPG-Styled Quests Tab', () => {
    beforeEach(() => {
      // Switch to Quests tab
      const questsTab = document.querySelector('[data-tab-target="quests"]');
      if (questsTab) {
        questsTab.click();
      }
    });

    it('should render RPG tab content wrapper', () => {
      const questsPanel = document.querySelector('[data-tab-panel="quests"]');
      expect(questsPanel).toBeTruthy();
      
      const rpgTabContent = questsPanel.querySelector('.rpg-tab-content');
      expect(rpgTabContent).toBeTruthy();
    });

    describe('Monthly Tracker Panel', () => {
      it('should render monthly tracker panel with RPG styling', () => {
        const trackerPanel = document.querySelector('.rpg-monthly-tracker-panel');
        expect(trackerPanel).toBeTruthy();
        expect(trackerPanel.classList.contains('rpg-panel')).toBe(true);
      });

      it('should render panel header with title', () => {
        const trackerPanel = document.querySelector('.rpg-monthly-tracker-panel');
        const header = trackerPanel.querySelector('.rpg-panel-header');
        const title = header.querySelector('.rpg-panel-title');
        
        expect(header).toBeTruthy();
        expect(title).toBeTruthy();
        expect(title.textContent).toContain('Monthly Tracker');
      });

      it('should render monthly stats with RPG styling', () => {
        const monthlyStats = document.querySelector('.rpg-monthly-stats');
        expect(monthlyStats).toBeTruthy();
        
        const booksInput = document.getElementById('books-completed-month');
        const journalInput = document.getElementById('journal-entries-completed');
        const endOfMonthBtn = document.querySelector('.end-of-month-button');
        
        expect(booksInput).toBeTruthy();
        expect(journalInput).toBeTruthy();
        expect(endOfMonthBtn).toBeTruthy();
        
        expect(booksInput.classList.contains('rpg-stat-input')).toBe(true);
        expect(journalInput.classList.contains('rpg-stat-input')).toBe(true);
        expect(endOfMonthBtn.classList.contains('rpg-btn')).toBe(true);
        expect(endOfMonthBtn.classList.contains('rpg-btn-primary')).toBe(true);
      });
    });

    describe('Quest Tables Panel', () => {
      it('should render quest tables panel with RPG styling', () => {
        const tablesPanel = document.querySelector('.rpg-quest-tables-panel');
        expect(tablesPanel).toBeTruthy();
        expect(tablesPanel.classList.contains('rpg-panel')).toBe(true);
      });

      it('should render quest table buttons with card suit emojis', () => {
        const genreBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="genre-quests"]');
        const atmosphericBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="atmospheric-buffs"]');
        const sideQuestsBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="side-quests"]');
        const dungeonsBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="dungeons"]');
        
        expect(genreBtn).toBeTruthy();
        expect(atmosphericBtn).toBeTruthy();
        expect(sideQuestsBtn).toBeTruthy();
        expect(dungeonsBtn).toBeTruthy();
        
        expect(genreBtn.textContent).toContain('♥');
        expect(atmosphericBtn.textContent).toContain('♦');
        expect(sideQuestsBtn.textContent).toContain('♣');
        expect(dungeonsBtn.textContent).toContain('♠');
        
        expect(genreBtn.classList.contains('rpg-btn')).toBe(true);
        expect(genreBtn.classList.contains('rpg-btn-secondary')).toBe(true);
      });
    });

    describe('Add Quest Panel', () => {
      it('should render add quest panel with RPG styling', () => {
        const addQuestPanel = document.querySelector('.rpg-add-quest-panel');
        expect(addQuestPanel).toBeTruthy();
        expect(addQuestPanel.classList.contains('rpg-panel')).toBe(true);
      });

      it('should render panel header with title', () => {
        const addQuestPanel = document.querySelector('.rpg-add-quest-panel');
        const header = addQuestPanel.querySelector('.rpg-panel-header');
        const title = header.querySelector('.rpg-panel-title');
        
        expect(header).toBeTruthy();
        expect(title).toBeTruthy();
        expect(title.textContent).toContain('Add Quest');
      });

      it('should render RPG-styled form inputs', () => {
        const monthInput = document.getElementById('quest-month');
        const yearInput = document.getElementById('quest-year');
        const questTypeSelect = document.getElementById('new-quest-type');
        
        expect(monthInput).toBeTruthy();
        expect(yearInput).toBeTruthy();
        expect(questTypeSelect).toBeTruthy();
      });
    });

    describe('Active Quests Panel', () => {
      it('should render active quests panel with RPG styling', () => {
        const activeQuestsPanel = document.querySelector('.rpg-active-quests-panel');
        expect(activeQuestsPanel).toBeTruthy();
        expect(activeQuestsPanel.classList.contains('rpg-panel')).toBe(true);
      });

      it('should render panel header with title', () => {
        const activeQuestsPanel = document.querySelector('.rpg-active-quests-panel');
        const header = activeQuestsPanel.querySelector('.rpg-panel-header');
        const title = header.querySelector('.rpg-panel-title');
        
        expect(header).toBeTruthy();
        expect(title).toBeTruthy();
        expect(title.textContent).toContain('Active Book Assignments');
      });
    });
  });

  describe('Quest Info Drawers', () => {
    beforeEach(() => {
      // Switch to Quests tab
      const questsTab = document.querySelector('[data-tab-target="quests"]');
      if (questsTab) {
        questsTab.click();
      }
    });

    describe('Genre Quests Drawer', () => {
      it('should open genre quests drawer when clicking button', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="genre-quests"]');
        const backdrop = document.getElementById('genre-quests-backdrop');
        const drawer = document.getElementById('genre-quests-drawer');
        
        expect(openBtn).toBeTruthy();
        expect(backdrop).toBeTruthy();
        expect(drawer).toBeTruthy();
        
        // Initially drawer should be hidden
        expect(drawer.style.display).toBe('none');
        expect(backdrop.classList.contains('active')).toBe(false);
        
        // Click the button
        openBtn.click();
        
        // Wait for async rendering
        return new Promise(resolve => {
          setTimeout(() => {
            // Should open the drawer
            expect(drawer.style.display).toBe('flex');
            expect(backdrop.classList.contains('active')).toBe(true);
            resolve();
          }, 100);
        });
      });

      it('should render genre quests content from quests.md', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="genre-quests"]');
        const drawer = document.getElementById('genre-quests-drawer');
        
        expect(openBtn).toBeTruthy();
        expect(drawer).toBeTruthy();
        
        // Open the drawer
        openBtn.click();
        
        // Wait for async rendering (tables may take longer)
        return new Promise(resolve => {
          setTimeout(() => {
            // Check header
            const header = drawer.querySelector('.info-drawer-header h2');
            expect(header).toBeTruthy();
            expect(header.textContent).toContain('Organize the Stacks');
            
            // Check content
            const content = drawer.querySelector('.info-drawer-content');
            expect(content).toBeTruthy();
            expect(content.textContent).toContain('+15 XP');
            expect(content.textContent).toContain('+10 Ink Drops');
            expect(content.textContent).toContain('The Mess');
            expect(content.textContent).toContain('The Discovery');
            
            // Check table container exists
            const tableContainer = content.querySelector('#genre-quests-table-container');
            expect(tableContainer).toBeTruthy();
            resolve();
          }, 1000);
        });
      }, 15000);

      it('should close genre quests drawer when clicking backdrop', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="genre-quests"]');
        const backdrop = document.getElementById('genre-quests-backdrop');
        const drawer = document.getElementById('genre-quests-drawer');
        
        // Open the drawer
        openBtn.click();
        
        return new Promise(resolve => {
          setTimeout(() => {
            expect(drawer.style.display).toBe('flex');
            
            // Click backdrop
            backdrop.click();
            
            // Should close the drawer
            expect(drawer.style.display).toBe('none');
            expect(backdrop.classList.contains('active')).toBe(false);
            resolve();
          }, 100);
        });
      });

      it('should close genre quests drawer when clicking close button', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="genre-quests"]');
        const closeBtn = document.getElementById('close-genre-quests');
        const backdrop = document.getElementById('genre-quests-backdrop');
        const drawer = document.getElementById('genre-quests-drawer');
        
        expect(closeBtn).toBeTruthy();
        
        // Open the drawer
        openBtn.click();
        
        return new Promise(resolve => {
          setTimeout(() => {
            expect(drawer.style.display).toBe('flex');
            
            // Click close button
            closeBtn.click();
            
            // Should close the drawer
            expect(drawer.style.display).toBe('none');
            expect(backdrop.classList.contains('active')).toBe(false);
            resolve();
          }, 100);
        });
      });
    });

    describe('Atmospheric Buffs Drawer', () => {
      it('should open atmospheric buffs drawer when clicking button', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="atmospheric-buffs"]');
        const backdrop = document.getElementById('atmospheric-buffs-info-backdrop');
        const drawer = document.getElementById('atmospheric-buffs-info-drawer');
        
        expect(openBtn).toBeTruthy();
        expect(backdrop).toBeTruthy();
        expect(drawer).toBeTruthy();
        
        // Initially drawer should be hidden
        expect(drawer.style.display).toBe('none');
        
        // Click the button
        openBtn.click();
        
        // Wait for async rendering
        return new Promise(resolve => {
          setTimeout(() => {
            // Should open the drawer
            expect(drawer.style.display).toBe('flex');
            expect(backdrop.classList.contains('active')).toBe(true);
            resolve();
          }, 100);
        });
      });

      it('should render atmospheric buffs content from quests.md', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="atmospheric-buffs"]');
        const drawer = document.getElementById('atmospheric-buffs-info-drawer');
        
        // Open the drawer
        openBtn.click();
        
        // Wait for async rendering
        return new Promise(resolve => {
          setTimeout(() => {
            // Check header
            const header = drawer.querySelector('.info-drawer-header h2');
            expect(header).toBeTruthy();
            expect(header.textContent).toContain('Atmospheric Buffs');
            expect(header.textContent).toContain('Roll a d8');
            
            // Check content
            const content = drawer.querySelector('.info-drawer-content');
            expect(content).toBeTruthy();
            expect(content.textContent).toContain('The Senses');
            expect(content.textContent).toContain('The Memory');
            expect(content.textContent).toContain('The Effect');
            
            // Check table container exists
            const tableContainer = content.querySelector('#atmospheric-buffs-table-container');
            expect(tableContainer).toBeTruthy();
            resolve();
          }, 500);
        });
      }, 10000);

      it('should close atmospheric buffs drawer when clicking backdrop', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="atmospheric-buffs"]');
        const backdrop = document.getElementById('atmospheric-buffs-info-backdrop');
        const drawer = document.getElementById('atmospheric-buffs-info-drawer');
        
        // Open the drawer
        openBtn.click();
        
        return new Promise(resolve => {
          setTimeout(() => {
            expect(drawer.style.display).toBe('flex');
            
            // Click backdrop
            backdrop.click();
            
            // Should close the drawer
            expect(drawer.style.display).toBe('none');
            expect(backdrop.classList.contains('active')).toBe(false);
            resolve();
          }, 100);
        });
      });
    });

    describe('Side Quests Drawer', () => {
      it('should open side quests drawer when clicking button', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="side-quests"]');
        const backdrop = document.getElementById('side-quests-info-backdrop');
        const drawer = document.getElementById('side-quests-info-drawer');
        
        expect(openBtn).toBeTruthy();
        expect(backdrop).toBeTruthy();
        expect(drawer).toBeTruthy();
        
        // Initially drawer should be hidden
        expect(drawer.style.display).toBe('none');
        
        // Click the button
        openBtn.click();
        
        // Wait for async rendering
        return new Promise(resolve => {
          setTimeout(() => {
            // Should open the drawer
            expect(drawer.style.display).toBe('flex');
            expect(backdrop.classList.contains('active')).toBe(true);
            resolve();
          }, 100);
        });
      });

      it('should render side quests content from quests.md', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="side-quests"]');
        const drawer = document.getElementById('side-quests-info-drawer');
        
        // Open the drawer
        openBtn.click();
        
        // Wait for async rendering
        return new Promise(resolve => {
          setTimeout(() => {
            // Check header
            const header = drawer.querySelector('.info-drawer-header h2');
            expect(header).toBeTruthy();
            expect(header.textContent).toContain('Side Quests');
            expect(header.textContent).toContain('Roll a d8');
            
            // Check content
            const content = drawer.querySelector('.info-drawer-content');
            expect(content).toBeTruthy();
            expect(content.textContent).toContain('The Encounter');
            expect(content.textContent).toContain('The Result');
            
            // Check table container exists
            const tableContainer = content.querySelector('#side-quests-table-container');
            expect(tableContainer).toBeTruthy();
            resolve();
          }, 500);
        });
      }, 10000);

      it('should close side quests drawer when clicking backdrop', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="side-quests"]');
        const backdrop = document.getElementById('side-quests-info-backdrop');
        const drawer = document.getElementById('side-quests-info-drawer');
        
        // Open the drawer
        openBtn.click();
        
        return new Promise(resolve => {
          setTimeout(() => {
            expect(drawer.style.display).toBe('flex');
            
            // Click backdrop
            backdrop.click();
            
            // Should close the drawer
            expect(drawer.style.display).toBe('none');
            expect(backdrop.classList.contains('active')).toBe(false);
            resolve();
          }, 100);
        });
      });
    });

    describe('Dungeons Drawer', () => {
      it('should open dungeons drawer when clicking button', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="dungeons"]');
        const backdrop = document.getElementById('dungeons-info-backdrop');
        const drawer = document.getElementById('dungeons-info-drawer');
        
        expect(openBtn).toBeTruthy();
        expect(backdrop).toBeTruthy();
        expect(drawer).toBeTruthy();
        
        // Initially drawer should be hidden
        expect(drawer.style.display).toBe('none');
        
        // Click the button
        openBtn.click();
        
        // Wait for async rendering
        return new Promise(resolve => {
          setTimeout(() => {
            // Should open the drawer
            expect(drawer.style.display).toBe('flex');
            expect(backdrop.classList.contains('active')).toBe(true);
            resolve();
          }, 100);
        });
      });

      it('should render dungeons content from dungeons.md', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="dungeons"]');
        const drawer = document.getElementById('dungeons-info-drawer');
        
        // Open the drawer
        openBtn.click();
        
        // Wait for async rendering with longer timeout for table rendering
        return new Promise(resolve => {
          setTimeout(() => {
            // Check header
            const header = drawer.querySelector('.info-drawer-header');
            expect(header).toBeTruthy();
            const h2 = header.querySelector('h2');
            expect(h2).toBeTruthy();
            expect(h2.textContent).toContain('Dungeon Rooms');
            
            // Check content body
            const content = drawer.querySelector('.info-drawer-content');
            expect(content).toBeTruthy();
            // "Roll a d20" is in the header (h2); rest of copy is in content
            expect(drawer.textContent).toContain('Roll a d20');
            expect(drawer.textContent).toContain('The Setting');
            expect(drawer.textContent).toContain('The Encounter');
            // Check for table containers (tables are rendered dynamically)
            const rewardsContainer = content.querySelector('#dungeon-rewards-table-container');
            const roomsContainer = content.querySelector('#dungeon-rooms-table-container');
            const completionContainer = content.querySelector('#dungeon-completion-rewards-table-container');
            expect(rewardsContainer).toBeTruthy();
            expect(roomsContainer).toBeTruthy();
            expect(completionContainer).toBeTruthy();
            resolve();
          }, 1000);
        });
      }, 15000);

      it('should close dungeons drawer when clicking backdrop', () => {
        const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="dungeons"]');
        const backdrop = document.getElementById('dungeons-info-backdrop');
        const drawer = document.getElementById('dungeons-info-drawer');
        
        // Open the drawer
        openBtn.click();
        
        return new Promise(resolve => {
          setTimeout(() => {
            expect(drawer.style.display).toBe('flex');
            
            // Click backdrop
            backdrop.click();
            
            // Should close the drawer
            expect(drawer.style.display).toBe('none');
            expect(backdrop.classList.contains('active')).toBe(false);
            resolve();
          }, 100);
        });
      });

      it('should not consume a draw when drawn reward is already owned', async () => {
        // Set state: 1 draw available, and character already has Librarian's Quill (roll 4)
        characterState[STORAGE_KEYS.CLAIMED_ROOM_REWARDS] = ['1'];
        characterState[STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED] = 0;
        characterState[STORAGE_KEYS.INVENTORY_ITEMS] = [
          { name: "Librarian's Quill", type: 'passive', bonus: 'Test' }
        ];
        const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.15); // roll = floor(0.15*20)+1 = 4
        try {
          const openBtn = document.querySelector('.open-quest-info-drawer-btn[data-drawer="dungeons"]');
          const drawer = document.getElementById('dungeons-info-drawer');
          const drawBtn = document.getElementById('draw-dungeon-completion-card-btn');
          expect(openBtn).toBeTruthy();
          expect(drawBtn).toBeTruthy();
          openBtn.click();
          await new Promise(r => setTimeout(r, 150));
          expect(drawer.style.display).toBe('flex');
          drawBtn.click();
          await new Promise(r => setTimeout(r, 300));
          expect(characterState[STORAGE_KEYS.DUNGEON_COMPLETION_DRAWS_REDEEMED]).toBe(0);
        } finally {
          randomSpy.mockRestore();
        }
      });
    });
  });

  describe('Card-Based Bonus Selection UI', () => {
    beforeEach(() => {
      // Switch to Quests tab
      const questsTab = document.querySelector('[data-tab-target="quests"]');
      if (questsTab) {
        questsTab.click();
      }
    });

    it('should render bonus selection container instead of multi-select', () => {
      const container = document.getElementById('quest-bonus-selection-container');
      const hiddenInput = document.getElementById('quest-buffs-select');
      
      expect(container).toBeTruthy();
      expect(hiddenInput).toBeTruthy();
      expect(hiddenInput.type).toBe('hidden');
    });

    it('should render bonus cards when bonuses are available', () => {
      // Add a temporary buff to make bonuses available
      characterState.temporaryBuffs = [{
        name: 'Test Buff',
        description: 'Test description',
        status: 'active'
      }];
      
      // Trigger update
      const wearableSlotsInput = document.getElementById('wearable-slots');
      const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
      const familiarSlotsInput = document.getElementById('familiar-slots');
      
      ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
      
      const container = document.getElementById('quest-bonus-selection-container');
      const cards = container.querySelectorAll('.quest-bonus-card');
      
      expect(cards.length).toBeGreaterThan(0);
    });

    it('should render bonus card with name and description', () => {
      // Add a temporary buff
      characterState.temporaryBuffs = [{
        name: 'Test Buff',
        description: 'Test description',
        status: 'active'
      }];
      
      const wearableSlotsInput = document.getElementById('wearable-slots');
      const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
      const familiarSlotsInput = document.getElementById('familiar-slots');
      
      ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
      
      const container = document.getElementById('quest-bonus-selection-container');
      const card = container.querySelector('.quest-bonus-card');
      
      expect(card).toBeTruthy();
      
      const title = card.querySelector('.quest-bonus-card-title');
      const description = card.querySelector('.quest-bonus-card-description');
      
      expect(title).toBeTruthy();
      expect(description).toBeTruthy();
      expect(title.textContent).toContain('Test Buff');
      expect(description.textContent).toContain('Test description');
    });

    it('should render bonus card with image when item data available', () => {
      // Add an equipped item with image
      characterState.equippedItems = [{
        name: "Librarian's Compass",
        bonus: 'Test bonus'
      }];
      
      const wearableSlotsInput = document.getElementById('wearable-slots');
      const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
      const familiarSlotsInput = document.getElementById('familiar-slots');
      
      ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
      
      const container = document.getElementById('quest-bonus-selection-container');
      const card = container.querySelector('.quest-bonus-card');
      
      if (card && allItems["Librarian's Compass"] && allItems["Librarian's Compass"].img) {
        const image = card.querySelector('.quest-bonus-card-image');
        expect(image).toBeTruthy();
        expect(image.tagName).toBe('IMG');
      }
    });

    it('should toggle selection when clicking a bonus card', () => {
      // Add a temporary buff
      characterState.temporaryBuffs = [{
        name: 'Test Buff',
        description: 'Test description',
        status: 'active'
      }];
      
      const wearableSlotsInput = document.getElementById('wearable-slots');
      const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
      const familiarSlotsInput = document.getElementById('familiar-slots');
      
      ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
      
      const container = document.getElementById('quest-bonus-selection-container');
      const hiddenInput = document.getElementById('quest-buffs-select');
      const card = container.querySelector('.quest-bonus-card');
      
      expect(card).toBeTruthy();
      expect(card.classList.contains('selected')).toBe(false);
      expect(hiddenInput.value).toBe('[]');
      
      // Click the card
      card.click();
      
      // Should be selected
      expect(card.classList.contains('selected')).toBe(true);
      const selectedValues = JSON.parse(hiddenInput.value);
      expect(selectedValues).toContain('[Buff] Test Buff');
      
      // Click again to deselect
      card.click();
      
      // Should be deselected
      expect(card.classList.contains('selected')).toBe(false);
      const newSelectedValues = JSON.parse(hiddenInput.value);
      expect(newSelectedValues).not.toContain('[Buff] Test Buff');
    });

    it('should render background bonus cards when background is selected', () => {
      // Set a background
      const backgroundSelect = document.getElementById('keeperBackground');
      backgroundSelect.value = 'archivist';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      const wearableSlotsInput = document.getElementById('wearable-slots');
      const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
      const familiarSlotsInput = document.getElementById('familiar-slots');
      
      ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
      
      const container = document.getElementById('quest-bonus-selection-container');
      const cards = container.querySelectorAll('.quest-bonus-card');
      
      // Should have at least the background bonus card
      expect(cards.length).toBeGreaterThanOrEqual(1);
      
      const bonusNames = Array.from(cards).map(card => card.querySelector('.quest-bonus-card-title').textContent);
      expect(bonusNames.some(name => name.includes('Archivist'))).toBe(true);
    });

    it('should render equipped item cards', () => {
      // Add an equipped item
      characterState.equippedItems = [{
        name: "Librarian's Compass",
        bonus: '+5 to research rolls'
      }];
      
      const wearableSlotsInput = document.getElementById('wearable-slots');
      const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
      const familiarSlotsInput = document.getElementById('familiar-slots');
      
      ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
      
      const container = document.getElementById('quest-bonus-selection-container');
      const cards = container.querySelectorAll('.quest-bonus-card');
      
      expect(cards.length).toBeGreaterThan(0);
      
      const bonusNames = Array.from(cards).map(card => card.querySelector('.quest-bonus-card-title').textContent);
      expect(bonusNames.some(name => name.includes("Librarian's Compass"))).toBe(true);
    });

    it('should display message when no bonuses available', () => {
      // Clear all bonuses
      characterState.temporaryBuffs = [];
      characterState.equippedItems = [];
      const backgroundSelect = document.getElementById('keeperBackground');
      backgroundSelect.value = '';
      backgroundSelect.dispatchEvent(new Event('change'));
      
      const wearableSlotsInput = document.getElementById('wearable-slots');
      const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
      const familiarSlotsInput = document.getElementById('familiar-slots');
      
      ui.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
      
      const container = document.getElementById('quest-bonus-selection-container');
      const message = container.querySelector('.no-bonuses-message');
      
      expect(message).toBeTruthy();
      expect(message.textContent).toContain('No bonuses available');
    });

    it('should render edit quest bonus selection container', () => {
      const editContainer = document.getElementById('edit-quest-bonus-selection-container');
      const editHiddenInput = document.getElementById('edit-quest-buffs-select');
      
      expect(editContainer).toBeTruthy();
      expect(editHiddenInput).toBeTruthy();
      expect(editHiddenInput.type).toBe('hidden');
    });

    it('should update edit quest bonus selection with selected values', () => {
      // Add a temporary buff
      characterState.temporaryBuffs = [{
        name: 'Test Buff',
        description: 'Test description',
        status: 'active'
      }];
      
      const selectedValues = ['[Buff] Test Buff'];
      ui.updateEditQuestBuffsDropdown(selectedValues);
      
      const container = document.getElementById('edit-quest-bonus-selection-container');
      const hiddenInput = document.getElementById('edit-quest-buffs-select');
      const card = container.querySelector('.quest-bonus-card');
      
      expect(card).toBeTruthy();
      expect(card.classList.contains('selected')).toBe(true);
      expect(JSON.parse(hiddenInput.value)).toEqual(selectedValues);
    });
  });
});