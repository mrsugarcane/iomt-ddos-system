import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useLiveFeed } from "../lib/LiveFeedContext";
import { useAuth } from "../lib/AuthContext";

const NAV_ITEMS = [
  { to: "/", label: "Overview" },
  { to: "/dataset", label: "Dataset" },
  { to: "/models", label: "Models" },
  { to: "/explainability", label: "Explainability" },
  { to: "/monitor", label: "Live Monitor" },
  { to: "/alerts", label: "Alert Queue" },
  { to: "/about", label: "About" },
];

export default function Sidebar() {
  const { connected } = useLiveFeed();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const items = user?.role === "admin"
    ? [...NAV_ITEMS, { to: "/admin", label: "Admin" }]
    : NAV_ITEMS;

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] border-r border-hairline bg-surface/70 backdrop-blur-sm flex flex-col z-20 max-md:hidden">
      <div className="px-6 py-7">
        <div className="font-display font-semibold text-lg text-ink-primary tracking-tight">
          Sentinel<span className="text-signal">-IoMT</span>
        </div>
        <div className="font-mono text-[10px] text-ink-faint mt-1 tracking-wider">
          DDoS PREDICTION SYSTEM
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `block px-3 py-2.5 rounded-md text-sm font-body transition-colors ${
                isActive
                  ? "bg-signal/10 text-signal border border-signal/30"
                  : "text-ink-muted hover:text-ink-primary hover:bg-surface2"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-6 py-4 border-t border-hairline">
        <div className="flex items-center gap-2 font-mono text-[11px] text-ink-muted mb-3">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              connected ? "bg-signal animate-pulse" : "bg-ink-faint"
            }`}
          />
          {connected ? "LIVE FEED CONNECTED" : "FEED OFFLINE"}
        </div>
        {user && (
          <div className="flex items-center justify-between">
            <NavLink to="/account" className="overflow-hidden hover:opacity-80">
              <div className="font-body text-xs text-ink-primary truncate">{user.email}</div>
              <div className="font-mono text-[10px] text-ink-faint uppercase">{user.role}</div>
            </NavLink>
            <button
              onClick={handleLogout}
              className="font-mono text-[10px] text-ink-muted hover:text-alert shrink-0 ml-2"
            >
              logout
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
