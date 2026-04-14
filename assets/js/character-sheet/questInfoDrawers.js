/**
 * Quest info drawers initialization.
 * Manages info drawers for genre quests, atmospheric buffs, side quests, dungeons,
 * keeper backgrounds, wizard schools, and library sanctums.
 */

import { DrawerManager } from '../ui/DrawerManager.js';

export async function initializeQuestInfoDrawers(updateCurrency, uiModule, mainStateAdapter) {
    const { renderGenreQuestsTable, renderAtmosphericBuffsTable, renderSideQuestsTable, renderDungeonRewardsTable, renderDungeonRoomsTable, renderDungeonCompletionRewardsTable, processLinks } = await import('../table-renderer.js');
    const { characterState } = await import('./state.js');
    const { safeGetJSON, safeSetJSON } = await import('../utils/storage.js');
    const { STORAGE_KEYS } = await import('./storageKeys.js');
    const dataModule = await import('./data.js');
    const allGenres = dataModule.allGenres;
    const stateAdapter = mainStateAdapter;
    const { canClaimRoomReward, applyDungeonCompletionReward, getDungeonCompletionRewardByRoll, getDungeonCompletionRewardCardImage } = await import('../services/DungeonRewardService.js');
    const { toast } = await import('../ui/toast.js');
    const { toLocalOrCdnUrl } = await import('../utils/imageCdn.js');

    // Helper function to process links
    function processLinksHelper(html) {
        const metaBase = document.querySelector('meta[name="baseurl"]');
        const baseurl = metaBase ? metaBase.content : '';
        return html.replace(/\{\{\s*site\.baseurl\s*\}\}/g, baseurl);
    }

    // Function to render selected genres table
    function renderSelectedGenresTable() {
        const selectedGenres = stateAdapter.getSelectedGenres();

        if (selectedGenres.length === 0) {
            return '<p class="no-genres-message">No genres selected. Use the genre selection controls below to add genres.</p>';
        }

        let html = `<table class="tracker-table">
  <thead>
    <tr>
      <th>Roll</th>
      <th>Quest Description</th>
    </tr>
  </thead>
  <tbody>`;

        selectedGenres.forEach((genre, index) => {
            html += `
    <tr>
      <td><strong>${index + 1}</strong></td>
      <td><strong>${genre}:</strong> ${allGenres[genre] || 'No description'}</td>
    </tr>`;
        });

        html += `
  </tbody>
</table>`;

        return html;
    }

    // Function to render genre selection UI
    function renderGenreSelectionUI() {
        const selectedGenres = stateAdapter.getSelectedGenres();
        const allGenreKeys = Object.keys(allGenres);
        const availableGenres = allGenreKeys.filter(g => !selectedGenres.includes(g));

        let html = `
            <div class="genre-selection-overlay-section" style="margin-top: 24px; padding-top: 24px; border-top: 2px solid #54483b;">
                <h3>📚 Choose Your Genres</h3>
                <p class="description">Select as many genres as you like for your "Organize the Stacks" quests. Use <strong>Select All</strong> to add every genre, or pick individually.</p>

                <div class="selected-genres-display-overlay" style="margin-bottom: 15px; min-height: 50px; padding: 10px; background: rgba(84, 72, 59, 0.2); border-radius: 4px;">
                    <strong>Selected Genres (${selectedGenres.length}${allGenreKeys.length ? ` of ${allGenreKeys.length}` : ''}):</strong>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                        ${selectedGenres.length === 0
                            ? '<span style="color: #999; font-style: italic;">No genres selected yet.</span>'
                            : selectedGenres.map((genre, idx) => `
                                <span class="selected-genre-tag" style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; background: rgba(184, 159, 98, 0.3); border: 1px solid #b89f62; border-radius: 4px;">
                                    ${genre}
                                    <button type="button" class="remove-genre-drawer-btn" data-index="${idx}" style="background: none; border: none; color: #b89f62; cursor: pointer; font-size: 1.2em; padding: 0; width: 20px; height: 20px; line-height: 1;">×</button>
                                </span>
                            `).join('')
                        }
                    </div>
                </div>

                <div class="add-genre-controls" style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                    <select id="drawer-genre-selector" class="rpg-select" style="flex: 1; min-width: 160px;">
                        <option value="">-- Select a genre to add --</option>
                        ${availableGenres.map(genre => `<option value="${genre}">${genre}</option>`).join('')}
                    </select>
                    <button type="button" id="drawer-add-genre-button" class="rpg-btn rpg-btn-primary" ${availableGenres.length === 0 ? 'disabled' : ''}>Add Genre</button>
                    <button type="button" id="drawer-select-all-genres-button" class="rpg-btn rpg-btn-secondary" ${availableGenres.length === 0 ? 'disabled' : ''}>Select All</button>
                </div>
            </div>`;

        return html;
    }

    // Function to setup genre selection listeners for drawer
    // Uses a single delegated click handler to avoid stacking listeners when the drawer is reopened.
    function setupGenreSelectionListenersDrawer(container) {
        const genreSelector = container.querySelector('#drawer-genre-selector');
        const addButton = container.querySelector('#drawer-add-genre-button');
        const selectAllButton = container.querySelector('#drawer-select-all-genres-button');
        const allGenreKeys = Object.keys(allGenres);

        function updateGenreSelectionUI() {
            const selectedGenres = stateAdapter.getSelectedGenres();
            const availableGenres = allGenreKeys.filter(g => !selectedGenres.includes(g));

            const displayDiv = container.querySelector('.selected-genres-display-overlay');
            if (displayDiv) {
                displayDiv.innerHTML = `
                    <strong>Selected Genres (${selectedGenres.length}${allGenreKeys.length ? ` of ${allGenreKeys.length}` : ''}):</strong>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                        ${selectedGenres.length === 0
                            ? '<span style="color: #999; font-style: italic;">No genres selected yet.</span>'
                            : selectedGenres.map((genre, idx) => `
                                <span class="selected-genre-tag" style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; background: rgba(184, 159, 98, 0.3); border: 1px solid #b89f62; border-radius: 4px;">
                                    ${genre}
                                    <button type="button" class="remove-genre-drawer-btn" data-index="${idx}" style="background: none; border: none; color: #b89f62; cursor: pointer; font-size: 1.2em; padding: 0; width: 20px; height: 20px; line-height: 1;">×</button>
                                </span>
                            `).join('')
                        }
                    </div>`;
            }

            if (genreSelector) {
                genreSelector.innerHTML = '<option value="">-- Select a genre to add --</option>';
                availableGenres.forEach(genre => {
                    const option = document.createElement('option');
                    option.value = genre;
                    option.textContent = genre;
                    genreSelector.appendChild(option);
                });
            }

            const allSelected = availableGenres.length === 0;
            if (addButton) addButton.disabled = allSelected;
            if (selectAllButton) selectAllButton.disabled = allSelected;
        }

        function refreshTable() {
            const tableContainer = container.querySelector('#genre-quests-table-container');
            if (tableContainer) {
                tableContainer.innerHTML = processLinksHelper(renderSelectedGenresTable());
            }
        }

        // Single delegated click handler: no per-button listeners, so no accumulation when drawer reopens or when updateGenreSelectionUI runs
        const delegatedClickHandler = (e) => {
            const removeBtn = e.target.closest('.remove-genre-drawer-btn');
            if (removeBtn && removeBtn.dataset.index !== undefined) {
                const index = parseInt(removeBtn.dataset.index, 10);
                const selectedGenres = stateAdapter.getSelectedGenres();
                if (index >= 0 && index < selectedGenres.length) {
                    const newGenres = [...selectedGenres];
                    newGenres.splice(index, 1);
                    stateAdapter.setSelectedGenres(newGenres);
                    updateGenreSelectionUI();
                    refreshTable();
                }
                return;
            }
            if (e.target.id === 'drawer-select-all-genres-button') {
                stateAdapter.setSelectedGenres([...allGenreKeys]);
                updateGenreSelectionUI();
                refreshTable();
                return;
            }
            if (e.target.id === 'drawer-add-genre-button' && genreSelector) {
                if (!genreSelector.value) return;
                const selectedGenres = stateAdapter.getSelectedGenres();
                if (selectedGenres.includes(genreSelector.value)) return;
                stateAdapter.setSelectedGenres([...selectedGenres, genreSelector.value]);
                genreSelector.value = '';
                updateGenreSelectionUI();
                refreshTable();
            }
        };

        // Remove any previous handler so we never stack listeners when drawer is reopened
        if (container._genreDrawerClickHandler) {
            container.removeEventListener('click', container._genreDrawerClickHandler);
        }
        container._genreDrawerClickHandler = delegatedClickHandler;
        container.addEventListener('click', delegatedClickHandler);

        updateGenreSelectionUI();
    }

    // Drawer configuration
    const drawerConfig = {
        'genre-quests': {
            backdrop: 'genre-quests-backdrop',
            drawer: 'genre-quests-drawer',
            closeBtn: 'close-genre-quests',
            container: 'genre-quests-table-container',
            renderTable: () => processLinksHelper(renderSelectedGenresTable()),
            renderGenreUI: () => renderGenreSelectionUI(),
            setupGenreListeners: (container) => setupGenreSelectionListenersDrawer(container)
        },
        'atmospheric-buffs': {
            backdrop: 'atmospheric-buffs-info-backdrop',
            drawer: 'atmospheric-buffs-info-drawer',
            closeBtn: 'close-atmospheric-buffs-info',
            container: 'atmospheric-buffs-table-container',
            renderTable: () => processLinksHelper(renderAtmosphericBuffsTable())
        },
        'side-quests': {
            backdrop: 'side-quests-info-backdrop',
            drawer: 'side-quests-info-drawer',
            closeBtn: 'close-side-quests-info',
            container: 'side-quests-table-container',
            renderTable: () => processLinksHelper(renderSideQuestsTable())
        },
        'keeper-backgrounds': {
            backdrop: 'keeper-backgrounds-backdrop',
            drawer: 'keeper-backgrounds-drawer',
            closeBtn: 'close-keeper-backgrounds',
            preRendered: true
        },
        'wizard-schools': {
            backdrop: 'wizard-schools-backdrop',
            drawer: 'wizard-schools-drawer',
            closeBtn: 'close-wizard-schools',
            preRendered: true
        },
        'library-sanctums': {
            backdrop: 'library-sanctums-backdrop',
            drawer: 'library-sanctums-drawer',
            closeBtn: 'close-library-sanctums',
            preRendered: true
        },
        'dungeons': {
            backdrop: 'dungeons-info-backdrop',
            drawer: 'dungeons-info-drawer',
            closeBtn: 'close-dungeons-info',
            containers: {
                rewards: 'dungeon-rewards-table-container',
                rooms: 'dungeon-rooms-table-container',
                completion: 'dungeon-completion-rewards-table-container'
            },
            renderTables: () => ({
                rewards: processLinksHelper(renderDungeonRewardsTable()),
                rooms: processLinksHelper(renderDungeonRoomsTable()),
                completion: processLinksHelper(renderDungeonCompletionRewardsTable())
            }),
            updateDrawsUI: (drawerFromEvent) => {
                const available = stateAdapter.getDungeonCompletionDrawsAvailable();
                const drawer = drawerFromEvent || document.getElementById('dungeons-info-drawer');
                const span = drawer ? drawer.querySelector('#dungeon-completion-draws-available') : document.getElementById('dungeon-completion-draws-available');
                const btn = drawer ? drawer.querySelector('#draw-dungeon-completion-card-btn') : document.getElementById('draw-dungeon-completion-card-btn');
                if (span) span.textContent = String(available);
                if (btn) btn.disabled = available <= 0;
            }
        }
    };

    // Build DrawerManager config from drawerConfig
    const managerConfig = {};
    Object.keys(drawerConfig).forEach(drawerId => {
        const cfg = drawerConfig[drawerId];
        managerConfig[drawerId] = {
            backdrop: cfg.backdrop,
            drawer: cfg.drawer,
            closeBtn: cfg.closeBtn,
            onBeforeOpen: cfg.preRendered ? undefined : (drawerEl) => {
                if (drawerId === 'dungeons') {
                    const tables = cfg.renderTables();
                    const rewardsContainer = document.getElementById(cfg.containers.rewards);
                    const roomsContainer = document.getElementById(cfg.containers.rooms);
                    const completionContainer = document.getElementById(cfg.containers.completion);
                    if (rewardsContainer) rewardsContainer.innerHTML = tables.rewards;
                    if (roomsContainer) roomsContainer.innerHTML = tables.rooms;
                    if (completionContainer) completionContainer.innerHTML = tables.completion;
                    if (cfg.updateDrawsUI) cfg.updateDrawsUI(drawerEl);
                } else if (drawerId === 'genre-quests') {
                    const container = document.getElementById(cfg.container);
                    if (container) {
                        container.innerHTML = cfg.renderTable();
                        // Remove any existing genre selection UI first to prevent duplicates
                        const existingGenreUI = drawerEl.querySelector('.genre-selection-overlay-section');
                        if (existingGenreUI) existingGenreUI.remove();
                        // Add genre selection UI
                        if (cfg.renderGenreUI) {
                            container.insertAdjacentHTML('afterend', cfg.renderGenreUI());
                        }
                        // Setup genre selection listeners
                        if (cfg.setupGenreListeners) {
                            const drawerBody = drawerEl.querySelector('.info-drawer-body');
                            if (drawerBody) cfg.setupGenreListeners(drawerBody);
                        }
                    }
                } else {
                    const container = document.getElementById(cfg.container);
                    if (container) container.innerHTML = cfg.renderTable();
                }
            },
            onAfterClose: drawerId === 'genre-quests'
                ? (drawerEl) => {
                    // Clean up genre selection UI when closing
                    const genreUI = drawerEl.querySelector('.genre-selection-overlay-section');
                    if (genreUI) genreUI.remove();
                }
                : undefined
        };
    });

    const drawerManager = new DrawerManager(managerConfig);

    // Set up open buttons
    const openButtons = document.querySelectorAll('.open-quest-info-drawer-btn');
    openButtons.forEach(button => {
        button.addEventListener('click', () => {
            const drawerId = button.dataset.drawer;
            if (drawerId) {
                drawerManager.open(drawerId);
            }
        });
    });

    // Dungeons drawer: Claim Reward (scroll to completion table) + Roll d20 for reward
    const dungeonsConfig = drawerConfig['dungeons'];
    const dungeonsDrawer = dungeonsConfig && document.getElementById(dungeonsConfig.drawer);
    if (dungeonsDrawer) {
        dungeonsDrawer.addEventListener('click', (e) => {
            const claimBtn = e.target.closest('.claim-room-reward-btn');
            if (claimBtn) {
                const roomNumber = claimBtn.getAttribute('data-room-number');
                if (!roomNumber) return;
                const completedQuests = stateAdapter.getCompletedQuests() || [];
                const claimed = stateAdapter.getClaimedRoomRewards() || [];
                if (!canClaimRoomReward(roomNumber, completedQuests, claimed)) {
                    toast.warning('This room reward cannot be claimed.');
                    return;
                }
                stateAdapter.addClaimedRoomReward(roomNumber);
                const roomsContainer = document.getElementById(dungeonsConfig.containers.rooms);
                if (roomsContainer) {
                    roomsContainer.innerHTML = processLinksHelper(renderDungeonRoomsTable());
                }
                if (dungeonsConfig.updateDrawsUI) dungeonsConfig.updateDrawsUI(dungeonsDrawer);
                const completionSection = dungeonsDrawer.querySelector('#dungeon-completion-rewards');
                if (completionSection) {
                    completionSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                window.location.hash = 'dungeon-completion-rewards';
                toast.info('Scroll to Dungeon Completion Rewards and click "Draw item" to add your reward.');
                return;
            }

            const drawBtn = e.target.id === 'draw-dungeon-completion-card-btn' ? e.target : e.target.closest('#draw-dungeon-completion-card-btn');
            const drawerFromClick = drawBtn ? drawBtn.closest('#dungeons-info-drawer') : null;
            if (drawBtn && updateCurrency) {
                const available = stateAdapter.getDungeonCompletionDrawsAvailable();
                if (available <= 0) {
                    toast.info('No draws available. Complete a dungeon room and click "Claim Reward" to earn a draw.');
                    return;
                }
                if (!stateAdapter.redeemDungeonCompletionDraw()) {
                    toast.info('No draws available.');
                    return;
                }
                const roll = Math.floor(Math.random() * 20) + 1;
                const reward = getDungeonCompletionRewardByRoll(roll);
                const result = applyDungeonCompletionReward(roll, { stateAdapter, updateCurrency });
                if (result.alreadyOwned) {
                    stateAdapter.refundDungeonCompletionDraw();
                }
                const baseurl = document.querySelector('meta[name="baseurl"]')?.content || '';
                const cardContainer = document.getElementById('dungeon-completion-drawn-card-container');
                if (cardContainer && reward) {
                    const cardImgPath = getDungeonCompletionRewardCardImage(reward);
                    const imgSrc = cardImgPath ? toLocalOrCdnUrl(cardImgPath, baseurl) : '';
                    const safeName = reward.name.replace(/"/g, '&quot;');
                    const safeReward = (reward.reward || '').replace(/"/g, '&quot;');
                    cardContainer.innerHTML = `
                        <div class="dungeon-completion-drawn-card" style="display: flex; align-items: flex-start; gap: 12px; padding: 12px; background: rgba(84, 72, 59, 0.25); border: 1px solid #b89f62; border-radius: 8px;">
                            ${imgSrc ? `<img src="${imgSrc}" alt="${safeName}" style="width: 80px; height: 120px; object-fit: contain; border-radius: 4px;" onerror="this.style.display='none'">` : ''}
                            <div style="flex: 1;">
                                <strong style="color: #b89f62;">${safeName}</strong>
                                <p style="margin: 6px 0 0; font-size: 0.9em;">${safeReward}</p>
                            </div>
                        </div>`;
                }
                if (result.alreadyOwned) {
                    toast.info(`You already have ${result.rewardName}. Draw refunded.`);
                } else {
                    toast.success(`You drew ${result.rewardName}. ${result.rewardText || ''}`);
                }
                if (uiModule) {
                    if (typeof uiModule.renderTemporaryBuffs === 'function') uiModule.renderTemporaryBuffs();
                    const wearableSlotsInput = document.getElementById('wearable-slots');
                    const nonWearableSlotsInput = document.getElementById('non-wearable-slots');
                    const familiarSlotsInput = document.getElementById('familiar-slots');
                    if (uiModule.updateQuestBuffsDropdown && wearableSlotsInput) {
                        uiModule.updateQuestBuffsDropdown(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                    }
                    if (typeof uiModule.renderLoadout === 'function' && wearableSlotsInput) {
                        uiModule.renderLoadout(wearableSlotsInput, nonWearableSlotsInput, familiarSlotsInput);
                    }
                }
                const dustyBlueprintsInput = document.getElementById('dustyBlueprints');
                if (dustyBlueprintsInput) {
                    dustyBlueprintsInput.value = stateAdapter.getDustyBlueprints();
                }
                if (dungeonsConfig.updateDrawsUI) dungeonsConfig.updateDrawsUI(drawerFromClick);
                setTimeout(() => {
                    if (dungeonsConfig.updateDrawsUI) dungeonsConfig.updateDrawsUI(drawerFromClick || document.getElementById('dungeons-info-drawer'));
                }, 0);
            }
        });
    }
}
