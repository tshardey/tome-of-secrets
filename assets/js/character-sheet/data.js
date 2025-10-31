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
    "Librarian's Compass": { 
        type: "Wearable", 
        img: "assets/images/rewards/librarians-compass.png", 
        bonus: "Earn a +20 Ink Drop bonus for any book by a new-to-you author.",
        rewardModifier: { inkDrops: 20 }
    },
    "Amulet of Duality": { 
        type: "Wearable", 
        img: "assets/images/rewards/amulet-of-duality.png", 
        bonus: "Earn a +15 Ink Drop bonus on books with multiple points of view or multiple narrators.",
        rewardModifier: { inkDrops: 15 }
    },
    "Scatter Brain Scarab": { 
        type: "Wearable", 
        img: "assets/images/rewards/scatter-brain-scarab.png", 
        bonus: "When equipped, gain a x3 Ink Drop bonus for reading three books at the same time.",
        rewardModifier: { inkDropsMultiplier: 3 }
    },
    "Cloak of the Story-Weaver": { 
        type: "Wearable", 
        img: "assets/images/rewards/cloak-of-the-story-weaver.png", 
        bonus: "Earn a permanent +10 Ink Drop bonus for books that are part of a series.",
        rewardModifier: { inkDrops: 10 }
    },
    "The Bookwyrm's Scale": { 
        type: "Wearable", 
        img: "assets/images/rewards/bookwyrms-scale.png", 
        bonus: "For every book over 500 pages, gain a +10 Ink Drop bonus.",
        rewardModifier: { inkDrops: 10 }
    },
    "Key of the Archive": { 
        type: "Non-Wearable", 
        img: "assets/images/rewards/key-of-the-archive.png", 
        bonus: "Earn a +15 Ink Drop bonus on books where something is unlocked, either literally or figuratively.",
        rewardModifier: { inkDrops: 15 }
    },
    "Tome of Potential": { 
        type: "Non-Wearable", 
        img: "assets/images/rewards/tome-of-potential.png", 
        bonus: "Earn a x3 Ink Drop bonus for books over 400 pages.",
        rewardModifier: { inkDropsMultiplier: 3 }
    },
    "Librarian's Quill": { 
        type: "Non-Wearable", 
        img: "assets/images/rewards/librarians-quill.png", 
        bonus: "Earn a permanent +2 Paper Scraps bonus for every book you journal about after finishing.",
        rewardModifier: { paperScraps: 2 }
    },
    "Chalice of Restoration": { 
        type: "Non-Wearable", 
        img: "assets/images/rewards/chalice-of-restoration.png", 
        bonus: "Once per month, you may use this item to remove a Worn Page penalty.",
        rewardModifier: {} // Utility item, no direct reward modifier
    },
    "Lantern of Foresight": { 
        type: "Non-Wearable", 
        img: "assets/images/rewards/lantern-of-foresight.png", 
        bonus: "Once per month, you may re-roll a prompt or a die roll to get a new result, and you must keep the new result.",
        rewardModifier: {} // Utility item, no direct reward modifier
    },
    "The Scepter of Knowledge": { 
        type: "Non-Wearable", 
        img: "assets/images/rewards/scepter-of-knowledge.png", 
        bonus: "Once per month, you may switch the genre of any quest you roll to Non-Fiction.",
        rewardModifier: {} // Utility item, no direct reward modifier
    },
    "Celestial Koi Fish": { 
        type: "Familiar", 
        img: "assets/images/rewards/celestial-koi-fish.png", 
        bonus: "Once per month, you may use this familiar's insight to switch a genre-based quest (d6) to its opposing genre.",
        rewardModifier: {} // Utility item, no direct reward modifier
    },
    "Tome-Bound Cat": { 
        type: "Familiar", 
        img: "assets/images/rewards/tome-bound-cat.png", 
        bonus: "When you choose an Atmospheric Buff for your reading session, earn a x2 Ink Drop bonus on the effect.",
        rewardModifier: {} // Applied to atmospheric buffs, not quests
    },
    "Pocket Dragon": { 
        type: "Familiar", 
        img: "assets/images/rewards/pocket-dragon.png", 
        bonus: "Earn a +20 Ink Drop bonus for books in a fantasy series.",
        rewardModifier: { inkDrops: 20 }
    },
    "Garden Gnome": { 
        type: "Familiar", 
        img: "assets/images/rewards/garden-gnome.png", 
        bonus: "Earn +1 Ink Drop on any day where you read outside in nature or in a plant filled room.",
        rewardModifier: { inkDrops: 1 }
    },
    "Mystical Moth": { 
        type: "Familiar", 
        img: "assets/images/rewards/mystical-moth.png", 
        bonus: "Earn +1 Ink Drop on nights when you read by lamplight.",
        rewardModifier: { inkDrops: 1 }
    },
    "Page Sprite": { 
        type: "Familiar", 
        img: "assets/images/rewards/page-sprite.png", 
        bonus: "Earn a x2 Ink Drop bonus on any book under 300 pages.",
        rewardModifier: { inkDropsMultiplier: 2 }
    }
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

