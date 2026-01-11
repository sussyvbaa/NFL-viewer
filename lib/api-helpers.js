const STREAMED_IMAGE_BASE = process.env.STREAMED_IMAGE_BASE || 'https://streamed.pk';
const API_BASES = (process.env.STREAM_API_BASES || 'https://streamed.pk/api')
    .split(',')
    .map(base => base.trim())
    .filter(Boolean);

const ESPN_TEAM_ENDPOINTS = {
    nfl: 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
    nba: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams',
    mlb: 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams',
    nhl: 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams'
};

const ESPN_STANDINGS_ENDPOINTS = {
    nfl: 'https://site.api.espn.com/apis/v2/sports/football/nfl/standings',
    nba: 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings',
    mlb: 'https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings',
    nhl: 'https://site.api.espn.com/apis/v2/sports/hockey/nhl/standings'
};

const LEAGUE_CONFIGS = {
    nfl: {
        categories: ['american-football', 'nfl', 'football-am'],
        brand_keywords: ['nfl', 'redzone', 'red zone', 'nfl network'],
        team_keywords: [
            'bills', 'dolphins', 'patriots', 'jets',
            'ravens', 'bengals', 'browns', 'steelers',
            'texans', 'colts', 'jaguars', 'titans',
            'broncos', 'chiefs', 'raiders', 'chargers',
            'cowboys', 'giants', 'eagles', 'commanders',
            'bears', 'lions', 'packers', 'vikings',
            'falcons', 'panthers', 'saints', 'buccaneers',
            'cardinals', 'rams', '49ers', 'seahawks'
        ],
        exclude_keywords: [
            'ncaaf', 'ncaa', 'college', 'cfb', 'fbs', 'fcs',
            'xfl', 'usfl', 'cfl', 'arena',
            'nhl', 'hockey', 'ice hockey'
        ]
    },
    nba: {
        categories: ['basketball', 'nba'],
        brand_keywords: ['nba', 'nba tv', 'league pass', 'summer league', 'all-star', 'all star'],
        team_keywords: [
            'hawks', 'celtics', 'nets', 'hornets',
            'bulls', 'cavaliers', 'mavericks', 'nuggets',
            'pistons', 'warriors', 'rockets', 'pacers',
            'clippers', 'lakers', 'grizzlies', 'heat',
            'bucks', 'timberwolves', 'pelicans', 'knicks',
            'thunder', 'magic', '76ers', 'sixers',
            'suns', 'trail blazers', 'blazers', 'kings',
            'spurs', 'raptors', 'jazz', 'wizards'
        ],
        exclude_keywords: [
            'wnba', 'ncaab', 'ncaa', 'college', 'g league', 'gleague',
            'fiba', 'euroleague',
            'nhl', 'hockey', 'ice hockey'
        ]
    },
    mlb: {
        categories: ['baseball', 'mlb'],
        brand_keywords: ['mlb', 'mlb network', 'world series', 'spring training', 'all-star'],
        team_keywords: [
            'orioles', 'red sox', 'yankees', 'rays', 'blue jays',
            'white sox', 'guardians', 'tigers', 'royals', 'twins',
            'astros', 'angels', 'athletics', 'mariners', 'rangers',
            'braves', 'marlins', 'mets', 'phillies', 'nationals',
            'cubs', 'reds', 'brewers', 'pirates', 'cardinals',
            'diamondbacks', 'rockies', 'dodgers', 'padres', 'giants'
        ],
        exclude_keywords: [
            'college', 'ncaa', 'minor league', 'triple-a', 'double-a',
            'kbo', 'npb'
        ]
    },
    nhl: {
        categories: ['hockey', 'ice-hockey', 'nhl'],
        brand_keywords: ['nhl', 'nhl network', 'hockey night', 'stanley cup', 'winter classic'],
        team_keywords: [
            'ducks', 'bruins', 'sabres', 'flames',
            'hurricanes', 'blackhawks', 'avalanche', 'blue jackets',
            'stars', 'red wings', 'oilers', 'panthers',
            'kings', 'wild', 'canadiens', 'predators',
            'devils', 'islanders', 'rangers', 'senators',
            'flyers', 'penguins', 'sharks', 'kraken',
            'blues', 'lightning', 'maple leafs', 'leafs',
            'canucks', 'golden knights', 'capitals', 'jets',
            'utah', 'coyotes'
        ],
        exclude_keywords: [
            'ahl', 'khl', 'ncaa', 'college', 'whl', 'ohl', 'qmjhl',
            'iihf', 'world juniors', 'olympics'
        ]
    }
};

