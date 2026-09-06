/**
 * Report-a-bus page logic: requires authentication, provides stop
 * autocomplete for boarding/destination/route stops, and submits the report.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const topbarAuth = document.getElementById("topbar-auth");
  const status = await TNAuth.getStatus();
  TNAuth.renderTopbarAuth(topbarAuth, status);

  const gate = document.getElementById("auth-gate");
  const formCard = document.getElementById("report-form-card");

  if (!status.authenticated) {
    gate.style.display = "block";
    formCard.style.display = "none";
    return;
  }
  gate.style.display = "none";
  formCard.style.display = "block";

  const form = document.getElementById("report-form");
  const alertBox = document.getElementById("form-alert");
  const routeStopsContainer = document.getElementById("route-stops-container");
  const addStopBtn = document.getElementById("add-stop-btn");

  const boardingInput = document.getElementById("boarding-stop-input");
  const destinationInput = document.getElementById("destination-stop-input");
  attachAutocomplete(boardingInput);
  attachAutocomplete(destinationInput);

  addStopBtn.addEventListener("click", () => addRouteStopRow());

  function addRouteStopRow(value = "") {
    const row = document.createElement("div");
    row.className = "route-stop-row";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Stop name";
    input.value = value;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "\u2715";
    removeBtn.onclick = () => row.remove();
    row.appendChild(input);
    row.appendChild(removeBtn);
    routeStopsContainer.appendChild(row);
    attachAutocomplete(input);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    alertBox.style.display = "none";

    const busName = document.getElementById("bus-name-input").value.trim();
    const operator = document.getElementById("operator-select").value;
    const boardingStop = boardingInput.value.trim();
    const destinationStop = destinationInput.value.trim();
    const boardingTimeRaw = document.getElementById("boarding-time-input").value;
    const notes = document.getElementById("notes-input").value.trim();

    const routeStopInputs = Array.from(routeStopsContainer.querySelectorAll("input"))
      .map((i) => i.value.trim())
      .filter(Boolean);

    let boardingTimeIso = null;
    if (boardingTimeRaw) {
      const now = new Date();
      const [hh, mm] = boardingTimeRaw.split(":").map(Number);
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
      boardingTimeIso = dt.toISOString();
    }

    const payload = {
      bus_name: busName,
      operator: operator || null,
      boarding_stop: boardingStop,
      destination_stop: destinationStop,
      boarding_time: boardingTimeIso,
      notes: notes || null,
    };
    if (routeStopInputs.length >= 2) payload.route_stops = routeStopInputs;

    try {
      const res = await TNOne.post("/api/reports", payload);
      showAlert(res.message || "Bus report added successfully.", "success");
      form.reset();
      routeStopsContainer.innerHTML = "";
    } catch (err) {
      showAlert(err.message, "error");
    }
  });

  function showAlert(message, type) {
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.style.display = "block";
    alertBox.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function attachAutocomplete(inputEl) {
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
      if (query.length < 2) { list.classList.remove("active"); return; }
      debounceTimer = setTimeout(async () => {
        try {
          const res = await TNOne.get("/api/stops/search", { q: query });
          const stops = res.data || [];
          if (!stops.length) { list.classList.remove("active"); return; }
          list.innerHTML = stops.map((s) => `<div class="autocomplete-item" data-name="${s.stop_name}">${s.stop_name}</div>`).join("");
          list.classList.add("active");
        } catch (_) { list.classList.remove("active"); }
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
});