export const keeperBackgrounds = {
    '': {
        name: 'None',
        description: 'No background selected.',
        benefit: 'None.'
    },
    'scribe': {
        name: "The Scribe's Acolyte",
        description: 'You spent your formative years copying manuscripts and illuminating texts. Your fingers are permanently stained with ink, but your understanding of the written word is profound.',
        benefit: 'Gain a permanent +3 Paper Scrap bonus every time you complete an Adventure Journal entry.'
    },
    'archivist': {
        name: "The Archivist's Apprentice",
        description: 'You were raised in the dust of history, cataloging artifacts and sorting brittle scrolls. You have an innate sense for separating fact from fiction and finding the truth in old lore.',
        benefit: 'Gain a +10 Ink Drop bonus any time you complete a quest by reading a book from the Non-Fiction or Historical Fiction genres.'
    },
    'cartographer': {
        name: "The Cartographer's Guild",
        description: 'You were trained to map the unknown, to chart the stars, and to find paths where none existed. The twisting, shifting halls of the Grand Library feel like a challenge, not a threat.',
        benefit: 'The first time you begin a Dungeon Crawl (draw a ♠) each month, you automatically gain +10 Ink Drops for mapping the territory.'
    },
    'prophet': {
        name: 'The Cloistered Prophet',
        description: 'You lived a life of quiet contemplation, dedicated to the old gods of knowledge and narrative. You see omens in the Shroud and hear whispers from the lost stories.',
        benefit: 'Gain a +10 Ink Drop bonus any time you complete a quest by reading a book with a religious, spiritual, or mythological premise.'
    },
    'biblioslinker': {
        name: 'The Biblioslinker',
        description: 'You used to "liberate" rare books from private collections. You know how to get into places you\'re not supposed to be and find things that are meant to stay hidden.',
        benefit: 'You know how to find the good stuff. Gain a permanent +3 Paper Scrap bonus every time you successfully complete a Dungeon Crawl (♠).'
    },
    'groveTender': {
        name: 'The Grove Tender',
        description: 'You tended one of the last living gardens, cultivating stories from seeds and roots. You understand the natural, creeping decay of the Shroud and how life persists.',
        benefit: 'Your connection to the natural world is constant. You always have The Soaking in Nature atmospheric buff active, earning +1 Ink Drop per day you read (or +2 Ink Drops per day if you chose The Verdant Athenaeum as your sanctum).'
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

export const dungeonRewards = {
    bookCompletion: { reward: "+15 XP", penalty: "-" },
    monster: { reward: "+30 XP", penalty: "-5 Ink Drops & -10 XP" },
    friendlyCreature: { reward: "+10 Ink Drops", penalty: "-" },
    familiar: { reward: "+5 Paper Scraps", penalty: "-" }
};

export const dungeonRooms = {
    "1": {
        name: "The Hall of Whispers",
        description: "Echoes of unread tales drift endlessly through this vaulted chamber. The walls hum with voices too faint to catch, yet heavy with longing.",
        challenge: "The Hall of Whispers: Read in a quiet space without music.",
        roomRewards: { xp: 0, inkDrops: 0, paperScraps: 5, items: [] },
        rollInstruction: "Roll a d4 to determine the encounter:",
        encountersDetailed: [
            {
                roll: "[1-2]",
                name: "Librarian's Spirit",
                type: "Friendly Creature",
                description: "A gentle ghost flickering with lantern light.",
                befriend: "Read a book with a ghost-like being or a mystery.",
                rewards: { xp: 0, inkDrops: 10, paperScraps: 0, items: [] }
            },
            {
                roll: "[3-4]",
                name: "Will-o-wisps",
                type: "Monster",
                description: "Glittering lights that lure you astray.",
                defeat: "Read a book that involves fated destiny or a newly revealed path.",
                rewards: { xp: 30, inkDrops: 0, paperScraps: 0, items: [] }
            }
        ],
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
        name: "The Glimmering Pools",
        description: "Shallow pools glow like liquid starlight, each ripple whispering a forgotten secret. Step wrong, and the ink clings like chains.",
        challenge: "The Glimmering Pools: Read a book with a beautiful or unique cover (+10 Ink Drops).",
        roomRewards: { xp: 0, inkDrops: 10, paperScraps: 0, items: [] },
        rollInstruction: "Roll a d4 to determine the encounter:",
        encountersDetailed: [
            {
                roll: "[1-2]",
                name: "Mysterious Nymph",
                type: "Friendly Creature",
                description: "Her laughter shimmers across the water.",
                befriend: "Read a book that explores allure or transformation. Roll even for Amulet of Duality, odd for Worn Page curse.",
                hasLink: true,
                link: { text: "Amulet of Duality", url: "{{ site.baseurl }}/rewards.html#amulet-of-duality" },
                rewards: { xp: 0, inkDrops: 10, paperScraps: 0, items: [] }
            },
            {
                roll: "[3-4]",
                name: "Mischievous Pixie",
                type: "Friendly Creature",
                description: "Flitting overhead, scattering glowing droplets.",
                befriend: "Read a book where a character discovers unexpected magic or hidden talents.",
                rewards: { xp: 0, inkDrops: 10, paperScraps: 0, items: [] }
            }
        ],
        encounters: {
            "Mysterious Nymph": {
                befriend: "Mysterious Nymph: Read a book that explores allure or transformation. Roll even for Amulet of Duality, odd for Worn Page curse."
            },
            "Mischievous Pixie": {
                befriend: "Mischievous Pixie: Read a book where a character discovers unexpected magic or hidden talents."
            }
        }
    },
    "3": {
        name: "The Lost Garden",
        description: "Trees and vines reclaim toppled shelves, their blossoms glowing faintly in the dark. Forgotten statues weep with moss.",
        challenge: "The Lost Garden: Read a book with a magical garden or a hidden realm.",
        roomRewards: { xp: 0, inkDrops: 10, paperScraps: 0, items: [] },
        rollInstruction: "Roll a d4 to determine the encounter:",
        encountersDetailed: [
            {
                roll: "[1-2]",
                name: "Dryad",
                type: "Friendly Creature",
                description: "Whispers secrets of roots and rivers.",
                befriend: "Read a book with a natural or wilderness setting.",
                rewards: { xp: 0, inkDrops: 10, paperScraps: 0, items: [] }
            },
            {
                roll: "[3-4]",
                name: "Treant",
                type: "Friendly Creature",
                description: "Slow and steady, branches heavy with books as fruit.",
                befriend: "Read a book where things aren't what they seem, or the setting is much more than it appears to be.",
                rewards: { xp: 0, inkDrops: 10, paperScraps: 0, items: [] }
            }
        ],
        encounters: {
            "Dryad": {
                befriend: "Dryad: Read a book with a natural or wilderness setting."
            },
            "Treant": {
                befriend: "Treant: Read a book where things aren't what they seem, or the setting is much more than it appears to be."
            }
        }
    },
    "4": {
        name: "The Cursed Tome",
        description: "A massive volume chained to a pedestal, its pages leaking mist and sorrow. The air grows cold with each breath.",
        challenge: "The Cursed Tome: Read a book with a curse or a dark theme.",
        roomRewards: { xp: 5, inkDrops: 0, paperScraps: 0, items: [] },
        rollInstruction: "Roll a d4 to determine the encounter:",
        encountersDetailed: [
            {
                roll: "[1-2]",
                name: "Zombies",
                type: "Monster",
                description: "Clawing free from the ink, groaning for stories unfinished.",
                defeat: "Read a book that deals with themes of death, rebirth, or the afterlife.",
                befriend: "Read a book where a character finds hope or humanity in a dark, hopeless situation.",
                rewards: { xp: 30, inkDrops: 0, paperScraps: 0, items: [] }
            },
            {
                roll: "[3-4]",
                name: "Banshee",
                type: "Monster",
                description: "Wails through the halls, scattering loose pages like autumn leaves.",
                defeat: "Read a book with a ghost-like being or a death theme.",
                befriend: "Read a book with a character that finds a way to move on from a tragic event.",
                rewards: { xp: 30, inkDrops: 0, paperScraps: 0, items: [] }
            }
        ],
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
        name: "The Archivist's Riddle",
        description: "A spectral figure waits, quill in hand, offering only riddles for passage. Its eyes gleam with the weight of endless catalogues.",
        challenge: "The Archivist's Riddle: Read a book that has a mystery or secret at its core (+5 XP).",
        roomRewards: { xp: 5, inkDrops: 0, paperScraps: 0, items: [] },
        rollInstruction: "Roll a d4 to determine the encounter:",
        encountersDetailed: [
            {
                roll: "[1-2]",
                name: "Tome-Bound Cat",
                type: "Familiar",
                description: "Purrs wisdom between riddles.",
                befriend: "Read a book with a cozy or comforting vibe.",
                hasLink: true,
                link: { text: "Tome-Bound Cat", url: "{{ site.baseurl }}/rewards.html#tome-bound-cat" },
                rewards: { xp: 0, inkDrops: 0, paperScraps: 5, items: [] }
            },
            {
                roll: "[3-4]",
                name: "Guardian Owl",
                type: "Friendly Creature",
                description: "Its feathers ink-black, gazing knowingly.",
                befriend: "Read a book that teaches you something new.",
                rewards: { xp: 0, inkDrops: 10, paperScraps: 0, items: [] }
            }
        ],
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
        name: "The Starlit Observatory",
        description: "A domed chamber where stars drift across the ceiling like a living sky. Telescopes of brass and crystal point toward unknown worlds.",
        challenge: "The Starlit Observatory: Read a book with a cosmic or future setting (+10 Ink Drops).",
        roomRewards: { xp: 0, inkDrops: 10, paperScraps: 0, items: [] },
        rollInstruction: "Roll a d4 to determine the encounter:",
        encountersDetailed: [
            {
                roll: "[1-2]",
                name: "Pocket Dragon",
                type: "Familiar",
                description: "Tiny but fierce, curling around an astrolabe.",
                befriend: "Read a book with a dragon or a fire element.",
                hasLink: true,
                link: { text: "Pocket Dragon", url: "{{ site.baseurl }}/rewards.html#pocket-dragon" },
                rewards: { xp: 0, inkDrops: 0, paperScraps: 5, items: [] }
            },
            {
                roll: "[3-4]",
                name: "Glabrezu",
                type: "Monster",
                description: "Towering and terrible, offering honeyed bargains.",
                defeat: "Read a book with a morally gray love interest or a deceptive character.",
                befriend: "Read a book where power is the main theme.",
                rewards: { xp: 30, inkDrops: 0, paperScraps: 0, items: [] }
            }
        ],
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
        name: "The Neglected Archives",
        description: "Stacks of dust-caked scrolls sag in forgotten alcoves, watched by shadowy eyes.",
        challenge: "The Neglected Archives: Read a book with a ghost-like being or a death theme.",
        roomRewards: { xp: 0, inkDrops: 10, paperScraps: 0, items: [] },
        rollInstruction: "Roll a d4 to determine the encounter:",
        encountersDetailed: [
            {
                roll: "[1-2]",
                name: "Banshee",
                type: "Monster",
                description: "Lingering over half-burned records.",
                defeat: "Read a book with a ghost-like being or a death theme.",
                befriend: "Read a book where a character finds a way to move on from a tragic event.",
                rewards: { xp: 30, inkDrops: 0, paperScraps: 0, items: [] }
            },
            {
                roll: "[3-4]",
                name: "Vampire",
                type: "Monster",
                description: "Rising from the dust with hunger and grace.",
                defeat: "Read a book with an immortal or night-dwelling creature.",
                befriend: "Read a book where desire or temptation plays a major role.",
                rewards: { xp: 30, inkDrops: 0, paperScraps: 0, items: [] }
            }
        ],
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
        name: "The Author's Study",
        description: "Candles gutter beside ink-stained desks, their wax frozen mid-drip. Drafts lie unfinished, quills snapped in haste.",
        challenge: "The Author's Study: Read a book by the author you think used this study. Optional journaling: describe whose study this might be.",
        roomRewards: { xp: 0, inkDrops: 0, paperScraps: 10, items: [] },
        encountersDetailed: [],
        encounters: {}
    },
    "9": {
        name: "The Endless Corridor",
        description: "Door after door stretches into eternity, each pulsing with unread stories. The echo of your steps threatens to never end.",
        challenge: "The Endless Corridor: Read a book that is part of a series you have not started.",
        roomRewards: { xp: 0, inkDrops: 15, paperScraps: 0, items: [] },
        rollInstruction: "Roll a d4 to determine the encounter:",
        encountersDetailed: [
            {
                roll: "[1-2]",
                name: "Cheerful Sprite",
                type: "Friendly Creature",
                description: "Darting from door to door.",
                befriend: "Read a book you've been putting off for a fun, easy-to-read, or relaxing read.",
                rewards: { xp: 0, inkDrops: 10, paperScraps: 0, items: [] }
            },
            {
                roll: "[3-4]",
                name: "Ooze",
                type: "Monster",
                description: "Slithering down the walls, devouring titles whole.",
                defeat: "Read a book with a character who overcomes a seemingly impossible obstacle.",
                rewards: { xp: 30, inkDrops: 0, paperScraps: 0, items: [] }
            }
        ],
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
        name: "The Grand Gallery",
        description: "Oil paintings leer from gilded frames, their subjects shifting when you look away.",
        challenge: "The Grand Gallery: Read a book you've had on your TBR for over a year.",
        roomRewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: ["Gilded Painting"] },
        rollInstruction: "Roll a d4 to determine the encounter:",
        encountersDetailed: [
            {
                roll: "[1-2]",
                name: "Mystical Moth",
                type: "Familiar",
                description: "Wings glowing faintly like painted glass.",
                befriend: "Read a book with something hidden or nocturnal.",
                hasLink: true,
                link: { text: "Mystical Moth", url: "{{ site.baseurl }}/rewards.html#mystical-moth" },
                rewards: { xp: 0, inkDrops: 0, paperScraps: 5, items: [] }
            },
            {
                roll: "[3-4]",
                name: "Animated Armor",
                type: "Monster",
                description: "Clattering from its frame. (Cannot be befriended).",
                defeat: "Read a book with a foiled cover.",
                rewards: { xp: 30, inkDrops: 0, paperScraps: 0, items: [] }
            }
        ],
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
        name: "The Shroud's Heart",
        description: "Here the air is thick, trembling with the Shroud's presence. Shadows twist like ink smoke.",
        challenge: "The Shroud's Heart: Read a book you believe will be 5 stars. If correct, remove one Worn Page penalty.",
        roomRewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: [], special: "Remove one Worn Page penalty if book is 5 stars" },
        rollInstruction: "Roll a d4 to determine the encounter:",
        encountersDetailed: [
            {
                roll: "[1-2]",
                name: "Fomorian",
                type: "Monster",
                description: "Hulking, its voice a storm of curses.",
                defeat: "Read a book containing a curse or a monster-like being.",
                befriend: "Read a book where the main character must accept a tragic flaw.",
                rewards: { xp: 30, inkDrops: 0, paperScraps: 0, items: [] }
            },
            {
                roll: "[3-4]",
                name: "Page Sprite",
                type: "Familiar",
                description: "Flitting nervously, clutching half-burned parchment.",
                befriend: "Read a book that is 300 pages or less.",
                hasLink: true,
                link: { text: "Page Sprite", url: "{{ site.baseurl }}/rewards.html#page-sprite" },
                rewards: { xp: 0, inkDrops: 0, paperScraps: 5, items: [] }
            }
        ],
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
        name: "The Mimic's Lair",
        description: "Shelves and chairs twitch with hidden hunger, waiting for you to turn your back.",
        challenge: "The Mimic's Lair: Read a book that subverts a common trope.",
        roomRewards: { xp: 0, inkDrops: 0, paperScraps: 5, items: [] },
        encountersDetailed: [
            {
                name: "Mimic",
                type: "Monster",
                description: "Lunging from false bindings. (Cannot be befriended).",
                defeat: "Read a book that feels deceptive or has a major twist.",
                rewards: { xp: 30, inkDrops: 0, paperScraps: 0, items: [] }
            }
        ],
        encounters: {
            "Mimic": {
                defeat: "Mimic: Read a book that feels deceptive or has a major twist."
            }
        }
    }
};

