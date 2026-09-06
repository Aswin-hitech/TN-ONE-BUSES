/**
 * Auth state helper shared across pages: checks session status, renders
 * the login/avatar control in the top bar, and wires up login/logout.
 */
const TNAuth = (() => {
  async function getStatus() {
    try {
      const res = await TNOne.get("/api/auth/status");
      return res.data;
    } catch (_) {
      return { authenticated: false };
    }
  }

  function renderTopbarAuth(container, status) {
    if (!container) return;
    container.innerHTML = "";
    if (status.authenticated) {
      const link = document.createElement("a");
      link.href = "profile.html";
      const img = document.createElement("img");
      img.className = "avatar";
      img.src = status.user.profile_picture || "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSEonC0Ow-K24Jc7Z1Vpi-bcBLDqJoJSeGwfD30gyXOyuf-e3EXnEBPxDFh&s=10";
      img.alt = status.user.name;
      link.appendChild(img);
      container.appendChild(link);
    } else {
      const btn = document.createElement("button");
      btn.className = "btn-login";
      btn.textContent = "Sign in";
      btn.onclick = () => { window.location.href = `${TNOne.API_BASE}/api/auth/login`; };
      container.appendChild(btn);
    }
  }

  async function requireLoginOrRedirect(redirectTo = "login.html") {
    const status = await getStatus();
    if (!status.authenticated) {
      window.location.href = redirectTo;
      return null;
    }
    return status.user;
  }

  return { getStatus, renderTopbarAuth, requireLoginOrRedirect };
})();
