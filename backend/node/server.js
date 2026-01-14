const path = require('path');
const express = require('express');
const morgan = require('morgan');
const fetch = require('node-fetch');
const { spawn } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PORT = parseInt(process.env.PORT || '8080', 10);
const PY_SERVICE_PORT = parseInt(process.env.PY_SERVICE_PORT || '8001', 10);
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const AUTO_START_PYTHON = process.env.AUTO_START_PYTHON !== 'false';

let pythonProcess = null;

function startPythonService() {
    if (!AUTO_START_PYTHON) {
        console.log('Python auto-start disabled; expecting external service.');
        return;
    }

    const servicePath = path.join(ROOT_DIR, 'backend', 'python', 'service.py');
    pythonProcess = spawn(PYTHON_BIN, [servicePath, '--port', String(PY_SERVICE_PORT)], {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: {
            ...process.env,
            PY_SERVICE_PORT: String(PY_SERVICE_PORT)
        }
    });

    pythonProcess.on('exit', (code, signal) => {
        console.log(`Python service exited (code=${code}, signal=${signal}).`);
    });
}

async function waitForPython(timeoutMs = 10000) {
    const start = Date.now();
    const healthUrl = `http://127.0.0.1:${PY_SERVICE_PORT}/health`;

    while (Date.now() - start < timeoutMs) {
        try {
            const response = await fetch(healthUrl, { timeout: 2000 });
            if (response.ok) {
                return true;
            }
        } catch (error) {
            // Service not ready yet.
        }
        await new Promise(resolve => setTimeout(resolve, 250));
    }

    return false;
}

async function proxyToPython(req, res, pathOverride) {
    const pathSuffix = pathOverride || req.path.replace(/^\/api/, '');
    const target = new URL(pathSuffix, `http://127.0.0.1:${PY_SERVICE_PORT}`);

    for (const [key, value] of Object.entries(req.query)) {
        if (Array.isArray(value)) {
            value.forEach(item => target.searchParams.append(key, item));
        } else if (value !== undefined) {
            target.searchParams.append(key, value);
        }
    }

    try {
        const response = await fetch(target.toString(), {
            headers: {
                'Accept': 'application/json'
            }
        });
        const body = await response.text();
        res.status(response.status);
        const contentType = response.headers.get('content-type');
        if (contentType) {
            res.set('Content-Type', contentType);
        }
        res.send(body);
    } catch (error) {
        res.status(502).json({
            error: 'python_service_unavailable',
            message: error.message
        });
    }
}

function createServer() {
    const app = express();

    app.use(morgan('tiny'));

    app.use((req, res, next) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET,OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        if (req.method === 'OPTIONS') {
            return res.sendStatus(204);
        }
        return next();
    });

    app.get('/api/health', async (req, res) => {
        try {
            const response = await fetch(`http://127.0.0.1:${PY_SERVICE_PORT}/health`, { timeout: 2000 });
            const data = await response.json();
            res.status(response.ok ? 200 : 502).json({
                status: response.ok ? 'ok' : 'degraded',
                python: data,
                node: {
                    status: 'ok',
                    uptimeSec: Math.round(process.uptime())
                }
            });
        } catch (error) {
            res.status(502).json({
                status: 'degraded',
                python: {
                    status: 'down',
                    error: error.message
                },
                node: {
                    status: 'ok',
                    uptimeSec: Math.round(process.uptime())
                }
            });
        }
    });

    app.get('/api/games', (req, res) => proxyToPython(req, res));
    app.get('/api/games/:slug', (req, res) => {
        const slug = encodeURIComponent(req.params.slug || '');
        return proxyToPython(req, res, `/games/${slug}`);
    });
    app.get('/api/teams', (req, res) => proxyToPython(req, res));
    app.get('/api/standings', (req, res) => proxyToPython(req, res));
    app.get('/api/streams/check', (req, res) => proxyToPython(req, res));

    app.use('/css', express.static(path.join(ROOT_DIR, 'css')));
    app.use('/js', express.static(path.join(ROOT_DIR, 'js')));
    app.use('/icons', express.static(path.join(ROOT_DIR, 'icons')));

    app.get('/manifest.json', (req, res) => {
        res.sendFile(path.join(ROOT_DIR, 'manifest.json'));
    });

    app.get('/sw.js', (req, res) => {
        res.sendFile(path.join(ROOT_DIR, 'sw.js'));
    });

    app.get('/', (req, res) => {
        res.sendFile(path.join(ROOT_DIR, 'index.html'));
    });

    app.get('/index.html', (req, res) => {
        res.sendFile(path.join(ROOT_DIR, 'index.html'));
    });

    app.get('*', (req, res) => {
        res.sendFile(path.join(ROOT_DIR, 'index.html'));
    });

    return app;
}

async function start() {
    startPythonService();

    if (AUTO_START_PYTHON) {
        const ready = await waitForPython();
        if (!ready) {
            console.warn('Python service did not become healthy before startup; continuing anyway.');
        }
    }

    const app = createServer();
    app.listen(PORT, () => {
        console.log(`Sports Viewer backend listening on http://localhost:${PORT}`);
    });
}

function shutdown() {
    if (pythonProcess && !pythonProcess.killed) {
        pythonProcess.kill('SIGTERM');
    }
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
