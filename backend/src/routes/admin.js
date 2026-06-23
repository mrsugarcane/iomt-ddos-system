"use strict";
const { stmts, audit } = require("../db/database");
const { hashPassword } = require("../auth");
const { authenticate, requireRole, validate } = require("../middleware");

function register(app) {

  // GET /api/admin/users
  app.get("/api/admin/users", authenticate, requireRole("admin"), (req, res) => {
    const users = stmts.listUsers.all();
    return res.json({ users });
  });

  // POST /api/admin/users
  app.post(
    "/api/admin/users",
    authenticate,
    requireRole("admin"),
    validate({
      email:       { required: true,  type: "string", maxLength: 254 },
      password:    { required: true,  type: "string", maxLength: 128 },
      role:        { required: true,  type: "string", enum: ["admin","clinician","viewer"] },
      displayName: { required: false, type: "string", maxLength: 80 },
    }),
    (req, res) => {
      const { email, password, role, displayName } = req.body;
      if (password.length < 10) {
        return res.status(400).json({ error: "Password must be at least 10 characters." });
      }
      try {
        const hash = hashPassword(password);
        stmts.createUser.run(email.toLowerCase().trim(), hash, role, displayName || null);
        audit(req.user.sub, "user_created", `email:${email}`, req);
        return res.status(201).json({ ok: true });
      } catch (e) {
        if (e.message?.includes("UNIQUE")) {
          return res.status(409).json({ error: "Email already exists." });
        }
        throw e;
      }
    }
  );

  // DELETE /api/admin/users/:id
  app.delete("/api/admin/users/:id", authenticate, requireRole("admin"), (req, res) => {
    const targetId = parseInt(req.params.id);
    if (targetId === req.user.sub) {
      return res.status(400).json({ error: "Cannot deactivate your own account." });
    }
    stmts.deactivateUser.run(targetId);
    stmts.revokeAllUserSessions.run(targetId);
    audit(req.user.sub, "user_deactivated", `user:${targetId}`, req);
    return res.json({ ok: true });
  });

  // GET /api/admin/audit?page=0&limit=100
  app.get("/api/admin/audit", authenticate, requireRole("admin"), (req, res) => {
    const limit  = Math.min(parseInt(req.query.limit || "100"), 500);
    const offset = parseInt(req.query.page || "0") * limit;
    const rows   = stmts.getAuditLog.all(limit, offset);
    return res.json({ log: rows, limit, offset });
  });
}

module.exports = { register };
