document.addEventListener("DOMContentLoaded", async () => {
  const status = await TNAuth.getStatus();
  TNAuth.renderTopbarAuth(document.querySelector("[data-auth-slot]"), status);
});