export const dungeonCompletionRewards = {
    "1": { name: "The Librarian's Hoard", reward: "Gain +150 Ink Drops and +20 Paper Scraps." },
    "2": { name: "Chalice of Restoration", reward: "You find a Chalice of Restoration.", hasLink: true, link: { text: "Chalice of Restoration", url: "{{ site.baseurl }}/rewards.html#chalice-of-restoration" } },
    "3": { name: "Librarian's Blessing", reward: "You may remove up to two Worn Page penalties." },
    "4": { name: "Librarian's Quill", reward: "You find a Librarian's Quill.", hasLink: true, link: { text: "Librarian's Quill", url: "{{ site.baseurl }}/rewards.html#librarians-quill" } },
    "5": { name: "Enchanted Focus", reward: "The next three books you complete grant a x1.5 Ink Drop bonus." },
    "6": { name: "Lantern of Foresight", reward: "You find a Lantern of Foresight.", hasLink: true, link: { text: "Lantern of Foresight", url: "{{ site.baseurl }}/rewards.html#lantern-of-foresight" } },
    "7": { name: "Unwavering Resolve", reward: "for the next month, you are immune to Worn Page penalties." },
    "8": { name: "Cloak of the Story-Weaver", reward: "You find a Cloak of the Story-Weaver.", hasLink: true, link: { text: "Cloak of the Story-Weaver", url: "{{ site.baseurl }}/rewards.html#cloak-of-the-story-weaver" } },
    "9": { name: "The Archivist's Favor", reward: "Choose one: reroll a prompt, gain +100 XP, or buy a merchant item at 50% off." },
    "10": { name: "The Grand Key", reward: "You find a master key for a special, rare quest." }
};

