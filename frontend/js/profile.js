/**
 * Profile page logic: displays signed-in user stats, avatar,
 * and contribution history from /api/users/me/reports.
 * Blank if no contributions, else displays contributions with an Edit feature.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const topbarAuth = document.getElementById("topbar-auth");
  const status = await TNAuth.getStatus();
  TNAuth.renderTopbarAuth(topbarAuth, status);

  if (!status || !status.authenticated || !status.user) {
    window.location.href = "login.html";
    return;
  }

  const user = status.user;
  const avatarWrapper = document.getElementById("profile-avatar-container");
  const nameEl = document.getElementById("profile-name");
  const emailEl = document.getElementById("profile-email");
  const logoutBtn = document.getElementById("logout-btn");
  const historyContainer = document.getElementById("history-container");
  const contribHeader = document.getElementById("contributions-header");
  const reportCountEl = document.getElementById("report-count");
  const photoCountEl = document.getElementById("photo-count");
  const contribCountEl = document.getElementById("contrib-count");

  // Modal elements
  const editModal = document.getElementById("edit-bus-modal");
  const editForm = document.getElementById("edit-bus-form");
  const editAlert = document.getElementById("edit-modal-alert");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");
  const saveEditBtn = document.getElementById("save-edit-btn");

  // Populate user info
  nameEl.textContent = user.name || user.username || "Community Commuter";
  emailEl.textContent = user.email || `${user.username}@local.tnone`;

  // Render Avatar (clean placeholder if no photo or broken URL)
  if (user.profile_picture) {
    const img = document.createElement("img");
    img.src = user.profile_picture;
    img.className = "profile-avatar-large";
    img.alt = user.name || "User";
    img.onerror = () => {
      img.replaceWith(createLargePlaceholder(user.name || user.username));
    };
    avatarWrapper.innerHTML = "";
    avatarWrapper.appendChild(img);
  } else {
    avatarWrapper.innerHTML = "";
    avatarWrapper.appendChild(createLargePlaceholder(user.name || user.username));
  }

  function createLargePlaceholder(name) {
    const div = document.createElement("div");
    div.className = "profile-avatar-large";
    div.textContent = name ? name.trim().charAt(0).toUpperCase() : "👤";
    return div;
  }

  // Logout handler
  logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = "Signing out...";
    try {
      await TNOne.post("/api/auth/logout");
    } catch (_) {}
    window.location.href = "index.html";
  });

  let userBuses = [];

  // Fetch user reports & contributions
  async function loadUserContributions() {
    try {
      const res = await TNOne.get("/api/users/me/reports");
      userBuses = res.data || [];

      // Update stats counters
      reportCountEl.textContent = userBuses.length;
      contribCountEl.textContent = userBuses.length;
      photoCountEl.textContent = 0;

      // Requirement 3: MUST BE COMPLETELY BLANK IF NO CONTRIBUTIONS
      if (!userBuses || userBuses.length === 0) {
        historyContainer.innerHTML = "";
        if (contribHeader) contribHeader.style.display = "none";
        return;
      }

      // If contributions exist, show the header and render cards
      if (contribHeader) contribHeader.style.display = "flex";
      renderContributionCards(userBuses);
    } catch (err) {
      historyContainer.innerHTML = "";
      if (contribHeader) contribHeader.style.display = "none";
    }
  }

  function renderContributionCards(buses) {
    const cardsHtml = buses.map((bus) => {
      const title = escapeHtml(bus.bus_name || "Bus");
      const busNum = bus.bus_number ? `<span class="bus-number-badge">${escapeHtml(bus.bus_number)}</span>` : "";
      const op = [bus.operator, bus.bus_type].filter(Boolean).map(escapeHtml).join(" · ");
      const from = escapeHtml(bus.start_stop || "Origin");
      const to = escapeHtml(bus.destination_stop || "Destination");
      const fareText = bus.bus_fare ? `₹${bus.bus_fare}` : "";
      const dateStr = bus.created_at ? new Date(bus.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "";

      let timingsHtml = "";
      if (bus.timings && bus.timings.length > 0) {
        const ampmList = bus.timings.map(t => formatTimeAmPm(t));
        timingsHtml = `<div style="font-size:12px; font-weight:700; color:var(--color-primary); margin-top:6px;">🕒 Timings: ${escapeHtml(ampmList.join(", "))}</div>`;
      } else if (bus.bus_timings) {
        timingsHtml = `<div style="font-size:12px; font-weight:700; color:var(--color-primary); margin-top:6px;">🕒 Timings: ${escapeHtml(formatTimeAmPm(bus.bus_timings))}</div>`;
      }

      let viaHtml = "";
      if (bus.boarded_stops) {
        viaHtml = `<div style="font-size:12px; color:var(--color-text-secondary); margin-top:3px;">Via: ${escapeHtml(bus.boarded_stops)}</div>`;
      }

      // Spots with Timing Timeline
      let spotsTimelineHtml = "";
      if (bus.spots && Array.isArray(bus.spots) && bus.spots.length > 0) {
        const items = bus.spots.map((sp, sIdx) => {
          const isStart = sIdx === 0;
          const isDest = sIdx === bus.spots.length - 1;
          const typeClass = isStart ? "start" : (isDest ? "dest" : "intermediate");
          const spotName = escapeHtml(sp.stop || "");
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

        spotsTimelineHtml = `
          <div class="spots-route-timeline" style="margin: 8px 0;">
            <div class="timeline-header">
              <span>📍 Spots &amp; Passing Timings</span>
            </div>
            <div class="spots-scroll-wrap">
              ${items}
            </div>
          </div>`;
      }

      return `
        <div class="bus-card" id="bus-card-${bus.id}">
          <div class="bus-card-top">
            <div class="bus-identity">
              <div class="bus-name-row">
                <span class="bus-name">🚌 ${title}</span>
                ${busNum}
              </div>
              ${op ? `<div style="font-size:12px; color:var(--color-text-secondary); margin-top:2px;">${op}</div>` : ""}
            </div>
            <div style="text-align:right;">
              ${fareText ? `<div class="bus-fare" style="font-size:15px; font-weight:800; color:var(--color-primary);">${fareText}</div>` : ""}
              <div style="font-size:11px; color:var(--color-text-secondary); margin-top:2px;">${dateStr}</div>
            </div>
          </div>

          <div class="bus-route-path" style="margin-top:6px;">${from} <span class="arrow">→</span> ${to}</div>
          ${viaHtml}
          ${spotsTimelineHtml}
          ${timingsHtml}

          <div style="display:flex; justify-content:flex-end; margin-top:10px; padding-top:8px; border-top:1px solid var(--color-border-light);">
            <button type="button" class="btn-edit-bus btn-secondary" data-id="${bus.id}" style="padding:4px 12px; font-size:12px; height:32px; font-weight:700;">
              ✏️ Edit Details
            </button>
          </div>
        </div>`;
    }).join("");

    historyContainer.innerHTML = `<div class="bus-list">${cardsHtml}</div>`;

    // Attach click listeners to edit buttons
    document.querySelectorAll(".btn-edit-bus").forEach((btn) => {
      btn.addEventListener("click", () => {
        const busId = parseInt(btn.getAttribute("data-id"), 10);
        const bus = userBuses.find(b => b.id === busId);
        if (bus) openEditModal(bus);
      });
    });
  }

  // Open Edit Modal with Bus Details
  function openEditModal(bus) {
    hideModalAlert();
    document.getElementById("edit-bus-id").value = bus.id;
    document.getElementById("edit-bus-name").value = bus.bus_name || "";
    document.getElementById("edit-bus-number").value = bus.bus_number || "";
    document.getElementById("edit-bus-type").value = bus.bus_type || "Government";
    document.getElementById("edit-operator").value = bus.operator || "";
    document.getElementById("edit-start-stop").value = bus.start_stop || "";
    document.getElementById("edit-destination-stop").value = bus.destination_stop || "";
    document.getElementById("edit-boarded-stops").value = bus.boarded_stops || "";
    
    // Format spots with timing for editing
    let spotTimingsVal = "";
    if (bus.spots && bus.spots.length > 0) {
      spotTimingsVal = bus.spots.map(s => s.stop + (s.time ? ` (${formatTimeAmPm(s.time)})` : "")).join(", ");
    }
    const editStopTimings = document.getElementById("edit-stop-timings");
    if (editStopTimings) editStopTimings.value = spotTimingsVal;

    // Format timings to clean AM/PM for editing
    let timingsVal = "";
    if (bus.timings && bus.timings.length > 0) {
      timingsVal = bus.timings.map(t => formatTimeAmPm(t)).join(", ");
    } else if (bus.bus_timings) {
      timingsVal = bus.bus_timings;
    }
    document.getElementById("edit-bus-timings").value = timingsVal;
    document.getElementById("edit-bus-fare").value = bus.bus_fare !== undefined ? bus.bus_fare : 20;

    editModal.style.display = "flex";
  }


  function closeEditModal() {
    editModal.style.display = "none";
    hideModalAlert();
  }

  if (closeModalBtn) closeModalBtn.addEventListener("click", closeEditModal);
  if (cancelEditBtn) cancelEditBtn.addEventListener("click", closeEditModal);
  if (editModal) {
    editModal.addEventListener("click", (e) => {
      if (e.target === editModal) closeEditModal();
    });
  }

  // Submit Bus Edit Form
  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideModalAlert();

      const busId = document.getElementById("edit-bus-id").value;
      const busName = document.getElementById("edit-bus-name").value.trim();
      const busNumber = document.getElementById("edit-bus-number").value.trim();
      const busType = document.getElementById("edit-bus-type").value;
      const operator = document.getElementById("edit-operator").value.trim();
      const startStop = document.getElementById("edit-start-stop").value.trim();
      const destinationStop = document.getElementById("edit-destination-stop").value.trim();
      const stopTimings = document.getElementById("edit-stop-timings") ? document.getElementById("edit-stop-timings").value.trim() : "";
      const boardedStops = document.getElementById("edit-boarded-stops").value.trim();
      const busTimings = document.getElementById("edit-bus-timings").value.trim();
      const busFare = parseFloat(document.getElementById("edit-bus-fare").value) || 20;

      if (!busName) {
        showModalAlert("Please enter a bus name.", "error");
        return;
      }
      if (!startStop || !destinationStop) {
        showModalAlert("Start and destination stops are required.", "error");
        return;
      }

      saveEditBtn.disabled = true;
      saveEditBtn.textContent = "Saving...";

      try {
        const payload = {
          bus_name: busName,
          bus_number: busNumber,
          bus_type: busType,
          operator: operator || busType,
          start_stop: startStop,
          destination_stop: destinationStop,
          boarded_stops: boardedStops,
          stop_timings: stopTimings,
          bus_timings: busTimings,
          bus_fare: busFare,
        };


        const res = await TNOne.put(`/api/buses/${busId}`, payload);

        // Update local array
        const updatedBus = res.data;
        const idx = userBuses.findIndex(b => b.id === parseInt(busId, 10));
        if (idx !== -1) {
          userBuses[idx] = updatedBus;
        }

        closeEditModal();
        renderContributionCards(userBuses);
      } catch (err) {
        showModalAlert(err.message || "Failed to update bus details.", "error");
      } finally {
        saveEditBtn.disabled = false;
        saveEditBtn.textContent = "Save Changes";
      }
    });
  }

  function showModalAlert(msg, type = "error") {
    if (!editAlert) return;
    editAlert.textContent = msg;
    editAlert.className = `alert alert-${type}`;
    editAlert.style.display = "block";
  }

  function hideModalAlert() {
    if (!editAlert) return;
    editAlert.style.display = "none";
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Load contributions
  loadUserContributions();

  // ── Change Requests Inbox ──────────────────────────────────────────────────

  const crSection = document.getElementById("change-requests-section");
  const crContainer = document.getElementById("change-requests-container");
  const crBadge = document.getElementById("cr-badge");

  async function loadChangeRequests() {
    try {
      const res = await TNOne.get("/api/change-requests/pending");
      const requests = res.data || [];

      if (requests.length === 0) {
        if (crSection) crSection.style.display = "none";
        return;
      }

      if (crSection) crSection.style.display = "block";
      if (crBadge) crBadge.textContent = requests.length;
      renderChangeRequestCards(requests);
    } catch (_) {
      // User may have no owned buses — silently hide
      if (crSection) crSection.style.display = "none";
    }
  }

  function renderChangeRequestCards(requests) {
    const FIELD_LABELS = {
      bus_name: "Bus Name",
      bus_number: "Bus Number",
      bus_type: "Bus Type",
      operator: "Operator",
      start_stop: "From (Start)",
      destination_stop: "To (Destination)",
      stop_timings: "Spots & Timings",
      boarded_stops: "Via Stops",
      bus_timings: "Bus Timings",
      bus_fare: "Fare (₹)",
    };

    const html = requests.map((cr) => {
      const busName = escapeHtml((cr.bus && cr.bus.bus_name) || `Bus #${cr.bus_id}`);
      const requesterName = escapeHtml((cr.requester && cr.requester.name) || "Someone");
      const dateStr = cr.created_at
        ? new Date(cr.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
        : "";

      // Build diff rows from payload
      const payload = cr.payload || {};
      const diffRows = Object.entries(payload)
        .filter(([k]) => FIELD_LABELS[k])
        .map(([k, v]) => {
          const label = FIELD_LABELS[k] || k;
          const val = Array.isArray(v) ? v.join(", ") : String(v ?? "");
          return `<div style="display:flex; gap:8px; align-items:baseline; font-size:13px; padding:4px 0; border-bottom:1px solid var(--color-border-light);">
            <span style="font-weight:700; color:var(--color-text-secondary); min-width:120px;">${escapeHtml(label)}</span>
            <span style="color:var(--color-text);">${escapeHtml(val)}</span>
          </div>`;
        }).join("");

      return `
        <div class="bus-card" id="cr-card-${cr.id}" style="margin-bottom:12px;">
          <div class="bus-card-top">
            <div class="bus-identity">
              <div class="bus-name-row">
                <span class="bus-name">🚌 ${busName}</span>
              </div>
              <div style="font-size:12px; color:var(--color-text-secondary); margin-top:2px;">
                Suggested by <strong>${requesterName}</strong> · ${dateStr}
              </div>
            </div>
          </div>

          <div style="margin-top:10px; padding:8px; background:var(--color-surface); border-radius:var(--radius-sm); border:1px solid var(--color-border-light);">
            <div style="font-size:11px; font-weight:700; color:var(--color-text-secondary); margin-bottom:6px;">PROPOSED CHANGES</div>
            ${diffRows || '<span style="font-size:12px; color:var(--color-text-secondary);">No field changes detected.</span>'}
          </div>

          <div id="cr-alert-${cr.id}" class="alert" style="display:none; margin-top:8px;"></div>

          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px; padding-top:8px; border-top:1px solid var(--color-border-light);">
            <button type="button" class="btn-secondary cr-reject-btn" data-id="${cr.id}" style="padding:4px 14px; font-size:13px; height:34px;">
              ✗ Reject
            </button>
            <button type="button" class="btn-primary cr-accept-btn" data-id="${cr.id}" style="padding:4px 14px; font-size:13px; height:34px;">
              ✓ Accept
            </button>
          </div>
        </div>`;
    }).join("");

    crContainer.innerHTML = html;

    // Wire up accept buttons
    crContainer.querySelectorAll(".cr-accept-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const crId = btn.getAttribute("data-id");
        await handleCrAction(crId, "accept", btn);
      });
    });

    // Wire up reject buttons
    crContainer.querySelectorAll(".cr-reject-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const crId = btn.getAttribute("data-id");
        await handleCrAction(crId, "reject", btn);
      });
    });
  }

  async function handleCrAction(crId, action, triggerBtn) {
    const card = document.getElementById(`cr-card-${crId}`);
    const alertEl = document.getElementById(`cr-alert-${crId}`);
    const allBtns = card.querySelectorAll("button");

    allBtns.forEach(b => b.disabled = true);
    triggerBtn.textContent = action === "accept" ? "Accepting..." : "Rejecting...";

    try {
      await TNOne.post(`/api/change-requests/${crId}/${action}`);

      // Animate card out
      card.style.opacity = "0";
      card.style.transition = "opacity 0.3s";
      setTimeout(() => {
        card.remove();

        // Update badge
        const remaining = crContainer.querySelectorAll(".bus-card").length;
        if (crBadge) crBadge.textContent = remaining;
        if (remaining === 0 && crSection) crSection.style.display = "none";

        // Reload contributions if accepted (bus data changed)
        if (action === "accept") loadUserContributions();
      }, 350);
    } catch (err) {
      if (alertEl) {
        alertEl.className = "alert alert-error";
        alertEl.textContent = err.message || "Action failed. Please try again.";
        alertEl.style.display = "block";
      }
      allBtns.forEach(b => b.disabled = false);
      triggerBtn.textContent = action === "accept" ? "✓ Accept" : "✗ Reject";
    }
  }

  loadChangeRequests();
});
