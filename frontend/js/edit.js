/**
 * Suggest-an-edit page:
 * - Loads a bus route and pre-fills the correction form
 * - Owners save immediately; other riders submit a change request
 * - Stops are edited as one-per-line text and parsed into structured spots
 */
document.addEventListener("DOMContentLoaded", async () => {
  const status = await TNAuth.getStatus();
  TNAuth.renderTopbarAuth(document.querySelector("[data-auth-slot]"), status);

  const authGate = document.getElementById("auth-gate");
  const formCard = document.getElementById("edit-form-card");
  const loadingState = document.getElementById("loading-state");
  const errorState = document.getElementById("load-error");
  const errorTitle = document.getElementById("load-error-title");
  const errorDesc = document.getElementById("load-error-desc");
  const loginLink = document.getElementById("login-link");

  if (!status.authenticated) {
    authGate.hidden = false;
    if (loginLink) loginLink.href = TNAuth.loginUrl(window.location.pathname + window.location.search);
    return;
  }

  const query = new URLSearchParams(window.location.search);
  const busId = query.get("id");

  if (!busId || !/^\d+$/.test(busId)) {
    showLoadError("No route selected", "Open a route from search results or your profile to suggest a correction.");
    return;
  }

  authGate.hidden = true;
  loadingState.hidden = false;

  const form = document.getElementById("edit-bus-form");
  const alertBox = document.getElementById("edit-alert");
  const submitBtn = document.getElementById("save-edit-btn");
  const cancelBtn = document.getElementById("cancel-edit-btn");
  const sentPanel = document.getElementById("request-sent-panel");
  const sentTitle = document.getElementById("request-result-title");
  const sentDesc = document.getElementById("request-result-desc");
  const backToRoute = document.getElementById("back-to-route");
  const headingText = document.getElementById("edit-heading-text");
  const summaryEl = document.getElementById("edit-route-summary");

  const nameInput = document.getElementById("edit-bus-name");
  const numberInput = document.getElementById("edit-bus-number");
  const typeSelect = document.getElementById("edit-bus-type");
  const operatorInput = document.getElementById("edit-operator");
  const startInput = document.getElementById("edit-start-stop");
  const destinationInput = document.getElementById("edit-destination-stop");
  const stopsInput = document.getElementById("edit-stop-timings");
  const boardedInput = document.getElementById("edit-boarded-stops");
  const timingsInput = document.getElementById("edit-bus-timings");
  const fareInput = document.getElementById("edit-bus-fare");

  let loadedBus = null;

  try {
    const response = await TNOne.get(`/api/buses/${busId}`);
    loadedBus = response.data;
  } catch (error) {
    loadingState.hidden = true;
    showLoadError(
      "Could not load this route",
      error.status === 404 ? "This bus no longer exists." : error.message || "Please try again in a moment."
    );
    return;
  }

  loadingState.hidden = true;
  formCard.hidden = false;

  fillForm(loadedBus);

  function fillForm(bus) {
    nameInput.value = bus.bus_name || "";
    numberInput.value = bus.bus_number || "";
    typeSelect.value = bus.bus_type || "Government";
    operatorInput.value = bus.operator && bus.operator !== bus.bus_type ? bus.operator : "";
    startInput.value = bus.start_stop || "";
    destinationInput.value = bus.destination_stop || "";
    boardedInput.value = bus.boarded_stops || "";
    timingsInput.value = (bus.timings || []).map((t) => TNOne.formatTimeAmPm(t)).join(", ");
    fareInput.value = bus.bus_fare ?? "";

    const spots = Array.isArray(bus.spots) ? bus.spots : [];
    stopsInput.value = spots
      .map((spot) => `${spot.stop}${spot.time ? ` @ ${TNOne.formatTimeAmPm(spot.time)}` : ""}`)
      .join("\n");

    const owner = Boolean(bus.is_owner);
    headingText.textContent = owner ? "Edit this route" : "Suggest a correction";
    submitBtn.textContent = owner ? "Save changes" : "Send suggestion";
    summaryEl.textContent = owner
      ? "You own this route, so your changes apply immediately."
      : "This route belongs to another rider. Your suggestion will be sent to them for review.";

    backToRoute.href = `/search?from=${encodeURIComponent(bus.start_stop || "")}&to=${encodeURIComponent(bus.destination_stop || "")}`;
  }

  function parseStopLines(raw) {
    return raw
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(.*?)(?:\s+[@\-–]\s+|\s*\()\s*(\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?)\)?\s*$/i);
        if (match) {
          return { stop: match[1].trim(), time: TNOne.formatTimeAmPm(match[2]) };
        }
        return { stop: line.replace(/[()]$/g, "").trim(), time: "" };
      })
      .filter((spot) => spot.stop);
  }

  function normalizeTimings(raw) {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => TNOne.formatTimeAmPm(part));
  }

  function showAlert(message, type = "error") {
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type} show`;
  }

  function hideAlert() {
    alertBox.className = "alert";
    alertBox.textContent = "";
  }

  function showLoadError(title, description) {
    loadingState.hidden = true;
    formCard.hidden = true;
    errorTitle.textContent = title;
    errorDesc.textContent = description;
    errorState.hidden = false;
  }

  cancelBtn.addEventListener("click", () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/search";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert();

    const busName = nameInput.value.trim();
    const startStop = startInput.value.trim();
    const destinationStop = destinationInput.value.trim();
    const stops = parseStopLines(stopsInput.value);
    const timings = normalizeTimings(timingsInput.value);
    const fare = fareInput.value === "" ? null : parseFloat(fareInput.value);

    if (!busName) {
      showAlert("Please enter a bus name.");
      nameInput.focus();
      return;
    }
    if (!stops.length && (!startStop || !destinationStop)) {
      showAlert("Please list the route stops, or fill in both starting spot and destination.");
      stopsInput.focus();
      return;
    }
    if (startStop && destinationStop && startStop.toLowerCase() === destinationStop.toLowerCase()) {
      showAlert("Starting spot and destination cannot be the same.");
      destinationInput.focus();
      return;
    }
    if (fare !== null && (!Number.isFinite(fare) || fare < 0)) {
      showAlert("Please enter a valid fare amount.");
      fareInput.focus();
      return;
    }

    const payload = {
      bus_id: Number(busId),
      bus_name: busName,
      bus_number: numberInput.value.trim() || null,
      bus_type: typeSelect.value,
      operator: operatorInput.value.trim() || null,
      start_stop: stops.length ? stops[0].stop : startStop,
      destination_stop: stops.length ? stops[stops.length - 1].stop : destinationStop,
      bus_timings: timings.join(", "),
    };

    if (stops.length) {
      payload.spots = stops;
      payload.stop_timings = stops;
    } else {
      payload.boarded_stops = boardedInput.value.trim() || null;
      payload.stop_timings = "";
    }
    if (fare !== null) payload.bus_fare = fare;

    TNUI.setButtonLoading(submitBtn, true, loadedBus && loadedBus.is_owner ? "Saving…" : "Sending…");

    try {
      const response = await TNOne.post("/api/change-requests", payload);
      const autoApplied = Boolean(response.data && response.data.auto_applied);

      sentTitle.textContent = autoApplied ? "Changes saved" : "Suggestion sent";
      sentDesc.textContent = autoApplied
        ? "This route has been updated for everyone."
        : "The route owner will review your suggestion. It appears in the app once approved.";
      sentPanel.style.display = "block";
      sentPanel.classList.add("tab-panel");
      document.getElementById("edit-heading").style.display = "none";
      form.style.display = "none";
      TNUI.toast(autoApplied ? "Route updated" : "Suggestion sent", { type: "success" });
    } catch (error) {
      showAlert(error.message || "Failed to submit the change. Please try again.");
      TNUI.setButtonLoading(submitBtn, false);
    }
  });
});
