/**
 * Search page logic: reads query parameters, triggers search,
 * supports stop autocomplete, and renders rich bus cards.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const topbarAuth = document.getElementById("topbar-auth");
  TNAuth.renderTopbarAuth(topbarAuth, await TNAuth.getStatus());

  const originInput = document.getElementById("origin-input");
  const destInput = document.getElementById("destination-input");
  const searchBtn = document.getElementById("search-button");
  const resultsContainer = document.getElementById("results-container");
  const resultCount = document.getElementById("result-count");
  const searchSummary = document.getElementById("search-summary");
  const summaryRoute = document.getElementById("summary-route-text");
  const editSearchBtn = document.getElementById("edit-search");

  const busesById = new Map();

  // Setup stop autocomplete
  setupAutocomplete(originInput);
  setupAutocomplete(destInput);

  // Modal elements
  const addStopModal = document.getElementById("add-stop-modal");
  const modalBusTitle = document.getElementById("modal-bus-title");
  const modalBusSubtitle = document.getElementById("modal-bus-subtitle");
  const closeAddStopModalBtn = document.getElementById("close-add-stop-modal");
  const cancelAddStopBtn = document.getElementById("cancel-add-stop-btn");
  const addStopForm = document.getElementById("add-stop-form");
  const addStopBusId = document.getElementById("add-stop-bus-id");
  const addStopAfterSelect = document.getElementById("add-stop-after-select");
  const addStopNameInput = document.getElementById("add-stop-name-input");
  const addStopTimeInput = document.getElementById("add-stop-time-input");
  const addStopTimeAmpm = document.getElementById("add-stop-time-ampm");
  const addStopAlert = document.getElementById("add-stop-alert");
  const submitAddStopBtn = document.getElementById("submit-add-stop-btn");

  if (addStopNameInput) {
    setupAutocomplete(addStopNameInput);
  }

  if (addStopTimeInput && addStopTimeAmpm) {
    const syncTimeAmpm = () => {
      addStopTimeAmpm.textContent = addStopTimeInput.value ? formatTimeAmPm(addStopTimeInput.value) : "--:-- --";
    };
    addStopTimeInput.addEventListener("input", syncTimeAmpm);
    addStopTimeInput.addEventListener("change", syncTimeAmpm);
  }

  function openAddStopModal(bus) {
    if (!bus) return;
    addStopBusId.value = bus.id;
    modalBusTitle.textContent = `Add Stop to ${bus.bus_name || "Bus"}`;
    modalBusSubtitle.textContent = `Route: ${bus.start_stop || "Start"} → ${bus.destination || "Destination"}`;

    // Collect existing stops in order
    let stops = [];
    if (bus.spots && Array.isArray(bus.spots) && bus.spots.length > 0) {
      stops = bus.spots.map(s => s.stop || s.stop_name || "");
    } else if (bus.stop_timings && Array.isArray(bus.stop_timings) && bus.stop_timings.length > 0) {
      stops = bus.stop_timings.map(s => s.stop || s.stop_name || "");
    } else {
      const intermediate = bus.boarded_stops ? bus.boarded_stops.split(",").map(s => s.trim()).filter(Boolean) : [];
      stops = [bus.start_stop, ...intermediate, bus.destination].filter(Boolean);
    }

    // Filter duplicates preserving order
    const uniqueStops = [];
    stops.forEach(s => {
      if (s && !uniqueStops.includes(s)) uniqueStops.push(s);
    });

    addStopAfterSelect.innerHTML = "";
    uniqueStops.forEach((stopName, idx) => {
      const opt = document.createElement("option");
      opt.value = stopName;
      if (idx === 0) {
        opt.textContent = `After ${stopName} (Start)`;
      } else if (idx === uniqueStops.length - 1) {
        opt.textContent = `After ${stopName} (Near Destination)`;
      } else {
        opt.textContent = `After ${stopName}`;
      }
      addStopAfterSelect.appendChild(opt);
    });

    addStopNameInput.value = "";
    addStopTimeInput.value = "";
    addStopTimeAmpm.textContent = "--:-- --";
    addStopAlert.style.display = "none";
    addStopAlert.textContent = "";
    submitAddStopBtn.disabled = false;
    submitAddStopBtn.textContent = "Save Stop to Route";

    addStopModal.style.display = "flex";
    setTimeout(() => addStopNameInput.focus(), 50);
  }

  function closeAddStopModal() {
    if (addStopModal) addStopModal.style.display = "none";
  }

  if (closeAddStopModalBtn) closeAddStopModalBtn.addEventListener("click", closeAddStopModal);
  if (cancelAddStopBtn) cancelAddStopBtn.addEventListener("click", closeAddStopModal);
  if (addStopModal) {
    addStopModal.addEventListener("click", (e) => {
      if (e.target === addStopModal) closeAddStopModal();
    });
  }

  // Event delegation on results container for ➕ Add Stop button
  resultsContainer.addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-open-add-stop");
    if (!btn) return;
    e.preventDefault();

    const auth = await TNAuth.getStatus();
    if (!auth.authenticated) {
      alert("Please log in to add a stop to this bus route.");
      window.location.href = "login.html?redirect=" + encodeURIComponent(window.location.href);
      return;
    }

    const busId = Number(btn.dataset.busId);
    const bus = busesById.get(busId);
    if (!bus) {
      alert("Bus details not found. Please refresh the page.");
      return;
    }
    openAddStopModal(bus);
  });

  // Modal form submit
  if (addStopForm) {
    addStopForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const busId = addStopBusId.value;
      const afterStop = addStopAfterSelect.value;
      const stopName = addStopNameInput.value.trim();
      const timeVal = addStopTimeInput.value.trim();

      if (!stopName) {
        addStopAlert.className = "alert alert-error";
        addStopAlert.textContent = "Please enter a stop name.";
        addStopAlert.style.display = "block";
        return;
      }

      const formattedTime = timeVal ? formatTimeAmPm(timeVal) : null;

      submitAddStopBtn.disabled = true;
      submitAddStopBtn.textContent = "Saving Stop...";
      addStopAlert.style.display = "none";

      try {
        const payload = {
          stop_name: stopName,
          after_stop: afterStop,
        };
        if (formattedTime) {
          payload.time = formattedTime;
        }

        await TNOne.post(`/api/buses/${busId}/stops`, payload);

        closeAddStopModal();
        showToast(`Stop "${stopName}" added successfully to the route!`);

        // Refresh search results to show new stop on cards immediately
        performSearch(originInput.value.trim(), destInput.value.trim());
      } catch (err) {
        addStopAlert.className = "alert alert-error";
        addStopAlert.textContent = err.message || "Failed to add stop. Please try again.";
        addStopAlert.style.display = "block";
        submitAddStopBtn.disabled = false;
        submitAddStopBtn.textContent = "Save Stop to Route";
      }
    });
  }

  function showToast(message) {
    const existing = document.querySelector(".toast-notification");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "toast-notification";
    toast.innerHTML = `<span>✅</span> <span>${escapeHtml(message)}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = "opacity 0.3s, transform 0.3s";
      toast.style.opacity = "0";
      toast.style.transform = "translate(-50%, 20px)";
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Read URL parameters if coming from Home or another page
  const urlParams = new URLSearchParams(window.location.search);
  const fromParam = urlParams.get("from") || sessionStorage.getItem("tn_one_from") || "";
  const toParam = urlParams.get("to") || urlParams.get("destination") || sessionStorage.getItem("tn_one_to") || "";

  if (fromParam) originInput.value = fromParam;
  if (toParam) destInput.value = toParam;

  // Load all available buses immediately (or filtered if parameters exist)
  performSearch(fromParam, toParam);

  searchBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const from = originInput.value.trim();
    const to = destInput.value.trim();
    performSearch(from, to);
  });

  if (editSearchBtn) {
    editSearchBtn.addEventListener("click", () => {
      searchSummary.style.display = "none";
      originInput.focus();
    });
  }

  async function performSearch(from, to) {
    // Show summary bar
    if (from && to) {
      summaryRoute.textContent = `${from} → ${to}`;
      searchSummary.style.display = "flex";
    } else if (from) {
      summaryRoute.textContent = `Buses from ${from}`;
      searchSummary.style.display = "flex";
    } else if (to) {
      summaryRoute.textContent = `Buses to ${to}`;
      searchSummary.style.display = "flex";
    } else {
      summaryRoute.textContent = "All Available Buses";
      searchSummary.style.display = "flex";
    }

    // Update URL without reloading
    const newParams = new URLSearchParams();
    if (from) newParams.set("from", from);
    if (to) newParams.set("to", to);
    const queryStr = newParams.toString();
    window.history.replaceState({}, "", queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname);

    // Render loading indicator
    resultsContainer.innerHTML = `
      <div class="state-box">
        <div class="loading-spinner"></div>
        <p class="state-title">Loading available buses...</p>
        <p class="state-desc">Fetching schedule and community reports across Tamil Nadu.</p>
      </div>`;
    resultCount.textContent = "Searching...";

    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;

      const res = await TNOne.get("/api/search", params);
      const results = res.data && res.data.results ? res.data.results : [];
      const otherBuses = res.data && res.data.other_buses ? res.data.other_buses : [];
      renderResults(results, otherBuses, from, to);
    } catch (err) {
      resultsContainer.innerHTML = `
        <div class="state-box">
          <div class="state-icon">⚠️</div>
          <p class="state-title">Something went wrong</p>
          <p class="state-desc">${escapeHtml(err.message || "Please check your connection and try again.")}</p>
        </div>`;
      resultCount.textContent = "Error loading buses";
    }
  }

  function renderResults(results, otherBuses, from, to) {
    // Save into busesById lookup map
    busesById.clear();
    [...(results || []), ...(otherBuses || [])].forEach(entry => {
      if (entry && entry.bus && entry.bus.id) {
        busesById.set(Number(entry.bus.id), entry.bus);
      }
    });

    const isFiltered = Boolean(from || to);

    // Case 1: Unfiltered browsing (display all available buses)
    if (!isFiltered) {
      if (!results || results.length === 0) {
        resultCount.textContent = "0 buses registered";
        resultsContainer.innerHTML = `
          <div class="state-box">
            <div class="state-icon">🚌</div>
            <p class="state-title">No buses registered yet</p>
            <p class="state-desc">Be the first to add one and help travelers across Tamil Nadu.</p>
            <a href="report.html" class="btn-primary" style="display:inline-flex; width:auto;">
              ＋ Add Bus
            </a>
          </div>`;
        return;
      }
      resultCount.textContent = `${results.length} bus${results.length === 1 ? "" : "es"} available`;
      resultsContainer.innerHTML = `<div class="bus-list">${results.map(renderBusCard).join("")}</div>`;
      return;
    }

    // Case 2: Filtered / sorted by origin or route
    const addBusUrl = `report.html?${from ? "from=" + encodeURIComponent(from) + "&" : ""}${to ? "to=" + encodeURIComponent(to) : ""}`;

    if (results && results.length > 0) {
      const label = (from && to)
        ? `${results.length} bus${results.length === 1 ? "" : "es"} on route`
        : `${results.length} matching bus${results.length === 1 ? "" : "es"}`;
      resultCount.textContent = label;

      let html = `<div class="bus-list">${results.map(renderBusCard).join("")}</div>`;
      resultsContainer.innerHTML = html;
    } else {
      // 0 direct matches
      resultCount.textContent = "0 buses found";

      let html = `
        <div class="state-box" style="margin-bottom: 24px;">
          <div class="state-icon">🚌</div>
          <p class="state-title">No direct buses found for this selection</p>
          <p class="state-desc">You can contribute this route timing to help other commuters.</p>
          <a href="${addBusUrl}" class="btn-primary" style="display:inline-flex; width:auto; margin-top: 6px;">
            ＋ Add Bus for this route
          </a>
        </div>`;
      
      resultsContainer.innerHTML = html;
    }
  }

  function renderBusCard(entry) {
    const bus = entry.bus || {};
    const title = escapeHtml(bus.bus_name || "Mofussil Bus");
    const busNum = bus.bus_number ? `<span class="bus-number-badge">${escapeHtml(bus.bus_number)}</span>` : "";
    const operator = [bus.operator, bus.bus_type].filter(Boolean).map(escapeHtml).join(" · ");
    
    // Boarding & Destination
    const fromName = entry.boarding_stop ? escapeHtml(entry.boarding_stop.stop_name) : "Origin";
    const toName = entry.destination_stop ? escapeHtml(entry.destination_stop.stop_name) : "Destination";
    const routeLine = `${fromName} <span class="arrow">→</span> ${toName}`;

    // Calculate / Highlight Next Bus (strictly AM/PM)
    let nextBusBanner = "";
    const rawTime = entry.boarding_time || entry.timing_display || (bus.timings && bus.timings[0]);
    const timeStr = formatTimeAmPm(rawTime);

    if (entry.is_next_bus || entry.timing_state === "upcoming" || entry.timing_state === "just_departed") {
      const mins = entry.minutes_until_boarding;
      let countdownText = "";
      if (mins !== null && mins !== undefined) {
        countdownText = mins > 0 ? `in ${Math.round(mins)} min` : "Departing now";
      }
      nextBusBanner = `
        <div class="next-bus-banner">
          <span class="badge">🟢 Next reported bus ${timeStr ? "· " + timeStr : ""}</span>
          <span class="countdown">${countdownText}</span>
        </div>`;
    }

    // Expected Reaching / Arrival Time in AM/PM
    let reachingHtml = "";
    const reachingStr = formatTimeAmPm(entry.reaching_time || bus.reaching_time);
    if (reachingStr) {
      reachingHtml = `
        <div class="bus-reaching-badge" style="display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:700; color:var(--color-primary); background:var(--color-primary-light); padding:4px 10px; border-radius:var(--radius-sm); margin:8px 0 4px;">
          ⏱️ Expected Arrival: ${escapeHtml(reachingStr)}
        </div>`;
    }

    // Route Spots with Timing Timeline
    let spotsHtml = "";
    const spotsList = entry.spots || entry.stop_timings || (bus.spots || bus.stop_timings);
    if (spotsList && Array.isArray(spotsList) && spotsList.length > 0) {
      const items = spotsList.map((sp, sIdx) => {
        const isStart = sIdx === 0;
        const isDest = sIdx === spotsList.length - 1;
        const typeClass = isStart ? "start" : (isDest ? "dest" : "intermediate");
        const spotName = escapeHtml(sp.stop || sp.stop_name || "");
        const spotTime = sp.time ? escapeHtml(formatTimeAmPm(sp.time)) : "";
        const arrow = !isDest ? `<span class="spot-arrow-sep">→</span>` : "";
        return `
          <span class="spot-item-badge ${typeClass}">
            <span class="spot-dot-indicator"></span>
            <span class="spot-badge-name">${spotName}</span>
            ${spotTime ? `<span class="spot-badge-time">${spotTime}</span>` : ""}
          </span>
          ${arrow}
        `;
      }).join("");

      spotsHtml = `
        <div class="spots-route-timeline">
          <div class="timeline-header" style="display:flex; align-items:center; justify-content:space-between;">
            <span>📍 Spots &amp; Passing Timings</span>
            <button type="button" class="btn-add-stop-pill btn-open-add-stop" data-bus-id="${bus.id}">
              ➕ Add Stop
            </button>
          </div>
          <div class="spots-scroll-wrap">
            ${items}
          </div>
        </div>`;
    } else {
      // If no detailed spots list yet, render basic start/dest with Add Stop trigger
      const startName = escapeHtml(bus.start_stop || fromName || "Start");
      const destName = escapeHtml(bus.destination || toName || "Destination");
      spotsHtml = `
        <div class="spots-route-timeline">
          <div class="timeline-header" style="display:flex; align-items:center; justify-content:space-between;">
            <span>📍 Route Stops</span>
            <button type="button" class="btn-add-stop-pill btn-open-add-stop" data-bus-id="${bus.id}">
              ➕ Add Stop
            </button>
          </div>
          <div class="spots-scroll-wrap">
            <span class="spot-item-badge start">
              <span class="spot-dot-indicator"></span>
              <span class="spot-badge-name">${startName}</span>
            </span>
            <span class="spot-arrow-sep">→</span>
            <span class="spot-item-badge dest">
              <span class="spot-dot-indicator"></span>
              <span class="spot-badge-name">${destName}</span>
            </span>
          </div>
        </div>`;
    }

    // Known Timings list formatted strictly in AM/PM
    let timingsHtml = "";
    if (bus.timings && bus.timings.length > 0) {
      const chips = bus.timings.map(t => `<span class="timing-chip">${escapeHtml(formatTimeAmPm(t))}</span>`).join("");
      timingsHtml = `
        <div class="bus-timings-wrap">
          <div class="bus-timings-label">Known Trip Timings</div>
          <div class="bus-timings-list">${chips}</div>
        </div>`;
    }

    // Freshness & notes
    const freshness = entry.freshness || { label: "Recently reported", level: "fresh" };
    const notesHtml = entry.notes ? `<div style="font-style:italic; margin-top:6px; color:var(--color-text-secondary);">"${escapeHtml(entry.notes)}"</div>` : "";

    // Photos
    let photosHtml = "";
    if (bus.photos && bus.photos.length > 0) {
      const thumbs = bus.photos.map(url => `<img src="${escapeHtml(url)}" class="bus-photo-thumb" alt="Bus photo" onerror="this.style.display='none'" />`).join("");
      photosHtml = `<div class="bus-photos-row">${thumbs}</div>`;
    }

    return `
      <div class="bus-card ${entry.is_next_bus ? "is-next-bus" : ""}">
        <div class="bus-card-top">
          <div class="bus-identity">
            <div class="bus-name-row">
              <span class="bus-name">🚌 ${title}</span>
              ${busNum}
            </div>
            ${operator ? `<span class="bus-operator">${operator}</span>` : ""}
          </div>
          <div class="bus-fare">₹${entry.fare || 25}</div>
        </div>

        <div class="bus-route-path">${routeLine}</div>

        ${nextBusBanner}
        ${reachingHtml}
        ${spotsHtml}
        ${timingsHtml}
        ${photosHtml}
        ${notesHtml}

        <div class="bus-card-footer">
          <div class="freshness-tag">
            <span class="freshness-dot ${escapeHtml(freshness.level)}"></span>
            <span>${escapeHtml(freshness.label)}</span>
          </div>
          <button type="button" class="btn-add-stop-pill btn-open-add-stop" data-bus-id="${bus.id}" style="margin-left: auto;">
            ➕ Add Stop to Route
          </button>
        </div>
      </div>`;
  }

  function renderInitialState() {
    resultCount.textContent = "Search to discover buses";
    searchSummary.style.display = "none";
    resultsContainer.innerHTML = `
      <div class="state-box">
        <div class="state-icon">🗺️</div>
        <p class="state-title">Where are you going?</p>
        <p class="state-desc">Enter your starting point and destination to find community-reported buses.</p>
      </div>`;
  }

  function setupAutocomplete(inputEl) {
    if (!inputEl) return;
    const wrap = document.createElement("div");
    wrap.className = "autocomplete-wrap";
    inputEl.parentNode.insertBefore(wrap, inputEl);
    wrap.appendChild(inputEl);

    const list = document.createElement("div");
    list.className = "autocomplete-list";
    wrap.appendChild(list);

    let debounceTimer = null;
    inputEl.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const q = inputEl.value.trim();
      if (q.length < 2) {
        list.classList.remove("active");
        list.innerHTML = "";
        return;
      }
      debounceTimer = setTimeout(async () => {
        try {
          const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q + ", Tamil Nadu, India")}&limit=5`;
          const res = await fetch(url, { headers: { "Accept-Language": "en" } });
          const data = await res.json();
          if (!data || !data.length) {
            list.classList.remove("active");
            return;
          }
          list.innerHTML = data
            .map((s) => {
              const nameParts = s.display_name.split(", ");
              const shortName = nameParts[0];
              const subText = nameParts.slice(1, 3).join(", ");
              return `<div class="autocomplete-item" data-name="${escapeHtml(shortName)}">
                <div style="font-weight: 600;">${escapeHtml(shortName)}</div>
                <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">${escapeHtml(subText)}</div>
              </div>`;
            })
            .join("");
          list.classList.add("active");
        } catch (_) {
          list.classList.remove("active");
        }
      }, 300);
    });

    list.addEventListener("click", (e) => {
      const item = e.target.closest(".autocomplete-item");
      if (!item) return;
      inputEl.value = item.dataset.name;
      list.classList.remove("active");
    });

    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) list.classList.remove("active");
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
});
