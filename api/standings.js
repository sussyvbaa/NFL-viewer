const {
    fetchJson,
    parseEspnStandings,
    ESPN_STANDINGS_ENDPOINTS
} = require('../lib/api-helpers');

const cache = {
    entries: new Map(),
    ttlMs: parseInt(process.env.STANDINGS_CACHE_TTL_MS || '900000', 10)
};

const buildCacheKey = (league, season) => `${league}:${season || 'current'}`;

module.exports = async (req, res) => {
    const league = (req.query.league || 'nfl').toString().toLowerCase();
    const season = req.query.season ? req.query.season.toString() : '';
    const cacheKey = buildCacheKey(league, season);
    const now = Date.now();
    const entry = cache.entries.get(cacheKey);

    if (entry && (now - entry.timestamp) < cache.ttlMs) {
        res.status(200).json({
            standings: entry.standings,
            meta: {
                count: Array.isArray(entry.standings) ? entry.standings.length : undefined,
                league: entry.league,
                season: entry.season,
                cacheAgeSec: Math.floor((now - entry.timestamp) / 1000),
                stale: false,
                fromCache: true
            }
        });
        return;
    }

    try {
        if (league === 'all') {
            const standingsPayload = [];
            for (const [leagueKey, baseUrl] of Object.entries(ESPN_STANDINGS_ENDPOINTS)) {
                let url = baseUrl;
                if (season) {
                    url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}season=${season}`;
                }
                const payload = await fetchJson(url);
                standingsPayload.push({
                    league: leagueKey,
                    ...parseEspnStandings(payload)
                });
            }
            cache.entries.set(cacheKey, {
                standings: standingsPayload,
                league: 'all',
                season: season || 'current',
                timestamp: Date.now()
            });
            res.status(200).json({
                standings: standingsPayload,
                meta: {
                    count: standingsPayload.length,
                    league: 'all',
                    season: season || 'current',
                    cacheAgeSec: 0,
                    stale: false,
                    fromCache: false
                }
            });
            return;
        }

        const baseUrl = ESPN_STANDINGS_ENDPOINTS[league];
        if (!baseUrl) {
            res.status(400).json({ error: 'unsupported_league', standings: [] });
            return;
        }
        let url = baseUrl;
        if (season) {
            url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}season=${season}`;
        }

        const payload = await fetchJson(url);
        const standings = parseEspnStandings(payload);
        cache.entries.set(cacheKey, {
            standings,
            league,
            season: season || 'current',
            timestamp: Date.now()
        });
        res.status(200).json({
            standings,
            meta: {
                league,
                season: season || 'current',
                cacheAgeSec: 0,
                stale: false,
                fromCache: false
            }
        });
    } catch (error) {
        if (entry) {
            res.status(200).json({
                standings: entry.standings,
                meta: {
                    count: Array.isArray(entry.standings) ? entry.standings.length : undefined,
                    league: entry.league,
                    season: entry.season,
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
            standings: []
        });
    }
};
