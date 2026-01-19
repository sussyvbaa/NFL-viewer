const {
    fetchJson,
    parseEspnTeams,
    ESPN_TEAM_ENDPOINTS
} = require('../lib/api-helpers');

const CORE_API_BASE = 'https://sports.core.api.espn.com/v2/sports';
const SITE_SPORTS = {
    nfl: 'football',
    nba: 'basketball',
    mlb: 'baseball',
    nhl: 'hockey'
};

const DEFAULT_PLAYER_STATS_MODE = 'hitting';
const DEFAULT_PLAYER_TABLE_VIEW = 'standard';
const MLB_PITCHER_POSITIONS = new Set(['P', 'SP', 'RP', 'CL']);

const INDEX_CACHE_TTL_MS = parseInt(process.env.PLAYERS_INDEX_CACHE_TTL_MS || '3600000', 10);
const TEAM_CACHE_TTL_MS = parseInt(process.env.PLAYERS_TEAM_CACHE_TTL_MS || '43200000', 10);
const STATS_CACHE_TTL_MS = parseInt(process.env.PLAYERS_STATS_CACHE_TTL_MS || '900000', 10);
const SEASON_CACHE_TTL_MS = parseInt(process.env.PLAYERS_SEASON_CACHE_TTL_MS || '43200000', 10);
const FETCH_CONCURRENCY = parseInt(process.env.PLAYERS_FETCH_CONCURRENCY || '10', 10);

const indexCache = new Map();
const teamCache = new Map();
const statsCache = new Map();
const seasonCache = new Map();

