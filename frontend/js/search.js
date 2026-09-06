/**
 * Home / search page logic: destination + from-to search, stop autocomplete,
 * and rendering of bus result cards with freshness + "next bus" indicators.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const topbarAuth = document.getElementById("topbar-auth");
  TNAuth.renderTopbarAuth(topbarAuth, await TNAuth.getStatus());

  const modeToggle = document.getElementById("mode-toggle");
  const singleField = document.getElementById("single-search-field");
  const fromToFields = document.getElementById("from-to-fields");
  const destinationInput = document.getElementById("destination-input");
  const originInput = document.getElementById("origin-input");
  const toInput = document.getElementById("to-input");
  const searchForm = document.getElementById("search-form");
  const resultsContainer = document.getElementById("results-container");

  let fromToMode = false;
  modeToggle.addEventListener("click", () => {
    fromToMode = !fromToMode;
    fromToFields.classList.toggle("active", fromToMode);
    singleField.style.display = fromToMode ? "none" : "flex";
    modeToggle.textContent = fromToMode
      ? "Switch to destination-only search"
      : "Know your starting point too? Search From \u2192 To";
  });

  setupAutocomplete(destinationInput);
  setupAutocomplete(originInput);
  setupAutocomplete(toInput);

  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    resultsContainer.innerHTML = `<p class="empty-state">Searching for buses\u2026</p>`;

    try {
      let res;
      if (fromToMode && originInput.value.trim() && toInput.value.trim()) {
        res = await TNOne.get("/api/search", { from: originInput.value.trim(), to: toInput.value.trim() });
      } else if (destinationInput.value.trim()) {
        res = await TNOne.get("/api/search", { destination: destinationInput.value.trim() });
      } else {
        resultsContainer.innerHTML = `<p class="empty-state">Please enter a destination to search.</p>`;
        return;
      }
      renderResults(res.data.results, destinationInput.value.trim() || toInput.value.trim());
    } catch (err) {
      resultsContainer.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
    }
  });

  function renderResults(results, label) {
    if (!results || results.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-state">
          <div class="big-emoji">\u{1F68C}</div>
          <p>No recent bus information found for this destination.</p>
          <a class="btn-primary" href="report.html">Report a bus to help others</a>
        </div>`;
      return;
    }

    const heading = `<h2>Buses to ${escapeHtml(label)}</h2>`;
    const cards = results.map(renderCard).join("");
    resultsContainer.innerHTML = heading + cards;
  }

  function renderCard(entry) {
    const bus = entry.bus;
    const title = `${escapeHtml(bus.bus_name)}${bus.bus_number ? " " + escapeHtml(bus.bus_number) : ""}`;
    const sub = [bus.operator, bus.bus_type].filter(Boolean).map(escapeHtml).join(" \u00b7 ");
    const boardingTime = entry.boarding_time
      ? new Date(entry.boarding_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "Not specified";

    const routeLine = entry.route_summary && entry.route_summary.length
      ? entry.route_summary.map(escapeHtml).join(' <span class="arrow">\u2192</span> ')
      : `${escapeHtml(entry.boarding_stop.stop_name)} <span class="arrow">\u2192</span> ${escapeHtml(entry.destination_stop.stop_name)}`;

    const badge = entry.is_next_bus
      ? `<div class="next-badge">\u{1F7E2} Next reported bus</div>`
      : "";

    const notes = entry.notes
      ? `<div class="notes-line">"${escapeHtml(entry.notes)}"</div>`
      : "";

    return `
      <div class="bus-card ${entry.is_next_bus ? "next" : ""}">
        ${badge}
        <p class="bus-title">${title}</p>
        <p class="bus-sub">${sub}</p>
        <div class="route-line">${routeLine}</div>
        <div class="card-meta">
          <div class="meta-block">
            <div class="label">Boarding</div>
            <div class="value">${boardingTime}</div>
          </div>
          <div class="freshness-pill">
            <span class="dot ${entry.freshness.level}"></span>
            ${escapeHtml(entry.freshness.label)}
          </div>
        </div>
        ${notes}
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
      const query = inputEl.value.trim();
      if (query.length < 2) {
        list.classList.remove("active");
        list.innerHTML = "";
        return;
      }
      debounceTimer = setTimeout(async () => {
        try {
          const res = await TNOne.get("/api/stops/search", { q: query });
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
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
