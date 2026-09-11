/**
 * Auth state helper shared across pages: checks session status, renders
 * the login/avatar control in the top bar, and handles logout.
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
    if (status && status.authenticated && status.user) {
      const link = document.createElement("a");
      link.href = "/profile";
      link.title = "View Profile";

      if (status.user.profile_picture) {
        const img = document.createElement("img");
        img.className = "avatar";
        img.src = status.user.profile_picture;
        img.alt = status.user.name || "User";
        img.onerror = () => {
          img.replaceWith(createAvatarPlaceholder(status.user.name));
        };
        link.appendChild(img);
      } else {
        link.appendChild(createAvatarPlaceholder(status.user.name));
      }
      container.appendChild(link);
    } else {
      const btn = document.createElement("button");
      btn.className = "btn-login";
      btn.textContent = "Sign in";
      btn.onclick = () => {
        window.location.href = "/login";
      };
      container.appendChild(btn);
    }
  }

  function createAvatarPlaceholder(name) {
    const div = document.createElement("div");
    div.className = "avatar-placeholder";
    div.textContent = name ? name.trim().charAt(0).toUpperCase() : "👤";
    return div;
  }

  async function requireLoginOrRedirect(redirectTo) {
    if (!redirectTo) {
      const localPath = (window.location.pathname || "/") + (window.location.search || "");
      redirectTo = "/login?redirect=" + encodeURIComponent(localPath);
    }
    const status = await getStatus();
    if (!status.authenticated) {
      window.location.href = redirectTo;
      return null;
    }
    return status.user;
  }

  return { getStatus, renderTopbarAuth, requireLoginOrRedirect, createAvatarPlaceholder };
})();
