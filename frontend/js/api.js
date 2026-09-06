/**
 * Thin fetch wrapper for THE TN ONE backend API.
 * Centralizes the base URL, credentials handling, and error normalization
 * so every page/module talks to the API the same way.
 */
const TNOne = (() => {
  // If explicitly set, use that; if running from a web server (e.g. http://localhost:5000, 127.0.0.1:5000, or deployed),
  // use the window's origin. If running on a different port like 8080 or file://, fallback to http://localhost:5000.
  const getApiBase = () => {
    if (window.TN_ONE_API_BASE) return window.TN_ONE_API_BASE;
    if (window.location && window.location.origin && window.location.origin.startsWith("http")) {
      return window.location.origin;
    }
    return "http://localhost:5000";
  };

  const API_BASE = getApiBase();

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
    API_BASE,
  };
})();

