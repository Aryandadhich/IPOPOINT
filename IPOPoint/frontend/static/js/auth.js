/**
 * auth.js — login/register forms + token management + nav auth state
 *
 * Loaded on every page. On login/register pages it also wires up the forms.
 */

import { toast } from "./toast.js";
import { apiLogin, apiRegister, apiLogout, apiMe, apiAddIPO } from "./api.js";

// ── Token helpers ─────────────────────────────────────────────────────────────

export function getToken()  { return localStorage.getItem("ipo_token") || ""; }
export function getUser()   {
  try { return JSON.parse(localStorage.getItem("ipo_user") || "null"); }
  catch { return null; }
}
export function saveSession(token, user) {
  localStorage.setItem("ipo_token", token);
  localStorage.setItem("ipo_user",  JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem("ipo_token");
  localStorage.removeItem("ipo_user");
}

// ── Nav auth state ────────────────────────────────────────────────────────────

function updateNavAuth() {
  const user    = getUser();
  const guest   = document.getElementById("navGuest");
  const userEl  = document.getElementById("navUser");
  const nameEl  = document.getElementById("navName");
  const avatarEl= document.getElementById("navAvatar");

  if (user) {
    if (guest)  { guest.style.display  = "none"; }
    if (userEl) { userEl.style.display = "flex"; }
    if (nameEl)   nameEl.textContent   = user.name;
    if (avatarEl) avatarEl.textContent = user.name[0].toUpperCase();
  } else {
    if (guest)  { guest.style.display  = "flex"; }
    if (userEl) { userEl.style.display = "none"; }
  }
}

async function doLogout() {
  await apiLogout();
  clearSession();
  window.location.href = "/login";
}

// ── Login form ────────────────────────────────────────────────────────────────

function showErr(fieldId, msg) {
  const inp = document.getElementById(fieldId);
  const err = document.getElementById(fieldId + "Err");
  if (!inp || !err) return;
  inp.classList.add("error"); inp.classList.remove("valid", "success");
  err.querySelector("span:last-child").textContent = msg;
  err.classList.add("show");
}
function clearErr(fieldId) {
  const inp = document.getElementById(fieldId);
  const err = document.getElementById(fieldId + "Err");
  if (inp) inp.classList.remove("error");
  if (err) err.classList.remove("show");
}
function markOk(fieldId) {
  const inp = document.getElementById(fieldId);
  const err = document.getElementById(fieldId + "Err");
  if (inp) { inp.classList.remove("error"); inp.classList.add("valid"); }
  if (err) err.classList.remove("show");
}

function initLoginForm() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  // Live validation
  const emailInp = document.getElementById("email");
  const pwdInp   = document.getElementById("password");
  if (emailInp) {
    emailInp.addEventListener("blur", () => {
      const v = emailInp.value.trim();
      if (!v) showErr("email", "Email is required");
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) showErr("email", "Enter a valid email");
      else markOk("email");
    });
    emailInp.addEventListener("input", () => clearErr("email"));
  }
  if (pwdInp) {
    pwdInp.addEventListener("blur",  () => { if (!pwdInp.value) showErr("password", "Password is required"); else clearErr("password"); });
    pwdInp.addEventListener("input", () => clearErr("password"));
  }

  // Password toggle
  wirePwdToggle("password", "pwdToggle");

  // Forgot password
  const forgotLink = document.getElementById("forgotPwdLink");
  if (forgotLink) forgotLink.addEventListener("click", (e) => { e.preventDefault(); toast("Forgot password — coming soon", "inf"); });

  // Google button
  const googleBtn = document.getElementById("googleBtn");
  if (googleBtn) googleBtn.addEventListener("click", () => toast("Google login coming soon", "inf"));

  // Submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInp ? emailInp.value.trim()  : "";
    const pwd   = pwdInp   ? pwdInp.value           : "";

    let valid = true;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr("email", "Enter a valid email"); valid = false; }
    if (!pwd) { showErr("password", "Password is required"); valid = false; }
    if (!valid) return;

    const btn = document.getElementById("submitBtn");
    btn.innerHTML = '<span class="spin"></span>Logging in...';
    btn.disabled  = true;
    const genErr  = document.getElementById("generalErr");
    if (genErr) genErr.classList.remove("show");

    try {
      const { ok, data } = await apiLogin(email, pwd);
      if (!ok) {
        const errs = data.errors || {};
        if (errs.email)   showErr("email",    errs.email);
        if (errs.password)showErr("password", errs.password);
        if (errs.general && genErr) {
          document.getElementById("generalErrMsg").textContent = errs.general;
          genErr.classList.add("show");
        }
        return;
      }
      saveSession(data.token, data.user);
      form.style.display = "none";
      if (genErr) genErr.style.display = "none";
      const ss = document.getElementById("successState");
      if (ss) ss.style.display = "block";
      setTimeout(() => { window.location.href = "/tracker"; }, 1200);
    } catch {
      if (genErr) {
        document.getElementById("generalErrMsg").textContent = "Network error. Please try again.";
        genErr.classList.add("show");
      }
    } finally {
      btn.innerHTML = "Log in"; btn.disabled = false;
    }
  });

  // Auto-redirect if already logged in
  if (getToken()) {
    apiMe().then(({ ok }) => { if (ok) window.location.href = "/tracker"; }).catch(() => {});
  }
}

// ── Register form ─────────────────────────────────────────────────────────────

