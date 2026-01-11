const {
    fetchMatches,
    buildGamesForAll,
    buildGamesForLeague,
    filterGames,
    sortGames,
    applyLiveScores
} = require('../lib/api-helpers');

module.exports = async (req, res) => {
    const filterValue = (req.query.filter || 'all').toString();
    const league = (req.query.league || 'all').toString().toLowerCase();

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

        res.status(200).json({
            games,
            meta: {
                count: games.length,
                filter: filterValue,
                league,
                cacheAgeSec: 0,
                stale: false,
                upstreamBase: source
            }
        });
    } catch (error) {
        res.status(502).json({
            error: 'upstream_unavailable',
            message: error.message,
            games: []
        });
    }
};
