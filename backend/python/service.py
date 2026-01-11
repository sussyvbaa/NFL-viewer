#!/usr/bin/env python3
import argparse
import copy
import json
import logging
import os
import re
import threading
import time
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
    raise last_error


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
    raise last_error


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
                    'logo': select_logo(team.get('logos') or [])
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
        name = source.get('source') or ''
        health = (source.get('health') or {}).get('status')
        health_score = {
            'up': 0,
            'unknown': 1,
            'down': 2
        }.get(health, 1)
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
        self.end_headers()
        self.wfile.write(body)

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
                    standings_payload.append({
                        'league': league_key,
                        **(snapshot.get('standings') or {})
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
