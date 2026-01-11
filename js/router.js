/**
 * Simple Hash-Based Router
 *
 * Handles client-side routing using URL hash fragments.
 * Routes are defined as patterns that can include parameters.
 *
 * Route Pattern Syntax:
 * - Static: '/games' matches exactly '#/games'
 * - Parameter: '/watch/:slug' matches '#/watch/some-game' with params.slug = 'some-game'
 *
 * Why Hash-Based Routing:
 * - Works without server configuration
 * - Page reloads preserve state
 * - Simple to implement and debug
 */

const Router = {
    routes: [],
    currentRoute: null,
    beforeNavigate: null,

    /**
     * Initialize the router
     */
    init() {
        // Listen for hash changes
        window.addEventListener('hashchange', () => this.handleRoute());

        // Handle initial route
        if (!window.location.hash) {
            window.location.hash = '#/';
        } else {
            this.handleRoute();
        }
    },

    /**
     * Register a route
     * @param {string} pattern - Route pattern (e.g., '/watch/:slug')
     * @param {Function} handler - Handler function(params, query)
     */
    register(pattern, handler) {
        // Convert pattern to regex
        const paramNames = [];
        const regexPattern = pattern
            .replace(/\//g, '\\/')
            .replace(/:([^/]+)/g, (_, name) => {
                paramNames.push(name);
                return '([^/]+)';
            });

        this.routes.push({
            pattern,
            regex: new RegExp(`^${regexPattern}$`),
            paramNames,
            handler
        });
    },

    /**
     * Navigate to a route programmatically
     * @param {string} path - Path to navigate to
     */
    navigate(path) {
        window.location.hash = path.startsWith('#') ? path : `#${path}`;
    },

    /**
     * Handle the current route
     */
    handleRoute() {
        const hash = window.location.hash || '#/';
        const [pathWithQuery] = hash.substring(1).split('?');
        const path = pathWithQuery || '/';

        // Parse query string if present
        const queryString = hash.includes('?') ? hash.split('?')[1] : '';
        const query = this.parseQuery(queryString);

        // Find matching route
        for (const route of this.routes) {
            const match = path.match(route.regex);

            if (match) {
                // Extract parameters
                const params = {};
                route.paramNames.forEach((name, index) => {
                    params[name] = decodeURIComponent(match[index + 1]);
                });

                // Execute before navigate hook if set
                if (this.beforeNavigate) {
                    const shouldContinue = this.beforeNavigate(route.pattern, params);
                    if (shouldContinue === false) return;
                }

                // Update current route
                this.currentRoute = {
                    pattern: route.pattern,
                    path,
                    params,
                    query
                };

                // Call handler
                route.handler(params, query);
                return;
            }
        }

        // No route found - show 404
        this.handle404(path);
    },

    /**
     * Handle 404 (route not found)
     */
    handle404(path) {
        console.warn('Route not found:', path);
        this.currentRoute = { pattern: '404', path, params: {}, query: {} };

        // Emit custom event for 404
        const event = new CustomEvent('route:notfound', { detail: { path } });
        document.dispatchEvent(event);
    },

    /**
     * Parse query string into object
     * @param {string} queryString - Query string without '?'
     * @returns {Object} Parsed query parameters
     */
    parseQuery(queryString) {
        if (!queryString) return {};

        return queryString.split('&').reduce((acc, pair) => {
            const [key, value] = pair.split('=');
            if (key) {
                acc[decodeURIComponent(key)] = value ?
                    decodeURIComponent(value) : '';
            }
            return acc;
        }, {});
    },

    /**
     * Get the current path
     * @returns {string} Current path
     */
    getCurrentPath() {
        return this.currentRoute?.path || '/';
    },

    /**
     * Check if current route matches a pattern
     * @param {string} pattern - Route pattern to check
     * @returns {boolean} True if matches
     */
    isActive(pattern) {
        return this.currentRoute?.pattern === pattern;
    },

    /**
     * Set a hook to run before navigation
     * @param {Function} callback - Callback(pattern, params) returning boolean
     */
    setBeforeNavigate(callback) {
        this.beforeNavigate = callback;
    }
};
