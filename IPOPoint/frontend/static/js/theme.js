/**
 * theme.js — dark/light toggle
 * Reads and writes localStorage key "ipo-theme".
 * Exported so other modules can import if needed.
 */

export function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("themeBtn");
  if (btn) btn.textContent = theme === "dark" ? "🌙" : "☀️";
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next    = current === "dark" ? "light" : "dark";
  localStorage.setItem("ipo-theme", next);
  applyTheme(next);
}

// Apply immediately on module load
(function init() {
  const saved = localStorage.getItem("ipo-theme") || "dark";
  applyTheme(saved);

  // Bind button once DOM is ready
  const bind = () => {
    const btn = document.getElementById("themeBtn");
    if (btn) btn.addEventListener("click", toggleTheme);
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
