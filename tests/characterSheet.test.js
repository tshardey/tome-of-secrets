/**
 * @jest-environment jsdom
 */
import { xpLevels, permanentBonuses, allItems, schoolBenefits, sideQuests } from '../assets/js/character-sheet/data.js';

// We will create the main character sheet script in a later step.
// For now, we can import it, assuming it will exist at this path.
import { initializeCharacterSheet } from '../assets/js/character-sheet.js';
import { characterState } from '../assets/js/character-sheet/state.js';

describe('Character Sheet', () => {
  beforeEach(() => {
    // Clear localStorage and reset the in-memory state before each test
    // This prevents state from one test leaking into another.
    localStorage.clear();
    characterState.inventoryItems = [];
    characterState.equippedItems = [];
    characterState.activeAssignments = [];
    characterState.completedQuests = [];

    // Load the character sheet HTML before each test
    loadHTML('character-sheet.md');

    // Initialize the event listeners and dynamic content
    // This function would be the entry point of your character sheet's JavaScript
    initializeCharacterSheet();
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
      expect(xpNeededInput.value).toBe(xpLevels[5].toString());
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

  describe('Monthly Tracker', () => {
    it('should add a new side quest to the active table', () => {
      const activeAssignmentsBody = document.getElementById('active-assignments-body');

      // Fill out the quest form
      document.getElementById('quest-month').value = 'October';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book').value = 'The Test Book';

      // Select the quest type to reveal the correct prompt dropdown
      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '♣ Side Quest';
      questTypeSelect.dispatchEvent(new Event('change'));

      // Select a prompt from the side quest dropdown
      document.getElementById('side-quest-select').value = sideQuests["1"];

      // Click the "Add Quest" button
      document.getElementById('add-quest-button').click();

      // Assert that the new quest appears in the active assignments table
      const firstRow = activeAssignmentsBody.querySelector('tr');
      expect(firstRow.textContent).toContain('October');
      expect(firstRow.textContent).toContain('The Test Book');
      expect(firstRow.textContent).toContain('The Arcane Grimoire');
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

      document.getElementById('new-quest-book').value = 'A Finished Story';
      document.getElementById('add-quest-button').click();

      // Click the "Complete" button on the active quest
      document.querySelector('#active-assignments-body .complete-quest-btn').click();

      // Assert that the quest is now in the completed table and the active table is empty
      expect(document.getElementById('completed-quests-body').textContent).toContain('A Finished Story');
      expect(document.getElementById('active-assignments-body').innerHTML).toBe('');
    });

    it('should add two quests for a dungeon crawl with an encounter', () => {
      const activeAssignmentsBody = document.getElementById('active-assignments-body');

      // Fill out the quest form for a dungeon crawl
      document.getElementById('quest-month').value = 'November';
      document.getElementById('quest-year').value = '2025';
      document.getElementById('new-quest-book').value = 'Dungeon Book';

      // Simulate selecting a dungeon quest and a specific room/encounter
      const questTypeSelect = document.getElementById('new-quest-type');
      questTypeSelect.value = '♠ Dungeon Crawl';
      questTypeSelect.dispatchEvent(new Event('change'));
      document.getElementById('dungeon-room-select').value = '1';
      document.getElementById('dungeon-room-select').dispatchEvent(new Event('change'));
      document.getElementById('dungeon-encounter-select').value = "Librarian's Spirit: Read a book with a ghost-like being or a mystery.";

      document.getElementById('add-quest-button').click();

      // Assert that two rows were added to the active quests table
      expect(activeAssignmentsBody.querySelectorAll('tr').length).toBe(2);
      expect(activeAssignmentsBody.textContent).toContain('The Hall of Whispers');
      expect(activeAssignmentsBody.textContent).toContain("Librarian's Spirit");
    });
  });
});