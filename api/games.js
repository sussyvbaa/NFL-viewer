const {
    fetchMatches,
    buildGamesForAll,
    buildGamesForLeague,
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
                fromCache: true
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

        games = filterGames(games, filterValue);
        games = sortGames(games, league);
        games = await applyLiveScores(games);

        if (games.length === 0 && (liveMatches.length || allMatches.length)) {
            console.warn('No games matched filters.', {
                filterValue,
                league,
                liveMatches: liveMatches.length,
                allMatches: allMatches.length
            });
        }

        cache.entries.set(cacheKey, {
            games,
            timestamp: Date.now(),
            source
        });

        res.status(200).json({
            games,
            meta: {
                count: games.length,
                filter: filterValue,
                league,
                cacheAgeSec: 0,
                stale: false,
                upstreamBase: source,
                fromCache: false,
                ...(debug ? {
                    debug: {
                        liveMatches: liveMatches.length,
                        allMatches: allMatches.length
                    }
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
                    fromCache: true,
                    error: 'upstream_unavailable'
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
