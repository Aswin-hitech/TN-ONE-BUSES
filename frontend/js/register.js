/**
 * Registration page: validation, Google sign-up handoff, password toggles.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const nextPath = TNAuth.safeRedirect(params.get("redirect"), "/");

  const status = await TNAuth.getStatus();
  if (status && status.authenticated) {
    window.location.href = nextPath;
    return;
  }

  const form = document.getElementById("register-form");
  const alertBox = document.getElementById("register-alert");
  const submitBtn = document.getElementById("submit-register-btn");
  const googleBtn = document.getElementById("google-signup-btn");
  const googleNote = document.getElementById("google-note");
  const loginLink = document.getElementById("login-link");
  const togglePassword = document.getElementById("toggle-password");
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirm-password");
  const terms = document.getElementById("terms");

  if (loginLink) loginLink.href = "/login?redirect=" + encodeURIComponent(nextPath);

  if (togglePassword) {
    togglePassword.innerHTML = TNUI.icon("eye");
    togglePassword.addEventListener("click", () => {
      const show = passwordInput.type === "password";
      passwordInput.type = show ? "text" : "password";
      confirmInput.type = show ? "text" : "password";
      togglePassword.innerHTML = TNUI.icon(show ? "eyeOff" : "eye");
      togglePassword.setAttribute("aria-label", show ? "Hide password" : "Show password");
      togglePassword.setAttribute("aria-pressed", show ? "true" : "false");
    });
  }

  try {
    const config = await TNOne.get("/api/auth/config");
    const enabled = config && config.data ? config.data.google_enabled !== false : true;
    if (!enabled) {
      googleBtn.disabled = true;
      googleBtn.setAttribute("aria-disabled", "true");
      if (googleNote) googleNote.hidden = false;
    }
  } catch (_) {
    /* keep Google available if the probe fails */
  }

  googleBtn.addEventListener("click", () => {
    googleBtn.classList.add("is-loading");
    googleBtn.disabled = true;
    window.location.href = `${TNOne.API_BASE}/api/auth/login?next=${encodeURIComponent(nextPath)}`;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideAlert();

    const name = document.getElementById("name").value.trim();
    const username = document.getElementById("username").value.trim().toLowerCase();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const phone = document.getElementById("phone").value.trim();
    const password = passwordInput.value;
    const confirm = confirmInput.value;

    if (name.length < 2) {
      return fail("Please enter your full name.", "name");
    }
    if (!/^[a-z0-9_.]{3,30}$/.test(username)) {
      return fail("Username must be 3–30 characters using letters, numbers, dots or underscores.", "username");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return fail("Please enter a valid email address.", "email");
    }
    if (!/^\+?[0-9\s\-()]{7,20}$/.test(phone)) {
      return fail("Please enter a valid phone number.", "phone");
    }
    if (password.length < 8) {
      return fail("Password must be at least 8 characters.", "password");
    }
    if (password.length > 128) {
      return fail("Password cannot be longer than 128 characters.", "password");
    }
    if (password !== confirm) {
      return fail("Passwords do not match.", "confirm-password");
    }
    if (!terms.checked) {
      return fail("Please accept the community guidelines to continue.", "terms");
    }

    TNUI.setButtonLoading(submitBtn, true, "Creating account…");

    try {
      await TNOne.post("/api/auth/register", { name, username, email, phone, password });
      TNAuth.clearCache();
      alertBox.className = "alert alert-success show";
      alertBox.textContent = "Account created. Taking you to the map…";
      TNUI.toast("Welcome to TN FOR BUS", { type: "success" });
      setTimeout(() => {
        window.location.href = nextPath;
      }, 700);
    } catch (error) {
      showAlert(error.message || "Registration failed. Please try again.", "error");
      TNUI.setButtonLoading(submitBtn, false);
    }
  });

  function fail(message, fieldId) {
    showAlert(message, "error");
    const field = document.getElementById(fieldId);
    if (field && field.focus) field.focus();
    return false;
  }

  function showAlert(message, type) {
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type} show`;
  }

  function hideAlert() {
    alertBox.className = "alert";
    alertBox.textContent = "";
  }
});
