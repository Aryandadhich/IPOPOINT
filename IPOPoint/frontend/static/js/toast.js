/**
 * toast.js — lightweight toast notification system
 */

let _toastTimer = null;

/**
 * Show a toast message.
 * @param {string} msg   - Message to display
 * @param {"ok"|"err"|"inf"} type - Toast style
 */
export function toast(msg, type = "ok") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className   = `show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = ""; }, 3200);
}

// Make globally accessible for inline HTML usage (e.g. onclick attrs)
window.toast = toast;
