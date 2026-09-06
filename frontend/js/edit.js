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
    loginLink.href = `login.html?redirect=${encodeURIComponent(window.location.href)}`;
    return;
  }
  
  authGate.style.display = "none";
  formCard.style.display = "block";

  // Parse ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const busId = urlParams.get("id");
  if (!busId) {
    alert("No Bus ID provided.");
    window.location.href = "index.html";
    return;
  }

  const loadingState = document.getElementById("loading-state");
  const form = document.getElementById("edit-bus-form");
  const editAlert = document.getElementById("edit-alert");
  const submitBtn = document.getElementById("save-edit-btn");

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

  // Submit Edit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert();
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    const payload = {
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
      await TNOne.put(`/api/buses/${busId}`, payload);
      showAlert("Changes saved successfully!", false);
      setTimeout(() => {
        history.back();
      }, 1000);
    } catch (err) {
      showAlert(err.message || "Failed to update bus details.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Changes";
    }
  });
});
