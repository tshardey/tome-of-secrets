import { 
    dungeonRewards, 
    dungeonRooms, 
    dungeonCompletionRewards,
    genreQuests,
    allGenres,
    atmosphericBuffs,
    sideQuestsDetailed,
    curseTableDetailed,
    allItems,
    levelRewards,
    xpLevels,
    wings
} from './character-sheet/data.js';
import { slugifyId } from './utils/slug.js';
import { STORAGE_KEYS } from './character-sheet/storageKeys.js';
import { characterState, loadState } from './character-sheet/state.js';
import { safeGetJSON } from './utils/storage.js';

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toAnchorId(name) {
    return slugifyId(name);
}

// Replace item names appearing in free-form text with links to rewards anchors
function linkifyItems(text) {
    if (!text) return text;
    let result = text;
    for (const itemName of Object.keys(allItems)) {
        const anchorId = toAnchorId(itemName);
        const pattern = new RegExp(`\\b${escapeRegExp(itemName)}\\b`, 'g');
        result = result.replace(pattern, `<a href="{{ site.baseurl }}/rewards.html#${anchorId}">${itemName}</a>`);
    }
    return result;
}

/**
 * Get completed quests from in-memory state
 * @returns {Array} Array of completed quest objects
 */
function getCompletedQuests() {
    // Prefer localStorage if the legacy key exists (tests and pre-migration saves).
    // After migration, `completedQuests` is removed from localStorage and we fall back to in-memory state
    // (which was loaded from IndexedDB via `loadState()`).
    const legacy = safeGetJSON(STORAGE_KEYS.COMPLETED_QUESTS, null);
    if (legacy !== null) {
        return Array.isArray(legacy) ? legacy : [];
    }
    return characterState[STORAGE_KEYS.COMPLETED_QUESTS] || [];
}

/**
 * Check if a dungeon room is completed
 * A room is considered completed if both the challenge and at least one encounter are completed
 * @param {string} roomNumber - Room number (1-12)
 * @returns {Object} { isCompleted: boolean, completedEncounters: Set<string> }
 */
function checkDungeonRoomCompletion(roomNumber) {
    const completedQuests = getCompletedQuests();
    const completedEncounters = new Set();
    let challengeCompleted = false;
    const room = dungeonRooms[roomNumber];
    if (!room) return { isCompleted: false, completedEncounters, challengeCompleted };
    
    for (const quest of completedQuests) {
        if (quest.type !== '♠ Dungeon Crawl') continue;
        
        // Primary check: use roomNumber and isEncounter if available
        if (quest.roomNumber === roomNumber) {
            if (quest.isEncounter === false) {
                // This is the room challenge
                challengeCompleted = true;
            } else if (quest.isEncounter === true && quest.encounterName) {
                // This is an encounter
                completedEncounters.add(quest.encounterName);
            }
        }
        
        // Fallback: match by prompt text for older quests that might not have roomNumber/isEncounter
        // Only use fallback if quest doesn't have roomNumber, or if roomNumber matches current room
        const canUseFallback = !quest.roomNumber || quest.roomNumber === roomNumber;
        
        if (canUseFallback && !challengeCompleted && quest.prompt === room.challenge) {
            challengeCompleted = true;
        }
        
        // Fallback: match encounters by prompt text (for older quests or when roomNumber/isEncounter not set)
        // CRITICAL: Only use fallback if quest doesn't have roomNumber, or if roomNumber matches current room
        // This prevents matching encounters from other rooms that share the same prompt (e.g., Banshee in Room 4 and Room 7)
        if (canUseFallback && room.encounters) {
            // Check against the encounters object which has the full prompts
            for (const encounterName in room.encounters) {
                const encounterData = room.encounters[encounterName];
                if (encounterData.defeat && quest.prompt === encounterData.defeat) {
                    completedEncounters.add(encounterName);
                }
                if (encounterData.befriend && quest.prompt === encounterData.befriend) {
                    completedEncounters.add(encounterName);
                }
            }
        }
        
        // Also check encountersDetailed for additional matching
        // CRITICAL: Only use fallback if quest doesn't have roomNumber, or if roomNumber matches current room
        if (canUseFallback && room.encountersDetailed) {
            for (const encounter of room.encountersDetailed) {
                // Check if quest prompt matches encounter defeat or befriend prompt
                // Note: encountersDetailed has defeat/befriend without name prefix
                if (encounter.defeat && quest.prompt && quest.prompt.includes(encounter.name) && quest.prompt.includes(encounter.defeat)) {
                    completedEncounters.add(encounter.name);
                }
                if (encounter.befriend && quest.prompt && quest.prompt.includes(encounter.name) && quest.prompt.includes(encounter.befriend)) {
                    completedEncounters.add(encounter.name);
                }
            }
        }
    }
    
    // Room is completed if challenge is done and at least one encounter is done
    const isCompleted = challengeCompleted && completedEncounters.size > 0;
    
    return { isCompleted, completedEncounters, challengeCompleted };
}