const PLAYER_TABLE_SCHEMAS = {
    nfl: {
        standard: {
            statCategories: ['passing', 'rushing', 'receiving', 'defensive', 'defensiveInterceptions', 'general'],
            columns: [
                { key: 'g', label: 'G', keys: ['gamesPlayed', 'GP'], categories: ['general'] },
                { key: 'passYds', label: 'PASS YDS', keys: ['passingYards', 'passYards', 'netPassingYards'], categories: ['passing'] },
                { key: 'passTd', label: 'PASS TD', keys: ['passingTouchdowns', 'passTD', 'passTd'], categories: ['passing'] },
                { key: 'int', label: 'INT', keys: ['interceptions', 'INT'], categories: ['passing'] },
                { key: 'rushYds', label: 'RUSH YDS', keys: ['rushingYards', 'rushYds'], categories: ['rushing'] },
                { key: 'rushTd', label: 'RUSH TD', keys: ['rushingTouchdowns', 'rushTd'], categories: ['rushing'] },
                { key: 'rec', label: 'REC', keys: ['receptions', 'rec'], categories: ['receiving'] },
                { key: 'recYds', label: 'REC YDS', keys: ['receivingYards', 'recYds'], categories: ['receiving'] },
                { key: 'recTd', label: 'REC TD', keys: ['receivingTouchdowns', 'recTd'], categories: ['receiving'] },
                { key: 'tackles', label: 'TCK', keys: ['totalTackles', 'tackles', 'TOT'], categories: ['defensive'] },
                { key: 'sacks', label: 'SACK', keys: ['sacks', 'SACK'], categories: ['defensive'] },
                { key: 'defInt', label: 'DEF INT', keys: ['interceptions', 'INT'], categories: ['defensiveInterceptions', 'defensive'] }
            ]
        },
        expanded: {
            statCategories: ['passing', 'rushing', 'receiving', 'defensive', 'defensiveInterceptions', 'general'],
            columns: [
                { key: 'g', label: 'G', keys: ['gamesPlayed', 'GP'], categories: ['general'] },
                { key: 'cmp', label: 'CMP', keys: ['completions', 'CMP'], categories: ['passing'] },
                { key: 'att', label: 'ATT', keys: ['passingAttempts', 'ATT'], categories: ['passing'] },
                { key: 'cmpPct', label: 'CMP%', keys: ['completionPct'], categories: ['passing'] },
                { key: 'ypa', label: 'Y/A', keys: ['yardsPerAttempt', 'avgGain'], categories: ['passing'] },
                { key: 'passYds', label: 'PASS YDS', keys: ['passingYards', 'passYards', 'netPassingYards'], categories: ['passing'] },
                { key: 'passTd', label: 'PASS TD', keys: ['passingTouchdowns', 'passTD', 'passTd'], categories: ['passing'] },
                { key: 'int', label: 'INT', keys: ['interceptions', 'INT'], categories: ['passing'] },
                { key: 'qbr', label: 'QBR', keys: ['ESPNQBRating', 'QBRating', 'passerRating', 'rating'], categories: ['passing'] },
                { key: 'rushAtt', label: 'RUSH ATT', keys: ['rushingAttempts', 'rushAtt'], categories: ['rushing'] },
                { key: 'rushYds', label: 'RUSH YDS', keys: ['rushingYards', 'rushYds'], categories: ['rushing'] },
                { key: 'ypc', label: 'YPC', keys: ['yardsPerRushAttempt', 'avgGain'], categories: ['rushing'] },
                { key: 'rushTd', label: 'RUSH TD', keys: ['rushingTouchdowns', 'rushTd'], categories: ['rushing'] },
                { key: 'targets', label: 'TGT', keys: ['receivingTargets', 'targets'], categories: ['receiving'] },
                { key: 'rec', label: 'REC', keys: ['receptions', 'rec'], categories: ['receiving'] },
                { key: 'recYds', label: 'REC YDS', keys: ['receivingYards', 'recYds'], categories: ['receiving'] },
                { key: 'ypr', label: 'Y/REC', keys: ['yardsPerReception', 'avgGain'], categories: ['receiving'] },
                { key: 'recTd', label: 'REC TD', keys: ['receivingTouchdowns', 'recTd'], categories: ['receiving'] },
                { key: 'tackles', label: 'TCK', keys: ['totalTackles', 'tackles', 'TOT'], categories: ['defensive'] },
                { key: 'tfl', label: 'TFL', keys: ['tacklesForLoss', 'TFL'], categories: ['defensive'] },
                { key: 'sacks', label: 'SACK', keys: ['sacks', 'SACK'], categories: ['defensive'] },
                { key: 'pd', label: 'PD', keys: ['passesDefended', 'PD'], categories: ['defensive'] },
                { key: 'ff', label: 'FF', keys: ['fumblesForced', 'FF'], categories: ['defensive'] },
                { key: 'fr', label: 'FR', keys: ['fumblesRecovered', 'FR'], categories: ['defensive'] },
                { key: 'defInt', label: 'DEF INT', keys: ['interceptions', 'INT'], categories: ['defensiveInterceptions', 'defensive'] }
            ]
        }
    },
    nba: {
        standard: {
            statCategories: ['offensive', 'defensive', 'general'],
            columns: [
                { key: 'g', label: 'G', keys: ['gamesPlayed', 'GP'], categories: ['general'] },
                { key: 'min', label: 'MIN', keys: ['avgMinutes', 'minutes', 'MIN'], categories: ['general'] },
                { key: 'pts', label: 'PTS', keys: ['avgPoints', 'points', 'PTS'], categories: ['offensive'] },
                { key: 'reb', label: 'REB', keys: ['avgRebounds', 'rebounds', 'REB'], categories: ['general'] },
                { key: 'ast', label: 'AST', keys: ['avgAssists', 'assists', 'AST'], categories: ['offensive'] },
                { key: 'stl', label: 'STL', keys: ['avgSteals', 'steals', 'STL'], categories: ['defensive'] },
                { key: 'blk', label: 'BLK', keys: ['avgBlocks', 'blocks', 'BLK'], categories: ['defensive'] },
                { key: 'fgp', label: 'FG%', keys: ['fieldGoalPct', 'FG%'], categories: ['offensive'] },
                { key: 'tpp', label: '3P%', keys: ['threePointPct', 'threePointFieldGoalPct', '3P%'], categories: ['offensive'] },
                { key: 'ftp', label: 'FT%', keys: ['freeThrowPct', 'FT%'], categories: ['offensive'] },
                { key: 'tov', label: 'TOV', keys: ['avgTurnovers', 'turnovers', 'TOV'], categories: ['offensive'] }
            ]
        },
        expanded: {
            statCategories: ['offensive', 'defensive', 'general'],
            columns: [
                { key: 'g', label: 'G', keys: ['gamesPlayed', 'GP'], categories: ['general'] },
                { key: 'min', label: 'MIN', keys: ['minutes', 'MIN'], categories: ['general'] },
                { key: 'pts', label: 'PTS', keys: ['points', 'PTS'], categories: ['offensive'] },
                { key: 'reb', label: 'REB', keys: ['rebounds', 'REB'], categories: ['general'] },
                { key: 'oreb', label: 'OREB', keys: ['offensiveRebounds', 'OREB'], categories: ['offensive'] },
                { key: 'dreb', label: 'DREB', keys: ['defensiveRebounds', 'DREB'], categories: ['defensive'] },
                { key: 'ast', label: 'AST', keys: ['assists', 'AST'], categories: ['offensive'] },
                { key: 'stl', label: 'STL', keys: ['steals', 'STL'], categories: ['defensive'] },
                { key: 'blk', label: 'BLK', keys: ['blocks', 'BLK'], categories: ['defensive'] },
                { key: 'tov', label: 'TOV', keys: ['turnovers', 'TOV'], categories: ['offensive'] },
                { key: 'fgm', label: 'FGM', keys: ['fieldGoalsMade', 'FGM'], categories: ['offensive'] },
                { key: 'fga', label: 'FGA', keys: ['fieldGoalsAttempted', 'FGA'], categories: ['offensive'] },
                { key: 'fgp', label: 'FG%', keys: ['fieldGoalPct', 'FG%'], categories: ['offensive'] },
                { key: 'tpm', label: '3PM', keys: ['threePointFieldGoalsMade', '3PM'], categories: ['offensive'] },
                { key: 'tpa', label: '3PA', keys: ['threePointFieldGoalsAttempted', '3PA'], categories: ['offensive'] },
                { key: 'tpp', label: '3P%', keys: ['threePointPct', 'threePointFieldGoalPct', '3P%'], categories: ['offensive'] },
                { key: 'ftm', label: 'FTM', keys: ['freeThrowsMade', 'FTM'], categories: ['offensive'] },
                { key: 'fta', label: 'FTA', keys: ['freeThrowsAttempted', 'FTA'], categories: ['offensive'] },
                { key: 'ftp', label: 'FT%', keys: ['freeThrowPct', 'FT%'], categories: ['offensive'] },
                { key: 'per', label: 'PER', keys: ['PER'], categories: ['general'] },
                { key: 'pm', label: '+/-', keys: ['plusMinus'], categories: ['general'] }
            ]
        }
    },
    mlb: {
        hitting: {
            standard: {
                statCategories: ['batting'],
                columns: [
                    { key: 'g', label: 'G', keys: ['teamGamesPlayed', 'gamesPlayed', 'G', 'GP'] },
                    { key: 'ab', label: 'AB', keys: ['atBats', 'AB'] },
                    { key: 'r', label: 'R', keys: ['runs', 'R'] },
                    { key: 'h', label: 'H', keys: ['hits', 'H'] },
                    { key: '2b', label: '2B', keys: ['doubles', '2B'] },
                    { key: '3b', label: '3B', keys: ['triples', '3B'] },
                    { key: 'hr', label: 'HR', keys: ['homeRuns', 'HR'] },
                    { key: 'rbi', label: 'RBI', keys: ['RBIs', 'RBI'] },
                    { key: 'bb', label: 'BB', keys: ['walks', 'BB'] },
                    { key: 'so', label: 'SO', keys: ['strikeouts', 'SO', 'K'] },
                    { key: 'sb', label: 'SB', keys: ['stolenBases', 'SB'] },
                    { key: 'cs', label: 'CS', keys: ['caughtStealing', 'CS'] },
                    { key: 'avg', label: 'AVG', keys: ['avg', 'battingAverage', 'AVG'] },
                    { key: 'obp', label: 'OBP', keys: ['onBasePct', 'onBasePercentage', 'OBP'] },
                    { key: 'slg', label: 'SLG', keys: ['slugAvg', 'sluggingPercentage', 'SLG'] },
                    { key: 'ops', label: 'OPS', keys: ['OPS', 'onBasePlusSlugging'] }
                ]
            },
            expanded: {
                statCategories: ['batting'],
                columns: [
                    { key: 'g', label: 'G', keys: ['teamGamesPlayed', 'gamesPlayed', 'G', 'GP'] },
                    { key: 'ab', label: 'AB', keys: ['atBats', 'AB'] },
                    { key: 'r', label: 'R', keys: ['runs', 'R'] },
                    { key: 'h', label: 'H', keys: ['hits', 'H'] },
                    { key: '2b', label: '2B', keys: ['doubles', '2B'] },
                    { key: '3b', label: '3B', keys: ['triples', '3B'] },
                    { key: 'hr', label: 'HR', keys: ['homeRuns', 'HR'] },
                    { key: 'rbi', label: 'RBI', keys: ['RBIs', 'RBI'] },
                    { key: 'tb', label: 'TB', keys: ['totalBases', 'TB'] },
                    { key: 'bb', label: 'BB', keys: ['walks', 'BB'] },
                    { key: 'so', label: 'SO', keys: ['strikeouts', 'SO', 'K'] },
                    { key: 'hbp', label: 'HBP', keys: ['hitByPitch', 'HBP'] },
                    { key: 'ibb', label: 'IBB', keys: ['intentionalWalks', 'IBB'] },
                    { key: 'sb', label: 'SB', keys: ['stolenBases', 'SB'] },
                    { key: 'cs', label: 'CS', keys: ['caughtStealing', 'CS'] },
                    { key: 'avg', label: 'AVG', keys: ['avg', 'battingAverage', 'AVG'] },
                    { key: 'obp', label: 'OBP', keys: ['onBasePct', 'onBasePercentage', 'OBP'] },
                    { key: 'slg', label: 'SLG', keys: ['slugAvg', 'sluggingPercentage', 'SLG'] },
                    { key: 'ops', label: 'OPS', keys: ['OPS', 'onBasePlusSlugging'] },
                    { key: 'sf', label: 'SF', keys: ['sacrificeFlies', 'SF'] },
                    { key: 'sh', label: 'SH', keys: ['sacrificeHits', 'SH'] },
                    { key: 'gidp', label: 'GIDP', keys: ['groundIntoDoublePlay', 'GIDP'] }
                ]
            }
        },
        pitching: {
            standard: {
                statCategories: ['pitching'],
                columns: [
                    { key: 'g', label: 'G', keys: ['gamesPlayed', 'GP', 'G'] },
                    { key: 'gs', label: 'GS', keys: ['gamesStarted', 'GS'] },
                    { key: 'ip', label: 'IP', keys: ['innings', 'IP'] },
                    { key: 'w', label: 'W', keys: ['wins', 'W'] },
                    { key: 'l', label: 'L', keys: ['losses', 'L'] },
                    { key: 'sv', label: 'SV', keys: ['saves', 'SV'] },
                    { key: 'so', label: 'SO', keys: ['strikeouts', 'SO', 'K'] },
                    { key: 'bb', label: 'BB', keys: ['walks', 'BB'] },
                    { key: 'era', label: 'ERA', keys: ['ERA', 'earnedRunAverage'] },
                    { key: 'whip', label: 'WHIP', keys: ['WHIP', 'walksHitsPerInningPitched'] }
                ]
            },
            expanded: {
                statCategories: ['pitching'],
                columns: [
                    { key: 'g', label: 'G', keys: ['gamesPlayed', 'GP', 'G'] },
                    { key: 'gs', label: 'GS', keys: ['gamesStarted', 'GS'] },
                    { key: 'ip', label: 'IP', keys: ['innings', 'IP'] },
                    { key: 'w', label: 'W', keys: ['wins', 'W'] },
                    { key: 'l', label: 'L', keys: ['losses', 'L'] },
                    { key: 'sv', label: 'SV', keys: ['saves', 'SV'] },
                    { key: 'hld', label: 'HLD', keys: ['holds', 'HLD'] },
                    { key: 'bs', label: 'BS', keys: ['blownSaves', 'BS'] },
                    { key: 'so', label: 'SO', keys: ['strikeouts', 'SO', 'K'] },
                    { key: 'bb', label: 'BB', keys: ['walks', 'BB'] },
                    { key: 'h', label: 'H', keys: ['hits', 'H'] },
                    { key: 'er', label: 'ER', keys: ['earnedRuns', 'ER'] },
                    { key: 'hr', label: 'HR', keys: ['homeRuns', 'HR'] },
                    { key: 'era', label: 'ERA', keys: ['ERA', 'earnedRunAverage'] },
                    { key: 'whip', label: 'WHIP', keys: ['WHIP', 'walksHitsPerInningPitched'] },
                    { key: 'svo', label: 'SVO', keys: ['saveOpportunities', 'SVO'] },
                    { key: 'bf', label: 'BF', keys: ['battersFaced', 'BF'] },
                    { key: 'pitches', label: 'PIT', keys: ['pitches', 'P'] },
                    { key: 'cg', label: 'CG', keys: ['completeGames', 'CG'] },
                    { key: 'sho', label: 'SHO', keys: ['shutouts', 'SHO'] },
                    { key: 'wpct', label: 'WPCT', keys: ['winPct', 'W%'] }
                ]
            }
        }
    },
    nhl: {
        standard: {
            statCategories: ['offensive', 'defensive', 'general', 'penalties'],
            columns: [
                { key: 'gp', label: 'GP', keys: ['gamesPlayed', 'GP'], categories: ['general'] },
                { key: 'g', label: 'G', keys: ['goals', 'G'], categories: ['offensive'] },
                { key: 'a', label: 'A', keys: ['assists', 'A'], categories: ['offensive'] },
                { key: 'pts', label: 'PTS', keys: ['points', 'PTS'], categories: ['offensive'] },
                { key: 's', label: 'S', keys: ['shotsTotal', 'S'], categories: ['offensive'] },
                { key: 'pm', label: '+/-', keys: ['plusMinus'], categories: ['general'] },
                { key: 'pim', label: 'PIM', keys: ['penaltyMinutes', 'PIM'], categories: ['penalties'] },
                { key: 'ppg', label: 'PPG', keys: ['powerPlayGoals', 'PPG'], categories: ['offensive'] },
                { key: 'shg', label: 'SHG', keys: ['shortHandedGoals', 'SHG'], categories: ['offensive'] },
                { key: 'toi', label: 'TOI/G', keys: ['timeOnIcePerGame', 'TOI'], categories: ['general'] },
                { key: 'w', label: 'W', keys: ['wins', 'W'], categories: ['general'] },
                { key: 'l', label: 'L', keys: ['losses', 'L'], categories: ['general'] },
                { key: 'sv', label: 'SV', keys: ['saves', 'SV'], categories: ['defensive'] },
                { key: 'svp', label: 'SV%', keys: ['savePct', 'SV%'], categories: ['defensive'] },
                { key: 'gaa', label: 'GAA', keys: ['avgGoalsAgainst', 'goalsAgainstAvg', 'GAA'], categories: ['defensive'] },
                { key: 'so', label: 'SO', keys: ['shutouts', 'SO'], categories: ['defensive'] }
            ]
        },
        expanded: {
            statCategories: ['offensive', 'defensive', 'general', 'penalties'],
            columns: [
                { key: 'gp', label: 'GP', keys: ['gamesPlayed', 'GP'], categories: ['general'] },
                { key: 'g', label: 'G', keys: ['goals', 'G'], categories: ['offensive'] },
                { key: 'a', label: 'A', keys: ['assists', 'A'], categories: ['offensive'] },
                { key: 'pts', label: 'PTS', keys: ['points', 'PTS'], categories: ['offensive'] },
                { key: 'ppg', label: 'PPG', keys: ['powerPlayGoals', 'PPG'], categories: ['offensive'] },
                { key: 'shg', label: 'SHG', keys: ['shortHandedGoals', 'SHG'], categories: ['offensive'] },
                { key: 's', label: 'S', keys: ['shotsTotal', 'S'], categories: ['offensive'] },
                { key: 'sPct', label: 'S%', keys: ['shootingPct', 'S%'], categories: ['offensive'] },
                { key: 'pm', label: '+/-', keys: ['plusMinus'], categories: ['general'] },
                { key: 'pim', label: 'PIM', keys: ['penaltyMinutes', 'PIM'], categories: ['penalties'] },
                { key: 'toi', label: 'TOI/G', keys: ['timeOnIcePerGame', 'TOI'], categories: ['general'] },
                { key: 'w', label: 'W', keys: ['wins', 'W'], categories: ['general'] },
                { key: 'l', label: 'L', keys: ['losses', 'L'], categories: ['general'] },
                { key: 'ot', label: 'OTL', keys: ['otLosses', 'OT'], categories: ['general'] },
                { key: 'sv', label: 'SV', keys: ['saves', 'SV'], categories: ['defensive'] },
                { key: 'sa', label: 'SA', keys: ['shotsAgainst', 'SA'], categories: ['defensive'] },
                { key: 'svp', label: 'SV%', keys: ['savePct', 'SV%'], categories: ['defensive'] },
                { key: 'gaa', label: 'GAA', keys: ['avgGoalsAgainst', 'goalsAgainstAvg', 'GAA'], categories: ['defensive'] },
                { key: 'ga', label: 'GA', keys: ['goalsAgainst', 'GA'], categories: ['defensive'] },
                { key: 'so', label: 'SO', keys: ['shutouts', 'SO'], categories: ['defensive'] }
            ]
        }
    }
};

