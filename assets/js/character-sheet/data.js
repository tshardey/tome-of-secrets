export const xpLevels = {
    1: 100, 2: 250, 3: 500, 4: 1000, 5: 1750, 6: 2750, 7: 4000, 8: 5500, 9: 7500,
    10: 9750, 11: 12250, 12: 15000, 13: 18000, 14: 21500, 15: 25500, 16: 30000, 
    17: 35000, 18: 40500, 19: 47000, 20: "Max"
};

export const permanentBonuses = {
    3: "<strong>Atmospheric Forecaster:</strong> Before drawing your Monthly Quest Pool, you may roll for one additional Atmospheric Bonus and choose which one to apply (or none).",
    6: "<strong>Novice's Focus:</strong> You gain an additional +5 XP for every book completed that is 300 pages or more.",
    7: "<strong>Focused Atmosphere:</strong> All positive Ink Drop bonuses granted by an active Atmospheric Bonus are increased by +1 (usually resulting in a +2 bonus).",
    9: "<strong>Insightful Draw:</strong> When drawing your Monthly Quest Pool, you draw one extra quest card and then discard one card of your choice."
};

export const allItems = {
    "Librarian's Compass": { type: "Wearable", img: "assets/images/rewards/librarians-compass.png", bonus: "Earn a +20 Ink Drop bonus for any book by a new-to-you author." },
    "Amulet of Duality": { type: "Wearable", img: "assets/images/rewards/amulet-of-duality.png", bonus: "Earn a +15 Ink Drop bonus on books with multiple points of view or multiple narrators." },
    "Scatter Brain Scarab": { type: "Wearable", img: "assets/images/rewards/scatter-brain-scarab.png", bonus: "When equipped, gain a x3 Ink Drop bonus for reading three books at the same time." },
    "Cloak of the Story-Weaver": { type: "Wearable", img: "assets/images/rewards/cloak-of-the-story-weaver.png", bonus: "Earn a permanent +10 Ink Drop bonus for books that are part of a series." },
    "The Bookwyrm's Scale": { type: "Wearable", img: "assets/images/rewards/bookwyrms-scale.png", bonus: "For every book over 500 pages, gain a +10 Ink Drop bonus." },
    "Key of the Archive": { type: "Non-Wearable", img: "assets/images/rewards/key-of-the-archive.png", bonus: "Earn a +15 Ink Drop bonus on books where something is unlocked, either literally or figuratively." },
    "Tome of Potential": { type: "Non-Wearable", img: "assets/images/rewards/tome-of-potential.png", bonus: "Earn a x3 Ink Drop bonus for books over 400 pages." },
    "Librarian's Quill": { type: "Non-Wearable", img: "assets/images/rewards/librarians-quill.png", bonus: "Earn a permanent +2 Paper Scraps bonus for every book you journal about after finishing." },
    "Chalice of Restoration": { type: "Non-Wearable", img: "assets/images/rewards/chalice-of-restoration.png", bonus: "Once per month, you may use this item to remove a Worn Page penalty." },
    "Lantern of Foresight": { type: "Non-Wearable", img: "assets/images/rewards/lantern-of-foresight.png", bonus: "Once per month, you may re-roll a prompt or a die roll to get a new result, and you must keep the new result." },
    "The Scepter of Knowledge": { type: "Non-Wearable", img: "assets/images/rewards/scepter-of-knowledge.png", bonus: "Once per month, you may switch the genre of any quest you roll to Non-Fiction." },
    "Celestial Koi Fish": { type: "Familiar", img: "assets/images/rewards/celestial-koi-fish.png", bonus: "Once per month, you may use this familiar's insight to switch a genre-based quest (d6) to its opposing genre." },
    "Tome-Bound Cat": { type: "Familiar", img: "assets/images/rewards/tome-bound-cat.png", bonus: "When you choose an Atmospheric Buff for your reading session, earn a x2 Ink Drop bonus on the effect." },
    "Pocket Dragon": { type: "Familiar", img: "assets/images/rewards/pocket-dragon.png", bonus: "Earn a +20 Ink Drop bonus for books in a fantasy series." },
    "Garden Gnome": { type: "Familiar", img: "assets/images/rewards/garden-gnome.png", bonus: "Earn +1 Ink Drop on any day where you read outside in nature or in a plant filled room." },
    "Mystical Moth": { type: "Familiar", img: "assets/images/rewards/mystical-moth.png", bonus: "Earn +1 Ink Drop on nights when you read by lamplight." },
    "Page Sprite": { type: "Familiar", img: "assets/images/rewards/page-sprite.png", bonus: "Earn a x2 Ink Drop bonus on any book under 300 pages." }
};

