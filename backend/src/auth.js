"use strict";
/**
 * Authentication utilities.
 *
 * Passwords  — PBKDF2-SHA256, 310,000 iterations (NIST 2023 recommendation),
 *              per-user random 32-byte salt, stored as salt:hash (hex).
 *
 * Tokens     — Hand-rolled JWT using HMAC-SHA256 and Node's built-in crypto.
 *              Access token: 15 min.  Refresh token: 7 days (stored in DB,
 *              revocable).
 *
 * All of this is constant-time to protect against timing attacks on the
 * auth endpoints.
 */

const crypto = require("crypto");

const JWT_SECRET  = process.env.JWT_SECRET  || (() => {
  console.warn("[auth] JWT_SECRET not set — using generated secret (restart = new secret)");
  return crypto.randomBytes(48).toString("hex");
})();
const ACCESS_TTL  = 15 * 60;          // 15 minutes in seconds
const REFRESH_TTL = 7  * 24 * 3600;   // 7 days in seconds

// ── Password hashing ──────────────────────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 310_000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, storedHash] = stored.split(":");
  const hash = crypto.pbkdf2Sync(password, salt, 310_000, 64, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
}

// ── JWT (HMAC-SHA256) ─────────────────────────────────────────────────────

function b64url(buf) {
  return (typeof buf === "string" ? Buffer.from(buf) : buf)
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signJwt(payload, ttlSeconds) {
  const header  = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now     = Math.floor(Date.now() / 1000);
  const body    = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const sig     = b64url(
    crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token) {
  try {
    const [h, b, sig] = token.split(".");
    const expected = b64url(
      crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${b}`).digest()
    );
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(b, "base64").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function issueAccessToken(user) {
  return signJwt({ sub: user.id, email: user.email, role: user.role }, ACCESS_TTL);
}

function issueRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

function refreshExpiresAt() {
  return new Date(Date.now() + REFRESH_TTL * 1000).toISOString();
}

module.exports = {
  hashPassword,
  verifyPassword,
  issueAccessToken,
  issueRefreshToken,
  refreshExpiresAt,
  verifyJwt,
  ACCESS_TTL,
  REFRESH_TTL,
};
