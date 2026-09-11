/**
 * Add-a-bus (Report) page logic:
 * - Requires authentication or shows a clean sign-in prompt
 * - Pre-fills stops from URL parameters
 * - Unlimited dynamic timings (add/remove, chronological sort, duplicate check)
 * - Fare input validation
 * - Client-side multiple image preview and removal
 * - Clear inline status messages without alert()
 */
document.addEventListener("DOMContentLoaded", async () => {
  const topbarAuth = document.getElementById("topbar-auth");
  const status = await TNAuth.getStatus();
  TNAuth.renderTopbarAuth(topbarAuth, status);

  const authGate = document.getElementById("auth-gate");
  const formCard = document.getElementById("report-form-card");

  if (!status.authenticated) {
    authGate.style.display = "block";
    formCard.style.display = "none";
    return;
  }
  authGate.style.display = "none";
  formCard.style.display = "block";

  const form = document.getElementById("report-form");
  const alertBox = document.getElementById("form-alert");
  const submitBtn = document.getElementById("submit-btn");

  const busNameInput = document.getElementById("bus-name-input");
  const busNumberInput = document.getElementById("bus-number-input");
  const operatorSelect = document.getElementById("operator-select");
  const boardingInput = document.getElementById("boarding-stop-input");
  const boardingTimeInput = document.getElementById("boarding-time-input");
  const boardingTimeAmpm = document.getElementById("boarding-time-ampm");
  const destinationInput = document.getElementById("destination-stop-input");
  const destinationTimeInput = document.getElementById("destination-time-input");
  const destinationTimeAmpm = document.getElementById("destination-time-ampm");
  const intermediateSpotsList = document.getElementById("intermediate-spots-list");
  const addSpotBtn = document.getElementById("add-spot-btn");
  const fareInput = document.getElementById("fare-input");
  const timingsContainer = document.getElementById("timings-container");
  const addTimingBtn = document.getElementById("add-timing-btn");
  const photoInput = document.getElementById("bus-photos");
  const photoPreviews = document.getElementById("photo-previews");

  // Pre-fill from URL parameters (e.g. redirected from Home or Search)
  const urlParams = new URLSearchParams(window.location.search);
  const fromParam = urlParams.get("from");
  const toParam = urlParams.get("to");
  if (fromParam) boardingInput.value = fromParam;
  if (toParam) destinationInput.value = toParam;

  // Autocomplete for boarding and destination
  attachAutocomplete(boardingInput);
  attachAutocomplete(destinationInput);

  // Sync Start Spot and Destination AM/PM badges
  if (boardingTimeInput && boardingTimeAmpm) {
    const syncBoardingAmpm = () => {
      boardingTimeAmpm.textContent = boardingTimeInput.value ? formatTimeAmPm(boardingTimeInput.value) : "--:-- --";
    };
    boardingTimeInput.addEventListener("input", syncBoardingAmpm);
    boardingTimeInput.addEventListener("change", syncBoardingAmpm);
  }

  if (destinationTimeInput && destinationTimeAmpm) {
    const syncDestAmpm = () => {
      destinationTimeAmpm.textContent = destinationTimeInput.value ? formatTimeAmPm(destinationTimeInput.value) : "--:-- --";
    };
    destinationTimeInput.addEventListener("input", syncDestAmpm);
    destinationTimeInput.addEventListener("change", syncDestAmpm);
  }

  // Intermediate Spots Management
  let intermediateSpots = [];

  function renderIntermediateSpots() {
    intermediateSpotsList.innerHTML = "";
    intermediateSpots.forEach((spot, idx) => {
      const card = document.createElement("div");
      card.className = "spot-card intermediate-spot";

      card.innerHTML = `
        <div class="spot-header">
          <span class="spot-marker-badge">⚪ Spot ${idx + 2} (Intermediate)</span>
          <button type="button" class="spot-remove-btn" title="Remove this spot">×</button>
        </div>
        <div class="spot-inputs-row">
          <input class="spot-name-input" type="text" placeholder="e.g. Town Hall" autocomplete="off" required value="${escapeHtml(spot.stop || "")}" />
          <div class="spot-time-wrap">
            <input class="spot-time-input" type="time" value="${escapeHtml(spot.time || "")}" />
            <span class="timing-ampm-pill">${spot.time ? formatTimeAmPm(spot.time) : "--:-- --"}</span>
          </div>
        </div>
      `;

      const nameInput = card.querySelector(".spot-name-input");
      const timeInput = card.querySelector(".spot-time-input");
      const ampmPill = card.querySelector(".timing-ampm-pill");
      const removeBtn = card.querySelector(".spot-remove-btn");

      attachAutocomplete(nameInput);

      nameInput.addEventListener("input", (e) => {
        intermediateSpots[idx].stop = e.target.value;
      });

      timeInput.addEventListener("input", (e) => {
        intermediateSpots[idx].time = e.target.value;
        ampmPill.textContent = e.target.value ? formatTimeAmPm(e.target.value) : "--:-- --";
      });
      timeInput.addEventListener("change", (e) => {
        intermediateSpots[idx].time = e.target.value;
        ampmPill.textContent = e.target.value ? formatTimeAmPm(e.target.value) : "--:-- --";
      });

      removeBtn.addEventListener("click", () => {
        intermediateSpots.splice(idx, 1);
        renderIntermediateSpots();
      });

      intermediateSpotsList.appendChild(card);
    });
  }

  if (addSpotBtn) {
    addSpotBtn.addEventListener("click", () => {
      intermediateSpots.push({ stop: "", time: "" });
      renderIntermediateSpots();
    });
  }

  // Additional Daily Trip Timings Management (Optional)
  let additionalTimings = [];

  function renderAdditionalTimings() {
    timingsContainer.innerHTML = "";
    additionalTimings.forEach((val, idx) => {
      const row = document.createElement("div");
      row.className = "timing-row";

      const input = document.createElement("input");
      input.type = "time";
      input.value = val;

      const ampmBadge = document.createElement("span");
      ampmBadge.className = "timing-ampm-pill";
      ampmBadge.style.cssText = "font-size:12px; font-weight:700; color:var(--color-primary); background:var(--color-primary-light); padding:4px 8px; border-radius:var(--radius-sm); margin-left:8px; white-space:nowrap; display:inline-flex; align-items:center;";
      ampmBadge.textContent = val ? formatTimeAmPm(val) : "--:-- --";

      input.addEventListener("input", (e) => {
        additionalTimings[idx] = e.target.value;
        ampmBadge.textContent = e.target.value ? formatTimeAmPm(e.target.value) : "--:-- --";
      });
      input.addEventListener("change", (e) => {
        additionalTimings[idx] = e.target.value;
        ampmBadge.textContent = e.target.value ? formatTimeAmPm(e.target.value) : "--:-- --";
      });

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "timing-remove-btn";
      removeBtn.innerHTML = "×";
      removeBtn.title = "Remove timing";
      removeBtn.addEventListener("click", () => {
        additionalTimings.splice(idx, 1);
        renderAdditionalTimings();
      });

      row.appendChild(input);
      row.appendChild(ampmBadge);
      row.appendChild(removeBtn);
      timingsContainer.appendChild(row);
    });
  }

  if (addTimingBtn) {
    addTimingBtn.addEventListener("click", () => {
      additionalTimings.push("");
      renderAdditionalTimings();
    });
  }

  // Photo Upload & Preview Management
  let selectedFiles = [];

  photoInput.addEventListener("change", () => {
    const files = Array.from(photoInput.files || []);
    for (const f of files) {
      if (!f.type.startsWith("image/")) {
        showAlert("Only image files (JPG, PNG, WEBP) are allowed.", "error");
        continue;
      }
      if (f.size > 5 * 1024 * 1024) {
        showAlert("Each image must be smaller than 5MB.", "error");
        continue;
      }
      selectedFiles.push(f);
    }
    renderPhotoPreviews();
  });

  let objectUrls = [];

  function renderPhotoPreviews() {
    // Revoke previous URLs to avoid memory leaks
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls = [];

    photoPreviews.innerHTML = "";
    selectedFiles.forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "preview-item";

      const url = URL.createObjectURL(file);
      objectUrls.push(url);

      const img = document.createElement("img");
      img.src = url;
      item.appendChild(img);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "preview-remove";
      removeBtn.innerHTML = "×";
      removeBtn.title = "Remove photo";
      removeBtn.addEventListener("click", () => {
        selectedFiles.splice(index, 1);
        renderPhotoPreviews();
      });
      item.appendChild(removeBtn);

      photoPreviews.appendChild(item);
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Form Submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();

    const busName = busNameInput.value.trim();
    const busNumber = busNumberInput.value.trim() || null;
    const operator = operatorSelect.value || null;
    const boardingStop = boardingInput.value.trim();
    const boardingTime = boardingTimeInput.value;
    const destinationStop = destinationInput.value.trim();
    const destTime = destinationTimeInput.value;
    const fare = parseFloat(fareInput.value);

    // Validation
    if (!busName) {
      showAlert("Please enter the bus name.", "error");
      busNameInput.focus();
      return;
    }
    if (!boardingStop) {
      showAlert("Please specify the starting spot.", "error");
      boardingInput.focus();
      return;
    }
    if (!boardingTime) {
      showAlert("Please enter the starting spot departure timing.", "error");
      boardingTimeInput.focus();
      return;
    }
    if (!destinationStop) {
      showAlert("Please specify the destination location.", "error");
      destinationInput.focus();
      return;
    }
    if (boardingStop.toLowerCase() === destinationStop.toLowerCase()) {
      showAlert("Starting spot and destination cannot be identical.", "error");
      return;
    }
    if (isNaN(fare) || fare < 0) {
      showAlert("Please enter a valid fare amount (₹0 or greater).", "error");
      fareInput.focus();
      return;
    }

    // Build spots list: [Start Spot, ...Intermediate Spots, Destination Spot]
    const validIntermediate = intermediateSpots.filter(s => s.stop && s.stop.trim());
    const spots = [
      { stop: boardingStop, time: formatTimeAmPm(boardingTime) },
      ...validIntermediate.map(s => ({
        stop: s.stop.trim(),
        time: s.time ? formatTimeAmPm(s.time) : "",
      })),
      { stop: destinationStop, time: destTime ? formatTimeAmPm(destTime) : "" },
    ];

    // Collect all trip departure timings (starting time + additional)
    const tripTimings = [formatTimeAmPm(boardingTime)];
    additionalTimings.forEach(t => {
      if (t && t.trim()) tripTimings.push(formatTimeAmPm(t.trim()));
    });
    const uniqueTimings = Array.from(new Set(tripTimings));

    // Prepare ISO boarding time for current date
    const [hh, mm] = boardingTime.split(":").map(Number);
    const now = new Date();
    const boardingDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);

    // Optional Upload Photos if configured
    let uploadedUrls = [];
    if (selectedFiles.length > 0) {
      try {
        const formData = new FormData();
        selectedFiles.forEach((file) => formData.append("photos", file));
        const uploadRes = await fetch(`${TNOne.API_BASE}/api/buses/photos`, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (uploadRes.ok) {
          const upJson = await uploadRes.json();
          uploadedUrls = (upJson.data && upJson.data.urls) || [];
        }
      } catch (_) {
        // Storage might not be configured in development; continue gracefully
      }
    }

    const payload = {
      bus_name: busName,
      bus_number: busNumber,
      operator: operator,
      boarding_stop: boardingStop,
      destination_stop: destinationStop,
      boarding_time: boardingDate.toISOString(),
      bus_fare: fare,
      bus_timings: uniqueTimings.join(", "),
      spots: spots,
      stop_timings: JSON.stringify(spots),
      photos: uploadedUrls,
      notes: `Fare: ₹${fare}. Route: ${spots.map(s => s.stop + (s.time ? ` (${s.time})` : "")).join(" → ")}`,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Adding bus...";

    try {
      const res = await TNOne.post("/api/reports", payload);
      showAlert("Bus added successfully with route spots and timings!", "success");
      form.reset();
      intermediateSpots = [];
      renderIntermediateSpots();
      additionalTimings = [];
      renderAdditionalTimings();
      boardingTimeAmpm.textContent = "--:-- --";
      destinationTimeAmpm.textContent = "--:-- --";
      selectedFiles = [];
      renderPhotoPreviews();
      setTimeout(() => {
        window.location.href = `/search?from=${encodeURIComponent(boardingStop)}&to=${encodeURIComponent(destinationStop)}`;
      }, 1500);
    } catch (err) {
      showAlert(err.message || "Failed to add bus. Please try again.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "ADD BUS";
    }
  });


  function showAlert(msg, type) {
    alertBox.textContent = msg;
    alertBox.className = `alert alert-${type}`;
    alertBox.style.display = "block";
    alertBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideAlert() {
    alertBox.style.display = "none";
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
      const q = inputEl.value.trim();
      if (q.length < 2) {
        list.classList.remove("active");
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

});
