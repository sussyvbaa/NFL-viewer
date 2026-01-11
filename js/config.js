/**
 * Configuration Module
 *
 * Central configuration for the Sports Viewer application.
 * Modify these settings to customize behavior or add support for other leagues.
 *
 * EXTENDING TO OTHER LEAGUES:
 * 1. Add a new league object to LEAGUE_CONFIGS
 * 2. Define the embed base URL pattern for that league
 * 3. Add teams data in teams.js
 * 4. The rest of the application will work automatically
 */

const resolveApiBaseUrl = () => {
    const fallback = '/api';
    if (typeof window === 'undefined') {
        return fallback;
    }
    try {
        const stored = window.localStorage.getItem('nfl_viewer_api_base');
        if (stored) {
            return stored;
        }
    } catch (error) {
        // Ignore storage access errors.
    }
    return fallback;
};

const Config = {
    // Default league for manual actions
    DEFAULT_LEAGUE: 'nfl',

    // Supported leagues
    SUPPORTED_LEAGUES: ['nfl', 'nba', 'mlb', 'nhl'],

    // Leagues with standings support
    AMERICAN_LEAGUES: ['nfl', 'nba', 'mlb', 'nhl'],

    // Backend API base URL
    API_BASE_URL: resolveApiBaseUrl(),

    // Hours after kickoff to treat a game as ended when no live signal exists
    GAME_END_GRACE_HOURS: 6,

    // League-specific configurations
    LEAGUE_CONFIGS: {
        nfl: {
            name: 'NFL',
            fullName: 'National Football League',
            // Base URL for embedding streams
            // The full URL pattern is: {EMBED_BASE_URL}/{game-slug}/{stream-id}
            EMBED_BASE_URL: 'https://embedsports.top/embed/admin',
            // Default slug prefix (some streams use 'ppv-' prefix)
            SLUG_PREFIX: 'ppv-',
            // Number of alternate streams to try
            MAX_STREAMS: 5,
            // Storage key for saved games
            STORAGE_KEY: 'nfl_games'
        },
        nba: {
            name: 'NBA',
            fullName: 'National Basketball Association',
            EMBED_BASE_URL: 'https://embedsports.top/embed/admin',
            SLUG_PREFIX: 'ppv-',
            MAX_STREAMS: 5,
            STORAGE_KEY: 'nba_games'
        },
        mlb: {
            name: 'MLB',
            fullName: 'Major League Baseball',
            EMBED_BASE_URL: 'https://embedsports.top/embed/admin',
            SLUG_PREFIX: 'ppv-',
            MAX_STREAMS: 5,
            STORAGE_KEY: 'mlb_games'
        },
        nhl: {
            name: 'NHL',
            fullName: 'National Hockey League',
            EMBED_BASE_URL: 'https://embedsports.top/embed/admin',
            SLUG_PREFIX: 'ppv-',
            MAX_STREAMS: 5,
            STORAGE_KEY: 'nhl_games'
        }
        // Example: Adding NBA support
        // nba: {
        //     name: 'NBA',
        //     fullName: 'National Basketball Association',
        //     EMBED_BASE_URL: 'https://embedsports.top/embed/admin',
        //     SLUG_PREFIX: 'ppv-',
        //     MAX_STREAMS: 5,
        //     STORAGE_KEY: 'nba_games'
        // }
    },

    // Get current league config
    getLeagueConfig(league = null) {
        const key = league || this.DEFAULT_LEAGUE;
        return this.LEAGUE_CONFIGS[key] || this.LEAGUE_CONFIGS[this.DEFAULT_LEAGUE];
    },

    // NOTE: Sandbox attribute is NOT used because embedsports.top
    // requires unrestricted iframe access to function properly.
    // Security is maintained through URL validation and CSP headers.

    // Referrer policy for iframes
    IFRAME_REFERRER_POLICY: 'no-referrer-when-downgrade',

    // Timeout for embed loading (ms)
    EMBED_LOAD_TIMEOUT: 15000,

    // Maximum games in multi-view
    MULTI_VIEW_MAX: 4,

    // Local storage keys
    STORAGE: {
        GAMES: 'nfl_viewer_games',
        SETTINGS: 'nfl_viewer_settings',
        MULTI_VIEW: 'nfl_viewer_multiview'
    }
};

// Freeze config to prevent accidental modifications
Object.freeze(Config);
Object.freeze(Config.LEAGUE_CONFIGS);
