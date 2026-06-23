"use strict";
/**
 * Sentinel-IoMT backend — production server.
 *
 * Layers
 * ──────
 * 1. Security headers + rate limiting + request logger (all requests)
 * 2. Cookie parser (built-in, no package)
 * 3. JSON body parser (built-in express)
 * 4. Routes:
 *      /api/auth/*         — login, refresh, logout, me
 *      /api/alerts/*       — persistent alert CRUD + acknowledgement
 *      /api/admin/*        — user management, audit log
 *      /api/results        — ML pipeline comparison payload
 *      /api/stream         — authenticated SSE live feed
 *      /api/alerts/recent  — last N events (for initial page load)
 *      /api/health         — liveness + readiness probe
 * 5. Live SSE feed (writes to DB + broadcasts to connected clients)
 * 6. Graceful shutdown (SIGTERM/SIGINT)
 */

const express   = require("express");
const cors      = require("cors");
const fs        = require("fs");
const path      = require("path");

const { stmts }              = require("./src/db/database");
const { verifyJwt }          = require("./src/auth");
const { forwardPass }        = require("./src/deepInference");
const { createFleet, featuresFromRow } = require("./src/trafficGenerator");
const { predictProbability, severityFromProbability, edgeModel } = require("./src/riskEngine");
const {
  securityHeaders, rateLimiter, requestLogger,
} = require("./src/middleware");

// Routes
const authRoutes  = require("./src/routes/auth");
const alertRoutes = require("./src/routes/alerts");
const adminRoutes = require("./src/routes/admin");

// ── App setup ─────────────────────────────────────────────────────────────

const app  = express();
const PORT = parseInt(process.env.PORT || "4000");

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",").map(s => s.trim());

app.set("trust proxy", 1);  // needed for correct req.ip behind Nginx

// Minimal cookie parser (no package needed)
app.use((req, _res, next) => {
  req.cookies = {};
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) req.cookies[k.trim()] = v.join("=").trim();
  }
  next();
});

const corsOptions = {
  origin:      (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  credentials: true,
  methods:     ["GET","POST","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(securityHeaders);
app.use(rateLimiter(120, 60_000));   // 120 req/min/IP global
app.use(requestLogger);
app.use(express.json({ limit: "64kb" }));

// ── Mount routes ──────────────────────────────────────────────────────────

authRoutes.register(app);
alertRoutes.register(app);
adminRoutes.register(app);

// ── Health endpoint ───────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  const uptime  = Math.round(process.uptime());
  const memMB   = Math.round(process.memoryUsage().rss / 1048576);
  const clients = sseClients.size;
  try {
    stmts.countAlerts.get();      // DB liveness probe
    res.json({ ok: true, uptime, memMB, sseClients: clients, pid: process.pid });
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

// ── ML results endpoint ───────────────────────────────────────────────────

const resultsPath = path.join(__dirname, "data", "model_comparison.json");

app.get("/api/results", (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(resultsPath, "utf-8")));
  } catch {
    res.status(503).json({ error: "Pipeline results not found. Run ml-pipeline first." });
  }
});

// ── Live SSE feed (authenticated) ────────────────────────────────────────

const sseClients = new Set();
const eventBuffer = [];
const MAX_BUFFER  = 40;
let   eventCounter = 0;

// Load the best deep model if available
let dlModel = null;
try {
  dlModel = JSON.parse(
    fs.readFileSync(path.join(__dirname, "data", "best_dl_model.json"), "utf-8")
  );
  console.log(`[ml] Loaded ${dlModel.model_name} for live inference`);
} catch {
  console.warn("[ml] best_dl_model.json not found — falling back to logistic regression");
}

function scoreFlow(row) {
  if (dlModel) {
    const feats = featuresFromRow(row, dlModel.feature_columns);
    return forwardPass(dlModel, feats);
  }
  const feats = featuresFromRow(row, edgeModel.feature_columns);
  return predictProbability(feats);
}

const fleet = createFleet();

function tick() {
  const device      = fleet[Math.floor(Math.random() * fleet.length)];
  const row         = device.nextFlow();
  const probability = scoreFlow(row);
  const isAttack    = probability >= 0.5;
  const { score, tier } = severityFromProbability(probability, device.deviceType);

  eventCounter += 1;
  const event = {
    id:               eventCounter,
    timestamp:        new Date().toISOString(),
    deviceId:         device.id,
    deviceType:       device.deviceType,
    predictedAttack:  isAttack,
    confidence:       Number(probability.toFixed(4)),
    severityScore:    score,
    severityTier:     tier,
    attackTypeGuess:  isAttack ? (row.attackType || "unclassified") : null,
    groundTruthAttack:row.groundTruthLabel === 1,
    metrics: {
      packetRate:     Math.round(row.packet_rate),
      byteRate:       Math.round(row.byte_rate),
      meanPacketSize: Math.round(row.mean_packet_size),
      synCount:       row.syn_count,
    },
  };

  // Persist attacks to database
  let dbAlertId = null;
  if (isAttack) {
    try {
      const result = stmts.insertAlert.run(
        event.deviceId, event.deviceType, tier, score,
        event.confidence, event.attackTypeGuess,
        event.metrics.packetRate, event.metrics.byteRate,
        event.metrics.synCount, event.groundTruthAttack ? 1 : 0
      );
      dbAlertId = Number(result.lastInsertRowid);
    } catch { /* non-fatal */ }
  }
  event.dbAlertId = dbAlertId;

  eventBuffer.push(event);
  if (eventBuffer.length > MAX_BUFFER) eventBuffer.shift();

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try { client.res.write(payload); } catch { sseClients.delete(client); }
  }
}

setInterval(tick, 900);

// SSE endpoint — requires a valid JWT in query param or Authorization header
app.get("/api/stream", (req, res) => {
  const token = req.query.token
    || (req.headers["authorization"] || "").replace("Bearer ", "");
  const payload = token ? verifyJwt(token) : null;
  if (!payload) return res.status(401).json({ error: "Authentication required for live feed." });

  res.writeHead(200, {
    "Content-Type":  "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection":    "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  const client = { res, userId: payload.sub };
  sseClients.add(client);

  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); }
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
  });
});

app.get("/api/alerts/recent", (req, res) => {
  res.json({ events: eventBuffer });
});

// ── Global error handler ──────────────────────────────────────────────────

app.use((err, req, res, _next) => {
  console.error("[error]", err.message, err.stack?.split("\n")[1]);
  res.status(500).json({ error: "Internal server error." });
});

// 404
app.use((req, res) => res.status(404).json({ error: "Not found." }));

// ── Start + graceful shutdown ─────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[server] Sentinel-IoMT backend on http://localhost:${PORT}`);
  console.log(`[server] ${process.env.NODE_ENV || "development"} mode`);
});

function shutdown(signal) {
  console.log(`\n[server] ${signal} received — shutting down gracefully`);
  server.close(() => {
    console.log("[server] HTTP server closed");
    for (const client of sseClients) {
      try { client.res.end(); } catch {}
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException",  (e) => { console.error("[uncaught]", e); });
process.on("unhandledRejection", (r) => { console.error("[unhandled]", r); });