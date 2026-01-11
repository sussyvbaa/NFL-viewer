/**
 * Storage Module
 *
 * Handles persistence of game data using localStorage.
 * Games are stored as an array of game objects with unique IDs.
 *
 * Game Object Structure:
 * {
 *   id: string (UUID),
 *   awayTeamId: string,
 *   homeTeamId: string,
 *   slug: string,
 *   gameTime: string (ISO date) | null,
 *   isLive: boolean,
 *   createdAt: string (ISO date),
 *   updatedAt: string (ISO date)
 * }
 */

const Storage = {
    /**
     * Generate a unique ID for games
     */
    generateId() {
        return 'game_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * Get all saved games
     * @returns {Array} Array of game objects
     */
    getGames() {
        try {
            const data = localStorage.getItem(Config.STORAGE.GAMES);
            if (!data) return [];

            const games = JSON.parse(data);
            return Array.isArray(games) ? games : [];
        } catch (e) {
            console.error('Failed to load games from storage:', e);
            return [];
        }
    },

    /**
     * Save games array to storage
     * @param {Array} games - Array of game objects
     */
    saveGames(games) {
        try {
            localStorage.setItem(Config.STORAGE.GAMES, JSON.stringify(games));
            return true;
        } catch (e) {
            console.error('Failed to save games to storage:', e);
            return false;
        }
    },

    /**
     * Get a single game by ID
     * @param {string} id - Game ID
     * @returns {Object|null} Game object or null
     */
    getGame(id) {
        const games = this.getGames();
        return games.find(g => g.id === id) || null;
    },

    /**
     * Get a game by its slug
     * @param {string} slug - Game slug
     * @returns {Object|null} Game object or null
     */
    getGameBySlug(slug, league = 'all') {
        const games = this.getGames();
        const normalizedSlug = EmbedUtil.sanitizeSlug(slug);
        return games.find(g => {
            const gameLeague = g.league || Config.DEFAULT_LEAGUE;
            if (league !== 'all' && gameLeague !== league) {
                return false;
            }
            return EmbedUtil.sanitizeSlug(g.slug) === normalizedSlug;
        }) || null;
    },

    /**
     * Add a new game
     * @param {Object} gameData - Game data (awayTeamId, homeTeamId, slug, gameTime, isLive)
     * @returns {Object|null} Created game object or null on failure
     */
    addGame(gameData) {
        const { awayTeamId, homeTeamId, slug, gameTime, isLive, league } = gameData;
        const activeLeague = Config.SUPPORTED_LEAGUES.includes(league)
            ? league
            : Config.DEFAULT_LEAGUE;

        // Validate required fields
        if (!awayTeamId || !homeTeamId) {
            console.error('Missing required team IDs');
            return null;
        }

        // Get team objects
        const awayTeam = TeamsUtil.getTeam(awayTeamId, activeLeague);
        const homeTeam = TeamsUtil.getTeam(homeTeamId, activeLeague);

        if (!awayTeam || !homeTeam) {
            console.error('Invalid team IDs');
            return null;
        }

        // Prevent same team matchup
        if (awayTeamId === homeTeamId) {
            console.error('Away and home team cannot be the same');
            return null;
        }

        // Generate slug if not provided
        const config = Config.getLeagueConfig(activeLeague);
        const finalSlug = slug ?
            EmbedUtil.sanitizeSlug(slug) :
            EmbedUtil.generateGameSlug(awayTeam, homeTeam, config.SLUG_PREFIX);

        // Check for duplicate slug
        const existing = this.getGameBySlug(finalSlug, activeLeague);
        if (existing) {
            console.error('Game with this slug already exists');
            return null;
        }

        const now = new Date().toISOString();
        const newGame = {
            id: this.generateId(),
            awayTeamId,
            homeTeamId,
            league: activeLeague,
            slug: finalSlug,
            gameTime: gameTime || null,
            isLive: Boolean(isLive),
            createdAt: now,
            updatedAt: now
        };

        const games = this.getGames();
        games.push(newGame);

        if (this.saveGames(games)) {
            return newGame;
        }
        return null;
    },

    /**
     * Update an existing game
     * @param {string} id - Game ID
     * @param {Object} updates - Fields to update
     * @returns {Object|null} Updated game or null on failure
     */
    updateGame(id, updates) {
        const games = this.getGames();
        const index = games.findIndex(g => g.id === id);

        if (index === -1) {
            console.error('Game not found:', id);
            return null;
        }

        // Only allow updating certain fields
        const allowedUpdates = ['isLive', 'gameTime', 'slug'];
        const filteredUpdates = {};

        for (const key of allowedUpdates) {
            if (key in updates) {
                filteredUpdates[key] = updates[key];
            }
        }

        if (filteredUpdates.slug) {
            filteredUpdates.slug = EmbedUtil.sanitizeSlug(filteredUpdates.slug);
        }

        games[index] = {
            ...games[index],
            ...filteredUpdates,
            updatedAt: new Date().toISOString()
        };

        if (this.saveGames(games)) {
            return games[index];
        }
        return null;
    },

    /**
     * Delete a game by ID
     * @param {string} id - Game ID
     * @returns {boolean} Success status
     */
    deleteGame(id) {
        const games = this.getGames();
        const filtered = games.filter(g => g.id !== id);

        if (filtered.length === games.length) {
            console.error('Game not found:', id);
            return false;
        }

        return this.saveGames(filtered);
    },

    /**
     * Get games filtered by status
     * @param {string} filter - 'all', 'live', or 'upcoming'
     * @returns {Array} Filtered games
     */
    getFilteredGames(filter = 'all', league = 'all') {
        const games = this.getGames().filter(game => {
            const gameLeague = game.league || Config.DEFAULT_LEAGUE;
            return league === 'all' || gameLeague === league;
        });
        const now = new Date();

        switch (filter) {
            case 'live':
                return games.filter(g => g.isLive);

            case 'upcoming':
                return games.filter(g => {
                    if (g.isLive) return false;
                    if (!g.gameTime) return true;
                    return new Date(g.gameTime) > now;
                });

            case 'all':
            default:
                return games;
        }
    },

    /**
     * Enrich a game object with team data
     * @param {Object} game - Raw game object from storage
     * @returns {Object} Enriched game object with team details
     */
    enrichGame(game) {
        if (!game) return null;

        const league = game.league || Config.DEFAULT_LEAGUE;
        const awayTeam = TeamsUtil.getTeam(game.awayTeamId, league);
        const homeTeam = TeamsUtil.getTeam(game.homeTeamId, league);
        const endGraceMs = (Config.GAME_END_GRACE_HOURS || 6) * 60 * 60 * 1000;
        const gameTimestamp = game.gameTime ? new Date(game.gameTime).getTime() : null;
        const isEnded = !game.isLive && gameTimestamp && (Date.now() - gameTimestamp) > endGraceMs;
        const matchupTitle = awayTeam && homeTeam
            ? `${awayTeam.name} vs ${homeTeam.name}`
            : null;

        return {
            ...game,
            league,
            awayTeam,
            homeTeam,
            isEnded,
            title: matchupTitle || 'Unknown Matchup',
            displayTitle: matchupTitle || game.title || 'Unknown Matchup',
            formattedTime: game.gameTime ?
                new Date(game.gameTime).toLocaleString() :
                'Time TBD',
            watchUrl: `#/watch/${game.slug}?league=${league}`
        };
    },

    /**
     * Get all games enriched with team data
     * @param {string} filter - Optional filter
     * @returns {Array} Enriched game objects
     */
    getEnrichedGames(filter = 'all', league = 'all') {
        return this.getFilteredGames(filter, league)
            .map(g => this.enrichGame(g))
            .filter(Boolean)
            .sort((a, b) => {
                // Live games first
                if (a.isLive && !b.isLive) return -1;
                if (!a.isLive && b.isLive) return 1;

                // Then by game time
                if (a.gameTime && b.gameTime) {
                    return new Date(a.gameTime) - new Date(b.gameTime);
                }
                if (a.gameTime) return -1;
                if (b.gameTime) return 1;

                // Then by creation time
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
    },

    /**
     * Get multi-view selections
     * @returns {Array} Multi-view items
     */
    getMultiViewGames() {
        try {
            const data = localStorage.getItem(Config.STORAGE.MULTI_VIEW);
            if (!data) return [];
            const items = JSON.parse(data);
            return Array.isArray(items) ? items : [];
        } catch (e) {
            console.error('Failed to load multi-view games:', e);
            return [];
        }
    },

    /**
     * Save multi-view selections
     * @param {Array} items - Multi-view items
     */
    saveMultiViewGames(items) {
        try {
            localStorage.setItem(Config.STORAGE.MULTI_VIEW, JSON.stringify(items));
            return true;
        } catch (e) {
            console.error('Failed to save multi-view games:', e);
            return false;
        }
    },

    /**
     * Build a unique key for multi-view items
     * @param {string} slug - Game slug
     * @param {string} league - League key
     * @returns {string} Key
     */
    buildMultiViewKey(slug, league) {
        const safeSlug = EmbedUtil.sanitizeSlug(slug);
        const leagueKey = league || Config.DEFAULT_LEAGUE;
        return safeSlug ? `${leagueKey}:${safeSlug}` : '';
    },

    /**
     * Check if a game is already in multi-view
     * @param {string} slug - Game slug
     * @param {string} league - League key
     * @returns {boolean}
     */
    isInMultiView(slug, league) {
        const key = this.buildMultiViewKey(slug, league);
        if (!key) return false;
        return this.getMultiViewGames().some(item => item.key === key);
    },

    /**
     * Add a game to multi-view selections
     * @param {Object} game - Game object
     * @returns {Object} Status
     */
    addToMultiView(game) {
        const slug = game?.slug;
        const league = game?.league || Config.DEFAULT_LEAGUE;
        const key = this.buildMultiViewKey(slug, league);
        if (!key) {
            return { added: false, reason: 'invalid' };
        }

        const items = this.getMultiViewGames();
        if (items.some(item => item.key === key)) {
            return { added: false, reason: 'exists', count: items.length };
        }
        if (items.length >= Config.MULTI_VIEW_MAX) {
            return { added: false, reason: 'limit', count: items.length };
        }

        items.push({
            key,
            slug,
            league,
            title: game.displayTitle || game.title || slug,
            source: game.currentSource || 'admin',
            streamId: game.streamId || 1,
            addedAt: new Date().toISOString()
        });

        this.saveMultiViewGames(items);
        return { added: true, count: items.length };
    },

    /**
     * Update a multi-view item
     * @param {string} key - Item key
     * @param {Object} updates - Updates
     * @returns {Object|null} Updated item
     */
    updateMultiViewItem(key, updates) {
        const items = this.getMultiViewGames();
        const index = items.findIndex(item => item.key === key);
        if (index === -1) return null;
        items[index] = {
            ...items[index],
            ...updates
        };
        this.saveMultiViewGames(items);
        return items[index];
    },

    /**
     * Reorder multi-view items by key
     * @param {string} sourceKey - Dragged item key
     * @param {string} targetKey - Drop target key
     * @returns {Array} Updated items
     */
    reorderMultiViewItems(sourceKey, targetKey) {
        const items = this.getMultiViewGames();
        const fromIndex = items.findIndex(item => item.key === sourceKey);
        const toIndex = items.findIndex(item => item.key === targetKey);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
            return items;
        }
        const [moved] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, moved);
        this.saveMultiViewGames(items);
        return items;
    },

    /**
     * Remove a game from multi-view selections
     * @param {string} slug - Game slug
     * @param {string} league - League key
     * @returns {Array} Updated items
     */
    removeFromMultiView(slug, league) {
        const key = this.buildMultiViewKey(slug, league);
        const items = this.getMultiViewGames().filter(item => item.key !== key);
        this.saveMultiViewGames(items);
        return items;
    },

    /**
     * Clear all multi-view selections
     * @returns {boolean} Success status
     */
    clearMultiViewGames() {
        try {
            localStorage.removeItem(Config.STORAGE.MULTI_VIEW);
            return true;
        } catch (e) {
            console.error('Failed to clear multi-view games:', e);
            return false;
        }
    },

    /**
     * Clear all stored games
     * @returns {boolean} Success status
     */
    clearAllGames() {
        try {
            localStorage.removeItem(Config.STORAGE.GAMES);
            return true;
        } catch (e) {
            console.error('Failed to clear games:', e);
            return false;
        }
    }
};
