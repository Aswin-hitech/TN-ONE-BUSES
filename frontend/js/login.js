/**
 * Sign-in page: Google OAuth handoff, password login, safe redirects.
 */
document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const nextPath = TNAuth.safeRedirect(params.get("redirect"), "/");

  const status = await TNAuth.getStatus();
  if (status && status.authenticated) {
    window.location.href = nextPath;
    return;
  }

  const message = document.getElementById("auth-message");
  const form = document.getElementById("auth-form");
  const submitBtn = document.getElementById("submit-auth-btn");
  const googleBtn = document.getElementById("google-signin-btn");
  const googleNote = document.getElementById("google-note");
  const registerLink = document.getElementById("register-link");
  const togglePassword = document.getElementById("toggle-password");
  const passwordInput = document.getElementById("password");

  if (registerLink) {
    registerLink.href = "/register?redirect=" + encodeURIComponent(nextPath);
  }

  if (togglePassword) {
    togglePassword.innerHTML = TNUI.icon("eye");
    togglePassword.addEventListener("click", () => {
      const show = passwordInput.type === "password";
      passwordInput.type = show ? "text" : "password";
      togglePassword.innerHTML = TNUI.icon(show ? "eyeOff" : "eye");
      togglePassword.setAttribute("aria-label", show ? "Hide password" : "Show password");
      togglePassword.setAttribute("aria-pressed", show ? "true" : "false");
    });
  }

  const errorCopy = {
    oauth_not_configured: "Google sign-in isn’t configured on this server yet. Use your username and password below.",
    oauth_failed: "Google sign-in didn’t complete. If the app is in testing mode, add your Google account as a test user — or sign in below.",
    access_denied: "Google sign-in was cancelled. You can try again or use your password.",
    session_expired: "Your sign-in session expired. Please try again.",
  };
  const errorKey = params.get("error");
  if (errorKey && errorCopy[errorKey]) {
    showMessage(errorCopy[errorKey], "error");
  }

  // Probe Google configuration so we never send riders into a dead OAuth redirect.
  try {
    const config = await TNOne.get("/api/auth/config");
    const enabled = config && config.data ? config.data.google_enabled !== false : true;
    if (!enabled) disableGoogle();
  } catch (_) {
    /* keep the button enabled if the probe fails */
  }

  function disableGoogle() {
    if (!googleBtn) return;
    googleBtn.disabled = true;
    googleBtn.setAttribute("aria-disabled", "true");
    if (googleNote) googleNote.hidden = false;
  }

  googleBtn.addEventListener("click", () => {
    googleBtn.classList.add("is-loading");
    googleBtn.disabled = true;
    const target = `${TNOne.API_BASE}/api/auth/login?next=${encodeURIComponent(nextPath)}`;
    window.location.href = target;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage();

    const username = document.getElementById("username").value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showMessage("Please enter your username and password.", "error");
      (username ? passwordInput : document.getElementById("username")).focus();
      return;
    }

    TNUI.setButtonLoading(submitBtn, true, "Signing in…");

    try {
      await TNOne.post("/api/auth/password", { username, password });
      TNAuth.clearCache();
      window.location.href = nextPath;
    } catch (error) {
      showMessage(error.message || "Invalid username or password.", "error");
      TNUI.setButtonLoading(submitBtn, false);
      passwordInput.focus();
      passwordInput.select();
    }
  });

  function showMessage(text, type = "error") {
    message.textContent = text;
    message.className = `alert alert-${type} show`;
  }

  function hideMessage() {
    message.className = "alert";
    message.textContent = "";
  }
});