const PRIORITY_LEAGUES = ['nfl', 'nba', 'mlb', 'nhl'];
const LIVE_MAX_AGE_SEC = parseInt(process.env.LIVE_MAX_AGE_SEC || '14400', 10);
const ENDED_GRACE_SEC = parseInt(process.env.ENDED_GRACE_SEC || '21600', 10);

const sanitizeSlug = value => {
    if (!value) return '';
    return String(value).toLowerCase().replace(/[^a-z0-9\-_]/g, '');
};

const normalizeCategory = value => {
    if (!value) return '';
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
};

const toInt = value => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
};

const selectLogo = logos => {
    if (!Array.isArray(logos) || logos.length === 0) return null;
    const best = logos.reduce((prev, current) => {
        const prevScore = toInt(prev.width) * toInt(prev.height);
        const currentScore = toInt(current.width) * toInt(current.height);
        return currentScore > prevScore ? current : prev;
    }, logos[0]);
    return best.href || logos[0].href || null;
};

const buildStreamedLogo = badge => {
    if (!badge || typeof badge !== 'string') return null;
    const cleaned = badge.trim();
    if (!cleaned) return null;
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
        return cleaned;
    }
    if (cleaned.startsWith('/')) {
        return `${STREAMED_IMAGE_BASE.replace(/\/$/, '')}${cleaned}`;
    }
    if (cleaned.startsWith('api/images/') || cleaned.startsWith('images/')) {
        return `${STREAMED_IMAGE_BASE.replace(/\/$/, '')}/${cleaned}`;
    }
    const extension = cleaned.match(/\.[a-z0-9]+$/i)?.[0];
    if (extension) {
        return `${STREAMED_IMAGE_BASE.replace(/\/$/, '')}/api/images/badge/${cleaned}`;
    }
    return `${STREAMED_IMAGE_BASE.replace(/\/$/, '')}/api/images/badge/${cleaned}.webp`;
};

const buildStreamedPoster = poster => {
    if (!poster || typeof poster !== 'string') return null;
    const cleaned = poster.trim();
    if (!cleaned) return null;
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
        return cleaned;
    }
    if (cleaned.startsWith('/')) {
        const path = cleaned.match(/\.[a-z0-9]+$/i) ? cleaned : `${cleaned}.webp`;
        return `${STREAMED_IMAGE_BASE.replace(/\/$/, '')}${path}`;
    }
    if (cleaned.startsWith('api/images/') || cleaned.startsWith('images/')) {
        const path = `/${cleaned.replace(/^\/+/, '')}`;
        const finalPath = path.match(/\.[a-z0-9]+$/i) ? path : `${path}.webp`;
        return `${STREAMED_IMAGE_BASE.replace(/\/$/, '')}${finalPath}`;
    }
    const extension = cleaned.match(/\.[a-z0-9]+$/i)?.[0];
    if (extension) {
        return `${STREAMED_IMAGE_BASE.replace(/\/$/, '')}/api/images/proxy/${cleaned}`;
    }
    return `${STREAMED_IMAGE_BASE.replace(/\/$/, '')}/api/images/proxy/${cleaned}.webp`;
};

const buildStreamedTeam = team => {
    if (!team) return null;
    const name = team.name || '';
    const logo = buildStreamedLogo(team.badge || team.logo);
    const rawScore = team.score ?? team.points ?? team?.score?.value ?? team?.score?.displayValue;
    const score = rawScore !== undefined && rawScore !== null && rawScore !== '' ? rawScore : null;
    if (!name && !logo && score === null) return null;
    return {
        name,
        logo,
        score
    };
};

const fetchJson = async url => {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
        const error = new Error(`Request failed: ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return response.json();
};

const fetchMatches = async endpoint => {
    let lastError = null;
    for (const base of API_BASES) {
        try {
            const url = `${base.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
            const data = await fetchJson(url);
            return [Array.isArray(data) ? data : [], base];
        } catch (error) {
            lastError = error;
        }
    }
    if (lastError) throw lastError;
    return [[], null];
};

const isLeagueMatch = (match, league) => {
    const config = LEAGUE_CONFIGS[league];
    if (!config) return false;
    const category = (match.category || '').toLowerCase();
    const searchText = `${match.title || ''} ${match.id || ''}`.toLowerCase();
    if (category && !config.categories.some(cat => category.includes(cat))) {
        return false;
    }
    if (config.exclude_keywords.some(keyword => searchText.includes(keyword))) {
        return false;
    }
    const keywordMatches = [...config.brand_keywords, ...config.team_keywords];
    return keywordMatches.some(keyword => searchText.includes(keyword));
};

const identifyMatchLeague = match => {
    for (const league of PRIORITY_LEAGUES) {
        if (isLeagueMatch(match, league)) {
            return league;
        }
    }
    for (const league of Object.keys(LEAGUE_CONFIGS)) {
        if (isLeagueMatch(match, league)) {
            return league;
        }
    }
    return null;
};

