import { login, session } from "./api.js";
const form = document.getElementById("login-form"),
  error = document.getElementById("login-error"),
  submit = form.querySelector("button");
session()
  .then(() => location.replace("/dashboard.html"))
  .catch(() => {});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  submit.disabled = true;
  submit.textContent = "Signing in…";
  try {
    await login(form.elements.email.value, form.elements.password.value);
    location.assign("/dashboard.html");
  } catch (err) {
    error.textContent = err.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "Sign in";
  }
});