const normalizeStatKey = value => String(value || '').trim().toLowerCase();

const buildStatKeySet = values => new Set((values || []).map(normalizeStatKey).filter(Boolean));

const extractStatValueFromCategories = (categories, column, fallbackCategories) => {
    if (!Array.isArray(categories) || !column) return null;
    const keys = buildStatKeySet(column.keys || []);
    if (!keys.size) return null;

    const categoryMap = new Map(
        categories
            .filter(category => category?.name)
            .map(category => [normalizeStatKey(category.name), category])
    );

    const desired = (column.categories || fallbackCategories || [])
        .map(normalizeStatKey)
        .filter(Boolean);

    const searchCategories = desired.length
        ? desired.map(name => categoryMap.get(name)).filter(Boolean)
        : categories;

    const findIn = list => {
        for (const category of list) {
            const stats = category?.stats || [];
            for (const stat of stats) {
                const nameKey = normalizeStatKey(stat?.name);
                const abbrKey = normalizeStatKey(stat?.abbreviation);
                const displayKey = normalizeStatKey(stat?.displayName);
                const shortKey = normalizeStatKey(stat?.shortDisplayName);
                if (keys.has(nameKey) || keys.has(abbrKey) || keys.has(displayKey) || keys.has(shortKey)) {
                    return stat.displayValue ?? stat.value ?? null;
                }
            }
        }
        return null;
    };

    let value = findIn(searchCategories);
    if (value !== null && value !== undefined) return value;
    if (searchCategories !== categories) {
        value = findIn(categories);
    }
    return value ?? null;
};

