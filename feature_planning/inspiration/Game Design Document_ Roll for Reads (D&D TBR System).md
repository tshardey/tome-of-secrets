# **Game Design Document: Roll for Reads (D\&D TBR System)**

**Target Audience:** LLM Game Designer / System Architect

**Objective:** Define the logic, states, and databases required to replicate the "Roll for Reads" gamified reading experience.

## **1\. System Overview**

**Concept:** A simplified RPG progression system where "Encounter" rolls generate reading prompts (Monsters or Dungeons). Completing prompts awards XP, leveling a user-created character from Level 1 to 20\.

**Core Loop:**

1. **Roll D20 (Encounter Roll):** Determines the monthly task.  
2. **Assign Prompt:** Based on Even (Monster) or Odd (Dungeon) result.  
3. **User Action:** User reads book(s) satisfying the prompt.  
4. **Resolution:**  
   * *Success:* Gain XP \+ potential Loot (Side Quests).  
   * *Failure:* Apply Disadvantage (Penalty).  
   * *Over-achievement:* Apply Inspiration (Bonus).  
5. **Progression:** Accumulate XP to Level Up (Cap: Lvl 20).

## **2\. Player State & Variables**

### **A. Character Attributes**

* **Level:** Integer (1-20).  
* **Current XP:** Integer.  
* **Class:** Enum (See *Class Database*).  
* **Inventory:** List of Items (acquired via Side Quests).  
* **Alignment/Status:** Default "Neutral". Can be modified by specific events (e.g., Sprite Forest "Forest Destroyer" path sets status to "Evil").

### **B. Global Rules**

* **Even Roll:** Triggers *Monster Table*.  
* **Odd Roll:** Triggers *Dungeon Table*.  
* **Side Quest Trigger:** Boolean flag attached to specific Monsters/Dungeons. If True, user rolls D10 on *Loot Table*.

## **3\. Data Structures (Content Libraries)**

### **A. Class Database (D12 Roll)**

*Used for character creation.*

* **Bonus Logic:** \+1,000 XP if read book matches "Class Vibe".

| Roll (D12) | Class | Vibe/Prompt Keywords | Complexity |
| :---- | :---- | :---- | :---- |
| 1 | Barbarian | Action, fighting, fast-paced | Average |
| 2 | Bard | Lyrical, poetic, arts, music | High |
| 3 | Cleric | Healing, faith, inner strength | Average |
| 4 | Druid | Nature-centric, forest settings | High |
| 5 | Fighter | War, duel, competition | Low |
| 6 | Monk | Philosophical, meditative | High |
| 7 | Paladin | Moral compass, righteous quest | Average |
| 8 | Ranger | Survival, dystopian, wilderness | Average |
| 9 | Rogue | Thrillers, mystery, thieves, spies | Low |
| 10 | Sorcerer | Magic via bloodline/destiny | High |
| 11 | Warlock | Dark fantasy, bargains, forbidden power | High |
| 12 | Wizard | Intellectual, magical, academy | Average |

### **B. Encounter Tables (D20 Roll)**

*Logic: If Roll % 2 \== 0 \-\> Monster. Else \-\> Dungeon.*

#### **Monster Table (Even Rolls)**

| Roll | Monster | XP Value | Special Logic / Prompt Summary | Side Quest? |
| :---- | :---- | :---- | :---- | :---- |
| 2 | Animated Armor | 200 | Destructive/Unpredictable antagonist. | No |
| 4 | Ankheg | 450 | Hidden depth, secrets, twists. | **Yes** |
| 6 | Banshee | 1,100 | Death themes, gothic, or ghosts. | **Yes** |
| 8 | Mimic | 450 | Twist, deception, hidden identity. | **Yes** |
| 10 | Empyrean | 32,500 | **Multi-Prompt:** 1\. Self-esteem/Confidence themes. 2\. Book \>450 pages. *Fail Condition:* If only 1 done, get 25% XP (8,125) & Disadvantage. | No |
| 12 | Fomorian | 3,900 | **Multi-Prompt:** 1\. Curses/Monsters. 2\. Read at night/dark. | No |
| 14 | Glabrezu | 5,000 | Morally grey romance, dark romance, trickster. | No |
| 16 | Dryad | 200 | **Choice:** A) *Befriend:* Protagonist protects nature. B) *Fight:* Themes of birth/death/rebirth. | **Yes** |
| 18 | Dao | 7,200 | Wealth, greed, ambition, treasure hunts. | No |
| 20 | Night Hag | Variable | **Sub-Roll (D20):** 1-10 (Single): 1,800 XP. *Prompt:* Psych thriller/Horror. 11-20 (Coven): 2,900 XP. *Prompt:* Above \+ Book \>500 pages. | No |

