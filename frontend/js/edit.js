document.addEventListener("DOMContentLoaded", async () => {
  const topbarAuth = document.getElementById("topbar-auth");
  const auth = await TNAuth.getStatus();
  TNAuth.renderTopbarAuth(topbarAuth, auth);

  const authGate = document.getElementById("auth-gate");
  const formCard = document.getElementById("edit-form-card");

  if (!auth.authenticated) {
    authGate.style.display = "block";
    formCard.style.display = "none";
    
    // Set redirect to return here
    const loginLink = document.getElementById("login-link");
    const localPath = (window.location.pathname || "/") + (window.location.search || "");
    loginLink.href = `/login?redirect=${encodeURIComponent(localPath)}`;
    return;
  }
  
  authGate.style.display = "none";
  formCard.style.display = "block";

  // Parse ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const busId = urlParams.get("id");
  if (!busId) {
    alert("No Bus ID provided.");
    window.location.href = "/";
    return;
  }

  const loadingState = document.getElementById("loading-state");
  const form = document.getElementById("edit-bus-form");
  const editAlert = document.getElementById("edit-alert");
  const submitBtn = document.getElementById("save-edit-btn");
  const requestSentPanel = document.getElementById("request-sent-panel");
  const requestResultTitle = document.getElementById("request-result-title");
  const requestResultDesc = document.getElementById("request-result-desc");

  const nameInput = document.getElementById("edit-bus-name");
  const numInput = document.getElementById("edit-bus-number");
  const typeSelect = document.getElementById("edit-bus-type");
  const opInput = document.getElementById("edit-operator");
  const startInput = document.getElementById("edit-start-stop");
  const destInput = document.getElementById("edit-destination-stop");
  const spotsInput = document.getElementById("edit-stop-timings");
  const boardedInput = document.getElementById("edit-boarded-stops");
  const timingsInput = document.getElementById("edit-bus-timings");
  const fareInput = document.getElementById("edit-bus-fare");
  const idInput = document.getElementById("edit-bus-id");

  function showAlert(msg, isError = true) {
    editAlert.className = `alert ${isError ? 'alert-error' : 'alert-success'}`;
    editAlert.textContent = msg;
    editAlert.style.display = "block";
  }

  function hideAlert() {
    editAlert.style.display = "none";
  }

  function showRequestSentPanel(autoApplied) {
    form.style.display = "none";
    if (autoApplied) {
      requestResultTitle.textContent = "Changes Saved!";
      requestResultDesc.textContent = "Your changes have been applied to the route immediately.";
    } else {
      requestResultTitle.textContent = "Request Sent!";
      requestResultDesc.textContent = "Your suggested changes have been sent to the route owner for review. They will appear once approved.";
    }
    requestSentPanel.style.display = "block";
  }

  // Load Bus Data
  try {
    const res = await TNOne.get(`/api/buses/${busId}`);
    const bus = res.data;
    
    idInput.value = bus.id;
    nameInput.value = bus.bus_name || "";
    numInput.value = bus.bus_number || "";
    typeSelect.value = bus.bus_type || "Government";
    opInput.value = bus.operator && bus.operator !== bus.bus_type ? bus.operator : "";
    startInput.value = bus.start_stop || "";
    destInput.value = bus.destination_stop || "";
    
    // Format stop timings for input box
    if (bus.stop_timings && Array.isArray(bus.stop_timings)) {
      spotsInput.value = bus.stop_timings.map(s => {
        let n = s.stop || s.stop_name || "";
        let t = s.time || "";
        return t ? `${n} (${t})` : n;
      }).join(", ");
    } else {
      spotsInput.value = "";
    }
    
    boardedInput.value = bus.boarded_stops || "";
    timingsInput.value = bus.bus_timings || "";
    fareInput.value = bus.bus_fare || "";

    loadingState.style.display = "none";
    form.style.display = "block";
  } catch (err) {
    loadingState.style.display = "none";
    alert("Could not load bus details: " + err.message);
  }

  // Submit — POST to /api/change-requests instead of PUT
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";

    const payload = {
      bus_id: parseInt(busId, 10),
      bus_name: nameInput.value.trim(),
      bus_number: numInput.value.trim() || null,
      bus_type: typeSelect.value,
      operator: opInput.value.trim() || typeSelect.value,
      start_stop: startInput.value.trim(),
      destination_stop: destInput.value.trim(),
      stop_timings: spotsInput.value.trim(),
      boarded_stops: boardedInput.value.trim(),
      bus_timings: timingsInput.value.trim(),
      bus_fare: parseFloat(fareInput.value),
    };

    try {
      const res = await TNOne.post(`/api/change-requests`, payload);
      showRequestSentPanel(res.data && res.data.auto_applied);
    } catch (err) {
      showAlert(err.message || "Failed to submit change request.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Request Change";
    }
  });
});
