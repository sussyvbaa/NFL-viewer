const {
    fetchJson,
    parseEspnTeams,
    ESPN_TEAM_ENDPOINTS
} = require('../lib/api-helpers');

module.exports = async (req, res) => {
    const league = (req.query.league || 'nfl').toString().toLowerCase();

    try {
        if (league === 'all') {
            const teams = [];
            for (const [leagueKey, url] of Object.entries(ESPN_TEAM_ENDPOINTS)) {
                const payload = await fetchJson(url);
                parseEspnTeams(payload).forEach(team => {
                    teams.push({ ...team, league: leagueKey });
                });
            }
            res.status(200).json({
                teams,
                meta: {
                    count: teams.length,
                    league: 'all',
                    cacheAgeSec: 0,
                    stale: false
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
        res.status(200).json({
            teams,
            meta: {
                count: teams.length,
                league,
                cacheAgeSec: 0,
                stale: false
            }
        });
    } catch (error) {
        res.status(502).json({
            error: 'upstream_unavailable',
            message: error.message,
            teams: []
        });
    }
};
