/**
 * Teams Data Module
 *
 * Complete list of NFL, NBA, MLB, and NHL teams with metadata for slug generation.
 *
 * EXTENDING TO OTHER LEAGUES:
 * Add a new object export following the same structure:
 * - id: unique identifier (lowercase, no spaces)
 * - name: full team name
 * - city: city/region name
 * - abbreviation: standard abbreviation
 * - slug: URL-friendly version for embed URLs
 */

const NFLTeams = {
    // AFC East
    'bills': {
        id: 'bills',
        name: 'Buffalo Bills',
        city: 'Buffalo',
        abbreviation: 'BUF',
        slug: 'buffalo-bills',
        conference: 'AFC',
        division: 'East'
    },
    'dolphins': {
        id: 'dolphins',
        name: 'Miami Dolphins',
        city: 'Miami',
        abbreviation: 'MIA',
        slug: 'miami-dolphins',
        conference: 'AFC',
        division: 'East'
    },
    'patriots': {
        id: 'patriots',
        name: 'New England Patriots',
        city: 'New England',
        abbreviation: 'NE',
        slug: 'new-england-patriots',
        conference: 'AFC',
        division: 'East'
    },
    'jets': {
        id: 'jets',
        name: 'New York Jets',
        city: 'New York',
        abbreviation: 'NYJ',
        slug: 'new-york-jets',
        conference: 'AFC',
        division: 'East'
    },

    // AFC North
    'ravens': {
        id: 'ravens',
        name: 'Baltimore Ravens',
        city: 'Baltimore',
        abbreviation: 'BAL',
        slug: 'baltimore-ravens',
        conference: 'AFC',
        division: 'North'
    },
    'bengals': {
        id: 'bengals',
        name: 'Cincinnati Bengals',
        city: 'Cincinnati',
        abbreviation: 'CIN',
        slug: 'cincinnati-bengals',
        conference: 'AFC',
        division: 'North'
    },
    'browns': {
        id: 'browns',
        name: 'Cleveland Browns',
        city: 'Cleveland',
        abbreviation: 'CLE',
        slug: 'cleveland-browns',
        conference: 'AFC',
        division: 'North'
    },
    'steelers': {
        id: 'steelers',
        name: 'Pittsburgh Steelers',
        city: 'Pittsburgh',
        abbreviation: 'PIT',
        slug: 'pittsburgh-steelers',
        conference: 'AFC',
        division: 'North'
    },

    // AFC South
    'texans': {
        id: 'texans',
        name: 'Houston Texans',
        city: 'Houston',
        abbreviation: 'HOU',
        slug: 'houston-texans',
        conference: 'AFC',
        division: 'South'
    },
    'colts': {
        id: 'colts',
        name: 'Indianapolis Colts',
        city: 'Indianapolis',
        abbreviation: 'IND',
        slug: 'indianapolis-colts',
        conference: 'AFC',
        division: 'South'
    },
    'jaguars': {
        id: 'jaguars',
        name: 'Jacksonville Jaguars',
        city: 'Jacksonville',
        abbreviation: 'JAX',
        slug: 'jacksonville-jaguars',
        conference: 'AFC',
        division: 'South'
    },
    'titans': {
        id: 'titans',
        name: 'Tennessee Titans',
        city: 'Tennessee',
        abbreviation: 'TEN',
        slug: 'tennessee-titans',
        conference: 'AFC',
        division: 'South'
    },

    // AFC West
    'broncos': {
        id: 'broncos',
        name: 'Denver Broncos',
        city: 'Denver',
        abbreviation: 'DEN',
        slug: 'denver-broncos',
        conference: 'AFC',
        division: 'West'
    },
    'chiefs': {
        id: 'chiefs',
        name: 'Kansas City Chiefs',
        city: 'Kansas City',
        abbreviation: 'KC',
        slug: 'kansas-city-chiefs',
        conference: 'AFC',
        division: 'West'
    },
    'raiders': {
        id: 'raiders',
        name: 'Las Vegas Raiders',
        city: 'Las Vegas',
        abbreviation: 'LV',
        slug: 'las-vegas-raiders',
        conference: 'AFC',
        division: 'West'
    },
    'chargers': {
        id: 'chargers',
        name: 'Los Angeles Chargers',
        city: 'Los Angeles',
        abbreviation: 'LAC',
        slug: 'los-angeles-chargers',
        conference: 'AFC',
        division: 'West'
    },

    // NFC East
    'cowboys': {
        id: 'cowboys',
        name: 'Dallas Cowboys',
        city: 'Dallas',
        abbreviation: 'DAL',
        slug: 'dallas-cowboys',
        conference: 'NFC',
        division: 'East'
    },
    'giants': {
        id: 'giants',
        name: 'New York Giants',
        city: 'New York',
        abbreviation: 'NYG',
        slug: 'new-york-giants',
        conference: 'NFC',
        division: 'East'
    },
    'eagles': {
        id: 'eagles',
        name: 'Philadelphia Eagles',
        city: 'Philadelphia',
        abbreviation: 'PHI',
        slug: 'philadelphia-eagles',
        conference: 'NFC',
        division: 'East'
    },
    'commanders': {
        id: 'commanders',
        name: 'Washington Commanders',
        city: 'Washington',
        abbreviation: 'WAS',
        slug: 'washington-commanders',
        conference: 'NFC',
        division: 'East'
    },

    // NFC North
    'bears': {
        id: 'bears',
        name: 'Chicago Bears',
        city: 'Chicago',
        abbreviation: 'CHI',
        slug: 'chicago-bears',
        conference: 'NFC',
        division: 'North'
    },
    'lions': {
        id: 'lions',
        name: 'Detroit Lions',
        city: 'Detroit',
        abbreviation: 'DET',
        slug: 'detroit-lions',
        conference: 'NFC',
        division: 'North'
    },
    'packers': {
        id: 'packers',
        name: 'Green Bay Packers',
        city: 'Green Bay',
        abbreviation: 'GB',
        slug: 'green-bay-packers',
        conference: 'NFC',
        division: 'North'
    },
    'vikings': {
        id: 'vikings',
        name: 'Minnesota Vikings',
        city: 'Minnesota',
        abbreviation: 'MIN',
        slug: 'minnesota-vikings',
        conference: 'NFC',
        division: 'North'
    },

    // NFC South
    'falcons': {
        id: 'falcons',
        name: 'Atlanta Falcons',
        city: 'Atlanta',
        abbreviation: 'ATL',
        slug: 'atlanta-falcons',
        conference: 'NFC',
        division: 'South'
    },
    'panthers': {
        id: 'panthers',
        name: 'Carolina Panthers',
        city: 'Carolina',
        abbreviation: 'CAR',
        slug: 'carolina-panthers',
        conference: 'NFC',
        division: 'South'
    },
    'saints': {
        id: 'saints',
        name: 'New Orleans Saints',
        city: 'New Orleans',
        abbreviation: 'NO',
        slug: 'new-orleans-saints',
        conference: 'NFC',
        division: 'South'
    },
    'buccaneers': {
        id: 'buccaneers',
        name: 'Tampa Bay Buccaneers',
        city: 'Tampa Bay',
        abbreviation: 'TB',
        slug: 'tampa-bay-buccaneers',
        conference: 'NFC',
        division: 'South'
    },

    // NFC West
    'cardinals': {
        id: 'cardinals',
        name: 'Arizona Cardinals',
        city: 'Arizona',
        abbreviation: 'ARI',
        slug: 'arizona-cardinals',
        conference: 'NFC',
        division: 'West'
    },
    'rams': {
        id: 'rams',
        name: 'Los Angeles Rams',
        city: 'Los Angeles',
        abbreviation: 'LAR',
        slug: 'los-angeles-rams',
        conference: 'NFC',
        division: 'West'
    },
    '49ers': {
        id: '49ers',
        name: 'San Francisco 49ers',
        city: 'San Francisco',
        abbreviation: 'SF',
        slug: 'san-francisco-49ers',
        conference: 'NFC',
        division: 'West'
    },
    'seahawks': {
        id: 'seahawks',
        name: 'Seattle Seahawks',
        city: 'Seattle',
        abbreviation: 'SEA',
        slug: 'seattle-seahawks',
        conference: 'NFC',
        division: 'West'
    }
};

