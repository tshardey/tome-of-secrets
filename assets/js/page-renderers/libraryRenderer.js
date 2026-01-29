/**
 * Library Page Renderer
 * 
 * Renders the Library Restoration page including:
 * - Library map with 6 wings
 * - Wing detail panels with rooms and restoration projects
 * - Passive slot management
 * - Blueprint counter
 */

import { wings, restorationProjects, allItems, dungeonRooms } from '../character-sheet/data.js';
import { characterState, loadState } from '../character-sheet/state.js';
import { StateAdapter } from '../character-sheet/stateAdapter.js';
import { RestorationController } from '../controllers/RestorationController.js';
import { RestorationQuestHandler } from '../quest-handlers/RestorationQuestHandler.js';
import { slugifyId } from '../utils/slug.js';
import { safeGetJSON } from '../utils/storage.js';
import { STORAGE_KEYS } from '../character-sheet/storageKeys.js';
import { escapeHtml } from '../utils/sanitize.js';

let restorationController = null;

/**
 * Initialize the library page
 */
export function initializeLibraryPage() {
    // Load state and create controller (may be async due to IndexedDB-backed storage)
    void initializeLibraryPageAsync();
}

async function initializeLibraryPageAsync() {
    await loadState();
    const stateAdapter = new StateAdapter(characterState);
    restorationController = new RestorationController(stateAdapter, null, { 
        data: { allItems },
        saveState: () => {} // Library page doesn't have form to save
    });

    // Render all components
    renderLibraryMap();
    renderProgressBar();

    // Set up event listeners
    setupEventListeners();
}

/**
 * Render the overall progress bar
 */
function renderProgressBar() {
    const state = restorationController.getLibraryState();
    const progressBar = document.getElementById('overall-progress-bar');
    const progressProjects = document.getElementById('progress-projects');
    const progressWings = document.getElementById('progress-wings');

    if (progressBar) {
        progressBar.style.width = `${state.overallProgress.percentComplete}%`;
    }
    if (progressProjects) {
        progressProjects.textContent = `${state.overallProgress.completedProjectCount}/${state.overallProgress.totalProjects}`;
    }
    if (progressWings) {
        progressWings.textContent = `${state.overallProgress.completedWingCount}/${state.overallProgress.totalWings}`;
    }
}

/**
 * Render the library map with wing cards
 */
function renderLibraryMap() {
    const mapContainer = document.getElementById('library-map');
    if (!mapContainer) return;

    const state = restorationController.getLibraryState();
    
    // Create wing cards in a specific layout
    const wingOrder = ['1', '2', '3', '4', '5', '6'];
    
    let html = '<div class="wing-grid">';
    
    for (const wingId of wingOrder) {
        const wingData = state.wingsData[wingId];
        if (!wingData) continue;

        // Wings with alwaysAccessible=true are open by default
        // Other wings are locked until all dungeon rooms in that wing are completed
        const isLocked = !wingData.alwaysAccessible && !wingData.isReadyForRestoration;
        const statusClass = wingData.isComplete ? 'completed' : 
                           wingData.isReadyForRestoration ? 'ready' : 
                           isLocked ? 'locked' : 'in-progress';
        
        const progress = wingData.progress;
        const roomsText = `${progress.completedCount}/${progress.totalRooms} rooms`;
        const projectsCompleted = wingData.projects.filter(p => p.isCompleted).length;
        const projectsTotal = wingData.projects.length;
        const projectsText = `${projectsCompleted}/${projectsTotal} projects`;

        html += `
            <div class="wing-card ${statusClass}" 
                 data-wing-id="${wingId}"
                 style="--wing-primary: ${wingData.colorPalette.primary}; --wing-secondary: ${wingData.colorPalette.secondary}; --wing-accent: ${wingData.colorPalette.accent}">
                <div class="wing-card-header">
                    <span class="wing-number">${wingId}</span>
                    <span class="wing-status-icon">${getStatusIcon(statusClass)}</span>
                </div>
                <h3 class="wing-name">${wingData.name}</h3>
                <p class="wing-genres">${wingData.genres.slice(0, 3).join(' • ')}</p>
                <div class="wing-progress">
                    <div class="wing-progress-bar">
                        <div class="wing-progress-fill" style="width: ${(progress.completedCount / progress.totalRooms) * 100}%"></div>
                    </div>
                    <span class="wing-progress-text">${roomsText}</span>
                </div>
                <div class="wing-projects-status">
                    <span class="projects-text">${projectsText}</span>
                </div>
                ${isLocked ? '<div class="wing-locked-overlay"><span>🔒 Complete all dungeon rooms to unlock</span></div>' : ''}
            </div>
        `;
    }
    
    html += '</div>';
    mapContainer.innerHTML = html;
}

