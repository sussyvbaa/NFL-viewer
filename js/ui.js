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
    liveAlertsEnabled: false,
    liveSoundEnabled: false,
    notifiedLiveGames: new Set(),
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
    statsState: {
        status: 'idle',
        lastKey: null,
        data: null,
        game: null,
        autoRefresh: false,
        refreshTimer: null,
        lastUpdated: null
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
        if (!this.mainContent) {
            this.mainContent = document.getElementById('main-content');
        }
        if (!this.mainContent) {
            return;
        }
        this.clearStatsAutoRefresh();
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
        this.liveAlertsEnabled = settings?.liveAlertsEnabled === true;
        this.liveSoundEnabled = settings?.liveSoundEnabled === true;
        const notified = Array.isArray(settings?.liveNotified) ? settings.liveNotified : [];
        this.notifiedLiveGames = new Set(notified);
    },

    async requestNotificationPermission() {
        if (!('Notification' in window)) return 'unsupported';
        if (Notification.permission === 'granted') return 'granted';
        if (Notification.permission === 'denied') return 'denied';
        try {
            return await Notification.requestPermission();
        } catch (error) {
            console.warn('Notification permission failed:', error);
            return 'denied';
        }
    },

    notifyLiveGames(games) {
        if (!this.liveAlertsEnabled || !('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        const newlyLive = (games || []).filter(game => {
            if (!game?.isLive) return false;
            const leagueKey = game.league || Config.DEFAULT_LEAGUE;
            const slug = EmbedUtil.sanitizeSlug(game.slug);
            const key = `${leagueKey}:${slug}`;
            return !this.notifiedLiveGames.has(key);
        });

        if (newlyLive.length === 0) return;

        newlyLive.forEach(game => {
            const away = game.awayTeam?.name || game.teams?.away?.name || 'Away';
            const home = game.homeTeam?.name || game.teams?.home?.name || 'Home';
            const title = `${away} vs ${home}`;
            try {
                new Notification('Game is Live', {
                    body: title,
                    icon: '/icons/icon.svg'
                });
            } catch (error) {
                console.warn('Failed to show notification:', error);
            }

            if (this.liveSoundEnabled) {
                this.playAlertSound();
            }

            const leagueKey = game.league || Config.DEFAULT_LEAGUE;
            const slug = EmbedUtil.sanitizeSlug(game.slug);
            const key = `${leagueKey}:${slug}`;
            this.notifiedLiveGames.add(key);
        });

        this.saveSettings({ liveNotified: Array.from(this.notifiedLiveGames) });
    },

    playAlertSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
            gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.2);

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.2);
            oscillator.onended = () => audioContext.close();
        } catch (error) {
            console.warn('Alert sound failed:', error);
        }
    },

    triggerTestAlert() {
        try {
            new Notification('Live Alert Test', {
                body: 'Notifications are working properly.',
                icon: '/icons/icon.svg'
            });
        } catch (error) {
            console.warn('Test notification failed:', error);
        }

        if (this.liveSoundEnabled) {
            this.playAlertSound();
        }
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
        const liveAlertsToggle = document.getElementById('settings-live-alerts');
        const liveSoundToggle = document.getElementById('settings-live-sound');
        const testAlertBtn = document.getElementById('settings-test-alert');

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
            if (liveAlertsToggle) {
                liveAlertsToggle.checked = this.liveAlertsEnabled;
            }
            if (liveSoundToggle) {
                liveSoundToggle.checked = this.liveSoundEnabled;
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

        liveAlertsToggle?.addEventListener('change', async () => {
            this.liveAlertsEnabled = liveAlertsToggle.checked;
            if (this.liveAlertsEnabled) {
                await this.requestNotificationPermission();
            }
            this.saveSettings({ liveAlertsEnabled: this.liveAlertsEnabled });
        });

        liveSoundToggle?.addEventListener('change', () => {
            this.liveSoundEnabled = liveSoundToggle.checked;
            this.saveSettings({ liveSoundEnabled: this.liveSoundEnabled });
        });

        testAlertBtn?.addEventListener('click', async () => {
            const permission = await this.requestNotificationPermission();
            if (permission !== 'granted') {
                const showMessage = window.App?.showToast
                    ? window.App.showToast
                    : (message) => window.alert(message);
                showMessage('Enable notifications in browser settings');
                return;
            }
            this.triggerTestAlert();
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

            this.notifyLiveGames(allGames);

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

    getTeamColorTokens(team, fallbackLabel) {
        const rawColor = team?.color || team?.primaryColor || team?.teamColor || team?.alternateColor || team?.altColor;
        const base = this.normalizeColor(rawColor) || this.stringToHsl(fallbackLabel || team?.name || 'team');
        const soft = this.toTransparentColor(base, 0.18);
        return { base, soft };
    },

    normalizeColor(value) {
        if (!value || typeof value !== 'string') return null;
        const hex = value.trim().replace('#', '');
        if (/^[0-9a-fA-F]{3}$/.test(hex)) {
            return `#${hex.split('').map(c => c + c).join('')}`;
        }
        if (/^[0-9a-fA-F]{6}$/.test(hex)) {
            return `#${hex}`;
        }
        return null;
    },

    stringToHsl(value) {
        const str = (value || '').toString();
        let hash = 0;
        for (let i = 0; i < str.length; i += 1) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 70%, 55%)`;
    },

    toTransparentColor(color, alpha) {
        if (!color) return `rgba(255,255,255,${alpha})`;
        if (color.startsWith('hsl')) {
            return color.replace('hsl', 'hsla').replace(')', `, ${alpha})`);
        }
        if (!color.startsWith('#')) return `rgba(255,255,255,${alpha})`;
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
            card.classList.add('is-live');
        } else if (game.isEnded) {
            status.textContent = 'Final';
            status.classList.add('ended');
            card.classList.add('is-ended');
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
        const awayDisplay = awayLabel || this.extractTeamAbbrev(game.title, 'away');
        const homeDisplay = homeLabel || this.extractTeamAbbrev(game.title, 'home');
        awayTeam.textContent = awayDisplay;
        homeTeam.textContent = homeDisplay;

        const awayColors = this.getTeamColorTokens(game.awayTeam, awayDisplay);
        const homeColors = this.getTeamColorTokens(game.homeTeam, homeDisplay);
        card.style.setProperty('--away-color', awayColors.base);
        card.style.setProperty('--away-color-soft', awayColors.soft);
        card.style.setProperty('--home-color', homeColors.base);
        card.style.setProperty('--home-color-soft', homeColors.soft);

        const awayLogo = card.querySelector('.away-logo');
        const homeLogo = card.querySelector('.home-logo');
        this.setTeamLogo(awayLogo, game.awayTeam, game.league || Config.DEFAULT_LEAGUE);
        this.setTeamLogo(homeLogo, game.homeTeam, game.league || Config.DEFAULT_LEAGUE);

        const awayScore = card.querySelector('.away-score');
        const homeScore = card.querySelector('.home-score');
        if (this.showScores) {
            const awayValue = game.awayTeam?.score ?? game.awayScore;
            const homeValue = game.homeTeam?.score ?? game.homeScore;
            const hasAwayScore = awayValue !== undefined && awayValue !== null && awayValue !== '';
            const hasHomeScore = homeValue !== undefined && homeValue !== null && homeValue !== '';

            if (awayScore) {
                awayScore.textContent = hasAwayScore ? awayValue : '—';
                awayScore.classList.toggle('is-empty', !hasAwayScore);
                awayScore.classList.remove('hidden');
            }
            if (homeScore) {
                homeScore.textContent = hasHomeScore ? homeValue : '—';
                homeScore.classList.toggle('is-empty', !hasHomeScore);
                homeScore.classList.remove('hidden');
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
                multiBtn.classList.add('in-multi');
                multiBtn.title = 'Remove from Multi-View';
            }
            multiBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (multiBtn.classList.contains('in-multi')) {
                    Storage.removeFromMultiView(game.slug, leagueKey);
                    multiBtn.classList.remove('in-multi');
                    multiBtn.title = 'Add to multi-view';
                    this.updateMultiViewCount();
                    return;
                }

                const result = Storage.addToMultiView(game);
                if (result.added) {
                    multiBtn.classList.add('in-multi');
                    multiBtn.title = 'Remove from Multi-View';
                    this.updateMultiViewCount();
                } else if (result.reason === 'limit') {
                    alert(`Multi-view supports up to ${Config.MULTI_VIEW_MAX} games.`);
                } else if (result.reason === 'exists') {
                    // Should be handled by inMulti check, but just in case
                    multiBtn.classList.add('in-multi');
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
        this.setupWatchTabs();
        this.renderWatchInfo(enrichedGame);
        this.loadStats(enrichedGame);
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
        this.setupWatchTabs();
        this.renderWatchInfo(null);
        this.renderStatsError('Stats unavailable for this stream.');
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

    setupWatchTabs() {
        const tabs = Array.from(document.querySelectorAll('.watch-tab'));
        const panels = Array.from(document.querySelectorAll('.watch-tab-panel'));
        if (!tabs.length || !panels.length) return;

        const activate = (tabKey) => {
            tabs.forEach(tab => tab.classList.toggle('is-active', tab.dataset.tab === tabKey));
            panels.forEach(panel => panel.classList.toggle('is-active', panel.dataset.panel === tabKey));
        };

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const key = tab.dataset.tab;
                if (key) activate(key);
            });
        });

        const defaultTab = tabs.find(tab => tab.classList.contains('is-active')) || tabs[0];
        if (defaultTab?.dataset.tab) {
            activate(defaultTab.dataset.tab);
        }
    },

    renderWatchInfo(game) {
        const info = document.getElementById('watch-info');
        if (!info) return;
        info.innerHTML = '';

        const items = [];
        if (game) {
            const leagueName = Config.getLeagueConfig(game.league || Config.DEFAULT_LEAGUE)?.name || (game.league || '').toUpperCase();
            const status = game.isLive ? 'Live' : (game.isEnded ? 'Final' : 'Upcoming');
            items.push({ label: 'League', value: leagueName });
            items.push({ label: 'Status', value: status });
            if (game.formattedTime) {
                items.push({ label: 'Start', value: game.formattedTime });
            }
            items.push({ label: 'Source', value: this.embedState.currentSource || 'admin' });
        } else {
            items.push({ label: 'Status', value: 'Stream info unavailable' });
        }

        const fragment = document.createDocumentFragment();
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'watch-info-row';
            const label = document.createElement('span');
            label.className = 'watch-info-label';
            label.textContent = item.label;
            const value = document.createElement('span');
            value.className = 'watch-info-value';
            value.textContent = item.value;
            row.appendChild(label);
            row.appendChild(value);
            fragment.appendChild(row);
        });
        info.appendChild(fragment);
    },

    async loadStats(game) {
        const content = document.getElementById('stats-content');
        if (!content) return;
        if (!game) {
            this.renderStatsError('Stats unavailable for this stream.');
            return;
        }

        const key = `${game.league || 'all'}:${game.slug || ''}`;
        this.statsState.status = 'loading';
        this.statsState.lastKey = key;
        this.statsState.data = null;
        this.statsState.game = game;
        this.renderStatsLoading();

        const stats = await API.getGameStats(game);
        if (this.statsState.lastKey !== key) return;
        if (!stats) {
            this.renderStatsError('No stats available for this game yet.');
            return;
        }
        this.statsState.status = 'ready';
        this.statsState.data = stats;
        this.statsState.lastUpdated = new Date();
        this.renderStatsContent(stats);
        if (this.statsState.autoRefresh) {
            this.setStatsAutoRefresh(true);
        }
    },

    renderStatsLoading() {
        const loading = document.getElementById('stats-loading');
        const error = document.getElementById('stats-error');
        const content = document.getElementById('stats-content');
        loading?.classList.remove('hidden');
        error?.classList.add('hidden');
        content?.classList.add('hidden');
    },

    renderStatsError(message) {
        const loading = document.getElementById('stats-loading');
        const error = document.getElementById('stats-error');
        const content = document.getElementById('stats-content');
        if (error) {
            error.textContent = message;
            error.classList.remove('hidden');
        }
        loading?.classList.add('hidden');
        content?.classList.add('hidden');
    },

    normalizeStatKey(stat) {
        const raw = [stat?.name, stat?.abbreviation, stat?.displayName].find(Boolean);
        if (!raw) return '';
        return raw.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
    },

    formatTeamStatLabel(stat) {
        const key = this.normalizeStatKey(stat);
        const labels = {
            fieldgoalsmadefieldgoalsattempted: 'Field Goals (M-A)',
            threepointfieldgoalsmadethreepointfieldgoalsattempted: '3PT (M-A)',
            freethrowsmadefreethrowsattempted: 'Free Throws (M-A)',
            fieldgoalpct: 'FG%',
            threepointfieldgoalpct: '3PT%',
            freethrowpct: 'FT%',
            totalrebounds: 'Rebounds',
            offensiverebounds: 'Off Reb',
            defensiverebounds: 'Def Reb',
            assists: 'Assists',
            steals: 'Steals',
            blocks: 'Blocks',
            turnovers: 'Turnovers',
            teamturnovers: 'Team Turnovers',
            totalturnovers: 'Total Turnovers',
            technicalfouls: 'Technical Fouls',
            totaltechnicalfouls: 'Total Technical Fouls',
            flagrantfouls: 'Flagrant Fouls',
            turnoverpoints: 'Points Off Turnovers',
            fastbreakpoints: 'Fast Break Points',
            pointsinpaint: 'Points In Paint',
            fouls: 'Fouls',
            largestlead: 'Largest Lead',
            leadchanges: 'Lead Changes',
            leadpercentage: 'Lead %',
            totalyards: 'Total Yards',
            passingyards: 'Pass Yards',
            netpassingyards: 'Pass Yards',
            rushingyards: 'Rush Yards',
            firstdowns: '1st Downs',
            thirdownefficiency: '3rd Down',
            thirddowneff: '3rd Down',
            fourthdownefficiency: '4th Down',
            timeofpossession: 'Time of Possession',
            redzoneattempts: 'Red Zone Att',
            redzonepercentage: 'Red Zone %',
            runs: 'Runs',
            hits: 'Hits',
            errors: 'Errors',
            homeruns: 'Home Runs',
            runsbattedin: 'RBI',
            battingaverage: 'AVG',
            onbasepercentage: 'OBP',
            sluggingpercentage: 'SLG',
            onbaseplusslugging: 'OPS',
            earnedrunaverage: 'ERA',
            strikeouts: 'Strikeouts',
            walks: 'Walks',
            hitsallowed: 'Hits Allowed',
            runsearned: 'Earned Runs',
            shotsongoal: 'Shots on Goal',
            powerplaygoals: 'Power Play Goals',
            powerplayopportunities: 'PP Opportunities',
            powerplaypercentage: 'PP%',
            faceoffwinpercentage: 'Faceoff %',
            faceoffwins: 'Faceoff Wins',
            penaltyminutes: 'Penalty Minutes',
            blockedshots: 'Blocks',
            giveaways: 'Giveaways',
            takeaways: 'Takeaways'
        };
        if (labels[key]) return labels[key];

        const display = stat?.displayName || stat?.abbreviation || stat?.name || '';
        let label = display.toString();
        label = label.replace(/([a-z])([A-Z])/g, '$1 $2');
        label = label.replace(/-/g, ' ');
        label = label.replace(/\bPct\b/gi, '%');
        label = label.replace(/\bPercentage\b/gi, '%');
        label = label.replace(/\s+/g, ' ').trim();
        return label.replace(/\b\w/g, char => char.toUpperCase());
    },

    formatTeamStatValue(stat) {
        const raw = stat?.displayValue ?? stat?.value;
        if (raw === undefined || raw === null || raw === '') return '—';
        let value = raw.toString();
        const key = this.normalizeStatKey(stat);
        const needsPercent = key.endsWith('pct') || key.includes('percentage');
        if (needsPercent && !value.includes('%')) {
            value = `${value}%`;
        }
        return value;
    },

    shouldIncludeTeamStat(stat) {
        const key = this.normalizeStatKey(stat);
        if (!key) return false;
        const blocked = ['avg', 'average', 'streak', 'lastten', 'record', 'home', 'road', 'conference', 'division'];
        return !blocked.some(token => key.includes(token));
    },

    parseStatValue(value) {
        if (value === undefined || value === null) return null;
        const text = value.toString().trim();
        if (!text || text === '—') return null;
        if (text.includes(':')) {
            const parts = text.split(':').map(Number);
            if (parts.length === 2 && parts.every(num => !Number.isNaN(num))) {
                return (parts[0] * 60) + parts[1];
            }
        }
        const match = text.match(/-?\d+(?:\.\d+)?/);
        if (!match) return null;
        return Number.parseFloat(match[0]);
    },

    makeStatsTableSortable(table) {
        if (!table) return;
        const header = table.querySelector('.stats-row-header');
        if (!header) return;
        const headerCells = Array.from(header.children).slice(1);
        headerCells.forEach((cell, index) => {
            cell.classList.add('stats-sortable');
            cell.setAttribute('role', 'button');
            cell.setAttribute('tabindex', '0');
            cell.setAttribute('aria-sort', 'none');
            cell.dataset.sortIndex = String(index);
            const handler = () => this.sortStatsTable(table, index, cell);
            cell.addEventListener('click', handler);
            cell.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handler();
                }
            });
        });
    },

    sortStatsTable(table, columnIndex, activeCell) {
        const rows = Array.from(table.querySelectorAll('.stats-row'))
            .filter(row => !row.classList.contains('stats-row-header'));
        if (!rows.length) return;

        const currentIndex = table.dataset.sortIndex;
        const currentOrder = table.dataset.sortOrder || 'desc';
        const nextOrder = currentIndex === String(columnIndex) && currentOrder === 'desc' ? 'asc' : 'desc';
        table.dataset.sortIndex = columnIndex;
        table.dataset.sortOrder = nextOrder;

        rows.sort((a, b) => {
            const aCell = a.children[columnIndex + 1];
            const bCell = b.children[columnIndex + 1];
            const aValue = this.parseStatValue(aCell?.textContent);
            const bValue = this.parseStatValue(bCell?.textContent);
            if (aValue === null && bValue === null) return 0;
            if (aValue === null) return 1;
            if (bValue === null) return -1;
            return nextOrder === 'asc' ? aValue - bValue : bValue - aValue;
        });

        rows.forEach(row => table.appendChild(row));

        table.querySelectorAll('.stats-sortable').forEach(cell => {
            cell.classList.remove('is-sorted', 'is-asc', 'is-desc');
            cell.setAttribute('aria-sort', 'none');
        });
        rows.forEach(row => {
            Array.from(row.children).forEach(child => child.classList.remove('is-sorted'));
        });
        if (activeCell) {
            activeCell.classList.add('is-sorted');
            activeCell.classList.add(nextOrder === 'asc' ? 'is-asc' : 'is-desc');
            activeCell.setAttribute('aria-sort', nextOrder === 'asc' ? 'ascending' : 'descending');
        }
        rows.forEach(row => {
            const cell = row.children[columnIndex + 1];
            if (cell) {
                cell.classList.add('is-sorted');
            }
        });
    },

    formatStatsTimestamp(timestamp) {
        if (!timestamp) return '—';
        try {
            return timestamp.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return '—';
        }
    },

    clearStatsAutoRefresh() {
        if (this.statsState.refreshTimer) {
            clearInterval(this.statsState.refreshTimer);
            this.statsState.refreshTimer = null;
        }
    },

    setStatsAutoRefresh(enabled) {
        this.statsState.autoRefresh = Boolean(enabled);
        this.clearStatsAutoRefresh();
        const game = this.statsState.game;
        if (!game || !this.statsState.autoRefresh) return;
        this.statsState.refreshTimer = setInterval(() => {
            this.refreshStats(true);
        }, 30000);
    },

    async refreshStats(forceRefresh = false) {
        const game = this.statsState.game;
        if (!game) return;
        const key = `${game.league || 'all'}:${game.slug || ''}`;
        this.statsState.lastKey = key;
        try {
            const stats = await API.getGameStats(game, { forceRefresh });
            if (this.statsState.lastKey !== key) return;
            if (stats) {
                this.statsState.status = 'ready';
                this.statsState.data = stats;
                this.statsState.lastUpdated = new Date();
                this.renderStatsContent(stats);
            }
        } catch (error) {
            console.warn('Failed to refresh stats:', error);
        }
    },

    getStatsCompetition(payload) {
        const header = payload?.header || {};
        const competition = header?.competitions?.[0] || header?.competition || header?.competitions || null;
        return competition && Array.isArray(competition) ? competition[0] : competition;
    },

    resolveStatsTeam(rawTeam, league) {
        if (!rawTeam) return null;
        return TeamsUtil.resolveTeam(rawTeam, league || this.embedState.currentLeague || Config.DEFAULT_LEAGUE);
    },

    getStatsRecordSummary(records = []) {
        const list = Array.isArray(records) ? records : [];
        const overall = list.find(record => record?.type === 'total') || list.find(record => record?.name === 'overall');
        return overall?.summary || overall?.displayValue || '—';
    },

    getStatsStatusLabel(statusType = {}) {
        const state = statusType?.state || '';
        if (state === 'in') return 'Live';
        if (state === 'post') return 'Final';
        if (state === 'pre') return 'Upcoming';
        return statusType?.shortDetail || statusType?.detail || statusType?.description || '—';
    },

    buildStatsHeader(payload) {
        const competition = this.getStatsCompetition(payload);
        const status = competition?.status?.type || payload?.header?.status?.type || {};
        const competitors = competition?.competitors || [];
        if (!competitors.length) return null;

        const league = payload?.league || this.embedState.currentLeague || Config.DEFAULT_LEAGUE;
        const away = competitors.find(team => team.homeAway === 'away') || competitors[1] || null;
        const home = competitors.find(team => team.homeAway === 'home') || competitors[0] || null;
        const list = [away, home].filter(Boolean);

        if (!list.length) return null;

        const header = document.createElement('div');
        header.className = 'stats-header';

        const meta = document.createElement('div');
        meta.className = 'stats-header-meta';
        const statusEl = document.createElement('div');
        statusEl.className = 'stats-status';
        statusEl.textContent = this.getStatsStatusLabel(status);

        const detail = document.createElement('div');
        detail.className = 'stats-meta';
        const detailItems = [];
        const venue = competition?.venue?.fullName || payload?.gameInfo?.venue?.fullName;
        if (venue) detailItems.push(venue);
        const broadcastNames = (payload?.broadcasts || competition?.broadcasts || [])
            .flatMap(item => {
                if (Array.isArray(item?.names)) return item.names;
                if (item?.media?.shortName) return [item.media.shortName];
                if (typeof item?.market === 'string') return [item.market];
                return [];
            })
            .filter(Boolean);
        if (broadcastNames.length) detailItems.push(broadcastNames.join(', '));
        if (detailItems.length) {
            detail.textContent = detailItems.join(' • ');
        }

        meta.appendChild(statusEl);
        if (detailItems.length) meta.appendChild(detail);
        header.appendChild(meta);

        const teamsRow = document.createElement('div');
        teamsRow.className = 'stats-header-teams';

        list.forEach(competitor => {
            const team = this.resolveStatsTeam(competitor?.team || {}, league);
            const card = document.createElement('div');
            card.className = 'stats-team-card';
            if (competitor?.winner) card.classList.add('is-winner');

            const logo = document.createElement('img');
            logo.className = 'stats-team-logo hidden';
            this.setTeamLogo(logo, team, league);

            const info = document.createElement('div');
            info.className = 'stats-team-info';

            const name = document.createElement('div');
            name.className = 'stats-team-name';
            name.textContent = team?.shortName || team?.abbreviation || team?.name || competitor?.team?.shortDisplayName || 'Team';

            const record = document.createElement('div');
            record.className = 'stats-team-record';
            record.textContent = this.getStatsRecordSummary(competitor?.records);

            info.appendChild(name);
            info.appendChild(record);

            const score = document.createElement('div');
            score.className = 'stats-team-score';
            score.textContent = competitor?.score ?? competitor?.score?.displayValue ?? '—';

            card.appendChild(logo);
            card.appendChild(info);
            card.appendChild(score);
            teamsRow.appendChild(card);
        });

        header.appendChild(teamsRow);
        return header;
    },

    buildStatsControls(payload) {
        const controls = document.createElement('div');
        controls.className = 'stats-controls';

        const refreshBtn = document.createElement('button');
        refreshBtn.type = 'button';
        refreshBtn.className = 'btn btn-secondary stats-refresh';
        refreshBtn.textContent = 'Refresh Stats';
        refreshBtn.addEventListener('click', () => this.refreshStats(true));

        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'stats-toggle';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = this.statsState.autoRefresh;
        toggle.addEventListener('change', () => {
            this.setStatsAutoRefresh(toggle.checked);
            this.renderStatsContent(payload);
        });
        const toggleText = document.createElement('span');
        toggleText.textContent = 'Auto-refresh (30s)';
        toggleLabel.appendChild(toggle);
        toggleLabel.appendChild(toggleText);

        const updated = document.createElement('div');
        updated.className = 'stats-updated';
        updated.textContent = `Updated ${this.formatStatsTimestamp(this.statsState.lastUpdated)}`;

        controls.appendChild(refreshBtn);
        controls.appendChild(toggleLabel);
        controls.appendChild(updated);

        return controls;
    },

    buildLinescoreSection(payload) {
        const competition = this.getStatsCompetition(payload);
        const competitors = competition?.competitors || [];
        if (!competitors.length) return null;

        const linescoreCounts = competitors.map(team => (team?.linescores || []).length);
        const maxPeriods = Math.max(...linescoreCounts, 0);
        if (!maxPeriods) return null;

        const section = document.createElement('div');
        section.className = 'stats-section';
        const title = document.createElement('div');
        title.className = 'stats-section-title';
        title.textContent = 'Line Score';
        section.appendChild(title);

        const table = document.createElement('div');
        table.className = 'stats-team-table';

        const headerRow = document.createElement('div');
        headerRow.className = 'stats-team-row stats-team-header';
        const teamHeader = document.createElement('div');
        teamHeader.className = 'stats-team-cell';
        teamHeader.textContent = 'Team';
        headerRow.appendChild(teamHeader);

        for (let i = 0; i < maxPeriods; i += 1) {
            const cell = document.createElement('div');
            cell.className = 'stats-team-cell';
            cell.textContent = `Q${i + 1}`;
            headerRow.appendChild(cell);
        }
        const finalCell = document.createElement('div');
        finalCell.className = 'stats-team-cell';
        finalCell.textContent = 'T';
        headerRow.appendChild(finalCell);
        table.appendChild(headerRow);

        const league = payload?.league || this.embedState.currentLeague || Config.DEFAULT_LEAGUE;
        competitors.forEach(entry => {
            const row = document.createElement('div');
            row.className = 'stats-team-row';
            const team = this.resolveStatsTeam(entry?.team || {}, league);
            const nameCell = document.createElement('div');
            nameCell.className = 'stats-team-cell';
            nameCell.textContent = team?.abbreviation || team?.shortName || team?.name || entry?.team?.shortDisplayName || '—';
            row.appendChild(nameCell);

            const lines = entry?.linescores || [];
            for (let i = 0; i < maxPeriods; i += 1) {
                const scoreCell = document.createElement('div');
                scoreCell.className = 'stats-team-cell';
                scoreCell.textContent = lines[i]?.displayValue ?? lines[i]?.value ?? '—';
                row.appendChild(scoreCell);
            }

            const totalCell = document.createElement('div');
            totalCell.className = 'stats-team-cell';
            totalCell.textContent = entry?.score ?? entry?.score?.displayValue ?? '—';
            row.appendChild(totalCell);
            table.appendChild(row);
        });

        section.appendChild(table);
        return section;
    },

    buildGamecastSection(payload) {
        const playIndex = Array.isArray(payload?.plays?.plays)
            ? payload.plays.plays
            : (Array.isArray(payload?.plays?.allPlays) ? payload.plays.allPlays : []);
        const scoringPlays = Array.isArray(payload?.scoringPlays)
            ? payload.scoringPlays
            : (Array.isArray(payload?.plays?.scoringPlays) ? payload.plays.scoringPlays : []);
        const drivesPayload = payload?.drives || {};
        const driveList = Array.isArray(drivesPayload)
            ? drivesPayload
            : ([]
                .concat(drivesPayload?.previous || [])
                .concat(drivesPayload?.current ? [drivesPayload.current] : [])
                .concat(drivesPayload?.next || []));
        const winProbability = Array.isArray(payload?.winProbability)
            ? payload.winProbability
            : (Array.isArray(payload?.winprobability) ? payload.winprobability : []);

        if (!scoringPlays.length && !driveList.length && !winProbability.length) {
            return null;
        }

        const section = document.createElement('div');
        section.className = 'stats-section stats-gamecast';
        const title = document.createElement('div');
        title.className = 'stats-section-title';
        title.textContent = 'Gamecast';
        section.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'stats-gamecast-grid';

        if (scoringPlays.length) {
            const playsBlock = document.createElement('div');
            playsBlock.className = 'stats-gamecast-block';
            const header = document.createElement('div');
            header.className = 'stats-gamecast-title';
            header.textContent = 'Scoring Plays';
            playsBlock.appendChild(header);

            const list = document.createElement('div');
            list.className = 'stats-gamecast-list';
            scoringPlays.slice(0, 12).forEach(play => {
                const resolvedPlay = (typeof play === 'string' || typeof play === 'number')
                    ? playIndex.find(entry => String(entry?.id) === String(play)) || { id: play }
                    : play;
                const item = document.createElement('div');
                item.className = 'stats-gamecast-item';
                const playText = resolvedPlay?.text || resolvedPlay?.shortText || resolvedPlay?.summary || resolvedPlay?.description || 'Scoring play';
                const clock = resolvedPlay?.clock?.displayValue || resolvedPlay?.clock?.display || resolvedPlay?.clock || '';
                const period = resolvedPlay?.period?.number || resolvedPlay?.period?.displayValue || resolvedPlay?.period?.display || '';
                const team = resolvedPlay?.team?.abbreviation || resolvedPlay?.team?.shortDisplayName || resolvedPlay?.team?.displayName || '';
                const score = (resolvedPlay?.homeScore !== undefined && resolvedPlay?.awayScore !== undefined)
                    ? `${resolvedPlay.awayScore}-${resolvedPlay.homeScore}`
                    : (resolvedPlay?.scoreValue ? `${resolvedPlay.scoreValue} pts` : '');

                const meta = document.createElement('div');
                meta.className = 'stats-gamecast-meta';
                meta.textContent = [team, period ? `Q${period}` : '', clock].filter(Boolean).join(' • ');

                const detail = document.createElement('div');
                detail.className = 'stats-gamecast-detail';
                detail.textContent = playText;

                const scoreEl = document.createElement('div');
                scoreEl.className = 'stats-gamecast-score';
                scoreEl.textContent = score;

                item.appendChild(meta);
                item.appendChild(detail);
                if (score) item.appendChild(scoreEl);
                list.appendChild(item);
            });

            playsBlock.appendChild(list);
            grid.appendChild(playsBlock);
        }

        if (driveList.length) {
            const driveBlock = document.createElement('div');
            driveBlock.className = 'stats-gamecast-block';
            const header = document.createElement('div');
            header.className = 'stats-gamecast-title';
            header.textContent = 'Drives';
            driveBlock.appendChild(header);

            const list = document.createElement('div');
            list.className = 'stats-gamecast-list';
            driveList.slice(0, 10).forEach(drive => {
                const item = document.createElement('div');
                item.className = 'stats-gamecast-item';
                const team = drive?.team?.abbreviation || drive?.team?.shortDisplayName || drive?.team?.displayName || '';
                const result = drive?.displayResult || drive?.result || '';
                const plays = drive?.plays?.length || drive?.playCount || drive?.numberOfPlays || '';
                const yards = drive?.yards || drive?.netYards || '';
                const time = drive?.timeElapsed?.displayValue || drive?.timeElapsed || '';

                const meta = document.createElement('div');
                meta.className = 'stats-gamecast-meta';
                meta.textContent = [team, result].filter(Boolean).join(' • ');

                const detail = document.createElement('div');
                detail.className = 'stats-gamecast-detail';
                detail.textContent = [
                    plays ? `${plays} plays` : '',
                    yards ? `${yards} yds` : '',
                    time ? time : ''
                ].filter(Boolean).join(' • ') || 'Drive details unavailable';

                item.appendChild(meta);
                item.appendChild(detail);
                list.appendChild(item);
            });

            driveBlock.appendChild(list);
            grid.appendChild(driveBlock);
        }

        if (winProbability.length) {
            const probBlock = document.createElement('div');
            probBlock.className = 'stats-gamecast-block';
            const header = document.createElement('div');
            header.className = 'stats-gamecast-title';
            header.textContent = 'Win Probability';
            probBlock.appendChild(header);

            const chart = document.createElement('div');
            chart.className = 'stats-winprob';
            const sample = winProbability.slice(-40);
            sample.forEach(point => {
                const bar = document.createElement('div');
                bar.className = 'stats-winprob-bar';
                const homeProb = point?.homeWinPercentage ?? point?.homeWinPercentage?.displayValue ?? point?.homeWinPercentage?.value ?? point?.homeWinProbability ?? point?.home ?? 0;
                const percent = typeof homeProb === 'number' ? homeProb : parseFloat(homeProb);
                const normalized = Number.isNaN(percent) ? 0 : (percent > 1 ? percent / 100 : percent);
                bar.style.setProperty('--prob', Math.max(0, Math.min(1, normalized)));
                chart.appendChild(bar);
            });
            probBlock.appendChild(chart);
            grid.appendChild(probBlock);
        }

        section.appendChild(grid);
        return section;
    },

    renderStatsContent(payload) {
        const loading = document.getElementById('stats-loading');
        const error = document.getElementById('stats-error');
        const content = document.getElementById('stats-content');
        if (!content) return;
        loading?.classList.add('hidden');
        error?.classList.add('hidden');
        content.classList.remove('hidden');
        content.innerHTML = '';

        const fragment = document.createDocumentFragment();

        const headerSection = this.buildStatsHeader(payload);
        if (headerSection) {
            fragment.appendChild(headerSection);
        }

        const controls = this.buildStatsControls(payload);
        if (controls) {
            fragment.appendChild(controls);
        }

        const leaders = Array.isArray(payload?.leaders) ? payload.leaders : [];
        if (leaders.length) {
            const validLeaders = leaders.map(group => {
                const leader = (group?.leaders || []).find(entry => {
                    const athlete = entry?.athlete || {};
                    const value = entry?.displayValue ?? entry?.value;
                    return athlete?.displayName && value !== undefined && value !== null && value !== '';
                });
                return leader ? { group, leader } : null;
            }).filter(Boolean);

            if (validLeaders.length) {
                const section = document.createElement('div');
                section.className = 'stats-section';
                const title = document.createElement('div');
                title.className = 'stats-section-title';
                title.textContent = 'Leaders';
                const grid = document.createElement('div');
                grid.className = 'stats-leaders';

                validLeaders.forEach(({ group, leader }) => {
                    const athlete = leader?.athlete || {};
                    const card = document.createElement('div');
                    card.className = 'stats-leader-card';
                    const photo = document.createElement('img');
                    photo.className = 'stats-leader-photo';
                    photo.alt = athlete?.displayName || '';
                    const headshot = athlete?.headshot?.href || athlete?.headshot;
                    if (headshot) {
                        photo.src = headshot;
                    }
                    const meta = document.createElement('div');
                    meta.className = 'stats-leader-meta';
                    const name = document.createElement('div');
                    name.className = 'stats-leader-name';
                    name.textContent = athlete?.displayName || '—';
                    const value = document.createElement('div');
                    value.className = 'stats-leader-value';
                    value.textContent = leader?.displayValue || leader?.value || '—';
                    const label = document.createElement('div');
                    label.className = 'stats-leader-label';
                    label.textContent = group?.shortDisplayName || group?.name || 'Leader';
                    meta.appendChild(name);
                    meta.appendChild(value);
                    meta.appendChild(label);
                    card.appendChild(photo);
                    card.appendChild(meta);
                    grid.appendChild(card);
                });

                section.appendChild(title);
                section.appendChild(grid);
                fragment.appendChild(section);
            }
        }

        const boxscore = payload?.boxscore || {};
        const teamStats = Array.isArray(boxscore?.teams) ? boxscore.teams : [];
        const players = Array.isArray(boxscore?.players) ? boxscore.players : [];

        if (teamStats.length) {
            const section = document.createElement('div');
            section.className = 'stats-section';
            const title = document.createElement('div');
            title.className = 'stats-section-title';
            title.textContent = 'Team Stats';
            const table = document.createElement('div');
            table.className = 'stats-team-table';

            const headerRow = document.createElement('div');
            headerRow.className = 'stats-team-row stats-team-header';
            const labelCell = document.createElement('div');
            labelCell.className = 'stats-team-cell';
            labelCell.textContent = 'Stat';
            headerRow.appendChild(labelCell);
            teamStats.forEach(entry => {
                const cell = document.createElement('div');
                cell.className = 'stats-team-cell';
                cell.textContent = entry?.team?.abbreviation || entry?.team?.shortDisplayName || '—';
                headerRow.appendChild(cell);
            });
            table.appendChild(headerRow);

            const statNames = new Map();
            teamStats.forEach(entry => {
                (entry?.statistics || []).forEach(stat => {
                    const key = stat?.name || stat?.displayName || stat?.abbreviation;
                    if (!key) return;
                    if (!this.shouldIncludeTeamStat(stat)) return;
                    if (!statNames.has(key)) {
                        statNames.set(key, stat);
                    }
                });
            });

            statNames.forEach((statMeta, key) => {
                const row = document.createElement('div');
                row.className = 'stats-team-row';
                const statCell = document.createElement('div');
                statCell.className = 'stats-team-cell';
                statCell.textContent = this.formatTeamStatLabel(statMeta);
                row.appendChild(statCell);
                teamStats.forEach(entry => {
                    const stat = (entry?.statistics || []).find(item => (item?.name || item?.displayName || item?.abbreviation) === key);
                    const cell = document.createElement('div');
                    cell.className = 'stats-team-cell';
                    cell.textContent = this.formatTeamStatValue(stat || statMeta);
                    row.appendChild(cell);
                });
                table.appendChild(row);
            });

            if (statNames.size) {
                section.appendChild(title);
                section.appendChild(table);
                fragment.appendChild(section);
            }
        }

        if (players.length) {
            const section = document.createElement('div');
            section.className = 'stats-section';
            const title = document.createElement('div');
            title.className = 'stats-section-title';
            title.textContent = 'Box Score';
            section.appendChild(title);

            players.forEach(teamGroup => {
                const block = document.createElement('div');
                block.className = 'stats-team-block';
                const teamName = document.createElement('div');
                teamName.className = 'stats-team-name';
                teamName.textContent = teamGroup?.team?.displayName || teamGroup?.team?.name || 'Team';
                block.appendChild(teamName);

                (teamGroup?.statistics || []).forEach(statGroup => {
                    const category = document.createElement('div');
                    category.className = 'stats-category';
                    const categoryTitle = document.createElement('div');
                    categoryTitle.className = 'stats-category-title';
                    categoryTitle.textContent = statGroup?.displayName || statGroup?.name || 'Stats';
                    category.appendChild(categoryTitle);

                    const table = document.createElement('div');
                    table.className = 'stats-table';
                    const headerRow = document.createElement('div');
                    headerRow.className = 'stats-row stats-row-header';
                    const playerHeader = document.createElement('div');
                    playerHeader.className = 'stats-cell stats-player';
                    playerHeader.textContent = 'Player';
                    headerRow.appendChild(playerHeader);

                    const labels = statGroup?.labels || statGroup?.headers || statGroup?.shortDisplayName || [];
                    const labelList = Array.isArray(labels) ? labels : [];
                    labelList.forEach(label => {
                        const cell = document.createElement('div');
                        cell.className = 'stats-cell';
                        cell.textContent = label;
                        headerRow.appendChild(cell);
                    });
                    table.appendChild(headerRow);

                    const athletes = statGroup?.athletes || statGroup?.players || [];
                    athletes.forEach(player => {
                        const row = document.createElement('div');
                        row.className = 'stats-row';
                        const playerCell = document.createElement('div');
                        playerCell.className = 'stats-cell stats-player';
                        const img = document.createElement('img');
                        img.className = 'stats-player-photo';
                        const athlete = player?.athlete || player?.player || {};
                        const headshot = athlete?.headshot?.href || athlete?.headshot;
                        if (headshot) {
                            img.src = headshot;
                        }
                        img.alt = athlete?.displayName || '';
                        img.loading = 'lazy';
                        const name = document.createElement('span');
                        name.className = 'stats-player-name';
                        name.textContent = athlete?.shortName || athlete?.displayName || '—';
                        playerCell.appendChild(img);
                        playerCell.appendChild(name);
                        row.appendChild(playerCell);

                        const statsList = player?.stats || player?.statistics || [];
                        labelList.forEach((_, index) => {
                            const cell = document.createElement('div');
                            cell.className = 'stats-cell';
                            cell.textContent = statsList[index] ?? '—';
                            row.appendChild(cell);
                        });
                        table.appendChild(row);
                    });

                    this.makeStatsTableSortable(table);
                    category.appendChild(table);
                    block.appendChild(category);
                });

                section.appendChild(block);
            });

            fragment.appendChild(section);
        }

        const lineScoreSection = this.buildLinescoreSection(payload);
        if (lineScoreSection) {
            fragment.appendChild(lineScoreSection);
        }

        const gamecastSection = this.buildGamecastSection(payload);
        if (gamecastSection) {
            fragment.appendChild(gamecastSection);
        }

        if (!fragment.childNodes.length) {
            const empty = document.createElement('div');
            empty.className = 'stats-empty';
            empty.textContent = 'Stats are not available yet.';
            fragment.appendChild(empty);
        }

        content.appendChild(fragment);
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

        const tabs = document.querySelectorAll('.standings-tab');
        const tabContents = document.querySelectorAll('.standings-tab-content');

        if (tabs.length) {
            tabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    tabs.forEach(t => t.classList.remove('active'));
                    tabContents.forEach(c => c.classList.remove('active'));

                    tab.classList.add('active');
                    const targetId = `standings-tab-${tab.dataset.tab}`;
                    const targetContent = document.getElementById(targetId);
                    if (targetContent) {
                        targetContent.classList.add('active');
                    }
                });
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                API.clearStandingsCache();
                API.clearPlayoffsCache();
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

        await this.loadPlayoffs();

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

    async loadPlayoffs() {
        const league = this.currentStandingsLeague || Config.AMERICAN_LEAGUES[0];
        const season = this.currentStandingsSeason || 'current';
        const section = document.getElementById('playoffs-section');
        const roundsEl = document.getElementById('playoffs-rounds');
        const subtitleEl = document.getElementById('playoffs-subtitle');
        const emptyEl = document.getElementById('playoffs-empty');

        if (!section || !roundsEl) {
            return;
        }

        section.classList.add('hidden');
        emptyEl?.classList.add('hidden');
        roundsEl.innerHTML = '';
        if (subtitleEl) {
            subtitleEl.textContent = '';
        }

        if (season !== 'current') {
            return;
        }

        const data = await API.fetchPlayoffs(league);
        if (!data || !data.isPlayoffs || !Array.isArray(data.rounds) || data.rounds.length === 0) {
            emptyEl?.classList.remove('hidden');
            return;
        }

        if (subtitleEl) {
            subtitleEl.textContent = data.season?.year ? `Season ${data.season.year}` : '';
        }

        const resolveConference = team => {
            if (!team) return null;
            const resolved = TeamsUtil.resolveTeam({
                name: team.name || team.displayName,
                abbreviation: team.abbreviation
            }, league);
            return resolved?.conference || null;
        };

        const getMatchupConference = matchup => {
            const homeConference = resolveConference(matchup.home);
            const awayConference = resolveConference(matchup.away);
            if (homeConference && homeConference === awayConference) {
                return homeConference;
            }
            return homeConference || awayConference || null;
        };

        const buildMatchupCard = matchup => {
            const card = document.createElement('article');
            card.className = 'playoff-matchup';

            if (matchup?.isPlaceholder) {
                card.classList.add('is-placeholder');
            }

            const header = document.createElement('div');
            header.className = 'playoff-matchup-header';
            const status = document.createElement('span');
            status.className = 'playoff-matchup-status';
            status.textContent = matchup.status?.detail || 'Matchup';
            header.appendChild(status);
            card.appendChild(header);

            const teams = document.createElement('div');
            teams.className = 'playoff-matchup-teams';

            const buildTeamRow = (team, isHome) => {
                const row = document.createElement('div');
                row.className = 'playoff-team';
                if (team?.winner) {
                    row.classList.add('is-winner');
                }

                const logo = document.createElement('img');
                logo.className = 'playoff-team-logo hidden';
                logo.loading = 'lazy';
                this.setTeamLogo(logo, team, league);
                if (!logo.classList.contains('hidden')) {
                    row.appendChild(logo);
                }

                const name = document.createElement('span');
                name.className = 'playoff-team-name';
                name.textContent = team?.abbreviation || team?.name || 'TBD';
                row.appendChild(name);

                const score = document.createElement('span');
                score.className = 'playoff-team-score';
                if (matchup?.isPlaceholder) {
                    score.textContent = '';
                } else {
                    score.textContent = team?.score ?? '—';
                }
                row.appendChild(score);

                return row;
            };

            teams.appendChild(buildTeamRow(matchup.away, false));
            teams.appendChild(buildTeamRow(matchup.home, true));
            card.appendChild(teams);

            return card;
        };

        const createPlaceholderMatchup = () => ({
            isPlaceholder: true,
            status: { detail: 'TBD' },
            home: null,
            away: null
        });

        const buildRoundColumn = (round, matchupsList, expectedCount = null) => {
            const column = document.createElement('div');
            column.className = 'playoff-round';

            const title = document.createElement('h3');
            title.className = 'playoff-round-title';
            title.textContent = round.label || `Round ${round.number || ''}`.trim();
            column.appendChild(title);

            const matchups = document.createElement('div');
            matchups.className = 'playoff-matchups';

            const filteredMatchups = matchupsList || [];
            const totalCount = expectedCount !== null ? Math.max(expectedCount, filteredMatchups.length) : filteredMatchups.length;

            for (let index = 0; index < totalCount; index += 1) {
                const matchup = filteredMatchups[index] || createPlaceholderMatchup();
                matchups.appendChild(buildMatchupCard(matchup));
            }

            if (!totalCount) {
                return null;
            }

            column.appendChild(matchups);
            return column;
        };

        const bracket = document.createElement('div');
        bracket.className = 'playoffs-bracket';

        if (league === 'nfl') {
            const roundsByNumber = new Map();
            data.rounds.forEach(round => {
                if (round.number !== null && round.number !== undefined) {
                    roundsByNumber.set(round.number, round);
                }
            });

            const roundLabelFallbacks = {
                1: 'Wild Card',
                2: 'Divisional',
                3: 'Conference',
                5: 'Super Bowl'
            };

            const ensureRound = (roundNumber) => {
                const existing = roundsByNumber.get(roundNumber);
                if (existing) {
                    return existing;
                }
                return {
                    number: roundNumber,
                    label: roundLabelFallbacks[roundNumber] || `Round ${roundNumber}`,
                    matchups: []
                };
            };

            const expectedMatchups = {
                1: 3,
                2: 2,
                3: 1,
                5: 1
            };

            const splitByConference = (roundMatchups = []) => {
                const afc = [];
                const nfc = [];
                const unknown = [];

                roundMatchups.forEach(matchup => {
                    const conference = getMatchupConference(matchup);
                    if (conference === 'AFC') {
                        afc.push(matchup);
                    } else if (conference === 'NFC') {
                        nfc.push(matchup);
                    } else {
                        unknown.push(matchup);
                    }
                });

                unknown.forEach(matchup => {
                    if (afc.length <= nfc.length) {
                        afc.push(matchup);
                    } else {
                        nfc.push(matchup);
                    }
                });

                return { afc, nfc };
            };

            const leftSide = document.createElement('div');
            leftSide.className = 'playoffs-side playoffs-side-left';
            const rightSide = document.createElement('div');
            rightSide.className = 'playoffs-side playoffs-side-right';

            [1, 2, 3].forEach(roundNumber => {
                const round = ensureRound(roundNumber);
                const { afc } = splitByConference(round.matchups || []);
                const expected = expectedMatchups[roundNumber] || null;

                const leftColumn = buildRoundColumn(round, afc, expected);
                if (leftColumn) {
                    leftSide.appendChild(leftColumn);
                }
            });

            [3, 2, 1].forEach(roundNumber => {
                const round = ensureRound(roundNumber);
                const { nfc } = splitByConference(round.matchups || []);
                const expected = expectedMatchups[roundNumber] || null;

                const rightColumn = buildRoundColumn(round, nfc, expected);
                if (rightColumn) {
                    rightSide.appendChild(rightColumn);
                }
            });

            const center = document.createElement('div');
            center.className = 'playoffs-center';
            const finalRound = ensureRound(5);
            const centerColumn = buildRoundColumn(finalRound, finalRound.matchups || [], expectedMatchups[5]);
            if (centerColumn) {
                centerColumn.classList.add('playoff-round-final');
                const logo = document.createElement('img');
                logo.className = 'playoff-center-logo';
                logo.alt = 'Super Bowl logo';
                logo.loading = 'lazy';
                logo.src = 'https://static.www.nfl.com/league/apps/web/experiences/playoffbracket/2026/playoffbracket-sb-logo.svg';
                logo.onerror = () => logo.remove();
                const matchupStack = centerColumn.querySelector('.playoff-matchups');
                if (matchupStack) {
                    centerColumn.insertBefore(logo, matchupStack);
                } else {
                    centerColumn.appendChild(logo);
                }
                center.appendChild(centerColumn);
            }

            bracket.appendChild(leftSide);
            bracket.appendChild(center);
            bracket.appendChild(rightSide);
        } else {
            data.rounds.forEach(round => {
                const column = buildRoundColumn(round, round.matchups || []);
                if (column) {
                    bracket.appendChild(column);
                }
            });
        }

        roundsEl.appendChild(bracket);
        section.classList.remove('hidden');
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
