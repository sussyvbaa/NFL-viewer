const {
    fetchJson,
    parseEspnStandings,
    ESPN_STANDINGS_ENDPOINTS
} = require('../lib/api-helpers');

module.exports = async (req, res) => {
    const league = (req.query.league || 'nfl').toString().toLowerCase();
    const season = req.query.season ? req.query.season.toString() : '';

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
            res.status(200).json({
                standings: standingsPayload,
                meta: {
                    count: standingsPayload.length,
                    league: 'all',
                    season: season || 'current',
                    cacheAgeSec: 0,
                    stale: false
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
        res.status(200).json({
            standings,
            meta: {
                league,
                season: season || 'current',
                cacheAgeSec: 0,
                stale: false
            }
        });
    } catch (error) {
        res.status(502).json({
            error: 'upstream_unavailable',
            message: error.message,
            standings: []
        });
    }
};
