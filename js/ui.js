/**
 * UI Module
 *
 * Handles rendering of UI components and user interactions.
 * Uses HTML templates defined in index.html for structure.
 * Now integrates with API module for automatic game fetching.
 */

const UI = {
    // Cache for template elements
    templates: {},
    // Reference to main content container
    mainContent: null,
    // Current filter state
    currentFilter: 'all',
    // Current league selection
    currentLeague: 'all',
    // Current standings league
    currentStandingsLeague: null,
    currentStandingsView: 'divisions',
    currentStandingsSort: 'default',
    showStandingsRank: false,
    currentStandingsSeason: null,
    // Loading state
    isLoading: false,
    // Add game preview initialized
    formPreviewInitialized: false,
    // Multi-view picker state
    multiPickerState: {
        league: 'all',
        filter: 'live',
        search: ''
    },
    // Multi-view focus state
    multiViewFocusKey: null,
    // Multi-view layout state
    multiViewLayout: 'tiling',
    // Poster visibility state
    showPosters: true,
    // Advanced mode for stream controls
    advancedMode: false,
    // Score display
    showScores: true,
    // Auto cycle sources
    autoCycleEnabled: true,
    // Device info
    deviceInfo: {
        isMobile: false,
        isIOS: false
    },
    // Current embed state
    embedState: {
        currentSlug: null,
        currentStreamId: 1,
        currentSource: 'admin',
        currentLeague: null,
        sources: [],
        loading: false,
        error: false,
        sourceFailures: new Set(),
        lastSlug: null,
        autoCycleActive: false
    },


    /**
     * Initialize UI module
     */
    init() {
        this.mainContent = document.getElementById('main-content');
        this.cacheTemplates();
        this.detectDevice();
        this.loadPosterSetting();
        this.setupSettingsModal();
    },

    /**
     * Cache template elements for faster cloning
     */
    cacheTemplates() {
        const templateIds = [
            'games-list-template',
            'game-card-template',
            'watch-template',
            'multi-view-template',
            'standings-template',
            'add-game-template',
            'not-found-template'
        ];

        templateIds.forEach(id => {
            const template = document.getElementById(id);
            if (template) {
                this.templates[id] = template;
            }
        });
    },

    /**
     * Get a cloned template
     * @param {string} id - Template ID
     * @returns {DocumentFragment} Cloned template content
     */
    getTemplate(id) {
        const template = this.templates[id];
        if (!template) {
            console.error('Template not found:', id);
            return document.createDocumentFragment();
        }
        return template.content.cloneNode(true);
    },

    /**
     * Clear main content area
     */
    clearContent() {
        this.mainContent.innerHTML = '';
        document.body.classList.remove('multiview-layout');
    },

    /**
     * Get stored UI settings
     * @returns {Object} settings
     */
    getSettings() {
        try {
            const data = localStorage.getItem(Config.STORAGE.SETTINGS);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.warn('Failed to load settings:', error);
            return {};
        }
    },

    /**
     * Save UI settings
     * @param {Object} updates - settings to merge
     */
    saveSettings(updates) {
        const settings = {
            ...this.getSettings(),
            ...updates
        };
        try {
            localStorage.setItem(Config.STORAGE.SETTINGS, JSON.stringify(settings));
        } catch (error) {
            console.warn('Failed to save settings:', error);
        }
    },

    /**
     * Restore saved filter and league selection
     */
    restoreSettings() {
        const settings = this.getSettings();
        const savedFilter = settings?.filter;
        const savedLeague = settings?.league;
        const allowedFilters = ['all', 'live', 'upcoming'];
        const allowedLeagues = ['all', ...Config.SUPPORTED_LEAGUES];

        if (savedFilter && allowedFilters.includes(savedFilter)) {
            this.currentFilter = savedFilter;
        }

        if (savedLeague && allowedLeagues.includes(savedLeague)) {
            this.currentLeague = savedLeague;
        }

        const filterButtons = document.querySelectorAll('.filter-btn');
        filterButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === this.currentFilter);
        });

        const leagueButtons = document.querySelectorAll('.league-btn');
        leagueButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.league === this.currentLeague);
        });
    },

    loadPosterSetting() {
        const settings = this.getSettings();
        this.showPosters = settings?.postersEnabled === true;
        this.advancedMode = settings?.advancedMode === true;
        this.showScores = settings?.scoresEnabled !== false;
        this.autoCycleEnabled = settings?.autoCycleEnabled !== false;
    },

    detectDevice() {
        if (typeof navigator === 'undefined') {
            return;
        }
        const ua = navigator.userAgent || '';
        const isIOS = /iPad|iPhone|iPod/i.test(ua) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isMobileAgent = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
        const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;
        const isMobile = isMobileAgent || isMobileViewport;
        this.deviceInfo = {
            isMobile,
            isIOS
        };
        document.body.classList.toggle('is-mobile', isMobile);
        document.body.classList.toggle('is-ios', isIOS);
    },

    applyMobileEmbedPolicy(iframe, url) {
        if (!iframe) {
            return;
        }
        if (!this.deviceInfo?.isIOS) {
            return;
        }

        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
        iframe.setAttribute('allow', 'fullscreen; autoplay; encrypted-media; picture-in-picture');
        iframe.setAttribute('allowfullscreen', '');

        iframe.addEventListener('load', () => {
            if (!iframe.contentWindow) return;
            let attempts = 0;
            const maxAttempts = 12;
            const checkRedirect = () => {
                attempts += 1;
                if (attempts > maxAttempts) return;
                try {
                    const currentHref = iframe.contentWindow.location.href;
                    if (currentHref && !currentHref.includes('embedsports.top')) {
                        iframe.contentWindow.stop();
                        iframe.src = url;
                        return;
                    }
                } catch (error) {
                    // Cross-origin access blocked; cannot inspect location.
                }
                setTimeout(checkRedirect, 500);
            };
            setTimeout(checkRedirect, 500);
        }, { once: true });
    },

    setupSettingsModal() {
        const settingsBtn = document.getElementById('settings-btn');
        const modal = document.getElementById('settings-modal');
        const overlay = modal?.querySelector('.settings-modal__overlay');
        const closeBtn = modal?.querySelector('.settings-close');
        const postersToggle = document.getElementById('settings-posters');
        const advancedToggle = document.getElementById('settings-advanced');
        const scoresToggle = document.getElementById('settings-scores');
        const autoCycleToggle = document.getElementById('settings-autocycle');

        if (!modal) return;

        const openModal = () => {
            this.loadPosterSetting();
            if (postersToggle) {
                postersToggle.checked = this.showPosters;
            }
            if (advancedToggle) {
                advancedToggle.checked = this.advancedMode;
            }
            if (scoresToggle) {
                scoresToggle.checked = this.showScores;
            }
            if (autoCycleToggle) {
                autoCycleToggle.checked = this.autoCycleEnabled;
            }
            modal.classList.add('is-open');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('settings-open');
        };

        const closeModal = () => {
            modal.classList.remove('is-open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('settings-open');
        };

        settingsBtn?.addEventListener('click', () => {
            if (modal.classList.contains('is-open')) {
                closeModal();
            } else {
                openModal();
            }
        });

        overlay?.addEventListener('click', closeModal);
        closeBtn?.addEventListener('click', closeModal);

        postersToggle?.addEventListener('change', () => {
            this.showPosters = postersToggle.checked;
            this.saveSettings({ postersEnabled: this.showPosters });
            if (document.getElementById('games-grid')) {
                this.renderGames();
            }
        });

        advancedToggle?.addEventListener('change', () => {
            this.advancedMode = advancedToggle.checked;
            this.saveSettings({ advancedMode: this.advancedMode });
            this.updateAdvancedControls();
        });

        scoresToggle?.addEventListener('change', () => {
            this.showScores = scoresToggle.checked;
            this.saveSettings({ scoresEnabled: this.showScores });
            if (document.getElementById('games-grid')) {
                this.renderGames();
            }
        });

        autoCycleToggle?.addEventListener('change', () => {
            this.autoCycleEnabled = autoCycleToggle.checked;
            this.saveSettings({ autoCycleEnabled: this.autoCycleEnabled });
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('is-open')) {
                closeModal();
            }
        });
    },

    /**
     * Update multi-view counter in the header
     */
    updateMultiViewCount() {
        const countEl = document.getElementById('multi-count');
        if (!countEl) return;
        const count = Storage.getMultiViewGames().length;
        countEl.textContent = `${count}/${Config.MULTI_VIEW_MAX}`;
    },

    updateAdvancedControls() {
        const streamSelect = document.getElementById('stream-select');
        const sourceSelect = document.getElementById('source-select');
        const streamLabel = document.querySelector('label[for="stream-select"]');
        const sourceLabel = document.querySelector('label[for="source-select"]');

        if (streamSelect) {
            streamSelect.disabled = !this.advancedMode;
            streamSelect.classList.toggle('is-disabled', !this.advancedMode);
        }
        if (sourceSelect) {
            sourceSelect.disabled = !this.advancedMode;
            sourceSelect.classList.toggle('is-disabled', !this.advancedMode);
        }
        streamLabel?.classList.toggle('is-disabled', !this.advancedMode);
        sourceLabel?.classList.toggle('is-disabled', !this.advancedMode);
        document.body.classList.toggle('advanced-mode', this.advancedMode);
    },

    /**
     * Update data status label
     * @param {Object|null} meta - API meta data
     */
    updateDataStatus(meta) {
        const statusEl = document.getElementById('data-status');
        if (!statusEl) return;

        if (!meta) {
            statusEl.textContent = '';
            statusEl.classList.remove('stale');
            return;
        }

        const age = typeof meta.cacheAgeSec === 'number' ? meta.cacheAgeSec : null;
        const ageLabel = age !== null ? this.formatAge(age) : 'just now';
        statusEl.textContent = `Updated ${ageLabel}${meta.stale ? ' (stale)' : ''}`;
        statusEl.classList.toggle('stale', Boolean(meta.stale));
    },

    /**
     * Format age (seconds) into a friendly label
     * @param {number} seconds - age in seconds
     * @returns {string}
     */
    formatAge(seconds) {
        if (seconds < 5) return 'just now';
        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ago`;
    },

    /**
     * Render the games list page
     */
    renderGamesList() {
        this.clearContent();
        const fragment = this.getTemplate('games-list-template');
        this.mainContent.appendChild(fragment);

        // Set up filter buttons
        this.setupFilterButtons();

        // Set up league buttons
        this.setupLeagueButtons();

        // Set up refresh button
        this.setupRefreshButton();

        // Restore last filter selection
        this.restoreSettings();
        this.loadPosterSetting();
        this.updateMultiViewCount();

        // Render games (async)
        this.renderGames();
    },

    /**
     * Set up filter button event listeners
     */
    setupFilterButtons() {
        const filterBtns = document.querySelectorAll('.filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active state
                filterBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                // Update filter and re-render
                this.currentFilter = e.target.dataset.filter;
                this.saveSettings({ filter: this.currentFilter });
                this.renderGames();
            });
        });
    },

    /**
     * Set up league button event listeners
     */
    setupLeagueButtons() {
        const leagueBtns = document.querySelectorAll('.league-btn');
        leagueBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active state
                leagueBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                // Update league and re-render
                this.currentLeague = e.target.dataset.league;
                this.saveSettings({ league: this.currentLeague });
                this.renderGames();
            });
        });
    },

    /**
     * Set up refresh button
     */
    setupRefreshButton() {
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                API.clearCache();
                this.renderGames();
            });
        }
    },

    /**
     * Show loading state in games grid
     */
    showLoading() {
        const grid = document.getElementById('games-grid');
        const noGames = document.getElementById('no-games');

        if (grid) {
            grid.innerHTML = `
                <div class="loading-state">
                    <div class="loader"></div>
                    <p>Loading games...</p>
                </div>
            `;
            grid.classList.remove('hidden');
        }
        noGames?.classList.add('hidden');
    },

    /**
     * Render game cards in the grid (async - fetches from API)
     */
    async renderGames() {
        const grid = document.getElementById('games-grid');
        const noGames = document.getElementById('no-games');
        const refreshBtn = document.getElementById('refresh-btn');

        if (!grid) return;

        // Show loading state
        this.showLoading();
        this.isLoading = true;
        if (refreshBtn) {
            refreshBtn.disabled = true;
            refreshBtn.classList.add('is-loading');
        }

        try {
            await TeamsUtil.preloadLogos(this.currentLeague);
            // Fetch games from API
            const apiGames = await API.getFilteredGames(this.currentFilter, this.currentLeague);
            const enrichedApiGames = apiGames.map(g => API.enrichGame(g));
            this.updateDataStatus(API.getMeta(this.currentFilter, this.currentLeague));

            // Also get any manually added games from storage
            const storedGames = Storage.getEnrichedGames(this.currentFilter, this.currentLeague);

            // Combine and dedupe (API games take precedence)
            const apiKeys = new Set(enrichedApiGames.map(g => {
                const leagueKey = g.league || Config.DEFAULT_LEAGUE;
                return `${leagueKey}:${EmbedUtil.sanitizeSlug(g.slug)}`;
            }));
            const manualGames = storedGames.filter(g => {
                const leagueKey = g.league || Config.DEFAULT_LEAGUE;
                return !apiKeys.has(`${leagueKey}:${EmbedUtil.sanitizeSlug(g.slug)}`);
            });

            const allGames = this.dedupeGames([...enrichedApiGames, ...manualGames])
                .filter(Boolean)
                .sort((a, b) => this.getGameTimestamp(a) - this.getGameTimestamp(b));

            // Clear grid
            grid.innerHTML = '';

            if (allGames.length === 0) {
                grid.classList.add('hidden');
                noGames?.classList.remove('hidden');
                return;
            }

            grid.classList.remove('hidden');
            noGames?.classList.add('hidden');

            // Render grouped by date
            let currentGroup = null;
            allGames.forEach(game => {
                const groupKey = this.getGameDateKey(game);
                if (groupKey !== currentGroup) {
                    currentGroup = groupKey;
                    const header = document.createElement('div');
                    header.className = 'games-date';
                    header.textContent = this.formatGameDateLabel(game);
                    grid.appendChild(header);
                }
                const card = this.createGameCard(game);
                grid.appendChild(card);
            });
        } catch (error) {
            console.error('Failed to render games:', error);
            grid.innerHTML = `
                <div class="error-state">
                    <p>Failed to load games. Please try again.</p>
                    <button class="btn btn-primary" onclick="UI.renderGames()">Retry</button>
                </div>
            `;
            this.updateDataStatus(null);
        } finally {
            this.isLoading = false;
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('is-loading');
            }
        }
    },

    /**
     * Create a game card element
     * @param {Object} game - Enriched game object
     * @returns {HTMLElement} Game card element
     */
    getGameTimestamp(game) {
        if (!game) return 0;
        if (typeof game.timestamp === 'number') {
            return game.timestamp;
        }
        if (game.gameTime) {
            const parsed = new Date(game.gameTime).getTime();
            return Number.isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    },

    getGameDateKey(game) {
        const timestamp = this.getGameTimestamp(game);
        if (!timestamp) return 'tbd';
        return new Date(timestamp).toLocaleDateString('en-CA');
    },

    formatGameDateLabel(game) {
        const timestamp = this.getGameTimestamp(game);
        if (!timestamp) return 'Date TBD';
        const formatter = new Intl.DateTimeFormat(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
        return formatter.format(new Date(timestamp));
    },

    normalizeDedupeName(value) {
        return (value || '')
            .toString()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    },

    getDedupeKey(game) {
        const dateKey = this.getGameDateKey(game);
        const awayName = this.normalizeDedupeName(game?.awayTeam?.name || game?.teams?.away?.name || '');
        const homeName = this.normalizeDedupeName(game?.homeTeam?.name || game?.teams?.home?.name || '');
        let pair = [awayName, homeName].filter(Boolean).sort();
        if (pair.length < 2 && game?.title) {
            const parts = game.title.split(/\s+vs\.?\s+|\s+@\s+/i);
            pair = parts.map(name => this.normalizeDedupeName(name)).filter(Boolean).sort();
        }
        if (pair.length < 2) {
            return `${game?.league || 'all'}:${dateKey}:${this.normalizeDedupeName(game?.title || '')}`;
        }
        return `${game?.league || 'all'}:${dateKey}:${pair.join('-')}`;
    },

    dedupeGames(games) {
        const map = new Map();
        (games || []).forEach(game => {
            const key = this.getDedupeKey(game);
            if (!key) return;
            const existing = map.get(key);
            if (!existing) {
                map.set(key, game);
                return;
            }
            if (game.isLive && !existing.isLive) {
                map.set(key, game);
                return;
            }
            if ((game.sources || []).length > (existing.sources || []).length) {
                map.set(key, game);
            }
        });
        return Array.from(map.values());
    },

    createGameCard(game) {
        const fragment = this.getTemplate('game-card-template');
        const card = fragment.querySelector('.game-card');

        // Set data attribute
        card.dataset.gameId = game.id;
        card.dataset.slug = game.slug;
        if (game.league) {
            card.dataset.league = game.league;
        }

        // Status badge
        const status = card.querySelector('.game-status');
        status.classList.remove('live', 'upcoming', 'ended');
        if (game.isLive) {
            status.textContent = 'Live';
            status.classList.add('live');
        } else if (game.isEnded) {
            status.textContent = 'Final';
            status.classList.add('ended');
        } else if (game.isUpcoming || (game.gameTime && new Date(game.gameTime) > new Date())) {
            status.textContent = 'Upcoming';
            status.classList.add('upcoming');
        } else {
            status.textContent = 'Available';
            status.classList.add('available');
        }

        const posterEl = card.querySelector('.game-poster');
        if (posterEl) {
            const posterUrl = game.poster || game.posterUrl;
            if (posterUrl && this.showPosters) {
                posterEl.style.backgroundImage = `url("${posterUrl}")`;
                posterEl.classList.remove('hidden');
            } else {
                posterEl.classList.add('hidden');
                posterEl.style.removeProperty('background-image');
            }
        }

        // Teams
        const awayTeam = card.querySelector('.away-team');
        const homeTeam = card.querySelector('.home-team');
        const awayLabel = game.awayTeam?.shortName || game.awayTeam?.abbreviation || game.awayTeam?.name;
        const homeLabel = game.homeTeam?.shortName || game.homeTeam?.abbreviation || game.homeTeam?.name;
        awayTeam.textContent = awayLabel || this.extractTeamAbbrev(game.title, 'away');
        homeTeam.textContent = homeLabel || this.extractTeamAbbrev(game.title, 'home');

        const awayLogo = card.querySelector('.away-logo');
        const homeLogo = card.querySelector('.home-logo');
        this.setTeamLogo(awayLogo, game.awayTeam, game.league || Config.DEFAULT_LEAGUE);
        this.setTeamLogo(homeLogo, game.homeTeam, game.league || Config.DEFAULT_LEAGUE);

        const awayScore = card.querySelector('.away-score');
        const homeScore = card.querySelector('.home-score');
        if (this.showScores) {
            const awayValue = game.awayTeam?.score ?? game.awayScore;
            const homeValue = game.homeTeam?.score ?? game.homeScore;
            if (awayScore && awayValue !== undefined && awayValue !== null && awayValue !== '') {
                awayScore.textContent = awayValue;
                awayScore.classList.remove('hidden');
            } else {
                awayScore?.classList.add('hidden');
            }
            if (homeScore && homeValue !== undefined && homeValue !== null && homeValue !== '') {
                homeScore.textContent = homeValue;
                homeScore.classList.remove('hidden');
            } else {
                homeScore?.classList.add('hidden');
            }
        } else {
            awayScore?.classList.add('hidden');
            homeScore?.classList.add('hidden');
        }

        // Title
        const title = card.querySelector('.game-title');
        title.textContent = game.displayTitle || game.title || 'Unknown Game';

        // Time
        const time = card.querySelector('.game-time');
        time.textContent = game.formattedTime;

        // Watch button
        const watchBtn = card.querySelector('.watch-btn');
        watchBtn.href = game.watchUrl || `#/watch/${game.slug}`;

        // Multi-view button
        const multiBtn = card.querySelector('.multi-btn');
        if (multiBtn) {
            const leagueKey = game.league || Config.DEFAULT_LEAGUE;
            const inMulti = Storage.isInMultiView(game.slug, leagueKey);
            if (inMulti) {
                multiBtn.textContent = 'In Multi';
                multiBtn.disabled = true;
            }
            multiBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const result = Storage.addToMultiView(game);
                if (result.added) {
                    multiBtn.textContent = 'In Multi';
                    multiBtn.disabled = true;
                    this.updateMultiViewCount();
                } else if (result.reason === 'limit') {
                    alert(`Multi-view supports up to ${Config.MULTI_VIEW_MAX} games.`);
                } else if (result.reason === 'exists') {
                    multiBtn.textContent = 'In Multi';
                    multiBtn.disabled = true;
                } else {
                    alert('Unable to add this game to multi-view.');
                }
            });
        }

        // Delete button - only show for manually added games
        const deleteBtn = card.querySelector('.delete-btn');
        if (game.source === 'api') {
            deleteBtn.remove();
        } else {
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm(`Remove ${game.title}?`)) {
                    Storage.deleteGame(game.id);
                    this.renderGames();
                }
            });
        }

        return card;
    },

    /**
     * Set a team logo image element based on team data
     * @param {HTMLImageElement|null} imgEl - Logo img element
     * @param {Object|null} team - Team object
     */
    setTeamLogo(imgEl, team, league = null) {
        if (!imgEl) return;
        const resolvedLeague = league && league !== 'all' ? league : Config.DEFAULT_LEAGUE;
        const logoUrl = TeamsUtil.getTeamLogo(team, resolvedLeague);

        if (!logoUrl) {
            imgEl.classList.add('hidden');
            imgEl.removeAttribute('src');
            imgEl.removeAttribute('alt');
            return;
        }

        const fallbackLogo = TeamsUtil.getDirectLogo(team);
        const hasFallback = Boolean(fallbackLogo && fallbackLogo !== logoUrl);

        imgEl.dataset.logoFallback = '';
        imgEl.onerror = () => {
            if (hasFallback && imgEl.dataset.logoFallback !== '1' && imgEl.src !== fallbackLogo) {
                imgEl.dataset.logoFallback = '1';
                imgEl.src = fallbackLogo;
                return;
            }
            imgEl.classList.add('hidden');
            imgEl.removeAttribute('src');
            imgEl.removeAttribute('alt');
        };

        imgEl.src = logoUrl;
        imgEl.alt = team?.name ? `${team.name} logo` : 'Team logo';
        imgEl.classList.remove('hidden');
    },

    /**
     * Update watch matchup display with team data
     * @param {Object|null} awayTeam - Away team object
     * @param {Object|null} homeTeam - Home team object
     */
    updateWatchMatchup(awayTeam, homeTeam, league = null) {
        const matchup = document.querySelector('.watch-matchup');
        if (!matchup) return;

        if (!awayTeam || !homeTeam) {
            matchup.classList.add('hidden');
            return;
        }

        matchup.classList.remove('hidden');

        const awayName = matchup.querySelector('.away-team');
        const homeName = matchup.querySelector('.home-team');
        const awayLogo = matchup.querySelector('.away-logo');
        const homeLogo = matchup.querySelector('.home-logo');

        if (awayName) {
            awayName.textContent = awayTeam.shortName || awayTeam.abbreviation || awayTeam.name;
        }
        if (homeName) {
            homeName.textContent = homeTeam.shortName || homeTeam.abbreviation || homeTeam.name;
        }

        const activeLeague = league && league !== 'all'
            ? league
            : (this.embedState.currentLeague && this.embedState.currentLeague !== 'all'
                ? this.embedState.currentLeague
                : Config.DEFAULT_LEAGUE);
        this.setTeamLogo(awayLogo, awayTeam, activeLeague);
        this.setTeamLogo(homeLogo, homeTeam, activeLeague);
    },

    /**
     * Extract team abbreviation from title when team data is missing
     * @param {string} title - Game title
     * @param {string} position - 'away' or 'home'
     * @returns {string} Abbreviation or placeholder
     */
    extractTeamAbbrev(title, position) {
        if (!title) return '???';

        // Handle special cases like "NFL RedZone"
        if (title.toLowerCase().includes('redzone')) return 'RZ';
        if (title.toLowerCase().includes('nfl network')) return 'NFLN';
        if (title.toLowerCase().includes('nba tv')) return 'NBATV';
        if (title.toLowerCase().includes('league pass')) return 'LP';

        const vsMatch = title.match(/(.+?)\s+(?:vs\.?|@|at)\s+(.+)/i);
        if (vsMatch) {
            const teamName = position === 'away' ? vsMatch[1].trim() : vsMatch[2].trim();
            // Return first 3-4 chars as abbreviation
            const words = teamName.split(' ');
            if (words.length > 1) {
                return words[words.length - 1].substring(0, 4).toUpperCase();
            }
            return teamName.substring(0, 4).toUpperCase();
        }

        return '???';
    },

    /**
     * Render the watch page
     * @param {string} slug - Game slug from route params
     */
    async renderWatchPage(slug, query = {}) {
        this.clearContent();

        // Show loading first
        this.mainContent.innerHTML = `
            <div class="watch-loading">
                <div class="loader"></div>
                <p>Loading stream...</p>
            </div>
        `;

        const allowedLeagues = ['all', ...Config.SUPPORTED_LEAGUES];
        const requestedLeague = query?.league ? query.league.toLowerCase() : null;
        const league = requestedLeague || (this.currentLeague || 'all');
        if (allowedLeagues.includes(league) && league !== 'all') {
            this.currentLeague = league;
            this.saveSettings({ league: this.currentLeague });
        }

        // Try to find game in API by matchId or slug
        let game = await API.getGameBySlug(slug, { league });
        if (!game && league !== 'all') {
            game = await API.getGameBySlug(slug, { league: 'all' });
        }
        let enrichedGame = game ? API.enrichGame(game) : null;

        // If not in API, check local storage
        if (!enrichedGame) {
            const storedGame = Storage.getGameBySlug(slug, league);
            enrichedGame = storedGame ? Storage.enrichGame(storedGame) : null;
        }

        // Clear loading
        this.clearContent();

        if (!enrichedGame) {
            // Try to render with just the slug (for direct links)
            this.renderWatchPageWithSlug(slug, league);
            return;
        }

        if (enrichedGame.league && enrichedGame.league !== this.currentLeague) {
            if (Config.SUPPORTED_LEAGUES.includes(enrichedGame.league)) {
                this.currentLeague = enrichedGame.league;
                this.saveSettings({ league: this.currentLeague });
            }
        }

        const fragment = this.getTemplate('watch-template');
        this.mainContent.appendChild(fragment);

        // Set title
        const title = document.querySelector('.watch-title');
        title.textContent = enrichedGame.displayTitle || enrichedGame.title;
        await TeamsUtil.preloadLogos(enrichedGame.league || 'all');
        this.updateWatchMatchup(enrichedGame.awayTeam, enrichedGame.homeTeam, enrichedGame.league);

        // Store sources in embed state
        this.embedState.sources = enrichedGame.sources || [];
        const adminSource = this.embedState.sources.find(source => source?.source === 'admin');
        this.embedState.currentSource = adminSource ? 'admin' : (enrichedGame.currentSource || 'admin');
        this.embedState.currentSlug = adminSource ? (adminSource.id || enrichedGame.slug) : enrichedGame.slug;
        this.embedState.currentLeague = enrichedGame.league || Config.DEFAULT_LEAGUE;

        // Set up source and stream selectors
        this.setupSourceSelector(enrichedGame);
        this.setupStreamSelector(this.embedState.currentLeague);
        this.updateAdvancedControls();

        // Load the embed with the best source
        this.loadEmbed(enrichedGame.slug, 1, this.embedState.currentSource);

        // Set up fullscreen button
        this.setupFullscreenButton();
    },

    /**
     * Render watch page with just a slug (no stored game)
     * @param {string} slug - Game slug
     */
    renderWatchPageWithSlug(slug, league = null) {
        const sanitizedSlug = EmbedUtil.sanitizeSlug(slug);

        if (!sanitizedSlug) {
            this.renderNotFound();
            return;
        }

        const fragment = this.getTemplate('watch-template');
        this.mainContent.appendChild(fragment);

        // Try to parse team names from slug
        const parsed = EmbedUtil.parseGameSlug(sanitizedSlug, league);
        const title = document.querySelector('.watch-title');

        if (parsed?.awayTeam && parsed?.homeTeam) {
            title.textContent = `${parsed.awayTeam.name} vs ${parsed.homeTeam.name}`;
        } else {
            // Use slug as title, formatted nicely
            title.textContent = sanitizedSlug
                .replace(/^ppv-/, '')
                .replace(/-vs-/g, ' vs ')
                .replace(/-/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());
        }
        const resolvedLeague = parsed?.league || (league && league !== 'all' ? league : Config.DEFAULT_LEAGUE);
        this.embedState.currentLeague = resolvedLeague;
        TeamsUtil.preloadLogos(parsed?.league || 'all').then(() => {
            this.updateWatchMatchup(parsed?.awayTeam || null, parsed?.homeTeam || null, parsed?.league);
        });

        // Set up stream selector
        this.setupStreamSelector(this.embedState.currentLeague);
        this.updateAdvancedControls();

        // Load the embed
        this.loadEmbed(sanitizedSlug, 1, 'admin');

        // Set up fullscreen button
        this.setupFullscreenButton();
    },

    /**
     * Set up source selector dropdown
     * @param {Object} game - Game object with sources
     */
    setupSourceSelector(game) {
        const container = document.querySelector('.stream-controls');
        if (!container || !game.sources || game.sources.length === 0) return;

        // Create source selector if it doesn't exist
        let sourceSelect = document.getElementById('source-select');
        if (!sourceSelect) {
            const label = document.createElement('label');
            label.setAttribute('for', 'source-select');
            label.textContent = 'Source:';

            sourceSelect = document.createElement('select');
            sourceSelect.id = 'source-select';
            sourceSelect.className = 'stream-select';

            // Insert before the stream selector
            const streamSelect = document.getElementById('stream-select');
            if (streamSelect) {
                container.insertBefore(sourceSelect, streamSelect.previousElementSibling);
                container.insertBefore(label, sourceSelect);
            }
        }

        // Populate source options
        sourceSelect.innerHTML = '';
        game.sources.forEach((src, index) => {
            const option = document.createElement('option');
            option.value = index;
            const health = src.health?.status;
            let healthLabel = '';
            if (health === 'up') {
                healthLabel = 'OK';
            } else if (health === 'down') {
                healthLabel = 'Down';
            } else if (health === 'unknown') {
                healthLabel = 'Check';
            }

            const sourceLabel = src.source.charAt(0).toUpperCase() + src.source.slice(1);
            option.textContent = healthLabel ? `${sourceLabel} (${healthLabel})` : sourceLabel;
            if (src.source === this.embedState.currentSource) {
                option.selected = true;
            }
            sourceSelect.appendChild(option);
        });

        // Handle source change
        sourceSelect.addEventListener('change', () => {
            if (!this.advancedMode) {
                sourceSelect.value = game.sources.findIndex(src =>
                    src.source === this.embedState.currentSource
                );
                return;
            }
            const selectedIndex = parseInt(sourceSelect.value, 10);
            const selectedSource = game.sources[selectedIndex];
            if (selectedSource) {
                this.embedState.currentSource = selectedSource.source;
                this.embedState.currentSlug = selectedSource.id;
                this.loadEmbed(selectedSource.id, this.embedState.currentStreamId, selectedSource.source);
            }
        });
    },

    /**
     * Set up stream selector dropdown
     */
    setupStreamSelector(league = null) {
        const select = document.getElementById('stream-select');
        if (!select) return;

        const config = Config.getLeagueConfig(league || this.embedState.currentLeague || Config.DEFAULT_LEAGUE);

        // Clear and populate options
        select.innerHTML = '';
        for (let i = 1; i <= config.MAX_STREAMS; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Stream ${i}`;
            select.appendChild(option);
        }

        // Handle stream change
        select.addEventListener('change', () => {
            if (!this.advancedMode) {
                select.value = String(this.embedState.currentStreamId || 1);
                return;
            }
            const streamId = parseInt(select.value, 10);
            this.loadEmbed(this.embedState.currentSlug, streamId, this.embedState.currentSource);
        });
    },

    /**
     * Load embed iframe
     * @param {string} slug - Game slug (source-specific ID)
     * @param {number} streamId - Stream ID
     * @param {string} sourceType - Source type (admin, charlie, delta, etc.)
     */
    loadEmbed(slug, streamId, sourceType = 'admin') {
        const container = document.getElementById('embed-container');
        const loadingEl = document.getElementById('embed-loading');
        const errorEl = document.getElementById('embed-error');

        if (!container) return;

        if (this.embedState.lastSlug !== slug) {
            this.embedState.sourceFailures = new Set();
            this.embedState.lastSlug = slug;
            this.embedState.autoCycleActive = false;
        }

        // Update state
        this.embedState.currentStreamId = streamId;
        this.embedState.currentSource = sourceType;
        this.embedState.loading = true;
        this.embedState.error = false;

        // Show loading, hide error
        loadingEl?.classList.remove('hidden');
        errorEl?.classList.add('hidden');

        // Remove existing iframe
        const existingIframe = container.querySelector('iframe');
        if (existingIframe) {
            existingIframe.remove();
        }

        // Build embed URL
        const url = EmbedUtil.buildEmbedUrl(slug, streamId, sourceType);

        if (!url) {
            this.showEmbedError(slug);
            return;
        }

        // Create and insert iframe
        const parsed = EmbedUtil.parseGameSlug(slug);
        const iframeTitle = parsed?.awayTeam && parsed?.homeTeam
            ? `${parsed.awayTeam.name} vs ${parsed.homeTeam.name} Stream`
            : 'Game Stream';

        const iframe = EmbedUtil.createSecureIframe(url, iframeTitle);

        if (!iframe) {
            this.showEmbedError(slug);
            return;
        }

        this.applyMobileEmbedPolicy(iframe, url);

        // Handle iframe load events
        iframe.addEventListener('load', () => {
            this.embedState.loading = false;
            this.embedState.autoCycleActive = false;
            this.embedState.sourceFailures.clear();
            loadingEl?.classList.add('hidden');
        });

        // Handle load timeout
        const timeoutId = setTimeout(() => {
            if (this.embedState.loading) {
                const didFallback = this.tryAutoSourceCycle(slug, streamId, sourceType);
                if (didFallback) {
                    return;
                }
                this.embedState.loading = false;
                loadingEl?.classList.add('hidden');
                // Don't show error on timeout - embed might still work
            }
        }, Config.EMBED_LOAD_TIMEOUT);

        // Clear timeout on successful load
        iframe.addEventListener('load', () => {
            clearTimeout(timeoutId);
        });

        container.appendChild(iframe);

        // Update stream selector if present
        const select = document.getElementById('stream-select');
        if (select) {
            select.value = streamId;
        }

        // Set up error handling buttons
        this.setupErrorButtons(slug);
    },

    /**
     * Show embed error state
     * @param {string} slug - Game slug for retry
     */
    showEmbedError(slug) {
        const loadingEl = document.getElementById('embed-loading');
        const errorEl = document.getElementById('embed-error');

        this.embedState.loading = false;
        this.embedState.error = true;

        loadingEl?.classList.add('hidden');
        errorEl?.classList.remove('hidden');

        this.setupErrorButtons(slug);
    },

    /**
     * Set up error retry buttons
     * @param {string} slug - Game slug
     */
    setupErrorButtons(slug) {
        const retryBtn = document.getElementById('retry-btn');
        const tryNextBtn = document.getElementById('try-next-btn');
        const config = Config.getLeagueConfig(this.embedState.currentLeague || Config.DEFAULT_LEAGUE);

        if (retryBtn) {
            retryBtn.onclick = () => {
                this.loadEmbed(slug, this.embedState.currentStreamId, this.embedState.currentSource);
            };
        }

        if (tryNextBtn) {
            tryNextBtn.onclick = () => {
                const nextStream = (this.embedState.currentStreamId % config.MAX_STREAMS) + 1;
                this.loadEmbed(slug, nextStream, this.embedState.currentSource);
            };
        }
    },

    tryAutoSourceCycle(slug, streamId, sourceType) {
        if (!this.autoCycleEnabled || sourceType !== 'admin') {
            return false;
        }

        const sources = this.embedState.sources || [];
        if (!sources.length || this.embedState.autoCycleActive) {
            return false;
        }

        this.embedState.sourceFailures.add(sourceType);
        const nextSource = sources.find(source =>
            source?.source && source.source !== sourceType && !this.embedState.sourceFailures.has(source.source)
        );

        if (!nextSource) {
            this.embedState.autoCycleActive = false;
            return false;
        }

        this.embedState.autoCycleActive = true;
        this.embedState.sourceFailures.add(nextSource.source);
        this.embedState.currentSource = nextSource.source;
        this.embedState.currentSlug = nextSource.id;
        this.loadEmbed(nextSource.id, streamId, nextSource.source);
        return true;
    },

    /**
     * Set up fullscreen button
     */
    setupFullscreenButton() {
        const btn = document.getElementById('fullscreen-btn');
        const wrapper = document.querySelector('.video-wrapper');

        if (!btn || !wrapper) return;

        btn.addEventListener('click', () => {
            if (document.fullscreenElement) {
                document.exitFullscreen();
            } else if (wrapper.requestFullscreen) {
                wrapper.requestFullscreen();
            } else if (wrapper.webkitRequestFullscreen) {
                wrapper.webkitRequestFullscreen();
            }
        });

        // Update button text based on fullscreen state
        document.addEventListener('fullscreenchange', () => {
            btn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
        });
    },

    /**
     * Render the multi-view page
     */
    async renderMultiViewPage() {
        this.clearContent();
        document.body.classList.add('multiview-layout');
        const fragment = this.getTemplate('multi-view-template');
        this.mainContent.appendChild(fragment);

        const grid = document.getElementById('multi-grid');
        const empty = document.getElementById('multi-empty');
        const status = document.getElementById('multi-status');
        const clearBtn = document.getElementById('multi-clear-btn');
        const picker = document.getElementById('multi-picker');
        const pickerToggle = document.getElementById('multi-picker-toggle');
        const pickerLeague = document.getElementById('multi-picker-league');
        const pickerFilter = document.getElementById('multi-picker-filter');
        const pickerSearch = document.getElementById('multi-picker-search');
        const layoutSelect = document.getElementById('multi-layout');

        const settings = this.getSettings();
        const savedLayout = settings?.multiViewLayout;
        this.multiViewLayout = savedLayout === 'windows' ? 'windows' : 'tiling';

        if (layoutSelect) {
            layoutSelect.value = this.multiViewLayout;
            layoutSelect.addEventListener('change', () => {
                this.multiViewLayout = layoutSelect.value === 'windows' ? 'windows' : 'tiling';
                this.saveSettings({ multiViewLayout: this.multiViewLayout });
                this.applyMultiViewLayout();
            });
        }

        if (pickerLeague) {
            pickerLeague.innerHTML = '';
            const leagues = ['all', ...Config.SUPPORTED_LEAGUES];
            leagues.forEach(leagueKey => {
                const option = document.createElement('option');
                option.value = leagueKey;
                option.textContent = leagueKey === 'all'
                    ? 'All American'
                    : (Config.getLeagueConfig(leagueKey)?.name || leagueKey.toUpperCase());
                pickerLeague.appendChild(option);
            });
            pickerLeague.value = this.multiPickerState.league || 'all';
            pickerLeague.addEventListener('change', () => {
                this.multiPickerState.league = pickerLeague.value;
                this.renderMultiPicker();
            });
        }

        if (pickerFilter) {
            pickerFilter.value = this.multiPickerState.filter || 'live';
            pickerFilter.addEventListener('change', () => {
                this.multiPickerState.filter = pickerFilter.value;
                this.renderMultiPicker();
            });
        }

        if (pickerSearch) {
            pickerSearch.value = this.multiPickerState.search || '';
            pickerSearch.addEventListener('input', () => {
                this.multiPickerState.search = pickerSearch.value;
                this.renderMultiPicker();
            });
        }

        if (pickerToggle && picker) {
            const updateToggleLabel = () => {
                pickerToggle.textContent = picker.classList.contains('hidden')
                    ? 'Add Games'
                    : 'Hide Picker';
            };
            updateToggleLabel();
            pickerToggle.addEventListener('click', () => {
                picker.classList.toggle('hidden');
                if (!picker.classList.contains('hidden')) {
                    this.renderMultiPicker();
                }
                updateToggleLabel();
            });
        }
        this.renderMultiViewTiles();

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (confirm('Clear all multi-view games?')) {
                    Storage.clearMultiViewGames();
                    this.updateMultiViewCount();
                    this.renderMultiViewTiles();
                }
            });
        }
    },

    /**
     * Render multi-view tiles
     */
    async renderMultiViewTiles() {
        const grid = document.getElementById('multi-grid');
        const empty = document.getElementById('multi-empty');
        const status = document.getElementById('multi-status');
        const clearBtn = document.getElementById('multi-clear-btn');
        if (!grid) return;

        const items = Storage.getMultiViewGames();
        if (status) {
            status.textContent = items.length
                ? `${items.length}/${Config.MULTI_VIEW_MAX} selected`
                : '';
        }

        grid.innerHTML = '';
        this.applyMultiViewLayout();

        if (!items.length) {
            grid.classList.add('hidden');
            empty?.classList.remove('hidden');
            if (clearBtn) {
                clearBtn.disabled = true;
            }
            const picker = document.getElementById('multi-picker');
            if (picker && picker.classList.contains('hidden')) {
                picker.classList.remove('hidden');
                this.renderMultiPicker();
            }
            return;
        }

        empty?.classList.add('hidden');
        grid.classList.remove('hidden');
        if (clearBtn) {
            clearBtn.disabled = false;
        }

        const tiles = await Promise.all(items.map(item => this.buildMultiViewTile(item)));
        tiles.filter(Boolean).forEach(tile => grid.appendChild(tile));
        if (this.multiViewFocusKey && !items.some(item => item.key === this.multiViewFocusKey)) {
            this.multiViewFocusKey = null;
        }
        this.setupMultiViewDnD();
        this.applyMultiViewFocus();
        const picker = document.getElementById('multi-picker');
        if (picker && !picker.classList.contains('hidden')) {
            this.renderMultiPicker();
        }
    },

    /**
     * Render the multi-view picker list
     */
    async renderMultiPicker() {
        const list = document.getElementById('multi-picker-list');
        if (!list) return;

        list.innerHTML = `
            <div class="loading-state">
                <div class="loader"></div>
                <p>Loading games...</p>
            </div>
        `;

        const league = this.multiPickerState.league || 'all';
        const filter = this.multiPickerState.filter || 'live';
        const search = (this.multiPickerState.search || '').trim().toLowerCase();

        await TeamsUtil.preloadLogos(league);

        const apiGames = await API.getFilteredGames(filter, league);
        const enriched = apiGames.map(game => API.enrichGame(game));
        const filtered = search
            ? enriched.filter(game => {
                const title = (game.displayTitle || game.title || '').toLowerCase();
                const away = (game.awayTeam?.name || '').toLowerCase();
                const home = (game.homeTeam?.name || '').toLowerCase();
                return title.includes(search) || away.includes(search) || home.includes(search);
            })
            : enriched;

        list.innerHTML = '';

        if (!filtered.length) {
            list.innerHTML = '<p class="multi-picker-empty">No games found.</p>';
            return;
        }

        filtered.slice(0, 12).forEach(game => {
            const card = this.buildMultiPickerCard(game);
            list.appendChild(card);
        });
    },

    buildMultiPickerCard(game) {
        const card = document.createElement('div');
        card.className = 'multi-picker-card';
        const away = game.awayTeam?.shortName || game.awayTeam?.abbreviation || game.awayTeam?.name || 'Away';
        const home = game.homeTeam?.shortName || game.homeTeam?.abbreviation || game.homeTeam?.name || 'Home';
        const time = game.formattedTime || '';
        const league = game.league || Config.DEFAULT_LEAGUE;
        const isInMulti = Storage.isInMultiView(game.slug, league);

        card.innerHTML = `
            <div class="multi-picker-teams">
                <div class="team-block">
                    <img class="team-logo away-logo hidden" alt="" loading="lazy">
                    <span>${away}</span>
                </div>
                <span class="vs">vs</span>
                <div class="team-block">
                    <img class="team-logo home-logo hidden" alt="" loading="lazy">
                    <span>${home}</span>
                </div>
            </div>
            <div class="multi-picker-meta">
                <span>${time}</span>
                <span>${Config.getLeagueConfig(league)?.name || league.toUpperCase()}</span>
            </div>
            <button class="btn btn-primary btn-small" ${isInMulti ? 'disabled' : ''}>
                ${isInMulti ? 'Added' : 'Add'}
            </button>
        `;

        this.setTeamLogo(card.querySelector('.away-logo'), game.awayTeam, league);
        this.setTeamLogo(card.querySelector('.home-logo'), game.homeTeam, league);

        const addBtn = card.querySelector('button');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const result = Storage.addToMultiView(game);
                if (result.added) {
                    this.updateMultiViewCount();
                    this.renderMultiViewTiles();
                    addBtn.disabled = true;
                    addBtn.textContent = 'Added';
                } else if (result.reason === 'limit') {
                    alert(`Multi-view supports up to ${Config.MULTI_VIEW_MAX} games.`);
                }
            });
        }

        return card;
    },

    setupMultiViewDnD() {
        const grid = document.getElementById('multi-grid');
        if (!grid) return;
        const tiles = Array.from(grid.querySelectorAll('.multi-tile'));
        let dragKey = null;

        tiles.forEach(tile => {
            tile.draggable = true;
            tile.addEventListener('dragstart', (event) => {
                dragKey = tile.dataset.key || null;
                tile.classList.add('is-dragging');
                event.dataTransfer?.setData('text/plain', dragKey || '');
                event.dataTransfer?.setDragImage(tile, 20, 20);
            });
            tile.addEventListener('dragend', () => {
                tile.classList.remove('is-dragging');
            });
            tile.addEventListener('dragover', (event) => {
                event.preventDefault();
                tile.classList.add('is-drop-target');
            });
            tile.addEventListener('dragleave', () => {
                tile.classList.remove('is-drop-target');
            });
            tile.addEventListener('drop', (event) => {
                event.preventDefault();
                tile.classList.remove('is-drop-target');
                const targetKey = tile.dataset.key;
                const sourceKey = dragKey || event.dataTransfer?.getData('text/plain');
                if (!sourceKey || !targetKey || sourceKey === targetKey) {
                    return;
                }
                Storage.reorderMultiViewItems(sourceKey, targetKey);
                this.renderMultiViewTiles();
            });
        });
    },

    applyMultiViewLayout() {
        const grid = document.getElementById('multi-grid');
        if (!grid) return;
        const isWindows = this.multiViewLayout === 'windows';
        grid.classList.toggle('is-windows', isWindows);
        document.body.classList.toggle('multiview-windows', isWindows);
        if (!isWindows) {
            const tiles = Array.from(grid.querySelectorAll('.multi-tile'));
            tiles.forEach(tile => {
                tile.style.removeProperty('top');
                tile.style.removeProperty('left');
                tile.style.removeProperty('width');
                tile.style.removeProperty('height');
                tile.style.removeProperty('z-index');
            });
        }
    },

    applyMultiViewFocus() {
        const grid = document.getElementById('multi-grid');
        if (!grid) return;
        const tiles = Array.from(grid.querySelectorAll('.multi-tile'));
        if (!this.multiViewFocusKey) {
            grid.classList.remove('is-focused');
            tiles.forEach(tile => {
                tile.classList.remove('is-focused');
                const focusBtn = tile.querySelector('.multi-focus-btn');
                if (focusBtn) {
                    focusBtn.textContent = 'Focus';
                }
            });
            return;
        }
        grid.classList.add('is-focused');
        tiles.forEach(tile => {
            const isFocused = tile.dataset.key === this.multiViewFocusKey;
            tile.classList.toggle('is-focused', isFocused);
            const focusBtn = tile.querySelector('.multi-focus-btn');
            if (focusBtn) {
                focusBtn.textContent = isFocused ? 'Grid' : 'Focus';
            }
        });
    },

    /**
     * Render standings page
     */
    async renderStandingsPage() {
        this.clearContent();
        const fragment = this.getTemplate('standings-template');
        this.mainContent.appendChild(fragment);

        const leagueSelect = document.getElementById('standings-league');
        const refreshBtn = document.getElementById('standings-refresh');
        const viewSelect = document.getElementById('standings-view');
        const sortSelect = document.getElementById('standings-sort');
        const rankToggle = document.getElementById('standings-rank');
        const seasonSelect = document.getElementById('standings-season');

        const leagues = Config.AMERICAN_LEAGUES;
        const settings = this.getSettings();
        const savedLeague = settings?.standingsLeague;
        const savedView = settings?.standingsView;
        const savedSort = settings?.standingsSort;
        const savedRank = settings?.standingsShowRank;
        const savedSeason = settings?.standingsSeason;
        const fallbackLeague = Config.AMERICAN_LEAGUES.includes(this.currentLeague)
            ? this.currentLeague
            : leagues[0];
        const defaultLeague = leagues.includes(savedLeague) ? savedLeague : fallbackLeague;
        const viewOptions = this.getStandingsViewOptions();
        const normalizedSavedView = this.normalizeStandingsView(savedView);
        const defaultView = viewOptions.some(option => option.value === normalizedSavedView)
            ? normalizedSavedView
            : 'divisions';
        const defaultRank = typeof savedRank === 'boolean' ? savedRank : false;
        const seasonOptions = this.getStandingsSeasonOptions();
        const defaultSeason = seasonOptions.includes(savedSeason) ? savedSeason : 'current';

        if (leagueSelect) {
            leagueSelect.innerHTML = '';
            leagues.forEach(leagueKey => {
                const option = document.createElement('option');
                option.value = leagueKey;
                option.textContent = Config.getLeagueConfig(leagueKey)?.name || leagueKey.toUpperCase();
                leagueSelect.appendChild(option);
            });
            leagueSelect.value = defaultLeague;
            this.currentStandingsLeague = defaultLeague;
            leagueSelect.addEventListener('change', () => {
                this.currentStandingsLeague = leagueSelect.value;
                this.saveSettings({ standingsLeague: this.currentStandingsLeague });
                this.syncStandingsSortOptions(sortSelect, this.currentStandingsLeague);
                this.loadStandings();
            });
        }

        if (viewSelect) {
            viewSelect.innerHTML = '';
            viewOptions.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.value = option.value;
                optionEl.textContent = option.label;
                viewSelect.appendChild(optionEl);
            });
            viewSelect.value = defaultView;
            this.currentStandingsView = defaultView;
            viewSelect.addEventListener('change', () => {
                this.currentStandingsView = this.normalizeStandingsView(viewSelect.value);
                this.saveSettings({ standingsView: this.currentStandingsView });
                this.loadStandings();
            });
        } else {
            this.currentStandingsView = defaultView;
        }

        this.currentStandingsSort = savedSort || 'default';
        this.syncStandingsSortOptions(sortSelect, defaultLeague);

        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                this.currentStandingsSort = sortSelect.value;
                this.saveSettings({ standingsSort: this.currentStandingsSort });
                this.loadStandings();
            });
        }

        this.showStandingsRank = defaultRank;
        if (rankToggle) {
            rankToggle.checked = this.showStandingsRank;
            rankToggle.addEventListener('change', () => {
                this.showStandingsRank = rankToggle.checked;
                this.saveSettings({ standingsShowRank: this.showStandingsRank });
                this.loadStandings();
            });
        }

        if (seasonSelect) {
            seasonSelect.innerHTML = '';
            seasonOptions.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.value = option;
                optionEl.textContent = option === 'current' ? 'Current' : option;
                seasonSelect.appendChild(optionEl);
            });
            seasonSelect.value = defaultSeason;
            this.currentStandingsSeason = defaultSeason;
            seasonSelect.addEventListener('change', () => {
                this.currentStandingsSeason = seasonSelect.value;
                this.saveSettings({ standingsSeason: this.currentStandingsSeason });
                this.loadStandings();
            });
        } else {
            this.currentStandingsSeason = defaultSeason;
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                API.clearStandingsCache();
                this.loadStandings();
            });
        }

        await this.loadStandings();
    },

    getStandingsViewOptions() {
        return [
            { value: 'divisions', label: 'Divisions' },
            { value: 'conferences', label: 'Conferences' },
            { value: 'overall', label: 'Overall' }
        ];
    },

    normalizeStandingsView(value) {
        if (!value) {
            return 'divisions';
        }
        if (value === 'grouped') {
            return 'conferences';
        }
        return value;
    },

    getStandingsSortOptions(league) {
        const options = [
            { value: 'default', label: 'Default' },
            { value: 'wins', label: 'Wins' },
            { value: 'winPercent', label: 'Win %' }
        ];
        if (league === 'nhl') {
            options.push({ value: 'points', label: 'Points' });
        }
        return options;
    },

    getStandingsSeasonOptions() {
        const years = ['current'];
        const currentYear = new Date().getFullYear();
        for (let year = currentYear; year >= currentYear - 6; year -= 1) {
            years.push(String(year));
        }
        return years;
    },

    getDefaultStandingsSort(league) {
        if (league === 'nhl') {
            return 'points';
        }
        return 'winPercent';
    },

    syncStandingsSortOptions(selectEl, league) {
        if (!selectEl) {
            return;
        }
        const options = this.getStandingsSortOptions(league);
        selectEl.innerHTML = '';
        options.forEach(option => {
            const optionEl = document.createElement('option');
            optionEl.value = option.value;
            optionEl.textContent = option.label;
            selectEl.appendChild(optionEl);
        });
        const valid = options.some(option => option.value === this.currentStandingsSort);
        if (!valid) {
            this.currentStandingsSort = options[0]?.value || 'default';
        }
        selectEl.value = this.currentStandingsSort;
    },

    parseStandingsSortValue(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        if (typeof value === 'number') {
            return Number.isFinite(value) ? value : null;
        }
        const cleaned = String(value).replace(/[^0-9.\-]/g, '');
        if (!cleaned) {
            return null;
        }
        const parsed = parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
    },

    sortStandingsEntries(entries, sortMode) {
        const list = Array.isArray(entries) ? entries.slice() : [];
        if (sortMode === 'default') {
            return list;
        }
        const keyMap = {
            wins: 'wins',
            winPercent: 'winPercent',
            points: 'points'
        };
        const key = keyMap[sortMode];
        if (!key) {
            return list;
        }
        return list.sort((a, b) => {
            const aValue = this.parseStandingsSortValue(a?.stats?.[key]);
            const bValue = this.parseStandingsSortValue(b?.stats?.[key]);
            const aMissing = aValue === null;
            const bMissing = bValue === null;
            if (aMissing && bMissing) {
                return 0;
            }
            if (aMissing) {
                return 1;
            }
            if (bMissing) {
                return -1;
            }
            if (bValue === aValue) {
                return 0;
            }
            return bValue - aValue;
        });
    },

    buildStandingsGroups(standings, league, viewMode, sortMode) {
        const normalizedView = this.normalizeStandingsView(viewMode);
        const rawGroups = Array.isArray(standings?.groups) ? standings.groups : [];
        const normalizedGroups = rawGroups.map(group => ({
            name: group?.name || 'Standings',
            entries: this.sortStandingsEntries(group?.entries || [], sortMode)
        }));

        if (normalizedView === 'divisions') {
            return this.buildDivisionGroups(rawGroups, league, sortMode);
        }

        if (normalizedView === 'overall') {
            const effectiveSort = sortMode === 'default'
                ? this.getDefaultStandingsSort(league)
                : sortMode;
            const combined = normalizedGroups.flatMap(group => group.entries || []);
            const sorted = this.sortStandingsEntries(combined, effectiveSort);
            const leagueLabel = standings?.league || league?.toUpperCase() || 'Overall';
            return [{
                name: `${leagueLabel} Overall`,
                entries: sorted
            }];
        }

        return normalizedGroups;
    },

    getDivisionGroupName(team, league) {
        if (!team?.division) {
            return null;
        }
        const conference = team.conference || '';
        const division = team.division || '';
        if (league === 'mlb' || league === 'nfl') {
            return `${conference} ${division}`.trim();
        }
        if (league === 'nba' || league === 'nhl') {
            return `${conference} ${division}`.trim();
        }
        return division || null;
    },

    getDivisionOrder(league) {
        switch (league) {
            case 'nfl':
                return [
                    'AFC East', 'AFC North', 'AFC South', 'AFC West',
                    'NFC East', 'NFC North', 'NFC South', 'NFC West'
                ];
            case 'mlb':
                return [
                    'AL East', 'AL Central', 'AL West',
                    'NL East', 'NL Central', 'NL West'
                ];
            case 'nba':
                return [
                    'Eastern Atlantic', 'Eastern Central', 'Eastern Southeast',
                    'Western Northwest', 'Western Pacific', 'Western Southwest'
                ];
            case 'nhl':
                return [
                    'Eastern Atlantic', 'Eastern Metropolitan',
                    'Western Central', 'Western Pacific'
                ];
            default:
                return [];
        }
    },

    buildDivisionGroups(rawGroups, league, sortMode) {
        const entries = rawGroups.flatMap(group => group?.entries || []);
        const groupMap = new Map();

        entries.forEach(entry => {
            const resolvedTeam = TeamsUtil.resolveTeam(entry?.team, league);
            const groupName = this.getDivisionGroupName(resolvedTeam, league) || 'Other';
            const enrichedEntry = resolvedTeam
                ? { ...entry, team: { ...resolvedTeam, ...entry.team } }
                : entry;
            if (!groupMap.has(groupName)) {
                groupMap.set(groupName, []);
            }
            groupMap.get(groupName).push(enrichedEntry);
        });

        const order = this.getDivisionOrder(league);
        const groups = Array.from(groupMap.entries()).map(([name, entriesList]) => ({
            name,
            entries: this.sortStandingsEntries(entriesList, sortMode)
        }));

        return groups.sort((a, b) => {
            const aIndex = order.indexOf(a.name);
            const bIndex = order.indexOf(b.name);
            const aRank = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
            const bRank = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
            if (aRank !== bRank) {
                return aRank - bRank;
            }
            return a.name.localeCompare(b.name);
        });
    },

    getStandingsColumns(league) {
        switch (league) {
            case 'nhl':
                return [
                    { key: 'wins', label: 'W' },
                    { key: 'losses', label: 'L' },
                    { key: 'otLosses', label: 'OTL' },
                    { key: 'points', label: 'PTS' },
                    { key: 'gamesBehind', label: 'GB' }
                ];
            case 'nba':
            case 'mlb':
                return [
                    { key: 'wins', label: 'W' },
                    { key: 'losses', label: 'L' },
                    { key: 'winPercent', label: 'PCT' },
                    { key: 'gamesBehind', label: 'GB' }
                ];
            case 'nfl':
            default:
                return [
                    { key: 'wins', label: 'W' },
                    { key: 'losses', label: 'L' },
                    { key: 'ties', label: 'T' },
                    { key: 'winPercent', label: 'PCT' },
                    { key: 'gamesBehind', label: 'GB' }
                ];
        }
    },

    formatStandingsValue(value) {
        if (value === null || value === undefined || value === '') {
            return '-';
        }
        return value;
    },

    async loadStandings() {
        const league = this.currentStandingsLeague || Config.AMERICAN_LEAGUES[0];
        const viewMode = this.normalizeStandingsView(this.currentStandingsView || 'divisions');
        const sortMode = this.currentStandingsSort || 'default';
        const showRank = Boolean(this.showStandingsRank);
        const season = this.currentStandingsSeason || 'current';
        const statusEl = document.getElementById('standings-status');
        const contentEl = document.getElementById('standings-content');
        const emptyEl = document.getElementById('standings-empty');

        if (!contentEl) return;

        contentEl.innerHTML = `
            <div class="loading-state">
                <div class="loader"></div>
                <p>Loading standings...</p>
            </div>
        `;
        emptyEl?.classList.add('hidden');
        if (statusEl) {
            statusEl.textContent = '';
        }

        await TeamsUtil.preloadLogos(league);

        const seasonParam = season !== 'current' ? season : null;
        const data = await API.fetchStandings(league, { season: seasonParam });
        const standings = data?.standings;
        const meta = data?.meta || null;
        if (meta && statusEl) {
            const age = typeof meta.cacheAgeSec === 'number' ? meta.cacheAgeSec : null;
            const ageLabel = age !== null ? this.formatAge(age) : 'just now';
            const seasonValue = standings?.season || (season !== 'current' ? season : '');
            const seasonLabel = seasonValue ? `${seasonValue} · ` : '';
            statusEl.textContent = `${seasonLabel}Updated ${ageLabel}${meta.stale ? ' (stale)' : ''}`;
            statusEl.classList.toggle('stale', Boolean(meta.stale));
        }

        const groups = this.buildStandingsGroups(standings, league, viewMode, sortMode);

        if (!standings || !Array.isArray(groups) || groups.length === 0) {
            contentEl.innerHTML = '';
            emptyEl?.classList.remove('hidden');
            return;
        }

        contentEl.innerHTML = '';
        groups.forEach(group => {
            const section = document.createElement('section');
            section.className = 'standings-group';

            const header = document.createElement('h2');
            header.className = 'standings-group-title';
            header.textContent = group.name || 'Standings';
            section.appendChild(header);

            const table = document.createElement('table');
            table.className = 'standings-table';

            const columns = this.getStandingsColumns(league);
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            if (showRank) {
                const rankHeader = document.createElement('th');
                rankHeader.textContent = '#';
                rankHeader.className = 'standings-rank-col';
                headerRow.appendChild(rankHeader);
            }
            const teamHeader = document.createElement('th');
            teamHeader.textContent = 'Team';
            teamHeader.className = 'standings-team-col';
            headerRow.appendChild(teamHeader);
            columns.forEach(column => {
                const th = document.createElement('th');
                th.textContent = column.label;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            const tbody = document.createElement('tbody');
            (group.entries || []).forEach((entry, index) => {
                const row = document.createElement('tr');
                if (showRank) {
                    const rankCell = document.createElement('td');
                    rankCell.textContent = String(index + 1);
                    rankCell.className = 'standings-rank-col';
                    row.appendChild(rankCell);
                }
                const teamCell = document.createElement('td');
                teamCell.className = 'standings-team-col';
                const teamWrap = document.createElement('div');
                teamWrap.className = 'standings-team';

                const logo = document.createElement('img');
                logo.className = 'standings-logo hidden';
                logo.loading = 'lazy';
                this.setTeamLogo(logo, entry.team, league);
                if (!logo.classList.contains('hidden')) {
                    teamWrap.appendChild(logo);
                }

                const nameSpan = document.createElement('span');
                nameSpan.textContent = entry.team?.name || entry.team?.abbreviation || 'Unknown';
                teamWrap.appendChild(nameSpan);

                teamCell.appendChild(teamWrap);
                row.appendChild(teamCell);

                columns.forEach(column => {
                    const cell = document.createElement('td');
                    cell.textContent = this.formatStandingsValue(entry.stats?.[column.key]);
                    row.appendChild(cell);
                });

                tbody.appendChild(row);
            });

            table.appendChild(tbody);
            section.appendChild(table);
            contentEl.appendChild(section);
        });
    },

    /**
     * Build a multi-view tile
     * @param {Object} item - Multi-view item
     * @returns {HTMLElement|null}
     */
    async buildMultiViewTile(item) {
        if (!item?.slug) return null;

        const tile = document.createElement('div');
        tile.className = 'multi-tile';
        tile.dataset.key = item.key;

        tile.innerHTML = `
            <div class="multi-window-bar">
                <div>
                    <div class="multi-title"></div>
                    <div class="multi-meta"></div>
                </div>
                <div class="multi-window-actions">
                    <button class="btn btn-secondary btn-small multi-focus-btn" type="button">Focus</button>
                    <a class="btn btn-secondary btn-small multi-open-link" href="#">Open</a>
                    <button class="btn btn-secondary btn-small remove-multi-btn" type="button">Remove</button>
                </div>
            </div>
            <div class="multi-embed">
                <div class="multi-embed-loading">
                    <div class="loader"></div>
                    <p>Loading stream...</p>
                </div>
                <div class="multi-embed-error hidden">Stream unavailable.</div>
            </div>
        `;

        let game = await API.getGameBySlug(item.slug, { league: item.league });
        if (!game && item.league !== 'all') {
            game = await API.getGameBySlug(item.slug, { league: 'all' });
        }
        let enriched = game ? API.enrichGame(game) : null;

        if (!enriched) {
            const stored = Storage.getGameBySlug(item.slug, item.league);
            enriched = stored ? Storage.enrichGame(stored) : null;
        }

        const league = enriched?.league || item.league || Config.DEFAULT_LEAGUE;
        const storedLeague = item.league || league;
        const displayTitle = enriched?.displayTitle || item.title || item.slug;
        const currentSource = enriched?.currentSource || item.source || 'admin';
        const streamId = item.streamId || 1;
        const watchSlug = enriched?.slug || item.slug;
        const watchUrl = `#/watch/${watchSlug}?league=${league}`;

        Storage.updateMultiViewItem(item.key, {
            title: displayTitle,
            source: currentSource,
            streamId
        });

        const titleEl = tile.querySelector('.multi-title');
        const metaEl = tile.querySelector('.multi-meta');
        const openLink = tile.querySelector('.multi-open-link');
        const focusBtn = tile.querySelector('.multi-focus-btn');
        if (titleEl) {
            titleEl.textContent = displayTitle;
        }
        if (metaEl) {
            const leagueName = Config.getLeagueConfig(league)?.name || league.toUpperCase();
            metaEl.textContent = leagueName;
        }
        if (openLink) {
            openLink.href = watchUrl;
        }
        if (focusBtn) {
            focusBtn.addEventListener('click', () => {
                if (this.multiViewFocusKey === item.key) {
                    this.multiViewFocusKey = null;
                } else {
                    this.multiViewFocusKey = item.key;
                }
                this.applyMultiViewFocus();
            });
        }

        const removeBtn = tile.querySelector('.remove-multi-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                Storage.removeFromMultiView(item.slug, storedLeague);
                this.updateMultiViewCount();
                if (this.multiViewFocusKey === item.key) {
                    this.multiViewFocusKey = null;
                }
                this.renderMultiViewTiles();
            });
        }

        this.loadMultiEmbed(tile, watchSlug, streamId, currentSource);
        return tile;
    },

    /**
     * Load embed iframe inside a multi-view tile
     */
    loadMultiEmbed(tile, slug, streamId, sourceType) {
        const container = tile?.querySelector('.multi-embed');
        const loadingEl = tile?.querySelector('.multi-embed-loading');
        const errorEl = tile?.querySelector('.multi-embed-error');
        if (!container) return;

        loadingEl?.classList.remove('hidden');
        errorEl?.classList.add('hidden');

        const existingIframe = container.querySelector('iframe');
        if (existingIframe) {
            existingIframe.remove();
        }

        const url = EmbedUtil.buildEmbedUrl(slug, streamId, sourceType);
        if (!url) {
            loadingEl?.classList.add('hidden');
            errorEl?.classList.remove('hidden');
            return;
        }

        const titleText = tile?.querySelector('.multi-title')?.textContent || 'Multi-view stream';
        const iframe = EmbedUtil.createSecureIframe(url, titleText);
        if (!iframe) {
            loadingEl?.classList.add('hidden');
            errorEl?.classList.remove('hidden');
            return;
        }

        this.applyMobileEmbedPolicy(iframe, url);

        iframe.addEventListener('load', () => {
            loadingEl?.classList.add('hidden');
        });

        container.appendChild(iframe);
    },

    /**
     * Render the add game page
     */
    renderAddGamePage() {
        this.clearContent();
        this.formPreviewInitialized = false;
        const fragment = this.getTemplate('add-game-template');
        this.mainContent.appendChild(fragment);

        const leagueSelect = document.getElementById('league-select');
        if (leagueSelect) {
            const defaultLeague = this.currentLeague !== 'all' ? this.currentLeague : Config.DEFAULT_LEAGUE;
            leagueSelect.value = defaultLeague;
        }

        // Populate team selects
        this.populateTeamSelects();

        // Set up league selector
        this.setupLeagueSelect();

        // Set up form preview
        this.setupFormPreview();

        // Handle form submission
        this.setupAddGameForm();
    },

    /**
     * Populate team dropdown selects
     */
    populateTeamSelects() {
        const awaySelect = document.getElementById('away-team');
        const homeSelect = document.getElementById('home-team');
        const leagueSelect = document.getElementById('league-select');

        if (!awaySelect || !homeSelect) return;

        const selectedLeague = leagueSelect?.value || Config.DEFAULT_LEAGUE;
        const teams = TeamsUtil.getAllTeams(selectedLeague);

        awaySelect.innerHTML = '';
        homeSelect.innerHTML = '';

        const placeholderAway = document.createElement('option');
        placeholderAway.value = '';
        placeholderAway.textContent = 'Select team...';
        awaySelect.appendChild(placeholderAway);

        const placeholderHome = document.createElement('option');
        placeholderHome.value = '';
        placeholderHome.textContent = 'Select team...';
        homeSelect.appendChild(placeholderHome);

        teams.forEach(team => {
            const awayOption = document.createElement('option');
            awayOption.value = team.id;
            awayOption.textContent = team.name;
            awaySelect.appendChild(awayOption);

            const homeOption = document.createElement('option');
            homeOption.value = team.id;
            homeOption.textContent = team.name;
            homeSelect.appendChild(homeOption);
        });
    },

    /**
     * Set up league select for add game form
     */
    setupLeagueSelect() {
        const leagueSelect = document.getElementById('league-select');
        if (!leagueSelect) return;

        leagueSelect.addEventListener('change', () => {
            this.populateTeamSelects();
            this.updateFormPreview();
        });
    },

    /**
     * Set up live preview for the add game form
     */
    setupFormPreview() {
        const awaySelect = document.getElementById('away-team');
        const homeSelect = document.getElementById('home-team');
        const customSlug = document.getElementById('custom-slug');
        const slugPreview = document.getElementById('slug-preview');
        const urlPreview = document.getElementById('url-preview');
        const leagueSelect = document.getElementById('league-select');

        if (!awaySelect || !homeSelect || !customSlug || !slugPreview || !urlPreview) {
            return;
        }

        if (!this.formPreviewInitialized) {
            awaySelect.addEventListener('change', () => this.updateFormPreview());
            homeSelect.addEventListener('change', () => this.updateFormPreview());
            customSlug.addEventListener('input', () => this.updateFormPreview());
            leagueSelect?.addEventListener('change', () => this.updateFormPreview());
            this.formPreviewInitialized = true;
        }

        this.updateFormPreview();
    },

    /**
     * Update the add game form preview
     */
    updateFormPreview() {
        const awaySelect = document.getElementById('away-team');
        const homeSelect = document.getElementById('home-team');
        const customSlug = document.getElementById('custom-slug');
        const slugPreview = document.getElementById('slug-preview');
        const urlPreview = document.getElementById('url-preview');
        const leagueSelect = document.getElementById('league-select');

        if (!awaySelect || !homeSelect || !customSlug || !slugPreview || !urlPreview) {
            return;
        }

        const selectedLeague = leagueSelect?.value || Config.DEFAULT_LEAGUE;
        const awayTeam = TeamsUtil.getTeam(awaySelect.value, selectedLeague);
        const homeTeam = TeamsUtil.getTeam(homeSelect.value, selectedLeague);
        const config = Config.getLeagueConfig(selectedLeague);

        let slug = '-';
        let url = '-';

        if (customSlug.value) {
            slug = EmbedUtil.sanitizeSlug(customSlug.value);
        } else if (awayTeam && homeTeam) {
            slug = EmbedUtil.generateGameSlug(awayTeam, homeTeam, config.SLUG_PREFIX);
        }

        if (slug && slug !== '-') {
            url = EmbedUtil.buildEmbedUrl(slug, 1) || '-';
        }

        slugPreview.textContent = slug;
        urlPreview.textContent = url;
    },

    /**
     * Set up add game form submission
     */
    setupAddGameForm() {
        const form = document.getElementById('add-game-form');
        if (!form) return;

        form.addEventListener('submit', (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const awayTeamId = formData.get('awayTeam');
            const homeTeamId = formData.get('homeTeam');
            const gameTime = formData.get('gameTime');
            const isLive = formData.get('isLive') === 'on';
            const customSlug = formData.get('customSlug');
            const league = formData.get('league') || Config.DEFAULT_LEAGUE;

            // Validate teams selected
            if (!awayTeamId || !homeTeamId) {
                alert('Please select both teams.');
                return;
            }

            if (awayTeamId === homeTeamId) {
                alert('Away and home team cannot be the same.');
                return;
            }

            // Add the game
            const game = Storage.addGame({
                awayTeamId,
                homeTeamId,
                gameTime: gameTime || null,
                isLive,
                slug: customSlug || null,
                league
            });

            if (game) {
                // Navigate to games list
                Router.navigate('/');
            } else {
                alert('Failed to add game. A game with this matchup may already exist.');
            }
        });
    },

    /**
     * Render 404 not found page
     */
    renderNotFound() {
        this.clearContent();
        const fragment = this.getTemplate('not-found-template');
        this.mainContent.appendChild(fragment);
    },

    /**
     * Update active state in navigation
     */
    updateNavActiveState() {
        const path = Router.getCurrentPath();
        const navLinks = document.querySelectorAll('.nav-link');

        navLinks.forEach(link => {
            const href = link.getAttribute('href').replace('#', '');
            link.classList.toggle('active', path === href || (href === '/' && path === '/'));
        });
    }
};
