const {
    fetchMatches,
    buildGamesForAll,
    buildGamesForLeague,
    findGameBySlug,
    sortGames
} = require('../../lib/api-helpers');

module.exports = async (req, res) => {
    const slug = req.query.slug ? req.query.slug.toString() : '';
    const league = (req.query.league || 'all').toString().toLowerCase();

    if (!slug) {
        res.status(400).json({ error: 'missing_slug' });
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

        const match = findGameBySlug(games, slug);
        if (!match) {
            res.status(404).json({ error: 'not_found' });
            return;
        }

        res.status(200).json({
            game: match,
            meta: {
                cacheAgeSec: 0,
                stale: false,
                upstreamBase: source,
                league
            }
        });
    } catch (error) {
        res.status(502).json({
            error: 'upstream_unavailable',
            message: error.message
        });
    }
};
