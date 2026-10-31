/**
 * Profile page:
 * - Signed-in identity, avatar, contribution stats
 * - Contributions rendered with the shared ride card (expandable route)
 * - Change-request inbox for route owners (accept / reject)
 */
document.addEventListener("DOMContentLoaded", async () => {
  const status = await TNAuth.getStatus();
  TNAuth.renderTopbarAuth(document.querySelector("[data-auth-slot]"), status);

  if (!status.authenticated || !status.user) {
    window.location.href = TNAuth.loginUrl("/profile");
    return;
  }

  const user = status.user;
  const avatarWrap = document.getElementById("profile-avatar-container");
  const nameEl = document.getElementById("profile-name");
  const emailEl = document.getElementById("profile-email");
  const logoutBtn = document.getElementById("logout-btn");
  const historyEl = document.getElementById("history-container");
  const requestsEl = document.getElementById("change-requests-container");

  const busCountEl = document.getElementById("report-count");
  const stopCountEl = document.getElementById("stop-count");
  const requestCountEl = document.getElementById("request-count");
  const tabContribCount = document.getElementById("tab-contrib-count");
  const tabRequestCount = document.getElementById("tab-request-count");

  let buses = [];
  let pendingRequests = [];

  nameEl.textContent = user.name || user.username || "Community commuter";
  emailEl.textContent = user.email || "Signed in with Google";

  renderAvatar();

  logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    try {
      await TNOne.post("/api/auth/logout");
    } catch (_) {
      /* session may already be gone */
    }
    TNAuth.clearCache();
    window.location.href = "/";
  });

  /* ------------------------------------------------------------------- tabs */
  const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
  const panels = {
    contributions: document.getElementById("panel-contributions"),
    requests: document.getElementById("panel-requests"),
  };

  function selectTab(name) {
    tabButtons.forEach((btn) => {
      const active = btn.dataset.tab === name;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    Object.entries(panels).forEach(([key, panel]) => {
      if (!panel) return;
      panel.hidden = key !== name;
      if (key === name) {
        panel.classList.remove("tab-panel");
        void panel.offsetWidth;
        panel.classList.add("tab-panel");
      }
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => selectTab(btn.dataset.tab));
  });

  /* ------------------------------------------------------------- avatar */
  function renderAvatar() {
    avatarWrap.innerHTML = "";
    if (user.profile_picture) {
      const img = document.createElement("img");
      img.className = "profile-avatar-large";
      img.src = user.profile_picture;
      img.alt = user.name || "Your avatar";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => {
        img.replaceWith(TNAuth.createAvatarPlaceholder(user.name || user.username, "profile-avatar-large"));
      };
      avatarWrap.appendChild(img);
    } else {
      avatarWrap.appendChild(TNAuth.createAvatarPlaceholder(user.name || user.username, "profile-avatar-large"));
    }
  }

  /* ------------------------------------------------------ contributions */
  async function loadContributions() {
    historyEl.setAttribute("aria-busy", "true");
    historyEl.innerHTML = TNUI.skeletonCards(2);
    try {
      const res = await TNOne.get("/api/users/me/reports");
      buses = Array.isArray(res.data) ? res.data : [];
      updateStats();
      renderContributions();
    } catch (_) {
      historyEl.innerHTML = TNUI.stateBox({
        iconName: "alert",
        title: "Could not load your contributions",
        description: "Check your connection and try again.",
        action: `<button type="button" class="btn btn-secondary" id="retry-contributions">Try again</button>`,
      });
      const retry = document.getElementById("retry-contributions");
      if (retry) retry.addEventListener("click", loadContributions);
    } finally {
      historyEl.setAttribute("aria-busy", "false");
    }
  }

  function renderContributions() {
    if (!buses.length) {
      historyEl.innerHTML = TNUI.stateBox({
        iconName: "bus",
        title: "No contributions yet",
        description: "Add the first bus you know — your neighbours will thank you.",
        action: `<a class="btn btn-primary" href="/report">Add a bus</a>`,
      });
      return;
    }

    const cards = buses
      .map((bus, index) => TNUI.renderRideCard(TNUI.entryFromBus(bus), { index }))
      .join("");

    historyEl.innerHTML = `<div class="ride-list">${cards}</div>`;
  }

  function updateStats() {
    const stopTotal = buses.reduce((sum, bus) => {
      const spots = Array.isArray(bus.spots) ? bus.spots : [];
      return sum + spots.length;
    }, 0);

    busCountEl.textContent = buses.length;
    stopCountEl.textContent = stopTotal;
    tabContribCount.textContent = buses.length;

    requestCountEl.textContent = pendingRequests.length;
    tabRequestCount.textContent = pendingRequests.length;
  }

  /* ---------------------------------------------------- change requests */
  async function loadChangeRequests() {
    try {
      const res = await TNOne.get("/api/change-requests/pending");
      pendingRequests = Array.isArray(res.data) ? res.data : [];
    } catch (_) {
      pendingRequests = [];
    }
    updateStats();
    renderRequests();
  }

  function renderRequests() {
    if (!pendingRequests.length) {
      requestsEl.innerHTML = TNUI.stateBox({
        iconName: "mail",
        title: "No pending change requests",
        description: "When another rider suggests an edit to one of your routes, it appears here for review.",
        action: `<a class="btn btn-secondary" href="/search">Browse routes</a>`,
      });
      return;
    }

    const FIELD_LABELS = {
      bus_name: "Bus name",
      bus_number: "Bus number",
      bus_type: "Service type",
      operator: "Operator",
      start_stop: "From",
      destination_stop: "To",
      stop_timings: "Stops & timings",
      boarded_stops: "Via stops",
      bus_timings: "Bus timings",
      bus_fare: "Fare",
    };

    requestsEl.innerHTML = pendingRequests
      .map((cr, index) => {
        const busName = (cr.bus && cr.bus.bus_name) || `Bus #${cr.bus_id}`;
        const requester = (cr.requester && (cr.requester.name || cr.requester.username)) || "A rider";
        const date = cr.created_at ? TNUI.timeAgo(cr.created_at) : "";
        const payload = cr.payload || {};
        const rows = Object.entries(payload)
          .filter(([key]) => FIELD_LABELS[key])
          .map(([key, value]) => {
            const shown = Array.isArray(value) ? value.join(", ") : String(value ?? "");
            return `<div class="cr-diff__row">
              <span class="cr-diff__key">${TNUI.escapeHtml(FIELD_LABELS[key])}</span>
              <span class="cr-diff__val">${TNUI.escapeHtml(shown) || "—"}</span>
            </div>`;
          })
          .join("");

        return `<article class="cr-card" id="cr-card-${cr.id}" style="animation-delay:${Math.min(index * 50, 300)}ms">
          <div class="contrib-card__title">
            <span>${TNUI.escapeHtml(busName)}</span>
            <span class="count-pill">by ${TNUI.escapeHtml(requester)}</span>
          </div>
          <div class="contrib-card__route">Suggested ${date || "recently"}</div>
          <div class="cr-diff">${rows || `<div class="cr-diff__row"><span class="cr-diff__val">No field changes detected.</span></div>`}</div>
          <div class="form-actions" style="margin-top:12px">
            <button type="button" class="btn btn-ghost" data-action="reject" data-id="${cr.id}">Reject</button>
            <button type="button" class="btn btn-primary" data-action="accept" data-id="${cr.id}">Accept change</button>
          </div>
        </article>`;
      })
      .join("");

    requestsEl.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handleRequest(btn.dataset.action, btn.dataset.id, btn));
    });
  }

  async function handleRequest(action, id, trigger) {
    const card = document.getElementById(`cr-card-${id}`);
    if (!card) return;
    const buttons = card.querySelectorAll("button");
    buttons.forEach((btn) => (btn.disabled = true));
    TNUI.setButtonLoading(trigger, true, action === "accept" ? "Accepting…" : "Rejecting…");

    try {
      await TNOne.post(`/api/change-requests/${id}/${action}`);
      TNUI.toast(action === "accept" ? "Change accepted" : "Change rejected", { type: "success" });
      card.style.transition = "opacity .25s ease, transform .25s ease";
      card.style.opacity = "0";
      card.style.transform = "translateY(-6px)";
      setTimeout(() => {
        card.remove();
        pendingRequests = pendingRequests.filter((cr) => String(cr.id) !== String(id));
        updateStats();
        if (!pendingRequests.length) renderRequests();
        if (action === "accept") loadContributions();
      }, 250);
    } catch (error) {
      buttons.forEach((btn) => (btn.disabled = false));
      TNUI.setButtonLoading(trigger, false);
      TNUI.toast(error.message || "Action failed. Please try again.", { type: "error" });
    }
  }

  /* ------------------------------------------------------------------ init */
  const addStop = TNUI.initAddStopModal({
    onSaved: () => loadContributions(),
  });

  historyEl.addEventListener("click", (event) => {
    const trigger = event.target.closest(".btn-open-add-stop");
    if (!trigger) return;
    event.preventDefault();
    const bus = buses.find((item) => Number(item.id) === Number(trigger.dataset.busId));
    if (!bus) {
      TNUI.toast("Bus details are unavailable. Refresh and try again.", { type: "error" });
      return;
    }
    if (addStop) addStop.open(bus);
  });

  loadContributions();
  loadChangeRequests();
});