const NBATeams = {
    'hawks': {
        id: 'hawks',
        name: 'Atlanta Hawks',
        city: 'Atlanta',
        abbreviation: 'ATL',
        slug: 'atlanta-hawks',
        conference: 'Eastern',
        division: 'Southeast'
    },
    'celtics': {
        id: 'celtics',
        name: 'Boston Celtics',
        city: 'Boston',
        abbreviation: 'BOS',
        slug: 'boston-celtics',
        conference: 'Eastern',
        division: 'Atlantic'
    },
    'nets': {
        id: 'nets',
        name: 'Brooklyn Nets',
        city: 'Brooklyn',
        abbreviation: 'BKN',
        slug: 'brooklyn-nets',
        conference: 'Eastern',
        division: 'Atlantic'
    },
    'hornets': {
        id: 'hornets',
        name: 'Charlotte Hornets',
        city: 'Charlotte',
        abbreviation: 'CHA',
        slug: 'charlotte-hornets',
        conference: 'Eastern',
        division: 'Southeast'
    },
    'bulls': {
        id: 'bulls',
        name: 'Chicago Bulls',
        city: 'Chicago',
        abbreviation: 'CHI',
        slug: 'chicago-bulls',
        conference: 'Eastern',
        division: 'Central'
    },
    'cavaliers': {
        id: 'cavaliers',
        name: 'Cleveland Cavaliers',
        city: 'Cleveland',
        abbreviation: 'CLE',
        slug: 'cleveland-cavaliers',
        conference: 'Eastern',
        division: 'Central'
    },
    'mavericks': {
        id: 'mavericks',
        name: 'Dallas Mavericks',
        city: 'Dallas',
        abbreviation: 'DAL',
        slug: 'dallas-mavericks',
        conference: 'Western',
        division: 'Southwest'
    },
    'nuggets': {
        id: 'nuggets',
        name: 'Denver Nuggets',
        city: 'Denver',
        abbreviation: 'DEN',
        slug: 'denver-nuggets',
        conference: 'Western',
        division: 'Northwest'
    },
    'pistons': {
        id: 'pistons',
        name: 'Detroit Pistons',
        city: 'Detroit',
        abbreviation: 'DET',
        slug: 'detroit-pistons',
        conference: 'Eastern',
        division: 'Central'
    },
    'warriors': {
        id: 'warriors',
        name: 'Golden State Warriors',
        city: 'Golden State',
        abbreviation: 'GSW',
        slug: 'golden-state-warriors',
        conference: 'Western',
        division: 'Pacific'
    },
    'rockets': {
        id: 'rockets',
        name: 'Houston Rockets',
        city: 'Houston',
        abbreviation: 'HOU',
        slug: 'houston-rockets',
        conference: 'Western',
        division: 'Southwest'
    },
    'pacers': {
        id: 'pacers',
        name: 'Indiana Pacers',
        city: 'Indiana',
        abbreviation: 'IND',
        slug: 'indiana-pacers',
        conference: 'Eastern',
        division: 'Central'
    },
    'clippers': {
        id: 'clippers',
        name: 'LA Clippers',
        city: 'Los Angeles',
        abbreviation: 'LAC',
        slug: 'la-clippers',
        conference: 'Western',
        division: 'Pacific'
    },
    'lakers': {
        id: 'lakers',
        name: 'Los Angeles Lakers',
        city: 'Los Angeles',
        abbreviation: 'LAL',
        slug: 'los-angeles-lakers',
        conference: 'Western',
        division: 'Pacific'
    },
    'grizzlies': {
        id: 'grizzlies',
        name: 'Memphis Grizzlies',
        city: 'Memphis',
        abbreviation: 'MEM',
        slug: 'memphis-grizzlies',
        conference: 'Western',
        division: 'Southwest'
    },
    'heat': {
        id: 'heat',
        name: 'Miami Heat',
        city: 'Miami',
        abbreviation: 'MIA',
        slug: 'miami-heat',
        conference: 'Eastern',
        division: 'Southeast'
    },
    'bucks': {
        id: 'bucks',
        name: 'Milwaukee Bucks',
        city: 'Milwaukee',
        abbreviation: 'MIL',
        slug: 'milwaukee-bucks',
        conference: 'Eastern',
        division: 'Central'
    },
    'timberwolves': {
        id: 'timberwolves',
        name: 'Minnesota Timberwolves',
        city: 'Minnesota',
        abbreviation: 'MIN',
        slug: 'minnesota-timberwolves',
        conference: 'Western',
        division: 'Northwest'
    },
    'pelicans': {
        id: 'pelicans',
        name: 'New Orleans Pelicans',
        city: 'New Orleans',
        abbreviation: 'NOP',
        slug: 'new-orleans-pelicans',
        conference: 'Western',
        division: 'Southwest'
    },
    'knicks': {
        id: 'knicks',
        name: 'New York Knicks',
        city: 'New York',
        abbreviation: 'NYK',
        slug: 'new-york-knicks',
        conference: 'Eastern',
        division: 'Atlantic'
    },
    'thunder': {
        id: 'thunder',
        name: 'Oklahoma City Thunder',
        city: 'Oklahoma City',
        abbreviation: 'OKC',
        slug: 'oklahoma-city-thunder',
        conference: 'Western',
        division: 'Northwest'
    },
    'magic': {
        id: 'magic',
        name: 'Orlando Magic',
        city: 'Orlando',
        abbreviation: 'ORL',
        slug: 'orlando-magic',
        conference: 'Eastern',
        division: 'Southeast'
    },
    '76ers': {
        id: '76ers',
        name: 'Philadelphia 76ers',
        city: 'Philadelphia',
        abbreviation: 'PHI',
        slug: 'philadelphia-76ers',
        conference: 'Eastern',
        division: 'Atlantic'
    },
    'suns': {
        id: 'suns',
        name: 'Phoenix Suns',
        city: 'Phoenix',
        abbreviation: 'PHX',
        slug: 'phoenix-suns',
        conference: 'Western',
        division: 'Pacific'
    },
    'trail-blazers': {
        id: 'trail-blazers',
        name: 'Portland Trail Blazers',
        city: 'Portland',
        abbreviation: 'POR',
        slug: 'portland-trail-blazers',
        conference: 'Western',
        division: 'Northwest'
    },
    'kings': {
        id: 'kings',
        name: 'Sacramento Kings',
        city: 'Sacramento',
        abbreviation: 'SAC',
        slug: 'sacramento-kings',
        conference: 'Western',
        division: 'Pacific'
    },
    'spurs': {
        id: 'spurs',
        name: 'San Antonio Spurs',
        city: 'San Antonio',
        abbreviation: 'SAS',
        slug: 'san-antonio-spurs',
        conference: 'Western',
        division: 'Southwest'
    },
    'raptors': {
        id: 'raptors',
        name: 'Toronto Raptors',
        city: 'Toronto',
        abbreviation: 'TOR',
        slug: 'toronto-raptors',
        conference: 'Eastern',
        division: 'Atlantic'
    },
    'jazz': {
        id: 'jazz',
        name: 'Utah Jazz',
        city: 'Utah',
        abbreviation: 'UTA',
        slug: 'utah-jazz',
        conference: 'Western',
        division: 'Northwest'
    },
    'wizards': {
        id: 'wizards',
        name: 'Washington Wizards',
        city: 'Washington',
        abbreviation: 'WAS',
        slug: 'washington-wizards',
        conference: 'Eastern',
        division: 'Southeast'
    }
};

