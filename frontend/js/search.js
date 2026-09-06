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

  // Setup stop autocomplete
  setupAutocomplete(originInput);
  setupAutocomplete(destInput);

  // Read URL parameters if coming from Home or another page
  const urlParams = new URLSearchParams(window.location.search);
  const fromParam = urlParams.get("from") || sessionStorage.getItem("tn_one_from") || "";
  const toParam = urlParams.get("to") || urlParams.get("destination") || sessionStorage.getItem("tn_one_to") || "";

  if (fromParam) originInput.value = fromParam;
  if (toParam) destInput.value = toParam;

  // Auto-search if parameters are present
  if (fromParam || toParam) {
    performSearch(fromParam, toParam);
  }

  searchBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const from = originInput.value.trim();
    const to = destInput.value.trim();
    if (!from && !to) {
      renderInitialState();
      return;
    }
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
    } else if (to) {
      summaryRoute.textContent = `Buses to ${to}`;
      searchSummary.style.display = "flex";
    }

    // Update URL without reloading
    const newParams = new URLSearchParams();
    if (from) newParams.set("from", from);
    if (to) newParams.set("to", to);
    window.history.replaceState({}, "", `${window.location.pathname}?${newParams.toString()}`);

    // Render loading indicator
    resultsContainer.innerHTML = `
      <div class="state-box">
        <div class="loading-spinner"></div>
        <p class="state-title">Finding community reports...</p>
        <p class="state-desc">Searching for reported buses and timings for this route.</p>
      </div>`;
    resultCount.textContent = "Searching...";

    try {
      let res;
      if (from && to) {
        res = await TNOne.get("/api/search", { from, to });
      } else if (to) {
        res = await TNOne.get("/api/search", { destination: to });
      } else {
        res = await TNOne.get("/api/search", { from });
      }

      const results = res.data && res.data.results ? res.data.results : [];
      renderResults(results, from, to);
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

  function renderResults(results, from, to) {
    if (!results || results.length === 0) {
      resultCount.textContent = "0 buses found";
      const addBusUrl = `report.html?${from ? "from=" + encodeURIComponent(from) + "&" : ""}${to ? "to=" + encodeURIComponent(to) : ""}`;
      resultsContainer.innerHTML = `
        <div class="state-box">
          <div class="state-icon">🚌</div>
          <p class="state-title">Couldn't find a bus for this route yet</p>
          <p class="state-desc">Be the first to add one and help travelers across Tamil Nadu.</p>
          <a href="${addBusUrl}" class="btn-primary" style="display:inline-flex; width:auto;">
            ＋ Add Bus for this route
          </a>
        </div>`;
      return;
    }

    const count = results.length;
    resultCount.textContent = `${count} community ${count === 1 ? "report" : "reports"}`;

    const cardsHtml = results.map(renderBusCard).join("");
    resultsContainer.innerHTML = `<div class="bus-list">${cardsHtml}</div>`;
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

    // Calculate / Highlight Next Bus
    let nextBusBanner = "";
    if (entry.is_next_bus || entry.timing_state === "upcoming" || entry.timing_state === "just_departed") {
      const timeStr = entry.boarding_time
        ? new Date(entry.boarding_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
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

    // Timings list
    let timingsHtml = "";
    if (bus.timings && bus.timings.length > 0) {
      const chips = bus.timings.map(t => `<span class="timing-chip">${escapeHtml(t)}</span>`).join("");
      timingsHtml = `
        <div class="bus-timings-wrap">
          <div class="bus-timings-label">Known Timings</div>
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
        ${timingsHtml}
        ${photosHtml}
        ${notesHtml}

        <div class="bus-card-footer">
          <div class="freshness-tag">
            <span class="freshness-dot ${escapeHtml(freshness.level)}"></span>
            <span>${escapeHtml(freshness.label)}</span>
          </div>
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
          const res = await TNOne.get("/api/stops/search", { q });
          const stops = res.data || [];
          if (!stops.length) {
            list.classList.remove("active");
            return;
          }
          list.innerHTML = stops
            .map((s) => `<div class="autocomplete-item" data-name="${escapeHtml(s.stop_name)}">${escapeHtml(s.stop_name)}</div>`)
            .join("");
          list.classList.add("active");
        } catch (_) {
          list.classList.remove("active");
        }
      }, 200);
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