const mapWithConcurrency = async (items, limit, task) => {
    const results = new Array(items.length);
    let index = 0;
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (index < items.length) {
            const current = index;
            index += 1;
            results[current] = await task(items[current], current);
        }
    });
    await Promise.all(workers);
    return results;
};

const resolvePlayerTableSchema = (league, mode, view) => {
    const viewKey = view === 'expanded' ? 'expanded' : DEFAULT_PLAYER_TABLE_VIEW;
    if (league === 'mlb') {
        const modeKey = mode === 'pitching' ? 'pitching' : DEFAULT_PLAYER_STATS_MODE;
        const leagueSchema = PLAYER_TABLE_SCHEMAS.mlb || {};
        const modeSchema = leagueSchema[modeKey] || {};
        return modeSchema[viewKey] || modeSchema[DEFAULT_PLAYER_TABLE_VIEW];
    }
    const leagueSchema = PLAYER_TABLE_SCHEMAS[league] || {};
    return leagueSchema[viewKey] || leagueSchema[DEFAULT_PLAYER_TABLE_VIEW];
};

const getTeamList = async league => {
    const cacheKey = league;
    const now = Date.now();
    const cached = teamCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < TEAM_CACHE_TTL_MS) {
        return cached.teams;
    }

    const endpoint = ESPN_TEAM_ENDPOINTS[league];
    if (!endpoint) {
        throw new Error('Unsupported league');
    }
    const payload = await fetchJson(endpoint);
    const teams = parseEspnTeams(payload);
    teamCache.set(cacheKey, {
        teams,
        timestamp: Date.now()
    });
    return teams;
};

