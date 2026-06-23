"use strict";
/**
 * Integration test for the route layer.
 *
 * Express itself isn't installed (no network access to npm in this
 * sandbox), so this builds a minimal mock app that implements the exact
 * subset of the Express contract our routes rely on (app.get/post/delete
 * with a middleware chain, req.body/query/params/cookies, res.status/json).
 * This exercises real route handler logic — auth, DB writes, role guards —
 * not just isolated functions.
 *
 * Run: node --test tests/integration.test.js
 */

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");

// Isolated temp DB so this never touches real data
const TMP_DB = path.join(os.tmpdir(), `sentinel-test-${Date.now()}-${process.pid}.db`);
process.env.DB_PATH = TMP_DB;
process.env.JWT_SECRET = "test-secret-do-not-use-in-production";

function createMockApp() {
  const routes = [];
  const app = {
    get:    (p, ...h) => routes.push({ method: "GET",    path: p, handlers: h }),
    post:   (p, ...h) => routes.push({ method: "POST",   path: p, handlers: h }),
    delete: (p, ...h) => routes.push({ method: "DELETE", path: p, handlers: h }),
  };

  function matchRoute(method, urlPath) {
    for (const r of routes) {
      if (r.method !== method) continue;
      const rParts = r.path.split("/");
      const pParts = urlPath.split("/");
      if (rParts.length !== pParts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < rParts.length; i++) {
        if (rParts[i].startsWith(":")) params[rParts[i].slice(1)] = pParts[i];
        else if (rParts[i] !== pParts[i]) { ok = false; break; }
      }
      if (ok) return { route: r, params };
    }
    return null;
  }

  function request(method, urlPath, { body = {}, headers = {}, cookies = {}, query = {} } = {}) {
    const match = matchRoute(method, urlPath);
    if (!match) return { status: 404, body: { error: "no matching route" } };

    const req = { method, path: urlPath, body, headers, cookies, query, params: match.params, ip: "127.0.0.1" };
    const result = { status: 200, body: undefined, cookies: {} };
    const res = {
      status(c) { result.status = c; return this; },
      json(d)   { result.body = d; return this; },
      cookie(name, val) { result.cookies[name] = val; return this; },
      clearCookie(name) { delete result.cookies[name]; return this; },
      setHeader() { return this; },
    };

    let idx = 0;
    const handlers = match.route.handlers;
    (function next(err) {
      if (err) { result.status = 500; result.body = { error: err.message }; return; }
      const h = handlers[idx++];
      if (!h) return;
      h(req, res, next);
    })();

    return result;
  }

  return { app, request };
}

