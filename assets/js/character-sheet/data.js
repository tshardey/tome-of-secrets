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
    "Abjuration": { description: "Cloaked in shimmering wards and whispered mantras of guardianship, Abjurers dedicate themselves to shielding the Grand Library from the Shroud. Their studies echo with protective charms etched into the very stones of their sanctums.", benefit: "Once per month, when you would gain a Worn Page penalty, you may instead draw a card from the deck and choose a quest from that draw to complete." },
    "Divination": { description: "Keepers of Divination peer into pools of ink and read the shimmer of futures hidden within the margins. Their foresight is prized, for they glimpse truths beyond the turning of a page.", benefit: "Once per month, you may roll 2 dice instead of 1 for a Monthly Quest, and choose which result you want to use." },
    "Evocation": { description: "Sparks dance from their fingertips as Evokers study in fire-lit halls, conjuring storms and flame from words alone. Their passion for raw power blazes with every tale they consume.", benefit: "Once per month, when battling a monster in a dungeon, you may choose to defeat it quickly by reading a short story or novella instead of a novel." },
    "Enchantment": { description: "With soft voices and subtle gestures, Enchanters weave influence not only over wandering spirits but over the books themselves, coaxing stories to reveal their hidden depths.", benefit: "When you befriend a monster in a dungeon, you earn 1.5x the base XP for that quest." },
    "Conjuration": { description: "Conjurers summon echoes of beings and places from other times, filling their sanctums with flickering companions and phantom libraries. Their craft ensures no story is ever truly lost.", benefit: "When you complete a quest while your Familiar slot is equipped, you gain an additional +5 Ink Drops for each quest." },
    "Transmutation": { description: "Focuses on the arcane art of alchemy, allowing the Keeper to shift the essence and value of their collected resources. You master the rare skill of converting one material into another, understanding that the value of ink and paper is fluid.", benefit: "Once per month, you may transmute your currency. You can exchange 5 Ink Drops for 1 Paper Scrap, or 1 Paper Scrap for 5 Ink Drops." }
};

export const atmosphericBuffs = {
    "The Candlight Study": { description: "Light a [scented] candle while you read." },
    "The Herbalist's Nook": { description: "Brew a special cup of tea or a hot beverage to enjoy with your book." },
    "The Soundscape Spire": { description: "Create a vibe with ambient music or a 'bookish vibe' video on YouTube." },
    "The Excavation": { description: "Clean and organize your reading space before you read." },
    "The Cozy Hearth": { description: "Sit by a fire, real or from a television." },
    "The Soaking in Nature": { description: "Read outside in the grass or in your garden." },
    "The Wanderer's Path": { description: "Read in a new place, either in your home or somewhere new entirely." },
    "Head in the Clouds": { description: "Read in a cozy, overstuffed chair, bed, or another favorite comfortable spot." }
};

