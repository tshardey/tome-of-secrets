import { 
    dungeonRewards, 
    dungeonRooms, 
    dungeonCompletionRewards,
    genreQuests,
    allGenres,
    atmosphericBuffs,
    sideQuestsDetailed,
    curseTableDetailed 
} from './character-sheet/data.js';

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
 * Renders dungeon rooms table
 */
export function renderDungeonRoomsTable() {
    let html = `
<table>
  <thead>
    <tr>
      <th>Roll</th>
      <th>Room Description & Encounters</th>
    </tr>
  </thead>
  <tbody>`;

    for (let i = 1; i <= 12; i++) {
        const room = dungeonRooms[i.toString()];
        html += `
    <tr>
      <td><strong>${i}</strong></td>
      <td>
        <strong>${room.name}:</strong> ${room.description}
        <br><strong>Challenge:</strong> ${room.challenge}`;
        
        // Display room rewards
        if (room.roomRewards) {
            const rewards = [];
            if (room.roomRewards.xp > 0) rewards.push(`+${room.roomRewards.xp} XP`);
            if (room.roomRewards.inkDrops > 0) rewards.push(`+${room.roomRewards.inkDrops} Ink Drops`);
            if (room.roomRewards.paperScraps > 0) rewards.push(`+${room.roomRewards.paperScraps} Paper Scraps`);
            if (room.roomRewards.items && room.roomRewards.items.length > 0) {
                room.roomRewards.items.forEach(item => rewards.push(item));
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
                html += `
            <tr>`;
                if (encounter.roll) {
                    html += `
              <td>${encounter.roll}</td>`;
                }
                html += `
              <td><strong>`;
                
                if (encounter.hasLink && encounter.link) {
                    html += `<a href="${encounter.link.url}">${encounter.name}</a>`;
                } else {
                    html += encounter.name;
                }
                
                html += ` (${encounter.type}):</strong> ${encounter.description}`;
                
                if (encounter.defeat) {
                    html += `
                <br><strong>Defeat:</strong> ${encounter.defeat}`;
                }
                
                if (encounter.befriend) {
                    html += `
                <br><strong>Befriend:</strong> ${encounter.befriend}`;
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

    for (let i = 1; i <= 10; i++) {
        const reward = dungeonCompletionRewards[i.toString()];
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
        let rewardText = quest.reward;
        
        if (quest.hasLink && quest.link) {
            rewardText = rewardText.replace(
                quest.link.text,
                `<a href="${quest.link.url}">${quest.link.text}</a>`
            );
        }
        
        html += `
    <tr>
      <td><strong>${i}</strong></td>
      <td><strong>${quest.name}:</strong> ${quest.description} <strong>Prompt:</strong> ${quest.prompt} <strong>Reward:</strong> ${rewardText}</td>
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
 * Replace Jekyll template variables in links
 */
function processLinks(html) {
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
}

// Initialize tables when DOM is loaded
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeTables);
    } else {
        initializeTables();
    }
}