/**
 * Get status icon for wing status
 */
function getStatusIcon(status) {
    switch (status) {
        case 'completed': return '✨';
        case 'ready': return '🔧';
        case 'locked': return '🔒';
        default: return '📖';
    }
}

/**
 * Render wing detail panel
 */
function renderWingDetail(wingId) {
    const panel = document.getElementById('wing-detail-panel');
    const content = document.getElementById('wing-detail-content');
    if (!panel || !content) return;

    const state = restorationController.getLibraryState();
    const wingData = state.wingsData[wingId];
    if (!wingData) return;

    const progress = wingData.progress;
    
    let html = `
        <div class="wing-detail-header" style="--wing-primary: ${wingData.colorPalette.primary}; --wing-accent: ${wingData.colorPalette.accent}">
            <h2>${wingData.name}</h2>
            <p class="wing-theme">${wingData.theme}</p>
            <div class="wing-genres-list">
                ${wingData.genres.map(g => `<span class="genre-tag">${g}</span>`).join('')}
            </div>
        </div>

        <div class="wing-rooms-section">
            <h3>Dungeon Rooms</h3>
            <div class="rooms-grid">
                ${progress.rooms.map(room => renderRoomCard(room)).join('')}
            </div>
        </div>

        <div class="wing-projects-section">
            <h3>Restoration Projects</h3>
            ${wingData.isReadyForRestoration 
                ? '<p class="projects-available">All rooms complete! Restoration projects are available.</p>'
                : wingData.alwaysAccessible
                ? '<p class="projects-available">Restoration projects are available.</p>'
                : '<p class="projects-locked">Complete all dungeon rooms in this wing to unlock restoration projects.</p>'
            }
            <div class="projects-grid">
                ${wingData.projects.map(project => renderProjectCard(project, wingData.isReadyForRestoration, state.blueprints)).join('')}
            </div>
        </div>
    `;

    content.innerHTML = html;
    panel.style.display = 'block';
    
    // Add project click handlers
    setupProjectHandlers();
}

/**
 * Render a room card
 */
function renderRoomCard(room) {
    const statusClass = room.completion.isCompleted ? 'completed' : 
                       room.completion.challengeCompleted ? 'partial' : 'locked';
    const statusIcon = room.completion.isCompleted ? '✓' : 
                      room.completion.challengeCompleted ? '◐' : '○';
    
    return `
        <div class="room-card ${statusClass}">
            <div class="room-number">${room.roomNumber}</div>
            <div class="room-name">${room.roomData.name}</div>
            <div class="room-status">
                <span class="status-icon">${statusIcon}</span>
                ${room.completion.challengeCompleted ? '<span class="challenge-done">Challenge ✓</span>' : ''}
                ${room.completion.encountersCompleted > 0 ? `<span class="encounters-done">${room.completion.encountersCompleted} encounter(s) ✓</span>` : ''}
            </div>
        </div>
    `;
}

/**
 * Render a restoration project card
 */
function renderProjectCard(project, isWingReady, blueprints) {
    const canAfford = blueprints >= project.cost;
    const statusClass = project.isCompleted ? 'completed' : 
                       !isWingReady ? 'locked' :
                       canAfford ? 'available' : 'unaffordable';
    
    const rewardText = getRewardText(project.reward);
    
    // Find completed quest for this project to show book info
    const completedBookInfo = getCompletedBookInfo(project.id);
    
    return `
        <div class="project-card ${statusClass}" data-project-id="${project.id}">
            <div class="project-header">
                <h4>${project.name}</h4>
                <span class="project-cost">
                    <span class="blueprint-icon">📜</span> ${project.cost}
                </span>
            </div>
            <p class="project-description">${project.description}</p>
            <div class="project-prompt">
                <strong>To Complete:</strong> ${project.completionPrompt}
            </div>
            <div class="project-reward">
                <strong>Reward:</strong> ${rewardText}
            </div>
            ${!project.isCompleted && isWingReady ? `
                <button class="add-to-quest-tracker-btn" 
                        data-project-id="${project.id}"
                        data-wing-id="${project.wingId}">
                    Add to Quest Tracker
                </button>
            ` : ''}
            ${project.isCompleted ? `
                <div class="completed-badge">✓ Completed</div>
                ${completedBookInfo ? `
                    <div class="completed-book-info">
                        <strong>Completed with:</strong> ${completedBookInfo}
                    </div>
                ` : ''}
            ` : ''}
        </div>
    `;
}

/**
 * Get completed book info for a restoration project
 */