/**
 * Check if a side quest is completed
 * @param {string} sideQuestNumber - Side quest number (1-8)
 * @returns {boolean} True if the side quest is completed
 */
function checkSideQuestCompletion(sideQuestNumber) {
    const completedQuests = getCompletedQuests();
    const sideQuest = sideQuestsDetailed[sideQuestNumber];
    if (!sideQuest) return false;
    
    // The quest prompt is stored as "Name: prompt" format (from sideQuests[key])
    // We need to match against this format
    const expectedPrompt = `${sideQuest.name}: ${sideQuest.prompt}`;
    
    for (const quest of completedQuests) {
        if (quest.type !== '♣ Side Quest') continue;
        
        // Primary check: exact prompt match (with name prefix)
        if (quest.prompt === expectedPrompt) {
            return true;
        }
        
        // Fallback: match if prompt starts with quest name and colon, followed by prompt text
        // This handles cases like "The Arcane Grimoire: Read the book..." matching "Read the book..."
        // Only match if the prompt includes the quest name to avoid false positives
        if (quest.prompt && quest.prompt.includes(sideQuest.name)) {
            const namePrefix = `${sideQuest.name}: `;
            if (quest.prompt.startsWith(namePrefix) && 
                quest.prompt.substring(namePrefix.length).trim() === sideQuest.prompt.trim()) {
                return true;
            }
        }
    }
    
    return false;
}

/**
 * Renders dungeon rewards table
 */
export function renderDungeonRewardsTable() {
    return `
<table>
  <thead>
    <tr>
      <th>Encounter Type</th>
      <th>Reward</th>
      <th>Penalty (on Failure)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>Book Completion</strong></td>
      <td>${dungeonRewards.bookCompletion.reward}</td>
      <td>${dungeonRewards.bookCompletion.penalty}</td>
    </tr>
    <tr>
      <td><strong>Monster</strong></td>
      <td>${dungeonRewards.monster.reward}</td>
      <td>${dungeonRewards.monster.penalty}</td>
    </tr>
    <tr>
      <td><strong>Friendly Creature</strong></td>
      <td>${dungeonRewards.friendlyCreature.reward}</td>
      <td>${dungeonRewards.friendlyCreature.penalty}</td>
    </tr>
    <tr>
      <td><strong>Familiar</strong></td>
      <td>${dungeonRewards.familiar.reward}</td>
      <td>${dungeonRewards.familiar.penalty}</td>
    </tr>
  </tbody>
</table>
    `;
}

/**
 * Get wing info for a room
 * @param {string} roomNumber - Room number as string
 * @returns {Object|null} Wing info or null
 */
function getWingForRoom(roomNumber) {
    for (const wingId in wings) {
        const wing = wings[wingId];
        if (wing.rooms && wing.rooms.includes(roomNumber)) {
            return { wingId, ...wing };
        }
    }
    return null;
}

/**
 * Renders dungeon rooms table
 */
