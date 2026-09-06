/**
 * Profile page logic: displays signed-in user stats, avatar,
 * and contribution history from /api/users/me/reports.
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
  const reportCountEl = document.getElementById("report-count");
  const photoCountEl = document.getElementById("photo-count");
  const contribCountEl = document.getElementById("contrib-count");

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

  // Fetch user reports & contributions
  try {
    const res = await TNOne.get("/api/users/me/reports");
    const reports = (res.data || []);
    
    // Update stats
    reportCountEl.textContent = reports.length;
    let photoCount = 0;
    reports.forEach(r => {
      if (r.bus && r.bus.photos) photoCount += r.bus.photos.length;
    });
    photoCountEl.textContent = photoCount;
    contribCountEl.textContent = reports.length;

    if (!reports.length) {
      historyContainer.innerHTML = `
        <div class="state-box">
          <div class="state-icon">🚌</div>
          <h3 class="state-title">No contributions yet</h3>
          <p class="state-desc">Add your first bus and help commuters discover accurate schedules across Tamil Nadu.</p>
          <a href="report.html" class="btn-primary" style="display:inline-flex; width:auto;">＋ Add a Bus</a>
        </div>`;
      return;
    }

    const cardsHtml = reports.map((r) => {
      const bus = r.bus || {};
      const title = escapeHtml(bus.bus_name || "Bus");
      const busNum = bus.bus_number ? `<span class="bus-number-badge">${escapeHtml(bus.bus_number)}</span>` : "";
      const from = r.boarding_stop ? escapeHtml(r.boarding_stop.stop_name) : "Origin";
      const to = r.destination_stop ? escapeHtml(r.destination_stop.stop_name) : "Destination";
      const dateStr = new Date(r.reported_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
      const notes = r.notes ? `<div style="font-size:12px; color:var(--color-text-secondary); margin-top:6px;">${escapeHtml(r.notes)}</div>` : "";

      return `
        <div class="bus-card">
          <div class="bus-card-top">
            <div class="bus-identity">
              <div class="bus-name-row">
                <span class="bus-name">🚌 ${title}</span>
                ${busNum}
              </div>
            </div>
            <div style="font-size:12px; color:var(--color-text-secondary);">${dateStr}</div>
          </div>
          <div class="bus-route-path">${from} <span class="arrow">→</span> ${to}</div>
          ${notes}
        </div>`;
    }).join("");

    historyContainer.innerHTML = `<div class="bus-list">${cardsHtml}</div>`;
  } catch (err) {
    historyContainer.innerHTML = `
      <div class="state-box">
        <p class="state-title">Unable to load contributions</p>
        <p class="state-desc">${escapeHtml(err.message || "Please check back later.")}</p>
      </div>`;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
});