const MLBTeams = {
    // American League - East
    'orioles': {
        id: 'orioles',
        name: 'Baltimore Orioles',
        city: 'Baltimore',
        abbreviation: 'BAL',
        slug: 'baltimore-orioles',
        conference: 'AL',
        division: 'East'
    },
    'red-sox': {
        id: 'red-sox',
        name: 'Boston Red Sox',
        city: 'Boston',
        abbreviation: 'BOS',
        slug: 'boston-red-sox',
        conference: 'AL',
        division: 'East'
    },
    'yankees': {
        id: 'yankees',
        name: 'New York Yankees',
        city: 'New York',
        abbreviation: 'NYY',
        slug: 'new-york-yankees',
        conference: 'AL',
        division: 'East'
    },
    'rays': {
        id: 'rays',
        name: 'Tampa Bay Rays',
        city: 'Tampa Bay',
        abbreviation: 'TB',
        slug: 'tampa-bay-rays',
        conference: 'AL',
        division: 'East'
    },
    'blue-jays': {
        id: 'blue-jays',
        name: 'Toronto Blue Jays',
        city: 'Toronto',
        abbreviation: 'TOR',
        slug: 'toronto-blue-jays',
        conference: 'AL',
        division: 'East'
    },

    // American League - Central
    'white-sox': {
        id: 'white-sox',
        name: 'Chicago White Sox',
        city: 'Chicago',
        abbreviation: 'CWS',
        slug: 'chicago-white-sox',
        conference: 'AL',
        division: 'Central'
    },
    'guardians': {
        id: 'guardians',
        name: 'Cleveland Guardians',
        city: 'Cleveland',
        abbreviation: 'CLE',
        slug: 'cleveland-guardians',
        conference: 'AL',
        division: 'Central'
    },
    'tigers': {
        id: 'tigers',
        name: 'Detroit Tigers',
        city: 'Detroit',
        abbreviation: 'DET',
        slug: 'detroit-tigers',
        conference: 'AL',
        division: 'Central'
    },
    'royals': {
        id: 'royals',
        name: 'Kansas City Royals',
        city: 'Kansas City',
        abbreviation: 'KC',
        slug: 'kansas-city-royals',
        conference: 'AL',
        division: 'Central'
    },
    'twins': {
        id: 'twins',
        name: 'Minnesota Twins',
        city: 'Minnesota',
        abbreviation: 'MIN',
        slug: 'minnesota-twins',
        conference: 'AL',
        division: 'Central'
    },

    // American League - West
    'astros': {
        id: 'astros',
        name: 'Houston Astros',
        city: 'Houston',
        abbreviation: 'HOU',
        slug: 'houston-astros',
        conference: 'AL',
        division: 'West'
    },
    'angels': {
        id: 'angels',
        name: 'Los Angeles Angels',
        city: 'Los Angeles',
        abbreviation: 'LAA',
        slug: 'los-angeles-angels',
        conference: 'AL',
        division: 'West'
    },
    'athletics': {
        id: 'athletics',
        name: 'Oakland Athletics',
        city: 'Oakland',
        abbreviation: 'OAK',
        slug: 'oakland-athletics',
        conference: 'AL',
        division: 'West'
    },
    'mariners': {
        id: 'mariners',
        name: 'Seattle Mariners',
        city: 'Seattle',
        abbreviation: 'SEA',
        slug: 'seattle-mariners',
        conference: 'AL',
        division: 'West'
    },
    'rangers': {
        id: 'rangers',
        name: 'Texas Rangers',
        city: 'Texas',
        abbreviation: 'TEX',
        slug: 'texas-rangers',
        conference: 'AL',
        division: 'West'
    },

    // National League - East
    'braves': {
        id: 'braves',
        name: 'Atlanta Braves',
        city: 'Atlanta',
        abbreviation: 'ATL',
        slug: 'atlanta-braves',
        conference: 'NL',
        division: 'East'
    },
    'marlins': {
        id: 'marlins',
        name: 'Miami Marlins',
        city: 'Miami',
        abbreviation: 'MIA',
        slug: 'miami-marlins',
        conference: 'NL',
        division: 'East'
    },
    'mets': {
        id: 'mets',
        name: 'New York Mets',
        city: 'New York',
        abbreviation: 'NYM',
        slug: 'new-york-mets',
        conference: 'NL',
        division: 'East'
    },
    'phillies': {
        id: 'phillies',
        name: 'Philadelphia Phillies',
        city: 'Philadelphia',
        abbreviation: 'PHI',
        slug: 'philadelphia-phillies',
        conference: 'NL',
        division: 'East'
    },
    'nationals': {
        id: 'nationals',
        name: 'Washington Nationals',
        city: 'Washington',
        abbreviation: 'WSH',
        slug: 'washington-nationals',
        conference: 'NL',
        division: 'East'
    },

    // National League - Central
    'cubs': {
        id: 'cubs',
        name: 'Chicago Cubs',
        city: 'Chicago',
        abbreviation: 'CHC',
        slug: 'chicago-cubs',
        conference: 'NL',
        division: 'Central'
    },
    'reds': {
        id: 'reds',
        name: 'Cincinnati Reds',
        city: 'Cincinnati',
        abbreviation: 'CIN',
        slug: 'cincinnati-reds',
        conference: 'NL',
        division: 'Central'
    },
    'brewers': {
        id: 'brewers',
        name: 'Milwaukee Brewers',
        city: 'Milwaukee',
        abbreviation: 'MIL',
        slug: 'milwaukee-brewers',
        conference: 'NL',
        division: 'Central'
    },
    'pirates': {
        id: 'pirates',
        name: 'Pittsburgh Pirates',
        city: 'Pittsburgh',
        abbreviation: 'PIT',
        slug: 'pittsburgh-pirates',
        conference: 'NL',
        division: 'Central'
    },
    'cardinals': {
        id: 'cardinals',
        name: 'St. Louis Cardinals',
        city: 'St. Louis',
        abbreviation: 'STL',
        slug: 'st-louis-cardinals',
        conference: 'NL',
        division: 'Central'
    },

    // National League - West
    'diamondbacks': {
        id: 'diamondbacks',
        name: 'Arizona Diamondbacks',
        city: 'Arizona',
        abbreviation: 'ARI',
        slug: 'arizona-diamondbacks',
        conference: 'NL',
        division: 'West'
    },
    'rockies': {
        id: 'rockies',
        name: 'Colorado Rockies',
        city: 'Colorado',
        abbreviation: 'COL',
        slug: 'colorado-rockies',
        conference: 'NL',
        division: 'West'
    },
    'dodgers': {
        id: 'dodgers',
        name: 'Los Angeles Dodgers',
        city: 'Los Angeles',
        abbreviation: 'LAD',
        slug: 'los-angeles-dodgers',
        conference: 'NL',
        division: 'West'
    },
    'padres': {
        id: 'padres',
        name: 'San Diego Padres',
        city: 'San Diego',
        abbreviation: 'SD',
        slug: 'san-diego-padres',
        conference: 'NL',
        division: 'West'
    },
    'giants': {
        id: 'giants',
        name: 'San Francisco Giants',
        city: 'San Francisco',
        abbreviation: 'SF',
        slug: 'san-francisco-giants',
        conference: 'NL',
        division: 'West'
    }
};

