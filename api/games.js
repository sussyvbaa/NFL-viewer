const {
    fetchMatches,
    buildGamesForAll,
    buildGamesForLeague,
    fetchScoreboard,
    buildGamesFromScoreboard,
    filterGames,
    sortGames,
    applyLiveScores
} = require('../lib/api-helpers');

const cache = {
    entries: new Map(),
    ttlMs: parseInt(process.env.GAMES_CACHE_TTL_MS || '45000', 10)
};

const buildCacheKey = (filterValue, league) => `${filterValue}:${league}`;

module.exports = async (req, res) => {
    const filterValue = (req.query.filter || 'all').toString();
    const league = (req.query.league || 'all').toString().toLowerCase();
    const debug = (req.query.debug || '0').toString() === '1';
    const includeHealth = (req.query.includeHealth || '0').toString() === '1';
    const cacheKey = buildCacheKey(filterValue, league);
    const now = Date.now();
    const entry = cache.entries.get(cacheKey);

    if (entry && (now - entry.timestamp) < cache.ttlMs) {
        res.status(200).json({
            games: entry.games,
            meta: {
                count: entry.games.length,
                filter: filterValue,
                league,
                cacheAgeSec: Math.floor((now - entry.timestamp) / 1000),
                stale: false,
                upstreamBase: entry.source,
                sourceType: entry.sourceType || null,
                fromCache: true,
                ...(entry.upstreamCounts ? { upstreamCounts: entry.upstreamCounts } : {})
            }
        });
        return;
    }

    try {
        const [liveMatches, liveSource] = await fetchMatches('/matches/live');
        const [allMatches, allSource] = await fetchMatches('/matches/all');
        const snapshot = { live: liveMatches, all: allMatches };
        const source = liveSource || allSource || null;

        let games = league === 'all'
            ? buildGamesForAll(snapshot)
            : buildGamesForLeague(snapshot, league);

        let usedScoreboard = false;
        let scoreboardEvents = [];
        let scoreboardGameCount = 0;
        if (!games.length && league !== 'all') {
            try {
                scoreboardEvents = await fetchScoreboard(league);
                const scoreboardGames = buildGamesFromScoreboard(scoreboardEvents, league);
                if (scoreboardGames.length) {
                    scoreboardGameCount = scoreboardGames.length;
                    games = scoreboardGames;
                    usedScoreboard = true;
                }
            } catch (error) {
                console.warn('Scoreboard fallback failed.', {
                    league,
                    message: error.message
                });
            }
        }

        games = filterGames(games, filterValue);
        games = sortGames(games, league);
        if (!usedScoreboard) {
            games = await applyLiveScores(games);
        }

        if (usedScoreboard) {
            console.info('Using ESPN scoreboard fallback.', {
                league,
                filterValue,
                scoreboardEvents: scoreboardEvents.length,
                scoreboardGames: scoreboardGameCount,
                filteredGames: games.length
            });
        }

        if (!liveMatches.length && !allMatches.length) {
            console.warn('Upstream returned no matches.', {
                league,
                filterValue,
                upstreamBase: source
            });
        }

        if (games.length === 0 && (liveMatches.length || allMatches.length)) {
            console.warn('No games matched filters.', {
                filterValue,
                league,
                liveMatches: liveMatches.length,
                allMatches: allMatches.length
            });
        }

        const upstreamCounts = {
            liveMatches: liveMatches.length,
            allMatches: allMatches.length,
            scoreboardEvents: scoreboardEvents.length
        };
        const upstreamSource = usedScoreboard ? 'espn' : source;

        cache.entries.set(cacheKey, {
            games,
            timestamp: Date.now(),
            source: upstreamSource,
            sourceType: usedScoreboard ? 'espn_scoreboard' : 'streamed',
            upstreamCounts
        });

        res.status(200).json({
            games,
            meta: {
                count: games.length,
                filter: filterValue,
                league,
                cacheAgeSec: 0,
                stale: false,
                upstreamBase: upstreamSource,
                sourceType: usedScoreboard ? 'espn_scoreboard' : 'streamed',
                fromCache: false,
                ...((debug || includeHealth) ? {
                    debug: upstreamCounts
                } : {}),
                ...(games.length === 0 ? {
                    upstreamCounts
                } : {}),
                ...(games.length === 0 && (liveMatches.length || allMatches.length) ? {
                    warning: 'No games matched filters; check league keywords or upstream data.'
                } : {})
            }
        });
    } catch (error) {
        console.error('Failed to fetch games:', error);
        if (entry) {
            res.status(200).json({
                games: entry.games,
                meta: {
                    count: entry.games.length,
                    filter: filterValue,
                    league,
                    cacheAgeSec: Math.floor((now - entry.timestamp) / 1000),
                    stale: true,
                    upstreamBase: entry.source,
                    sourceType: entry.sourceType || null,
                    fromCache: true,
                    error: 'upstream_unavailable',
                    ...(entry.upstreamCounts ? { upstreamCounts: entry.upstreamCounts } : {})
                }
            });
            return;
        }
        res.status(502).json({
            error: 'upstream_unavailable',
            message: error.message,
            games: []
        });
    }
};
