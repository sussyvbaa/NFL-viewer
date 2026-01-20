const {
    fetchMatches,
    buildGamesForAll,
    buildGamesForLeague,
    fetchScoreboard,
    buildGamesFromScoreboard,
    findGameBySlug,
    sortGames,
    applyLiveScores
} = require('../../lib/api-helpers');

const cache = {
    entries: new Map(),
    ttlMs: parseInt(process.env.GAMES_CACHE_TTL_MS || '45000', 10)
};

const buildCacheKey = (slug, league) => `${league}:${slug}`;

module.exports = async (req, res) => {
    const slug = req.query.slug ? req.query.slug.toString() : '';
    const league = (req.query.league || 'all').toString().toLowerCase();

    if (!slug) {
        res.status(400).json({ error: 'missing_slug' });
        return;
    }

    const cacheKey = buildCacheKey(slug, league);
    const now = Date.now();
    const entry = cache.entries.get(cacheKey);

    if (entry && (now - entry.timestamp) < cache.ttlMs) {
        res.status(200).json({
            game: entry.game,
            meta: {
                cacheAgeSec: Math.floor((now - entry.timestamp) / 1000),
                stale: false,
                upstreamBase: entry.source,
                sourceType: entry.sourceType || null,
                league,
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
        games = sortGames(games, league);
        games = await applyLiveScores(games);

        let match = findGameBySlug(games, slug);
        let upstreamSource = source;

        if (!match && league !== 'all') {
            try {
                const scoreboardEvents = await fetchScoreboard(league);
                const scoreboardGames = buildGamesFromScoreboard(scoreboardEvents, league);
                match = findGameBySlug(scoreboardGames, slug);
                if (match) {
                    upstreamSource = 'espn';
                }
            } catch (error) {
                console.warn('Scoreboard fallback failed.', {
                    league,
                    message: error.message
                });
            }
        }

        if (!match) {
            res.status(404).json({ error: 'not_found' });
            return;
        }

        const sourceType = upstreamSource === 'espn' ? 'espn_scoreboard' : 'streamed';
        cache.entries.set(cacheKey, {
            game: match,
            timestamp: Date.now(),
            source: upstreamSource,
            sourceType
        });

        res.status(200).json({
            game: match,
            meta: {
                cacheAgeSec: 0,
                stale: false,
                upstreamBase: upstreamSource,
                sourceType,
                league,
                fromCache: false
            }
        });
    } catch (error) {
        if (entry) {
            res.status(200).json({
                game: entry.game,
                meta: {
                    cacheAgeSec: Math.floor((now - entry.timestamp) / 1000),
                    stale: true,
                    upstreamBase: entry.source,
                    sourceType: entry.sourceType || null,
                    league,
                    fromCache: true,
                    error: 'upstream_unavailable'
                }
            });
            return;
        }
        res.status(502).json({
            error: 'upstream_unavailable',
            message: error.message
        });
    }
};
