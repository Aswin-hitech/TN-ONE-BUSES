/**
 * Thin fetch wrapper for THE TN ONE backend API.
 * Centralizes the base URL, credentials handling, and error normalization
 * so every page/module talks to the API the same way.
 */
const TNOne = (() => {
  // In production, serve the frontend and backend under the same origin
  // (e.g. behind one reverse proxy) or set this to the deployed API URL.
  const API_BASE = window.TN_ONE_API_BASE || "http://localhost:5000";

  async function request(path, { method = "GET", body, params } = {}) {
    let url = `${API_BASE}${path}`;
    if (params) {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
      ).toString();
      if (qs) url += `?${qs}`;
    }

    const res = await fetch(url, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });

    let payload = null;
    try {
      payload = await res.json();
    } catch (_) {
      // non-JSON response (shouldn't normally happen)
    }

    if (!res.ok) {
      const message = (payload && payload.error) || "Something went wrong. Please try again.";
      const error = new Error(message);
      error.status = res.status;
      error.code = payload && payload.code;
      throw error;
    }
    return payload;
  }

  return {
    get: (path, params) => request(path, { method: "GET", params }),
    post: (path, body) => request(path, { method: "POST", body }),
    API_BASE,
  };
})();
