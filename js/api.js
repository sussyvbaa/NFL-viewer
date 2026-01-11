/**
 * API Module
 *
 * Fetches game data from the local backend service.
 * The backend handles retries, caching, and stream health checks.
 */

const ESPN_SCOREBOARD_ENDPOINTS = {
    nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
    nba: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
    mlb: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard',
    nhl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard'
};

const selectEspnLogo = team => {
    if (!team) return null;
    if (team.logo) return team.logo;
    const logos = Array.isArray(team.logos) ? team.logos : [];
    return logos[0]?.href || null;
};

const normalizePlayoffTeam = competitor => {
    if (!competitor) return null;
    const team = competitor.team || {};
    return {
        id: team.id || null,
        name: team.displayName || team.shortDisplayName || team.name || null,
        abbreviation: team.abbreviation || null,
        logo: selectEspnLogo(team),
        score: competitor.score ?? competitor?.score?.value ?? competitor?.score?.displayValue ?? null,
        winner: Boolean(competitor.winner)
    };
};

const buildPlayoffRoundLabels = data => {
    const labels = new Map();
    const calendar = data?.leagues?.[0]?.calendar || [];
    const postseason = calendar.find(entry => entry.label === 'Postseason');
    (postseason?.entries || []).forEach(entry => {
        const value = parseInt(entry.value, 10);
        if (!Number.isNaN(value)) {
            labels.set(value, entry.label || entry.alternateLabel || `Round ${value}`);
        }
    });
    return labels;
};

const groupPlayoffEventsByRound = (events, labels) => {
    const roundMap = new Map();
    (events || []).forEach(event => {
        const weekNumber = event?.week?.number ? parseInt(event.week.number, 10) : null;
        const roundNumber = Number.isNaN(weekNumber) ? null : weekNumber;
        const roundKey = roundNumber ?? 0;
        if (!roundMap.has(roundKey)) {
            roundMap.set(roundKey, {
                number: roundNumber,
                label: roundNumber ? labels.get(roundNumber) || `Round ${roundNumber}` : 'Postseason',
                matchups: []
            });
        }

        const competition = event?.competitions?.[0] || {};
        const competitors = competition?.competitors || [];
        const home = competitors.find(team => team.homeAway === 'home');
        const away = competitors.find(team => team.homeAway === 'away');
        const status = competition?.status?.type || event?.status?.type || {};
        roundMap.get(roundKey).matchups.push({
            id: event.id,
            name: event.name || event.shortName,
            shortName: event.shortName || event.name,
            startDate: competition.startDate || event.date || null,
            status: {
                state: status.state || null,
                completed: Boolean(status.completed),
                detail: status.shortDetail || status.detail || status.description || ''
            },
            home: normalizePlayoffTeam(home),
            away: normalizePlayoffTeam(away)
        });
    });

    return Array.from(roundMap.values()).sort((a, b) => {
        const aNumber = a.number ?? 0;
        const bNumber = b.number ?? 0;
        return aNumber - bNumber;
    });
};

const fetchPlayoffsFromEspn = async (league) => {
    const baseUrl = ESPN_SCOREBOARD_ENDPOINTS[league];
    if (!baseUrl) {
        return null;
    }

    const fetchScoreboard = async url => {
        const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) {
            throw new Error(`ESPN scoreboard responded with ${response.status}`);
        }
        return response.json();
    };

    const currentScoreboard = await fetchScoreboard(baseUrl);
    const seasonType = currentScoreboard?.leagues?.[0]?.season?.type?.type || currentScoreboard?.season?.type;
    const isPlayoffs = Number(seasonType) === 3;
    if (!isPlayoffs) {
        return {
            isPlayoffs: false,
            rounds: [],
            meta: {
                league,
                seasonType: seasonType ?? null,
                cacheAgeSec: 0,
                stale: false,
                fromCache: false
            }
        };
    }

    const postseasonData = currentScoreboard?.events?.length
        ? currentScoreboard
        : await fetchScoreboard(`${baseUrl}?seasontype=3`);
    const labels = buildPlayoffRoundLabels(postseasonData);
    const rounds = groupPlayoffEventsByRound(postseasonData?.events || [], labels);
    return {
        isPlayoffs: true,
        season: postseasonData?.season || null,
        rounds,
        meta: {
            league,
            seasonType: seasonType ?? 3,
            cacheAgeSec: 0,
            stale: false,
            fromCache: false
        }
    };
};

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
    playoffsCache: {
        byLeague: {},
        ttl: 60000,
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
     * Fetch playoff brackets
     * @param {string} league - League key
     * @returns {Promise<Object|null>} Playoffs payload
     */
    async fetchPlayoffs(league, options = {}) {
        const now = Date.now();
        const key = league || Config.DEFAULT_LEAGUE;
        const entry = this.playoffsCache.byLeague[key];
        const force = Boolean(options.forceRefresh || this.playoffsCache.forceNext);

        if (!force && entry && (now - entry.lastFetch) < this.playoffsCache.ttl) {
            return entry.data || null;
        }

        try {
            const url = new URL(`${this.BASE_URL}/playoffs`, window.location.origin);
            url.searchParams.set('league', key);
            if (force) {
                url.searchParams.set('force', '1');
            }

            const response = await fetch(url.toString(), {
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Playoffs API responded with ${response.status}`);
            }

            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                throw new Error('Playoffs API returned non-JSON response');
            }

            const data = await response.json();
            this.playoffsCache.byLeague[key] = {
                data,
                lastFetch: now
            };
            this.playoffsCache.forceNext = false;
            return data;
        } catch (error) {
            console.warn('Playoffs API failed, falling back to ESPN:', error);
            try {
                const fallbackData = await fetchPlayoffsFromEspn(key);
                if (fallbackData) {
                    this.playoffsCache.byLeague[key] = {
                        data: fallbackData,
                        lastFetch: now
                    };
                    this.playoffsCache.forceNext = false;
                    return fallbackData;
                }
            } catch (fallbackError) {
                console.error('Failed to fetch playoffs from ESPN:', fallbackError);
            }
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
     * Clear playoffs cache
     */
    clearPlayoffsCache() {
        this.playoffsCache.byLeague = {};
        this.playoffsCache.forceNext = true;
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
