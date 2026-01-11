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
            const isInput = document.activeElement.tagName === 'INPUT' || 
                           document.activeElement.tagName === 'TEXTAREA';
            const shortcutsOverlay = document.getElementById('shortcuts-overlay');
            const settingsModal = document.getElementById('settings-modal');
            
            // ESC to close overlays or exit fullscreen
            if (e.key === 'Escape') {
                if (shortcutsOverlay?.classList.contains('is-open')) {
                    this.toggleShortcuts(false);
                    return;
                }
                if (settingsModal?.classList.contains('is-open')) {
                    UI.toggleSettings(false);
                    return;
                }
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                }
                return;
            }
            
            // Skip other shortcuts if in input
            if (isInput) return;
            
            // ? or Shift+/ to show shortcuts
            if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
                e.preventDefault();
                this.toggleShortcuts();
                return;
            }

            // / to go home
            if (e.key === '/') {
                e.preventDefault();
                Router.navigate('/');
                return;
            }
            
            // m for multi-view
            if (e.key === 'm' || e.key === 'M') {
                e.preventDefault();
                Router.navigate('/multi');
                return;
            }
            
            // s for standings
            if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                Router.navigate('/standings');
                return;
            }
            
            // , for settings
            if (e.key === ',') {
                e.preventDefault();
                UI.toggleSettings(true);
                return;
            }
            
            // r for refresh
            if (e.key === 'r' || e.key === 'R') {
                e.preventDefault();
                const refreshBtn = document.getElementById('refresh-btn');
                if (refreshBtn) refreshBtn.click();
                return;
            }
            
            // f for fullscreen (on watch page)
            if (e.key === 'f' || e.key === 'F') {
                const videoContainer = document.querySelector('.embed-container');
                if (videoContainer) {
                    e.preventDefault();
                    if (document.fullscreenElement) {
                        document.exitFullscreen();
                    } else {
                        videoContainer.requestFullscreen();
                    }
                }
                return;
            }
            
            // ] for next stream
            if (e.key === ']') {
                const activeBtn = document.querySelector('.stream-btn.active');
                const nextBtn = activeBtn?.nextElementSibling;
                if (nextBtn?.classList.contains('stream-btn')) {
                    e.preventDefault();
                    nextBtn.click();
                }
                return;
            }
            
            // [ for previous stream
            if (e.key === '[') {
                const activeBtn = document.querySelector('.stream-btn.active');
                const prevBtn = activeBtn?.previousElementSibling;
                if (prevBtn?.classList.contains('stream-btn')) {
                    e.preventDefault();
                    prevBtn.click();
                }
                return;
            }
        });
        
        // Setup shortcuts overlay
        this.setupShortcutsOverlay();

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
    },
    
    setupShortcutsOverlay() {
        const overlay = document.getElementById('shortcuts-overlay');
        const hint = document.getElementById('shortcuts-hint');
        if (!overlay) return;
        
        const closeBtn = overlay.querySelector('.shortcuts-overlay__close');
        const backdrop = overlay.querySelector('.shortcuts-overlay__backdrop');
        
        closeBtn?.addEventListener('click', () => this.toggleShortcuts(false));
        backdrop?.addEventListener('click', () => this.toggleShortcuts(false));
        hint?.addEventListener('click', () => this.toggleShortcuts(true));
    },
    
    toggleShortcuts(show) {
        const overlay = document.getElementById('shortcuts-overlay');
        const hint = document.getElementById('shortcuts-hint');
        if (!overlay) return;
        
        const isOpen = overlay.classList.contains('is-open');
        const shouldShow = show !== undefined ? show : !isOpen;
        
        if (shouldShow) {
            overlay.classList.add('is-open');
            overlay.setAttribute('aria-hidden', 'false');
            document.body.classList.add('shortcuts-open');
            if (hint) hint.style.display = 'none';
        } else {
            overlay.classList.remove('is-open');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('shortcuts-open');
        }
    }
};

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
} else {
    App.init();
}
