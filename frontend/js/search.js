/**
 * Search page: query params, stop autocomplete, sortable ride cards,
 * spell-correction banner, and the shared add-stop flow.
 */
(() => {
  "use strict";

  const RECENT_KEY = "tn_one_recent_routes";
  const SESSION_FROM = "tn_one_from";
  const SESSION_TO = "tn_one_to";
  const MAX_RECENTS = 4;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    query: null,
    entries: [],
    other: [],
    data: null,
    sort: "soonest",
    busMap: new Map(),
    abort: null,
    addStop: null,
    elements: {},
  };

  function readRecents() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(parsed)
        ? parsed.filter((item) => item && typeof item.from === "string" && typeof item.to === "string").slice(0, MAX_RECENTS)
        : [];
    } catch (_) {
      return [];
    }
  }

  function saveRecent(from, to) {
    if (!to || !from) return;
    const list = readRecents().filter(
      (item) => !(item.from.toLowerCase() === from.toLowerCase() && item.to.toLowerCase() === to.toLowerCase())
    );
    list.unshift({ from, to, at: Date.now() });
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
    } catch (_) {
      /* storage disabled */
    }
  }

  const SUGGESTED_ROUTES = [
    { from: "Chennai", to: "Coimbatore" },
    { from: "Madurai", to: "Rameswaram" },
    { from: "Coimbatore", to: "Ooty" },
    { from: "Tiruchirappalli", to: "Thanjavur" },
  ];

  function renderQuickChips() {
    const { quickRow } = state.elements;
    if (!quickRow) return;
    const recents = readRecents();
    const items = recents.length ? recents : SUGGESTED_ROUTES;
    quickRow.innerHTML = items
      .slice(0, 3)
      .map(
        (route) => `<button type="button" class="recent-chip" data-route-from="${TNUI.escapeHtml(route.from)}" data-route-to="${TNUI.escapeHtml(route.to)}">
          ${TNUI.icon("route")}
          <span>${TNUI.escapeHtml(route.from)} → ${TNUI.escapeHtml(route.to)}</span>
        </button>`
      )
      .join("");
  }

  function updateClearButton() {
    const { originInput, clearOrigin } = state.elements;
    if (clearOrigin && originInput) clearOrigin.hidden = !originInput.value.trim();
  }

  function updateUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    if (state.query) {
      if (state.query.from) url.searchParams.set("from", state.query.from);
      if (state.query.to) url.searchParams.set("to", state.query.to);
    }
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function updateHeading() {
    const { resultsTitle, resultsSub, addRouteBtn } = state.elements;
    const query = state.query;

    if (query) {
      if (query.from && query.to) resultsTitle.textContent = `${query.from} → ${query.to}`;
      else if (query.from) resultsTitle.textContent = `Buses from ${query.from}`;
      else resultsTitle.textContent = `Buses to ${query.to}`;
    } else {
      resultsTitle.textContent = "All community buses";
    }

    const count = state.entries.length;
    if (resultsSub) {
      const parts = [`${count} bus${count === 1 ? "" : "es"}`];
      if (state.other.length) parts.push(`${state.other.length} nearby`);
      resultsSub.textContent = parts.join(" · ");
    }

    if (addRouteBtn) {
      const params = new URLSearchParams();
      if (query && query.from) params.set("from", query.from);
      if (query && query.to) params.set("to", query.to);
      addRouteBtn.href = `/report${params.toString() ? "?" + params.toString() : ""}`;
    }
  }

  function correctionMarkup() {
    const data = state.data || {};
    const query = state.query;
    if (!query) return "";
    const resolvedFrom =
      data.resolved_from || (data.matched_origin_stops && data.matched_origin_stops[0] && data.matched_origin_stops[0].stop_name);
    const resolvedTo =
      data.resolved_to ||
      (data.matched_destination_stops && data.matched_destination_stops[0] && data.matched_destination_stops[0].stop_name);

    const notes = [];
    if (resolvedFrom && query.from && resolvedFrom.toLowerCase() !== query.from.toLowerCase()) {
      notes.push(`${query.from} → ${resolvedFrom}`);
    }
    if (resolvedTo && query.to && resolvedTo.toLowerCase() !== query.to.toLowerCase()) {
      notes.push(`${query.to} → ${resolvedTo}`);
    }
    if (!notes.length && !data.query_corrected) return "";
    return `<div class="correction-banner">
      ${TNUI.icon("info")}
      <span>${notes.length ? `Showing results for ${TNUI.escapeHtml(notes.join(" and "))}.` : "Matched the closest known stop names."}</span>
    </div>`;
  }

  function sortEntries(list) {
    const sorted = list.slice();
    if (state.sort === "fare") {
      const fareOf = (entry) => {
        const value = entry.fare !== null && entry.fare !== undefined ? entry.fare : entry.bus && entry.bus.bus_fare;
        const num = Number(value);
        return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY;
      };
      sorted.sort((a, b) => fareOf(a) - fareOf(b));
    } else if (state.sort === "name") {
      sorted.sort((a, b) =>
        String((a.bus && a.bus.bus_name) || "").localeCompare(String((b.bus && b.bus.bus_name) || ""))
      );
    } else {
      const minutesOf = (entry) => {
        const value = Number(entry.minutes_until_boarding);
        return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
      };
      sorted.sort((a, b) => minutesOf(a) - minutesOf(b));
    }
    return sorted;
  }

  function emptyState({ title, description, href, actionLabel }) {
    return TNUI.stateBox({
      iconName: "bus",
      title,
      description,
      action: `<div class="empty-actions">
        <a class="btn btn-primary btn-sm" href="${href}">${TNUI.icon("plus")} ${TNUI.escapeHtml(actionLabel)}</a>
        <button type="button" class="btn btn-secondary btn-sm" id="reset-search">${TNUI.icon("search")} Start over</button>
      </div>`,
    });
  }

  function renderResults() {
    const { resultsList } = state.elements;
    if (!resultsList) return;
    const banner = correctionMarkup();
    const entries = sortEntries(state.entries);

    if (entries.length) {
      resultsList.innerHTML =
        banner + `<div class="ride-list">${entries.map((entry, index) => TNUI.renderRideCard(entry, { index })).join("")}</div>`;
    } else if (state.other.length) {
      const others = sortEntries(state.other);
      resultsList.innerHTML =
        banner +
        TNUI.stateBox({
          iconName: "route",
          title: "No direct bus found",
          description: "These community buses touch one of your stops. They may still help with part of the journey.",
          action: "",
        }) +
        `<div class="ride-list">${others.map((entry, index) => TNUI.renderRideCard(entry, { index })).join("")}</div>`;
    } else if (state.query) {
      const params = new URLSearchParams();
      if (state.query.from) params.set("from", state.query.from);
      if (state.query.to) params.set("to", state.query.to);
      resultsList.innerHTML =
        banner +
        emptyState({
          title: "No buses found for this route",
          description: "Nobody has reported a bus here yet. Add it and help the next traveller.",
          href: `/report${params.toString() ? "?" + params.toString() : ""}`,
          actionLabel: "Add this route",
        });
    } else {
      resultsList.innerHTML = emptyState({
        title: "No buses registered yet",
        description: "Be the first to add a community bus and help travellers across Tamil Nadu.",
        href: "/report",
        actionLabel: "Add a bus",
      });
    }

    TNUI.bindRideCards(resultsList);
    updateHeading();
  }

  async function performSearch(from, to) {
    const { originInput, destinationInput, resultsList, resultsSub, searchBtn } = state.elements;
    const cleanFrom = String(from || "").trim();
    const cleanTo = String(to || "").trim();
    const hasQuery = Boolean(cleanFrom || cleanTo);

    state.query = hasQuery ? { from: cleanFrom, to: cleanTo } : null;
    state.data = null;
    state.entries = [];
    state.other = [];
    state.busMap.clear();
    updateUrl();

    if (hasQuery) {
      if (cleanFrom) {
        try { sessionStorage.setItem(SESSION_FROM, cleanFrom); } catch (_) {}
      }
      if (cleanTo) {
        try { sessionStorage.setItem(SESSION_TO, cleanTo); } catch (_) {}
      }
      saveRecent(cleanFrom, cleanTo);
      renderQuickChips();
    }

    if (resultsList) {
      resultsList.innerHTML = TNUI.skeletonCards(3);
      resultsList.setAttribute("aria-busy", "true");
    }
    if (resultsSub) resultsSub.textContent = "Searching community timings…";
    const { resultsTitle } = state.elements;
    if (resultsTitle) {
      if (cleanFrom && cleanTo) resultsTitle.textContent = `${cleanFrom} → ${cleanTo}`;
      else if (cleanFrom) resultsTitle.textContent = `Buses from ${cleanFrom}`;
      else if (cleanTo) resultsTitle.textContent = `Buses to ${cleanTo}`;
      else resultsTitle.textContent = "All community buses";
    }

    if (searchBtn) searchBtn.disabled = true;
    if (state.abort) state.abort.abort();
    state.abort = new AbortController();
    const controller = state.abort;

    const params = {};
    if (cleanFrom) params.from = cleanFrom;
    if (cleanTo) params.to = cleanTo;

    try {
      const payload = await TNOne.request("/api/search", {
        method: "GET",
        params,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      state.data = (payload && payload.data) || {};
      state.entries = Array.isArray(state.data.results) ? state.data.results.slice() : [];
      state.other = Array.isArray(state.data.other_buses) ? state.data.other_buses.slice() : [];
      state.busMap.clear();
      [...state.entries, ...state.other].forEach((entry) => {
        if (entry && entry.bus && entry.bus.id) state.busMap.set(Number(entry.bus.id), entry.bus);
      });

      // Adopt canonical stop names when the backend fuzzy-matched a typo.
      if (state.data.resolved_from && originInput && originInput.value.trim() !== state.data.resolved_from) {
        originInput.value = state.data.resolved_from;
      }
      if (state.data.resolved_to && destinationInput && destinationInput.value.trim() !== state.data.resolved_to) {
        destinationInput.value = state.data.resolved_to;
      }
      updateClearButton();

      renderResults();
      if (resultsList) resultsList.setAttribute("aria-busy", "false");
    } catch (error) {
      if (error && (error.name === "AbortError" || controller.signal.aborted)) return;
      if (resultsList) {
        resultsList.setAttribute("aria-busy", "false");
        resultsList.innerHTML = TNUI.stateBox({
          iconName: "wifiOff",
          title: "Could not load buses",
          description: error.message || "Check your connection and try again.",
          action: '<button type="button" class="btn btn-secondary btn-sm" id="retry-search">Try again</button>',
        });
      }
      if (resultsSub) resultsSub.textContent = "Search failed";
    } finally {
      if (!controller.signal.aborted && searchBtn) searchBtn.disabled = false;
    }
  }

  function currentSearch() {
    if (!state.query) return performSearch("", "");
    return performSearch(state.query.from, state.query.to);
  }

  async function shareSearch() {
    const url = new URL(window.location.href);
    url.search = "";
    if (state.query) {
      if (state.query.from) url.searchParams.set("from", state.query.from);
      if (state.query.to) url.searchParams.set("to", state.query.to);
    }
    const text = state.query
      ? `${state.query.from || "Anywhere"} → ${state.query.to || "Tamil Nadu"} on TN FOR BUS`
      : "Community bus routes on TN FOR BUS";
    try {
      if (navigator.share) {
        await navigator.share({ title: "TN FOR BUS", text, url: url.toString() });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url.toString()}`);
      TNUI.toast("Link copied.");
    } catch (error) {
      if (error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url.toString());
        TNUI.toast("Link copied.");
      } catch (_) {
        TNUI.toast("Could not copy the link.", { type: "error" });
      }
    }
  }

  function bindEvents() {
    const {
      originInput,
      destinationInput,
      clearOrigin,
      swapBtn,
      searchBtn,
      quickRow,
      sortRow,
      refreshBtn,
      shareBtn,
      resultsList,
    } = state.elements;

    originInput.addEventListener("input", updateClearButton);
    originInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (!destinationInput.value.trim()) destinationInput.focus();
      else performSearch(originInput.value, destinationInput.value);
    });
    destinationInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      performSearch(originInput.value, destinationInput.value);
    });

    clearOrigin.addEventListener("click", () => {
      originInput.value = "";
      updateClearButton();
      originInput.focus();
    });

    swapBtn.addEventListener("click", () => {
      const from = originInput.value;
      originInput.value = destinationInput.value;
      destinationInput.value = from;
      updateClearButton();
      performSearch(originInput.value, destinationInput.value);
    });

    searchBtn.addEventListener("click", () => performSearch(originInput.value, destinationInput.value));

    TNUI.attachAutocomplete(originInput, {
      includeMapPlaces: true,
      onSelect: () => {
        updateClearButton();
        if (!destinationInput.value.trim()) destinationInput.focus();
      },
    });
    TNUI.attachAutocomplete(destinationInput, { includeMapPlaces: true });

    quickRow.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-route-from], [data-route-to]");
      if (!chip) return;
      originInput.value = chip.dataset.routeFrom || "";
      destinationInput.value = chip.dataset.routeTo || "";
      updateClearButton();
      performSearch(originInput.value, destinationInput.value);
    });

    sortRow.addEventListener("click", (event) => {
      const button = event.target.closest(".sort-btn");
      if (!button) return;
      state.sort = button.dataset.sort || "soonest";
      $$(".sort-btn", sortRow).forEach((node) => {
        const active = node === button;
        node.classList.toggle("active", active);
        node.setAttribute("aria-selected", active ? "true" : "false");
      });
      renderResults();
    });

    refreshBtn.addEventListener("click", currentSearch);
    shareBtn.addEventListener("click", shareSearch);

    resultsList.addEventListener("click", async (event) => {
      if (event.target.closest("#retry-search")) {
        currentSearch();
        return;
      }
      if (event.target.closest("#reset-search")) {
        originInput.value = "";
        destinationInput.value = "";
        updateClearButton();
        try {
          sessionStorage.removeItem(SESSION_FROM);
          sessionStorage.removeItem(SESSION_TO);
        } catch (_) {}
        performSearch("", "");
        originInput.focus();
        return;
      }

      const addStopBtn = event.target.closest(".btn-open-add-stop");
      if (!addStopBtn) return;
      event.preventDefault();

      const status = await TNAuth.getStatus();
      if (!status || !status.authenticated) {
        window.location.href = TNAuth.loginUrl();
        return;
      }
      const bus = state.busMap.get(Number(addStopBtn.dataset.busId));
      if (!bus) {
        TNUI.toast("Bus details are unavailable. Refresh and try again.", { type: "error" });
        return;
      }
      if (state.addStop) state.addStop.open(bus);
    });
  }

  function init() {
    const elements = {
      originInput: $("#origin-input"),
      destinationInput: $("#destination-input"),
      clearOrigin: $("#clear-origin"),
      swapBtn: $("#swap-locations"),
      searchBtn: $("#search-button"),
      quickRow: $("#quick-row"),
      resultsList: $("#results-list"),
      resultsTitle: $("#results-title"),
      resultsSub: $("#results-sub"),
      sortRow: $("#sort-row"),
      refreshBtn: $("#refresh-search"),
      shareBtn: $("#share-search"),
      addRouteBtn: $("#add-route-btn"),
    };
    state.elements = elements;

    if (!elements.originInput || !elements.resultsList) return;

    TNAuth.renderAll("[data-auth-slot]");
    state.addStop = TNUI.initAddStopModal({ onSaved: currentSearch });

    bindEvents();
    renderQuickChips();
    updateClearButton();

    let sessionFrom = "";
    let sessionTo = "";
    try {
      sessionFrom = sessionStorage.getItem(SESSION_FROM) || "";
      sessionTo = sessionStorage.getItem(SESSION_TO) || "";
    } catch (_) {}

    const params = new URLSearchParams(window.location.search);
    const initialFrom = params.get("from") || params.get("origin") || sessionFrom;
    const initialTo = params.get("to") || params.get("destination") || sessionTo;

    if (initialFrom) elements.originInput.value = initialFrom;
    if (initialTo) elements.destinationInput.value = initialTo;
    updateClearButton();

    performSearch(initialFrom, initialTo);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
