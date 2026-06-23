"use strict";
/**
 * Database layer — node:sqlite (built-in, no npm needed).
 *
 * Schema
 * ──────
 * users        – accounts with role-based access (admin | clinician | viewer)
 * alerts       – persistent alert records written by the live-feed engine
 * alert_acks   – acknowledgements and escalation records per alert
 * audit_log    – immutable append-only log of every auth and alert action
 * sessions     – revocable refresh-token store
 */

const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs   = require("fs");

const DB_PATH = process.env.DB_PATH
  || path.join(__dirname, "..", "..", "data", "sentinel.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

// ── Schema ────────────────────────────────────────────────────────────────

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'viewer'
                          CHECK(role IN ('admin','clinician','viewer')),
    display_name  TEXT,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login    TEXT
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id      TEXT    NOT NULL,
    device_type    TEXT    NOT NULL,
    severity_tier  TEXT    NOT NULL,
    severity_score INTEGER NOT NULL,
    confidence     REAL    NOT NULL,
    attack_type    TEXT,
    packet_rate    INTEGER,
    byte_rate      INTEGER,
    syn_count      INTEGER,
    ground_truth   INTEGER,
    status         TEXT    NOT NULL DEFAULT 'open'
                           CHECK(status IN ('open','acknowledged','escalated','resolved')),
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alert_acks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_id   INTEGER NOT NULL REFERENCES alerts(id),
    user_id    INTEGER NOT NULL REFERENCES users(id),
    action     TEXT    NOT NULL CHECK(action IN ('acknowledge','escalate','resolve')),
    note       TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id),
    action     TEXT    NOT NULL,
    target     TEXT,
    ip         TEXT,
    user_agent TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    refresh_token TEXT    NOT NULL UNIQUE,
    expires_at    TEXT    NOT NULL,
    ip            TEXT,
    revoked       INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_alerts_status    ON alerts(status);
  CREATE INDEX IF NOT EXISTS idx_alerts_created   ON alerts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_alerts_device    ON alerts(device_id);
  CREATE INDEX IF NOT EXISTS idx_audit_user       ON audit_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(refresh_token);
  CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
`);

// ── Prepared statements ───────────────────────────────────────────────────

const stmts = {
  // users
  getUserByEmail    : db.prepare("SELECT * FROM users WHERE email=? AND active=1"),
  getUserById       : db.prepare("SELECT * FROM users WHERE id=?"),
  createUser        : db.prepare(
    "INSERT INTO users (email,password_hash,role,display_name) VALUES (?,?,?,?)"
  ),
  updateLastLogin   : db.prepare(
    "UPDATE users SET last_login=datetime('now') WHERE id=?"
  ),
  updatePassword    : db.prepare(
    "UPDATE users SET password_hash=? WHERE id=?"
  ),
  listUsers         : db.prepare(
    "SELECT id,email,role,display_name,active,created_at,last_login FROM users ORDER BY id"
  ),
  deactivateUser    : db.prepare("UPDATE users SET active=0 WHERE id=?"),

  // alerts
  insertAlert       : db.prepare(`
    INSERT INTO alerts
      (device_id,device_type,severity_tier,severity_score,confidence,
       attack_type,packet_rate,byte_rate,syn_count,ground_truth)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `),
  getAlerts         : db.prepare(`
    SELECT * FROM alerts ORDER BY created_at DESC LIMIT ? OFFSET ?
  `),
  getAlertsByStatus : db.prepare(`
    SELECT * FROM alerts WHERE status=? ORDER BY created_at DESC LIMIT ? OFFSET ?
  `),
  getAlertById      : db.prepare("SELECT * FROM alerts WHERE id=?"),
  updateAlertStatus : db.prepare(`
    UPDATE alerts SET status=?,updated_at=datetime('now') WHERE id=?
  `),
  countAlerts       : db.prepare("SELECT COUNT(*) AS n FROM alerts"),
  countByStatus     : db.prepare("SELECT COUNT(*) AS n FROM alerts WHERE status=?"),

  // acks
  insertAck         : db.prepare(
    "INSERT INTO alert_acks (alert_id,user_id,action,note) VALUES (?,?,?,?)"
  ),
  getAcksByAlert    : db.prepare(
    "SELECT aa.*,u.email,u.display_name FROM alert_acks aa JOIN users u ON aa.user_id=u.id WHERE aa.alert_id=? ORDER BY aa.created_at"
  ),

  // audit
  audit             : db.prepare(
    "INSERT INTO audit_log (user_id,action,target,ip,user_agent) VALUES (?,?,?,?,?)"
  ),
  getAuditLog       : db.prepare(
    "SELECT al.*,u.email FROM audit_log al LEFT JOIN users u ON al.user_id=u.id ORDER BY al.created_at DESC LIMIT ? OFFSET ?"
  ),

  // sessions
  createSession     : db.prepare(
    "INSERT INTO sessions (user_id,refresh_token,expires_at,ip) VALUES (?,?,?,?)"
  ),
  getSession        : db.prepare(
    "SELECT * FROM sessions WHERE refresh_token=? AND revoked=0"
  ),
  revokeSession     : db.prepare(
    "UPDATE sessions SET revoked=1 WHERE refresh_token=?"
  ),
  revokeAllUserSessions : db.prepare(
    "UPDATE sessions SET revoked=1 WHERE user_id=?"
  ),
  cleanExpiredSessions : db.prepare(
    "DELETE FROM sessions WHERE expires_at < datetime('now')"
  ),
};

// ── Seed default admin if no users exist ──────────────────────────────────

function seedDefaultAdmin(hashFn) {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get();
  if (count.n === 0) {
    const hash = hashFn("Admin@1234!");
    stmts.createUser.run("admin@sentinel.local", hash, "admin", "System Admin");
    console.log("[db] Seeded default admin: admin@sentinel.local / Admin@1234!");
    console.log("[db] CHANGE THIS PASSWORD BEFORE EXPOSING TO A NETWORK.");
  }
}

// node:sqlite rejects `undefined` bound parameters (only accepts null,
// number, string, bigint, Buffer). Request objects routinely have
// undefined headers/ip in edge cases (missing User-Agent, mock requests
// in tests, certain proxies) — this guards every audit write against that.
function audit(userId, action, target, req) {
  stmts.audit.run(
    userId ?? null,
    action,
    target ?? null,
    req?.ip ?? null,
    req?.headers?.["user-agent"] ?? null
  );
}

module.exports = { db, stmts, seedDefaultAdmin, audit, close: () => db.close() };