const parseMatch = (match, { isLive, league }) => {
    const matchId = match.id || '';
    const title = match.title || '';
    const category = (match.category || '').toLowerCase();
    const timestamp = match.date || Date.now();
    const now = Date.now();
    const isLiveNow = Boolean(isLive) && (now - timestamp) <= LIVE_MAX_AGE_SEC * 1000;
    const isUpcoming = !isLiveNow && timestamp > now;
    const isEnded = !isLiveNow && timestamp <= (now - ENDED_GRACE_SEC * 1000);
    const sources = (match.sources || [])
        .map(source => ({ source: source.source, id: source.id }))
        .filter(source => source.source && source.id);
    if (sources.length === 0 && matchId) {
        sources.push({ source: 'admin', id: matchId });
    }
    const bestSource = sources[0] || { source: 'admin', id: matchId };
    const teams = match.teams || {};
    const homeTeam = buildStreamedTeam(teams.home);
    const awayTeam = buildStreamedTeam(teams.away);
    const teamsPayload = homeTeam || awayTeam ? { home: homeTeam, away: awayTeam } : null;
    const poster = buildStreamedPoster(match.poster);
    return {
        id: matchId ? `api_${matchId}` : `api_${sanitizeSlug(title) || Date.now()}`,
        matchId,
        slug: bestSource.id || matchId,
        title,
        poster,
        category,
        sport: normalizeCategory(category),
        gameTime: new Date(timestamp).toISOString(),
        timestamp,
        isLive: isLiveNow,
        isUpcoming,
        isEnded,
        isPopular: Boolean(match.popular),
        sources,
        currentSource: bestSource.source || 'admin',
        source: 'api',
        league,
        teams: teamsPayload
    };
};

const filterMatchesForLeague = (matches, league) => {
    if (!LEAGUE_CONFIGS[league]) return [];
    return matches.filter(match => isLeagueMatch(match, league));
};

const normalizeTeamName = value => {
    if (!value) return '';
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
};

const extractTeamsFromTitle = title => {
    if (!title) return [];
    const parts = String(title).split(/\s+vs\.?\s+|\s+@\s+/i);
    if (parts.length >= 2) {
        return [parts[0], parts[1]];
    }
    return [];
};

const buildGameKey = game => {
    if (!game) return '';
    const date = game.timestamp ? new Date(game.timestamp).toISOString().slice(0, 10) : 'unknown';
    const awayName = game.teams?.away?.name || '';
    const homeName = game.teams?.home?.name || '';
    let teams = [awayName, homeName].filter(Boolean);
    if (teams.length < 2) {
        teams = extractTeamsFromTitle(game.title || '');
    }
    const normalizedTeams = teams.map(normalizeTeamName).filter(Boolean).sort();
    if (normalizedTeams.length < 2) {
        const fallback = normalizeTeamName(game.title || '');
        if (!fallback) return '';
        return `${game.league || 'unknown'}:${date}:${fallback}`;
    }
    return `${game.league || 'unknown'}:${date}:${normalizedTeams.join('-')}`;
};

const dedupeGames = games => {
    const map = new Map();
    (games || []).forEach(game => {
        const key = buildGameKey(game);
        if (!key) {
            map.set(Symbol('game'), game);
            return;
        }
        const existing = map.get(key);
        if (!existing) {
            map.set(key, game);
            return;
        }
        if (game.isLive && !existing.isLive) {
            map.set(key, game);
            return;
        }
        if ((game.sources || []).length > (existing.sources || []).length) {
            map.set(key, game);
        }
    });
    return Array.from(map.values());
};

const buildGamesForLeague = (snapshot, league) => {
    const liveMatches = filterMatchesForLeague(snapshot.live || [], league);
    const allMatches = filterMatchesForLeague(snapshot.all || [], league);
    const liveIds = new Set(liveMatches.map(match => match.id).filter(Boolean));
    const liveGames = liveMatches.map(match => parseMatch(match, { isLive: true, league }));
    const upcomingGames = allMatches
        .filter(match => !match.id || !liveIds.has(match.id))
        .map(match => parseMatch(match, { isLive: false, league }));
    return dedupeGames([...liveGames, ...upcomingGames]);
};