// All available genres for selection
export const allGenres = {
    "Historical Fiction": "Read a book set in the past or with a historical figure as a character.",
    "Fantasy": "Read a book with magical creatures, settings, or a non-human protagonist.",
    "Romantasy": "Read a book with a magical system and/or a romantic plot.",
    "Sci-Fi": "Read a book set in the future or one with a morally gray main character.",
    "Thriller": "Read a book with a plot twist, deception, or hidden identity.",
    "Classic": "Read a classic novel you have not yet read.",
    "Literary Fiction": "Read a book that focuses on character development and literary merit.",
    "Speculative Fiction": "Read a book that explores 'what if' scenarios across any genre.",
    "Romance": "Read a book where the central plot revolves around a romantic relationship.",
    "Memoirs/Biographies": "Read a book about someone's life story or personal experiences.",
    "Non-Fiction": "Read a book that presents factual information or real-world topics.",
    "Crime": "Read a book involving criminal activities, investigations, or mysteries."
};

// Default genre quests (for backward compatibility and initial setup)
export const genreQuests = {
    "1": { genre: "Historical Fiction", description: "Read a book set in the past or with a historical figure as a character.", rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] } },
    "2": { genre: "Fantasy", description: "Read a book with magical creatures, settings, or a non-human protagonist.", rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] } },
    "3": { genre: "Romantasy", description: "Read a book with a magical system and/or a romantic plot.", rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] } },
    "4": { genre: "Sci-Fi", description: "Read a book set in the future or one with a morally gray main character.", rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] } },
    "5": { genre: "Thriller", description: "Read a book with a plot twist, deception, or hidden identity.", rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] } },
    "6": { genre: "Classic", description: "Read a classic novel you have not yet read.", rewards: { xp: 15, inkDrops: 10, paperScraps: 0, items: [] } }
};

