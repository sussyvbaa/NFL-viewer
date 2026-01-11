const { fetchJson, ESPN_SCOREBOARD_ENDPOINTS } = require('../lib/api-helpers');

const cache = {
    entries: new Map(),
    ttlMs: parseInt(process.env.PLAYOFFS_CACHE_TTL_MS || '60000', 10)
};

const buildCacheKey = league => league || 'nfl';

const selectLogo = team => {
    if (!team) return null;
    if (team.logo) return team.logo;
    const logos = Array.isArray(team.logos) ? team.logos : [];
    return logos[0]?.href || null;
};

const normalizeTeam = competitor => {
    if (!competitor) return null;
    const team = competitor.team || {};
    return {
        id: team.id || null,
        name: team.displayName || team.shortDisplayName || team.name || null,
        abbreviation: team.abbreviation || null,
        logo: selectLogo(team),
        score: competitor.score ?? competitor?.score?.value ?? competitor?.score?.displayValue ?? null,
        winner: Boolean(competitor.winner)
    };
};

const buildRoundLabels = data => {
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

const groupEventsByRound = (events, labels) => {
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
            home: normalizeTeam(home),
            away: normalizeTeam(away)
        });
    });

    return Array.from(roundMap.values()).sort((a, b) => {
        const aNumber = a.number ?? 0;
        const bNumber = b.number ?? 0;
        return aNumber - bNumber;
    });
};

module.exports = async (req, res) => {
    const league = (req.query.league || 'nfl').toString().toLowerCase();
    const cacheKey = buildCacheKey(league);
    const now = Date.now();
    const entry = cache.entries.get(cacheKey);

    if (entry && (now - entry.timestamp) < cache.ttlMs) {
        res.status(200).json({
            ...entry.payload,
            meta: {
                ...entry.payload.meta,
                cacheAgeSec: Math.floor((now - entry.timestamp) / 1000),
                stale: false,
                fromCache: true
            }
        });
        return;
    }

    const baseUrl = ESPN_SCOREBOARD_ENDPOINTS[league];
    if (!baseUrl) {
        res.status(400).json({ error: 'unsupported_league' });
        return;
    }

    try {
        const currentScoreboard = await fetchJson(baseUrl);
        const seasonType = currentScoreboard?.leagues?.[0]?.season?.type?.type || currentScoreboard?.season?.type;
        const isPlayoffs = Number(seasonType) === 3;

        if (!isPlayoffs) {
            const payload = {
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
            cache.entries.set(cacheKey, { payload, timestamp: now });
            res.status(200).json(payload);
            return;
        }

        const postseasonUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}seasontype=3`;
        const postseasonData = await fetchJson(postseasonUrl);
        const labels = buildRoundLabels(postseasonData);
        const rounds = groupEventsByRound(postseasonData?.events || [], labels);
        const payload = {
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
        cache.entries.set(cacheKey, { payload, timestamp: now });
        res.status(200).json(payload);
    } catch (error) {
        if (entry) {
            res.status(200).json({
                ...entry.payload,
                meta: {
                    ...entry.payload.meta,
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
            message: error.message
        });
    }
};
