#!/usr/bin/env python3
import argparse
import copy
import json
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import Request, urlopen

API_BASES = [base.strip() for base in os.environ.get(
    'STREAM_API_BASES',
    'https://streamed.pk/api'
).split(',') if base.strip()]

CACHE_TTL_SEC = int(os.environ.get('CACHE_TTL_SEC', '30'))
CACHE_STALE_SEC = int(os.environ.get('CACHE_STALE_SEC', '600'))
HEALTH_TTL_SEC = int(os.environ.get('HEALTH_TTL_SEC', '120'))
MAX_HEALTH_CHECKS = int(os.environ.get('MAX_HEALTH_CHECKS', '10'))
REQUEST_TIMEOUT_SEC = int(os.environ.get('REQUEST_TIMEOUT_SEC', '10'))
RETRY_COUNT = int(os.environ.get('RETRY_COUNT', '3'))
BACKOFF_BASE_SEC = float(os.environ.get('BACKOFF_BASE_SEC', '0.6'))
EMBED_BASE_URL = os.environ.get('EMBED_BASE_URL', 'https://embedsports.top/embed')
USER_AGENT = os.environ.get('USER_AGENT', 'SportsViewerBackend/1.0')
ESPN_TEAM_ENDPOINTS = {
    'nfl': os.environ.get(
        'ESPN_TEAMS_URL_NFL',
        os.environ.get(
            'ESPN_TEAMS_URL',
            'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams'
        )
    ),
    'nba': os.environ.get(
        'ESPN_TEAMS_URL_NBA',
        'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams'
    ),
    'mlb': os.environ.get(
        'ESPN_TEAMS_URL_MLB',
        'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams'
    ),
    'nhl': os.environ.get(
        'ESPN_TEAMS_URL_NHL',
        'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams'
    )
}
ESPN_STANDINGS_ENDPOINTS = {
    'nfl': os.environ.get(
        'ESPN_STANDINGS_URL_NFL',
        'https://site.api.espn.com/apis/v2/sports/football/nfl/standings'
    ),
    'nba': os.environ.get(
        'ESPN_STANDINGS_URL_NBA',
        'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings'
    ),
    'mlb': os.environ.get(
        'ESPN_STANDINGS_URL_MLB',
        'https://site.api.espn.com/apis/v2/sports/baseball/mlb/standings'
    ),
    'nhl': os.environ.get(
        'ESPN_STANDINGS_URL_NHL',
        'https://site.api.espn.com/apis/v2/sports/hockey/nhl/standings'
    )
}
ESPN_SCOREBOARD_ENDPOINTS = {
    'nfl': os.environ.get(
        'ESPN_SCOREBOARD_URL_NFL',
        'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'
    ),
    'nba': os.environ.get(
        'ESPN_SCOREBOARD_URL_NBA',
        'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
    ),
    'mlb': os.environ.get(
        'ESPN_SCOREBOARD_URL_MLB',
        'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard'
    ),
    'nhl': os.environ.get(
        'ESPN_SCOREBOARD_URL_NHL',
        'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard'
    )
}
ESPN_SUMMARY_ENDPOINTS = {
    'nfl': os.environ.get(
        'ESPN_SUMMARY_URL_NFL',
        'https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary'
    ),
    'nba': os.environ.get(
        'ESPN_SUMMARY_URL_NBA',
        'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary'
    ),
    'mlb': os.environ.get(
        'ESPN_SUMMARY_URL_MLB',
        'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary'
    ),
    'nhl': os.environ.get(
        'ESPN_SUMMARY_URL_NHL',
        'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary'
    )
}
CORE_API_BASE = os.environ.get('ESPN_CORE_API_BASE', 'https://sports.core.api.espn.com/v2/sports')
CORE_SPORTS = {
    'nfl': 'football',
    'nba': 'basketball',
    'mlb': 'baseball',
    'nhl': 'hockey'
}
STATS_CACHE_TTL_SEC = int(os.environ.get('STATS_CACHE_TTL_SEC', '60'))
PLAYER_LEADERS_CACHE_TTL_SEC = int(os.environ.get('PLAYER_LEADERS_CACHE_TTL_SEC', '900'))
PLAYER_INDEX_CACHE_TTL_SEC = int(os.environ.get('PLAYER_INDEX_CACHE_TTL_SEC', '3600'))
PLAYER_PROFILE_CACHE_TTL_SEC = int(os.environ.get('PLAYER_PROFILE_CACHE_TTL_SEC', '3600'))
PLAYER_STATS_CACHE_TTL_SEC = int(os.environ.get('PLAYER_STATS_CACHE_TTL_SEC', '900'))
PLAYER_PAGE_CACHE_TTL_SEC = int(os.environ.get('PLAYER_PAGE_CACHE_TTL_SEC', '120'))
PLAYER_FETCH_WORKERS = int(os.environ.get('PLAYER_FETCH_WORKERS', '12'))
STREAMED_IMAGE_BASE = os.environ.get('STREAMED_IMAGE_BASE', 'https://streamed.pk')
TEAM_CACHE_TTL_SEC = int(os.environ.get('TEAM_CACHE_TTL_SEC', '43200'))
TEAM_CACHE_STALE_SEC = int(os.environ.get('TEAM_CACHE_STALE_SEC', '604800'))
STANDINGS_CACHE_TTL_SEC = int(os.environ.get('STANDINGS_CACHE_TTL_SEC', '1800'))
STANDINGS_CACHE_STALE_SEC = int(os.environ.get('STANDINGS_CACHE_STALE_SEC', '21600'))
LIVE_MAX_AGE_SEC = int(os.environ.get('LIVE_MAX_AGE_SEC', '14400'))
ENDED_GRACE_SEC = int(os.environ.get('ENDED_GRACE_SEC', '21600'))

GLOBAL_EXCLUDED_KEYWORDS = []

LEAGUE_CONFIGS = {
    'nfl': {
        'categories': ['american-football', 'nfl', 'football-am'],
        'brand_keywords': ['nfl', 'redzone', 'red zone', 'nfl network'],
        'team_keywords': [
            'bills', 'dolphins', 'patriots', 'jets',
            'ravens', 'bengals', 'browns', 'steelers',
            'texans', 'colts', 'jaguars', 'titans',
            'broncos', 'chiefs', 'raiders', 'chargers',
            'cowboys', 'giants', 'eagles', 'commanders',
            'bears', 'lions', 'packers', 'vikings',
            'falcons', 'panthers', 'saints', 'buccaneers',
            'cardinals', 'rams', '49ers', 'seahawks'
        ],
        'exclude_keywords': [
            'ncaaf', 'ncaa', 'college', 'cfb', 'fbs', 'fcs',
            'xfl', 'usfl', 'cfl', 'arena',
            'nhl', 'hockey', 'ice hockey'
        ]
    },
    'nba': {
        'categories': ['basketball', 'nba'],
        'brand_keywords': ['nba', 'nba tv', 'league pass', 'summer league', 'all-star', 'all star'],
        'team_keywords': [
            'hawks', 'celtics', 'nets', 'hornets',
            'bulls', 'cavaliers', 'mavericks', 'nuggets',
            'pistons', 'warriors', 'rockets', 'pacers',
            'clippers', 'lakers', 'grizzlies', 'heat',
            'bucks', 'timberwolves', 'pelicans', 'knicks',
            'thunder', 'magic', '76ers', 'sixers',
            'suns', 'trail blazers', 'blazers', 'kings',
            'spurs', 'raptors', 'jazz', 'wizards'
        ],
        'exclude_keywords': [
            'wnba', 'ncaab', 'ncaa', 'college', 'g league', 'gleague',
            'fiba', 'euroleague',
            'nhl', 'hockey', 'ice hockey'
        ]
    },
    'mlb': {
        'categories': ['baseball', 'mlb'],
        'brand_keywords': ['mlb', 'mlb network', 'world series', 'spring training', 'all-star'],
        'team_keywords': [
            'orioles', 'red sox', 'yankees', 'rays', 'blue jays',
            'white sox', 'guardians', 'tigers', 'royals', 'twins',
            'astros', 'angels', 'athletics', 'mariners', 'rangers',
            'braves', 'marlins', 'mets', 'phillies', 'nationals',
            'cubs', 'reds', 'brewers', 'pirates', 'cardinals',
            'diamondbacks', 'rockies', 'dodgers', 'padres', 'giants'
        ],
        'exclude_keywords': [
            'college', 'ncaa', 'minor league', 'triple-a', 'double-a',
            'kbo', 'npb'
        ]
    },
    'nhl': {
        'categories': ['hockey', 'ice-hockey', 'nhl'],
        'brand_keywords': ['nhl', 'nhl network', 'hockey night', 'stanley cup', 'winter classic'],
        'team_keywords': [
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
        'exclude_keywords': [
            'ahl', 'khl', 'ncaa', 'college', 'whl', 'ohl', 'qmjhl',
            'iihf', 'world juniors', 'olympics'
        ]
    }
}

PRIORITY_LEAGUES = ['nfl', 'nba', 'mlb', 'nhl']
SOURCE_PREFERENCE = ['admin', 'delta', 'charlie', 'echo', 'golf', 'alpha', 'bravo']

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
CACHE_PATH = os.path.join(DATA_DIR, 'games_cache.json')
TEAM_CACHE_PATHS = {
    league: os.path.join(DATA_DIR, f"teams_cache_{league}.json")
    for league in LEAGUE_CONFIGS.keys()
}


logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s'
)


def now_ms():
    return int(time.time() * 1000)


def iso_from_ms(timestamp_ms):
    try:
        return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).isoformat()
    except Exception:
        return datetime.now(tz=timezone.utc).isoformat()


def sanitize_slug(value):
    if not value:
        return ''
    return re.sub(r'[^a-z0-9\-_]', '', str(value).lower())


def is_league_match(match, league):
    config = LEAGUE_CONFIGS.get(league)
    if not config:
        return False

    category = (match.get('category') or '').lower()
    search_text = f"{match.get('title', '')} {match.get('id', '')}".lower()

    if category and not any(cat in category for cat in config['categories']):
        return False

    if any(keyword in search_text for keyword in GLOBAL_EXCLUDED_KEYWORDS):
        return False

    if any(keyword in search_text for keyword in config['exclude_keywords']):
        return False

    if any(keyword in search_text for keyword in config['brand_keywords']):
        return True

    nickname_hits = sum(1 for nickname in config['team_keywords'] if nickname in search_text)
    if nickname_hits >= 2:
        return True

    if category and league in category and nickname_hits >= 1:
        return True

    return False


class GameCache:
    def __init__(self, cache_path):
        self.lock = threading.Lock()
        self.cache_path = cache_path
        self.data = {
            'live': [],
            'all': [],
            'last_fetch': 0,
            'last_error': None,
            'last_source': None
        }
        self._load()

    def _load(self):
        if not os.path.exists(self.cache_path):
            return
        try:
            with open(self.cache_path, 'r', encoding='utf-8') as handle:
                payload = json.load(handle)
            if isinstance(payload, dict):
                self.data.update(payload)
        except Exception as exc:
            logging.warning('Failed to load cache: %s', exc)

    def _save(self):
        os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
        temp_path = f"{self.cache_path}.tmp"
        with open(temp_path, 'w', encoding='utf-8') as handle:
            json.dump(self.data, handle)
        os.replace(temp_path, self.cache_path)

    def snapshot(self):
        with self.lock:
            return copy.deepcopy(self.data)

    def update(self, live_games, upcoming_games, source):
        with self.lock:
            self.data['live'] = live_games
            self.data['all'] = upcoming_games
            self.data['last_fetch'] = int(time.time())
            self.data['last_error'] = None
            self.data['last_source'] = source
            self._save()

    def mark_error(self, error_message):
        with self.lock:
            self.data['last_error'] = error_message


class TeamCache:
    def __init__(self, cache_path):
        self.lock = threading.Lock()
        self.cache_path = cache_path
        self.data = {
            'teams': [],
            'last_fetch': 0,
            'last_error': None,
            'last_source': None
        }
        self._load()

    def _load(self):
        if not os.path.exists(self.cache_path):
            return
        try:
            with open(self.cache_path, 'r', encoding='utf-8') as handle:
                payload = json.load(handle)
            if isinstance(payload, dict):
                self.data.update(payload)
        except Exception as exc:
            logging.warning('Failed to load team cache: %s', exc)

    def _save(self):
        os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
        temp_path = f"{self.cache_path}.tmp"
        with open(temp_path, 'w', encoding='utf-8') as handle:
            json.dump(self.data, handle)
        os.replace(temp_path, self.cache_path)

    def snapshot(self):
        with self.lock:
            return copy.deepcopy(self.data)

    def update(self, teams, source):
        with self.lock:
            self.data['teams'] = teams
            self.data['last_fetch'] = int(time.time())
            self.data['last_error'] = None
            self.data['last_source'] = source
            self._save()

    def mark_error(self, error_message):
        with self.lock:
            self.data['last_error'] = error_message


