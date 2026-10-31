/**
 * Light / Dark theme switch for TN FOR BUS.
 * The active theme is applied to <html data-theme> and persisted in
 * localStorage("tn-one-theme"). Pages include a tiny inline bootstrap in
 * <head> so the correct theme paints before first render.
 */
(() => {
  const STORAGE_KEY = "tn-one-theme";
  const root = document.documentElement;

  function stored() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  function preferred() {
    const saved = stored();
    if (saved === "dark" || saved === "light") return saved;
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (_) {
      return "light";
    }
  }

  function icon(name, cls) {
    if (window.TNUI && TNUI.icon) return TNUI.icon(name, cls);
    return name === "sun" ? "\u2600" : "\u263E";
  }

  function apply(theme, persist = true) {
    const next = theme === "dark" ? "dark" : "light";
    root.dataset.theme = next;
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (_) {
        /* storage disabled — theme still applies for this page */
      }
    }
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(next === "dark"));
      btn.setAttribute("aria-label", next === "dark" ? "Switch to light mode" : "Switch to dark mode");
      btn.title = next === "dark" ? "Light mode" : "Dark mode";
    });
    document.dispatchEvent(new CustomEvent("tn:themechange", { detail: { theme: next } }));
    return next;
  }

  function current() {
    return root.dataset.theme === "dark" ? "dark" : "light";
  }

  function toggle() {
    return apply(current() === "dark" ? "light" : "dark");
  }

  function createToggle() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.dataset.themeToggle = "";
    btn.innerHTML =
      '<span class="icon-sun">' + icon("sun") + "</span>" +
      '<span class="icon-moon">' + icon("moon") + "</span>";
    btn.addEventListener("click", toggle);
    return btn;
  }

  function mount() {
    const slots = Array.from(
      document.querySelectorAll(".theme-mount, [data-theme-mount]")
    ).filter((slot) => !slot.querySelector("[data-theme-toggle]"));

    slots.forEach((slot) => slot.appendChild(createToggle()));

    // Fallback: no explicit slot on the page — attach near the account slot
    // or in the page's top bar so the control is still reachable.
    if (!slots.length && !document.querySelector("[data-theme-toggle]")) {
      const fallback =
        document.querySelector(".topbar-actions") ||
        document.querySelector(".map-top-actions") ||
        document.querySelector(".auth-card");
      if (fallback) fallback.appendChild(createToggle());
    }

    apply(current());
  }

  window.TNTheme = { apply, toggle, current };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue) apply(event.newValue);
  });

  // Apply immediately (before DOMContentLoaded) so the attribute is correct
  // even on pages that don't include the inline head bootstrap.
  const saved = stored();
  apply(saved === "dark" || saved === "light" ? saved : preferred(), Boolean(saved));
})();