export function renderDungeonRoomsTable() {
    // Determine how many rooms to show (all rooms in dungeonRooms)
    const roomNumbers = Object.keys(dungeonRooms).map(Number).sort((a, b) => a - b);
    const maxRoom = Math.max(...roomNumbers);
    
    let html = `
<table>
  <thead>
    <tr>
      <th>Roll</th>
      <th>Wing</th>
      <th>Room Description & Encounters</th>
    </tr>
  </thead>
  <tbody>`;

    for (let i = 1; i <= maxRoom; i++) {
        const room = dungeonRooms[i.toString()];
        if (!room) continue;
        
        const roomCompletion = checkDungeonRoomCompletion(i.toString());
        
        // Get wing info
        const wing = getWingForRoom(i.toString());
        
        // Build row styling - use wing colors for background
        let rowStyle = '';
        let rowClass = '';
        if (roomCompletion.isCompleted) {
            rowClass = 'class="completed-room"';
            rowStyle = 'style="opacity: 0.6;"';
        } else if (wing) {
            // Apply wing color as subtle row background
            rowStyle = `style="background: linear-gradient(90deg, ${wing.colorPalette.primary}15 0%, ${wing.colorPalette.secondary}10 100%); border-left: 4px solid ${wing.colorPalette.primary};"`;
        }
        
        const wingName = wing ? wing.name.replace('The ', '') : '';
        
        html += `
    <tr ${rowClass} ${rowStyle}>
      <td><strong>${i}</strong></td>
      <td style="color: ${wing ? wing.colorPalette.primary : 'inherit'}; font-weight: 600;">${wingName}</td>
      <td>
        <strong>${room.name}:</strong> ${room.description}
        <br><strong>Challenge:</strong> ${room.challenge}${roomCompletion.challengeCompleted ? ' ✓' : ''}`;
        
        // Display room rewards
        if (room.roomRewards) {
            const rewards = [];
            if (room.roomRewards.xp > 0) rewards.push(`+${room.roomRewards.xp} XP`);
            if (room.roomRewards.inkDrops > 0) rewards.push(`+${room.roomRewards.inkDrops} Ink Drops`);
            if (room.roomRewards.paperScraps > 0) rewards.push(`+${room.roomRewards.paperScraps} Paper Scraps`);
            if (room.roomRewards.items && room.roomRewards.items.length > 0) {
                room.roomRewards.items.forEach(item => {
                    // Check if item exists in allItems and create a link
                    if (allItems[item]) {
                        // Convert item name to anchor ID (e.g., "Gilded Painting" -> "gilded-painting")
                        const anchorId = item.toLowerCase()
                            .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
                            .replace(/\s+/g, '-') // Replace spaces with hyphens
                            .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
                        const link = `<a href="{{ site.baseurl }}/rewards.html#${anchorId}">${item}</a>`;
                        rewards.push(link);
                    } else {
                        rewards.push(item);
                    }
                });
            }
            if (room.roomRewards.special) rewards.push(room.roomRewards.special);
            
            if (rewards.length > 0) {
                html += `
        <br><strong>Room Reward:</strong> ${rewards.join(', ')}`;
            }
        }
        
        if (room.encountersDetailed && room.encountersDetailed.length > 0) {
            if (room.rollInstruction) {
                html += `
        <br><em>${room.rollInstruction}</em>`;
            }
            html += `
        <table class="nested-table">
          <tbody>`;
            
            room.encountersDetailed.forEach(encounter => {
                const isEncounterCompleted = roomCompletion.completedEncounters.has(encounter.name);
                const encounterCheckmark = isEncounterCompleted ? ' ✓' : '';
                
                html += `
            <tr>`;
                if (encounter.roll) {
                    html += `
              <td>${encounter.roll}</td>`;
                }
                // Build encounter name, linking familiars to rewards page
                let encounterNameHtml = encounter.name;
                if (encounter.type === 'Familiar' && allItems[encounter.name]) {
                    const anchorId = toAnchorId(encounter.name);
                    encounterNameHtml = `<a href="{{ site.baseurl }}/rewards.html#${anchorId}">${encounter.name}</a>`;
                }
                html += `
              <td><strong>${encounterNameHtml} (${encounter.type}):</strong>${encounterCheckmark} ${encounter.description}`;
                
                if (encounter.defeat) {
                    html += `
                <br><strong>Defeat:</strong> ${linkifyItems(encounter.defeat)}`;
                }
                
                if (encounter.befriend) {
                    html += `
                <br><strong>Befriend:</strong> ${linkifyItems(encounter.befriend)}`;
                }
                
                html += `</td>
            </tr>`;
            });
            
            html += `
          </tbody>
        </table>`;
        }
        
        html += `
      </td>
    </tr>`;
    }

    html += `
  </tbody>
</table>`;
    
    return html;
}

/**
 * Renders dungeon completion rewards table
 */
export function renderDungeonCompletionRewardsTable() {
    let html = `
<table>
  <thead>
    <tr>
      <th>Roll</th>
      <th>Reward</th>
    </tr>
  </thead>
  <tbody>`;

    // Get all rewards (d20 table)
    const rewardKeys = Object.keys(dungeonCompletionRewards).map(Number).sort((a, b) => a - b);
    const maxReward = Math.max(...rewardKeys);
    
    for (let i = 1; i <= maxReward; i++) {
        const reward = dungeonCompletionRewards[i.toString()];
        if (!reward) continue;
        let rewardText = reward.reward;
        
        if (reward.hasLink && reward.link) {
            rewardText = rewardText.replace(
                reward.link.text, 
                `<a href="${reward.link.url}">${reward.link.text}</a>`
            );
        }
        
        html += `
    <tr>
      <td><strong>${i}</strong></td>
      <td><strong>${reward.name}:</strong> ${rewardText}</td>
    </tr>`;
    }

    html += `
  </tbody>
</table>`;
    
    return html;
}

