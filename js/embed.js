/**
 * Embed URL Construction Module
 *
 * Handles the construction and validation of embed URLs.
 * This module is designed to be secure and prevent XSS/injection attacks.
 *
 * SECURITY CONSIDERATIONS:
 * 1. All URL components are sanitized before construction
 * 2. Only whitelisted domains are allowed
 * 3. Slugs are validated against a strict pattern
 * 4. Stream IDs must be positive integers
 *
 * EXTENDING TO OTHER SOURCES:
 * 1. Add new embed source configurations in Config.LEAGUE_CONFIGS
 * 2. Modify buildEmbedUrl() if the URL pattern differs
 * 3. Add the new domain to ALLOWED_DOMAINS
 */

const EmbedUtil = {
    // Whitelist of allowed embed domains for security
    ALLOWED_DOMAINS: [
        'embedsports.top'
    ],

    /**
     * Sanitize a slug to prevent injection attacks
     * Only allows alphanumeric characters, hyphens, and underscores
     *
     * @param {string} slug - The raw slug input
     * @returns {string} - Sanitized slug
     */
    sanitizeSlug(slug) {
        if (!slug || typeof slug !== 'string') {
            return '';
        }
        // Remove any characters that aren't alphanumeric, hyphen, or underscore
        // Convert to lowercase for consistency
        return slug
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\-_]/g, '')
            .replace(/--+/g, '-') // Replace multiple hyphens with single
            .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    },

    /**
     * Validate a stream ID
     * Must be a positive integer
     *
     * @param {number|string} streamId - The stream ID
     * @returns {number|null} - Valid stream ID or null
     */
    validateStreamId(streamId) {
        const id = parseInt(streamId, 10);
        if (isNaN(id) || id < 1 || id > 99) {
            return null;
        }
        return id;
    },

    /**
     * Generate a game slug from two teams
     *
     * @param {Object} awayTeam - Away team object from team data
     * @param {Object} homeTeam - Home team object from team data
     * @param {string} prefix - Optional prefix (e.g., 'ppv-')
     * @returns {string} - Generated slug
     */
    generateGameSlug(awayTeam, homeTeam, prefix = '') {
        if (!awayTeam?.slug || !homeTeam?.slug) {
            return '';
        }
        const sanitizedPrefix = this.sanitizeSlug(prefix);
        const prefixPart = sanitizedPrefix ? `${sanitizedPrefix}-` : '';
        return `${prefixPart}${awayTeam.slug}-vs-${homeTeam.slug}`;
    },

    /**
     * Build a complete embed URL
     *
     * @param {string} slug - The game slug (source-specific ID)
     * @param {number} streamId - The stream ID (1-99)
     * @param {string} sourceType - The source type (admin, charlie, delta, echo, golf)
     * @returns {string|null} - Complete embed URL or null if invalid
     */
    buildEmbedUrl(slug, streamId = 1, sourceType = 'admin') {
        // Sanitize slug - allow underscores and preserve special chars for some sources
        const sanitizedSlug = this.sanitizeSlug(slug);
        const validStreamId = this.validateStreamId(streamId);
        const validSource = this.validateSourceType(sourceType);

        if (!sanitizedSlug || !validStreamId) {
            console.error('Invalid embed parameters:', { slug, streamId, sourceType });
            return null;
        }

        // Build the URL: https://embedsports.top/embed/{source}/{slug}/{streamId}
        const url = `https://embedsports.top/embed/${validSource}/${sanitizedSlug}/${validStreamId}`;

        // Validate the constructed URL
        if (!this.isValidEmbedUrl(url)) {
            console.error('Constructed URL failed validation:', url);
            return null;
        }

        return url;
    },

    /**
     * Validate source type
     * @param {string} source - Source type
     * @returns {string} Valid source or default
     */
    validateSourceType(source) {
        const validSources = ['admin', 'charlie', 'delta', 'echo', 'golf', 'alpha', 'bravo'];
        return validSources.includes(source) ? source : 'admin';
    },

    /**
     * Validate that a URL is safe to embed
     *
     * @param {string} url - The URL to validate
     * @returns {boolean} - True if URL is safe to embed
     */
    isValidEmbedUrl(url) {
        try {
            const parsed = new URL(url);

            // Check protocol (only HTTPS allowed)
            if (parsed.protocol !== 'https:') {
                return false;
            }

            // Check domain against whitelist
            const domain = parsed.hostname.replace(/^www\./, '');
            const isAllowed = this.ALLOWED_DOMAINS.some(
                allowed => domain === allowed || domain.endsWith('.' + allowed)
            );

            if (!isAllowed) {
                console.warn('Domain not in whitelist:', domain);
                return false;
            }

            return true;
        } catch (e) {
            console.error('URL parsing failed:', e);
            return false;
        }
    },

    /**
     * Create an iframe element for embedding
     *
     * NOTE: The embedsports.top embed requires NO sandbox attribute.
     * Security is maintained through:
     * - URL validation (whitelist only)
     * - Slug sanitization
     * - CSP headers restricting frame-src
     *
     * @param {string} url - The embed URL
     * @param {string} title - Accessible title for the iframe
     * @returns {HTMLIFrameElement|null} - Configured iframe element
     */
    createSecureIframe(url, title = 'Game Stream') {
        if (!this.isValidEmbedUrl(url)) {
            return null;
        }

        const iframe = document.createElement('iframe');

        // Referrer policy for privacy
        iframe.setAttribute('referrerpolicy', Config.IFRAME_REFERRER_POLICY);

        // Accessibility
        iframe.setAttribute('title', title);
        iframe.setAttribute('aria-label', title);

        // Permissions policy (modern browsers)
        // 'fullscreen' in allow attribute replaces deprecated allowfullscreen
        iframe.setAttribute('allow', 'fullscreen; autoplay; encrypted-media');

        // Loading optimization
        iframe.setAttribute('loading', 'lazy');

        // Set the source (do this last for security)
        iframe.src = url;

        return iframe;
    },

    /**
     * Parse a game slug to extract team information
     *
     * @param {string} slug - The game slug
     * @returns {Object|null} - Parsed team information
     */
    parseGameSlug(slug, league = null) {
        if (!slug) return null;

        // Remove common prefixes
        let cleanSlug = slug.replace(/^ppv-/, '');

        // Try to find the '-vs-' separator
        const vsIndex = cleanSlug.indexOf('-vs-');
        if (vsIndex === -1) {
            return null;
        }

        const awaySlug = cleanSlug.substring(0, vsIndex);
        const homeSlug = cleanSlug.substring(vsIndex + 4);

        const leaguesToCheck = league && league !== 'all'
            ? [league]
            : Config.SUPPORTED_LEAGUES;

        for (const leagueKey of leaguesToCheck) {
            const awayTeam = TeamsUtil.getTeamBySlug(awaySlug, leagueKey);
            const homeTeam = TeamsUtil.getTeamBySlug(homeSlug, leagueKey);
            if (awayTeam || homeTeam) {
                return {
                    awayTeamSlug: awaySlug,
                    homeTeamSlug: homeSlug,
                    awayTeam,
                    homeTeam,
                    league: leagueKey
                };
            }
        }

        return {
            awayTeamSlug: awaySlug,
            homeTeamSlug: homeSlug,
            awayTeam: null,
            homeTeam: null,
            league: league || null
        };
    },

    /**
     * Get an array of stream URLs to try for a game
     *
     * @param {string} slug - The game slug
     * @param {number} maxStreams - Maximum number of streams to return
     * @returns {Array} - Array of {streamId, url} objects
     */
    getStreamUrls(slug, maxStreams = null, league = null) {
        const config = Config.getLeagueConfig(league);
        const maxCount = maxStreams || config?.MAX_STREAMS || 5;
        const urls = [];
        for (let i = 1; i <= maxCount; i++) {
            const url = this.buildEmbedUrl(slug, i);
            if (url) {
                urls.push({ streamId: i, url });
            }
        }
        return urls;
    }
};
