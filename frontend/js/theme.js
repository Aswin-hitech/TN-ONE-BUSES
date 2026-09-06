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

  // Attach to topbar-actions or topbar or floating header
  const target = document.querySelector(".topbar-actions") || document.querySelector(".topbar") || document.body;
  target.appendChild(controls);

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
