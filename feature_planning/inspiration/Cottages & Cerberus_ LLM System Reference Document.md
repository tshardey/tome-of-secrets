# **Cottages & Cerberus: LLM System Reference Document**

## **1\. System Overview & Core Premise**

Concept: A "Cozy-Hack" RPG combining relaxing cottagecore slice-of-life elements with monster hunting.  
Role: The LLM acts as the Cozy Master (CM), managing the world, target numbers (TN), and monster AI.  
Player Goal: Hunt monsters to harvest parts \-\> Craft Home Goods \-\> Increase Cottage Coziness (CP) \-\> Rank up Cottage.

## **2\. Core Resolution Engine**

### **Dice Mechanics**

* **Dice Pool:** Standard d6s. Size of pool \= Attribute Value (1 to 4).  
* **Target Number (TN):** Set by CM (Default 3 for moderate tasks, Monster stats for combat).  
* **Check:** Roll \[Attribute\]d6. Count dice where result $\\ge$ TN.

### **Success Tiers**

| Successes | Outcome | Mechanical Effect |
| :---- | :---- | :---- |
| **0** | **Fail** | The action fails. **Lose 1 Spoon.** |
| **1-2** | **Mixed Success** | **Choice:** Fail (no cost) OR Succeed at a cost (**Lose 1 Spoon**). |
| **3** | **Success** | The action succeeds with no cost. |
| **4+** | **Super Success** | Great success. **Regain 1 Spoon.** Trigger special effects (e.g., \+1 damage). |

### **Attributes**

1. **CALM (Charm):** Social interactions, persuasion, bartering.  
2. **ALCHEMY:** Magic usage, potions, intricate crafting.  
3. **LORE:** Knowledge, history, nature checks.  
4. **MUSCLE:** Physical strength, weapon attacks, athletics.  
* *Assignment:* Assign values {1, 2, 3, 4} to these four stats at creation.

## **3\. Resource Management**

### **Spoons (Capacity/Health)**

* **Definition:** Abstract representation of physical/mental energy (based on Spoon Theory).  
* **Max Spoons:** Starts at 10\.  
* **Depletion:** Lost via failed checks, combat damage, or powering abilities.  
* **Zero Spoons:** Character cannot affect the world; auto-fail all checks.  
* **Recovery:**  
  * **Rest:** Sleeping/Resting in Cozy Mode.  
  * **Vibes:** Specific roleplay triggers (e.g., "Regain 1 spoon when you start a scene alone").  
  * **Super Success:** Regain 1 spoon.

### **Cozy Coins (Meta-Currency)**

* **Starting Amount:** 2 per session (CM can adjust).  
* **Uses:**  
  * **Fortune:** Spend 1 coin after rolling to reroll all dice \< TN.  
  * **Mitigation:** Spend 1 coin to prevent the loss of a Spoon.

## **4\. Game Loop Algorithms**

The game alternates between two distinct phases: **Cozy Mode** and **Hunt Mode**.

### **Phase A: Cozy Mode (Downtime & Social)**

* **Objective:** Gain **Cozy Points (CP)** to increase Cottage Rank.  
* **Activities:**  
  * **Restorative:** Tea time, napping (Regain 1 Spoon, no check).  
  * **Productive (Gardening/Cleaning):** TN 3 Check.  
    * *Costly Success:* \+1 CP.  
    * *Success:* \+2 CP.  
    * *Super Success:* \+3 CP.  
  * **Bartering:** Charisma check to get goods in town.  
* **Crafting:** Combine **Monster Parts** \+ **Mundane Materials** to create **Home Goods**.  
  * *Result:* Home Goods grant permanent buffs or significant CP boosts.

### **Phase B: Hunt Mode (Adventure & Combat)**

1. **Selection:** Party chooses a Cottage upgrade \-\> identifies required Monster Part.  
2. **Tracking:** Series of checks (Lore/Survival) to locate monster. Failure \= Complications (e.g., damage, ambush).  
3. **Combat:** See Section 5\.  
4. **Harvest:** Defeat monster \-\> Gain part.

## **5\. Combat Engine**

Combat is structured in rounds.

### **Turn Order**