export const schoolBenefits = {
    "Abjuration": "Once per month, when you would gain a Worn Page penalty, you may instead draw a card from the deck and choose a quest from that draw to complete.",
    "Divination": "Once per month, you may roll 2 dice instead of 1 for a Monthly Quest, and choose which result you want to use.",
    "Evocation": "Once per month, when battling a monster in a dungeon, you may choose to defeat it quickly by reading a short story or novella instead of a novel.",
    "Enchantment": "When you befriend a monster in a dungeon, you earn 1.5x the base XP for that quest.",
    "Conjuration": "When you complete a quest while your Familiar slot is equipped, you gain an additional +5 Ink Drops for each quest.",
    "Transmutation": "Once per month, you may transmute your currency. You can exchange 5 Ink Drops for 1 Paper Scrap, or 1 Paper Scrap for 5 Ink Drops."
};

export const sanctumBenefits = {
    "The Spire of Whispers": "Associated Buffs: Candle-lit Study, Cozy Hearth, Head in the Clouds. (Earn x2 Ink Drops from these buffs)",
    "The Verdant Athenaeum": "Associated Buffs: Herbalist's Nook, Soaking in Nature, Soundscape Spire. (Earn x2 Ink Drops from these buffs)",
    "The Sunken Archives": "Associated Buffs: Soundscape Spire, Wanderer's Path, Excavation. (Earn x2 Ink Drops from these buffs)"
};

export const masteryAbilities = {
    "Ward Against the Shroud": { school: "Abjuration", cost: 1, benefit: "Once per month, when you would gain a Worn Page penalty for an uncompleted quest, you may choose to completely negate it." },
    "Grand Dispelling": { school: "Abjuration", cost: 2, benefit: "Once per month, you may perform a powerful cleansing ritual. Remove all active Worn Page penalties you currently have." },
    "Flicker of Prophecy": { school: "Divination", cost: 1, benefit: "When rolling a d6 for a Genre Quest, you may choose to treat the result as one number higher or lower (e.g., a 2 can become a 1 or a 3)." },
    "Master of Fates": { school: "Divination", cost: 2, benefit: "Once per month, when establishing your Monthly Quest Pool, you may draw two additional cards." },
    "Quick Shot": { school: "Evocation", cost: 1, benefit: "The benefit of Evocation may now be used to complete any single dungeon room challenge with a short story, not just a monster encounter." },
    "Concussive Blast": { school: "Evocation", cost: 2, benefit: "When you use your Evocation benefit to complete a dungeon room challenge, the blast of power also completes a second prompt in the same room (if one exists)." },
    "Silver Tongue": { school: "Enchantment", cost: 1, benefit: "When you complete a Side Quest, you gain an additional +5 Paper Scraps." },
    "Irresistible Charm": { school: "Enchantment", cost: 2, benefit: "Once per month, you may choose to automatically succeed at befriending a monster without needing to read a book for the 'befriend' prompt." },
    "Empowered Bond": { school: "Conjuration", cost: 1, benefit: "The Ink Drop or Paper Scrap bonus granted by your equipped Familiar is permanently increased by +5." },
    "Echo Chamber": { school: "Conjuration", cost: 2, benefit: "You permanently unlock an additional Familiar slot on top of any Familiar slots you have already unlocked." },
    "Alchemic Focus": { school: "Transmutation", cost: 1, benefit: "You gain an additional +5 XP for every book you read outside of your monthly quest pool." },
    "Philosopher's Stone": { school: "Transmutation", cost: 2, benefit: "Once per month, you may sacrifice 50 XP to instantly gain 50 Ink Drops and 10 Paper Scraps." }
};