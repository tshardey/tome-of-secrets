import { getEncounterImageFilename } from '../assets/js/utils/encounterImageMap.js';

describe('encounterImageMap', () => {
  test('maps known special cases', () => {
    expect(getEncounterImageFilename("Librarian's Spirit")).toBe(
      'encounter-librarian-spirit.png'
    );
    // Filename includes a known typo: "mischevious"
    expect(getEncounterImageFilename('Mischievous Pixie')).toBe(
      'encounter-mischevious-pixie.png'
    );
    expect(getEncounterImageFilename('Zombies')).toBe('encounter-zombie.png');
  });

  test('derives filename from encounter name by slugifying', () => {
    expect(getEncounterImageFilename('Some Weird Encounter!!')).toBe(
      'encounter-some-weird-encounter.png'
    );
  });
});