const buildGamesForAll = snapshot => {
    const liveMatches = snapshot.live || [];
    const allMatches = snapshot.all || [];
    const liveIds = new Set(liveMatches.map(match => match.id).filter(Boolean));
    const liveGames = [];
    liveMatches.forEach(match => {
        const league = identifyMatchLeague(match);
        if (!league) return;
        liveGames.push(parseMatch(match, { isLive: true, league }));
    });
    const upcomingGames = [];
    allMatches.forEach(match => {
        if (match.id && liveIds.has(match.id)) return;
        const league = identifyMatchLeague(match);
        if (!league) return;
        upcomingGames.push(parseMatch(match, { isLive: false, league }));
    });
    return dedupeGames([...liveGames, ...upcomingGames]);
};

const sortGames = (games, league) => {
    const priority = PRIORITY_LEAGUES.reduce((acc, key, index) => {
        acc[key] = index;
        return acc;
    }, {});

    return games.sort((a, b) => {
        const timeA = a.timestamp || 0;
        const timeB = b.timestamp || 0;
        if (timeA !== timeB) return timeA - timeB;
        if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
        if (league === 'all') {
            const priorityA = priority[a.league] ?? PRIORITY_LEAGUES.length;
            const priorityB = priority[b.league] ?? PRIORITY_LEAGUES.length;
            if (priorityA !== priorityB) return priorityA - priorityB;
        }
        return 0;
    });
};

const filterGames = (games, filterValue) => {
    if (filterValue === 'live') {
        return games.filter(game => game.isLive);
    }
    if (filterValue === 'upcoming') {
        return games.filter(game => game.isUpcoming && !game.isLive);
    }
    return games;
};

const findGameBySlug = (games, slug) => {
    if (!slug) return null;
    const normalized = sanitizeSlug(slug);
    for (const game of games) {
        if ([game.slug, game.matchId].some(value => sanitizeSlug(value) === normalized)) {
            return game;
        }
        for (const source of game.sources || []) {
            if (sanitizeSlug(source.id) === normalized) {
                return {
                    ...game,
                    slug: source.id,
                    currentSource: source.source
                };
            }
        }
    }
    return null;
};

const parseEspnTeams = payload => {
    const teams = [];
    (payload.sports || []).forEach(sport => {
        (sport.leagues || []).forEach(league => {
            (league.teams || []).forEach(entry => {
                const team = entry.team || {};
                const abbreviation = team.abbreviation;
                if (!abbreviation) return;
                const displayName = team.displayName || team.shortDisplayName || team.name;
                const shortName = team.shortDisplayName || team.abbreviation || displayName;
                teams.push({
                    id: team.id,
                    abbreviation: abbreviation.toUpperCase(),
                    name: displayName,
                    shortName,
                    logo: selectLogo(team.logos || [])
                });
            });
        });
    });
    return teams;
};

const extractStat = (stats, names) => {
    for (const stat of stats || []) {
        if (names.includes(stat.name)) {
            return stat.displayValue ?? stat.value ?? null;
        }
    }
    return null;
};

const parseEspnStandings = payload => {
    const groups = [];
    let season = null;
    let seasonType = null;
    const leagueName = payload.shortName || payload.name || payload.abbreviation || '';
    const parseEntries = entries => (entries || []).map(entry => {
        const team = entry.team || {};
        const stats = entry.stats || [];
        return {
            team: {
                id: team.id,
                name: team.displayName || team.shortDisplayName || team.name,
                abbreviation: team.abbreviation,
                logo: selectLogo(team.logos || [])
            },
            stats: {
                wins: extractStat(stats, ['wins']),
                losses: extractStat(stats, ['losses']),
                ties: extractStat(stats, ['ties']),
                otLosses: extractStat(stats, ['otLosses', 'overtimeLosses']),
                winPercent: extractStat(stats, ['winPercent', 'pointsPercentage']),
                points: extractStat(stats, ['points']),
                gamesBehind: extractStat(stats, ['gamesBehind', 'gamesBack']),
                streak: extractStat(stats, ['streak'])
            }
        };
    });
    const addGroup = (name, standings) => {
        if (!standings) return;
        season = season || standings.seasonDisplayName || String(standings.season || '');
        seasonType = seasonType || standings.seasonType || null;
        groups.push({
            name: name || 'Standings',
            entries: parseEntries(standings.entries || [])
        });
    };
    const children = payload.children || [];
    if (children.length) {
        children.forEach(child => {
            const groupName = child.shortName || child.name || child.abbreviation;
            addGroup(groupName, child.standings);
        });
    } else {
        addGroup(leagueName, payload.standings);
    }
    return {
        league: leagueName,
        season,
        seasonType,
        groups
    };
};

module.exports = {
    API_BASES,
    ESPN_TEAM_ENDPOINTS,
    ESPN_STANDINGS_ENDPOINTS,
    fetchJson,
    fetchMatches,
    parseEspnTeams,
    parseEspnStandings,
    buildGamesForAll,
    buildGamesForLeague,
    sortGames,
    filterGames,
    findGameBySlug
};
