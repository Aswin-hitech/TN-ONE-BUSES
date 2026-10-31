/**
 * Auth state helper shared across pages: checks session status, renders
 * the sign-in button / avatar menu in the top bar, and handles logout.
 * The authenticated identity always comes from the server session.
 */
const TNAuth = (() => {
  let cachedStatus = null;
  let pendingStatus = null;

  const LOCAL_ONLY = /^\/(?!\/)/;

  function safeRedirect(raw, fallback = "/") {
    if (!raw || typeof raw !== "string") return fallback;
    let path = raw.trim();
    if (!path) return fallback;
    if (/^https?:\/\//i.test(path)) {
      try {
        const url = new URL(path);
        path = url.pathname + url.search + url.hash;
      } catch (_) {
        return fallback;
      }
    }
    if (!LOCAL_ONLY.test(path)) return fallback;
    if (/[\u0000-\u001f\\]/.test(path)) return fallback;
    if (/^\/\/+/.test(path)) return fallback;
    if (/^\/(login|register)(\/|\?|#|$)/i.test(path)) return fallback;
    return path;
  }

  function currentPath() {
    return (window.location.pathname || "/") + (window.location.search || "");
  }

  function loginUrl(next) {
    const target = safeRedirect(next || currentPath(), "/");
    return "/login?redirect=" + encodeURIComponent(target);
  }

  async function getStatus(force) {
    if (!force && cachedStatus) return cachedStatus;
    if (pendingStatus) return pendingStatus;
    pendingStatus = (async () => {
      try {
        const res = await TNOne.get("/api/auth/status");
        cachedStatus = res && res.data ? res.data : { authenticated: false };
      } catch (_) {
        cachedStatus = cachedStatus || { authenticated: false };
      } finally {
        pendingStatus = null;
      }
      return cachedStatus;
    })();
    return pendingStatus;
  }

  function icon(name, cls) {
    return window.TNUI && TNUI.icon ? TNUI.icon(name, cls) : "";
  }

  function initialsOf(name) {
    if (window.TNUI && TNUI.initials) return TNUI.initials(name);
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }

  function createAvatarPlaceholder(name, className) {
    const div = document.createElement("div");
    div.className = "avatar-placeholder" + (className ? " " + className : "");
    div.textContent = initialsOf(name);
    div.setAttribute("aria-hidden", "true");
    return div;
  }

  function avatarNode(user) {
    if (user && user.profile_picture) {
      const img = document.createElement("img");
      img.className = "avatar";
      img.src = user.profile_picture;
      img.alt = user.name || "Account";
      img.referrerPolicy = "no-referrer";
      img.onerror = () => img.replaceWith(createAvatarPlaceholder(user.name));
      return img;
    }
    return createAvatarPlaceholder(user && user.name);
  }

  function menuItem({ href, label, iconName, danger, onClick }) {
    const node = document.createElement(href ? "a" : "button");
    node.className = "auth-menu__item" + (danger ? " danger" : "");
    if (href) node.href = href;
    else node.type = "button";
    node.innerHTML = icon(iconName) + "<span></span>";
    node.querySelector("span").textContent = label;
    if (onClick) node.addEventListener("click", onClick);
    return node;
  }

  function buildMenu(user) {
    const menu = document.createElement("div");
    menu.className = "auth-menu";
    menu.setAttribute("role", "menu");
    menu.hidden = true;

    const head = document.createElement("div");
    head.className = "auth-menu__head";
    const name = document.createElement("div");
    name.className = "auth-menu__name";
    name.textContent = (user && user.name) || "Your account";
    const email = document.createElement("div");
    email.className = "auth-menu__email";
    email.textContent = (user && user.email) || "";
    head.append(name, email);

    const logout = menuItem({
      label: "Sign out",
      iconName: "logout",
      danger: true,
      onClick: async (event) => {
        event.preventDefault();
        logout.disabled = true;
        try {
          await TNOne.post("/api/auth/logout");
        } catch (_) {
          /* session may already be gone */
        }
        cachedStatus = null;
        window.location.href = "/";
      },
    });

    menu.append(
      head,
      menuItem({ href: "/profile", label: "My profile", iconName: "user" }),
      menuItem({ href: "/report", label: "Add a bus", iconName: "plus" }),
      menuItem({ href: "/about", label: "About TN FOR BUS", iconName: "info" }),
      logout
    );
    return menu;
  }

  function renderTopbarAuth(container, status) {
    if (!container) return;
    container.innerHTML = "";
    container.classList.add("auth-slot", "auth-wrap");

    const user = status && status.authenticated ? status.user : null;
    if (!user) {
      const btn = document.createElement("a");
      btn.className = "btn btn-secondary btn-sm btn-login-map";
      btn.href = loginUrl();
      btn.innerHTML = icon("user") + "<span>Sign in</span>";
      container.appendChild(btn);
      return;
    }

    const avatarBtn = document.createElement("button");
    avatarBtn.type = "button";
    avatarBtn.className = "avatar-btn";
    avatarBtn.setAttribute("aria-haspopup", "menu");
    avatarBtn.setAttribute("aria-expanded", "false");
    avatarBtn.setAttribute("aria-label", "Account menu");
    avatarBtn.appendChild(avatarNode(user));

    const menu = buildMenu(user);
    container.append(avatarBtn, menu);

    function closeMenu() {
      menu.hidden = true;
      avatarBtn.setAttribute("aria-expanded", "false");
    }

    function openMenu() {
      menu.hidden = false;
      avatarBtn.setAttribute("aria-expanded", "true");
      const first = menu.querySelector(".auth-menu__item");
      if (first) first.focus({ preventScroll: true });
    }

    avatarBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (menu.hidden) openMenu();
      else closeMenu();
    });

    document.addEventListener("click", (event) => {
      if (!menu.hidden && !menu.contains(event.target) && event.target !== avatarBtn) {
        closeMenu();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !menu.hidden) {
        closeMenu();
        avatarBtn.focus();
      }
    });
  }

  async function renderAll(selector = "[data-auth-slot]") {
    const slots = Array.from(document.querySelectorAll(selector));
    if (!slots.length) return null;
    const status = await getStatus(true);
    slots.forEach((slot) => renderTopbarAuth(slot, status));
    return status;
  }

  async function requireLoginOrRedirect(redirectTo) {
    const status = await getStatus();
    if (!status.authenticated) {
      window.location.href = loginUrl(redirectTo || currentPath());
      return null;
    }
    return status.user;
  }

  function clearCache() {
    cachedStatus = null;
  }

  return {
    getStatus,
    renderTopbarAuth,
    renderAll,
    requireLoginOrRedirect,
    createAvatarPlaceholder,
    safeRedirect,
    loginUrl,
    clearCache,
  };
})();

window.TNAuth = TNAuth;
