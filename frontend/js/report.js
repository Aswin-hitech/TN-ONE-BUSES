/**
 * Add-a-bus page:
 * - Auth gate with a clean sign-in prompt
 * - Pre-fill from URL params
 * - Unlimited intermediate stops and daily trip timings
 * - Live route preview + fare / stop / trip counters
 * - Client-side photo validation and previews
 * - Inline alerts and toasts (no alert())
 */
document.addEventListener("DOMContentLoaded", async () => {
  const authGate = document.getElementById("auth-gate");
  const formCard = document.getElementById("report-form-card");
  const gateLogin = document.getElementById("auth-gate-login");
  const topbarAuth = document.querySelector("[data-auth-slot]");

  const status = await TNAuth.getStatus();
  if (topbarAuth) TNAuth.renderTopbarAuth(topbarAuth, status);

  if (!status.authenticated) {
    authGate.hidden = false;
    formCard.hidden = true;
    if (gateLogin) gateLogin.href = TNAuth.loginUrl("/report");
    return;
  }

  authGate.hidden = true;
  formCard.hidden = false;

  const form = document.getElementById("report-form");
  const alertBox = document.getElementById("form-alert");
  const submitBtn = document.getElementById("submit-btn");
  const resetBtn = document.getElementById("reset-btn");

  const busNameInput = document.getElementById("bus-name-input");
  const busNumberInput = document.getElementById("bus-number-input");
  const operatorSelect = document.getElementById("operator-select");
  const busTypeSelect = document.getElementById("bus-type-select");
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

  const previewTitle = document.getElementById("preview-title");
  const previewSub = document.getElementById("preview-sub");
  const previewTimeline = document.getElementById("preview-timeline");
  const previewFare = document.getElementById("preview-fare");
  const previewCount = document.getElementById("preview-count");
  const previewTrips = document.getElementById("preview-trips");

  const fm = (v) => (v ? TNUI.formatTimeAmPm(v) : "");

  // Pre-fill from URL params (redirected from Home / Search)
  const params = new URLSearchParams(window.location.search);
  const fromParam = params.get("from") || params.get("origin");
  const toParam = params.get("to") || params.get("destination");
  if (fromParam) boardingInput.value = fromParam;
  if (toParam) destinationInput.value = toParam;

  TNUI.attachAutocomplete(boardingInput);
  TNUI.attachAutocomplete(destinationInput);

  /* ------------------------------------------------------------- AM/PM pills */
  function bindAmpm(input, pill) {
    if (!input || !pill) return;
    const sync = () => {
      pill.textContent = input.value ? fm(input.value) : "--:-- --";
    };
    input.addEventListener("input", () => {
      sync();
      renderPreview();
    });
    input.addEventListener("change", sync);
    sync();
  }

  bindAmpm(boardingTimeInput, boardingTimeAmpm);
  bindAmpm(destinationTimeInput, destinationTimeAmpm);

  /* --------------------------------------------------------- intermediate stops */
  let intermediateSpots = [];

  function renderIntermediateSpots() {
    intermediateSpotsList.innerHTML = "";
    intermediateSpots.forEach((spot, idx) => {
      const card = document.createElement("div");
      card.className = "spot-card intermediate-spot";
      card.innerHTML = `
        <div class="spot-header">
          <span class="spot-marker-badge">Stop ${idx + 2}</span>
          <button type="button" class="spot-remove-btn" title="Remove this stop" aria-label="Remove stop ${idx + 2}">&times;</button>
        </div>
        <div class="spot-inputs-row">
          <input class="spot-name-input" type="text" placeholder="e.g. Town Hall" autocomplete="off" autocapitalize="words" spellcheck="false" value="${TNUI.escapeHtml(spot.stop || "")}" />
          <div class="spot-time-wrap">
            <input class="spot-time-input" type="time" aria-label="Stop ${idx + 2} passing time" value="${TNUI.escapeHtml(spot.time || "")}" />
            <span class="timing-ampm-pill">${spot.time ? fm(spot.time) : "--:-- --"}</span>
          </div>
        </div>
      `;

      const nameInput = card.querySelector(".spot-name-input");
      const timeInput = card.querySelector(".spot-time-input");
      const pill = card.querySelector(".timing-ampm-pill");
      const removeBtn = card.querySelector(".spot-remove-btn");

      TNUI.attachAutocomplete(nameInput);

      nameInput.addEventListener("input", (event) => {
        intermediateSpots[idx].stop = event.target.value;
        renderPreview();
      });

      const syncTime = () => {
        intermediateSpots[idx].time = timeInput.value;
        pill.textContent = timeInput.value ? fm(timeInput.value) : "--:-- --";
        renderPreview();
      };
      timeInput.addEventListener("input", syncTime);
      timeInput.addEventListener("change", syncTime);

      removeBtn.addEventListener("click", () => {
        intermediateSpots.splice(idx, 1);
        renderIntermediateSpots();
        renderPreview();
      });

      intermediateSpotsList.appendChild(card);
    });
  }

  if (addSpotBtn) {
    addSpotBtn.addEventListener("click", () => {
      intermediateSpots.push({ stop: "", time: "" });
      renderIntermediateSpots();
      const inputs = intermediateSpotsList.querySelectorAll(".spot-name-input");
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
  }

  /* ------------------------------------------------------------ trip timings */
  let additionalTimings = [];

  function renderAdditionalTimings() {
    timingsContainer.innerHTML = "";
    additionalTimings.forEach((value, idx) => {
      const row = document.createElement("div");
      row.className = "timing-row";

      const input = document.createElement("input");
      input.type = "time";
      input.value = value;
      input.setAttribute("aria-label", `Additional trip ${idx + 1} departure time`);

      const badge = document.createElement("span");
      badge.className = "timing-ampm-pill";
      badge.textContent = value ? fm(value) : "--:-- --";

      const sync = () => {
        additionalTimings[idx] = input.value;
        badge.textContent = input.value ? fm(input.value) : "--:-- --";
        renderPreview();
      };
      input.addEventListener("input", sync);
      input.addEventListener("change", sync);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "timing-remove-btn";
      removeBtn.innerHTML = "&times;";
      removeBtn.title = "Remove timing";
      removeBtn.setAttribute("aria-label", `Remove trip ${idx + 1}`);
      removeBtn.addEventListener("click", () => {
        additionalTimings.splice(idx, 1);
        renderAdditionalTimings();
        renderPreview();
      });

      row.appendChild(input);
      row.appendChild(badge);
      row.appendChild(removeBtn);
      timingsContainer.appendChild(row);
    });
  }

  if (addTimingBtn) {
    addTimingBtn.addEventListener("click", () => {
      additionalTimings.push("");
      renderAdditionalTimings();
      const inputs = timingsContainer.querySelectorAll('input[type="time"]');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
  }

  /* -------------------------------------------------------------- live preview */
  function collectStops() {
    const stops = [];
    const start = boardingInput.value.trim();
    const end = destinationInput.value.trim();
    if (start) stops.push({ stop: start, time: fm(boardingTimeInput.value), kind: "start" });
    intermediateSpots.forEach((s) => {
      if (s.stop && s.stop.trim()) stops.push({ stop: s.stop.trim(), time: fm(s.time), kind: "mid" });
    });
    if (end) stops.push({ stop: end, time: fm(destinationTimeInput.value), kind: "end" });
    return stops;
  }

  function renderPreview() {
    const stops = collectStops();
    const name = busNameInput.value.trim();

    previewTitle.textContent = name || "Your route";
    previewSub.textContent = stops.length >= 2
      ? `${stops[0].stop} → ${stops[stops.length - 1].stop}`
      : "Fill in the details to preview how riders will see this bus.";

    if (!stops.length) {
      previewTimeline.innerHTML = `<p class="preview-empty">No stops added yet.</p>`;
    } else {
      previewTimeline.innerHTML = stops.map((s) => `
        <div class="preview-stop">
          <span class="preview-stop__name">${TNUI.escapeHtml(s.stop)}</span>
          ${s.time ? `<span class="preview-stop__time">${TNUI.escapeHtml(s.time)}</span>` : ""}
        </div>
      `).join("");
    }

    const fare = parseFloat(fareInput.value);
    previewFare.innerHTML = `${TNUI.icon("bus")} ${Number.isFinite(fare) && fare >= 0 ? `₹${fare}` : "Fare —"}`;
    previewCount.innerHTML = `${TNUI.icon("mapPin")} ${stops.length} stop${stops.length === 1 ? "" : "s"}`;

    const trips = 1 + additionalTimings.filter((t) => t && t.trim()).length;
    previewTrips.innerHTML = `${TNUI.icon("clock")} ${trips} trip${trips === 1 ? "" : "s"}`;
  }

  [busNameInput, fareInput].forEach((el) => el.addEventListener("input", renderPreview));

  /* ------------------------------------------------------------------- photos */
  let selectedFiles = [];
  let objectUrls = [];

  function renderPhotoPreviews() {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
    objectUrls = [];
    photoPreviews.innerHTML = "";

    selectedFiles.forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "preview-item";

      const url = URL.createObjectURL(file);
      objectUrls.push(url);

      const img = document.createElement("img");
      img.src = url;
      img.alt = file.name;
      item.appendChild(img);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "preview-remove";
      removeBtn.innerHTML = "&times;";
      removeBtn.title = "Remove photo";
      removeBtn.setAttribute("aria-label", `Remove photo ${index + 1}`);
      removeBtn.addEventListener("click", () => {
        selectedFiles.splice(index, 1);
        renderPhotoPreviews();
      });
      item.appendChild(removeBtn);

      photoPreviews.appendChild(item);
    });
  }

  if (photoInput) {
    photoInput.addEventListener("change", () => {
      const files = Array.from(photoInput.files || []);
      for (const file of files) {
        if (!file.type || !file.type.startsWith("image/")) {
          showAlert("Only image files (JPG, PNG, WEBP) are allowed.", "error");
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          showAlert(`${file.name} is larger than 5 MB. Please choose a smaller photo.`, "error");
          continue;
        }
        if (selectedFiles.length >= 8) {
          showAlert("You can attach up to 8 photos.", "error");
          break;
        }
        selectedFiles.push(file);
      }
      photoInput.value = "";
      renderPhotoPreviews();
    });
  }

  window.addEventListener("beforeunload", () => {
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  /* ------------------------------------------------------------------- submit */
  async function uploadPhotos() {
    if (!selectedFiles.length) return [];
    const data = new FormData();
    selectedFiles.forEach((file) => data.append("photos", file));

    const send = async (token) =>
      fetch(`${TNOne.API_BASE}/api/buses/photos`, {
        method: "POST",
        credentials: "include",
        headers: token ? { "X-CSRF-Token": token } : {},
        body: data,
      });

    let res = await send(await TNOne.getCsrfToken());
    if (res.status === 403) {
      res = await send(await TNOne.getCsrfToken(true));
    }
    if (!res.ok) throw new Error("Photo upload is unavailable right now.");
    const json = await res.json();
    return (json && json.data && json.data.urls) || [];
  }

  function validate() {
    const busName = busNameInput.value.trim();
    const boardingStop = boardingInput.value.trim();
    const destinationStop = destinationInput.value.trim();
    const fare = parseFloat(fareInput.value);

    if (!busName) return { message: "Please enter the bus name.", field: busNameInput };
    if (!boardingStop) return { message: "Please specify the starting spot.", field: boardingInput };
    if (!boardingTimeInput.value) return { message: "Please enter the departure time from the starting spot.", field: boardingTimeInput };
    if (!destinationStop) return { message: "Please specify the destination.", field: destinationInput };
    if (boardingStop.toLowerCase() === destinationStop.toLowerCase()) {
      return { message: "Starting spot and destination cannot be the same.", field: destinationInput };
    }

    const names = [boardingStop, ...intermediateSpots.map((s) => s.stop.trim()).filter(Boolean), destinationStop]
      .map((s) => s.toLowerCase());
    const duplicate = names.find((name, index) => names.indexOf(name) !== index);
    if (duplicate) {
      return { message: "A stop is listed more than once. Please remove the duplicate.", field: intermediateSpotsList };
    }

    if (!Number.isFinite(fare) || fare < 0) {
      return { message: "Please enter a valid fare amount (₹0 or greater).", field: fareInput };
    }
    return null;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert();

    const invalid = validate();
    if (invalid) {
      showAlert(invalid.message, "error");
      if (invalid.field && invalid.field.focus) invalid.field.focus();
      return;
    }

    const busName = busNameInput.value.trim();
    const busNumber = busNumberInput.value.trim() || null;
    const operator = operatorSelect.value || null;
    const busType = busTypeSelect.value || "Government";
    const boardingStop = boardingInput.value.trim();
    const destinationStop = destinationInput.value.trim();
    const fare = parseFloat(fareInput.value);

    const validIntermediate = intermediateSpots.filter((s) => s.stop && s.stop.trim());
    const spots = [
      { stop: boardingStop, time: fm(boardingTimeInput.value) },
      ...validIntermediate.map((s) => ({
        stop: s.stop.trim(),
        time: s.time ? fm(s.time) : "",
      })),
      { stop: destinationStop, time: destinationTimeInput.value ? fm(destinationTimeInput.value) : "" },
    ];

    const tripTimings = [fm(boardingTimeInput.value)];
    additionalTimings.forEach((t) => {
      if (t && t.trim()) tripTimings.push(fm(t.trim()));
    });
    const uniqueTimings = Array.from(new Set(tripTimings));

    const [hours, minutes] = boardingTimeInput.value.split(":").map(Number);
    const now = new Date();
    const boardingDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

    TNUI.setButtonLoading(submitBtn, true, "Adding bus…");

    let uploadedUrls = [];
    if (selectedFiles.length) {
      try {
        uploadedUrls = await uploadPhotos();
      } catch (_) {
        // Photo storage is optional; the report is still valuable without photos.
      }
    }

    const payload = {
      bus_name: busName,
      bus_number: busNumber,
      operator,
      bus_type: busType,
      boarding_stop: boardingStop,
      destination_stop: destinationStop,
      boarding_time: boardingDate.toISOString(),
      bus_fare: fare,
      bus_timings: uniqueTimings.join(", "),
      spots,
      stop_timings: JSON.stringify(spots),
      photos: uploadedUrls,
      notes: `Fare: ₹${fare}. Route: ${spots.map((s) => s.stop + (s.time ? ` (${s.time})` : "")).join(" → ")}`,
    };

    try {
      await TNOne.post("/api/reports", payload);
      resetForm();
      showAlert("Bus added! Taking you to the matching routes…", "success");
      TNUI.toast("Bus added successfully", { type: "success" });
      setTimeout(() => {
        window.location.href = `/search?from=${encodeURIComponent(boardingStop)}&to=${encodeURIComponent(destinationStop)}`;
      }, 1400);
    } catch (error) {
      showAlert(error.message || "Failed to add bus. Please try again.", "error");
      TNUI.setButtonLoading(submitBtn, false);
    }
  });

  resetBtn.addEventListener("click", resetForm);

  function resetForm() {
    form.reset();
    intermediateSpots = [];
    renderIntermediateSpots();
    additionalTimings = [];
    renderAdditionalTimings();
    selectedFiles = [];
    renderPhotoPreviews();
    hideAlert();
    TNUI.setButtonLoading(submitBtn, false);
    applyAmpmDefaults();
    renderPreview();
  }

  function applyAmpmDefaults() {
    if (boardingTimeAmpm) boardingTimeAmpm.textContent = "--:-- --";
    if (destinationTimeAmpm) destinationTimeAmpm.textContent = "--:-- --";
  }

  /* ------------------------------------------------------------------ alerts */
  function showAlert(message, type) {
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type} show`;
    alertBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideAlert() {
    alertBox.className = "alert";
    alertBox.textContent = "";
  }

  // First paint
  applyAmpmDefaults();
  renderPreview();
});