const NHLTeams = {
    // Eastern Conference - Atlantic
    'bruins': {
        id: 'bruins',
        name: 'Boston Bruins',
        city: 'Boston',
        abbreviation: 'BOS',
        slug: 'boston-bruins',
        conference: 'Eastern',
        division: 'Atlantic'
    },
    'sabres': {
        id: 'sabres',
        name: 'Buffalo Sabres',
        city: 'Buffalo',
        abbreviation: 'BUF',
        slug: 'buffalo-sabres',
        conference: 'Eastern',
        division: 'Atlantic'
    },
    'red-wings': {
        id: 'red-wings',
        name: 'Detroit Red Wings',
        city: 'Detroit',
        abbreviation: 'DET',
        slug: 'detroit-red-wings',
        conference: 'Eastern',
        division: 'Atlantic'
    },
    'panthers': {
        id: 'panthers',
        name: 'Florida Panthers',
        city: 'Florida',
        abbreviation: 'FLA',
        slug: 'florida-panthers',
        conference: 'Eastern',
        division: 'Atlantic'
    },
    'canadiens': {
        id: 'canadiens',
        name: 'Montreal Canadiens',
        city: 'Montreal',
        abbreviation: 'MTL',
        slug: 'montreal-canadiens',
        conference: 'Eastern',
        division: 'Atlantic'
    },
    'senators': {
        id: 'senators',
        name: 'Ottawa Senators',
        city: 'Ottawa',
        abbreviation: 'OTT',
        slug: 'ottawa-senators',
        conference: 'Eastern',
        division: 'Atlantic'
    },
    'lightning': {
        id: 'lightning',
        name: 'Tampa Bay Lightning',
        city: 'Tampa Bay',
        abbreviation: 'TB',
        slug: 'tampa-bay-lightning',
        conference: 'Eastern',
        division: 'Atlantic'
    },
    'maple-leafs': {
        id: 'maple-leafs',
        name: 'Toronto Maple Leafs',
        city: 'Toronto',
        abbreviation: 'TOR',
        slug: 'toronto-maple-leafs',
        conference: 'Eastern',
        division: 'Atlantic'
    },

    // Eastern Conference - Metropolitan
    'hurricanes': {
        id: 'hurricanes',
        name: 'Carolina Hurricanes',
        city: 'Carolina',
        abbreviation: 'CAR',
        slug: 'carolina-hurricanes',
        conference: 'Eastern',
        division: 'Metropolitan'
    },
    'blue-jackets': {
        id: 'blue-jackets',
        name: 'Columbus Blue Jackets',
        city: 'Columbus',
        abbreviation: 'CBJ',
        slug: 'columbus-blue-jackets',
        conference: 'Eastern',
        division: 'Metropolitan'
    },
    'devils': {
        id: 'devils',
        name: 'New Jersey Devils',
        city: 'New Jersey',
        abbreviation: 'NJ',
        slug: 'new-jersey-devils',
        conference: 'Eastern',
        division: 'Metropolitan'
    },
    'islanders': {
        id: 'islanders',
        name: 'New York Islanders',
        city: 'New York',
        abbreviation: 'NYI',
        slug: 'new-york-islanders',
        conference: 'Eastern',
        division: 'Metropolitan'
    },
    'rangers': {
        id: 'rangers',
        name: 'New York Rangers',
        city: 'New York',
        abbreviation: 'NYR',
        slug: 'new-york-rangers',
        conference: 'Eastern',
        division: 'Metropolitan'
    },
    'flyers': {
        id: 'flyers',
        name: 'Philadelphia Flyers',
        city: 'Philadelphia',
        abbreviation: 'PHI',
        slug: 'philadelphia-flyers',
        conference: 'Eastern',
        division: 'Metropolitan'
    },
    'penguins': {
        id: 'penguins',
        name: 'Pittsburgh Penguins',
        city: 'Pittsburgh',
        abbreviation: 'PIT',
        slug: 'pittsburgh-penguins',
        conference: 'Eastern',
        division: 'Metropolitan'
    },
    'capitals': {
        id: 'capitals',
        name: 'Washington Capitals',
        city: 'Washington',
        abbreviation: 'WSH',
        slug: 'washington-capitals',
        conference: 'Eastern',
        division: 'Metropolitan'
    },

    // Western Conference - Central
    'blackhawks': {
        id: 'blackhawks',
        name: 'Chicago Blackhawks',
        city: 'Chicago',
        abbreviation: 'CHI',
        slug: 'chicago-blackhawks',
        conference: 'Western',
        division: 'Central'
    },
    'avalanche': {
        id: 'avalanche',
        name: 'Colorado Avalanche',
        city: 'Colorado',
        abbreviation: 'COL',
        slug: 'colorado-avalanche',
        conference: 'Western',
        division: 'Central'
    },
    'stars': {
        id: 'stars',
        name: 'Dallas Stars',
        city: 'Dallas',
        abbreviation: 'DAL',
        slug: 'dallas-stars',
        conference: 'Western',
        division: 'Central'
    },
    'wild': {
        id: 'wild',
        name: 'Minnesota Wild',
        city: 'Minnesota',
        abbreviation: 'MIN',
        slug: 'minnesota-wild',
        conference: 'Western',
        division: 'Central'
    },
    'predators': {
        id: 'predators',
        name: 'Nashville Predators',
        city: 'Nashville',
        abbreviation: 'NSH',
        slug: 'nashville-predators',
        conference: 'Western',
        division: 'Central'
    },
    'blues': {
        id: 'blues',
        name: 'St. Louis Blues',
        city: 'St. Louis',
        abbreviation: 'STL',
        slug: 'st-louis-blues',
        conference: 'Western',
        division: 'Central'
    },
    'utah': {
        id: 'utah',
        name: 'Utah Hockey Club',
        city: 'Utah',
        abbreviation: 'UTA',
        slug: 'utah-hockey-club',
        conference: 'Western',
        division: 'Central'
    },
    'jets': {
        id: 'jets',
        name: 'Winnipeg Jets',
        city: 'Winnipeg',
        abbreviation: 'WPG',
        slug: 'winnipeg-jets',
        conference: 'Western',
        division: 'Central'
    },

    // Western Conference - Pacific
    'ducks': {
        id: 'ducks',
        name: 'Anaheim Ducks',
        city: 'Anaheim',
        abbreviation: 'ANA',
        slug: 'anaheim-ducks',
        conference: 'Western',
        division: 'Pacific'
    },
    'flames': {
        id: 'flames',
        name: 'Calgary Flames',
        city: 'Calgary',
        abbreviation: 'CGY',
        slug: 'calgary-flames',
        conference: 'Western',
        division: 'Pacific'
    },
    'oilers': {
        id: 'oilers',
        name: 'Edmonton Oilers',
        city: 'Edmonton',
        abbreviation: 'EDM',
        slug: 'edmonton-oilers',
        conference: 'Western',
        division: 'Pacific'
    },
    'kings': {
        id: 'kings',
        name: 'Los Angeles Kings',
        city: 'Los Angeles',
        abbreviation: 'LA',
        slug: 'los-angeles-kings',
        conference: 'Western',
        division: 'Pacific'
    },
    'sharks': {
        id: 'sharks',
        name: 'San Jose Sharks',
        city: 'San Jose',
        abbreviation: 'SJ',
        slug: 'san-jose-sharks',
        conference: 'Western',
        division: 'Pacific'
    },
    'kraken': {
        id: 'kraken',
        name: 'Seattle Kraken',
        city: 'Seattle',
        abbreviation: 'SEA',
        slug: 'seattle-kraken',
        conference: 'Western',
        division: 'Pacific'
    },
    'canucks': {
        id: 'canucks',
        name: 'Vancouver Canucks',
        city: 'Vancouver',
        abbreviation: 'VAN',
        slug: 'vancouver-canucks',
        conference: 'Western',
        division: 'Pacific'
    },
    'golden-knights': {
        id: 'golden-knights',
        name: 'Vegas Golden Knights',
        city: 'Vegas',
        abbreviation: 'VGK',
        slug: 'vegas-golden-knights',
        conference: 'Western',
        division: 'Pacific'
    }
};

