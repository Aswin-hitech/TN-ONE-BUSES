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
  const destinationInput = document.getElementById("destination-stop-input");
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

  // Timings Management
  let timings = [""];

  function renderTimings() {
    timingsContainer.innerHTML = "";
    timings.forEach((val, idx) => {
      const row = document.createElement("div");
      row.className = "timing-row";

      const input = document.createElement("input");
      input.type = "time";
      input.required = idx === 0;
      input.value = val;
      input.addEventListener("change", (e) => {
        timings[idx] = e.target.value;
      });

      row.appendChild(input);

      if (timings.length > 1) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "timing-remove-btn";
        removeBtn.innerHTML = "×";
        removeBtn.title = "Remove timing";
        removeBtn.addEventListener("click", () => {
          timings.splice(idx, 1);
          renderTimings();
        });
        row.appendChild(removeBtn);
      }

      timingsContainer.appendChild(row);
    });
  }

  addTimingBtn.addEventListener("click", () => {
    timings.push("");
    renderTimings();
  });

  renderTimings();

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

  function renderPhotoPreviews() {
    photoPreviews.innerHTML = "";
    selectedFiles.forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "preview-item";

      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
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

  // Form Submission
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();

    const busName = busNameInput.value.trim();
    const busNumber = busNumberInput.value.trim() || null;
    const operator = operatorSelect.value || null;
    const boardingStop = boardingInput.value.trim();
    const destinationStop = destinationInput.value.trim();
    const fare = parseFloat(fareInput.value);

    // Validation
    if (!busName) {
      showAlert("Please enter the bus name.", "error");
      busNameInput.focus();
      return;
    }
    if (!boardingStop) {
      showAlert("Please specify the boarding location.", "error");
      boardingInput.focus();
      return;
    }
    if (!destinationStop) {
      showAlert("Please specify the destination location.", "error");
      destinationInput.focus();
      return;
    }
    if (boardingStop.toLowerCase() === destinationStop.toLowerCase()) {
      showAlert("Boarding stop and destination cannot be identical.", "error");
      return;
    }
    if (isNaN(fare) || fare < 0) {
      showAlert("Please enter a valid fare amount (₹0 or greater).", "error");
      fareInput.focus();
      return;
    }

    // Filter, validate, and sort timings
    const validTimings = timings.filter(Boolean);
    if (!validTimings.length) {
      showAlert("Please enter at least one bus timing.", "error");
      return;
    }

    // Remove duplicates and sort chronologically
    const uniqueTimings = Array.from(new Set(validTimings)).sort();

    // Prepare ISO boarding time for current date
    const firstTime = uniqueTimings[0];
    const [hh, mm] = firstTime.split(":").map(Number);
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
      notes: `Fare: ₹${fare}. Timings: ${uniqueTimings.join(", ")}`,
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Adding bus...";

    try {
      const res = await TNOne.post("/api/reports", payload);
      showAlert("Bus added successfully! Thank you for helping your community.", "success");
      form.reset();
      timings = [""];
      selectedFiles = [];
      renderTimings();
      renderPhotoPreviews();
      setTimeout(() => {
        window.location.href = `search.html?from=${encodeURIComponent(boardingStop)}&to=${encodeURIComponent(destinationStop)}`;
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
            .map((s) => `<div class="autocomplete-item" data-name="${s.stop_name}">${s.stop_name}</div>`)
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
