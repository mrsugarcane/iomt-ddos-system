# Sentinel-IoMT — DDoS Prediction for Medical Device Networks

A production-hardened implementation of the research pipeline: synthesize realistic IoMT network
traffic, inject DDoS attacks, train and compare deep learning architectures against classical ML
baselines, optimize the winner for edge hardware, and serve risk-scored alerts through an
authenticated, persistent, role-based monitoring dashboard.

```
ml-pipeline/   Python — dataset synthesis, model training, evaluation, edge optimization
backend/       Node.js/Express — auth, persistent alerts, audit log, live SSE feed
frontend/      React + Vite + Tailwind — login-gated dashboard with role-based views
nginx/         Optional reverse proxy + TLS termination for a real domain deployment
docker-compose.yml   Orchestrates all three services
```

## Quick start (Docker — recommended)

```bash
cp .env.example .env
# generate a real secret:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# paste it into .env as JWT_SECRET

docker compose up --build
```

Frontend: http://localhost:8080 — Backend API: http://localhost:4000

First login: `admin@sentinel.local` / `Admin@1234!` — **change this immediately**, the console
will print a reminder on first boot.

To (re)run the ML pipeline inside Docker:
```bash
docker compose --profile pipeline run --rm ml-pipeline
```

## Quick start (without Docker)

```bash
# 1. ML pipeline (optional — pre-generated results are already included)
cd ml-pipeline && cd
cd src && python run_pipeline.py

# 2. Backend (requires Node.js 22.5+ for the built-in node:sqlite module)
cd backend
cp ../.env.example .env   # fill in JWT_SECRET
npm install
npm test                  # 38 tests: auth, middleware, DL inference, risk engine, full route flow
npm start

# 3. Frontend
cd frontend
npm install
npm run dev
```

## What changed since the research-prototype version

This started as a research prototype (no auth, no persistence, no tests). It's now:

- **Authenticated** — JWT access tokens (15 min, in-memory only on the frontend) + httpOnly
  refresh-token cookies (7 days, revocable), PBKDF2-SHA256 password hashing (310k iterations),
  role-based access (admin / clinician / viewer). All hand-rolled on Node's built-in `crypto` —
  no bcrypt/jsonwebtoken dependency to audit or go stale.
- **Persistent** — SQLite via Node's built-in `node:sqlite` (no native build step, no extra
  package). Alerts, users, acknowledgement history, and an immutable audit log all survive a
  restart.
- **Tested** — 38 backend tests (`node --test`) covering password hashing, JWT issuance/tampering/
  expiry, rate limiting, input validation, the deep-inference engine, risk scoring, and a full
  integration flow through every route (login → create user → role guard → raise alert → acknowledge
  → audit log). 19 Python tests (`python -m unittest`) covering the traffic simulator, the NumPy
  DL framework (including a finite-difference gradient check), evaluation metrics, pruning/
  quantization, and explainability. **The integration tests caught two real bugs** during this
  hardening pass — see "Bugs this caught" below.
- **Operable** — structured JSON request logging, a `/api/health` endpoint, graceful shutdown on
  SIGTERM/SIGINT, Docker images for all three services with health checks, a PM2 config as a
  non-Docker alternative, and rate limiting (120 req/min global, 10 req/min on auth endpoints).
- **Live monitor runs the real model** — the backend now ports the actual trained CNN's
  forward pass to JavaScript (`deepInference.js`) and scores live traffic with it, rather than
  falling back to the lightweight logistic-regression model.
- **Explainability added** — permutation importance (SHAP substitute — `shap` isn't installable
  offline) ranks which features drive detections, with an upgrade path documented in-app.
- **Hardware claim corrected** — the paper specifies a Raspberry Pi 4 (4GB RAM); earlier docs
  incorrectly said ARM Cortex-M (a much more constrained microcontroller). Fixed throughout.

## Bugs the test suite caught (kept here on purpose, as evidence the tests work)

1. **`undefined` crashing SQLite parameter binding.** Every audit-log call passed
   `req.headers["user-agent"]` directly; when that header is absent (a real possibility, and
   guaranteed in the test harness), `node:sqlite` throws rather than accepting `undefined`. Fixed
   with a null-coalescing `audit()` helper in `db/database.js`, used everywhere instead of calling
   `stmts.audit.run()` directly.
2. **A dangling `setInterval` silently hung the process.** The log-rotation timer in
   `middleware/index.js` was never `unref()`'d, so any process that loaded the middleware — including
   the test runner — would hang indefinitely waiting to exit, even after all tests passed. This is
   harmless for the actual server (which has other handles keeping it alive deliberately) but it
   took real debugging to find, because piping test output through `grep` silently swallows the
   underlying process's exit code. Fixed with `.unref()`.

## Known limitations — still true after this hardening pass

- **Training data is fully synthetic.** No real CIC-DDoS2019/BoT-IoT traffic is blended in. See
  `frontend/src/pages/About.jsx` for the exact gap and how to close it.
- **Docker builds were never actually run.** This sandbox has no Docker daemon and no network
  access to npm/pip registries, so every Dockerfile, docker-compose service, and `npm install` was
  written and syntax-checked but not build-tested end to end. Run `docker compose up --build`
  yourself and report anything that breaks.
- **Single-instance architecture.** SQLite and in-memory SSE client state mean this runs as one
  backend process (see `ecosystem.config.js` — deliberately pinned to `instances: 1`). Scaling out
  would mean moving sessions/alerts to Postgres/Redis first.
- **No HTTPS by default.** `nginx/nginx.conf` has a TLS-termination config ready for a real domain,
  but local `docker-compose up` runs plain HTTP, which is fine for `localhost` but not for any real
  network.

## Design notes

- **The "video background"** is an animated canvas (`PulseGrid.jsx`) — an ECG waveform over a
  telemetry grid that spikes red on high-severity alerts. Swap for a literal `.mp4` per the
  instructions in the About page if you'd rather have real footage.
- **The live monitor** is a sped-up simulation for demonstration, not a replay of real hospital
  traffic.

## Default credentials

| Email | Password | Role |
|---|---|---|
| admin@sentinel.local | Admin@1234! | admin |

Change this before exposing the backend to any network beyond localhost. The admin panel
(`/admin`, admin role only) lets you create new accounts and deactivate this one once you've made
a replacement admin.





Run with default Python (3.14.6)
cmd
py run_pipeline.py

 Run with Python 3.14
cmd
py -3.14 run_pipeline.py