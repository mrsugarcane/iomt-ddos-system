import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { API_BASE } from "./api";

const AuthContext = createContext(null);

// Access tokens live in memory only — never localStorage/sessionStorage,
// so they can't be read by an injected script (XSS) or persisted past the
// tab's lifetime. The refresh token lives in an httpOnly cookie the
// backend sets, which JS can't read at all.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef(null);

  const scheduleRefresh = useCallback((ttlSeconds = 13 * 60) => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(silentRefresh, ttlSeconds * 1000);
    // eslint-disable-next-line no-use-before-define
  }, []);

  async function silentRefresh() {
    try {
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("refresh failed");
      const data = await res.json();
      setAccessToken(data.accessToken);
      scheduleRefresh();
      return data.accessToken;
    } catch {
      setUser(null);
      setAccessToken(null);
      return null;
    }
  }

  useEffect(() => {
    (async () => {
      const token = await silentRefresh();
      if (token) {
        try {
          const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
            credentials: "include",
          });
          if (res.ok) setUser(await res.json());
        } catch { /* not logged in */ }
      }
      setLoading(false);
    })();
    return () => clearTimeout(refreshTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email, password) {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed.");
    setAccessToken(data.accessToken);
    setUser(data.user);
    scheduleRefresh();
    return data.user;
  }

  async function logout() {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch { /* ignore */ }
    clearTimeout(refreshTimer.current);
    setAccessToken(null);
    setUser(null);
  }

  // Wrapper that attaches the bearer token + cookie credentials, and
  // retries once after a silent refresh if the token has expired.
  async function authFetch(path, options = {}) {
    const doFetch = (token) =>
      fetch(`${API_BASE}${path}`, {
        ...options,
        credentials: "include",
        headers: {
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      });

    let res = await doFetch(accessToken);
    if (res.status === 401) {
      const fresh = await silentRefresh();
      if (fresh) res = await doFetch(fresh);
    }
    return res;
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
