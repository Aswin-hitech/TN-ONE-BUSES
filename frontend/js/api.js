/**
 * Thin fetch wrapper for TN FOR BUS backend API.
 * Centralizes the base URL, credentials handling, and error normalization
 * so every page/module talks to the API the same way.
 */
const TNOne = (() => {
  // If explicitly set, use that; if running from a web server (e.g. http://localhost:5000, 127.0.0.1:5000, or deployed),
  // use the window's origin. If running on a different port like 8080 or file://, fallback to http://localhost:5000.
  const getApiBase = () => {
    if (window.TN_FOR_BUS_API_BASE) return window.TN_FOR_BUS_API_BASE;
    if (window.TN_ONE_API_BASE) return window.TN_ONE_API_BASE;
    if (window.location && window.location.origin && window.location.origin.startsWith("http")) {
      return window.location.origin;
    }
    return "http://localhost:5000";
  };

  const API_BASE = getApiBase();
  const UNSAFE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

  let csrfToken = null;
  let csrfPending = null;

  function resolveUrl(path) {
    return `${API_BASE}${path}`;
  }

  async function getCsrfToken(force = false) {
    if (csrfToken && !force) return csrfToken;
    if (csrfPending && !force) return csrfPending;

    csrfPending = (async () => {
      try {
        const res = await fetch(resolveUrl("/api/auth/csrf"), {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return null;
        const payload = await res.json().catch(() => null);
        const token = payload && payload.data && payload.data.csrf_token;
        if (token) csrfToken = token;
        return csrfToken;
      } catch (_) {
        return null;
      } finally {
        csrfPending = null;
      }
    })();

    return csrfPending;
  }

  function csrfHeaders(token) {
    return token ? { "X-CSRF-Token": token } : {};
  }

  async function request(path, { method = "GET", body, params, signal } = {}) {
    let url = resolveUrl(path);
    if (params) {
      const qs = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
      ).toString();
      if (qs) url += `?${qs}`;
    }

    const unsafe = UNSAFE_METHODS.includes(method);
    const send = (token) =>
      fetch(url, {
        method,
        credentials: "include",
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...csrfHeaders(token),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });

    let res;
    try {
      res = await send(unsafe ? await getCsrfToken() : null);

      // If the session rotated (or the page was open across a sign-in), fetch
      // a fresh token and retry exactly once.
      if (res.status === 403 && unsafe) {
        const probe = await res.clone().json().catch(() => null);
        if (probe && probe.code === "csrf_failed") {
          const fresh = await getCsrfToken(true);
          if (fresh) res = await send(fresh);
        }
      }
    } catch (networkError) {
      const error = new Error("Network problem. Check your connection and try again.");
      error.status = 0;
      error.cause = networkError;
      throw error;
    }

    let payload = null;
    try {
      payload = await res.json();
    } catch (_) {
      // non-JSON response (shouldn't normally happen)
    }

    if (!res.ok) {
      const message =
        (payload && (payload.error || payload.message)) ||
        (res.status === 429
          ? "Too many requests. Please slow down."
          : "Something went wrong. Please try again.");
      const error = new Error(message);
      error.status = res.status;
      error.code = payload && payload.code;
      error.data = payload && payload.data;
      throw error;
    }
    return payload;
  }

  function formatTimeAmPm(val) {
    if (!val && val !== 0) return "";
    if (val instanceof Date) {
      return val.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
    }
    let str = String(val).trim();
    if (!str) return "";

    // Check if it already has am/pm
    const ampmMatch = str.match(/^(.*?)\s*([ap]\.?m\.?)$/i);
    if (ampmMatch) {
      const timePart = ampmMatch[1].trim();
      const period = ampmMatch[2].toUpperCase().replace(/\./g, "");
      const parts = timePart.split(":");
      if (parts.length >= 2) {
        let h = parseInt(parts[0], 10);
        const m = parts[1].padStart(2, "0");
        if (h > 12) h = h % 12 || 12;
        return `${h}:${m} ${period}`;
      }
      return `${timePart} ${period}`;
    }

    // Check if ISO Date string or includes date parts
    if (str.includes("T") || (str.includes("-") && str.includes(":"))) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }).toUpperCase();
      }
    }

    // Match 24-hr format like HH:MM or HH:MM:SS
    const match = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2];
      const period = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      return `${hours}:${minutes} ${period}`;
    }

    return str;
  }

  window.formatTimeAmPm = formatTimeAmPm;

  return {
    get: (path, params) => request(path, { method: "GET", params }),
    post: (path, body) => request(path, { method: "POST", body }),
    put: (path, body) => request(path, { method: "PUT", body }),
    request,
    formatTimeAmPm,
    getCsrfToken,
    API_BASE,
  };
})();

