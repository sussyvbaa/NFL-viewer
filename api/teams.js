const {
    fetchJson,
    parseEspnTeams,
    ESPN_TEAM_ENDPOINTS
} = require('../lib/api-helpers');

const cache = {
    entries: new Map(),
    ttlMs: parseInt(process.env.TEAMS_CACHE_TTL_MS || '86400000', 10)
};

const buildCacheKey = league => league || 'all';

module.exports = async (req, res) => {
    const league = (req.query.league || 'nfl').toString().toLowerCase();
    const cacheKey = buildCacheKey(league);
    const now = Date.now();
    const entry = cache.entries.get(cacheKey);

    if (entry && (now - entry.timestamp) < cache.ttlMs) {
        res.status(200).json({
            teams: entry.teams,
            meta: {
                count: entry.teams.length,
                league: entry.league,
                cacheAgeSec: Math.floor((now - entry.timestamp) / 1000),
                stale: false,
                fromCache: true
            }
        });
        return;
    }

    try {
        if (league === 'all') {
            const teams = [];
            for (const [leagueKey, url] of Object.entries(ESPN_TEAM_ENDPOINTS)) {
                const payload = await fetchJson(url);
                parseEspnTeams(payload).forEach(team => {
                    teams.push({ ...team, league: leagueKey });
                });
            }
            cache.entries.set(cacheKey, {
                teams,
                league: 'all',
                timestamp: Date.now()
            });
            res.status(200).json({
                teams,
                meta: {
                    count: teams.length,
                    league: 'all',
                    cacheAgeSec: 0,
                    stale: false,
                    fromCache: false
                }
            });
            return;
        }

        const url = ESPN_TEAM_ENDPOINTS[league];
        if (!url) {
            res.status(400).json({ error: 'unsupported_league', teams: [] });
            return;
        }

        const payload = await fetchJson(url);
        const teams = parseEspnTeams(payload).map(team => ({ ...team, league }));
        cache.entries.set(cacheKey, {
            teams,
            league,
            timestamp: Date.now()
        });
        res.status(200).json({
            teams,
            meta: {
                count: teams.length,
                league,
                cacheAgeSec: 0,
                stale: false,
                fromCache: false
            }
        });
    } catch (error) {
        if (entry) {
            res.status(200).json({
                teams: entry.teams,
                meta: {
                    count: entry.teams.length,
                    league: entry.league,
                    cacheAgeSec: Math.floor((now - entry.timestamp) / 1000),
                    stale: true,
                    fromCache: true,
                    error: 'upstream_unavailable'
                }
            });
            return;
        }
        res.status(502).json({
            error: 'upstream_unavailable',
            message: error.message,
            teams: []
        });
    }
};
