/**
 * TN FOR BUS — shared UI kit
 * Icons, formatting, ride cards, autocomplete, toasts, sheet + modal controls.
 * No framework, no build step: every page includes api.js then ui.js.
 */
const TNUI = (() => {
  /* ------------------------------------------------------------------ icons */
  const ICON_PATHS = {
    bus: '<path d="M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11"/><path d="M4 11h16"/><path d="M8 17v2"/><path d="M16 17v2"/><path d="M6 17h12"/><circle cx="7.5" cy="14" r="1"/><circle cx="16.5" cy="14" r="1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
    mapPin: '<path d="M12 21s-7-5.6-7-11a7 7 0 1 1 14 0c0 5.4-7 11-7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    arrowRight: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronUp: '<path d="m6 15 6-6 6 6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>',
    home: '<path d="m3.5 10.5 8.5-7 8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-5.5h5V20"/>',
    route: '<circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M8.4 6H14a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h5.6"/>',
    share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>',
    edit: '<path d="M4 20h4l10.5-10.5a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6 4 20Z"/><path d="m13.5 7.5 3 3"/>',
    trash: '<path d="M4 7h16"/><path d="M9.5 7V5h5v2"/><path d="M6.5 7l.8 12.2A1.8 1.8 0 0 0 9.1 21h5.8a1.8 1.8 0 0 0 1.8-1.8L17.5 7"/><path d="M10 11v6M14 11v6"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.4"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.4"/><path d="m4.5 7 7.5 6 7.5-6"/>',
    phone: '<path d="M7 3.5h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5l1.5-2 4 1.5v3A2.5 2.5 0 0 1 18 19.5C10.5 19 5 13.5 4.5 6A2.5 2.5 0 0 1 7 3.5Z"/>',
    shield: '<path d="M12 3 5 6v5.5c0 4.4 3 7.6 7 9.5 4-1.9 7-5.1 7-9.5V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
    camera: '<path d="M4 8.5h3l1.5-2h7L17 8.5h3v10H4Z"/><circle cx="12" cy="13" r="3.2"/>',
    upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 16v3h14v-3"/>',
    refresh: '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.5 8.5A7.5 7.5 0 0 1 19.5 12M4.5 12a7.5 7.5 0 0 0 13 3.5"/>',
    filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
    swap: '<path d="M7 4v14"/><path d="m4 7 3-3 3 3"/><path d="M17 20V6"/><path d="m14 17 3 3 3-3"/>',
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.4"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
    send: '<path d="m21 3-9.5 18-2-7.5L2 11.5 21 3Z"/><path d="m9.5 13.5 4-4"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2.5h-15L6 16Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    logout: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M9 8l-4 4 4 4"/><path d="M5 12h10"/>',
    alert: '<path d="M12 4 2.8 20h18.4L12 4Z"/><path d="M12 10v4.5"/><path d="M12 17.5h.01"/>',
    compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
    sparkles: '<path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
    map: '<path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    flag: '<path d="M5 21V4"/><path d="M5 5h10l-1.5 4L15 13H5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z"/>',
    wifiOff: '<path d="M3 3l18 18"/><path d="M8.5 15.5a5 5 0 0 1 7 0"/><path d="M5 12a10 10 0 0 1 4-2.4"/><path d="M15 9.6a10 10 0 0 1 4 2.4"/><path d="M2 8.8A15 15 0 0 1 6 6.2"/><path d="M18 6.2a15 15 0 0 1 4 2.6"/><path d="M12 19h.01"/>',
    external: '<path d="M14 4h6v6"/><path d="m20 4-9 9"/><path d="M18 14v5H5V6h5"/>',
    eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 6.1A10.8 10.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.6 17.6 0 0 1-3.1 3.9"/><path d="M6.3 7.6A17.9 17.9 0 0 0 2.5 12s3.5 6.5 9.5 6.5a10.9 10.9 0 0 0 4.2-.8"/><path d="M9.9 9.9a2.9 2.9 0 0 0 4.2 4.2"/>',
  };

  function icon(name, className = "") {
    const path = ICON_PATHS[name] || ICON_PATHS.info;
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  }

  /* -------------------------------------------------------------- utilities */
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function debounce(fn, wait = 250) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  const IST_OFFSET_MIN = 330; // Asia/Kolkata, UTC+5:30

  function istNow() {
    const now = new Date();
    return new Date(now.getTime() + (IST_OFFSET_MIN + now.getTimezoneOffset()) * 60000);
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function formatTimeAmPm(value) {
    if (value === null || value === undefined || value === "") return "";
    if (value instanceof Date) {
      return value
        .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
        .replace(/\s/g, " ")
        .toUpperCase();
    }

    const raw = String(value).trim();
    if (!raw) return "";

    if (raw.includes("T") || /^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const date = new Date(raw);
      if (!Number.isNaN(date.getTime())) {
        return date
          .toLocaleTimeString("en-IN", {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Kolkata",
          })
          .toUpperCase();
      }
    }

    const ampm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])\.?m\.?$/i);
    if (ampm) {
      let hours = parseInt(ampm[1], 10) % 12;
      if (!hours) hours = 12;
      return `${hours}:${ampm[2]} ${ampm[3].toUpperCase()}M`;
    }

    const hhmm = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hhmm) {
      let hours = parseInt(hhmm[1], 10);
      const period = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      return `${hours}:${hhmm[2]} ${period}`;
    }

    return raw;
  }

  function splitClock(display) {
    const text = String(display || "").trim();
    const match = text.match(/^(\d{1,2}:\d{2})\s*([AP]M)?$/i);
    if (!match) return { value: text, valueSuffix: "" };
    return { value: match[1], valueSuffix: match[2] ? match[2].toUpperCase() : "" };
  }

  function parseTimeToMinutes(value) {
    if (!value) return null;
    const text = String(value).toLowerCase();
    const match = text.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (/pm/.test(text) && hours < 12) hours += 12;
    if (/am/.test(text) && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function formatCountdown(minutes) {
    if (minutes === null || minutes === undefined || Number.isNaN(minutes)) {
      return { text: "Scheduled", cls: "" };
    }
    const mins = Math.round(minutes);
    if (mins <= 0) return { text: "Departing now", cls: "is-live" };
    if (mins === 1) return { text: "in 1 min", cls: "is-soon" };
    if (mins <= 5) return { text: `in ${mins} min`, cls: "is-soon" };
    if (mins < 60) return { text: `in ${mins} min`, cls: "is-live" };
    if (mins < 1440) {
      const hours = Math.floor(mins / 60);
      const rest = mins % 60;
      return { text: rest ? `in ${hours}h ${rest}m` : `in ${hours}h`, cls: "" };
    }
    return { text: "Tomorrow", cls: "" };
  }

  function formatDate(value, opts = {}) {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
      year: opts.year === false ? undefined : "numeric",
    });
  }

  function timeAgo(value) {
    if (!value) return "";
    const then = new Date(value).getTime();
    if (Number.isNaN(then)) return "";
    const diff = Math.max(0, Date.now() - then);
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(value, { year: false });
  }

  function initials(name, length = 2) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, length).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function safeNext(raw, fallback = "/") {
    if (!raw || typeof raw !== "string") return fallback;
    const value = raw.trim();
    if (!value.startsWith("/") || value.startsWith("//")) return fallback;
    if (/[\u0000-\u001f\\]/.test(value)) return fallback;
    if (/^\/\s*(javascript|data|vbscript):/i.test(value)) return fallback;
    return value.slice(0, 512) || fallback;
  }

  /* ---------------------------------------------------------------- toasts */
  function toastStack() {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      stack.setAttribute("role", "status");
      stack.setAttribute("aria-live", "polite");
      document.body.appendChild(stack);
    }
    return stack;
  }

  function toast(message, options = {}) {
    const type = options.type || "success";
    const duration = options.duration ?? 3600;
    const stack = toastStack();
    const node = document.createElement("div");
    node.className = `toast${type === "error" ? " toast--error" : ""}`;
    const glyph = type === "error" ? "alert" : type === "info" ? "info" : "check";
    node.innerHTML = `${icon(glyph)}<span>${escapeHtml(message)}</span>`;
    stack.appendChild(node);
    while (stack.children.length > 3) stack.removeChild(stack.firstChild);
    setTimeout(() => {
      node.classList.add("is-leaving");
      setTimeout(() => node.remove(), 260);
    }, duration);
  }

  /* ------------------------------------------------------------ ride cards */
  let rideUid = 0;

  function busSpots(bus) {
    const list = (bus && (bus.spots || bus.stop_timings)) || [];
    return Array.isArray(list) ? list : [];
  }

  function entryFromBus(bus, overrides = {}) {
    const spots = busSpots(bus);
    const timings = (bus && (bus.timings || bus.timings_ampm)) || [];
    return {
      bus,
      boarding_stop: { stop_name: (bus && bus.start_stop) || (spots[0] && spots[0].stop) || "Origin" },
      destination_stop: {
        stop_name: (bus && bus.destination_stop) || (spots[spots.length - 1] && spots[spots.length - 1].stop) || "Destination",
      },
      timing_display: bus && bus.timings ? bus.timings[0] : "",
      reaching_time: bus && bus.reaching_time,
      spots,
      fare: bus && bus.bus_fare,
      minutes_until_boarding: null,
      timing_state: "later",
      is_next_bus: false,
      ...overrides,
    };
  }

  function renderRideCard(entry, options = {}) {
    const bus = entry.bus || {};
    const spots = Array.isArray(entry.spots) && entry.spots.length ? entry.spots : busSpots(bus);
    const startName =
      (entry.boarding_stop && entry.boarding_stop.stop_name) ||
      bus.start_stop ||
      (spots[0] && spots[0].stop) ||
      "Origin";
    const destName =
      (entry.destination_stop && entry.destination_stop.stop_name) ||
      bus.destination_stop ||
      (spots[spots.length - 1] && spots[spots.length - 1].stop) ||
      "Destination";

    const timingDisplay =
      entry.timing_display ||
      formatTimeAmPm(entry.boarding_time) ||
      formatTimeAmPm((bus.timings && bus.timings[0]) || "") ||
      "—";
    const clock = splitClock(timingDisplay);
    const countdown = formatCountdown(entry.minutes_until_boarding);

    const fareValue = entry.fare !== null && entry.fare !== undefined ? entry.fare : bus.bus_fare;
    const fare = fareValue !== null && fareValue !== undefined ? `₹${Number(fareValue).toFixed(Number(fareValue) % 1 ? 1 : 0)}` : "";
    const typeLabel = bus.bus_type || entry.bus_type || "";
    const viaCount = Math.max(spots.length - 2, 0);
    const delay = Math.min((options.index || 0) * 60, 480);

    const badge = bus.bus_number
      ? `<span>${escapeHtml(bus.bus_number)}</span>`
      : `${icon("bus")}`;

    const laterTimings = Array.from(
      new Set(
        ((bus.timings && bus.timings.length ? bus.timings : bus.timings_ampm) || [])
          .map(formatTimeAmPm)
          .filter((t) => t && t !== timingDisplay)
      )
    ).slice(0, 3);

    let timeline = "";
    if (spots.length) {
      const pills = spots.map((spot, idx) => {
        const isStart = idx === 0;
        const isEnd = idx === spots.length - 1;
        const name = escapeHtml(spot.stop || spot.stop_name || "");
        const time = spot.time ? escapeHtml(formatTimeAmPm(spot.time)) : "";
        const sep = isEnd ? "" : `<span class="stop-sep">${icon("chevronRight")}</span>`;
        return `<span class="stop-pill${isStart ? " start" : isEnd ? " end" : ""}">
            <span class="stop-pill__name"><span class="stop-pill__dot"></span>${name}</span>
            ${time ? `<span class="stop-pill__time">${time}</span>` : ""}
          </span>${sep}`;
      });
      timeline = `<div class="timeline-scroll">${pills.join("")}</div>`;
    }

    const chips = laterTimings.length
      ? `<div class="ride-timing-chips">${laterTimings
          .map((time) => `<span class="timing-chip">${escapeHtml(time)}</span>`)
          .join("")}</div>`
      : "";

    const reaching = entry.reaching_time || bus.reaching_time;
    const routeHref = options.mapHref === false ? "" : `/?from=${encodeURIComponent(startName)}&to=${encodeURIComponent(destName)}`;
    const safeBusId = Number(bus.id) || 0;
    const uid = `ride-${safeBusId}-${rideUid++}`;
    const actions =
      options.actions === false
        ? ""
        : `<div class="ride-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-open-add-stop" data-bus-id="${safeBusId}">
              ${icon("plus")} Add stop
            </button>
            <a class="btn btn-secondary btn-sm" href="/edit?id=${safeBusId}">
              ${icon("edit")} Edit
            </a>
            ${routeHref ? `<a class="btn btn-ghost btn-sm" href="${routeHref}">${icon("map")} Map</a>` : ""}
            <span class="ride-actions__spacer"></span>
            <span class="freshness"><i class="${escapeHtml((entry.freshness && entry.freshness.level) || "fresh")}"></i>${escapeHtml(
              (entry.freshness && entry.freshness.label) || "Community reported"
            )}</span>
          </div>`;

    const note = entry.notes
      ? `<div class="ride-note">${icon("info")}<span>${escapeHtml(entry.notes)}</span></div>`
      : "";

    return `<article class="ride-card${entry.is_next_bus ? " is-next" : ""}" data-uid="${uid}" style="animation-delay:${delay}ms">
      ${entry.is_next_bus ? `<span class="ride-next-flag">${icon("sparkles")} Next bus</span>` : ""}
      <button type="button" class="ride-card__main" data-ride-toggle aria-expanded="false" aria-controls="${uid}-details">
        <span class="ride-badge">${badge}</span>
        <span class="ride-body">
          <span class="ride-title-row">
            <span class="ride-title">${escapeHtml(bus.bus_name || "Community bus")}</span>
          </span>
          <span class="ride-route">${escapeHtml(startName)} ${icon("arrowRight")} ${escapeHtml(destName)}</span>
          <span class="ride-tags">
            ${fare ? `<span class="ride-tag fare">${escapeHtml(fare)}</span>` : ""}
            ${typeLabel ? `<span class="ride-tag">${escapeHtml(typeLabel)}</span>` : ""}
            ${viaCount ? `<span class="ride-tag">${viaCount} via stop${viaCount === 1 ? "" : "s"}</span>` : ""}
            ${reaching ? `<span class="ride-tag">${icon("flag")} Arr ${escapeHtml(formatTimeAmPm(reaching))}</span>` : ""}
          </span>
        </span>
        <span class="ride-time">
          <span class="ride-time__value">${escapeHtml(clock.value)}${clock.valueSuffix ? `<small>${clock.valueSuffix}</small>` : ""}</span>
          <span class="ride-time__label ${countdown.cls}" data-countdown-mins="${entry.minutes_until_boarding ?? ""}">${countdown.text}</span>
        </span>
      </button>
      <span class="ride-card__chevron">${icon("chevronDown")}</span>
      <div class="ride-details" id="${uid}-details">
        <div class="ride-details__inner">
          <div class="ride-details__pad">
            ${
              timeline
                ? `<div class="ride-section-label"><span>Route stops</span>${spots.length ? `<span>${spots.length} stops</span>` : ""}</div>${timeline}`
                : ""
            }
            ${chips ? `<div class="ride-section-label"><span>Other trips</span></div>${chips}` : ""}
            ${note}
            ${actions}
          </div>
        </div>
      </div>
    </article>`;
  }

  function bindRideCards(scope = document) {
    if (scope.__ridesBound) return;
    scope.__ridesBound = true;
    scope.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-ride-toggle]");
      if (!toggle || !scope.contains(toggle)) return;
      const card = toggle.closest(".ride-card");
      if (!card) return;
      const open = card.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ------------------------------------------------------------ autocomplete */
  function attachAutocomplete(input, options = {}) {
    if (!input || input.dataset.autocompleteBound === "1") return;
    input.dataset.autocompleteBound = "1";

    const wrap = document.createElement("div");
    wrap.className = "autocomplete-wrap";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const list = document.createElement("div");
    list.className = "autocomplete-list";
    list.setAttribute("role", "listbox");
    wrap.appendChild(list);
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-expanded", "false");

    let timer = null;
    let requestId = 0;
    let items = [];
    let activeIndex = -1;

    const close = () => {
      clearTimeout(timer);
      requestId += 1;
      list.classList.remove("active");
      list.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
      items = [];
      activeIndex = -1;
    };

    const highlight = (index) => {
      const nodes = list.querySelectorAll(".autocomplete-item");
      nodes.forEach((node, i) => node.classList.toggle("is-active", i === index));
      activeIndex = index;
      if (nodes[index]) nodes[index].scrollIntoView({ block: "nearest" });
    };

    const choose = (node) => {
      if (!node) return;
      input.value = node.dataset.name || "";
      close();
      if (options.onSelect) options.onSelect(input.value, node);
    };

    const render = (dbStops, mapPlaces) => {
      items = [];
      let html = "";
      if (dbStops.length) {
        html += `<div class="autocomplete-group">Known bus stops</div>`;
        html += dbStops.slice(0, 5).map((stop) => {
          const name = escapeHtml(stop.stop_name || stop.name || "");
          items.push(name);
          return `<div class="autocomplete-item" role="option" data-name="${name}">
            <span class="autocomplete-item__ic">${icon("bus")}</span>
            <span class="autocomplete-item__text">
              <span class="autocomplete-item__name">${name}</span>
              <span class="autocomplete-item__sub">Community route stop</span>
            </span>
          </div>`;
        }).join("");
      }
      if (mapPlaces.length) {
        html += `<div class="autocomplete-group">Map places</div>`;
        html += mapPlaces.map((place) => {
          const parts = String(place.display_name || "").split(", ");
          const name = escapeHtml(parts[0] || "");
          const sub = escapeHtml(parts.slice(1, 3).join(", "));
          items.push(parts[0] || "");
          return `<div class="autocomplete-item" role="option" data-name="${name}">
            <span class="autocomplete-item__ic place">${icon("mapPin")}</span>
            <span class="autocomplete-item__text">
              <span class="autocomplete-item__name">${name}</span>
              ${sub ? `<span class="autocomplete-item__sub">${sub}</span>` : ""}
            </span>
          </div>`;
        }).join("");
      }
      if (!html) {
        close();
        return;
      }
      list.innerHTML = html;
      list.classList.add("active");
      input.setAttribute("aria-expanded", "true");
    };

    const search = async (query) => {
      const localId = ++requestId;
      const [dbResult, mapResult] = await Promise.allSettled([
        TNOne.get("/api/stops/search", { q: query }).catch(() => null),
        options.includeMapPlaces === false
          ? Promise.resolve([])
          : fetch(
              `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                query + ", Tamil Nadu, India"
              )}&limit=4`,
              { headers: { "Accept-Language": "en" } }
            )
              .then((res) => (res.ok ? res.json() : []))
              .catch(() => []),
      ]);
      if (localId !== requestId) return;
      const dbStops = dbResult.status === "fulfilled" && dbResult.value && dbResult.value.data ? dbResult.value.data : [];
      const mapPlaces = mapResult.status === "fulfilled" && Array.isArray(mapResult.value) ? mapResult.value : [];
      render(dbStops, mapPlaces);
    };

    input.addEventListener("input", () => {
      clearTimeout(timer);
      const query = input.value.trim();
      if (query.length < (options.minChars || 2)) {
        close();
        return;
      }
      timer = setTimeout(() => search(query), 260);
    });

    input.addEventListener("keydown", (event) => {
      if (!list.classList.contains("active")) return;
      const nodes = list.querySelectorAll(".autocomplete-item");
      if (!nodes.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        highlight((activeIndex + 1) % nodes.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        highlight((activeIndex - 1 + nodes.length) % nodes.length);
      } else if (event.key === "Enter") {
        if (activeIndex >= 0) {
          event.preventDefault();
          choose(nodes[activeIndex]);
        }
      } else if (event.key === "Escape") {
        close();
      }
    });

    input.addEventListener("focus", () => {
      if (items.length && input.value.trim().length >= (options.minChars || 2)) {
        list.classList.add("active");
      }
    });

    list.addEventListener("click", (event) => {
      const node = event.target.closest(".autocomplete-item");
      if (node) choose(node);
    });

    document.addEventListener("click", (event) => {
      if (!wrap.contains(event.target)) close();
    });
  }

  /* --------------------------------------------------------- add-stop modal */
  function initAddStopModal(options = {}) {
    const modal = document.getElementById("add-stop-modal");
    if (!modal) return null;

    const title = document.getElementById("modal-bus-title");
    const subtitle = document.getElementById("modal-bus-subtitle");
    const closeBtn = document.getElementById("close-add-stop-modal");
    const cancelBtn = document.getElementById("cancel-add-stop-btn");
    const form = document.getElementById("add-stop-form");
    const busIdInput = document.getElementById("add-stop-bus-id");
    const afterSelect = document.getElementById("add-stop-after-select");
    const nameInput = document.getElementById("add-stop-name-input");
    const timeInput = document.getElementById("add-stop-time-input");
    const ampmPill = document.getElementById("add-stop-time-ampm");
    const alertBox = document.getElementById("add-stop-alert");
    const submitBtn = document.getElementById("submit-add-stop-btn");

    if (!form || !busIdInput) return null;

    attachAutocomplete(nameInput);

    const syncTime = () => {
      if (ampmPill) ampmPill.textContent = timeInput.value ? formatTimeAmPm(timeInput.value) : "--:-- --";
    };
    timeInput.addEventListener("input", syncTime);
    timeInput.addEventListener("change", syncTime);

    const showAlert = (message, type = "error") => {
      alertBox.className = `alert alert-${type}`;
      alertBox.textContent = message;
      alertBox.style.display = "block";
    };
    const hideAlert = () => {
      alertBox.style.display = "none";
    };

    const close = () => {
      modal.classList.remove("is-open");
      modal.hidden = true;
      document.body.classList.remove("modal-open");
    };

    const open = (bus) => {
      if (!bus) return;
      busIdInput.value = bus.id;
      title.textContent = `Add a stop to ${bus.bus_name || "this bus"}`;
      subtitle.textContent = `Route: ${bus.start_stop || "Start"} → ${bus.destination_stop || "Destination"}`;

      const stops = [];
      const source = busSpots(bus);
      if (source.length) {
        source.forEach((spot) => {
          const name = (spot.stop || spot.stop_name || "").trim();
          if (name && !stops.includes(name)) stops.push(name);
        });
      } else {
        [bus.start_stop, ...(bus.boarded_stops || "").split(","), bus.destination_stop]
          .map((s) => (s || "").trim())
          .filter(Boolean)
          .forEach((s) => {
            if (!stops.includes(s)) stops.push(s);
          });
      }

      afterSelect.innerHTML = "";
      stops.forEach((name, index) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent =
          index === 0 ? `After ${name} (start)` : index === stops.length - 1 ? `After ${name} (near destination)` : `After ${name}`;
        afterSelect.appendChild(option);
      });

      nameInput.value = "";
      timeInput.value = "";
      syncTime();
      hideAlert();
      submitBtn.disabled = false;
      submitBtn.textContent = "Save stop";
      modal.hidden = false;
      requestAnimationFrame(() => modal.classList.add("is-open"));
      document.body.classList.add("modal-open");
      setTimeout(() => nameInput.focus(), 80);
    };

    closeBtn.addEventListener("click", close);
    cancelBtn.addEventListener("click", close);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) close();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideAlert();
      const busId = busIdInput.value;
      const afterStop = afterSelect.value;
      const stopName = nameInput.value.trim();
      const timeValue = timeInput.value.trim();

      if (!stopName) {
        showAlert("Please enter a stop name.");
        nameInput.focus();
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";

      try {
        const payload = { stop_name: stopName, after_stop: afterStop };
        if (timeValue) payload.time = formatTimeAmPm(timeValue);
        const response = await TNOne.post(`/api/buses/${busId}/stops`, payload);
        close();
        toast(`“${stopName}” added to the route.`);
        if (options.onSaved) options.onSaved({ busId: Number(busId), stopName, response });
      } catch (error) {
        showAlert(error.message || "Could not add the stop. Please try again.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Save stop";
      }
    });

    return { open, close };
  }

  /* --------------------------------------------------------------- sheet */
  function initSheet(sheet, options = {}) {
    if (!sheet) return { setState() {}, toggle() {}, state: "peek" };
    const grab = sheet.querySelector(".sheet__grab");
    const header = sheet.querySelector(".sheet__header");
    const toggle = sheet.querySelector(".sheet__toggle");
    let state = "peek";
    let startY = 0;
    let dragging = false;

    const setState = (next) => {
      state = next;
      sheet.classList.toggle("is-half", next === "half");
      sheet.classList.toggle("is-full", next === "full");
      sheet.classList.remove("is-dragging");
      document.body.classList.toggle("sheet-expanded", next !== "peek");
      if (options.onStateChange) options.onStateChange(next);
    };

    const toggleState = () => setState(state === "full" ? "half" : "full");

    const onDown = (event) => {
      if (!event.isPrimary) return;
      dragging = true;
      startY = event.clientY;
      sheet.classList.add("is-dragging");
      grab.setPointerCapture && grab.setPointerCapture(event.pointerId);
    };

    const onMove = (event) => {
      if (!dragging) return;
      const delta = event.clientY - startY;
      if (delta < -55) {
        dragging = false;
        sheet.classList.remove("is-dragging");
        setState("full");
      } else if (delta > 55) {
        dragging = false;
        sheet.classList.remove("is-dragging");
        setState(state === "full" ? "half" : "peek");
      }
    };

    const onUp = () => {
      dragging = false;
      sheet.classList.remove("is-dragging");
    };

    if (grab) {
      grab.addEventListener("pointerdown", onDown);
      grab.addEventListener("pointermove", onMove);
      grab.addEventListener("pointerup", onUp);
      grab.addEventListener("pointercancel", onUp);
    }

    if (header) {
      header.addEventListener("click", (event) => {
        if (event.target.closest(".sheet__toggle")) return;
        toggleState();
      });
    }
    if (toggle) {
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleState();
      });
    }

    setState("peek");

    return {
      setState,
      toggle: toggleState,
      get state() {
        return state;
      },
    };
  }

  /* ------------------------------------------------------------- countdowns */
  let ticker = null;
  function startTicker() {
    if (ticker) return;
    ticker = setInterval(() => {
      document.querySelectorAll("[data-countdown-mins]").forEach((node) => {
        const raw = node.dataset.countdownMins;
        if (raw === "" || raw === undefined) return;
        const base = Number(raw);
        if (!Number.isFinite(base)) return;
        if (!node.dataset.countdownAt) {
          node.dataset.countdownAt = String(Date.now() + base * 60000);
        }
        const remaining = (Number(node.dataset.countdownAt) - Date.now()) / 60000;
        const label = formatCountdown(remaining);
        node.textContent = label.text;
        node.classList.remove("is-live", "is-soon");
        if (label.cls) node.classList.add(label.cls);
      });
    }, 20000);
  }

  /* ---------------------------------------------------------------- helpers */
  function setButtonLoading(button, loading, label) {
    if (!button) return;
    if (loading) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `${label || "Please wait..."}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
    }
  }

  function skeletonCards(count = 3) {
    return Array.from({ length: count })
      .map(
        () => `<div class="skeleton-card">
          <div class="skeleton skeleton-card__badge"></div>
          <div class="skeleton-card__body">
            <div class="skeleton skeleton-line w-60"></div>
            <div class="skeleton skeleton-line w-80"></div>
            <div class="skeleton skeleton-line w-40"></div>
          </div>
        </div>`
      )
      .join("");
  }

  function stateBox({ iconName = "bus", title = "", description = "", action = "" }) {
    return `<div class="state-box">
      <div class="state-icon">${icon(iconName)}</div>
      <p class="state-title">${escapeHtml(title)}</p>
      <p class="state-desc">${escapeHtml(description)}</p>
      ${action || ""}
    </div>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    startTicker();
    document.querySelectorAll(".ride-list").forEach((list) => bindRideCards(list));
  });

  return {
    icon,
    escapeHtml,
    debounce,
    formatTimeAmPm,
    parseTimeToMinutes,
    formatCountdown,
    formatDate,
    timeAgo,
    initials,
    safeNext,
    splitClock,
    toast,
    renderRideCard,
    bindRideCards,
    entryFromBus,
    attachAutocomplete,
    initAddStopModal,
    initSheet,
    startTicker,
    setButtonLoading,
    skeletonCards,
    stateBox,
    istNow,
  };
})();

window.TNUI = TNUI;
window.formatTimeAmPm = TNUI.formatTimeAmPm;
window.escapeHtml = TNUI.escapeHtml;
