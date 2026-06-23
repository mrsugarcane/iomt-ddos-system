"use strict";
const { stmts, seedDefaultAdmin, audit } = require("../db/database");
const {
  hashPassword, verifyPassword,
  issueAccessToken, issueRefreshToken, refreshExpiresAt, verifyJwt,
} = require("../auth");
const { authLimiter, authenticate, validate } = require("../middleware");

// Seed the default admin user now that hashPassword is available
seedDefaultAdmin(hashPassword);

function register(app) {

  // POST /api/auth/login
  app.post(
    "/api/auth/login",
    authLimiter,
    validate({
      email:    { required: true, type: "string", maxLength: 254 },
      password: { required: true, type: "string", maxLength: 128 },
    }),
    (req, res) => {
      const { email, password } = req.body;
      const user = stmts.getUserByEmail.get(email.toLowerCase().trim());
      if (!user) {
        // constant-time dummy to prevent user enumeration
        crypto_noop();
        return res.status(401).json({ error: "Invalid credentials." });
      }
      if (!verifyPassword(password, user.password_hash)) {
        audit(user.id, "login_failed", null, req);
        return res.status(401).json({ error: "Invalid credentials." });
      }
      const accessToken  = issueAccessToken(user);
      const refreshToken = issueRefreshToken();
      const expiresAt    = refreshExpiresAt();
      stmts.createSession.run(user.id, refreshToken, expiresAt, req.ip);
      stmts.updateLastLogin.run(user.id);
      audit(user.id, "login_success", null, req);

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge:   7 * 24 * 60 * 60 * 1000,
        path:     "/api/auth",
      });
      return res.json({
        accessToken,
        user: { id: user.id, email: user.email, role: user.role, displayName: user.display_name },
      });
    }
  );

  // POST /api/auth/refresh  (uses httpOnly cookie)
  app.post("/api/auth/refresh", authLimiter, (req, res) => {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ error: "No refresh token." });
    const session = stmts.getSession.get(token);
    if (!session || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: "Session expired — please log in again." });
    }
    const user = stmts.getUserById.get(session.user_id);
    if (!user || !user.active) return res.status(401).json({ error: "Account disabled." });
    const accessToken = issueAccessToken(user);
    audit(user.id, "token_refresh", null, req);
    return res.json({ accessToken });
  });

  // POST /api/auth/logout
  app.post("/api/auth/logout", authenticate, (req, res) => {
    const token = req.cookies?.refreshToken;
    if (token) stmts.revokeSession.run(token);
    audit(req.user.sub, "logout", null, req);
    res.clearCookie("refreshToken", { path: "/api/auth" });
    return res.json({ ok: true });
  });

  // GET /api/auth/me
  app.get("/api/auth/me", authenticate, (req, res) => {
    const user = stmts.getUserById.get(req.user.sub);
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json({
      id: user.id, email: user.email, role: user.role,
      displayName: user.display_name, lastLogin: user.last_login,
    });
  });

  // POST /api/auth/change-password
  app.post(
    "/api/auth/change-password",
    authenticate,
    validate({
      currentPassword: { required: true, type: "string", maxLength: 128 },
      newPassword:     { required: true, type: "string", maxLength: 128 },
    }),
    (req, res) => {
      const { currentPassword, newPassword } = req.body;
      if (newPassword.length < 10) {
        return res.status(400).json({ error: "New password must be at least 10 characters." });
      }
      const user = stmts.getUserById.get(req.user.sub);
      if (!user || !verifyPassword(currentPassword, user.password_hash)) {
        audit(req.user.sub, "password_change_failed", null, req);
        return res.status(401).json({ error: "Current password is incorrect." });
      }
      stmts.updatePassword.run(hashPassword(newPassword), user.id);
      // Revoke every other refresh-token session — a password change should
      // immediately invalidate any other logged-in session/device.
      stmts.revokeAllUserSessions.run(user.id);
      audit(user.id, "password_changed", null, req);
      return res.json({ ok: true });
    }
  );
}

// Constant-time no-op to prevent timing-based user enumeration
function crypto_noop() {
  const dummy = "x".repeat(32) + ":" + "0".repeat(128);
  const [salt, hash] = dummy.split(":");
  require("crypto").pbkdf2Sync("dummy", salt, 310_000, 64, "sha256");
}

module.exports = { register };
