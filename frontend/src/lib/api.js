export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export async function fetchResults() {
  const res = await fetch(`${API_BASE}/api/results`);
  if (!res.ok) {
    throw new Error("Could not load results. Make sure the ML pipeline has been run and the backend is running.");
  }
  return res.json();
}
