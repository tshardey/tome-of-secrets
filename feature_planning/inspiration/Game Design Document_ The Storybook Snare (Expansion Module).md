# **Game Design Document: The Storybook Snare (Expansion Module)**

**Target Audience:** LLM Game Designer / System Architect

**Parent System:** Roll for Reads (Base Game)

**Objective:** Define the logic for the "Storybook Snare" sub-module, a high-stakes temporary dungeon with unique "Fight vs. Flirt" mechanics and specific exit conditions.

## **1\. Module Overview**

**Concept:** A "trap" event where players are pulled into a cursed book. Instead of standard monthly progression, players must complete a set number of prompts to escape unscathed or earn massive bonuses.

**Core Loop (The Snare):**

1. **Entry:** Player enters the "Storybook Snare" state.  
2. **Roll D12:** Determine the Monster Encounter.  
3. **Choice:** Player selects **Fight** OR **Befriend/Flirt** path.  
4. **Action:** Read book satisfying the chosen prompt.  
   * *Note:* Prompts *can* stack with Base Game prompts.  
5. **Repeat:** Continue rolling/reading until the player chooses to exit or month ends.  
6. **Exit Calculation:** Apply rewards/penalties based on total PromptsCompleted.

## **2\. New Player States & Variables**

### **A. Temporary State (Scope: Expansion Only)**

* **PromptsCompleted:** Integer (Count of monsters resolved).  
* **BefriendedCount:** Integer (Count of "Befriend/Flirt" paths chosen).  
* **TraumaFlag:** Boolean (If exit condition fails, apply XP penalty).

### **B. Persistent Global Effects**

* **\+2 Roll Modifier:** Awarded if BefriendedCount \>= 3\. (applies to future determination rolls).  
* **Inventory Additions:** Unique items (e.g., Corpse Mask, Shadow Robes) gained from specific paths.

## **3\. Encounter Database (D12 Roll)**

*Logic: Roll D12. Player chooses Path A (Fight) or Path B (Befriend).*

| Roll | Monster | Path A: Fight Prompt | Path B: Befriend/Flirt Prompt | Special Mechanics / Loot |
| :---- | :---- | :---- | :---- | :---- |
| **1** | **Cambion** | **Condition:** Roll D20 \<= 13\. *Prompt:* Character tempted by dark side. | **Condition:** Roll D20 \>= 14\. *Prompt:* Protagonist is part-monster/non-human. | **Check Required:** RNG check determines available path or success. |
| **2** | **Death Knight** | Oath taken, moral character, or corruption theme. | Protagonist lost everything / down on luck. | — |
| **3** | **Shadow Demon** | Darkness has a voice (seductive). | Villain unseen until inside head (Psych thriller). | — |
| **4** | **Marilith** | Line between elegance and monstrosity blurs. | Deadly, beautiful, terrifying leader. | **Loot (Path B):** *Dance of Blades* (+2,000 XP). |
| **5** | **Doppelganger** | Character has aspects/themes you relate to. | Unreliable narrator / Character not who they seem. | **Loot (Path A):** *Enchanted Mirror* (+700 XP). |
| **6** | **Erinyes** | Vengeance, retribution, or justice theme. | Angry women / female rage. | — |
| **7** | **Drow Mage** | Political intrigue, war, feuding families. | Secret society or underground rebellion. | **Loot (Path B):** *Shadow Robes* (+800 XP). |
| **8** | **Gargoyle** | Feat. non-human creatures (demons, vamps, shifters). | Slow-burn, atmospheric, mystery. | — |
| **9** | **Ghost** | Book on TBR forever (Unfinished business). | Characters spiritually/emotionally bound (Mates). | **Loot (Path B):** *Lovers Lanterns* (+1,200 XP). |
| **10** | **Harpy** | Fast-paced, high stakes (Run from song). | Cutting dialogue, sarcasm, sharp tongue. | — |
| **11** | **Werewolf** | Major transformation (physical/emotional). | Friendship, found family, loyalty. | **Penalty (Path A):** If Fail to read \-\> Roll D12. IF \<= 7: Gain *Werewolf Curse*. |
| **12** | **Wraith** | Overflowing with positive energy / Happy ending. | Read only at night/early morning. | **Loot (Path A):** *Corpse Mask* (+1,800 XP). |

## **4\. Expansion Loot Table**

*Items are awarded automatically upon completing the specific Path (A or B) listed above.*

| Item Name | Source Monster | Path Required | Effect / Description |
| :---- | :---- | :---- | :---- |
| **Dance of Blades** | Marilith | Befriend | **\+2,000 XP.** "Song" item. |
| **Enchanted Mirror** | Doppelganger | Fight | **\+700 XP.** See through illusions. |
| **Shadow Robes** | Drow Mage | Befriend | **\+800 XP.** Cold resistance, hide bonus. |
| **Lovers Lanterns** | Ghost | Befriend | **\+1,200 XP.** Paired lanterns, light up when thinking of other. |
| **Corpse Mask** | Wraith | Fight | **\+1,800 XP.** Store faces of the dead to wear. |

## **5\. Exit Logic & Rewards**

*Triggered at end of session/month based on PromptsCompleted.*

### **A. Survival Check (Low Completion)**

* **Condition:** PromptsCompleted \<= 3  
* **Check:** Roll D20.  
  * **Result \<= 9:** **TRAUMA.** Lose \-1,000 XP (Global).  
  * **Result \>= 10:** Safe exit.

### **B. Moderate Check**

* **Condition:** PromptsCompleted \== 4  
* **Check:** Roll D20.  
  * **Result \<= 9:** **Minor Trauma.** Lose \-500 XP.  
  * **Result \>= 10:** Safe exit.

### **C. Success (Standard)**

* **Condition:** PromptsCompleted \== 5 or 6  
* **Result:** Safe exit. Keep all earned XP and Loot.

### **D. Over-Achievement (Bonus)**

* **Condition:** PromptsCompleted \>= 7  
* **Result:** **Massive XP Bonus.**  
  * Formula: PromptsCompleted \* 1,000 XP (Added to Total).  
  * *Example:* 7 prompts \= \+7,000 Bonus XP.

### **E. Social Bonus (The Flirt Buff)**

* **Condition:** BefriendedCount \>= 3  
* **Result:** **Permanent Buff.** Gain \+2 to future prompt-determination dice rolls.

## **6\. Developer Notes / Edge Cases**

1. **XP Calculation Order:**  
   * Calculate individual Monster Prompt XP (Standard) FIRST.  
   * Add Item XP (Loot) SECOND.  
   * Calculate Exit Bonus/Penalty THIRD.  
   * *Note:* Penalties subtract from Total XP. Negative XP is allowed (Character is not dead, just "in debt").  
2. **Dual-Classing:** Prompts from this expansion can be satisfied by the same book used for a Base Game prompt (stacking allowed).  
3. **Re-Rolling:** Duplicates on the D12 table are allowed to be re-rolled by the user, or they can choose the alternate path (Fight vs Befriend) for the same monster.