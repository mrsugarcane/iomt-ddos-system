"use strict";
/**
 * Production middleware stack — all hand-rolled, zero npm packages.
 *
 * authenticate   — verifies the JWT access token in Authorization: Bearer
 * requireRole    — role-based access guard (admin > clinician > viewer)
 * rateLimiter    — sliding-window in-memory rate limiter per IP
 * securityHeaders— CSP, HSTS, X-Frame-Options, etc. (helmet-equivalent)
 * requestLogger  — structured JSON request log to stdout/file
 * validate       — thin body-validation helper
 */

const fs   = require("fs");
const path = require("path");
const { verifyJwt } = require("../auth");

// ── Security headers (helmet-equivalent) ─────────────────────────────────

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options",    "nosniff");
  res.setHeader("X-Frame-Options",           "DENY");
  res.setHeader("X-XSS-Protection",          "1; mode=block");
  res.setHeader("Referrer-Policy",           "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy",        "camera=(), microphone=(), geolocation=()");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'"
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }
  next();
}

// ── Rate limiter (sliding window, per-IP) ────────────────────────────────

const rateWindows = new Map();    // ip → [timestamp, ...]

// Without this, rateWindows grows by one entry per unique IP forever and
// never shrinks — a real memory leak on any deployment reachable from the
// open internet (scanners alone would accumulate thousands of entries/day).
// Sweep every 5 minutes and drop IPs with no hits inside the last hour.
function sweepRateWindows(maxAgeMs = 3600_000) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [ip, hits] of rateWindows) {
    const recent = hits.filter(t => t > cutoff);
    if (recent.length === 0) rateWindows.delete(ip);
    else rateWindows.set(ip, recent);
  }
}
const _rateSweepTimer = setInterval(sweepRateWindows, 5 * 60_000);
_rateSweepTimer.unref();

function rateLimiter(maxRequests = 60, windowMs = 60_000) {
  return function (req, res, next) {
    const ip  = req.ip || "unknown";
    const now = Date.now();
    if (!rateWindows.has(ip)) rateWindows.set(ip, []);
    const hits = rateWindows.get(ip).filter(t => now - t < windowMs);
    hits.push(now);
    rateWindows.set(ip, hits);
    res.setHeader("X-RateLimit-Limit",     maxRequests);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - hits.length));
    if (hits.length > maxRequests) {
      res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
      return res.status(429).json({ error: "Too many requests — please slow down." });
    }
    next();
  };
}

// Stricter limiter for auth endpoints
const authLimiter = rateLimiter(10, 60_000);

// ── JWT middleware ────────────────────────────────────────────────────────

function authenticate(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing access token." });
  const payload = verifyJwt(token);
  if (!payload) return res.status(401).json({ error: "Invalid or expired access token." });
  req.user = payload;
  next();
}

const ROLE_RANK = { viewer: 0, clinician: 1, admin: 2 };

function requireRole(minRole) {
  return function (req, res, next) {
    if (!req.user) return res.status(401).json({ error: "Not authenticated." });
    if ((ROLE_RANK[req.user.role] ?? -1) < (ROLE_RANK[minRole] ?? 99)) {
      return res.status(403).json({ error: `Requires role: ${minRole}` });
    }
    next();
  };
}

// ── Structured request logger ─────────────────────────────────────────────

const LOG_DIR  = path.join(__dirname, "..", "..", "logs");
fs.mkdirSync(LOG_DIR, { recursive: true });

function getLogStream() {
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(LOG_DIR, `access-${date}.log`);
  return fs.createWriteStream(file, { flags: "a" });
}

let _logStream = getLogStream();
// Rotate log file at midnight. unref() so this timer alone never keeps a
// process alive — the production server stays up because of its listening
// socket, but short-lived processes (tests, one-off scripts) can still exit
// cleanly.
const _logRotateTimer = setInterval(() => { _logStream = getLogStream(); }, 60_000);
_logRotateTimer.unref();

function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const entry = JSON.stringify({
      ts:      new Date().toISOString(),
      method:  req.method,
      path:    req.path,
      status:  res.statusCode,
      ms:      Date.now() - start,
      ip:      req.ip,
      user:    req.user?.email ?? null,
    });
    _logStream.write(entry + "\n");
    if (process.env.NODE_ENV !== "test") {
      const colour = res.statusCode >= 500 ? "\x1b[31m"
                   : res.statusCode >= 400 ? "\x1b[33m" : "\x1b[32m";
      process.stdout.write(
        `${colour}${req.method}\x1b[0m ${req.path} ${res.statusCode} ${Date.now()-start}ms\n`
      );
    }
  });
  next();
}

// ── Input validation helper ───────────────────────────────────────────────

function validate(schema) {
  return function (req, res, next) {
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
      const val = req.body[field];
      if (rules.required && (val === undefined || val === null || val === "")) {
        errors.push(`${field} is required`);
        continue;
      }
      if (val !== undefined && rules.type && typeof val !== rules.type) {
        errors.push(`${field} must be a ${rules.type}`);
      }
      if (rules.maxLength && typeof val === "string" && val.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }
      if (rules.enum && !rules.enum.includes(val)) {
        errors.push(`${field} must be one of: ${rules.enum.join(", ")}`);
      }
    }
    if (errors.length) return res.status(400).json({ error: "Validation failed", details: errors });
    next();
  };
}

module.exports = {
  securityHeaders,
  rateLimiter,
  authLimiter,
  authenticate,
  requireRole,
  requestLogger,
  validate,
  sweepRateWindows,
  _rateWindows: rateWindows,  // exposed for tests only
};