/**
 * Renders genre quests table
 */
export function renderGenreQuestsTable() {
    let html = `
<table>
  <thead>
    <tr>
      <th>Roll</th>
      <th>Quest Description</th>
    </tr>
  </thead>
  <tbody>`;

    // Show all available genres for reference
    const genreList = Object.keys(allGenres);
    for (let i = 0; i < genreList.length; i++) {
        const genre = genreList[i];
        html += `
    <tr>
      <td><strong>${i + 1}</strong></td>
      <td><strong>${genre}:</strong> ${allGenres[genre]}</td>
    </tr>`;
    }

    html += `
  </tbody>
</table>`;
    
    return html;
}

/**
 * Renders atmospheric buffs table
 */
export function renderAtmosphericBuffsTable() {
    let html = `
<table>
  <thead>
    <tr>
      <th>Roll</th>
      <th>Buff Description</th>
    </tr>
  </thead>
  <tbody>`;

    const buffNames = [
        "The Candlight Study",
        "The Herbalist's Nook",
        "The Soundscape Spire",
        "The Excavation",
        "The Cozy Hearth",
        "The Soaking in Nature",
        "The Wanderer's Path",
        "Head in the Clouds"
    ];

    for (let i = 0; i < buffNames.length; i++) {
        const buff = atmosphericBuffs[buffNames[i]];
        html += `
    <tr>
      <td><strong>${i + 1}</strong></td>
      <td><strong>${buffNames[i]}:</strong> ${buff.description}</td>
    </tr>`;
    }

    html += `
  </tbody>
</table>`;
    
    return html;
}

/**
 * Renders side quests table
 */
export function renderSideQuestsTable() {
    let html = `
<table>
  <thead>
    <tr>
      <th>Roll</th>
      <th>Quest Description</th>
    </tr>
  </thead>
  <tbody>`;

    for (let i = 1; i <= 8; i++) {
        const quest = sideQuestsDetailed[i.toString()];
        const isCompleted = checkSideQuestCompletion(i.toString());
        const rowClass = isCompleted ? 'class="completed-quest"' : '';
        const rowStyle = isCompleted ? 'style="opacity: 0.6; color: #999;"' : '';
        const checkmark = isCompleted ? ' ✓' : '';
        
        let rewardText = quest.reward;
        
        if (quest.hasLink && quest.link) {
            rewardText = rewardText.replace(
                quest.link.text,
                `<a href="${quest.link.url}">${quest.link.text}</a>`
            );
        }
        
        html += `
    <tr ${rowClass} ${rowStyle}>
      <td><strong>${i}</strong></td>
      <td><strong>${quest.name}:</strong>${checkmark} ${quest.description} <strong>Prompt:</strong> ${quest.prompt} <strong>Reward:</strong> ${rewardText}</td>
    </tr>`;
    }

    html += `
  </tbody>
</table>`;
    
    return html;
}

/**
 * Renders curse table as a numbered list
 */
export function renderCurseTable() {
    let html = '<ol>';
    
    curseTableDetailed.forEach(curse => {
        html += `
  <li><strong>${curse.name}:</strong> ${curse.description}</li>`;
    });
    
    html += '\n</ol>';
    
    return html;
}

/**
 * Renders leveling rewards table
 */