class StandingsCache:
    def __init__(self, cache_path):
        self.lock = threading.Lock()
        self.cache_path = cache_path
        self.data = {
            'standings': [],
            'last_fetch': 0,
            'last_error': None,
            'last_source': None
        }
        self._load()

    def _load(self):
        if not os.path.exists(self.cache_path):
            return
        try:
            with open(self.cache_path, 'r', encoding='utf-8') as handle:
                payload = json.load(handle)
            if isinstance(payload, dict):
                self.data.update(payload)
        except Exception as exc:
            logging.warning('Failed to load standings cache: %s', exc)

    def _save(self):
        os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
        temp_path = f"{self.cache_path}.tmp"
        with open(temp_path, 'w', encoding='utf-8') as handle:
            json.dump(self.data, handle)
        os.replace(temp_path, self.cache_path)

    def snapshot(self):
        with self.lock:
            return copy.deepcopy(self.data)

    def update(self, standings, source):
        with self.lock:
            self.data['standings'] = standings
            self.data['last_fetch'] = int(time.time())
            self.data['last_error'] = None
            self.data['last_source'] = source
            self._save()

    def mark_error(self, error_message):
        with self.lock:
            self.data['last_error'] = error_message


class HealthCache:
    def __init__(self, ttl_sec):
        self.ttl_sec = ttl_sec
        self.lock = threading.Lock()
        self.data = {}

    def get(self, key):
        with self.lock:
            record = self.data.get(key)
            if not record:
                return None
            if time.time() - record['checked_at'] > self.ttl_sec:
                return None
            return copy.deepcopy(record['payload'])

    def set(self, key, payload):
        with self.lock:
            self.data[key] = {
                'checked_at': time.time(),
                'payload': copy.deepcopy(payload)
            }


GAME_CACHE = GameCache(CACHE_PATH)
TEAM_CACHES = {league: TeamCache(path) for league, path in TEAM_CACHE_PATHS.items()}
STANDINGS_CACHES = {}
HEALTH_CACHE = HealthCache(HEALTH_TTL_SEC)
STATS_CACHE = {}
PLAYER_LEADERS_CACHE = {}
PLAYER_INDEX_CACHE = {}
PLAYER_PROFILE_CACHE = {}
PLAYER_STATS_CACHE = {}
PLAYER_PAGE_CACHE = {}

PLAYER_INDEX_LOCK = threading.Lock()
PLAYER_PROFILE_LOCK = threading.Lock()
PLAYER_STATS_LOCK = threading.Lock()
PLAYER_PAGE_LOCK = threading.Lock()


def get_standings_cache(league, season=None):
    if not league:
        return None
    season_key = str(season).strip() if season else 'current'
    cache_key = f"{league}:{season_key}"
    cache = STANDINGS_CACHES.get(cache_key)
    if cache:
        return cache
    safe_season = re.sub(r'[^0-9]', '', season_key) if season_key != 'current' else 'current'
    suffix = f"{league}_{safe_season}" if safe_season else league
    cache_path = os.path.join(DATA_DIR, f"standings_cache_{suffix}.json")
    cache = StandingsCache(cache_path)
    STANDINGS_CACHES[cache_key] = cache
    return cache


def fetch_json(url):
    last_error = None
    for attempt in range(RETRY_COUNT):
        try:
            request = Request(url, headers={'Accept': 'application/json', 'User-Agent': USER_AGENT})
            with urlopen(request, timeout=REQUEST_TIMEOUT_SEC) as response:
                if response.status != 200:
                    raise HTTPError(url, response.status, 'Bad response', response.headers, None)
                return json.loads(response.read().decode('utf-8'))
        except Exception as exc:
            last_error = exc
            time.sleep(BACKOFF_BASE_SEC * (2 ** attempt))
    if last_error:
        raise last_error
    raise RuntimeError('Failed to fetch JSON')