export const sanctumBenefits = {
    "The Spire of Whispers": {
        description: "Rising endlessly into the clouds, this vast tower is filled with spiral staircases and high, arched windows. Whispers of half-read stories drift through the air, a chorus of encouragement and warning. It is a place of quiet study, candlelight, and the comfort of hearthfire.",
        benefit: "<strong>Associated Buffs:</strong> The Candlight Study, The Cozy Hearth, Head in the Clouds. (Earn x2 Ink Drops from these buffs)",
        associatedBuffs: ["The Candlight Study", "The Cozy Hearth", "Head in the Clouds"]
    },
    "The Verdant Athenaeum": {
        description: "Nestled within an enchanted forest, this living library sprawls with vines, glowing blossoms, and winding paths. Birds flit through the rafters, and every step seems to awaken the rustle of leaves eager to share their secrets. Here, wisdom is nurtured in the embrace of nature itself.",
        benefit: "<strong>Associated Buffs:</strong> The Herbalist's Nook, The Soaking in Nature, The Soundscape Spire. (Earn x2 Ink Drops from these buffs)",
        associatedBuffs: ["The Herbalist's Nook", "The Soaking in Nature", "The Soundscape Spire"]
    },
    "The Sunken Archives": {
        description: "Buried beneath dunes of shifting sand, this ancient library is a labyrinth of collapsed halls and half-submerged chambers. Scrolls crumble into dust, guarded by spectral archivists who watch intruders with owl-like intensity, reminiscent of Wan Shi Tong's eternal vigilance. The air is thick with the weight of forgotten knowledge, daring you to unearth it.",
        benefit: "<strong>Associated Buffs:</strong> The Soundscape Spire, The Wanderer's Path, The Excavation. (Earn x2 Ink Drops from these buffs)",
        associatedBuffs: ["The Soundscape Spire", "The Wanderer's Path", "The Excavation"]
    }
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

export const dungeonRooms = {
    "1": {
        challenge: "The Hall of Whispers: Read in a quiet space without music.",
        encounters: {
            "Librarian's Spirit": {
                befriend: "Librarian's Spirit: Read a book with a ghost-like being or a mystery."
            },
            "Will-o-wisps": {
                defeat: "Will-o-wisps: Read a book that involves fated destiny or a newly revealed path."
            }
        }
    },
    "2": {
        challenge: "The Glimmering Pools: Read a book with a beautiful or unique cover.",
        encounters: {
            "Mysterious Nymph": {
                befriend: "Mysterious Nymph: Read a book that explores allure or transformation."
            },
            "Mischievous Pixie": {
                befriend: "Mischievous Pixie: Read a book where a character discovers unexpected magic or hidden talents."
            }
        }
    },
    "3": {
        challenge: "The Lost Garden: Read a book with a magical garden or a hidden realm.",
        encounters: {
            "Dryad": {
                befriend: "Dryad: Read a book with a natural or wilderness setting."
            },
            "Treant": {
                befriend: "Treant: Read a book where things aren't what they seem."
            }
        }
    },
    "4": {
        challenge: "The Cursed Tome: Read a book with a curse or a dark theme.",
        encounters: {
            "Zombies": {
                defeat: "Zombies: Read a book that deals with themes of death, rebirth, or the afterlife.",
                befriend: "Zombies: Read a book where a character finds hope or humanity in a dark, hopeless situation."
            },
            "Banshee": {
                defeat: "Banshee: Read a book with a ghost-like being or a death theme.",
                befriend: "Banshee: Read a book with a character that finds a way to move on from a tragic event."
            }
        }
    },
    "5": {
        challenge: "The Archivist's Riddle: Read a book that has a mystery or secret at its core.",
        encounters: {
            "Tome-Bound Cat": {
                befriend: "Tome-Bound Cat: Read a book with a cozy or comforting vibe."
            },
            "Guardian Owl": {
                befriend: "Guardian Owl: Read a book that teaches you something new."
            }
        }
    },
    "6": {
        challenge: "The Starlit Observatory: Read a book with a cosmic or future setting.",
        encounters: {
            "Pocket Dragon": {
                befriend: "Pocket Dragon: Read a book with a dragon or a fire element."
            },
            "Glabrezu": {
                defeat: "Glabrezu: Read a book with a morally gray love interest or a deceptive character.",
                befriend: "Glabrezu: Read a book where power is the main theme."
            }
        }
    },
    "7": {
        challenge: "The Neglected Archives: Read a book with a ghost-like being or a death theme.",
        encounters: {
            "Banshee": {
                defeat: "Banshee: Read a book with a ghost-like being or a death theme.",
                befriend: "Banshee: Read a book where a character finds a way to move on from a tragic event."
            },
            "Vampire": {
                defeat: "Vampire: Read a book with an immortal or night-dwelling creature.",
                befriend: "Vampire: Read a book where desire or temptation plays a major role."
            }
        }
    },
    "8": {
        challenge: "The Author's Study: Read a book by the author you think used this study.",
        encounters: {} // This room has no sub-encounter
    },
    "9": {
        challenge: "The Endless Corridor: Read a book that is part of a series you have not started.",
        encounters: {
            "Cheerful Sprite": {
                befriend: "Cheerful Sprite: Read a book you've been putting off for a fun, easy-to-read, or relaxing read."
            },
            "Ooze": {
                defeat: "Ooze: Read a book with a character who overcomes a seemingly impossible obstacle."
            }
        }
    },
    "10": {
        challenge: "The Grand Gallery: Read a book you've had on your TBR for over a year.",
        encounters: {
            "Mystical Moth": {
                befriend: "Mystical Moth: Read a book with something hidden or nocturnal."
            },
            "Animated Armor": {
                defeat: "Animated Armor: Read a book with a foiled cover."
            }
        }
    },
    "11": {
        challenge: "The Shroud's Heart: Read a book you believe will be 5 stars.",
        encounters: {
            "Fomorian": {
                defeat: "Fomorian: Read a book containing a curse or a monster-like being.",
                befriend: "Fomorian: Read a book where the main character must accept a tragic flaw."
            },
            "Page Sprite": {
                befriend: "Page Sprite: Read a book that is 300 pages or less."
            }
        }
    },
    "12": {
        challenge: "The Mimic's Lair: Read a book that subverts a common trope.",
        encounters: {
            "Mimic": {
                defeat: "Mimic: Read a book that feels deceptive or has a major twist."
            }
        }
    }
};

export const genreQuests = {
    "1": "Historical Fiction: Read a book set in the past or with a historical figure as a character.",
    "2": "Fantasy: Read a book with magical creatures, settings, or a non-human protagonist.",
    "3": "Romantasy: Read a book with a magical system and/or a romantic plot.",
    "4": "Sci-Fi: Read a book set in the future or one with a morally gray main character.",
    "5": "Thriller: Read a book with a plot twist, deception, or hidden identity.",
    "6": "Classic: Read a classic novel you have not yet read."
};

export const sideQuests = {
    "1": "The Arcane Grimoire: Read the book on your TBR the longest.",
    "2": "The Blood Fury Tattoo: Read a book featuring a counter culture rebellion.",
    "3": "The Bag of Holding: Read a story with multiple POVs.",
    "4": "The Wandering Merchant's Request: Read a book featuring a journey.",
    "5": "The Glimmering Pools' Gift: Read a book about transformation.",
    "6": "The Chime of Opening: Read a book where a long-hidden truth is revealed.",
    "7": "The Scarecrow's Cornfield: Read a book with an unreliable narrator.",
    "8": "The Empty Shelf: Choose a book from your TBR you are most excited for."
};