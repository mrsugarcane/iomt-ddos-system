import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
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

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = user?.role === "admin" ? [...NAV_ITEMS, { to: "/admin", label: "Admin" }] : NAV_ITEMS;

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate("/login");
  }

  return (
    <div className="md:hidden sticky top-0 z-30 bg-surface/90 backdrop-blur-sm border-b border-hairline">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="font-display font-semibold text-base text-ink-primary">
          Sentinel<span className="text-signal">-IoMT</span>
        </div>
        <button
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          className="text-ink-primary p-1"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
          </svg>
        </button>
      </div>

      {open && (
        <nav className="px-3 pb-3 space-y-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block px-3 py-2.5 rounded-md text-sm font-body ${
                  isActive ? "bg-signal/10 text-signal" : "text-ink-muted"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {user && (
            <NavLink
              to="/account"
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 rounded-md text-sm font-mono text-ink-muted"
            >
              Account ({user.email})
            </NavLink>
          )}
          {user && (
            <button
              onClick={handleLogout}
              className="block w-full text-left px-3 py-2.5 rounded-md text-sm font-mono text-alert"
            >
              Logout
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