1. **Monster Opener:** Monster triggers start-of-combat abilities (if any).  
2. **Monster Action:** The monster takes 1 action.  
3. **Player Turns:** Players decide order. Each PC takes 1 Action \+ Movement.  
4. **Monster Closer:** Monster triggers end-of-round abilities.

### **Player Actions**

* **Weapon Attack:** Roll **MUSCLE** vs Monster **HIDE**. Deal 1 Dmg.  
* **Spell Attack:** Roll **ALCHEMY** vs Monster **RESIST**. Deal 1 Dmg.  
* **Help a Friend:** Grant an ally **BOOST** (add dice to their pool).  
* **Ability:** Use a specific Class Ability.

### **Monster Data Structure**

Monsters have 4 core stats and specific tags.

{  
  "name": "Monster Name",  
  "stats": {  
    "health": "Integer (Default 16-20 for party of 4)",  
    "hide": "Integer (Physical Defense TN)",  
    "resist": "Integer (Magical Defense TN)",  
    "speed": "Integer (Escape TN)"  
  },  
  "affinities": {  
    "element": "Fire/Water/etc.",  
    "immune": \["Fire"\],  
    "weakness": \["Ice"\]  
  },  
  "abilities": {  
    "opener": "Effect at start of combat (e.g., Roar: Everyone loses 1 spoon)",  
    "closer": "Effect at end of round (e.g., Regeneration)",  
    "passive": "Constant effect (e.g., Fire Aura: Melee attackers take Burn)",  
    "actions": \["Attack 1", "Breath Weapon (Recharge 4-6)"\]  
  }  
}

### **Status Effects**

* **BOOST (X):** Add X dice to next roll.  
* **FORTUNE:** Reroll failures.  
* **MISFORTUNE:** Reroll successes.  
* **BATTERED (X):** Reduce MUSCLE by X. Decays by 1/round.  
* **FOGGED (X):** Reduce LORE by X. Decays by 1/round.  
* **TEADRAINED (X):** Reduce ALCHEMY by X. Decays by 1/round.  
* **BLEED:** Take 1 dmg at end of turn. Sacrifice turn to stop.  
* **BURN:** Take 1 fire dmg at end of turn. Sacrifice turn to stop.

## **6\. Character Generation Schema**

### **Structure**

1. **Attributes:** Assign \[1, 2, 3, 4\] to Charm, Alchemy, Lore, Muscle.  
2. **Abilities:** Choose 3\.  
   * *Tags:* Passive, Action, Spell, Power, Pair (must take two Pair abilities).  
3. **Vibe:** Choose 1\. Determines spoon regeneration condition.  
   * *Example:* "Night Owl: Regain 2 spoons if scene starts in dark."  
4. **Companion/Item:** Choose 1 Pet OR 1 Magic Item.  
   * *Pet:* Has own mini-stats and 1 active/passive ability.

### **Sample Ability Data**

* **Beast Mode (Power):** \+2 to one attribute, \+1 Dmg, lose 1 spoon/round.  
* **Fireball (Spell):** Ranged Magic Attack.  
* **Cheer (Passive):** "Help a Friend" grants extra Boost.

## **7\. Procedural Generation Hooks (For Solo Play)**

### **Generating a Hunt**

1. **Define Goal:** "We need a \[Item\] which requires a \[Monster Part\]."  
2. **Select Monster:** Pick monster carrying that part (e.g., Embear for Fire Core).  
3. **Generate Traversal:** \* Create 3 "Scenes" before the Lair.  
   * Scene 1: Social/Information Gathering (Village).  
   * Scene 2: Wilderness Challenge (Skill Check TN 3-4).  
   * Scene 3: Monster Sign/Ambush (Trap or Minor Combat).  
4. **Lair Scene:** The boss battle.

### **Generating Cottage Upgrades**

* **Name:** Adjective \+ Noun (e.g., "Ever-Warm Hearth", "Bottomless Teapot").  
* **Effect:** \+1 CP AND (+1 Die to \[Skill\] OR \+1 Stat if under 3).  
* **Recipe:** \[Monster Part\] \+ \[Mundane Material\] \+ \[Magical Process\].