// Extra Credit quest rewards (books read outside of quest pool)
export const extraCreditRewards = {
    description: "Read a book outside of your monthly quest pool",
    rewards: { xp: 15, inkDrops: 10, paperScraps: 10, items: [] }
};

// Detailed side quests data for table rendering
export const sideQuestsDetailed = {
    "1": { 
        name: "The Arcane Grimoire",
        description: "An ancient spellbook writes a new page.",
        prompt: "Read the book on your TBR the longest.",
        reward: "Temp buff: Long Read Focus (+2 Ink Drops per 100 pages over 300).",
        rewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: ["Long Read Focus"] }
    },
    "2": { 
        name: "The Blood Fury Tattoo",
        description: "Inked markings blaze across your skin.",
        prompt: "Read a book featuring a counter culture rebellion.",
        reward: "Bloodline Affinity buff (+15 Ink Drops for your next book in a series).",
        rewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: ["Bloodline Affinity"] }
    },
    "3": { 
        name: "The Bag of Holding",
        description: "A battered satchel yawns impossibly wide.",
        prompt: "Read a story with multiple POVs.",
        reward: "Receive a Scatter Brain Scarab.",
        hasLink: true,
        link: { text: "Scatter Brain Scarab", url: "{{ site.baseurl }}/rewards.html#scatter-brain-scarab" },
        rewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: ["Scatter Brain Scarab"] }
    },
    "4": { 
        name: "The Wandering Merchant's Request",
        description: "A traveler draped in scarves greets you.",
        prompt: "Read a book featuring a journey.",
        reward: "Receive a Librarian's Compass.",
        hasLink: true,
        link: { text: "Librarian's Compass", url: "{{ site.baseurl }}/rewards.html#librarians-compass" },
        rewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: ["Librarian's Compass"] }
    },
    "5": { 
        name: "The Glimmering Pools' Gift",
        description: "A nymph rises from glowing waters.",
        prompt: "Read a book about transformation.",
        reward: "Roll a die: on even gain an Amulet of Duality; on odd gain one Worn Page curse.",
        hasLink: true,
        link: { text: "Amulet of Duality", url: "{{ site.baseurl }}/rewards.html#amulet-of-duality" },
        rewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: ["Amulet of Duality"] }
    },
    "6": { 
        name: "The Chime of Opening",
        description: "A silver chime hums with anticipation.",
        prompt: "Read a book where a long-hidden truth is revealed.",
        reward: "Receive a Key of the Archive.",
        hasLink: true,
        link: { text: "Key of the Archive", url: "{{ site.baseurl }}/rewards.html#key-of-the-archive" },
        rewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: ["Key of the Archive"] }
    },
    "7": { 
        name: "The Scarecrow's Cornfield",
        description: "Rustling stalks and a grim figure loom.",
        prompt: "Read a book with an unreliable narrator.",
        reward: "Temp buff: Disjointed Perception (+10 Ink Drops, +5 Page Scraps).",
        rewards: { xp: 0, inkDrops: 10, paperScraps: 5, items: [] }
    },
    "8": { 
        name: "The Empty Shelf",
        description: "A hollow space on the stacks calls out.",
        prompt: "Choose a book from your TBR you are most excited for.",
        reward: "Receive a Tome of Potential.",
        hasLink: true,
        link: { text: "Tome of Potential", url: "{{ site.baseurl }}/rewards.html#tome-of-potential" },
        rewards: { xp: 0, inkDrops: 0, paperScraps: 0, items: ["Tome of Potential"] }
    }
};

