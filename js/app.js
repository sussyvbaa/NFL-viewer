/**
 * Sports Viewer - Main Application
 *
 * This is the entry point that initializes all modules and sets up routing.
 *
 * Architecture Overview:
 * - Config: Application configuration and settings
 * - Teams: Team data for display and slug generation
 * - Embed: URL construction and iframe security
 * - Storage: LocalStorage persistence for game data
 * - Router: Hash-based client-side routing
 * - UI: Component rendering and user interactions
 *
 * EXTENDING THE APPLICATION:
 *
 * Adding support for other leagues (MLB, NHL, etc.):
 * 1. Add league config to Config.LEAGUE_CONFIGS (js/config.js)
 * 2. Create team data entries in js/teams.js
 * 3. Add the embed domain to EmbedUtil.ALLOWED_DOMAINS (js/embed.js)
 * 4. Update UI to allow league selection (optional)
 *
 * Adding new features:
 * 1. Game scheduling: Add integration with sports API for automatic game population
 * 2. Favorites: Add a favorites system using localStorage
 * 3. Notifications: Add browser notifications for game start times
 * 4. Standings: Extend standings view with playoffs or conference splits
 */

const App = {
    /**
     * Initialize the application
     */
    init() {
        console.log('Sports Viewer initializing...');

        // Initialize modules
        UI.init();

        // Set up routes
        this.setupRoutes();

        // Set up global event listeners
        this.setupEventListeners();

        // Initialize router (triggers initial route)
        Router.init();

        console.log('Sports Viewer ready.');
    },

    /**
     * Set up application routes
     */
    setupRoutes() {
        // Home / Games List
        Router.register('/', () => {
            UI.renderGamesList();
            UI.updateNavActiveState();
        });

        // Watch Game
        // Supports both:
        // - /watch/ppv-team1-vs-team2 (full slug with prefix)
        // - /watch/team1-vs-team2 (slug without prefix)
        // - /watch/team1-vs-team2?league=nba
        Router.register('/watch/:slug', (params, query) => {
            UI.renderWatchPage(params.slug, query);
            UI.updateNavActiveState();
        });

        // Multi-View
        Router.register('/multi', () => {
            UI.renderMultiViewPage();
            UI.updateNavActiveState();
        });

        // Standings
        Router.register('/standings', () => {
            UI.renderStandingsPage();
            UI.updateNavActiveState();
        });

        // Add Game
        Router.register('/add', () => {
            UI.renderAddGamePage();
            UI.updateNavActiveState();
        });

        // Handle 404
        document.addEventListener('route:notfound', () => {
            UI.renderNotFound();
        });
    },

    /**
     * Set up global event listeners
     */
    setupEventListeners() {
        // Handle navigation before route change (cleanup)
        Router.setBeforeNavigate((pattern, params) => {
            // Clean up any pending operations
            return true; // Allow navigation
        });

        // Handle keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // ESC to exit fullscreen
            if (e.key === 'Escape' && document.fullscreenElement) {
                document.exitFullscreen();
            }

            // / to go home (if not in input)
            if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
                e.preventDefault();
                Router.navigate('/');
            }
        });

        // Handle clicks on dynamically created elements
        document.addEventListener('click', (e) => {
            // Handle game card clicks (navigate to watch)
            const gameCard = e.target.closest('.game-card');
            if (gameCard && !e.target.closest('button') && !e.target.closest('a')) {
                const gameId = gameCard.dataset.gameId;
                const gameLeague = gameCard.dataset.league || Config.DEFAULT_LEAGUE;
                const game = Storage.getGame(gameId);
                if (game) {
                    Router.navigate(`/watch/${game.slug}?league=${gameLeague}`);
                }
            }
        });
    }
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}