function checkStrength(v) {
  const reqs = [
    { id: "req-len",   test: /^.{8,}$/ },
    { id: "req-upper", test: /[A-Z]/ },
    { id: "req-num",   test: /[0-9]/ },
  ];
  let score = 0;
  reqs.forEach(r => {
    const met = r.test.test(v);
    if (met) score++;
    const el = document.getElementById(r.id);
    if (el) el.classList.toggle("met", met);
  });
  if (v.length > 12 && /[^A-Za-z0-9]/.test(v)) score = 4;

  const reqsEl = document.getElementById("pwdReqs");
  if (reqsEl) reqsEl.classList.toggle("show", v.length > 0);

  const bars   = ["sb1","sb2","sb3","sb4"];
  const colors = ["","#ef4444","#f59e0b","#2ea87e","#2ea87e"];
  const labels = ["","Weak","Fair","Strong","Very Strong"];
  bars.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.style.background = i < score ? colors[score] : "var(--border)";
  });
  const lbl = document.getElementById("strengthLabel");
  if (lbl) {
    lbl.textContent = v.length ? labels[score] : "";
    lbl.style.color = colors[score] || "var(--muted)";
  }
}

function initRegisterForm() {
  const form = document.getElementById("registerForm");
  if (!form) return;

  wirePwdToggle("password", "pwdToggle");
  wirePwdToggle("confirm",  "confirmToggle");

  const googleBtn = document.getElementById("googleBtn");
  if (googleBtn) googleBtn.addEventListener("click", () => toast("Google signup coming soon", "inf"));

  const pwdInp = document.getElementById("password");
  if (pwdInp) pwdInp.addEventListener("input", () => checkStrength(pwdInp.value));

  // Live validation
  const fields = ["name","email","password","confirm"];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("blur", () => validateRegisterField(id));
      el.addEventListener("input", () => clearErr(id));
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name    = (document.getElementById("name")    || {}).value?.trim()  || "";
    const email   = (document.getElementById("email")   || {}).value?.trim()  || "";
    const pwd     = (document.getElementById("password")|| {}).value          || "";
    const confirm = (document.getElementById("confirm") || {}).value          || "";
    const terms   = (document.getElementById("terms")   || {}).checked;

    let valid = true;
    if (!name  || name.length < 2)  { showErr("name",    "Name must be at least 2 characters"); valid = false; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showErr("email", "Enter a valid email"); valid = false; }
    if (!pwd   || pwd.length < 8)   { showErr("password","At least 8 characters required"); valid = false; }
    else if (!/[A-Z]/.test(pwd))    { showErr("password","At least one uppercase letter required"); valid = false; }
    else if (!/[0-9]/.test(pwd))    { showErr("password","At least one number required"); valid = false; }
    if (pwd && confirm !== pwd)     { showErr("confirm", "Passwords do not match"); valid = false; }
    if (!terms)                     { showErr("terms",   "You must agree to the Terms of Service"); valid = false; }
    if (!valid) return;

    const btn    = document.getElementById("submitBtn");
    const genErr = document.getElementById("generalErr");
    btn.innerHTML = '<span class="spin"></span>Creating account...';
    btn.disabled  = true;
    if (genErr) genErr.classList.remove("show");

    try {
      const { ok, data } = await apiRegister(name, email, pwd);
      if (!ok) {
        const errs = data.errors || {};
        if (errs.name)    showErr("name",     errs.name);
        if (errs.email)   showErr("email",    errs.email);
        if (errs.password)showErr("password", errs.password);
        if (errs.general && genErr) {
          document.getElementById("generalErrMsg").textContent = errs.general;
          genErr.classList.add("show");
        }
        return;
      }
      saveSession(data.token, data.user);
      form.style.display = "none";
      if (genErr) genErr.style.display = "none";
      const ss = document.getElementById("successState");
      if (ss) ss.style.display = "block";
      setTimeout(() => { window.location.href = "/tracker"; }, 1500);
    } catch {
      if (genErr) {
        document.getElementById("generalErrMsg").textContent = "Network error. Please try again.";
        genErr.classList.add("show");
      }
    } finally {
      btn.innerHTML = "Create Account →"; btn.disabled = false;
    }
  });

  if (getToken()) {
    apiMe().then(({ ok }) => { if (ok) window.location.href = "/tracker"; }).catch(() => {});
  }
}

function validateRegisterField(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const v = el.value.trim ? el.value.trim() : el.value;
  if (id === "name"    && (!v || v.length < 2))          return showErr(id, "Name must be at least 2 characters");
  if (id === "email"   && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return showErr(id, "Enter a valid email");
  if (id === "password") {
    if (!v || v.length < 8) return showErr(id, "At least 8 characters required");
    if (!/[A-Z]/.test(v))  return showErr(id, "At least one uppercase letter required");
    if (!/[0-9]/.test(v))  return showErr(id, "At least one number required");
  }
  if (id === "confirm") {
    const pwd = (document.getElementById("password") || {}).value || "";
    if (v !== pwd) return showErr(id, "Passwords do not match");
  }
  markOk(id);
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function wirePwdToggle(inputId, btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.addEventListener("click", () => {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const isText = inp.type === "text";
    inp.type     = isText ? "password" : "text";
    btn.textContent = isText ? "👁" : "🙈";
  });
}

// ── Tracker nav auth ──────────────────────────────────────────────────────────

function initTrackerNav() {
  const userAvatar = document.getElementById("userAvatar");
  const userName   = document.getElementById("userName");
  const logoutBtn  = document.getElementById("logoutBtn");

  if (!logoutBtn) return;  // not tracker page

  const user = getUser();
  if (!user) { window.location.href = "/login"; return; }
  if (userAvatar) userAvatar.textContent = user.name[0].toUpperCase();
  if (userName)   userName.textContent   = user.name;

  logoutBtn.addEventListener("click", doLogout);
}

// ── Homepage logout button ────────────────────────────────────────────────────

function initHomeNav() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", doLogout);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  updateNavAuth();
  initLoginForm();
  initRegisterForm();
  initTrackerNav();
  initHomeNav();
});