describe("integration — auth + alerts + admin flow", () => {
  let request;
  let adminToken, clinicianToken, viewerToken;

  before(() => {
    const { app, request: req } = createMockApp();
    request = req;
    require("../src/routes/auth").register(app);
    require("../src/routes/alerts").register(app);
    require("../src/routes/admin").register(app);
  });

  after(() => {
    try { require("../src/db/database").close(); } catch {}
    try { fs.unlinkSync(TMP_DB); } catch {}
    try { fs.unlinkSync(TMP_DB + "-wal"); } catch {}
    try { fs.unlinkSync(TMP_DB + "-shm"); } catch {}
  });

  test("default admin can log in", () => {
    const res = request("POST", "/api/auth/login", {
      body: { email: "admin@sentinel.local", password: "Admin@1234!" },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.accessToken);
    assert.equal(res.body.user.role, "admin");
    adminToken = res.body.accessToken;
  });

  test("wrong password is rejected", () => {
    const res = request("POST", "/api/auth/login", {
      body: { email: "admin@sentinel.local", password: "WrongPassword!" },
    });
    assert.equal(res.status, 401);
  });

  test("missing fields rejected by validator", () => {
    const res = request("POST", "/api/auth/login", { body: { email: "admin@sentinel.local" } });
    assert.equal(res.status, 400);
  });

  test("admin token resolves /api/auth/me", () => {
    const res = request("GET", "/api/auth/me", {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.email, "admin@sentinel.local");
  });

  test("request without token is rejected", () => {
    const res = request("GET", "/api/auth/me", {});
    assert.equal(res.status, 401);
  });

  test("admin creates a clinician user", () => {
    const res = request("POST", "/api/admin/users", {
      headers: { authorization: `Bearer ${adminToken}` },
      body: { email: "nurse@sentinel.local", password: "NursePass123!", role: "clinician", displayName: "Nurse Joy" },
    });
    assert.equal(res.status, 201);
  });

  test("admin creates a viewer user", () => {
    const res = request("POST", "/api/admin/users", {
      headers: { authorization: `Bearer ${adminToken}` },
      body: { email: "viewer@sentinel.local", password: "ViewerPass123!", role: "viewer" },
    });
    assert.equal(res.status, 201);
  });

  test("duplicate email is rejected with 409", () => {
    const res = request("POST", "/api/admin/users", {
      headers: { authorization: `Bearer ${adminToken}` },
      body: { email: "nurse@sentinel.local", password: "AnotherPass123!", role: "viewer" },
    });
    assert.equal(res.status, 409);
  });

  test("new clinician can log in", () => {
    const res = request("POST", "/api/auth/login", {
      body: { email: "nurse@sentinel.local", password: "NursePass123!" },
    });
    assert.equal(res.status, 200);
    clinicianToken = res.body.accessToken;
  });

  test("new viewer can log in", () => {
    const res = request("POST", "/api/auth/login", {
      body: { email: "viewer@sentinel.local", password: "ViewerPass123!" },
    });
    assert.equal(res.status, 200);
    viewerToken = res.body.accessToken;
  });

  test("viewer is blocked from admin endpoint (role guard)", () => {
    const res = request("GET", "/api/admin/users", {
      headers: { authorization: `Bearer ${viewerToken}` },
    });
    assert.equal(res.status, 403);
  });

  test("clinician is blocked from admin endpoint too", () => {
    const res = request("GET", "/api/admin/users", {
      headers: { authorization: `Bearer ${clinicianToken}` },
    });
    assert.equal(res.status, 403);
  });

  test("admin can list users and sees seeded + created accounts", () => {
    const res = request("GET", "/api/admin/users", {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.users.length >= 3);
  });

  let alertId;

  test("an alert can be inserted and listed", () => {
    const { stmts } = require("../src/db/database");
    const r = stmts.insertAlert.run(
      "PUMP-01", "infusion_pump", "Critical", 92, 0.97,
      "volumetric", 5000, 600000, 0, 1
    );
    alertId = Number(r.lastInsertRowid);
    assert.ok(alertId > 0);

    const res = request("GET", "/api/alerts", {
      headers: { authorization: `Bearer ${viewerToken}` },
      query: { limit: "10", page: "0" },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.alerts.some(a => a.id === alertId));
  });

  test("viewer cannot acknowledge an alert (requires clinician+)", () => {
    const res = request("POST", `/api/alerts/${alertId}/action`, {
      headers: { authorization: `Bearer ${viewerToken}` },
      body: { action: "acknowledge" },
    });
    assert.equal(res.status, 403);
  });

  test("clinician can acknowledge an alert", () => {
    const res = request("POST", `/api/alerts/${alertId}/action`, {
      headers: { authorization: `Bearer ${clinicianToken}` },
      body: { action: "acknowledge", note: "Checked on patient, device rebooted." },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.newStatus, "acknowledged");
  });

  test("alert detail now shows acknowledgement history", () => {
    const res = request("GET", `/api/alerts/${alertId}`, {
      headers: { authorization: `Bearer ${clinicianToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.alert.status, "acknowledged");
    assert.equal(res.body.history.length, 1);
    assert.equal(res.body.history[0].action, "acknowledge");
  });

  test("admin can deactivate the viewer account", () => {
    const { stmts } = require("../src/db/database");
    const viewer = stmts.getUserByEmail.get("viewer@sentinel.local");
    const res = request("DELETE", `/api/admin/users/${viewer.id}`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
  });

  test("deactivated viewer can no longer log in", () => {
    const res = request("POST", "/api/auth/login", {
      body: { email: "viewer@sentinel.local", password: "ViewerPass123!" },
    });
    assert.equal(res.status, 401);
  });

  test("admin cannot deactivate their own account", () => {
    const { stmts } = require("../src/db/database");
    const admin = stmts.getUserByEmail.get("admin@sentinel.local");
    const res = request("DELETE", `/api/admin/users/${admin.id}`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 400);
  });

  test("audit log recorded the login/admin actions", () => {
    const res = request("GET", "/api/admin/audit", {
      headers: { authorization: `Bearer ${adminToken}` },
      query: { limit: "50", page: "0" },
    });
    assert.equal(res.status, 200);
    const actions = res.body.log.map(l => l.action);
    assert.ok(actions.includes("login_success"));
    assert.ok(actions.includes("user_created"));
    assert.ok(actions.includes("alert_acknowledge"));
  });

  test("wrong current password is rejected when changing password", () => {
    const res = request("POST", "/api/auth/change-password", {
      headers: { authorization: `Bearer ${clinicianToken}` },
      body: { currentPassword: "WrongOne!", newPassword: "BrandNewPass123!" },
    });
    assert.equal(res.status, 401);
  });

  test("new password shorter than 10 chars is rejected", () => {
    const res = request("POST", "/api/auth/change-password", {
      headers: { authorization: `Bearer ${clinicianToken}` },
      body: { currentPassword: "NursePass123!", newPassword: "short" },
    });
    assert.equal(res.status, 400);
  });

  test("correct current password changes it, and the new password works", () => {
    const res = request("POST", "/api/auth/change-password", {
      headers: { authorization: `Bearer ${clinicianToken}` },
      body: { currentPassword: "NursePass123!", newPassword: "BrandNewPass123!" },
    });
    assert.equal(res.status, 200);

    const oldLogin = request("POST", "/api/auth/login", {
      body: { email: "nurse@sentinel.local", password: "NursePass123!" },
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = request("POST", "/api/auth/login", {
      body: { email: "nurse@sentinel.local", password: "BrandNewPass123!" },
    });
    assert.equal(newLogin.status, 200);
  });
});
