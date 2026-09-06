/**
 * Profile page logic: shows the signed-in user's info and their report history.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const topbarAuth = document.getElementById("topbar-auth");
  const status = await TNAuth.getStatus();
  TNAuth.renderTopbarAuth(topbarAuth, status);

  if (!status.authenticated) {
    window.location.href = "login.html";
    return;
  }

  const user = status.user;
  document.getElementById("profile-avatar").src =
    user.profile_picture || "https://ui-avatars.com/api/?name=" + encodeURIComponent(user.name);
  document.getElementById("profile-name").textContent = user.name;
  document.getElementById("profile-email").textContent = user.email;

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await TNOne.post("/api/auth/logout");
    window.location.href = "index.html";
  });

  const historyContainer = document.getElementById("history-container");
  try {
    const res = await TNOne.get("/api/users/me/reports");
    const reports = res.data || [];
    if (!reports.length) {
      historyContainer.innerHTML = `<p class="empty-state">You haven't reported any buses yet.</p>`;
      return;
    }
    historyContainer.innerHTML = reports.map((r) => `
      <div class="bus-card">
        <p class="bus-title">${escapeHtml(r.bus.bus_name)}${r.bus.bus_number ? " " + escapeHtml(r.bus.bus_number) : ""}</p>
        <div class="route-line">
          ${escapeHtml(r.boarding_stop.stop_name)} <span class="arrow">\u2192</span> ${escapeHtml(r.destination_stop.stop_name)}
        </div>
        <div class="bus-sub">Reported ${new Date(r.reported_at).toLocaleString()}</div>
      </div>
    `).join("");
  } catch (err) {
    historyContainer.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
});
