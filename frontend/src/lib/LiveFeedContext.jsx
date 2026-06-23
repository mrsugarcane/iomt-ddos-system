import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { API_BASE } from "./api";
import { useAuth } from "./AuthContext";

const LiveFeedContext = createContext({
  events: [],
  latestEvent: null,
  connected: false,
});

const MAX_EVENTS = 40;

export function LiveFeedProvider({ children }) {
  const { accessToken } = useAuth();
  const [events, setEvents] = useState([]);
  const [latestEvent, setLatestEvent] = useState(null);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE}/api/alerts/recent`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.events)) {
          setEvents(data.events.slice(-MAX_EVENTS));
          if (data.events.length) setLatestEvent(data.events[data.events.length - 1]);
        }
      })
      .catch(() => {});

    if (!accessToken) {
      setConnected(false);
      return () => { cancelled = true; };
    }

    // EventSource can't set custom headers, so the access token travels
    // as a query param over TLS. It's short-lived (15 min) and never
    // logged server-side in plaintext beyond the access log.
    const es = new EventSource(`${API_BASE}/api/stream?token=${encodeURIComponent(accessToken)}`);
    sourceRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        setLatestEvent(event);
        setEvents((prev) => {
          const next = [...prev, event];
          return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
        });
      } catch {
        // ignore malformed payloads
      }
    };

    return () => {
      cancelled = true;
      es.close();
    };
  }, [accessToken]);

  return (
    <LiveFeedContext.Provider value={{ events, latestEvent, connected }}>
      {children}
    </LiveFeedContext.Provider>
  );
}

export function useLiveFeed() {
  return useContext(LiveFeedContext);
}
