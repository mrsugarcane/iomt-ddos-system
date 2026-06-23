"use strict";
const { stmts, audit } = require("../db/database");
const { authenticate, requireRole, validate } = require("../middleware");

function register(app) {

  // GET /api/alerts?status=open&page=0&limit=40
  app.get("/api/alerts", authenticate, (req, res) => {
    const limit  = Math.min(parseInt(req.query.limit  || "40"), 200);
    const offset = parseInt(req.query.page || "0") * limit;
    const status = req.query.status;

    const rows = status
      ? stmts.getAlertsByStatus.all(status, limit, offset)
      : stmts.getAlerts.all(limit, offset);
    const total = status
      ? stmts.countByStatus.get(status).n
      : stmts.countAlerts.get().n;

    return res.json({ alerts: rows, total, limit, offset });
  });

  // GET /api/alerts/:id
  app.get("/api/alerts/:id", authenticate, (req, res) => {
    const alert = stmts.getAlertById.get(parseInt(req.params.id));
    if (!alert) return res.status(404).json({ error: "Alert not found." });
    const acks = stmts.getAcksByAlert.all(alert.id);
    return res.json({ alert, history: acks });
  });

  // POST /api/alerts/:id/action  {action: acknowledge|escalate|resolve, note?}
  app.post(
    "/api/alerts/:id/action",
    authenticate,
    requireRole("clinician"),
    validate({
      action: { required: true, type: "string", enum: ["acknowledge", "escalate", "resolve"] },
      note:   { required: false, type: "string", maxLength: 1000 },
    }),
    (req, res) => {
      const alertId = parseInt(req.params.id);
      const alert   = stmts.getAlertById.get(alertId);
      if (!alert) return res.status(404).json({ error: "Alert not found." });

      const { action, note } = req.body;
      const statusMap = { acknowledge: "acknowledged", escalate: "escalated", resolve: "resolved" };
      const newStatus = statusMap[action];

      stmts.updateAlertStatus.run(newStatus, alertId);
      stmts.insertAck.run(alertId, req.user.sub, action, note || null);
      audit(req.user.sub, `alert_${action}`, `alert:${alertId}`, req);

      return res.json({ ok: true, alertId, newStatus });
    }
  );

  // GET /api/alerts/stats/summary  (admin + clinician)
  app.get("/api/alerts/stats/summary", authenticate, requireRole("clinician"), (req, res) => {
    const statuses = ["open", "acknowledged", "escalated", "resolved"];
    const counts = {};
    for (const s of statuses) counts[s] = stmts.countByStatus.get(s).n;

    const recent24h = stmts.db
      ? null // handled below
      : 0;

    const { db } = require("../db/database");
    const bySeverity = db.prepare(`
      SELECT severity_tier, COUNT(*) AS n FROM alerts GROUP BY severity_tier
    `).all();
    const byDevice = db.prepare(`
      SELECT device_type, COUNT(*) AS n FROM alerts GROUP BY device_type ORDER BY n DESC LIMIT 10
    `).all();
    const last24h = db.prepare(`
      SELECT COUNT(*) AS n FROM alerts WHERE created_at > datetime('now','-1 day')
    `).get().n;

    return res.json({ counts, bySeverity, byDevice, last24h, total: stmts.countAlerts.get().n });
  });
}

module.exports = { register };