def normalize_team_name(value):
    if not value:
        return ''
    normalized = str(value).lower()
    normalized = normalized.replace('&', 'and')
    normalized = normalized.replace('st.', 'st')
    normalized = normalized.replace('saint', 'st')
    normalized = re.sub(r'[^a-z0-9 ]', '', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized


def format_scoreboard_date(value):
    if not value:
        return None
    cleaned = re.sub(r'[^0-9]', '', value)
    if len(cleaned) >= 8:
        return cleaned[:8]
    return None


def fetch_espn_scoreboard(league, date_value=None):
    base = ESPN_SCOREBOARD_ENDPOINTS.get(league)
    if not base:
        return None
    if date_value:
        return fetch_json(f"{base}?dates={date_value}")
    return fetch_json(base)


def find_espn_event(scoreboard, away_abbr=None, home_abbr=None, away_name=None, home_name=None):
    if not scoreboard:
        return None
    target_abbrs = {abbr.upper() for abbr in (away_abbr, home_abbr) if abbr}
    target_names = {normalize_team_name(name) for name in (away_name, home_name) if name}
    best_event = None
    best_score = 0
    for event in scoreboard.get('events', []):
        competitions = event.get('competitions') or []
        if not competitions:
            continue
        competitors = competitions[0].get('competitors') or []
        event_abbrs = set()
        event_names = set()
        for entry in competitors:
            team = entry.get('team') or {}
            abbr = team.get('abbreviation')
            if abbr:
                event_abbrs.add(abbr.upper())
            for name in (
                team.get('displayName'),
                team.get('shortDisplayName'),
                team.get('name'),
                team.get('location')
            ):
                normalized = normalize_team_name(name)
                if normalized:
                    event_names.add(normalized)
        if target_abbrs and target_abbrs.issubset(event_abbrs):
            return event
        if target_names and target_names.issubset(event_names):
            return event
        score = 0
        if target_abbrs:
            score += len(target_abbrs.intersection(event_abbrs)) * 3
        if target_names:
            for target in target_names:
                for candidate in event_names:
                    if not target or not candidate:
                        continue
                    if target == candidate:
                        score += 3
                    elif target in candidate or candidate in target:
                        score += 2
        event_label = normalize_team_name(event.get('shortName') or event.get('name'))
        if event_label:
            for target in target_names:
                if target and target in event_label:
                    score += 1
        if score > best_score:
            best_score = score
            best_event = event
    if best_score >= 2:
        return best_event
    return None


def fetch_espn_summary(league, event_id):
    base = ESPN_SUMMARY_ENDPOINTS.get(league)
    if not base or not event_id:
        return None
    return fetch_json(f"{base}?event={event_id}")


def normalize_core_ref(ref):
    if not ref:
        return None
    text = str(ref)
    if text.startswith('http://'):
        return f"https://{text[len('http://'):]}"
    return text


def extract_season_year(ref):
    if not ref:
        return None
    match = re.search(r'/seasons/([0-9]{4})', str(ref))
    return match.group(1) if match else None


def fetch_core_seasons(league):
    sport = CORE_SPORTS.get(league)
    if not sport:
        return []
    data = fetch_json(f"{CORE_API_BASE}/{sport}/leagues/{league}/seasons")
    items = data.get('items') or []
    refs = []
    for item in items:
        if isinstance(item, dict):
            ref = item.get('$ref') or item.get('href')
            if ref:
                refs.append(ref)
    return refs


def resolve_core_season(league, season_value):
    candidates = resolve_core_season_candidates(league, season_value)
    return candidates[0] if candidates else None


def resolve_core_season_candidates(league, season_value):
    if season_value and str(season_value).lower() != 'current':
        cleaned = re.sub(r'[^0-9]', '', str(season_value))
        if len(cleaned) >= 4:
            return [cleaned[:4]]
        return []

    candidates = []
    for ref in fetch_core_seasons(league):
        year = extract_season_year(ref)
        if year:
            candidates.append(year)
    return candidates


def resolve_core_payload(ref, cache):
    url = normalize_core_ref(ref)
    if not url:
        return None
    if url in cache:
        return cache[url]
    try:
        payload = fetch_json(url)
    except Exception:
        return None
    cache[url] = payload
    return payload


def get_ttl_cached(cache, lock, key, ttl):
    if not key:
        return None
    with lock:
        entry = cache.get(key)
    if not entry:
        return None
    if time.time() - entry['ts'] > ttl:
        return None
    return entry['data']


def set_ttl_cached(cache, lock, key, payload):
    if not key:
        return
    with lock:
        cache[key] = {
            'ts': time.time(),
            'data': payload
        }


def get_ttl_cached_with_age(cache, lock, key, ttl):
    if not key:
        return None, None
    with lock:
        entry = cache.get(key)
    if not entry:
        return None, None
    age = time.time() - entry['ts']
    if age > ttl:
        return None, None
    return entry['data'], int(age)


def append_query_param(url, param):
    if not url or not param:
        return url
    joiner = '&' if '?' in url else '?'
    return f"{url}{joiner}{param}"


def extract_id_from_ref(ref, segment):
    if not ref or not segment:
        return None
    pattern = rf"/{re.escape(segment)}/(\\d+)"
    match = re.search(pattern, str(ref))
    return match.group(1) if match else None


def fetch_core_items(url):
    if not url:
        return []
    payload = fetch_json(url)
    items = payload.get('items') or []
    try:
        page_index = int(payload.get('pageIndex') or 1)
        page_count = int(payload.get('pageCount') or 1)
    except (TypeError, ValueError):
        page_index = 1
        page_count = 1
    if page_count > page_index:
        for page in range(page_index + 1, page_count + 1):
            page_url = append_query_param(url, f"page={page}")
            page_payload = fetch_json(page_url)
            items.extend(page_payload.get('items') or [])
    return items


def fetch_core_team_refs(league, season_year):
    sport = CORE_SPORTS.get(league)
    if not sport or not season_year:
        return [], None
    url = f"{CORE_API_BASE}/{sport}/leagues/{league}/seasons/{season_year}/teams?limit=200"
    items = fetch_core_items(url)
    refs = []
    for item in items:
        if not isinstance(item, dict):
            continue
        ref = item.get('$ref') or item.get('href')
        ref = normalize_core_ref(ref)
        if ref:
            refs.append(ref)
    return refs, url


def fetch_team_roster_refs(league, season_year, team_id):
    sport = CORE_SPORTS.get(league)
    if not sport or not season_year or not team_id:
        return []
    url = f"{CORE_API_BASE}/{sport}/leagues/{league}/seasons/{season_year}/teams/{team_id}/athletes?limit=200"
    items = fetch_core_items(url)
    refs = []
    for item in items:
        if not isinstance(item, dict):
            continue
        ref = item.get('$ref') or item.get('href')
        ref = normalize_core_ref(ref)
        if ref:
            refs.append(ref)
    return refs


def get_cached_player_leaders(key):
    if not key:
        return None
    entry = PLAYER_LEADERS_CACHE.get(key)
    if not entry:
        return None
    age = time.time() - entry['ts']
    if age > PLAYER_LEADERS_CACHE_TTL_SEC:
        return None
    data = copy.deepcopy(entry['data'])
    meta = data.get('meta')
    if isinstance(meta, dict):
        meta['cacheAgeSec'] = int(age)
        meta['fromCache'] = True
    return data


def set_cached_player_leaders(key, payload):
    if not key:
        return
    PLAYER_LEADERS_CACHE[key] = {
        'ts': time.time(),
        'data': copy.deepcopy(payload)
    }

PLAYER_STATS_SCHEMAS = {
    'mlb': {
        'hitting': {
            'leaderCategory': 'avg',
            'statCategories': ['batting'],
            'columns': [
                {'key': 'g', 'label': 'G', 'keys': ['teamGamesPlayed', 'gamesPlayed', 'G', 'GP']},
                {'key': 'ab', 'label': 'AB', 'keys': ['atBats', 'AB']},
                {'key': 'r', 'label': 'R', 'keys': ['runs', 'R']},
                {'key': 'h', 'label': 'H', 'keys': ['hits', 'H']},
                {'key': '2b', 'label': '2B', 'keys': ['doubles', '2B']},
                {'key': '3b', 'label': '3B', 'keys': ['triples', '3B']},
                {'key': 'hr', 'label': 'HR', 'keys': ['homeRuns', 'HR']},
                {'key': 'rbi', 'label': 'RBI', 'keys': ['RBIs', 'RBI']},
                {'key': 'bb', 'label': 'BB', 'keys': ['walks', 'BB']},
                {'key': 'so', 'label': 'SO', 'keys': ['strikeouts', 'SO', 'K']},
                {'key': 'sb', 'label': 'SB', 'keys': ['stolenBases', 'SB']},
                {'key': 'cs', 'label': 'CS', 'keys': ['caughtStealing', 'CS']},
                {'key': 'avg', 'label': 'AVG', 'keys': ['avg', 'battingAverage', 'AVG']},
                {'key': 'obp', 'label': 'OBP', 'keys': ['onBasePct', 'onBasePercentage', 'OBP']},
                {'key': 'slg', 'label': 'SLG', 'keys': ['slugAvg', 'sluggingPercentage', 'SLG']},
                {'key': 'ops', 'label': 'OPS', 'keys': ['OPS', 'onBasePlusSlugging']}
            ]
        },
        'pitching': {
            'leaderCategory': 'ERA',
            'statCategories': ['pitching'],
            'columns': [
                {'key': 'g', 'label': 'G', 'keys': ['gamesPlayed', 'GP', 'G']},
                {'key': 'gs', 'label': 'GS', 'keys': ['gamesStarted', 'GS']},
                {'key': 'ip', 'label': 'IP', 'keys': ['innings', 'IP']},
                {'key': 'w', 'label': 'W', 'keys': ['wins', 'W']},
                {'key': 'l', 'label': 'L', 'keys': ['losses', 'L']},
                {'key': 'sv', 'label': 'SV', 'keys': ['saves', 'SV']},
                {'key': 'so', 'label': 'SO', 'keys': ['strikeouts', 'SO', 'K']},
                {'key': 'bb', 'label': 'BB', 'keys': ['walks', 'BB']},
                {'key': 'era', 'label': 'ERA', 'keys': ['ERA', 'earnedRunAverage']},
                {'key': 'whip', 'label': 'WHIP', 'keys': ['WHIP', 'walksHitsPerInningPitched']}
            ]
        }
    },
    'nba': {
        'hitting': {
            'leaderCategory': 'pointsPerGame',
            'statCategories': ['offensive', 'general', 'defensive'],
            'columns': [
                {'key': 'g', 'label': 'G', 'keys': ['gamesPlayed', 'GP'], 'categories': ['general']},
                {'key': 'min', 'label': 'MIN', 'keys': ['avgMinutes', 'minutes', 'MIN'], 'categories': ['general']},
                {'key': 'pts', 'label': 'PTS', 'keys': ['avgPoints', 'points', 'PTS'], 'categories': ['offensive']},
                {'key': 'reb', 'label': 'REB', 'keys': ['avgRebounds', 'rebounds', 'REB'], 'categories': ['general']},
                {'key': 'ast', 'label': 'AST', 'keys': ['avgAssists', 'assists', 'AST'], 'categories': ['offensive']},
                {'key': 'stl', 'label': 'STL', 'keys': ['avgSteals', 'steals', 'STL'], 'categories': ['defensive']},
                {'key': 'blk', 'label': 'BLK', 'keys': ['avgBlocks', 'blocks', 'BLK'], 'categories': ['defensive']},
                {'key': 'fgp', 'label': 'FG%', 'keys': ['fieldGoalPct', 'FG%'], 'categories': ['offensive']},
                {'key': 'tpp', 'label': '3P%', 'keys': ['threePointPct', 'threePointFieldGoalPct', '3P%'], 'categories': ['offensive']},
                {'key': 'ftp', 'label': 'FT%', 'keys': ['freeThrowPct', 'FT%'], 'categories': ['offensive']}
            ]
        },
        'pitching': {
            'leaderCategory': 'blocksPerGame',
            'statCategories': ['defensive', 'general'],
            'columns': [
                {'key': 'g', 'label': 'G', 'keys': ['gamesPlayed', 'GP'], 'categories': ['general']},
                {'key': 'min', 'label': 'MIN', 'keys': ['avgMinutes', 'minutes', 'MIN'], 'categories': ['general']},
                {'key': 'reb', 'label': 'REB', 'keys': ['avgRebounds', 'rebounds', 'REB'], 'categories': ['general']},
                {'key': 'stl', 'label': 'STL', 'keys': ['avgSteals', 'steals', 'STL'], 'categories': ['defensive']},
                {'key': 'blk', 'label': 'BLK', 'keys': ['avgBlocks', 'blocks', 'BLK'], 'categories': ['defensive']},
                {'key': 'pf', 'label': 'PF', 'keys': ['fouls', 'personalFouls', 'PF'], 'categories': ['general']}
            ]
        }
    },
    'nfl': {
        'hitting': {
            'leaderCategory': 'passingYards',
            'statCategories': ['passing', 'general'],
            'columns': [
                {'key': 'g', 'label': 'G', 'keys': ['gamesPlayed', 'GP'], 'categories': ['general']},
                {'key': 'cmp', 'label': 'CMP', 'keys': ['completions', 'CMP'], 'categories': ['passing']},
                {'key': 'att', 'label': 'ATT', 'keys': ['passingAttempts', 'ATT'], 'categories': ['passing']},
                {'key': 'yds', 'label': 'YDS', 'keys': ['passingYards', 'YDS'], 'categories': ['passing']},
                {'key': 'td', 'label': 'TD', 'keys': ['passingTouchdowns', 'TD'], 'categories': ['passing']},
                {'key': 'int', 'label': 'INT', 'keys': ['interceptions', 'INT'], 'categories': ['passing']},
                {'key': 'rtg', 'label': 'RTG', 'keys': ['QBRating', 'passerRating', 'rating', 'RTG'], 'categories': ['passing']}
            ]
        },
        'pitching': {
            'leaderCategory': 'totalTackles',
            'statCategories': ['defensive', 'defensiveInterceptions', 'general'],
            'columns': [
                {'key': 'g', 'label': 'G', 'keys': ['gamesPlayed', 'GP'], 'categories': ['general']},
                {'key': 'tot', 'label': 'TOT', 'keys': ['totalTackles', 'TOT'], 'categories': ['defensive']},
                {'key': 'sack', 'label': 'SACK', 'keys': ['sacks', 'SACK'], 'categories': ['defensive']},
                {'key': 'tfl', 'label': 'TFL', 'keys': ['tacklesForLoss', 'TFL'], 'categories': ['defensive']},
                {'key': 'pd', 'label': 'PD', 'keys': ['passesDefended', 'PD'], 'categories': ['defensive']},
                {'key': 'int', 'label': 'INT', 'keys': ['interceptions', 'INT'], 'categories': ['defensiveInterceptions', 'defensive']}
            ]
        }
    },
    'nhl': {
        'hitting': {
            'leaderCategory': 'points',
            'statCategories': ['offensive', 'general'],
            'columns': [
                {'key': 'gp', 'label': 'GP', 'keys': ['games', 'gamesPlayed', 'GP'], 'categories': ['general']},
                {'key': 'g', 'label': 'G', 'keys': ['goals', 'G'], 'categories': ['offensive']},
                {'key': 'a', 'label': 'A', 'keys': ['assists', 'A'], 'categories': ['offensive']},
                {'key': 'pts', 'label': 'PTS', 'keys': ['points', 'PTS'], 'categories': ['offensive']},
                {'key': 'ppg', 'label': 'PPG', 'keys': ['powerPlayGoals', 'PPG'], 'categories': ['offensive']},
                {'key': 's', 'label': 'S', 'keys': ['shotsTotal', 'S'], 'categories': ['offensive']}
            ]
        },
        'pitching': {
            'leaderCategory': 'savePct',
            'statCategories': ['defensive', 'general'],
            'columns': [
                {'key': 'gp', 'label': 'GP', 'keys': ['games', 'gamesPlayed', 'GP'], 'categories': ['general']},
                {'key': 'ga', 'label': 'GA', 'keys': ['goalsAgainst', 'GA'], 'categories': ['defensive']},
                {'key': 'gaa', 'label': 'GAA', 'keys': ['avgGoalsAgainst', 'GAA'], 'categories': ['defensive']},
                {'key': 'sv', 'label': 'SV', 'keys': ['saves', 'SV'], 'categories': ['defensive']},
                {'key': 'svp', 'label': 'SV%', 'keys': ['savePct', 'SV%'], 'categories': ['defensive']},
                {'key': 'so', 'label': 'SO', 'keys': ['shutouts', 'SO'], 'categories': ['defensive']}
            ]
        }
    }
}

DEFAULT_PLAYER_STATS_MODE = 'hitting'
DEFAULT_PLAYER_TABLE_VIEW = 'standard'

PLAYER_TABLE_SCHEMAS = {
    'nfl': {
        'standard': {
            'statCategories': ['passing', 'rushing', 'receiving', 'defensive', 'defensiveInterceptions', 'general'],
            'columns': [
                {'key': 'g', 'label': 'G', 'keys': ['gamesPlayed', 'GP'], 'categories': ['general']},
                {'key': 'passYds', 'label': 'PASS YDS', 'keys': ['passingYards', 'passYards', 'netPassingYards'], 'categories': ['passing']},
                {'key': 'passTd', 'label': 'PASS TD', 'keys': ['passingTouchdowns', 'passTD', 'passTd'], 'categories': ['passing']},
                {'key': 'int', 'label': 'INT', 'keys': ['interceptions', 'INT'], 'categories': ['passing']},
                {'key': 'rushYds', 'label': 'RUSH YDS', 'keys': ['rushingYards', 'rushYds'], 'categories': ['rushing']},
                {'key': 'rushTd', 'label': 'RUSH TD', 'keys': ['rushingTouchdowns', 'rushTd'], 'categories': ['rushing']},
                {'key': 'rec', 'label': 'REC', 'keys': ['receptions', 'rec'], 'categories': ['receiving']},
                {'key': 'recYds', 'label': 'REC YDS', 'keys': ['receivingYards', 'recYds'], 'categories': ['receiving']},
                {'key': 'recTd', 'label': 'REC TD', 'keys': ['receivingTouchdowns', 'recTd'], 'categories': ['receiving']},
                {'key': 'tackles', 'label': 'TCK', 'keys': ['totalTackles', 'tackles', 'TOT'], 'categories': ['defensive']},
                {'key': 'sacks', 'label': 'SACK', 'keys': ['sacks', 'SACK'], 'categories': ['defensive']},
                {'key': 'defInt', 'label': 'DEF INT', 'keys': ['interceptions', 'INT'], 'categories': ['defensiveInterceptions', 'defensive']}
            ]
        },
        'expanded': {
            'statCategories': ['passing', 'rushing', 'receiving', 'defensive', 'defensiveInterceptions', 'general'],
            'columns': [
                {'key': 'g', 'label': 'G', 'keys': ['gamesPlayed', 'GP'], 'categories': ['general']},
                {'key': 'cmp', 'label': 'CMP', 'keys': ['completions', 'CMP'], 'categories': ['passing']},
                {'key': 'att', 'label': 'ATT', 'keys': ['passingAttempts', 'ATT'], 'categories': ['passing']},
                {'key': 'cmpPct', 'label': 'CMP%', 'keys': ['completionPct'], 'categories': ['passing']},
                {'key': 'ypa', 'label': 'Y/A', 'keys': ['yardsPerAttempt', 'avgGain'], 'categories': ['passing']},
                {'key': 'passYds', 'label': 'PASS YDS', 'keys': ['passingYards', 'passYards', 'netPassingYards'], 'categories': ['passing']},
                {'key': 'passTd', 'label': 'PASS TD', 'keys': ['passingTouchdowns', 'passTD', 'passTd'], 'categories': ['passing']},
                {'key': 'int', 'label': 'INT', 'keys': ['interceptions', 'INT'], 'categories': ['passing']},
                {'key': 'qbr', 'label': 'QBR', 'keys': ['ESPNQBRating', 'QBRating', 'passerRating', 'rating'], 'categories': ['passing']},
                {'key': 'rushAtt', 'label': 'RUSH ATT', 'keys': ['rushingAttempts', 'rushAtt'], 'categories': ['rushing']},
                {'key': 'rushYds', 'label': 'RUSH YDS', 'keys': ['rushingYards', 'rushYds'], 'categories': ['rushing']},
                {'key': 'ypc', 'label': 'YPC', 'keys': ['yardsPerRushAttempt', 'avgGain'], 'categories': ['rushing']},
                {'key': 'rushTd', 'label': 'RUSH TD', 'keys': ['rushingTouchdowns', 'rushTd'], 'categories': ['rushing']},
                {'key': 'targets', 'label': 'TGT', 'keys': ['receivingTargets', 'targets'], 'categories': ['receiving']},
                {'key': 'rec', 'label': 'REC', 'keys': ['receptions', 'rec'], 'categories': ['receiving']},
                {'key': 'recYds', 'label': 'REC YDS', 'keys': ['receivingYards', 'recYds'], 'categories': ['receiving']},
                {'key': 'ypr', 'label': 'Y/REC', 'keys': ['yardsPerReception', 'avgGain'], 'categories': ['receiving']},
                {'key': 'recTd', 'label': 'REC TD', 'keys': ['receivingTouchdowns', 'recTd'], 'categories': ['receiving']},
                {'key': 'tackles', 'label': 'TCK', 'keys': ['totalTackles', 'tackles', 'TOT'], 'categories': ['defensive']},
                {'key': 'tfl', 'label': 'TFL', 'keys': ['tacklesForLoss', 'TFL'], 'categories': ['defensive']},
                {'key': 'sacks', 'label': 'SACK', 'keys': ['sacks', 'SACK'], 'categories': ['defensive']},
                {'key': 'pd', 'label': 'PD', 'keys': ['passesDefended', 'PD'], 'categories': ['defensive']},
                {'key': 'ff', 'label': 'FF', 'keys': ['fumblesForced', 'FF'], 'categories': ['defensive']},
                {'key': 'fr', 'label': 'FR', 'keys': ['fumblesRecovered', 'FR'], 'categories': ['defensive']},
                {'key': 'defInt', 'label': 'DEF INT', 'keys': ['interceptions', 'INT'], 'categories': ['defensiveInterceptions', 'defensive']}
            ]
        }
    },
    'nba': {
        'standard': {
            'statCategories': ['offensive', 'defensive', 'general'],
            'columns': [
                {'key': 'g', 'label': 'G', 'keys': ['gamesPlayed', 'GP'], 'categories': ['general']},
                {'key': 'min', 'label': 'MIN', 'keys': ['avgMinutes', 'minutes', 'MIN'], 'categories': ['general']},
                {'key': 'pts', 'label': 'PTS', 'keys': ['avgPoints', 'points', 'PTS'], 'categories': ['offensive']},
                {'key': 'reb', 'label': 'REB', 'keys': ['avgRebounds', 'rebounds', 'REB'], 'categories': ['general']},
                {'key': 'ast', 'label': 'AST', 'keys': ['avgAssists', 'assists', 'AST'], 'categories': ['offensive']},
                {'key': 'stl', 'label': 'STL', 'keys': ['avgSteals', 'steals', 'STL'], 'categories': ['defensive']},
                {'key': 'blk', 'label': 'BLK', 'keys': ['avgBlocks', 'blocks', 'BLK'], 'categories': ['defensive']},
                {'key': 'fgp', 'label': 'FG%', 'keys': ['fieldGoalPct', 'FG%'], 'categories': ['offensive']},
                {'key': 'tpp', 'label': '3P%', 'keys': ['threePointPct', 'threePointFieldGoalPct', '3P%'], 'categories': ['offensive']},
                {'key': 'ftp', 'label': 'FT%', 'keys': ['freeThrowPct', 'FT%'], 'categories': ['offensive']},
                {'key': 'tov', 'label': 'TOV', 'keys': ['avgTurnovers', 'turnovers', 'TOV'], 'categories': ['offensive']}
            ]
        },
        'expanded': {
            'statCategories': ['offensive', 'defensive', 'general'],
            'columns': [
                {'key': 'g', 'label': 'G', 'keys': ['gamesPlayed', 'GP'], 'categories': ['general']},
                {'key': 'min', 'label': 'MIN', 'keys': ['minutes', 'MIN'], 'categories': ['general']},
                {'key': 'pts', 'label': 'PTS', 'keys': ['points', 'PTS'], 'categories': ['offensive']},
                {'key': 'reb', 'label': 'REB', 'keys': ['rebounds', 'REB'], 'categories': ['general']},
                {'key': 'oreb', 'label': 'OREB', 'keys': ['offensiveRebounds', 'OREB'], 'categories': ['offensive']},
                {'key': 'dreb', 'label': 'DREB', 'keys': ['defensiveRebounds', 'DREB'], 'categories': ['defensive']},
                {'key': 'ast', 'label': 'AST', 'keys': ['assists', 'AST'], 'categories': ['offensive']},
                {'key': 'stl', 'label': 'STL', 'keys': ['steals', 'STL'], 'categories': ['defensive']},
                {'key': 'blk', 'label': 'BLK', 'keys': ['blocks', 'BLK'], 'categories': ['defensive']},
                {'key': 'tov', 'label': 'TOV', 'keys': ['turnovers', 'TOV'], 'categories': ['offensive']},
                {'key': 'fgm', 'label': 'FGM', 'keys': ['fieldGoalsMade', 'FGM'], 'categories': ['offensive']},
                {'key': 'fga', 'label': 'FGA', 'keys': ['fieldGoalsAttempted', 'FGA'], 'categories': ['offensive']},
                {'key': 'fgp', 'label': 'FG%', 'keys': ['fieldGoalPct', 'FG%'], 'categories': ['offensive']},
                {'key': 'tpm', 'label': '3PM', 'keys': ['threePointFieldGoalsMade', '3PM'], 'categories': ['offensive']},
                {'key': 'tpa', 'label': '3PA', 'keys': ['threePointFieldGoalsAttempted', '3PA'], 'categories': ['offensive']},
                {'key': 'tpp', 'label': '3P%', 'keys': ['threePointPct', 'threePointFieldGoalPct', '3P%'], 'categories': ['offensive']},
                {'key': 'ftm', 'label': 'FTM', 'keys': ['freeThrowsMade', 'FTM'], 'categories': ['offensive']},
                {'key': 'fta', 'label': 'FTA', 'keys': ['freeThrowsAttempted', 'FTA'], 'categories': ['offensive']},
                {'key': 'ftp', 'label': 'FT%', 'keys': ['freeThrowPct', 'FT%'], 'categories': ['offensive']},
                {'key': 'per', 'label': 'PER', 'keys': ['PER'], 'categories': ['general']},
                {'key': 'pm', 'label': '+/-', 'keys': ['plusMinus'], 'categories': ['general']}
            ]
        }
    },
    'mlb': {
        'hitting': {
            'standard': {
                'statCategories': ['batting'],
                'columns': [
                    {'key': 'g', 'label': 'G', 'keys': ['teamGamesPlayed', 'gamesPlayed', 'G', 'GP']},
                    {'key': 'ab', 'label': 'AB', 'keys': ['atBats', 'AB']},
                    {'key': 'r', 'label': 'R', 'keys': ['runs', 'R']},
                    {'key': 'h', 'label': 'H', 'keys': ['hits', 'H']},
                    {'key': '2b', 'label': '2B', 'keys': ['doubles', '2B']},
                    {'key': '3b', 'label': '3B', 'keys': ['triples', '3B']},
                    {'key': 'hr', 'label': 'HR', 'keys': ['homeRuns', 'HR']},
                    {'key': 'rbi', 'label': 'RBI', 'keys': ['RBIs', 'RBI']},
                    {'key': 'bb', 'label': 'BB', 'keys': ['walks', 'BB']},
                    {'key': 'so', 'label': 'SO', 'keys': ['strikeouts', 'SO', 'K']},
                    {'key': 'sb', 'label': 'SB', 'keys': ['stolenBases', 'SB']},
                    {'key': 'cs', 'label': 'CS', 'keys': ['caughtStealing', 'CS']},
                    {'key': 'avg', 'label': 'AVG', 'keys': ['avg', 'battingAverage', 'AVG']},
                    {'key': 'obp', 'label': 'OBP', 'keys': ['onBasePct', 'onBasePercentage', 'OBP']},
                    {'key': 'slg', 'label': 'SLG', 'keys': ['slugAvg', 'sluggingPercentage', 'SLG']},
                    {'key': 'ops', 'label': 'OPS', 'keys': ['OPS', 'onBasePlusSlugging']}
                ]
            },
            'expanded': {
                'statCategories': ['batting'],
                'columns': [
                    {'key': 'g', 'label': 'G', 'keys': ['teamGamesPlayed', 'gamesPlayed', 'G', 'GP']},
                    {'key': 'ab', 'label': 'AB', 'keys': ['atBats', 'AB']},
                    {'key': 'r', 'label': 'R', 'keys': ['runs', 'R']},
                    {'key': 'h', 'label': 'H', 'keys': ['hits', 'H']},
                    {'key': '2b', 'label': '2B', 'keys': ['doubles', '2B']},
                    {'key': '3b', 'label': '3B', 'keys': ['triples', '3B']},
                    {'key': 'hr', 'label': 'HR', 'keys': ['homeRuns', 'HR']},
                    {'key': 'rbi', 'label': 'RBI', 'keys': ['RBIs', 'RBI']},
                    {'key': 'tb', 'label': 'TB', 'keys': ['totalBases', 'TB']},
                    {'key': 'bb', 'label': 'BB', 'keys': ['walks', 'BB']},
                    {'key': 'so', 'label': 'SO', 'keys': ['strikeouts', 'SO', 'K']},
                    {'key': 'hbp', 'label': 'HBP', 'keys': ['hitByPitch', 'HBP']},
                    {'key': 'ibb', 'label': 'IBB', 'keys': ['intentionalWalks', 'IBB']},
                    {'key': 'sb', 'label': 'SB', 'keys': ['stolenBases', 'SB']},
                    {'key': 'cs', 'label': 'CS', 'keys': ['caughtStealing', 'CS']},
                    {'key': 'avg', 'label': 'AVG', 'keys': ['avg', 'battingAverage', 'AVG']},
                    {'key': 'obp', 'label': 'OBP', 'keys': ['onBasePct', 'onBasePercentage', 'OBP']},
                    {'key': 'slg', 'label': 'SLG', 'keys': ['slugAvg', 'sluggingPercentage', 'SLG']},
                    {'key': 'ops', 'label': 'OPS', 'keys': ['OPS', 'onBasePlusSlugging']},
                    {'key': 'sf', 'label': 'SF', 'keys': ['sacrificeFlies', 'SF']},
                    {'key': 'sh', 'label': 'SH', 'keys': ['sacrificeHits', 'SH']},
                    {'key': 'gidp', 'label': 'GIDP', 'keys': ['groundIntoDoublePlay', 'GIDP']}
                ]
            }
        },
        'pitching': {
            'standard': {
                'statCategories': ['pitching'],
                'columns': [
                    {'key': 'g', 'label': 'G', 'keys': ['gamesPlayed', 'GP', 'G']},
                    {'key': 'gs', 'label': 'GS', 'keys': ['gamesStarted', 'GS']},
                    {'key': 'ip', 'label': 'IP', 'keys': ['innings', 'IP']},
                    {'key': 'w', 'label': 'W', 'keys': ['wins', 'W']},
                    {'key': 'l', 'label': 'L', 'keys': ['losses', 'L']},
                    {'key': 'sv', 'label': 'SV', 'keys': ['saves', 'SV']},
                    {'key': 'so', 'label': 'SO', 'keys': ['strikeouts', 'SO', 'K']},
                    {'key': 'bb', 'label': 'BB', 'keys': ['walks', 'BB']},
                    {'key': 'era', 'label': 'ERA', 'keys': ['ERA', 'earnedRunAverage']},
                    {'key': 'whip', 'label': 'WHIP', 'keys': ['WHIP', 'walksHitsPerInningPitched']}
                ]
            },
            'expanded': {
                'statCategories': ['pitching'],
                'columns': [
                    {'key': 'g', 'label': 'G', 'keys': ['gamesPlayed', 'GP', 'G']},
                    {'key': 'gs', 'label': 'GS', 'keys': ['gamesStarted', 'GS']},
                    {'key': 'ip', 'label': 'IP', 'keys': ['innings', 'IP']},
                    {'key': 'w', 'label': 'W', 'keys': ['wins', 'W']},
                    {'key': 'l', 'label': 'L', 'keys': ['losses', 'L']},
                    {'key': 'sv', 'label': 'SV', 'keys': ['saves', 'SV']},
                    {'key': 'hld', 'label': 'HLD', 'keys': ['holds', 'HLD']},
                    {'key': 'bs', 'label': 'BS', 'keys': ['blownSaves', 'BS']},
                    {'key': 'so', 'label': 'SO', 'keys': ['strikeouts', 'SO', 'K']},
                    {'key': 'bb', 'label': 'BB', 'keys': ['walks', 'BB']},
                    {'key': 'h', 'label': 'H', 'keys': ['hits', 'H']},
                    {'key': 'er', 'label': 'ER', 'keys': ['earnedRuns', 'ER']},
                    {'key': 'hr', 'label': 'HR', 'keys': ['homeRuns', 'HR']},
                    {'key': 'era', 'label': 'ERA', 'keys': ['ERA', 'earnedRunAverage']},
                    {'key': 'whip', 'label': 'WHIP', 'keys': ['WHIP', 'walksHitsPerInningPitched']},
                    {'key': 'svo', 'label': 'SVO', 'keys': ['saveOpportunities', 'SVO']},
                    {'key': 'bf', 'label': 'BF', 'keys': ['battersFaced', 'BF']},
                    {'key': 'pitches', 'label': 'PIT', 'keys': ['pitches', 'P']},
                    {'key': 'cg', 'label': 'CG', 'keys': ['completeGames', 'CG']},
                    {'key': 'sho', 'label': 'SHO', 'keys': ['shutouts', 'SHO']},
                    {'key': 'wpct', 'label': 'WPCT', 'keys': ['winPct', 'W%']}
                ]
            }
        }
    },
    'nhl': {
        'standard': {
            'statCategories': ['offensive', 'defensive', 'general', 'penalties'],
            'columns': [
                {'key': 'gp', 'label': 'GP', 'keys': ['gamesPlayed', 'GP'], 'categories': ['general']},
                {'key': 'g', 'label': 'G', 'keys': ['goals', 'G'], 'categories': ['offensive']},
                {'key': 'a', 'label': 'A', 'keys': ['assists', 'A'], 'categories': ['offensive']},
                {'key': 'pts', 'label': 'PTS', 'keys': ['points', 'PTS'], 'categories': ['offensive']},
                {'key': 's', 'label': 'S', 'keys': ['shotsTotal', 'S'], 'categories': ['offensive']},
                {'key': 'pm', 'label': '+/-', 'keys': ['plusMinus'], 'categories': ['general']},
                {'key': 'pim', 'label': 'PIM', 'keys': ['penaltyMinutes', 'PIM'], 'categories': ['penalties']},
                {'key': 'ppg', 'label': 'PPG', 'keys': ['powerPlayGoals', 'PPG'], 'categories': ['offensive']},
                {'key': 'shg', 'label': 'SHG', 'keys': ['shortHandedGoals', 'SHG'], 'categories': ['offensive']},
                {'key': 'toi', 'label': 'TOI/G', 'keys': ['timeOnIcePerGame', 'TOI'], 'categories': ['general']},
                {'key': 'w', 'label': 'W', 'keys': ['wins', 'W'], 'categories': ['general']},
                {'key': 'l', 'label': 'L', 'keys': ['losses', 'L'], 'categories': ['general']},
                {'key': 'sv', 'label': 'SV', 'keys': ['saves', 'SV'], 'categories': ['defensive']},
                {'key': 'svp', 'label': 'SV%', 'keys': ['savePct', 'SV%'], 'categories': ['defensive']},
                {'key': 'gaa', 'label': 'GAA', 'keys': ['avgGoalsAgainst', 'goalsAgainstAvg', 'GAA'], 'categories': ['defensive']},
                {'key': 'so', 'label': 'SO', 'keys': ['shutouts', 'SO'], 'categories': ['defensive']}
            ]
        },
        'expanded': {
            'statCategories': ['offensive', 'defensive', 'general', 'penalties'],
            'columns': [
                {'key': 'gp', 'label': 'GP', 'keys': ['gamesPlayed', 'GP'], 'categories': ['general']},
                {'key': 'g', 'label': 'G', 'keys': ['goals', 'G'], 'categories': ['offensive']},
                {'key': 'a', 'label': 'A', 'keys': ['assists', 'A'], 'categories': ['offensive']},
                {'key': 'pts', 'label': 'PTS', 'keys': ['points', 'PTS'], 'categories': ['offensive']},
                {'key': 'ppg', 'label': 'PPG', 'keys': ['powerPlayGoals', 'PPG'], 'categories': ['offensive']},
                {'key': 'shg', 'label': 'SHG', 'keys': ['shortHandedGoals', 'SHG'], 'categories': ['offensive']},
                {'key': 's', 'label': 'S', 'keys': ['shotsTotal', 'S'], 'categories': ['offensive']},
                {'key': 'sPct', 'label': 'S%', 'keys': ['shootingPct', 'S%'], 'categories': ['offensive']},
                {'key': 'pm', 'label': '+/-', 'keys': ['plusMinus'], 'categories': ['general']},
                {'key': 'pim', 'label': 'PIM', 'keys': ['penaltyMinutes', 'PIM'], 'categories': ['penalties']},
                {'key': 'toi', 'label': 'TOI/G', 'keys': ['timeOnIcePerGame', 'TOI'], 'categories': ['general']},
                {'key': 'w', 'label': 'W', 'keys': ['wins', 'W'], 'categories': ['general']},
                {'key': 'l', 'label': 'L', 'keys': ['losses', 'L'], 'categories': ['general']},
                {'key': 'ot', 'label': 'OTL', 'keys': ['otLosses', 'OT'], 'categories': ['general']},
                {'key': 'sv', 'label': 'SV', 'keys': ['saves', 'SV'], 'categories': ['defensive']},
                {'key': 'sa', 'label': 'SA', 'keys': ['shotsAgainst', 'SA'], 'categories': ['defensive']},
                {'key': 'svp', 'label': 'SV%', 'keys': ['savePct', 'SV%'], 'categories': ['defensive']},
                {'key': 'gaa', 'label': 'GAA', 'keys': ['avgGoalsAgainst', 'goalsAgainstAvg', 'GAA'], 'categories': ['defensive']},
                {'key': 'ga', 'label': 'GA', 'keys': ['goalsAgainst', 'GA'], 'categories': ['defensive']},
                {'key': 'so', 'label': 'SO', 'keys': ['shutouts', 'SO'], 'categories': ['defensive']}
            ]
        }
    }
}


def normalize_stat_key(value):
    return str(value or '').strip().lower()


def build_stat_key_set(values):
    return {normalize_stat_key(value) for value in values if value}


def resolve_player_stats_schema(league, mode):
    league_schemas = PLAYER_STATS_SCHEMAS.get(league) or {}
    resolved_mode = 'pitching' if str(mode or '').lower() == 'pitching' else DEFAULT_PLAYER_STATS_MODE
    schema = league_schemas.get(resolved_mode)
    if not schema:
        schema = league_schemas.get(DEFAULT_PLAYER_STATS_MODE) or league_schemas.get('pitching')
    return schema


def normalize_player_table_view(value):
    if str(value or '').lower() == 'expanded':
        return 'expanded'
    return DEFAULT_PLAYER_TABLE_VIEW


def resolve_player_table_schema(league, mode, view):
    view_key = normalize_player_table_view(view)
    if league == 'mlb':
        mode_key = 'pitching' if str(mode or '').lower() == 'pitching' else DEFAULT_PLAYER_STATS_MODE
        league_schema = PLAYER_TABLE_SCHEMAS.get('mlb') or {}
        mode_schema = league_schema.get(mode_key) or {}
        return mode_schema.get(view_key) or mode_schema.get(DEFAULT_PLAYER_TABLE_VIEW)
    league_schema = PLAYER_TABLE_SCHEMAS.get(league) or {}
    return league_schema.get(view_key) or league_schema.get(DEFAULT_PLAYER_TABLE_VIEW)


def extract_stat_value_from_categories(categories, column, fallback_categories=None):
    if not categories:
        return None
    keys = build_stat_key_set(column.get('keys') or [])
    if not keys:
        return None

    category_map = {
        normalize_stat_key(category.get('name')): category
        for category in categories
        if category.get('name')
    }

    desired = [
        normalize_stat_key(name)
        for name in (column.get('categories') or fallback_categories or [])
        if name
    ]

    search_categories = []
    if desired:
        for name in desired:
            category = category_map.get(name)
            if category:
                search_categories.append(category)
    if not search_categories:
        search_categories = categories

    def find_in(categories_list):
        for category in categories_list:
            for stat in category.get('stats') or []:
                name_key = normalize_stat_key(stat.get('name'))
                abbr_key = normalize_stat_key(stat.get('abbreviation'))
                display_key = normalize_stat_key(stat.get('displayName'))
                short_key = normalize_stat_key(stat.get('shortDisplayName'))
                if (
                    name_key in keys
                    or abbr_key in keys
                    or display_key in keys
                    or short_key in keys
                ):
                    value = stat.get('displayValue')
                    if value is not None:
                        return value
                    return stat.get('value')
        return None

    value = find_in(search_categories)
    if value is not None:
        return value
    if search_categories is not categories:
        return find_in(categories)
    return None


def get_player_profile(ref):
    ref = normalize_core_ref(ref)
    cached = get_ttl_cached(PLAYER_PROFILE_CACHE, PLAYER_PROFILE_LOCK, ref, PLAYER_PROFILE_CACHE_TTL_SEC)
    if cached:
        return cached
    if not ref:
        return None
    try:
        payload = fetch_json(ref)
    except Exception:
        return None
    pos_data = payload.get('position') or {}
    position = pos_data.get('abbreviation') or pos_data.get('shortName') or pos_data.get('name')
    headshot = payload.get('headshot')
    if isinstance(headshot, dict):
        headshot = headshot.get('href')
    profile = {
        'id': payload.get('id'),
        'displayName': payload.get('displayName') or payload.get('fullName'),
        'shortName': payload.get('shortName') or payload.get('displayName'),
        'headshot': headshot,
        'position': position,
        'teamRef': normalize_core_ref((payload.get('team') or {}).get('$ref')),
        'statsRef': normalize_core_ref((payload.get('statistics') or {}).get('$ref'))
    }
    set_ttl_cached(PLAYER_PROFILE_CACHE, PLAYER_PROFILE_LOCK, ref, profile)
    return profile


def get_player_stats_payload(ref):
    ref = normalize_core_ref(ref)
    cached = get_ttl_cached(PLAYER_STATS_CACHE, PLAYER_STATS_LOCK, ref, PLAYER_STATS_CACHE_TTL_SEC)
    if cached:
        return cached
    if not ref:
        return None
    try:
        payload = fetch_json(ref)
    except Exception:
        return None
    set_ttl_cached(PLAYER_STATS_CACHE, PLAYER_STATS_LOCK, ref, payload)
    return payload


def build_player_index(league, season_year):
    team_refs, source_url = fetch_core_team_refs(league, season_year)
    team_ids = [
        extract_id_from_ref(ref, 'teams')
        for ref in team_refs
        if extract_id_from_ref(ref, 'teams')
    ]
    athletes = []
    seen = set()

    def fetch_roster(team_id):
        try:
            return fetch_team_roster_refs(league, season_year, team_id)
        except Exception as exc:
            logging.warning('Failed to fetch roster for %s team %s: %s', league, team_id, exc)
            return []

    if team_ids:
        max_workers = max(1, min(PLAYER_FETCH_WORKERS, len(team_ids)))
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(fetch_roster, team_id) for team_id in team_ids]
            for future in as_completed(futures):
                refs = future.result() or []
                for ref in refs:
                    ref = normalize_core_ref(ref)
                    if not ref:
                        continue
                    athlete_id = extract_id_from_ref(ref, 'athletes')
                    dedupe_key = athlete_id or ref
                    if dedupe_key in seen:
                        continue
                    seen.add(dedupe_key)
                    athletes.append({
                        'id': athlete_id,
                        'ref': ref,
                        'position': None
                    })

    def sort_key(entry):
        if entry.get('id') and str(entry['id']).isdigit():
            return int(entry['id'])
        return entry.get('ref') or ''

    athletes.sort(key=sort_key)
    return {
        'season': season_year,
        'athletes': athletes,
        'positionIndex': {},
        'source': {
            'teams': source_url
        }
    }