const buildRosterUrl = (league, teamId, seasonYear) => {
    const sport = SITE_SPORTS[league];
    const base = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${teamId}/roster`;
    if (seasonYear) {
        return `${base}?season=${seasonYear}`;
    }
    return base;
};

const resolveSeasonYear = async (league, seasonValue) => {
    if (seasonValue && /^\d{4}$/.test(seasonValue)) {
        return seasonValue;
    }
    const cached = seasonCache.get(league);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < SEASON_CACHE_TTL_MS) {
        return cached.year;
    }

    try {
        const teams = await getTeamList(league);
        const sampleTeam = teams[0];
        if (sampleTeam?.id) {
            const roster = await fetchJson(buildRosterUrl(league, sampleTeam.id, null));
            const year = roster?.season?.year ? String(roster.season.year) : null;
            if (year) {
                seasonCache.set(league, { year, timestamp: Date.now() });
                return year;
            }
        }
    } catch (error) {
        // fall through to current year
    }

    const fallback = String(new Date().getFullYear());
    seasonCache.set(league, { year: fallback, timestamp: Date.now() });
    return fallback;
};

const buildRosterIndex = async (league, seasonYear) => {
    const teams = await getTeamList(league);
    const playersById = new Map();

    const fetchRoster = async team => {
        const roster = await fetchJson(buildRosterUrl(league, team.id, seasonYear));
        const teamInfo = {
            id: roster?.team?.id || team.id,
            abbreviation: roster?.team?.abbreviation || team.abbreviation,
            displayName: roster?.team?.displayName || team.name
        };
        const groups = roster?.athletes || [];
        groups.forEach(group => {
            (group?.items || []).forEach(item => {
                const athleteId = item?.id;
                if (!athleteId) return;
                if (playersById.has(athleteId)) return;
                const position = item?.position?.abbreviation
                    || item?.position?.shortName
                    || item?.position?.name
                    || null;
                const headshot = item?.headshot?.href || item?.headshot || null;
                const displayName = item?.displayName || item?.fullName || item?.shortName || 'Unknown';
                const shortName = item?.shortName || displayName;
                playersById.set(athleteId, {
                    id: String(athleteId),
                    displayName,
                    shortName,
                    headshot,
                    position: position ? String(position).toUpperCase() : null,
                    team: teamInfo
                });
            });
        });
    };

    await mapWithConcurrency(teams, FETCH_CONCURRENCY, fetchRoster);

    const players = Array.from(playersById.values()).sort((a, b) => {
        const nameCompare = (a.displayName || '').localeCompare(b.displayName || '');
        if (nameCompare !== 0) return nameCompare;
        return String(a.id).localeCompare(String(b.id));
    });

    return {
        players,
        source: {
            teams: ESPN_TEAM_ENDPOINTS[league]
        }
    };
};

const getRosterIndex = async (league, seasonYear) => {
    const cacheKey = `${league}:${seasonYear}`;
    const now = Date.now();
    const cached = indexCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < INDEX_CACHE_TTL_MS) {
        return { index: cached.index, cacheAgeSec: Math.floor((now - cached.timestamp) / 1000), stale: false, fromCache: true };
    }

    try {
        const index = await buildRosterIndex(league, seasonYear);
        indexCache.set(cacheKey, { index, timestamp: Date.now() });
        return { index, cacheAgeSec: 0, stale: false, fromCache: false };
    } catch (error) {
        if (cached) {
            return {
                index: cached.index,
                cacheAgeSec: Math.floor((now - cached.timestamp) / 1000),
                stale: true,
                fromCache: true,
                error
            };
        }
        throw error;
    }
};

const fetchAthleteStats = async (league, seasonYear, athleteId) => {
    if (!athleteId) return null;
    const cacheKey = `${league}:${seasonYear}:${athleteId}`;
    const now = Date.now();
    const cached = statsCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < STATS_CACHE_TTL_MS) {
        return cached.payload;
    }
    const sport = SITE_SPORTS[league];
    const url = `${CORE_API_BASE}/${sport}/leagues/${league}/seasons/${seasonYear}/types/2/athletes/${athleteId}/statistics`;
    try {
        const payload = await fetchJson(url);
        statsCache.set(cacheKey, { payload, timestamp: Date.now() });
        return payload;
    } catch (error) {
        if (error?.status === 404) {
            return null;
        }
        throw error;
    }
};

module.exports = async (req, res) => {
    const league = (req.query.league || 'nfl').toString().toLowerCase();
    const seasonValue = req.query.season ? req.query.season.toString() : 'current';
    const viewValue = (req.query.view || DEFAULT_PLAYER_TABLE_VIEW).toString().toLowerCase();
    const modeValue = (req.query.mode || DEFAULT_PLAYER_STATS_MODE).toString().toLowerCase();
    const positionValue = (req.query.position || 'all').toString();
    const pageValue = parseInt(req.query.page || '1', 10);
    const perPageValue = parseInt(req.query.perPage || '50', 10);

    if (!SITE_SPORTS[league]) {
        res.status(400).json({
            error: 'unsupported_league',
            message: 'Player stats are only available for NFL, NBA, MLB, and NHL.'
        });
        return;
    }

    const perPage = Number.isFinite(perPageValue) ? Math.min(Math.max(perPageValue, 10), 200) : 50;
    const requestedPage = Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1;
    const view = viewValue === 'expanded' ? 'expanded' : DEFAULT_PLAYER_TABLE_VIEW;
    const mode = modeValue === 'pitching' ? 'pitching' : DEFAULT_PLAYER_STATS_MODE;
    const positionFilter = positionValue.trim() || 'all';

    const schema = resolvePlayerTableSchema(league, mode, view);
    if (!schema) {
        res.status(400).json({
            error: 'unsupported_view',
            message: 'Player stats are unavailable for the requested view.'
        });
        return;
    }

    try {
        const seasonYear = await resolveSeasonYear(league, seasonValue);
        const { index, cacheAgeSec, stale, fromCache } = await getRosterIndex(league, seasonYear);
        const players = index.players || [];

        let filtered = players;
        if (league === 'mlb') {
            if (mode === 'pitching') {
                filtered = filtered.filter(player => MLB_PITCHER_POSITIONS.has(player.position));
            } else {
                filtered = filtered.filter(player => !MLB_PITCHER_POSITIONS.has(player.position));
            }
        }

        if (positionFilter.toLowerCase() !== 'all') {
            const target = positionFilter.toUpperCase();
            filtered = filtered.filter(player => player.position === target);
        }

        const total = filtered.length;
        const pageCount = Math.max(1, Math.ceil(total / perPage));
        const page = Math.min(requestedPage, pageCount);
        const start = (page - 1) * perPage;
        const pagePlayers = filtered.slice(start, start + perPage);
        const startRank = start + 1;

        const rows = await mapWithConcurrency(pagePlayers, FETCH_CONCURRENCY, async (player, idx) => {
            let categories = [];
            try {
                const statsPayload = await fetchAthleteStats(league, seasonYear, player.id);
                categories = statsPayload?.splits?.categories || [];
            } catch (error) {
                categories = [];
            }
            const rowStats = {};
            (schema.columns || []).forEach(column => {
                if (!column.key) return;
                rowStats[column.key] = extractStatValueFromCategories(
                    categories,
                    column,
                    schema.statCategories
                );
            });
            return {
                rank: startRank + idx,
                athlete: {
                    id: player.id,
                    displayName: player.displayName,
                    shortName: player.shortName,
                    headshot: player.headshot,
                    position: player.position
                },
                team: {
                    id: player.team?.id || null,
                    abbreviation: player.team?.abbreviation || null,
                    displayName: player.team?.displayName || null
                },
                stats: rowStats
            };
        });

        res.status(200).json({
            league,
            season: seasonYear,
            view,
            mode: league === 'mlb' ? mode : null,
            position: positionFilter,
            page,
            perPage,
            total,
            table: {
                columns: (schema.columns || []).map(column => ({
                    key: column.key,
                    label: column.label
                })),
                rows
            },
            meta: {
                source: index.source,
                cacheAgeSec,
                stale,
                fromCache
            }
        });
    } catch (error) {
        res.status(502).json({
            error: 'players_unavailable',
            message: error.message
        });
    }
};