function getCompletedBookInfo(projectId) {
    const completedQuests = safeGetJSON(STORAGE_KEYS.COMPLETED_QUESTS, []);
    
    // Find quests that match this restoration project
    const matchingQuest = completedQuests.find(quest => 
        quest.type === '🔨 Restoration Project' &&
        quest.restorationData?.projectId === projectId &&
        quest.book
    );
    
    if (!matchingQuest) return null;
    
    const bookTitle = matchingQuest.book;
    const bookAuthor = matchingQuest.bookAuthor;
    
    if (bookAuthor) {
        return `<em>${bookTitle}</em> by ${bookAuthor}`;
    }
    return `<em>${bookTitle}</em>`;
}

/**
 * Get reward text for a project
 */
function getRewardText(reward) {
    if (!reward) return 'Unknown reward';
    
    switch (reward.type) {
        case 'passiveItemSlot':
            return 'Unlock a display slot';
        case 'passiveFamiliarSlot':
            return 'Unlock an adoption slot';
        case 'special':
            return reward.description || 'Special reward';
        default:
            return reward.type ? `Unlock ${reward.type}` : 'Special reward';
    }
}


/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Wing card clicks
    document.querySelectorAll('.wing-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const wingId = card.dataset.wingId;
            if (!card.classList.contains('locked')) {
                renderWingDetail(wingId);
            }
        });
    });

    // Close panel button
    const closeBtn = document.getElementById('close-wing-panel');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const panel = document.getElementById('wing-detail-panel');
            if (panel) panel.style.display = 'none';
        });
    }

    // Passive slot selects
    setupPassiveSlotHandlers();
}

/**
 * Set up project completion handlers
 */
function setupProjectHandlers() {
    // Handle "Add to Quest Tracker" buttons
    document.querySelectorAll('.add-to-quest-tracker-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const projectId = btn.dataset.projectId;
            const wingId = btn.dataset.wingId;
            
            // Check if player has enough blueprints
            const state = restorationController.getLibraryState();
            const project = restorationProjects[projectId];
            const currentBlueprints = state.blueprints;
            const cost = project?.cost || 0;
            
            if (currentBlueprints < cost) {
                const needed = cost - currentBlueprints;
                showNotification(`You need ${needed} more Dusty Blueprints to start this project. (Cost: ${cost}, You have: ${currentBlueprints})`, 'error');
                return;
            }
            
            // Create a quest for this restoration project
            const quest = createRestorationQuest(projectId, wingId);
            
            if (quest) {
                // Add to active quests
                const stateAdapter = new StateAdapter(characterState);
                stateAdapter.addActiveQuests([quest]);
                
                // Save state
                if (restorationController && restorationController.saveState) {
                    restorationController.saveState();
                }
                
                showNotification('Quest added to tracker! Complete it in the Character Sheet.', 'success');
                
                // Optionally redirect to character sheet
                const shouldRedirect = confirm('Quest added! Open Character Sheet to complete it?');
                if (shouldRedirect) {
                    const baseUrl = window.location.origin + window.location.pathname.split('/library.html')[0];
                    window.location.href = baseUrl + '/character-sheet.html';
                }
            } else {
                showNotification('Failed to create quest. Please try again.', 'error');
            }
        });
    });
}

/**
 * Create a quest object for a restoration project
 */
function createRestorationQuest(projectId, wingId) {
    const project = restorationProjects[projectId];
    const wing = wings[wingId];
    
    if (!project || !wing) return null;
    
    // Get current date for month/year
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    
    // Build the prompt from the project's completion prompt
    const prompt = `${project.name}: ${project.completionPrompt}`;
    
    // Create quest object matching the format expected by the quest system
    const quest = {
        month: String(month),
        year: String(year),
        type: '🔨 Restoration Project',
        prompt: prompt,
        book: '',
        bookAuthor: '',
        notes: '',
        status: 'active',
        rewards: {
            xp: 0,
            inkDrops: 0,
            paperScraps: 0,
            blueprints: 0,
            items: []
        },
        buffs: [],
        restorationData: {
            wingId: wingId,
            wingName: wing?.name || '',
            projectId: projectId,
            projectName: project.name,
            cost: project.cost || 0,
            rewardType: project.reward?.type || null,
            rewardSuggestedItems: project.reward?.suggestedItems || []
        }
    };
    
    return quest;
}

/**
 * Set up passive slot handlers
 */
function setupPassiveSlotHandlers() {
    // Passive slot management removed - handled in character sheet now
}

/**
 * Show a notification
 */
function showNotification(message, type = 'success') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `library-notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => notification.classList.add('visible'), 10);
    
    // Remove after delay
    setTimeout(() => {
        notification.classList.remove('visible');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

