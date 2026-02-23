# **Game Design Document: The Grimoire Gallery & Interactive Tome Cards**

**Target Audience:** Coding Agent / Developer

**Project:** The Tome of Secrets (Expansion)

**Objective:** Refine the "Archive" tab to display completed quests as interactive, flipping "Tome Cards." Integrate external APIs (OpenLibrary / Google Books) to automatically fetch book covers and page counts based on user-entered titles and authors.

## **1\. Executive Summary**

The static list/poster view of completed books is being upgraded into the **Grimoire Gallery**. When a Keeper edits a quest prior to completion, the game will query book APIs as they search for a book, allowing them to select the correct match and automatically populate metadata. In the UI, these completed books will be displayed as fixed-size cards.

By default, the card displays the book's cover. Upon hovering, a CSS 3D transform will flip the card to reveal a standardized "Stat Block" on the back, detailing the narrative and mechanical significance of that read.

## **2\. API Integration Strategy**

To ensure high match rates for both covers and page counts, we will use a two-tiered API approach.

* **Primary: Google Books API**  
  * *Endpoint:* https://www.googleapis.com/books/v1/volumes?q=intitle:{title}+inauthor:{author} (or general search ?q={query})  
  * *Why:* Extremely reliable for pageCount data.  
* **Fallback: OpenLibrary API**  
  * *Endpoint:* https://openlibrary.org/search.json?q={query}  
  * *Why:* Good fallback for covers if Google Books returns a missing image or strict CORS restrictions apply.

**Workflow for Book Selection (Quest Edit Form):**

1. User enters a search term in the Book Name field while editing an active quest.  
2. System fires a background fetch to APIs to search for matching books.  
3. User selects the correct book from the search results.  
4. System automatically populates the Title, Author, Cover URL, and Page Count into the quest form.  
5. User is allowed to manually override the populated metadata (e.g., correcting the Page Count or Cover URL for a specific edition) before saving and completing the quest.

## **3\. UI/UX: The "Tome Card"**

The Gallery will be a flexbox/grid layout of fixed-size cards.

### **3.1 Card Specifications**

* **Dimensions:** Fixed aspect ratio (e.g., 250px width by 375px height) to mimic a standard trade paperback or Tarot card.  
* **Interaction:** hover triggers a 180-degree rotateY CSS flip animation.  
* **Click Action:** Clicking the card (either front or back) still opens the existing "Edit Drawer" to allow users to modify notes or correct API data.

### **3.2 Side A: The Front (Cover)**

* Displays the high-resolution poster/cover of the book.  
* If no cover is found, displays a stylized, generated "Leather Tome" fallback image featuring the book's title in gold foil text.

### **3.3 Side B: The Back (Stats)**

The back of the card must have a strict, absolute layout so all information is in the exact same position across every card, regardless of text length (using text-overflow truncations or internal scrolling for notes).

**Layout Structure:**

1. **Header:** Book Name (prominent), Author (sub-text), and **Completion Date** (Displays the Month and Year completed, e.g., *February 2026*).  
2. **Thumbnail:** A small, faded, or watermarked version of the Cover of Book acting as a background or corner accent for aesthetic continuity.  
3. **Quest Info:** The Quest Prompt that this book fulfilled (e.g., *"♦ Read a book with a red cover"*).  
4. **Page Count & Mechanics:** \* *Base Page Count:* Fetched from API.  
   * *Effective Page Count:* Factored and adjusted based on relevant items applied (e.g., if a specific equipped magnifying glass item grants a bonus for books over 400 pages, this interaction is noted here).  
5. **Applicable Buffs:** A row of abbreviations/icons representing active items during this read (e.g., \[OE\] for Owl's Eyes, \[SC\] for Scholar's Candle).  
6. **Rewards Received:** Icons and numbers showing exact payouts (e.g., \+15 XP, \+10 Ink Drops, \+1 Loot).  
7. **Notes:** A small, stylized text box containing the first \~100 characters of the user's journal entry/notes.

## **4\. Data Schema Updates**

The monthlyCompletedBooks object (or equivalent Archive state) must be updated to store this new metadata persistently so the API is only called once per book.

// Example of an updated Completed Book Entry  
{  
  id: "uuid-v4",  
  dateRead: "2026-02-22",  
    
  // 1 & 2\. Book Name & Author  
  title: "The Name of the Wind",  
  author: "Patrick Rothfuss",  
    
  // 3\. Quest Prompt  
  questId: "genre-hearts-4",  
  questPrompt: "Read a Fantasy novel",  
    
  // 4\. Cover of Book  
  coverUrl: "\[https://books.google.com/\](https://books.google.com/)...", // Fetched from API  
    
  // 5\. Page Count (Raw vs Effective)  
  pageCountRaw: 662, // Fetched from API  
  pageCountEffective: 662, // Modified by active Keeper items  
    
  // 6\. Notes  
  notes: "The prose in this book is incredibly lyrical. Fits the library vibe perfectly...",  
    
  // 7\. Applicable Items/Buffs (Snapshotted at time of completion)  
  activeBuffs: \["owls-eyes", "scholars-candle"\],  
    
  // 8\. Received Rewards  
  rewards: {  
    xp: 15,  
    inkDrops: 10,  
    paperScraps: 5  
  }  
}

## **5\. Implementation Steps for Coding Agent**

1. **API Service:** Create BookMetadataService.js with functions to fetch and parse Google Books and OpenLibrary endpoints based on live search queries.  
2. **CSS Animation:** Create .tome-card, .tome-card-inner, .tome-card-front, and .tome-card-back CSS classes in library.css utilizing backface-visibility: hidden and transform: rotateY(180deg).  
3. **UI Refactoring (Archive):** Update dungeonArchiveCardsViewModel.js and questArchiveCardsViewModel.js (and their respective renderers) to output the new HTML card structure instead of the current static posters.  
4. **Quest Form Logic:** Update the Quest Edit drawer to include a live-search input for the Book Name. When a result is selected, intercept the API page count, pass it through the active Keeper Loadout to calculate the pageCountEffective, and populate the form fields.