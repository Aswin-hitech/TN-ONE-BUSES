(() => {
  const savedTheme = localStorage.getItem("tn-one-theme") || "white";
  const controls = document.createElement("div");
  controls.className = "theme-controls";
  controls.setAttribute("aria-label", "Theme");
  controls.innerHTML = `
    <button type="button" data-theme-choice="white">White</button>
    <button type="button" data-theme-choice="dark">Dark</button>
  `;
  document.body.appendChild(controls);

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

  setTheme(savedTheme === "dark" ? "dark" : "white");
})();