// Backward compatible format for character sheet
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

// Detailed curse table for rendering
export const curseTableDetailed = [
    {
        number: 1,
        name: "The Unread Tome",
        description: "A neglected book groans from your shelf. You must read a book from your DNF list or one you have been putting off."
    },
    {
        number: 2,
        name: "The Lost Lore", 
        description: "Pages crumble to dust before your eyes. You must read or listen to a non-fiction book or podcast related to science, tech, or nature."
    },
    {
        number: 3,
        name: "The Forgotten Pages",
        description: "Dusty shelves collapse, scattering volumes into chaos. You must reorganize a section of your physical books or digital library."
    },
    {
        number: 4,
        name: "The Ravenous Shadow",
        description: "The Shroud claws hungrily at your stack. You must take on one additional quest for your monthly pool."
    }
];

// Temporary buffs from side quests and dungeon rewards
export const temporaryBuffsFromRewards = {
    "Long Read Focus": {
        description: "+2 Ink Drops per 100 pages over 300",
        duration: "one-time",
        source: "Side Quest: The Arcane Grimoire",
        rewardModifier: { inkDrops: 2 } // Per 100 pages over 300 - calculated manually
    },
    "Bloodline Affinity": {
        description: "+15 Ink Drops for your next book in a series",
        duration: "one-time",
        source: "Side Quest: The Blood Fury Tattoo",
        rewardModifier: { inkDrops: 15 }
    },
    "Gilded Painting": {
        description: "+1 Ink Drop when reading in an ornate location",
        duration: "two-months",
        source: "Dungeon: The Grand Gallery",
        rewardModifier: { inkDrops: 1 }
    }
};

// Backward compatible format for character sheet
export const curseTable = {
    "The Unread Tome": {
        name: "The Unread Tome",
        requirement: "Read a book from your DNF list or one you have been putting off",
        description: "A neglected book groans from your shelf. You must read a book from your DNF list or one you have been putting off."
    },
    "The Lost Lore": {
        name: "The Lost Lore", 
        requirement: "Read or listen to a non-fiction book or podcast related to science, tech, or nature",
        description: "Pages crumble to dust before your eyes. You must read or listen to a non-fiction book or podcast related to science, tech, or nature."
    },
    "The Forgotten Pages": {
        name: "The Forgotten Pages",
        requirement: "Reorganize a section of your physical books or digital library",
        description: "Dusty shelves collapse, scattering volumes into chaos. You must reorganize a section of your physical books or digital library."
    },
    "The Ravenous Shadow": {
        name: "The Ravenous Shadow",
        requirement: "Take on one additional quest for your monthly pool",
        description: "The Shroud claws hungrily at your stack. You must take on one additional quest for your monthly pool."
    }
};