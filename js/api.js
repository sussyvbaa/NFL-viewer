/**
 * API Module
 *
 * Fetches game data from the local backend service.
 * The backend handles retries, caching, and stream health checks.
 */

const API = {
    // API base URL
    BASE_URL: Config.API_BASE_URL,

    // Cache for fetched games
    cache: {
        byFilter: {},
        ttl: 30000,
        forceNext: false
    },
    standingsCache: {
        byLeague: {},
        ttl: 300000,
        forceNext: false
    },

    /**
     * Fetch games from the backend
     * @param {string} filter - 'all', 'live', or 'upcoming'
     * @param {Object} options - extra options
     * @returns {Promise<Array>} Array of game objects
     */
    async fetchGames(filter = 'all', options = {}) {
        const now = Date.now();
        const league = options.league || 'all';
        const cacheKey = `${league}:${filter}`;
        const entry = this.cache.byFilter[cacheKey];
        const force = Boolean(options.forceRefresh || this.cache.forceNext);

        if (!force && entry && (now - entry.lastFetch) < this.cache.ttl) {
            return entry.games || [];
        }

        try {
            const url = new URL(`${this.BASE_URL}/games`, window.location.origin);
            url.searchParams.set('filter', filter);
            url.searchParams.set('league', league);
            if (force) {
                url.searchParams.set('force', '1');
            }
            if (options.includeHealth) {
                url.searchParams.set('includeHealth', '1');
            }

            const response = await fetch(url.toString(), {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Backend responded with status ${response.status}`);
            }

            const data = await response.json();
            const games = Array.isArray(data.games) ? data.games : [];
            const meta = data.meta || null;

            this.cache.byFilter[cacheKey] = {
                games,
                lastFetch: now,
                meta
            };
            this.cache.forceNext = false;

            return games;
        } catch (error) {
            console.error('Failed to fetch games:', error);
            return [];
        }
    },

    /**
     * Get a specific game by slug
     * @param {string} slug - Game slug
     * @returns {Promise<Object|null>} Game object or null
     */
    async getGameBySlug(slug, options = {}) {
        try {
            const url = new URL(`${this.BASE_URL}/games/${encodeURIComponent(slug)}`, window.location.origin);
            url.searchParams.set('includeHealth', '1');
            if (options.league) {
                url.searchParams.set('league', options.league);
            }

            const response = await fetch(url.toString(), {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            return data.game || null;
        } catch (error) {
            console.error('Failed to fetch game by slug:', error);
            return null;
        }
    },

    /**
     * Get filtered games
     * @param {string} filter - 'all', 'live', or 'upcoming'
     * @returns {Promise<Array>} Filtered games
     */
    async getFilteredGames(filter = 'all', league = 'all') {
        return this.fetchGames(filter, { includeHealth: false, league });
    },

    /**
     * Enrich a game object with display data
     * @param {Object} game - Game from API
     * @returns {Object} Enriched game
     */
    enrichGame(game) {
        if (!game) return null;

        const slugTeams = EmbedUtil.parseGameSlug(game.slug, game.league);
        const titleTeams = TeamsUtil.parseTeamsFromTitle(game.title || '', game.league);
        const endGraceMs = (Config.GAME_END_GRACE_HOURS || 6) * 60 * 60 * 1000;
        const gameTimestamp = game.gameTime ? new Date(game.gameTime).getTime() : null;
        const isEnded = game.isEnded ?? (!game.isLive && gameTimestamp && (Date.now() - gameTimestamp) > endGraceMs);
        const league = game.league || titleTeams.league || slugTeams?.league || Config.DEFAULT_LEAGUE;
        const rawAway = game.teams?.away || game.awayTeam || slugTeams?.awayTeam || titleTeams.away;
        const rawHome = game.teams?.home || game.homeTeam || slugTeams?.homeTeam || titleTeams.home;
        let awayTeam = rawAway ? TeamsUtil.resolveTeam(rawAway, league) : null;
        let homeTeam = rawHome ? TeamsUtil.resolveTeam(rawHome, league) : null;

        if (awayTeam && homeTeam) {
            const awayKey = awayTeam.id || awayTeam.abbreviation || TeamsUtil.normalizeTeamString(awayTeam.name);
            const homeKey = homeTeam.id || homeTeam.abbreviation || TeamsUtil.normalizeTeamString(homeTeam.name);
            if (awayKey && homeKey && awayKey === homeKey) {
                const awayCandidates = rawAway?.name ? TeamsUtil.getMatchCandidates(rawAway.name, league) : [];
                const homeCandidates = rawHome?.name ? TeamsUtil.getMatchCandidates(rawHome.name, league) : [];
                const homeAlt = homeCandidates.find(candidate => candidate.team.id !== awayTeam.id);
                const awayAlt = awayCandidates.find(candidate => candidate.team.id !== homeTeam.id);
                if (homeAlt) {
                    homeTeam = {
                        ...homeAlt.team,
                        ...rawHome,
                        abbreviation: rawHome?.abbreviation || homeAlt.team.abbreviation
                    };
                } else if (awayAlt) {
                    awayTeam = {
                        ...awayAlt.team,
                        ...rawAway,
                        abbreviation: rawAway?.abbreviation || awayAlt.team.abbreviation
                    };
                }
            }
        }
        const leagueQuery = league ? `?league=${league}` : '';

        const matchupTitle = awayTeam && homeTeam
            ? `${awayTeam.name} vs ${homeTeam.name}`
            : null;

        return {
            ...game,
            awayTeam: awayTeam || null,
            homeTeam: homeTeam || null,
            awayTeamId: awayTeam?.id || game.awayTeamId || null,
            homeTeamId: homeTeam?.id || game.homeTeamId || null,
            league,
            isEnded,
            formattedTime: game.gameTime ?
                new Date(game.gameTime).toLocaleString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                }) : 'Time TBD',
            watchUrl: `#/watch/${game.slug}${leagueQuery}`,
            displayTitle: matchupTitle || game.title || (awayTeam && homeTeam ?
                `${awayTeam.name} vs ${homeTeam.name}` : 'Unknown Game')
        };
    },

    /**
     * Clear the cache
     */
    clearCache() {
        this.cache.byFilter = {};
        this.cache.forceNext = true;
    },

    /**
     * Fetch standings for a league
     * @param {string} league - League key
     * @param {Object} options - Options
     * @returns {Promise<Object|null>} Standings payload
     */
    async fetchStandings(league, options = {}) {
        const now = Date.now();
        const seasonKey = options.season || 'current';
        const key = `${league || Config.DEFAULT_LEAGUE}:${seasonKey}`;
        const entry = this.standingsCache.byLeague[key];
        const force = Boolean(options.forceRefresh || this.standingsCache.forceNext);

        if (!force && entry && (now - entry.lastFetch) < this.standingsCache.ttl) {
            return entry.data || null;
        }

        try {
            const url = new URL(`${this.BASE_URL}/standings`, window.location.origin);
            url.searchParams.set('league', league || Config.DEFAULT_LEAGUE);
            if (options.season) {
                url.searchParams.set('season', options.season);
            }
            if (force) {
                url.searchParams.set('force', '1');
            }

            const response = await fetch(url.toString(), {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Standings API responded with ${response.status}`);
            }

            const data = await response.json();
            this.standingsCache.byLeague[key] = {
                data,
                lastFetch: now
            };
            this.standingsCache.forceNext = false;
            return data;
        } catch (error) {
            console.error('Failed to fetch standings:', error);
            return null;
        }
    },

    /**
     * Clear standings cache
     */
    clearStandingsCache() {
        this.standingsCache.byLeague = {};
        this.standingsCache.forceNext = true;
    },

    /**
     * Get metadata for the last games fetch
     * @param {string} filter - 'all', 'live', or 'upcoming'
     * @returns {Object|null} Meta data
     */
    getMeta(filter = 'all', league = 'all') {
        const cacheKey = `${league}:${filter}`;
        return this.cache.byFilter[cacheKey]?.meta || null;
    }
};
