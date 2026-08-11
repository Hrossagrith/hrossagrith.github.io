/* Theme switching for the Hrossagrid state portal.
   Logic and events only: no markup is generated here.
   The initial theme is resolved by a small inline script in <head>, so this
   file only handles the toggle and later changes to the system preference. */

(function () {
  "use strict";

  var STORAGE_KEY = "hrossagrid-theme";
  var root = document.documentElement;
  var button = document.querySelector("[data-theme-toggle]");
  var query = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var text = {};
  try {
    text = JSON.parse(document.body.getAttribute("data-i18n") || "{}");
  } catch (error) { /* fall back to the English wording below */ }

  function say(key, fallback) {
    return text[key] || fallback;
  }

  function storedTheme() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === "dark" || value === "light" ? value : null;
    } catch (error) {
      return null;
    }
  }

  function store(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {
      /* Private mode or storage disabled: the choice simply does not persist. */
    }
  }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    if (button) {
      button.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      button.setAttribute("aria-label", theme === "dark"
        ? say("theme_to_light", "Switch to light theme")
        : say("theme_to_dark", "Switch to dark theme"));
      button.textContent = theme === "dark" ? say("light", "Light") : say("dark", "Dark");
    }
  }

  apply(root.getAttribute("data-theme") === "dark" ? "dark" : "light");

  if (button) {
    button.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      apply(next);
      store(next);
    });
  }

  /* Follow the system preference only while the visitor has made no explicit choice. */
  if (query && typeof query.addEventListener === "function") {
    query.addEventListener("change", function (event) {
      if (!storedTheme()) {
        apply(event.matches ? "dark" : "light");
      }
    });
  }
})();
