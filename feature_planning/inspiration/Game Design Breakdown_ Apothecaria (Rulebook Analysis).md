# **Game Design Breakdown: Apothecaria (Rulebook Analysis)**

This analysis is based on the full text of the *Apothecaria* rulebook (Printer-Friendly Edition). It is structured to assist an LLM in simulating the game's mechanics, narrative flow, and economy.

## **1\. Game Identity & System Overview**

* **Title:** Apothecaria: Solo Potion Making RPG  
* **Theme:** Pastoral Fantasy, Cozy Witchcraft, Mystery, Management.  
* **Core Resolution Mechanic:** Standard 52-card deck (Values: Ace=1 to King=13).  
* **Primary Loop:** Diagnose Ailment $\\rightarrow$ Gather Reagents $\\rightarrow$ Brew Potion $\\rightarrow$ Upgrade/Expand.

## **2\. Structural Gameplay Loop**

The game follows a strict procedural cycle for each "Turn" (representing one week).

### **Phase 1: Diagnosis**

* **Input:** Draw a card to select an **Ailment** from the current Reputation Tier (Novice, Intermediate, Advanced, Expert).  
* **Data Generation:**  
  * **Patient:** Determine who they are (Villager, Adventurer, Monster).  
  * **Ailment Stats:**  
    * **Tags:** (e.g., \[CURSE\], \[HAIR\]) \- *The puzzle keys.*  
    * **Timer:** (e.g., 6 segments) \- *The action economy.*  
    * **Consequence:** (e.g., "Lose 1 Reputation") \- *Failure state.*

### **Phase 2: Preparation (Sourcing)**

* The player checks their **Reagent List** to find items matching the Ailment's Tags.  
* **Tools Check:** Do they have the necessary tool to process the reagent? (Mortar & Pestle, Cauldron, Alembic).  
* **Locale Selection:** Decide where to travel (Forest, Loch, Mountain, Dungeon, etc.).

### **Phase 3: Foraging (The RNG Layer)**

* **Setup:** Set Foraging Points to 0\.  
* **Action Loop:**  
  1. **Draw a Card.**  
  2. **Resolve Event:** Check the card value against the **Locale Table** (e.g., Forest Event 5). Trigger narrative snippet.  
  3. **Reagent Check:**  
     * If Card Value $\\ge$ Target Reagent Value: **Success** (Collect Item).  
     * If Card Value $\<$ Target Reagent Value: **Fail** (Gain \+1 Foraging Point; \+2 with Sickle).  
  4. **Pity System:** If Foraging Points $\\ge$ Target Reagent Value, auto-collect the item.  
  5. **Time Cost:** Moving to a new Locale reduces the Ailment Timer by 1\.

### **Phase 4: Brewing (The Crafting Layer)**

* **Process:** Combine collected Reagents.  
* **Modifiers:**  
  * **Poison Points:** Reduce Silver reward (Penalty).  
  * **Sweet Points:** Increase Silver reward (Bonus).  
  * **Cancellation:** 1 Poison cancels 1 Sweet.  
* **Outcome:** If tags match the ailment $\\rightarrow$ Cured.

### **Phase 5: Rewards & Downtime**

* **Rewards:** Silver (currency) and Reputation (XP).  
* **Downtime Actions:**  
  * Buy **Tools** (unlock capabilities).  
  * Buy **Upgrades** (passive resource generation).  
  * **The Search:** Progress the main story (triggered by Jokers).

## **3\. Database Schemas (For LLM Simulation)**

### **A. Ailments**

Ailments are the primary quest drivers.

* **Structure:** {Name} | {Tags} | {Timer} | {Consequence} | {Flavour}  
* **Example:** *Phodothropy* | \[CURSE\], \[HAIR\] | Timer: 6 | "Turns into a hamster."

### **B. Reagents**

Reagents are the puzzle pieces.

* **Structure:** {Name} | {Locale} | {Value} | {Season Modifiers} | {Processing}  
* **Processing Types:**  
  * **Crush (Mortar):** Extracts specific tags.  
  * **Boil (Cauldron):** Extracts different tags.  
  * **Distil (Alembic):** Extracts high-level/rare tags.  
  * **Raw:** Used as-is.

### **C. Locales & Events**

Each Locale (Forest, Loch, Bog, etc.) functions as a random encounter table.

* **Input:** Card Value (Ace-King).  
* **Output:** Narrative prompt \+ Mechanical effect (e.g., "Lose Foraging Point", "Gain Reagent", "Decrease Timer").

### **D. Festivals (Seasonal Events)**

Occur every 13 weeks. They pause the standard loop.

* **Flower Festival (Spring):** Baking contest (Blackjack minigame).  
* **Sunrise Celebration (Summer):** Rowboat race (High card wins).  
* **Bogle's Night (Autumn):** Costume contest & Ghost interaction.  
* **Frostfall Festival (Winter):** Snowball fights & Sled racing.

## **4\. Narrative Systems**

### **The Search (Meta-Quest)**

The overarching mystery of the missing witch.

* **Trigger:** Drawing a **Joker** during play or at the end of a season.  
* **Progression Stages:**  
  1. **Early Clues:** (Name, quirks, familiar).  
  2. **About the Witch:** (Fears, education, missing items).  
  3. **The Plot Thickens:** (Nemesis, preparations, secret letters).  
  4. **The Finale:** (Alive/Dead state, rescue mission).

### **Familiars**

Companion NPCs with mechanical benefits.

* **Generation:** Determined by drawing a card (Ace-King).  
* **Types:** Rodent, Raptor, Amphibian, Canid, Corvid, Snake, Feline, Insect, Reptile, Mount, Magic, Mythical.  
* **Skills:** (e.g., *Forager*: Reduce Plant difficulty; *Scout*: Increase Timers).

## **5\. Economic System**

### **Currency: Silver**

* **Sources:** Curing patients (Base: 20s, scales with Reputation).  
* **Sinks:**  
  * **Tools:** Sickle (50s), Wand (100s), Broom (100s), Coracle (70s).  
  * **Upgrades:** Garden Plot (100s), Hive (50s), Laboratory extensions.

### **Progression: Reputation**

* **Novice:** 0-10  
* **Intermediate:** 11-21  
* **Advanced:** 22-32  
* **Expert:** 33+  
* *Effect:* Unlocks higher-tier Ailment tables and increases base pay.