def resolve_player_index(league, season_value):
    season_key = str(season_value or 'current').strip() or 'current'
    cache_key = f"{league}:{season_key}"
    cached, age = get_ttl_cached_with_age(PLAYER_INDEX_CACHE, PLAYER_INDEX_LOCK, cache_key, PLAYER_INDEX_CACHE_TTL_SEC)
    if cached:
        return cached, age, True

    candidates = resolve_core_season_candidates(league, season_key)
    if not candidates:
        return None, None, False

    last_error = None
    for candidate in candidates:
        try:
            index_data = build_player_index(league, candidate)
            if index_data and index_data.get('athletes'):
                set_ttl_cached(PLAYER_INDEX_CACHE, PLAYER_INDEX_LOCK, cache_key, index_data)
                return index_data, 0, False
        except HTTPError as exc:
            last_error = exc
            if exc.code == 404 and season_key == 'current':
                continue
            raise
        except Exception as exc:
            last_error = exc
            logging.error('Failed to build player index: %s', exc)
            continue

    if last_error:
        raise last_error
    return None, None, False


def build_position_index(index_data, league):
    if not index_data:
        return {}
    position_index = index_data.get('positionIndex') or {}
    if position_index:
        return position_index
    athletes = index_data.get('athletes') or []
    if not athletes:
        return position_index

    def resolve_position(entry):
        if entry.get('position'):
            return entry
        profile = get_player_profile(entry.get('ref'))
        if profile:
            entry['position'] = profile.get('position')
        return entry

    max_workers = max(1, min(PLAYER_FETCH_WORKERS, len(athletes)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for entry in executor.map(resolve_position, athletes):
            position = entry.get('position')
            if not position:
                continue
            position_key = str(position).upper()
            position_index.setdefault(position_key, []).append(entry)

    index_data['positionIndex'] = position_index
    return position_index


def select_player_entries(index_data, league, position_filter, page, per_page):
    athletes = index_data.get('athletes') or []
    if not position_filter or str(position_filter).lower() in ('all', 'any', 'all positions'):
        total = len(athletes)
        start = max(0, (page - 1) * per_page)
        end = start + per_page
        return athletes[start:end], total

    position_key = str(position_filter).strip().upper()
    position_index = index_data.get('positionIndex') or {}
    if position_key not in position_index:
        position_index = build_position_index(index_data, league)
    filtered = position_index.get(position_key, [])
    total = len(filtered)
    start = max(0, (page - 1) * per_page)
    end = start + per_page
    return filtered[start:end], total


def build_player_row(args):
    rank, entry, schema, team_cache = args
    profile = get_player_profile(entry.get('ref'))
    if not profile:
        return None
    if profile.get('position') and not entry.get('position'):
        entry['position'] = profile.get('position')
    team_data = None
    if profile.get('teamRef'):
        team_data = resolve_core_payload(profile.get('teamRef'), team_cache)

    stats_payload = None
    if profile.get('statsRef'):
        stats_payload = get_player_stats_payload(profile.get('statsRef'))
    categories = stats_payload.get('splits', {}).get('categories', []) if stats_payload else []

    row_stats = {}
    for column in schema.get('columns') or []:
        key = column.get('key')
        if not key:
            continue
        row_stats[key] = extract_stat_value_from_categories(
            categories,
            column,
            schema.get('statCategories')
        )

    return {
        'rank': rank,
        'athlete': {
            'id': profile.get('id'),
            'displayName': profile.get('displayName'),
            'shortName': profile.get('shortName'),
            'headshot': profile.get('headshot'),
            'position': profile.get('position')
        },
        'team': {
            'id': team_data.get('id') if team_data else None,
            'abbreviation': team_data.get('abbreviation') if team_data else None,
            'displayName': team_data.get('displayName') if team_data else None,
            'logo': select_logo(team_data.get('logos')) if team_data else None
        } if team_data else None,
        'stats': row_stats
    }


def fetch_player_leaders(league, season_value=None, season_type='2', limit=5, mode=DEFAULT_PLAYER_STATS_MODE):
    sport = CORE_SPORTS.get(league)
    if not sport:
        raise ValueError('Unsupported league for player leaders')
    safe_type = str(season_type or '2')
    candidates = resolve_core_season_candidates(league, season_value)
    if not candidates:
        return None, None

    payload = None
    season_year = None
    url = None
    last_error = None
    for candidate in candidates:
        season_year = candidate
        url = f"{CORE_API_BASE}/{sport}/leagues/{league}/seasons/{season_year}/types/{safe_type}/leaders"
        try:
            payload = fetch_json(url)
            break
        except HTTPError as exc:
            last_error = exc
            if exc.code == 404 and (not season_value or str(season_value).lower() == 'current'):
                continue
            raise

    if not payload:
        if last_error:
            raise last_error
        return None, None

    schema = resolve_player_stats_schema(league, mode)
    primary_category = None
    if schema:
        category_key = normalize_stat_key(schema.get('leaderCategory'))
        if category_key:
            for category in payload.get('categories') or []:
                if normalize_stat_key(category.get('name')) == category_key:
                    primary_category = category
                    break
    if not primary_category:
        primary_category = (payload.get('categories') or [None])[0]

    athlete_cache = {}
    team_cache = {}
    stats_cache = {}
    categories = [
        {
            'name': category.get('name'),
            'displayName': category.get('displayName') or category.get('shortDisplayName'),
            'abbreviation': category.get('abbreviation'),
            'leaders': []
        }
        for category in payload.get('categories') or []
    ]

    table = None
    if schema and primary_category:
        columns = schema.get('columns') or []
        table_columns = [
            {
                'key': column.get('key'),
                'label': column.get('label')
            }
            for column in columns
            if column.get('key')
        ]
        rows = []
        for index, entry in enumerate((primary_category.get('leaders') or [])[:limit], start=1):
            athlete_ref = entry.get('athlete', {}).get('$ref') if isinstance(entry.get('athlete'), dict) else None
            team_ref = entry.get('team', {}).get('$ref') if isinstance(entry.get('team'), dict) else None
            athlete_data = resolve_core_payload(athlete_ref, athlete_cache) if athlete_ref else None
            team_data = resolve_core_payload(team_ref, team_cache) if team_ref else None
            if athlete_data and not team_data:
                team_ref = athlete_data.get('team', {}).get('$ref') if isinstance(athlete_data.get('team'), dict) else None
                team_data = resolve_core_payload(team_ref, team_cache) if team_ref else None

            position = None
            if athlete_data:
                pos_data = athlete_data.get('position') or {}
                position = pos_data.get('abbreviation') or pos_data.get('shortName') or pos_data.get('name')

            stats_ref = entry.get('statistics', {}).get('$ref') if isinstance(entry.get('statistics'), dict) else None
            stats_payload = resolve_core_payload(stats_ref, stats_cache) if stats_ref else None
            stat_categories = stats_payload.get('splits', {}).get('categories', []) if stats_payload else []

            row_stats = {}
            for column in columns:
                key = column.get('key')
                if not key:
                    continue
                value = extract_stat_value_from_categories(stat_categories, column, schema.get('statCategories'))
                row_stats[key] = value

            rows.append({
                'rank': index,
                'athlete': {
                    'id': athlete_data.get('id') if athlete_data else None,
                    'displayName': athlete_data.get('displayName') if athlete_data else None,
                    'shortName': athlete_data.get('shortName') if athlete_data else None,
                    'headshot': (athlete_data.get('headshot') or {}).get('href')
                    if isinstance(athlete_data.get('headshot'), dict)
                    else athlete_data.get('headshot') if athlete_data else None,
                    'position': position
                } if athlete_data else None,
                'team': {
                    'id': team_data.get('id') if team_data else None,
                    'abbreviation': team_data.get('abbreviation') if team_data else None,
                    'displayName': team_data.get('displayName') if team_data else None,
                    'logo': select_logo(team_data.get('logos')) if team_data else None
                } if team_data else None,
                'stats': row_stats
            })

        if table_columns and rows:
            table = {
                'columns': table_columns,
                'rows': rows,
                'category': primary_category.get('name') if primary_category else None
            }

    return {
        'league': league,
        'season': season_year,
        'seasonType': safe_type,
        'limit': limit,
        'mode': str(mode or DEFAULT_PLAYER_STATS_MODE).lower(),
        'categories': categories,
        'table': table,
        'meta': {
            'source': url,
            'cacheAgeSec': 0,
            'stale': False,
            'fromCache': False
        }
    }, url


def get_cached_stats(key):
    if not key:
        return None
    entry = STATS_CACHE.get(key)
    if not entry:
        return None
    if time.time() - entry['ts'] > STATS_CACHE_TTL_SEC:
        return None
    return copy.deepcopy(entry['data'])


def set_cached_stats(key, payload):
    if not key:
        return
    STATS_CACHE[key] = {
        'ts': time.time(),
        'data': copy.deepcopy(payload)
    }


def fetch_matches(endpoint):
    last_error = None
    for base in API_BASES:
        url = f"{base.rstrip('/')}/{endpoint.lstrip('/')}"
        try:
            data = fetch_json(url)
            if isinstance(data, list):
                return data, base
            return [], base
        except Exception as exc:
            last_error = exc
            logging.warning('Failed to fetch %s from %s: %s', endpoint, base, exc)
    if last_error:
        raise last_error
    raise RuntimeError('Failed to fetch matches')


def to_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def select_logo(logos):
    if not logos:
        return None
    best = max(
        logos,
        key=lambda logo: (
            to_int(logo.get('width')),
            to_int(logo.get('height'))
        )
    )
    return best.get('href') or logos[0].get('href')


def normalize_category(value):
    if not value:
        return ''
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')


def build_streamed_logo(badge):
    if not badge:
        return None
    if isinstance(badge, str):
        cleaned = badge.strip()
        if not cleaned:
            return None
        if cleaned.startswith('http://') or cleaned.startswith('https://'):
            return cleaned
        if cleaned.startswith('/'):
            return f"{STREAMED_IMAGE_BASE.rstrip('/')}{cleaned}"
        if cleaned.startswith('api/images/') or cleaned.startswith('images/'):
            return f"{STREAMED_IMAGE_BASE.rstrip('/')}/{cleaned}"
        extension = os.path.splitext(cleaned)[1].lower()
        if extension in ('.webp', '.png', '.jpg', '.jpeg', '.svg'):
            return f"{STREAMED_IMAGE_BASE.rstrip('/')}/api/images/badge/{cleaned}"
        return f"{STREAMED_IMAGE_BASE.rstrip('/')}/api/images/badge/{cleaned}.webp"
    return None


def build_streamed_poster(poster):
    if not poster:
        return None
    if isinstance(poster, str):
        cleaned = poster.strip()
        if not cleaned:
            return None
        if cleaned.startswith('http://') or cleaned.startswith('https://'):
            return cleaned
        if cleaned.startswith('/'):
            path = cleaned
            if not os.path.splitext(path)[1]:
                path = f"{path}.webp"
            return f"{STREAMED_IMAGE_BASE.rstrip('/')}{path}"
        if cleaned.startswith('api/images/') or cleaned.startswith('images/'):
            path = f"/{cleaned.lstrip('/')}"
            if not os.path.splitext(path)[1]:
                path = f"{path}.webp"
            return f"{STREAMED_IMAGE_BASE.rstrip('/')}{path}"
        extension = os.path.splitext(cleaned)[1].lower()
        if extension in ('.webp', '.png', '.jpg', '.jpeg', '.svg'):
            return f"{STREAMED_IMAGE_BASE.rstrip('/')}/api/images/proxy/{cleaned}"
        return f"{STREAMED_IMAGE_BASE.rstrip('/')}/api/images/proxy/{cleaned}.webp"
    return None


def build_streamed_team(team_data):
    if not team_data:
        return None
    name = team_data.get('name') or ''
    logo = build_streamed_logo(team_data.get('badge') or team_data.get('logo'))
    return {
        'name': name,
        'logo': logo
    } if name or logo else None


def parse_espn_teams(payload):
    teams = []
    for sport in payload.get('sports', []):
        for league in sport.get('leagues', []):
            for entry in league.get('teams', []):
                team = entry.get('team') or {}
                abbreviation = team.get('abbreviation')
                if not abbreviation:
                    continue
                display_name = team.get('displayName') or team.get('shortDisplayName') or team.get('name')
                short_name = team.get('shortDisplayName') or team.get('abbreviation') or display_name
                teams.append({
                    'id': team.get('id'),
                    'abbreviation': abbreviation.upper(),
                    'name': display_name,
                    'shortName': short_name,
                    'logo': select_logo(team.get('logos') or []),
                    'color': team.get('color'),
                    'alternateColor': team.get('alternateColor'),
                    'alternateColor2': team.get('alternateColor2'),
                    'alternateColor3': team.get('alternateColor3'),
                    'primaryColor': team.get('primaryColor'),
                    'secondaryColor': team.get('secondaryColor')
                })
    return teams


def fetch_espn_teams(league):
    url = ESPN_TEAM_ENDPOINTS.get(league)
    if not url:
        raise ValueError(f"Unsupported league: {league}")
    data = fetch_json(url)
    return parse_espn_teams(data), url


def get_teams(league, force_refresh=False):
    cache = TEAM_CACHES.get(league)
    if not cache:
        return {'teams': []}, 0, False, False
    snapshot = cache.snapshot()
    cache_age = int(time.time()) - int(snapshot.get('last_fetch') or 0)
    cache_valid = cache_age < TEAM_CACHE_TTL_SEC

    if force_refresh or not cache_valid:
        try:
            teams, source = fetch_espn_teams(league)
            cache.update(teams, source)
            snapshot = cache.snapshot()
            cache_age = 0
            cache_valid = True
        except Exception as exc:
            cache.mark_error(str(exc))
            logging.error('ESPN teams fetch failed: %s', exc)
            if snapshot.get('teams') and cache_age <= TEAM_CACHE_STALE_SEC:
                return snapshot, cache_age, True, True
            return snapshot, cache_age, False, False

    return snapshot, cache_age, True, False


def extract_stat(stats, names):
    for stat in stats:
        if stat.get('name') in names:
            return stat.get('displayValue') if stat.get('displayValue') is not None else stat.get('value')
    return None


def parse_espn_standings(payload):
    groups = []
    season = None
    season_type = None
    league_name = payload.get('shortName') or payload.get('name') or payload.get('abbreviation')

    def parse_entries(entries):
        parsed = []
        for entry in entries or []:
            team = entry.get('team') or {}
            stats = entry.get('stats') or []
            parsed.append({
                'team': {
                    'id': team.get('id'),
                    'name': team.get('displayName') or team.get('shortDisplayName') or team.get('name'),
                    'abbreviation': team.get('abbreviation'),
                    'logo': select_logo(team.get('logos') or [])
                },
                'stats': {
                    'wins': extract_stat(stats, ['wins']),
                    'losses': extract_stat(stats, ['losses']),
                    'ties': extract_stat(stats, ['ties']),
                    'otLosses': extract_stat(stats, ['otLosses', 'overtimeLosses']),
                    'winPercent': extract_stat(stats, ['winPercent', 'pointsPercentage']),
                    'points': extract_stat(stats, ['points']),
                    'gamesBehind': extract_stat(stats, ['gamesBehind', 'gamesBack']),
                    'streak': extract_stat(stats, ['streak'])
                }
            })
        return parsed

    def add_group(name, standings):
        nonlocal season, season_type
        if not standings:
            return
        season = season or standings.get('seasonDisplayName') or str(standings.get('season') or '')
        season_type = season_type or standings.get('seasonType')
        groups.append({
            'name': name or 'Standings',
            'entries': parse_entries(standings.get('entries', []))
        })

    children = payload.get('children') or []
    if children:
        for child in children:
            group_name = child.get('shortName') or child.get('name') or child.get('abbreviation')
            add_group(group_name, child.get('standings'))
    else:
        add_group(league_name, payload.get('standings'))

    return {
        'league': league_name,
        'season': season,
        'seasonType': season_type,
        'groups': groups
    }


def fetch_espn_standings(league, season=None):
    url = ESPN_STANDINGS_ENDPOINTS.get(league)
    if not url:
        raise ValueError(f"Unsupported standings league: {league}")
    if season:
        separator = '&' if '?' in url else '?'
        url = f"{url}{separator}season={season}"
    data = fetch_json(url)
    return parse_espn_standings(data), url


def get_standings(league, season=None, force_refresh=False):
    cache = get_standings_cache(league, season)
    if not cache:
        return {'standings': []}, 0, False, False
    snapshot = cache.snapshot()
    cache_age = int(time.time()) - int(snapshot.get('last_fetch') or 0)
    cache_valid = cache_age < STANDINGS_CACHE_TTL_SEC

    if force_refresh or not cache_valid:
        try:
            standings, source = fetch_espn_standings(league, season=season)
            cache.update(standings, source)
            snapshot = cache.snapshot()
            cache_age = 0
            cache_valid = True
        except Exception as exc:
            cache.mark_error(str(exc))
            logging.error('ESPN standings fetch failed: %s', exc)
            if snapshot.get('standings') and cache_age <= STANDINGS_CACHE_STALE_SEC:
                return snapshot, cache_age, True, True
            return snapshot, cache_age, False, False

    return snapshot, cache_age, True, False


def probe_url(url):
    def attempt(method):
        start = time.time()
        try:
            headers = {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml'
            }
            if method == 'GET':
                headers['Range'] = 'bytes=0-1024'
            request = Request(url, headers=headers, method=method)
            with urlopen(request, timeout=REQUEST_TIMEOUT_SEC) as response:
                latency_ms = int((time.time() - start) * 1000)
                return response.status, latency_ms, None
        except HTTPError as exc:
            latency_ms = int((time.time() - start) * 1000)
            return exc.code, latency_ms, None
        except URLError as exc:
            latency_ms = int((time.time() - start) * 1000)
            return None, latency_ms, str(exc)

    status, latency_ms, error = attempt('HEAD')
    if status == 405 or status is None:
        status, latency_ms, error = attempt('GET')

    return status, latency_ms, error


def map_health_status(status_code, error):
    if status_code is None:
        return 'unknown'
    if status_code < 400:
        return 'up'
    if status_code in (401, 403):
        return 'unknown'
    return 'down'


def build_health_payload(status_code, latency_ms, error):
    return {
        'status': map_health_status(status_code, error),
        'httpStatus': status_code,
        'latencyMs': latency_ms,
        'checkedAt': datetime.now(tz=timezone.utc).isoformat(),
        'error': error
    }


def check_source_health(source, slug, stream_id=1):
    safe_source = sanitize_slug(source)
    safe_slug = sanitize_slug(slug)
    if not safe_source or not safe_slug:
        return {
            'status': 'unknown',
            'httpStatus': None,
            'latencyMs': None,
            'checkedAt': datetime.now(tz=timezone.utc).isoformat(),
            'error': 'invalid_source_or_slug'
        }

    url = f"{EMBED_BASE_URL.rstrip('/')}/{safe_source}/{safe_slug}/{stream_id}"
    status, latency_ms, error = probe_url(url)
    return build_health_payload(status, latency_ms, error)


def annotate_sources(sources, include_health, checks_budget=None):
    annotated = []
    if checks_budget is None:
        checks_budget = {'count': MAX_HEALTH_CHECKS}

    for src in sources:
        source_name = src.get('source') or ''
        source_id = src.get('id') or ''
        payload = {
            'source': source_name,
            'id': source_id
        }

        if include_health:
            key = f"{source_name}:{source_id}:1"
            cached = HEALTH_CACHE.get(key)
            if cached is None and checks_budget['count'] > 0:
                cached = check_source_health(source_name, source_id, 1)
                HEALTH_CACHE.set(key, cached)
                checks_budget['count'] -= 1
            if cached is None:
                cached = {
                    'status': 'unknown',
                    'httpStatus': None,
                    'latencyMs': None,
                    'checkedAt': None,
                    'error': 'health_check_budget_exhausted'
                }
            payload['health'] = cached

        annotated.append(payload)

    return annotated


def sort_sources(sources):
    def source_rank(source):
        safe_source = source if isinstance(source, dict) else {}
        name = safe_source.get('source') or ''
        health = (safe_source.get('health') or {}).get('status')
        health_key = health if isinstance(health, str) else ''
        health_score = {
            'up': 0,
            'unknown': 1,
            'down': 2
        }.get(health_key, 1)
        try:
            pref_index = SOURCE_PREFERENCE.index(name)
        except ValueError:
            pref_index = len(SOURCE_PREFERENCE)
        return (health_score, pref_index)

    return sorted(sources, key=source_rank)


def parse_match(match, is_live=False, include_health=False, league='nfl'):
    match_id = match.get('id') or ''
    title = match.get('title') or ''
    category = (match.get('category') or '').lower()
    timestamp = match.get('date') or now_ms()
    now = now_ms()
    live_cutoff_ms = LIVE_MAX_AGE_SEC * 1000
    ended_cutoff_ms = ENDED_GRACE_SEC * 1000
    is_live_now = bool(is_live) and (now - timestamp) <= live_cutoff_ms
    is_upcoming = not is_live_now and timestamp > now
    is_ended = not is_live_now and timestamp <= (now - ended_cutoff_ms)

    raw_sources = []
    for source in match.get('sources') or []:
        source_name = source.get('source')
        source_id = source.get('id')
        if not source_name or not source_id:
            continue
        raw_sources.append({
            'source': source_name,
            'id': source_id
        })

    if not raw_sources and match_id:
        raw_sources = [{
            'source': 'admin',
            'id': match_id
        }]

    annotated = annotate_sources(raw_sources, include_health)
    sorted_sources = sort_sources(annotated)
    best_source = sorted_sources[0] if sorted_sources else {'source': 'admin', 'id': match_id}

    teams_data = match.get('teams') or {}
    home_team = build_streamed_team(teams_data.get('home'))
    away_team = build_streamed_team(teams_data.get('away'))
    teams_payload = None
    if home_team or away_team:
        teams_payload = {
            'home': home_team,
            'away': away_team
        }

    poster_url = build_streamed_poster(match.get('poster'))

    return {
        'id': f"api_{match_id}" if match_id else f"api_{sanitize_slug(title) or now_ms()}",
        'matchId': match_id,
        'slug': best_source.get('id') or match_id,
        'title': title,
        'poster': poster_url,
        'category': category,
        'sport': normalize_category(category),
        'gameTime': iso_from_ms(timestamp),
        'timestamp': timestamp,
        'isLive': is_live_now,
        'isUpcoming': is_upcoming,
        'isEnded': is_ended,
        'isPopular': bool(match.get('popular')),
        'sources': sorted_sources,
        'currentSource': best_source.get('source') or 'admin',
        'source': 'api',
        'league': league,
        'teams': teams_payload
    }


def build_match_cache(force_refresh=False):
    snapshot = GAME_CACHE.snapshot()
    cache_age = int(time.time()) - int(snapshot.get('last_fetch') or 0)
    cache_valid = cache_age < CACHE_TTL_SEC

    if force_refresh or not cache_valid:
        try:
            live_matches, live_source = fetch_matches('/matches/live')
            all_matches, all_source = fetch_matches('/matches/all')

            GAME_CACHE.update(live_matches, all_matches, live_source or all_source)
            snapshot = GAME_CACHE.snapshot()
            cache_age = 0
            cache_valid = True
        except Exception as exc:
            GAME_CACHE.mark_error(str(exc))
            logging.error('Upstream fetch failed: %s', exc)

            if cache_age <= CACHE_STALE_SEC and snapshot.get('live') is not None:
                return snapshot, cache_age, True, True
            return snapshot, cache_age, False, False

    return snapshot, cache_age, True, False


def filter_matches_for_league(matches, league):
    if league in LEAGUE_CONFIGS:
        return [match for match in matches if is_league_match(match, league)]
    return []


def identify_match_league(match):
    for league_key in PRIORITY_LEAGUES:
        if is_league_match(match, league_key):
            return league_key
    for league_key in LEAGUE_CONFIGS.keys():
        if is_league_match(match, league_key):
            return league_key
    return None


def build_games_for_league(snapshot, league):
    live_matches = filter_matches_for_league(snapshot.get('live', []), league)
    all_matches = filter_matches_for_league(snapshot.get('all', []), league)

    live_ids = {m.get('id') for m in live_matches if m.get('id')}

    live_games = [
        parse_match(m, is_live=True, include_health=False, league=league)
        for m in live_matches
    ]
    upcoming_games = [
        parse_match(m, is_live=False, include_health=False, league=league)
        for m in all_matches
        if not m.get('id') or m.get('id') not in live_ids
    ]

    live_games.sort(key=lambda g: g.get('timestamp', 0))
    upcoming_games.sort(key=lambda g: g.get('timestamp', 0))

    return live_games + upcoming_games


def build_games_for_all(snapshot):
    live_matches = snapshot.get('live', []) or []
    all_matches = snapshot.get('all', []) or []
    live_ids = {m.get('id') for m in live_matches if m.get('id')}

    live_games = []
    for match in live_matches:
        league = identify_match_league(match)
        if not league:
            continue
        live_games.append(parse_match(match, is_live=True, include_health=False, league=league))

    upcoming_games = []
    for match in all_matches:
        if match.get('id') and match.get('id') in live_ids:
            continue
        league = identify_match_league(match)
        if not league:
            continue
        upcoming_games.append(parse_match(match, is_live=False, include_health=False, league=league))

    live_games.sort(key=lambda g: g.get('timestamp', 0))
    upcoming_games.sort(key=lambda g: g.get('timestamp', 0))

    return live_games + upcoming_games


def apply_health_to_games(games):
    budget = {'count': MAX_HEALTH_CHECKS}
    updated = []
    for game in games:
        sources = game.get('sources') or []
        annotated = annotate_sources(sources, include_health=True, checks_budget=budget)
        sorted_sources = sort_sources(annotated)
        best_source = sorted_sources[0] if sorted_sources else {
            'source': game.get('currentSource') or 'admin',
            'id': game.get('slug')
        }

        game_copy = copy.deepcopy(game)
        game_copy['sources'] = sorted_sources
        game_copy['currentSource'] = best_source.get('source') or game_copy.get('currentSource')
        game_copy['slug'] = best_source.get('id') or game_copy.get('slug')
        updated.append(game_copy)

    return updated


def filter_games(games, filter_value):
    if filter_value == 'live':
        return [g for g in games if g.get('isLive')]
    if filter_value == 'upcoming':
        return [g for g in games if g.get('isUpcoming') and not g.get('isLive')]
    return games


def sort_games(games, league):
    if league == 'all':
        priority = {key: index for index, key in enumerate(PRIORITY_LEAGUES)}
        return sorted(
            games,
            key=lambda g: (
                priority.get(g.get('league'), len(priority)),
                not g.get('isLive'),
                g.get('timestamp', 0)
            )
        )
    return sorted(games, key=lambda g: (not g.get('isLive'), g.get('timestamp', 0)))


def find_game_by_slug(games, slug):
    if not slug:
        return None
    normalized = sanitize_slug(slug)
    for game in games:
        if normalized in (sanitize_slug(game.get('slug')), sanitize_slug(game.get('matchId'))):
            return game
        for source in game.get('sources') or []:
            if normalized == sanitize_slug(source.get('id')):
                match = copy.deepcopy(game)
                match['slug'] = source.get('id')
                match['currentSource'] = source.get('source')
                return match
    return None


class RequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        if path == '/health':
            snapshot = GAME_CACHE.snapshot()
            cache_age = int(time.time()) - int(snapshot.get('last_fetch') or 0)
            payload = {
                'status': 'ok',
                'cacheAgeSec': cache_age,
                'lastFetch': snapshot.get('last_fetch'),
                'lastError': snapshot.get('last_error'),
                'upstreamBase': snapshot.get('last_source')
            }
            return self._send_json(200, payload)

        if path == '/teams':
            league = (query.get('league') or ['nfl'])[0].lower()
            force_refresh = (query.get('force') or ['0'])[0] in ('1', 'true', 'yes')

            if league == 'all':
                teams = []
                stale = False
                cache_age = 0
                for league_key in LEAGUE_CONFIGS.keys():
                    snapshot, league_age, cache_ok, league_stale = get_teams(league_key, force_refresh=force_refresh)
                    if not cache_ok:
                        continue
                    league_teams = [
                        {**team, 'league': league_key}
                        for team in snapshot.get('teams', [])
                    ]
                    teams.extend(league_teams)
                    stale = stale or league_stale
                    cache_age = max(cache_age, league_age)

                return self._send_json(200, {
                    'teams': teams,
                    'meta': {
                        'count': len(teams),
                        'league': 'all',
                        'cacheAgeSec': cache_age,
                        'stale': stale
                    }
                })

            snapshot, cache_age, cache_ok, stale = get_teams(league, force_refresh=force_refresh)
            if not cache_ok:
                return self._send_json(502, {
                    'error': 'upstream_unavailable',
                    'message': snapshot.get('last_error'),
                    'teams': []
                })

            payload = {
                'teams': [
                    {**team, 'league': league}
                    for team in snapshot.get('teams', [])
                ],
                'meta': {
                    'count': len(snapshot.get('teams', [])),
                    'league': league,
                    'cacheAgeSec': cache_age,
                    'stale': stale,
                    'upstreamBase': snapshot.get('last_source')
                }
            }
            return self._send_json(200, payload)

        if path == '/stats':
            league = (query.get('league') or ['nfl'])[0].lower()
            away_name = (query.get('away') or [''])[0]
            home_name = (query.get('home') or [''])[0]
            away_abbr = (query.get('abbrAway') or [''])[0]
            home_abbr = (query.get('abbrHome') or [''])[0]
            date_value = format_scoreboard_date((query.get('date') or [''])[0])
            force_refresh = (query.get('force') or ['0'])[0] in ('1', 'true', 'yes')

            scoreboard = fetch_espn_scoreboard(league, date_value)
            event = find_espn_event(scoreboard, away_abbr, home_abbr, away_name, home_name)
            if not event and date_value:
                scoreboard = fetch_espn_scoreboard(league, None)
                event = find_espn_event(scoreboard, away_abbr, home_abbr, away_name, home_name)

            if not event:
                return self._send_json(404, {
                    'error': 'event_not_found',
                    'message': 'Unable to locate ESPN event for this matchup.'
                })

            event_id = event.get('id')
            cache_key = f"{league}:{event_id}"
            cached = None if force_refresh else get_cached_stats(cache_key)
            if cached:
                return self._send_json(200, cached)

            summary = fetch_espn_summary(league, event_id)
            if not summary:
                return self._send_json(502, {
                    'error': 'summary_unavailable',
                    'message': 'Unable to fetch ESPN summary.'
                })

            win_probability = summary.get('winProbability') or summary.get('winprobability')
            payload = {
                'eventId': event_id,
                'league': league,
                'header': summary.get('header'),
                'boxscore': summary.get('boxscore'),
                'leaders': summary.get('leaders'),
                'injuries': summary.get('injuries'),
                'broadcasts': summary.get('broadcasts'),
                'gameInfo': summary.get('gameInfo'),
                'notes': summary.get('notes'),
                'standings': summary.get('standings'),
                'drives': summary.get('drives'),
                'plays': summary.get('plays'),
                'scoringPlays': summary.get('scoringPlays'),
                'winProbability': win_probability,
                'probability': summary.get('probability'),
                'odds': summary.get('odds'),
                'meta': {
                    'source': summary.get('meta', {}),
                    'date': date_value
                }
            }
            set_cached_stats(cache_key, payload)
            return self._send_json(200, payload)

        if path == '/players':
            league = (query.get('league') or ['nfl'])[0].lower()
            season_value = (query.get('season') or ['current'])[0]
            view_value = (query.get('view') or ['standard'])[0]
            mode_value = (query.get('mode') or [DEFAULT_PLAYER_STATS_MODE])[0]
            position_value = (query.get('position') or ['all'])[0]
            page_value = (query.get('page') or ['1'])[0]
            per_page_value = (query.get('perPage') or query.get('per_page') or ['50'])[0]
            force_refresh = (query.get('force') or ['0'])[0] in ('1', 'true', 'yes')

            if league not in CORE_SPORTS:
                return self._send_json(400, {
                    'error': 'unsupported_league',
                    'message': 'Player stats are only available for NFL, NBA, MLB, and NHL.'
                })

            try:
                page = max(1, int(page_value))
            except ValueError:
                page = 1

            try:
                per_page = int(per_page_value)
            except ValueError:
                per_page = 50
            per_page = max(10, min(200, per_page))

            view_key = normalize_player_table_view(view_value)
            mode_key = 'pitching' if str(mode_value or '').lower() == 'pitching' else DEFAULT_PLAYER_STATS_MODE
            schema = resolve_player_table_schema(league, mode_key, view_key)
            if not schema:
                return self._send_json(400, {
                    'error': 'unsupported_view',
                    'message': 'Player stats are unavailable for the requested view.'
                })

            season_key = str(season_value or 'current').strip() or 'current'
            position_value = str(position_value or '').strip() or 'all'
            cache_key = f"{league}:{season_key}:{view_key}:{mode_key}:{position_value}:{page}:{per_page}"
            cached, age = (None, None)
            if not force_refresh:
                cached, age = get_ttl_cached_with_age(
                    PLAYER_PAGE_CACHE,
                    PLAYER_PAGE_LOCK,
                    cache_key,
                    PLAYER_PAGE_CACHE_TTL_SEC
                )
            if cached:
                meta = cached.get('meta') or {}
                meta['cacheAgeSec'] = age or 0
                meta['fromCache'] = True
                cached['meta'] = meta
                return self._send_json(200, cached)

            try:
                index_data, index_age, index_from_cache = resolve_player_index(league, season_key)
            except HTTPError as exc:
                logging.error('Player index fetch failed: %s', exc)
                if exc.code == 404:
                    return self._send_json(404, {
                        'error': 'season_not_found',
                        'message': 'No player stats found for the requested season.'
                    })
                return self._send_json(502, {
                    'error': 'players_unavailable',
                    'message': str(exc)
                })
            except Exception as exc:
                logging.error('Player index fetch failed: %s', exc)
                return self._send_json(502, {
                    'error': 'players_unavailable',
                    'message': str(exc)
                })

            if not index_data or not index_data.get('athletes'):
                return self._send_json(404, {
                    'error': 'players_not_found',
                    'message': 'No player stats available for this season.'
                })

            entries, total = select_player_entries(index_data, league, position_value, page, per_page)
            max_page = max(1, (total + per_page - 1) // per_page)
            if page > max_page:
                page = max_page
                entries, total = select_player_entries(index_data, league, position_value, page, per_page)

            start_rank = (page - 1) * per_page + 1
            team_cache = {}
            args_list = [
                (start_rank + offset, entry, schema, team_cache)
                for offset, entry in enumerate(entries)
            ]
            rows = []
            if args_list:
                max_workers = max(1, min(PLAYER_FETCH_WORKERS, len(args_list)))
                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    for row in executor.map(build_player_row, args_list):
                        if row:
                            rows.append(row)

            columns = [
                {'key': column.get('key'), 'label': column.get('label')}
                for column in (schema.get('columns') or [])
                if column.get('key')
            ]

            payload = {
                'league': league,
                'season': index_data.get('season'),
                'view': view_key,
                'mode': mode_key if league == 'mlb' else None,
                'position': position_value,
                'page': page,
                'perPage': per_page,
                'total': total,
                'table': {
                    'columns': columns,
                    'rows': rows
                },
                'meta': {
                    'source': index_data.get('source'),
                    'cacheAgeSec': index_age or 0,
                    'fromCache': index_from_cache
                }
            }

            set_ttl_cached(PLAYER_PAGE_CACHE, PLAYER_PAGE_LOCK, cache_key, payload)
            return self._send_json(200, payload)

        if path == '/leaders':
            league = (query.get('league') or ['nfl'])[0].lower()
            season_value = (query.get('season') or ['current'])[0]
            season_type = (query.get('type') or query.get('seasontype') or ['2'])[0]
            mode_value = (query.get('mode') or ['hitting'])[0]
            limit_value = (query.get('limit') or ['5'])[0]
            force_refresh = (query.get('force') or ['0'])[0] in ('1', 'true', 'yes')

            if league not in CORE_SPORTS:
                return self._send_json(400, {
                    'error': 'unsupported_league',
                    'message': 'Player leaders are only available for NFL, NBA, MLB, and NHL.'
                })

            try:
                limit = max(1, min(25, int(limit_value)))
            except ValueError:
                limit = 5

            season_key = str(season_value or 'current').strip() or 'current'
            mode_key = str(mode_value or DEFAULT_PLAYER_STATS_MODE).strip().lower() or DEFAULT_PLAYER_STATS_MODE
            cache_key = f"{league}:{season_key}:{season_type}:{limit}:{mode_key}"
            cached = None if force_refresh else get_cached_player_leaders(cache_key)
            if cached:
                return self._send_json(200, cached)

            try:
                payload, _ = fetch_player_leaders(
                    league,
                    season_value=season_key,
                    season_type=season_type,
                    limit=limit,
                    mode=mode_key
                )
            except HTTPError as exc:
                logging.error('Player leaders fetch failed: %s', exc)
                if exc.code == 404:
                    return self._send_json(404, {
                        'error': 'season_not_found',
                        'message': 'No player leaders found for the requested season.'
                    })
                return self._send_json(502, {
                    'error': 'leaders_unavailable',
                    'message': str(exc)
                })
            except Exception as exc:
                logging.error('Player leaders fetch failed: %s', exc)
                return self._send_json(502, {
                    'error': 'leaders_unavailable',
                    'message': str(exc)
                })

            if not payload:
                return self._send_json(404, {
                    'error': 'season_not_found',
                    'message': 'No player leaders found for the requested season.'
                })

            set_cached_player_leaders(cache_key, payload)
            return self._send_json(200, payload)

        if path == '/standings':
            league = (query.get('league') or ['nfl'])[0].lower()
            force_refresh = (query.get('force') or ['0'])[0] in ('1', 'true', 'yes')
            season_value = (query.get('season') or [''])[0].strip()
            season = season_value if season_value.isdigit() else None

            if league == 'all':
                standings_payload = []
                stale = False
                cache_age = 0
                for league_key in ESPN_STANDINGS_ENDPOINTS.keys():
                    snapshot, league_age, cache_ok, league_stale = get_standings(
                        league_key,
                        season=season,
                        force_refresh=force_refresh
                    )
                    if not cache_ok:
                        continue
                    standings = snapshot.get('standings') or {}
                    if not isinstance(standings, dict):
                        standings = {}
                    standings_payload.append({
                        'league': league_key,
                        **standings
                    })
                    stale = stale or league_stale
                    cache_age = max(cache_age, league_age)

                return self._send_json(200, {
                    'standings': standings_payload,
                    'meta': {
                        'count': len(standings_payload),
                        'league': 'all',
                        'season': season or 'current',
                        'cacheAgeSec': cache_age,
                        'stale': stale
                    }
                })

            snapshot, cache_age, cache_ok, stale = get_standings(league, season=season, force_refresh=force_refresh)
            if not cache_ok:
                return self._send_json(502, {
                    'error': 'upstream_unavailable',
                    'message': snapshot.get('last_error'),
                    'standings': []
                })

            payload = {
                'standings': snapshot.get('standings') or {},
                'meta': {
                    'league': league,
                    'season': season or 'current',
                    'cacheAgeSec': cache_age,
                    'stale': stale,
                    'upstreamBase': snapshot.get('last_source')
                }
            }
            return self._send_json(200, payload)

        if path == '/games':
            filter_value = (query.get('filter') or ['all'])[0]
            include_health = (query.get('includeHealth') or ['0'])[0] in ('1', 'true', 'yes')
            force_refresh = (query.get('force') or ['0'])[0] in ('1', 'true', 'yes')
            league = (query.get('league') or ['all'])[0].lower()

            snapshot, cache_age, cache_ok, stale = build_match_cache(force_refresh=force_refresh)
            if not cache_ok:
                return self._send_json(502, {
                    'error': 'upstream_unavailable',
                    'message': snapshot.get('last_error'),
                    'games': []
                })

            if league == 'all':
                games = build_games_for_all(snapshot)
            else:
                games = build_games_for_league(snapshot, league)

            if include_health:
                games = apply_health_to_games(games)

            games = filter_games(games, filter_value)
            games = sort_games(games, league)

            payload = {
                'games': games,
                'meta': {
                    'count': len(games),
                    'filter': filter_value,
                    'league': league,
                    'cacheAgeSec': cache_age,
                    'stale': stale,
                    'upstreamBase': snapshot.get('last_source')
                }
            }
            return self._send_json(200, payload)

        if path.startswith('/games/'):
            slug = unquote(path.split('/games/', 1)[1])
            include_health = (query.get('includeHealth') or ['0'])[0] in ('1', 'true', 'yes')
            force_refresh = (query.get('force') or ['0'])[0] in ('1', 'true', 'yes')
            league = (query.get('league') or ['all'])[0].lower()

            snapshot, cache_age, cache_ok, stale = build_match_cache(force_refresh=force_refresh)
            if not cache_ok:
                return self._send_json(502, {
                    'error': 'upstream_unavailable',
                    'message': snapshot.get('last_error')
                })

            if league == 'all':
                games = build_games_for_all(snapshot)
            else:
                games = build_games_for_league(snapshot, league)

            if include_health:
                games = apply_health_to_games(games)

            match = find_game_by_slug(games, slug)
            if not match:
                return self._send_json(404, {'error': 'not_found'})

            payload = {
                'game': match,
                'meta': {
                    'cacheAgeSec': cache_age,
                    'stale': stale,
                    'upstreamBase': snapshot.get('last_source'),
                    'league': league
                }
            }
            return self._send_json(200, payload)

        if path == '/streams/check':
            slug = (query.get('slug') or [''])[0]
            source = (query.get('source') or ['admin'])[0]
            try:
                stream_id = int((query.get('stream') or ['1'])[0])
            except ValueError:
                stream_id = 1
            health = check_source_health(source, slug, stream_id)
            return self._send_json(200, {
                'slug': slug,
                'source': source,
                'stream': stream_id,
                'health': health
            })

        self._send_json(404, {'error': 'not_found'})

    def log_message(self, format, *args):
        logging.info('%s - %s', self.address_string(), format % args)


def run_server(port):
    server = ThreadingHTTPServer(('0.0.0.0', port), RequestHandler)
    logging.info('Python service listening on port %s', port)
    server.serve_forever()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=int(os.environ.get('PY_SERVICE_PORT', '8001')))
    args = parser.parse_args()

    run_server(args.port)


if __name__ == '__main__':
    main()