export function renderLevelingRewardsTable() {
    let html = `
<table class="tracker-table">
  <thead>
    <tr>
      <th>Level</th>
      <th>XP Needed (Cumulative)</th>
      <th>Ink Drops Reward</th>
      <th>Paper Scraps Reward</th>
      <th>New Item/Familiar Slot</th>
      <th>School Mastery Point (SMP)</th>
    </tr>
  </thead>
  <tbody>
`;
    
    let totalSlots = 3; // Starting slots at level 1
    
    for (let level = 1; level <= 20; level++) {
        const levelStr = String(level);
        const rewards = levelRewards[levelStr];
        
        if (!rewards) continue;
        
        // Calculate total slots up to this level
        if (rewards.inventorySlot > 0) {
            totalSlots += rewards.inventorySlot;
        }
        
        // Format XP needed - xpLevels[1] is the XP needed to reach level 2, so for level N we need xpLevels[N-1]
        // Level 1 has 0 XP needed (starting level)
        let xpDisplay = '0';
        if (level === 1) {
            xpDisplay = '0';
        } else {
            const xpNeeded = xpLevels[level - 1];
            xpDisplay = xpNeeded === "Max" ? "Max" : xpNeeded.toLocaleString();
        }
        
        // Format ink drops
        const inkDisplay = rewards.inkDrops > 0 ? `+${rewards.inkDrops}` : '0';
        
        // Format paper scraps
        const paperDisplay = rewards.paperScraps > 0 ? `+${rewards.paperScraps}` : '0';
        
        // Format slot (show total if slot was added, otherwise "-")
        let slotDisplay = '-';
        if (level === 1) {
            slotDisplay = '3';
        } else if (rewards.inventorySlot > 0) {
            slotDisplay = `+1 (${totalSlots} total)`;
        }
        
        // Format SMP
        const smpDisplay = rewards.smp > 0 ? String(rewards.smp) : '-';
        
        html += `
    <tr>
      <td>${level}</td>
      <td>${xpDisplay}</td>
      <td>${inkDisplay}</td>
      <td>${paperDisplay}</td>
      <td>${slotDisplay}</td>
      <td>${smpDisplay}</td>
    </tr>
`;
    }
    
    html += `
  </tbody>
</table>
`;
    
    return html;
}

/**
 * Replace Jekyll template variables in links
 */
export function processLinks(html) {
    // Get the base URL from the page's meta tag or infer from current path
    let baseurl = '';
    const metaBase = document.querySelector('meta[name="baseurl"]');
    if (metaBase) {
        baseurl = metaBase.content;
    } else {
        // Infer from current path (works for GitHub Pages)
        const path = window.location.pathname;
        // Match a directory path, not a file path
        // e.g., /tome-of-secrets/dungeons.html -> /tome-of-secrets
        // but /dungeons.html -> empty (root level)
        const match = path.match(/^(\/[^\/]+)(?=\/)/);
        if (match) {
            baseurl = match[1];
        }
    }
    
    // Replace all instances of {{ site.baseurl }} with the actual baseurl
    return html.replace(/\{\{\s*site\.baseurl\s*\}\}/g, baseurl);
}

/**
 * Initialize all tables on the page
 */
export function initializeTables() {
    // Note: this is now async internally (IndexedDB-backed state load), but we keep the API
    // compatible by delegating to an async worker.
    void initializeTablesAsync();
}

async function initializeTablesAsync() {
    // Ensure character state is loaded before we read completion data for table highlighting.
    await loadState();

    // Dungeon page
    const dungeonRewardsEl = document.getElementById('dungeon-rewards-table');
    if (dungeonRewardsEl) {
        dungeonRewardsEl.innerHTML = processLinks(renderDungeonRewardsTable());
    }
    
    const dungeonRoomsEl = document.getElementById('dungeon-rooms-table');
    if (dungeonRoomsEl) {
        dungeonRoomsEl.innerHTML = processLinks(renderDungeonRoomsTable());
    }
    
    const dungeonCompletionEl = document.getElementById('dungeon-completion-rewards-table');
    if (dungeonCompletionEl) {
        dungeonCompletionEl.innerHTML = processLinks(renderDungeonCompletionRewardsTable());
    }
    
    // Quests page
    const genreQuestsEl = document.getElementById('genre-quests-table');
    if (genreQuestsEl) {
        genreQuestsEl.innerHTML = processLinks(renderGenreQuestsTable());
    }
    
    const atmosphericBuffsEl = document.getElementById('atmospheric-buffs-table');
    if (atmosphericBuffsEl) {
        atmosphericBuffsEl.innerHTML = processLinks(renderAtmosphericBuffsTable());
    }
    
    const sideQuestsEl = document.getElementById('side-quests-table');
    if (sideQuestsEl) {
        sideQuestsEl.innerHTML = processLinks(renderSideQuestsTable());
    }
    
    // Shroud page
    const curseTableEl = document.getElementById('curse-table');
    if (curseTableEl) {
        curseTableEl.innerHTML = processLinks(renderCurseTable());
    }
    
    // Leveling page
    const levelingRewardsEl = document.getElementById('leveling-rewards-table');
    if (levelingRewardsEl) {
        levelingRewardsEl.innerHTML = processLinks(renderLevelingRewardsTable());
    }
}

// Initialize tables when DOM is loaded
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeTables);
    } else {
        initializeTables();
    }
}

