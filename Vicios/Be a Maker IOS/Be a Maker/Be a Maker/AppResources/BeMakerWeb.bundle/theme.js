(function () {
  const STORAGE_KEY = "beamaker.theme";
  const DARK = "dark";
  const LIGHT = "light";

  function systemTheme() {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return LIGHT;
    }
    return DARK;
  }

  function currentTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === LIGHT || saved === DARK ? saved : systemTheme();
  }

  function updateButtons(theme) {
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      const nextTheme = theme === DARK ? LIGHT : DARK;
      button.textContent = nextTheme === DARK ? "Dark" : "Light";
      button.setAttribute("aria-label", "Switch to " + nextTheme + " mode");
      button.setAttribute("aria-pressed", theme === DARK ? "true" : "false");
    });
  }

  function applyTheme(theme) {
    const next = theme === LIGHT ? LIGHT : DARK;
    document.documentElement.dataset.theme = next;
    localStorage.setItem(STORAGE_KEY, next);
    updateButtons(next);
    window.dispatchEvent(new CustomEvent("bam-theme-change", { detail: { theme: next } }));
  }

  window.BamTheme = {
    current: currentTheme,
    apply: applyTheme,
    toggle: function () {
      applyTheme(currentTheme() === DARK ? LIGHT : DARK);
    }
  };

  applyTheme(currentTheme());

  document.addEventListener("DOMContentLoaded", function () {
    updateButtons(currentTheme());
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.addEventListener("click", function () {
        window.BamTheme.toggle();
      });
    });
  });
})();
