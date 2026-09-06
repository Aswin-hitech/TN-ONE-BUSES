/**
 * Light / Dark theme switcher for THE TN ONE
 */
document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("tn-one-theme") || "light";
  const controls = document.createElement("div");
  controls.className = "theme-controls";
  controls.setAttribute("aria-label", "Theme Selector");
  controls.innerHTML = `
    <button type="button" data-theme-choice="light">Light</button>
    <button type="button" data-theme-choice="dark">Dark</button>
  `;

  // Attach to designated theme slot, topbar-actions, topbar, or top of register/auth card
  const target = document.querySelector(".theme-mount") ||
                 document.querySelector(".topbar-actions") ||
                 document.querySelector(".topbar") ||
                 document.querySelector(".register-card") ||
                 document.querySelector(".auth-card");

  if (target && (target.classList.contains("register-card") || target.classList.contains("auth-card"))) {
    // If mounting directly inside an auth card without a slot, prepend so it sits at the very top
    target.insertBefore(controls, target.firstChild);
  } else if (target) {
    target.appendChild(controls);
  } else {
    document.body.appendChild(controls);
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tn-one-theme", theme);
    controls.querySelectorAll("button").forEach((button) => {
      button.classList.toggle("active", button.dataset.themeChoice === theme);
    });
  }

  controls.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (button) setTheme(button.dataset.themeChoice);
  });

  setTheme(savedTheme === "dark" ? "dark" : "light");
});
