/**
 * TN FOR BUS — map home experience.
 * Desktop: floating search panel over a full-screen map.
 * Mobile: floating search + draggable results sheet.
 * Leaflet map, OpenStreetMap tiles, Nominatim geocoding, OSRM routing.
 */
(() => {
  "use strict";

  const RECENT_KEY = "tn_one_recent_routes";
  const SESSION_FROM = "tn_one_from";
  const SESSION_TO = "tn_one_to";
  const MAX_RECENTS = 4;
  const TN_CENTER = [11.1271, 78.6569];

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    map: null,
    query: null,
    entries: [],
    data: null,
    sort: "soonest",
    busMap: new Map(),
    routeLayers: [],
    routeMarkers: [],
    userMarker: null,
    userLatLng: null,
    distanceLabel: "",
    geocodeCache: new Map(),
    searchAbort: null,
    routeAbort: null,
    sheet: null,
    addStop: null,
    elements: {},
  };

  /* ------------------------------------------------------------------ storage */
  function readRecents() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && typeof item.from === "string" && typeof item.to === "string")
        .map((item) => ({
          from: item.from.slice(0, 80),
          to: item.to.slice(0, 80),
          at: Number(item.at) || Date.now(),
        }))
        .slice(0, MAX_RECENTS);
    } catch (_) {
      return [];
    }
  }

  function saveRecent(from, to) {
    if (!to) return;
    const list = readRecents().filter(
      (item) => !(item.from.toLowerCase() === String(from || "").toLowerCase() && item.to.toLowerCase() === to.toLowerCase())
    );
    list.unshift({ from: from || "", to, at: Date.now() });
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

  function renderRecents() {
    const { quickRow, recentBlock, recentChips } = state.elements;
    const recents = readRecents();
    const items = recents.length ? recents : SUGGESTED_ROUTES;

    if (quickRow) {
      quickRow.innerHTML = items
        .slice(0, 3)
        .map(
          (route) => `<button type="button" class="recent-chip" data-route-from="${TNUI.escapeHtml(route.from)}" data-route-to="${TNUI.escapeHtml(route.to)}">
            ${TNUI.icon("route")}
            <span>${route.from ? `${TNUI.escapeHtml(route.from)} → ` : ""}${TNUI.escapeHtml(route.to)}</span>
          </button>`
        )
        .join("");
    }

    if (recentBlock && recentChips) {
      recentBlock.hidden = recents.length === 0;
      recentChips.innerHTML = recents
        .map(
          (route) => `<button type="button" class="recent-chip" data-route-from="${TNUI.escapeHtml(route.from)}" data-route-to="${TNUI.escapeHtml(route.to)}">
            ${TNUI.icon("clock")}
            <span>${route.from ? `${TNUI.escapeHtml(route.from)} → ` : ""}${TNUI.escapeHtml(route.to)}</span>
          </button>`
        )
        .join("");
    }
  }

  /* ------------------------------------------------------------------- layout */
  function applyLayout() {
    const { searchCard, resultsPanel, panelSearchSlot, panelResultsSlot, mobileSearchSlot, sheetResultsSlot } =
      state.elements;
    if (!searchCard || !resultsPanel) return;
    const desktop = window.matchMedia("(min-width: 900px)").matches;
    if (desktop) {
      panelSearchSlot.appendChild(searchCard);
      panelResultsSlot.appendChild(resultsPanel);
    } else {
      mobileSearchSlot.appendChild(searchCard);
      sheetResultsSlot.appendChild(resultsPanel);
    }
    if (state.map) setTimeout(() => state.map.invalidateSize(), 180);
  }

  /* ---------------------------------------------------------------------- map */
  function initMap() {
    if (!window.L) {
      TNUI.toast("Map library could not load. Search still works.", { type: "error" });
      return null;
    }
    const map = L.map("map", {
      zoomControl: false,
      minZoom: 5,
      maxZoom: 19,
      zoomSnap: 0.5,
      worldCopyJump: false,
    }).setView(TN_CENTER, 7);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomleft" }).addTo(map);
    return map;
  }

  function clearRoute() {
    if (state.routeAbort) {
      state.routeAbort.abort();
      state.routeAbort = null;
    }
    if (!state.map) return;
    state.routeLayers.forEach((layer) => {
      try { state.map.removeLayer(layer); } catch (_) {}
    });
    state.routeMarkers.forEach((marker) => {
      try { state.map.removeLayer(marker); } catch (_) {}
    });
    state.routeLayers = [];
    state.routeMarkers = [];
    state.distanceLabel = "";
  }

  function routePointIcon(kind) {
    return L.divIcon({
      className: `map-pin ${kind}`,
      html: `<div class="map-pin__inner"><span>${kind === "start" ? "A" : "B"}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -28],
    });
  }

  function addRoutePin(coords, kind, label) {
    if (!state.map) return;
    const marker = L.marker(coords, {
      icon: routePointIcon(kind),
      zIndexOffset: 900,
    })
      .addTo(state.map)
      .bindPopup(`<strong>${kind === "start" ? "From" : "To"}:</strong> ${TNUI.escapeHtml(label || "")}`);
    state.routeMarkers.push(marker);
  }

  function fitRoute(bounds) {
    if (!state.map) return;
    const desktop = window.matchMedia("(min-width: 900px)").matches;
    state.map.fitBounds(bounds, {
      paddingTopLeft: desktop ? [470, 110] : [34, 150],
      paddingBottomRight: desktop ? [60, 70] : [34, Math.min(window.innerHeight * 0.46, 360)],
      maxZoom: 13,
      animate: true,
      duration: 0.8,
    });
  }

  function drawFallbackRoute(start, end) {
    if (!state.map) return;
    const line = L.polyline([start, end], {
      color: "#0b6e4f",
      weight: 5,
      opacity: 0.85,
      dashArray: "9, 7",
      lineCap: "round",
    }).addTo(state.map);
    state.routeLayers.push(line);
    const km = state.map.distance(start, end) / 1000;
    state.distanceLabel = `${km.toFixed(km >= 100 ? 0 : 1)} km`;
    fitRoute(line.getBounds());
    updateResultsSub();
  }

  async function drawRoute(from, to) {
    if (!state.map) return;
    clearRoute();
    if (!to) return;

    state.routeAbort = new AbortController();
    const signal = state.routeAbort.signal;

    const [startCoords, endCoords] = await Promise.all([geocodePlace(from), geocodePlace(to)]);
    if (signal.aborted) return;

    if (!startCoords && !endCoords) return;

    if (startCoords) addRoutePin(startCoords, "start", from);
    if (endCoords) addRoutePin(endCoords, "end", to);

    if (!startCoords || !endCoords) {
      const known = startCoords || endCoords;
      state.map.setView(known, 13, { animate: true });
      return;
    }

    const start = L.latLng(startCoords[0], startCoords[1]);
    const end = L.latLng(endCoords[0], endCoords[1]);

    try {
      const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson`;
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error("routing failed");
      const data = await res.json();
      const route = data && data.code === "Ok" && data.routes && data.routes[0];
      if (!route || !route.geometry || !route.geometry.coordinates || route.geometry.coordinates.length < 2) {
        throw new Error("no route");
      }
      const coords = route.geometry.coordinates.map((point) => [point[1], point[0]]);
      const line = L.polyline(coords, {
        color: "#0b6e4f",
        weight: 5,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(state.map);
      state.routeLayers.push(line);
      state.distanceLabel = `${(route.distance / 1000).toFixed(route.distance >= 100000 ? 0 : 1)} km`;
      fitRoute(line.getBounds());
      updateResultsSub();
    } catch (error) {
      if (error && error.name === "AbortError") return;
      drawFallbackRoute(start, end);
    }
  }

  /* --------------------------------------------------------------- geocoding */
  const TN_STRIP_SUFFIXES = [
    "bus stand", "bus stop", "bus terminus", "bus depot",
    "pirivu", "junction", "jn", "signal", "nagar", "colony",
    "cross", "circle", "stand", "stop", "terminus", "depot",
    "town", "bypass",
  ];

  function simplifyPlaceName(name) {
    const variants = [name];
    let simplified = name.toLowerCase().trim();
    for (const suffix of TN_STRIP_SUFFIXES) {
      if (simplified.endsWith(suffix)) {
        simplified = simplified.slice(0, -suffix.length).trim().replace(/[\s,]+$/, "");
        if (simplified.length >= 3) {
          variants.push(simplified.replace(/\b\w/g, (char) => char.toUpperCase()));
        }
        break;
      }
    }
    const firstWord = name.trim().split(/\s+/)[0];
    if (firstWord && firstWord.length >= 4 && firstWord.toLowerCase() !== simplified) {
      variants.push(firstWord);
    }
    return Array.from(new Set(variants));
  }

  async function nominatimSearch(query) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query + ", Tamil Nadu, India"
      )}&limit=1`;
      const res = await fetch(url, { headers: { "Accept-Language": "en" } });
      if (!res.ok) return null;
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
      }
    } catch (_) {
      /* offline or blocked */
    }
    return null;
  }

  async function geocodePlace(name) {
    if (!name || !name.trim()) return null;
    const clean = name.trim();
    if (clean.toLowerCase() === "your location" && state.userLatLng) {
      return [state.userLatLng.lat, state.userLatLng.lng];
    }

    const key = clean.toLowerCase();
    if (state.geocodeCache.has(key)) return state.geocodeCache.get(key);

    let result = await nominatimSearch(clean);
    if (!result) {
      for (const variant of simplifyPlaceName(clean).slice(1)) {
        result = await nominatimSearch(variant);
        if (result) break;
      }
    }

    if (!result) {
      try {
        const dbRes = await TNOne.get("/api/stops/search", { q: clean });
        const stops = dbRes && Array.isArray(dbRes.data) ? dbRes.data : [];
        const canonical = stops[0] && stops[0].stop_name;
        if (canonical && canonical.toLowerCase() !== key) {
          result = await nominatimSearch(canonical);
          if (!result) {
            for (const variant of simplifyPlaceName(canonical).slice(1)) {
              result = await nominatimSearch(variant);
              if (result) break;
            }
          }
        }
      } catch (_) {
        /* lookup is best-effort */
      }
    }

    if (result) state.geocodeCache.set(key, result);
    return result;
  }

  /* ---------------------------------------------------------------- searching */
  function updateUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    if (state.query) {
      url.searchParams.set("from", state.query.from);
      url.searchParams.set("to", state.query.to);
    }
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }

  function setSearchBusy(busy) {
    const { searchBtn } = state.elements;
    if (searchBtn) searchBtn.disabled = busy;
  }

  function updateResultsSub() {
    const { resultsSub, sheetMeta, resultsTitle, sheetTitle, sheetEyebrow, resultsPanel } = state.elements;
    if (!state.query) return;

    const total = state.entries.length;
    const bits = [`${total} bus${total === 1 ? "" : "es"}`];
    if (state.distanceLabel) bits.push(state.distanceLabel);
    if (state.data && state.data.query_corrected) bits.push("nearby stop matched");
    const summary = bits.join(" · ");

    if (resultsSub) resultsSub.textContent = summary;
    if (sheetMeta) {
      sheetMeta.innerHTML = `<span class="sheet__handle-hint">${TNUI.escapeHtml(summary)}</span>`;
    }
    if (resultsTitle) resultsTitle.textContent = `${state.query.from || "Anywhere"} → ${state.query.to}`;
    if (sheetTitle) sheetTitle.textContent = state.query.to || "Bus results";
    if (sheetEyebrow) sheetEyebrow.textContent = state.query.from ? `From ${state.query.from}` : "TN FOR BUS";
    if (resultsPanel) resultsPanel.setAttribute("aria-busy", "false");
  }

  function correctionMarkup() {
    const data = state.data || {};
    const query = state.query;
    if (!query) return "";
    const notes = [];
    const resolvedFrom = data.resolved_from || data.matched_from_stop;
    const resolvedTo = data.resolved_to || data.matched_to_stop;
    if (resolvedFrom && resolvedFrom.toLowerCase() !== query.from.toLowerCase()) {
      notes.push(`“${query.from}” → “${resolvedFrom}”`);
    }
    if (resolvedTo && resolvedTo.toLowerCase() !== query.to.toLowerCase()) {
      notes.push(`“${query.to}” → “${resolvedTo}”`);
    }
    if (!notes.length && !data.query_corrected) return "";
    return `<div class="correction-banner">
      ${TNUI.icon("info")}
      <span>${notes.length ? `Matched nearby stop names: ${TNUI.escapeHtml(notes.join(", "))}.` : "Matched the closest known stop names."}</span>
    </div>`;
  }

  function sortedEntries() {
    const list = state.entries.slice();
    if (state.sort === "fare") {
      const fareOf = (entry) => {
        const value = entry.fare !== null && entry.fare !== undefined ? entry.fare : entry.bus && entry.bus.bus_fare;
        const num = Number(value);
        return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY;
      };
      list.sort((a, b) => fareOf(a) - fareOf(b));
    } else if (state.sort === "name") {
      list.sort((a, b) =>
        String((a.bus && a.bus.bus_name) || "").localeCompare(String((b.bus && b.bus.bus_name) || ""))
      );
    } else {
      const minutesOf = (entry) => {
        const value = Number(entry.minutes_until_boarding);
        return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
      };
      list.sort((a, b) => minutesOf(a) - minutesOf(b));
    }
    return list;
  }

  function renderResults() {
    const { resultsList } = state.elements;
    if (!resultsList) return;
    const entries = sortedEntries();
    const banner = correctionMarkup();

    if (!entries.length) {
      const q = state.query || { from: "", to: "" };
      const reportHref = `/report?from=${encodeURIComponent(q.from)}&to=${encodeURIComponent(q.to)}`;
      resultsList.innerHTML =
        banner +
        TNUI.stateBox({
          iconName: "bus",
          title: "No buses found yet",
          description: "Nobody has reported a bus for this route. Add the first one and help other travellers.",
          action: `<div class="empty-actions">
            <a class="btn btn-primary btn-sm" href="${reportHref}">${TNUI.icon("plus")} Add this bus</a>
            <button type="button" class="btn btn-secondary btn-sm" id="empty-search-again">${TNUI.icon("refresh")} Search again</button>
          </div>`,
        });
    } else {
      resultsList.innerHTML =
        banner +
        `<div class="ride-list" id="home-ride-list">${entries
          .map((entry, index) => TNUI.renderRideCard(entry, { index, mapHref: false }))
          .join("")}</div>`;
    }

    TNUI.bindRideCards(resultsList);
    updateResultsSub();
  }

  function showResults() {
    const { resultsPanel, exploreCard, sheetEmpty } = state.elements;
    if (resultsPanel) resultsPanel.hidden = false;
    if (exploreCard) exploreCard.hidden = true;
    if (sheetEmpty) sheetEmpty.hidden = true;
  }

  function resetResults() {
    const { resultsPanel, exploreCard, sheetEmpty, resultsList, resultsSub, resultsTitle, sheetTitle, sheetEyebrow, sheetMeta } =
      state.elements;

    state.query = null;
    state.entries = [];
    state.data = null;
    state.busMap.clear();
    clearRoute();
    updateUrl();

    if (resultsList) resultsList.innerHTML = "";
    if (resultsPanel) {
      resultsPanel.hidden = true;
      resultsPanel.removeAttribute("aria-busy");
    }
    if (exploreCard) exploreCard.hidden = false;
    if (sheetEmpty) sheetEmpty.hidden = false;
    if (resultsTitle) resultsTitle.textContent = "Bus results";
    if (resultsSub) resultsSub.textContent = "";
    if (sheetTitle) sheetTitle.textContent = "Search a route";
    if (sheetEyebrow) sheetEyebrow.textContent = "TN FOR BUS";
    if (sheetMeta) sheetMeta.innerHTML = '<span class="sheet__handle-hint">Swipe up for buses</span>';
    if (state.sheet) state.sheet.setState("peek");
  }

  async function performSearch({ from, to } = {}) {
    const { originInput, destinationInput, resultsList, searchBtn, reportRouteBtn } = state.elements;
    const cleanFrom = String(from !== undefined ? from : originInput.value || "").trim();
    const cleanTo = String(to !== undefined ? to : destinationInput.value || "").trim();

    if (!cleanTo) {
      if (cleanFrom) {
        window.location.href = `/search?from=${encodeURIComponent(cleanFrom)}`;
        return;
      }
      TNUI.toast("Enter a destination to find buses.", { type: "error" });
      destinationInput.focus();
      return;
    }

    originInput.value = cleanFrom;
    destinationInput.value = cleanTo;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

    state.query = { from: cleanFrom, to: cleanTo };
    state.distanceLabel = "";
    state.data = null;
    state.busMap.clear();
    try {
      sessionStorage.setItem(SESSION_FROM, cleanFrom);
      sessionStorage.setItem(SESSION_TO, cleanTo);
    } catch (_) {
      /* storage disabled */
    }
    saveRecent(cleanFrom, cleanTo);
    renderRecents();
    updateUrl();

    if (reportRouteBtn) {
      reportRouteBtn.href = `/report?from=${encodeURIComponent(cleanFrom)}&to=${encodeURIComponent(cleanTo)}`;
    }

    showResults();
    if (resultsList) {
      resultsList.innerHTML = TNUI.skeletonCards(3);
      resultsList.setAttribute("aria-busy", "true");
    }
    const { resultsTitle, resultsSub, sheetTitle, sheetEyebrow, sheetMeta } = state.elements;
    if (resultsTitle) resultsTitle.textContent = `${cleanFrom || "Anywhere"} → ${cleanTo}`;
    if (resultsSub) resultsSub.textContent = "Searching community timings…";
    if (sheetTitle) sheetTitle.textContent = cleanTo;
    if (sheetEyebrow) sheetEyebrow.textContent = cleanFrom ? `From ${cleanFrom}` : "TN FOR BUS";
    if (sheetMeta) sheetMeta.innerHTML = '<span class="sheet__handle-hint">Searching…</span>';
    if (state.sheet && window.matchMedia("(max-width: 899px)").matches) state.sheet.setState("half");

    setSearchBusy(true);
    if (state.searchAbort) state.searchAbort.abort();
    state.searchAbort = new AbortController();
    const controller = state.searchAbort;

    drawRoute(cleanFrom, cleanTo);

    try {
      const payload = await TNOne.request("/api/search", {
        method: "GET",
        params: {
          from: cleanFrom.toLowerCase() === "your location" ? "" : cleanFrom,
          to: cleanTo,
        },
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      state.data = (payload && payload.data) || {};
      state.entries = Array.isArray(state.data.results) ? state.data.results.slice() : [];
      state.busMap.clear();
      state.entries.forEach((entry) => {
        if (entry && entry.bus && entry.bus.id) state.busMap.set(Number(entry.bus.id), entry.bus);
      });
      renderResults();
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
      if (!controller.signal.aborted) setSearchBusy(false);
    }
  }

  /* --------------------------------------------------------------- location */
  function placeUserMarker(lat, lng) {
    if (!state.map) return;
    if (state.userMarker) state.map.removeLayer(state.userMarker);
    const icon = L.divIcon({
      className: "user-marker-wrap",
      html: '<div class="user-marker"><span class="user-marker__ring"></span><span class="user-marker__dot"></span></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
      popupAnchor: [0, -12],
    });
    state.userMarker = L.marker([lat, lng], { icon, zIndexOffset: 700 })
      .addTo(state.map)
      .bindPopup("Your current location");
  }

  function useMyLocation() {
    const { locateBtn, originInput, destinationInput } = state.elements;
    if (!window.L) {
      TNUI.toast("The map is unavailable right now.", { type: "error" });
      return;
    }
    if (!navigator.geolocation) {
      TNUI.toast("Location is not supported by this browser.", { type: "error" });
      return;
    }
    if (locateBtn) locateBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (locateBtn) locateBtn.disabled = false;
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        state.userLatLng = L.latLng(lat, lng);
        placeUserMarker(lat, lng);
        if (state.map) state.map.flyTo([lat, lng], 13, { duration: 0.9 });
        if (originInput) originInput.value = "Your location";
        updateClearButton();
        if (destinationInput && destinationInput.value.trim()) {
          performSearch({ from: "Your location", to: destinationInput.value.trim() });
        } else {
          TNUI.toast("Location found — now choose where to go.");
        }
      },
      () => {
        if (locateBtn) locateBtn.disabled = false;
        TNUI.toast("Could not get your location. Check browser permissions.", { type: "error" });
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  }

  /* -------------------------------------------------------------------- share */
  async function shareRoute() {
    if (!state.query) return;
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("from", state.query.from);
    url.searchParams.set("to", state.query.to);
    const text = `${state.query.from || "Anywhere"} → ${state.query.to} on TN FOR BUS`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "TN FOR BUS", text, url: url.toString() });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url.toString()}`);
      TNUI.toast("Route link copied.");
    } catch (error) {
      if (error && error.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url.toString());
        TNUI.toast("Route link copied.");
      } catch (_) {
        TNUI.toast("Could not copy the link.", { type: "error" });
      }
    }
  }

  /* ------------------------------------------------------------------ events */
  function updateClearButton() {
    const { originInput, clearOrigin } = state.elements;
    if (clearOrigin && originInput) clearOrigin.hidden = !originInput.value.trim();
  }

  function bindEvents() {
    const {
      originInput,
      destinationInput,
      clearOrigin,
      swapBtn,
      searchBtn,
      resultsList,
      sortRow,
      refreshBtn,
      collapseBtn,
      shareBtn,
      quickRow,
      recentChips,
      clearRecents,
      locateBtn,
      exploreLocationBtn,
    } = state.elements;

    originInput.addEventListener("input", updateClearButton);
    originInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (!destinationInput.value.trim()) destinationInput.focus();
      else performSearch();
    });

    destinationInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      performSearch();
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
      if (destinationInput.value.trim()) performSearch();
    });

    searchBtn.addEventListener("click", () => performSearch());

    TNUI.attachAutocomplete(originInput, {
      includeMapPlaces: true,
      onSelect: () => {
        updateClearButton();
        if (!destinationInput.value.trim()) destinationInput.focus();
      },
    });
    TNUI.attachAutocomplete(destinationInput, { includeMapPlaces: true });

    if (sortRow) {
      sortRow.addEventListener("click", (event) => {
        const button = event.target.closest(".sort-btn");
        if (!button) return;
        state.sort = button.dataset.sort || "soonest";
        $$(".sort-btn", sortRow).forEach((node) => {
          const active = node === button;
          node.classList.toggle("active", active);
          node.setAttribute("aria-selected", active ? "true" : "false");
        });
        if (state.query) renderResults();
      });
    }

    refreshBtn.addEventListener("click", () => {
      if (state.query) performSearch({ from: state.query.from, to: state.query.to });
    });

    collapseBtn.addEventListener("click", resetResults);
    shareBtn.addEventListener("click", shareRoute);

    resultsList.addEventListener("click", async (event) => {
      if (event.target.closest("#retry-search")) {
        if (state.query) performSearch({ from: state.query.from, to: state.query.to });
        return;
      }
      if (event.target.closest("#empty-search-again")) {
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

    const routeChipHandler = (event) => {
      const chip = event.target.closest("[data-route-from], [data-route-to]");
      if (!chip) return;
      originInput.value = chip.dataset.routeFrom || "";
      destinationInput.value = chip.dataset.routeTo || "";
      updateClearButton();
      performSearch();
    };
    quickRow.addEventListener("click", routeChipHandler);
    if (recentChips) recentChips.addEventListener("click", routeChipHandler);
    if (clearRecents) {
      clearRecents.addEventListener("click", () => {
        try { localStorage.removeItem(RECENT_KEY); } catch (_) {}
        renderRecents();
        TNUI.toast("Recent searches cleared.");
      });
    }

    locateBtn.addEventListener("click", useMyLocation);
    if (exploreLocationBtn) exploreLocationBtn.addEventListener("click", useMyLocation);

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (event.target.closest("input, textarea, select")) return;
      if (!state.elements.resultsPanel.hidden) resetResults();
    });

    window.addEventListener("resize", TNUI.debounce(() => state.map && state.map.invalidateSize(), 220));
  }

  function onSheetStateChange(next) {
    const { sheetToggle } = state.elements;
    const expanded = next !== "peek";
    if (sheetToggle) {
      sheetToggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      sheetToggle.setAttribute("aria-label", expanded ? "Collapse results" : "Expand results");
      const label = sheetToggle.querySelector("span");
      if (label) label.textContent = expanded ? "Collapse" : "Expand";
    }
  }

  /* --------------------------------------------------------------------- init */
  function init() {
    const elements = {
      searchCard: $("#search-card"),
      resultsPanel: $("#results-panel"),
      panelSearchSlot: $("#panel-search-slot"),
      panelResultsSlot: $("#panel-results-slot"),
      mobileSearchSlot: $("#mobile-search-slot"),
      sheetResultsSlot: $("#sheet-results-slot"),
      sheetEmpty: $("#sheet-empty"),
      exploreCard: $("#explore-card"),
      resultsList: $("#results-list"),
      resultsTitle: $("#results-title"),
      resultsSub: $("#results-sub"),
      sortRow: $("#sort-row"),
      originInput: $("#origin-input"),
      destinationInput: $("#destination-input"),
      clearOrigin: $("#clear-origin"),
      swapBtn: $("#swap-locations"),
      searchBtn: $("#search-route-btn"),
      locateBtn: $("#locate-btn"),
      quickRow: $("#quick-row"),
      recentBlock: $("#recent-block"),
      recentChips: $("#recent-chips"),
      clearRecents: $("#clear-recents"),
      refreshBtn: $("#refresh-results"),
      collapseBtn: $("#collapse-results"),
      shareBtn: $("#share-route"),
      reportRouteBtn: $("#report-route-btn"),
      sheet: $("#results-sheet"),
      sheetHeader: $("#sheet-header"),
      sheetToggle: $("#sheet-toggle"),
      sheetTitle: $("#sheet-title"),
      sheetEyebrow: $("#sheet-eyebrow"),
      sheetMeta: $("#sheet-meta"),
      exploreLocationBtn: $("[data-use-location]"),
    };
    state.elements = elements;

    if (!elements.searchCard || !elements.resultsPanel) return;

    applyLayout();

    TNAuth.renderAll("[data-auth-slot]");

    state.map = initMap();
    state.sheet = TNUI.initSheet(elements.sheet, { onStateChange: onSheetStateChange });
    state.addStop = TNUI.initAddStopModal({
      onSaved: () => {
        if (state.query) performSearch({ from: state.query.from, to: state.query.to });
      },
    });

    bindEvents();
    updateClearButton();
    renderRecents();

    // Restore a route from the URL or the last session.
    let sessionFrom = "";
    let sessionTo = "";
    try {
      sessionFrom = sessionStorage.getItem(SESSION_FROM) || "";
      sessionTo = sessionStorage.getItem(SESSION_TO) || "";
    } catch (_) {}
    const params = new URLSearchParams(window.location.search);
    const initialFrom = params.get("from") || sessionFrom;
    const initialTo = params.get("to") || sessionTo;
    if (initialFrom) originInput.value = initialFrom;
    if (initialTo) destinationInput.value = initialTo;
    updateClearButton();

    if (params.get("to") && initialTo) {
      performSearch({ from: initialFrom, to: initialTo });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