const TEAMS_BY_LEAGUE = {
    nfl: NFLTeams,
    nba: NBATeams,
    mlb: MLBTeams,
    nhl: NHLTeams
};

const LOGO_OVERRIDES = {
    nfl: {
        SF: 'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png'
    }
};

const LOGO_ABBR_ALIASES = {
    nfl: {
        WAS: 'WSH'
    },
    nba: {
        GSW: 'GS',
        NOP: 'NO',
        NYK: 'NY',
        SAS: 'SA',
        UTA: 'UTAH',
        WAS: 'WSH'
    },
    mlb: {
        CWS: 'CHW',
        OAK: 'ATH'
    },
    nhl: {}
};

const LOGO_NAME_ALIASES = {
    mlb: {
        'oakland athletics': ['athletics', 'oakland as', 'oakland a s']
    },
    nhl: {
        'utah hockey club': ['utah']
    }
};

/**
 * Teams utility functions
 */
const TeamsUtil = {
    teamIndex: {},
    logoMap: {
        nfl: {},
        nba: {},
        mlb: {},
        nhl: {}
    },
    logoNameMap: {
        nfl: {},
        nba: {},
        mlb: {},
        nhl: {}
    },
    logosLoaded: {
        nfl: false,
        nba: false,
        mlb: false,
        nhl: false
    },
    logosPromise: {
        nfl: null,
        nba: null,
        mlb: null,
        nhl: null
    },
    normalizeTeamString(value) {
        if (!value) return '';
        let normalized = value.toLowerCase();
        normalized = normalized.replace(/&/g, 'and');
        normalized = normalized.replace(/\bsaint\b/g, 'st');
        normalized = normalized.replace(/\bst\.\b/g, 'st');
        normalized = normalized.replace(/\bnew york\b/g, 'ny');
        normalized = normalized.replace(/\blos angeles\b/g, 'la');
        normalized = normalized.replace(/\bsan francisco\b/g, 'sf');
        normalized = normalized.replace(/\s+/g, ' ');
        normalized = normalized.replace(/[^a-z0-9 ]/g, '');
        normalized = normalized.replace(/\s+/g, ' ').trim();
        return normalized;
    },

    buildTeamIndex(league) {
        if (this.teamIndex[league]) {
            return;
        }
        const teams = TEAMS_BY_LEAGUE[league] || {};
        const index = {
            byAbbr: {},
            byName: {}
        };
        Object.values(teams).forEach(team => {
            if (team.abbreviation) {
                index.byAbbr[team.abbreviation.toUpperCase()] = team;
            }
            const nameKey = this.normalizeTeamString(team.name);
            if (nameKey) {
                index.byName[nameKey] = team;
                const aliases = LOGO_NAME_ALIASES[league]?.[nameKey] || [];
                aliases.forEach(alias => {
                    const aliasKey = this.normalizeTeamString(alias);
                    if (aliasKey) {
                        index.byName[aliasKey] = team;
                    }
                });
            }
            const cityKey = this.normalizeTeamString(team.city);
            let nickname = '';
            if (cityKey) {
                const nameLower = team.name.toLowerCase();
                const cityLower = team.city.toLowerCase();
                if (nameLower.startsWith(cityLower)) {
                    nickname = this.normalizeTeamString(team.name.slice(team.city.length).trim());
                }
            }
            if (nickname) {
                index.byName[nickname] = team;
            }
        });
        this.teamIndex[league] = index;
    },

    getTeamByAbbreviation(abbreviation, league = Config.DEFAULT_LEAGUE) {
        if (!abbreviation) return null;
        this.buildTeamIndex(league);
        return this.teamIndex[league]?.byAbbr[abbreviation.toUpperCase()] || null;
    },

    getTeamByName(name, league = Config.DEFAULT_LEAGUE) {
        if (!name) return null;
        this.buildTeamIndex(league);
        const normalized = this.normalizeTeamString(name);
        return this.teamIndex[league]?.byName[normalized] || null;
    },

    getMatchCandidates(name, league = Config.DEFAULT_LEAGUE) {
        const normalizedName = this.normalizeTeamString(name);
        if (!normalizedName) return [];
        const teams = this.getAllTeams(league);
        const candidates = [];

        teams.forEach(team => {
            const teamName = this.normalizeTeamString(team.name);
            if (!teamName) return;
            let score = 0;

            if (normalizedName === teamName) {
                score = 4;
            } else if (normalizedName.includes(teamName) || teamName.includes(normalizedName)) {
                score = 3;
            }

            const cityName = this.normalizeTeamString(team.city);
            const nickname = cityName
                ? teamName.replace(cityName, '').trim()
                : '';
            if (nickname && normalizedName.includes(nickname)) {
                score = Math.max(score, 2);
            }

            const abbr = team.abbreviation?.toLowerCase();
            if (abbr) {
                const nameParts = normalizedName.split(' ');
                if (normalizedName === abbr || nameParts.includes(abbr)) {
                    score = Math.max(score, 2);
                }
            }

            if (score > 0) {
                candidates.push({ team, score });
            }
        });

        return candidates.sort((a, b) => b.score - a.score);
    },

    resolveTeam(rawTeam, league = Config.DEFAULT_LEAGUE) {
        if (!rawTeam) return null;
        let resolved = rawTeam.id
            ? this.getTeam(rawTeam.id, league)
            : (rawTeam.abbreviation
                ? this.getTeamByAbbreviation(rawTeam.abbreviation, league)
                : (rawTeam.name ? this.getTeamByName(rawTeam.name, league) : null));

        if (!resolved && rawTeam.name) {
            resolved = this.getMatchCandidates(rawTeam.name, league)[0]?.team || null;
        }

        if (!resolved) {
            return { ...rawTeam };
        }

        return {
            ...resolved,
            ...rawTeam,
            abbreviation: rawTeam.abbreviation || resolved.abbreviation
        };
    },
    /**
     * Get all teams as an array, sorted alphabetically by name
     */
    getAllTeams(league = Config.DEFAULT_LEAGUE) {
        const teams = TEAMS_BY_LEAGUE[league] || {};
        return Object.values(teams).sort((a, b) =>
            a.name.localeCompare(b.name)
        );
    },

    /**
     * Get a team by its ID
     */
    getTeam(id, league = Config.DEFAULT_LEAGUE) {
        const teams = TEAMS_BY_LEAGUE[league] || {};
        return teams[id] || null;
    },

    /**
     * Get a team by its slug
     */
    getTeamBySlug(slug, league = Config.DEFAULT_LEAGUE) {
        const teams = TEAMS_BY_LEAGUE[league] || {};
        return Object.values(teams).find(team => team.slug === slug) || null;
    },

    /**
     * Parse team names from a game title
     * @param {string} title - Game title (e.g., "Buffalo Bills vs New York Jets")
     * @returns {Object} Team info
     */
    parseTeamsFromTitle(title, league = null) {
        const result = {
            away: null,
            home: null,
            awayId: null,
            homeId: null,
            league: null
        };

        if (!title) return result;

        const vsMatch = title.match(/(.+?)\s+(?:vs\.?|@|at)\s+(.+)/i);

        if (!vsMatch) {
            return result;
        }

        const team1Name = vsMatch[1].trim();
        const team2Name = vsMatch[2].trim();
        const leaguesToCheck = league && league !== 'all'
            ? [league]
            : Config.SUPPORTED_LEAGUES;

        for (const leagueKey of leaguesToCheck) {
            const awayCandidates = this.getMatchCandidates(team1Name, leagueKey);
            const homeCandidates = this.getMatchCandidates(team2Name, leagueKey);

            const awayTeam = awayCandidates[0]?.team || null;
            let homeTeam = homeCandidates[0]?.team || null;

            if (awayTeam && homeTeam && awayTeam.id === homeTeam.id) {
                const alternate = homeCandidates.find(candidate => candidate.team.id !== awayTeam.id);
                homeTeam = alternate ? alternate.team : null;
            }

            if (awayTeam) {
                result.away = awayTeam;
                result.awayId = awayTeam.id;
                result.league = leagueKey;
            }
            if (homeTeam) {
                result.home = homeTeam;
                result.homeId = homeTeam.id;
                result.league = leagueKey;
            }

            if (result.away || result.home) {
                break;
            }
        }

        return result;
    },

    /**
     * Get a team logo URL
     * @param {Object} team - Team object
     * @returns {string|null} Logo URL
     */
    getTeamLogo(team, league = Config.DEFAULT_LEAGUE) {
        if (!team) {
            return null;
        }
        const resolvedLeague = this.resolveLogoLeague(league, team);
        const directLogo = this.getDirectLogo(team);
        if (!resolvedLeague) {
            return directLogo;
        }
        const espnLogo = this.getEspnLogo(team, resolvedLeague);
        if (espnLogo) {
            return espnLogo;
        }
        return directLogo || null;
    },

    getDirectLogo(team) {
        if (!team) {
            return null;
        }
        return team.logo || team.logoUrl || team.badgeUrl || null;
    },

    getEspnLogo(team, league) {
        const abbr = team.abbreviation ? team.abbreviation.toUpperCase() : null;
        const overrideLogo = abbr ? LOGO_OVERRIDES[league]?.[abbr] : null;
        if (overrideLogo) {
            return overrideLogo;
        }
        if (abbr) {
            const apiLogo = this.logoMap[league]?.[abbr];
            if (apiLogo) {
                return apiLogo;
            }
            const aliasAbbr = LOGO_ABBR_ALIASES[league]?.[abbr];
            if (aliasAbbr) {
                const aliasLogo = this.logoMap[league]?.[aliasAbbr];
                if (aliasLogo) {
                    return aliasLogo;
                }
            }
        }
        const nameLogo = this.getLogoByName(team, league);
        if (nameLogo) {
            return nameLogo;
        }
        if (!abbr) {
            return null;
        }
        const fallbackAbbr = (LOGO_ABBR_ALIASES[league]?.[abbr] || abbr).toLowerCase();
        const path = league === 'nba'
            ? 'nba'
            : (league === 'mlb' ? 'mlb' : (league === 'nhl' ? 'nhl' : 'nfl'));
        return `https://a.espncdn.com/i/teamlogos/${path}/500/${fallbackAbbr}.png`;
    },

    resolveLogoLeague(league, team) {
        if (league && this.logoMap[league]) {
            return league;
        }
        const teamLeague = team?.league;
        if (teamLeague && this.logoMap[teamLeague]) {
            return teamLeague;
        }
        return null;
    },

    getLogoByName(team, league) {
        const candidates = this.getLogoNameCandidates(team, league);
        for (const nameKey of candidates) {
            const logo = this.logoNameMap[league]?.[nameKey];
            if (logo) {
                return logo;
            }
        }
        return null;
    },

    getLogoNameCandidates(team, league) {
        const names = new Set();
        const add = (value) => {
            const normalized = this.normalizeTeamString(value);
            if (normalized) {
                names.add(normalized);
            }
        };

        add(team?.name);
        add(team?.shortName);
        add(team?.city);
        add(team?.abbreviation);

        const primary = this.normalizeTeamString(team?.name);
        const aliases = primary ? (LOGO_NAME_ALIASES[league]?.[primary] || []) : [];
        aliases.forEach(add);

        return Array.from(names);
    },

    /**
     * Load ESPN team logos via the backend
     * @returns {Promise<void>}
     */
    async preloadLogos(league = 'all') {
        const leaguesToLoad = league === 'all'
            ? Config.SUPPORTED_LEAGUES
            : [league];

        await Promise.all(leaguesToLoad.map(leagueKey => this.preloadLogosForLeague(leagueKey)));
    },

    async preloadLogosForLeague(league) {
        if (!Config.SUPPORTED_LEAGUES.includes(league)) {
            return;
        }
        if (this.logosLoaded[league]) {
            return;
        }
        if (this.logosPromise[league]) {
            return this.logosPromise[league];
        }

        this.logosPromise[league] = (async () => {
            try {
                const response = await fetch(`${Config.API_BASE_URL}/teams?league=${league}`, {
                    headers: {
                        'Accept': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Teams API responded with ${response.status}`);
                }

                const data = await response.json();
                if (Array.isArray(data.teams)) {
                    data.teams.forEach(team => {
                        if (!team.logo) {
                            return;
                        }
                        const abbr = team.abbreviation ? team.abbreviation.toUpperCase() : null;
                        if (abbr) {
                            this.logoMap[league][abbr] = team.logo;
                        }
                        const nameKeys = [
                            team.name,
                            team.shortName,
                            team.abbreviation
                        ];
                        nameKeys.forEach(value => {
                            const key = this.normalizeTeamString(value);
                            if (key) {
                                this.logoNameMap[league][key] = team.logo;
                            }
                        });
                    });
                }

                this.logosLoaded[league] = true;
            } catch (error) {
                console.warn(`Failed to load ${league} ESPN logos:`, error);
                this.logosPromise[league] = null;
            }
        })();

        return this.logosPromise[league];
    },

    /**
     * Get teams grouped by division
     */
    getTeamsByDivision(league = Config.DEFAULT_LEAGUE) {
        const grouped = {};
        const teams = TEAMS_BY_LEAGUE[league] || {};
        Object.values(teams).forEach(team => {
            const key = `${team.conference} ${team.division}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(team);
        });
        return grouped;
    }
};