#### **Dungeon Table (Odd Rolls)**

| Roll | Dungeon | XP Value | Special Logic / Prompt Summary | Side Quest? |
| :---- | :---- | :---- | :---- | :---- |
| 1 | Main Quest | 450 | Highly anticipated / Top of TBR list. | **Yes** |
| 3 | Roll Initiative | 700 | First book seen on shelf/library/kindle. | **Yes** |
| 5 | Bag of Holding | 850 | Complex plot, action-packed, or messy dynamics. | **Yes** |
| 7 | Black Dragon | 27,500 | Water setting. **Bonus:** \+200 XP if Swamp setting. | No |
| 9 | Beholder Lair | 11,500 | Unique POV or Multi-POV. | No |
| 11 | Party Conflict | 1,100 | Heavy interpersonal drama. *Fail Penalty:* \-1,100 XP. | **Yes** |
| 13 | Demilich Crypt | 18,000 | **Sub-Roll (D20):** 11+ (Crit Hit): 5-star prediction. (Full XP). 1-10 (Crit Fail): DNF/Procrastinated book. (Half XP: 9,000). | No |
| 15 | Sprite Forest | 45,000 | **Sub-Roll (D20):** 15+ (Peace): Searching for meaning/home. \<15 (War): Antagonist everyone hates. Set Status: Evil. | No |
| 17 | Vampire Coffin | 13,000 | **Two Prompts:** 1\. Driven by desire. 2\. Pub pre-2015 OR Gothic. | **Yes** |
| 19 | Scarecrow | 20,000 | Fragmented structure, multi-perspective, unreliable narrator. | **Yes** |

### **C. Loot Table (Side Quests \- D10 Roll)**

*Triggered if Encounter allows Side Quest. Reward: Item \+ 10,000 XP. Logic: Unique check (cannot repeat items).*

| Roll | Item | Prompt Summary |
| :---- | :---- | :---- |
| 1 | Arcane Grimoire | Unread on shelf the longest. |
| 2 | Amulet Black Skull | Deals with death, bargains, or power. |
| 3 | Blood Fury Tattoo | Features blood, tattoo, vampire, or dark romance. |
| 4 | Horseshoe Speed | Fast-paced, thriller, urgent. |
| 5 | Bottle Coffee | Cozy, comforting, immersive. |
| 6 | Bracer Daggers | Razor-sharp, danger, wit, edge. |
| 7 | Chime of Opening | Key, keyhole, or door on cover. |
| 8 | Constantori Portrait | Uncanny, dramatic, gothic, secrets. |
| 9 | Deck Many Things | Friend picks a "chaotic" option. |
| 10 | Eyes of Eagle | Connects to larger series/mythology (Sequel). |

## **4\. Mechanic Sub-Systems**

### **A. Leveling Curve**

*Check total XP against this table after every prompt resolution.*

| Level | XP Required |  | Level | XP Required |
| :---- | :---- | :---- | :---- | :---- |
| 1 | 0 |  | 11 | 85,000 |
| 2 | 300 |  | 12 | 100,000 |
| 3 | 900 |  | 13 | 120,000 |
| 4 | 2,700 |  | 14 | 140,000 |
| 5 | 6,500 |  | 15 | 165,000 |
| 6 | 14,000 |  | 16 | 195,000 |
| 7 | 23,000 |  | 17 | 225,000 |
| 8 | 34,000 |  | 18 | 265,000 |
| 9 | 48,000 |  | 19 | 305,000 |
| 10 | 64,000 |  | 20 | 355,000 |

### **B. Modifiers (D4 Rolls)**

Inspiration (Bonus)  
Trigger: User reads extra book, ARC, or buddy reads.

1. **Reduce Difficulty:** Subtract 100 pages from a page-count requirement.  
2. **Saving Throw:** Skip a prompt without penalty.  
3. **XP Boost:** Gain \+1,000 XP immediately.  
4. **Dungeon Master Choice:** User picks any Dungeon prompt (bypass RNG).

Disadvantage (Penalty)  
Trigger: User fails to complete assigned prompt.

1. **Critical Fail:** Must roll for an *additional* prompt/book.  
2. **XP Loss:** Lose \-500 XP.  
3. **Increased Difficulty:** Add \+50 pages to a page-count requirement.  
4. **DM Intervention:** Friend picks a book (cannot count for Inspiration).