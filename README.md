# Sports Viewer

A clean, minimal web application for watching sports streams (NFL, NBA, MLB, NHL, and more). **Games are automatically fetched** from the streaming API - no manual entry required.

## Features

- **Automatic Game Fetching**: Games are loaded automatically from the streaming API
- **Resilient Backend**: Node + Python backend with retries, caching, and upstream fallback
- **Game Browser**: List and filter American sports by status (All, Live, Upcoming)
- **League Toggle**: Switch between All American, NFL, NBA, MLB, and NHL
- **Stream Viewer**: Responsive video player with multiple stream options (1-5)
- **Multi-View**: Watch up to 4 games at once in a tiled layout
- **Team Logos**: ESPN API first with streamed badge fallback
- **Standings**: View NFL/NBA/MLB/NHL standings
- **Standings Options**: Divisions/conferences/overall views, sort controls, and rank numbers
- **Dark Mode**: Clean, distraction-free dark interface
- **Fullscreen Support**: Watch games in fullscreen mode
- **Refresh Button**: Manually refresh game list to get latest updates
- **Manual Fallback**: Add custom games if needed (for special events)
- **Mobile Responsive**: Works on desktop and mobile devices

## Quick Start

### Running Locally

The app now runs with a Node + Python backend:

**Option 1: npm (recommended)**
```bash
cd NFL-viewer
npm install
npm start
# Open http://localhost:8080
```

**Option 2: Run Python service separately**
```bash
cd NFL-viewer
python3 backend/python/service.py --port 8001
AUTO_START_PYTHON=false npm start
# Open http://localhost:8080
```

**Backend Ports**
- Node server: `8080` (configurable via `PORT`)
- Python service: `8001` (configurable via `PY_SERVICE_PORT`)

### Usage

1. **Open the app** - Games load automatically from the API
2. **Filter games** - Use All/Live/Upcoming buttons to filter
3. **Watch a game** - Click any game card or "Watch" button
4. **Switch streams** - Use the stream selector (1-5) if one doesn't work
5. **Multi-View** - Add up to 4 games and watch them side-by-side
6. **Standings** - Check NFL/NBA/MLB/NHL standings
7. **Refresh** - Click the refresh button to get the latest game list

## Project Structure

```
NFL-viewer/
├── index.html          # Main HTML with templates
├── css/
│   └── styles.css      # Dark mode styling
├── backend/
│   ├── node/            # Node server (static + API proxy)
│   └── python/          # Python service (fetching + caching)
├── js/
│   ├── config.js       # App configuration
│   ├── teams.js        # NFL + NBA + MLB + NHL team data
│   ├── embed.js        # Embed URL construction & security
│   ├── storage.js      # LocalStorage for manual games
│   ├── api.js          # API fetching (auto game loading)
│   ├── router.js       # Hash-based routing
│   ├── ui.js           # UI rendering
│   └── app.js          # Main application entry
└── README.md
```

## How Auto-Fetching Works

### API Integration (`js/api.js`)

The app now fetches games from the local backend at `/api`, which in turn fetches
from `https://streamed.pk/api` with retries and caching:

1. **Fetch**: Retrieves all available sports matches
2. **Filter**: Identifies NFL/NBA/MLB/NHL games by category and team keywords, while the All American view limits to those leagues
3. **Parse**: Extracts game ID (slug), title, time, and status
4. **Cache**: Caches results for 30 seconds with stale fallback
5. **Health**: Probes stream sources to prefer the most reliable option
6. **Display**: Renders games with live status indicators

### Game Identification

NFL games are detected by:
- Category: `american-football`, `nfl`, `football-am`
- Keywords: Team names (Bills, Chiefs, Cowboys, etc.)
- Special streams: NFL RedZone, NFL Network

NBA games are detected by:
- Category: `basketball`, `nba`
- Keywords: Team names (Lakers, Celtics, Warriors, etc.)
- Special streams: NBA TV, League Pass

MLB games are detected by:
- Category: `baseball`, `mlb`
- Keywords: Team names (Yankees, Dodgers, etc.)
- Special streams: MLB Network, World Series

NHL games are detected by:
- Category: `hockey`, `ice-hockey`, `nhl`
- Keywords: Team names (Bruins, Rangers, Oilers, etc.)
- Special streams: NHL Network, Stanley Cup

### Embed URL Construction

Embed URLs follow the pattern:
```
https://embedsports.top/embed/admin/{game-slug}/{stream-id}
```

Example:
```
https://embedsports.top/embed/admin/ppv-buffalo-bills-vs-new-york-jets/1
```

## Security Considerations

### Iframe Sandboxing

All embeds use restricted sandbox:
- `allow-scripts`: Required for video player
- `allow-same-origin`: Required for embed resources
- `allow-fullscreen`: For fullscreen playback
- **NOT allowed**: forms, popups, top-navigation

### URL Validation

- Only HTTPS URLs allowed
- Domain whitelist (embedsports.top only)
- Slugs sanitized (alphanumeric + hyphens)
- Stream IDs validated (1-99)

### Content Security Policy

```
img-src: a.espncdn.com, streamed.pk (team logos + badges)
frame-src: embedsports.top
connect-src: streamed.pk, site.api.espn.com (for API + logos)
```

## Extending the Application

### Adding Other Leagues

1. Add league config to `backend/python/service.py` (categories + keywords)
2. Add league config to `js/config.js`
3. Add team data to `js/teams.js`
4. Add ESPN teams endpoint in `backend/python/service.py`

### Custom API Integration

Modify `fetch_matches()` in `backend/python/service.py` to use a different data source:

```javascript
def fetch_matches(endpoint):
    url = f\"YOUR_API_ENDPOINT/{endpoint}\"
    return fetch_json(url), url
```

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support
- Mobile browsers: Responsive, touch-friendly

## Known Limitations

1. **API Availability**: Depends on streamed.pk API being accessible
2. **Stream Timing**: Streams may not be available until game time
3. **Multi-View Limit**: Up to 4 simultaneous games
4. **Standings Coverage**: Only the major American leagues are included
5. **CORS**: If running static-only, embeds may require additional headers

## Troubleshooting

**Games not loading?**
- Check browser console for CORS errors
- Try refreshing with the Refresh button
- API may be temporarily unavailable

**Stream not playing?**
- Try different stream numbers (1-5)
- Game may not have started yet
- Some streams may be geo-restricted

**Manual game addition?**
- Use "Add Game" for custom slugs
- Enter exact slug from embedsports URL

## License

For personal, educational use only. This application only embeds streams and does not host or rehost any video content.
