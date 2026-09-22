/* Portal behaviour: language picker, search, and history navigation.
   Logic and events only: no markup is generated in JavaScript strings. */

(function () {
  "use strict";

  var root = document.body.getAttribute("data-root") || "";
  /* `base` reaches the root of the current language; `root` reaches the site
     root. The search index and every result link are per-language. */
  var base = document.body.getAttribute("data-base") || root;
  var text = {};
  try {
    text = JSON.parse(document.body.getAttribute("data-i18n") || "{}");
  } catch (error) { /* fall back to the English wording below */ }

  function say(key, fallback) {
    return text[key] || fallback;
  }

  function count(n, query) {
    var key = n === 0 ? "results_none" : (n === 1 ? "results_one" : "results_many");
    var fallback = n === 0
      ? "Nothing found for \u201c{q}\u201d"
      : (n === 1 ? "{n} result for \u201c{q}\u201d" : "{n} results for \u201c{q}\u201d");
    return say(key, fallback).replace("{n}", n).replace("{q}", query);
  }

  /* ---------- Locale selection ---------- */

  var localePrefix = /^\/(en-us|ru|de|fr|nl|no|sv|fi|it|zh|ja|ko)(\/|$)/;
  var supportedLocales = {
    "en": true,
    "en-us": true,
    "ru": true,
    "de": true,
    "fr": true,
    "nl": true,
    "no": true,
    "sv": true,
    "fi": true,
    "it": true,
    "zh": true,
    "ja": true,
    "ko": true
  };

  function rememberLocale(code) {
    try {
      window.localStorage.setItem("hrossagrith-locale", code);
    } catch (error) { /* storage unavailable */ }
  }

  function rememberedLocale() {
    try {
      var saved = window.localStorage.getItem("hrossagrith-locale");
      return supportedLocales[saved] ? saved : "";
    } catch (error) {
      return "";
    }
  }

  function localeFromLanguage(tag) {
    if (!tag) {
      return "";
    }
    var normal = String(tag).toLowerCase().replace("_", "-");
    if (normal === "en-us" || normal.indexOf("en-us-") === 0) {
      return "en-us";
    }
    var primary = normal.split("-")[0];
    if (primary === "nb" || primary === "nn") {
      return "no";
    }
    return supportedLocales[primary] ? primary : "";
  }

  function localeFromBrowser() {
    var languages = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || navigator.userLanguage || ""];
    for (var i = 0; i < languages.length; i++) {
      var code = localeFromLanguage(languages[i]);
      if (code) {
        return code;
      }
    }
    return "";
  }

  function localeFromTimeZone() {
    var zone = "";
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch (error) { /* old browser */ }

    var zones = {
      "Europe/London": "en",
      "America/New_York": "en-us",
      "America/Detroit": "en-us",
      "America/Chicago": "en-us",
      "America/Denver": "en-us",
      "America/Phoenix": "en-us",
      "America/Los_Angeles": "en-us",
      "America/Anchorage": "en-us",
      "Pacific/Honolulu": "en-us",

      "Europe/Kaliningrad": "ru",
      "Europe/Moscow": "ru",
      "Europe/Kirov": "ru",
      "Europe/Astrakhan": "ru",
      "Europe/Samara": "ru",
      "Europe/Saratov": "ru",
      "Europe/Ulyanovsk": "ru",
      "Europe/Volgograd": "ru",
      "Asia/Yekaterinburg": "ru",
      "Asia/Omsk": "ru",
      "Asia/Novosibirsk": "ru",
      "Asia/Barnaul": "ru",
      "Asia/Tomsk": "ru",
      "Asia/Novokuznetsk": "ru",
      "Asia/Krasnoyarsk": "ru",
      "Asia/Irkutsk": "ru",
      "Asia/Chita": "ru",
      "Asia/Yakutsk": "ru",
      "Asia/Khandyga": "ru",
      "Asia/Vladivostok": "ru",
      "Asia/Ust-Nera": "ru",
      "Asia/Magadan": "ru",
      "Asia/Sakhalin": "ru",
      "Asia/Srednekolymsk": "ru",
      "Asia/Kamchatka": "ru",
      "Asia/Anadyr": "ru",

      "Europe/Berlin": "de",
      "Europe/Vienna": "de",
      "Europe/Paris": "fr",
      "Europe/Amsterdam": "nl",
      "Europe/Oslo": "no",
      "Europe/Stockholm": "sv",
      "Europe/Helsinki": "fi",
      "Europe/Rome": "it",
      "Asia/Shanghai": "zh",
      "Asia/Urumqi": "zh",
      "Asia/Tokyo": "ja",
      "Asia/Seoul": "ko"
    };
    return zones[zone] || "";
  }

  function pathForLocale(code, path) {
    var bare = path.replace(localePrefix, "/");
    return code === "en" ? bare : "/" + code + bare;
  }

  function autoSelectLocale() {
    /* An explicit locale in the URL is respected. Otherwise a saved manual
       choice wins over automatic selection. */
    if (localePrefix.test(window.location.pathname)) {
      return;
    }

    var code = rememberedLocale() || localeFromTimeZone() || localeFromBrowser();
    if (!code || code === "en") {
      return;
    }

    var target = pathForLocale(code, window.location.pathname);
    if (target === window.location.pathname) {
      return;
    }

    /* Deep links are redirected only when the translated counterpart exists. */
    fetch(target, { method: "HEAD", cache: "no-store" })
      .then(function (response) {
        if (response.ok) {
          window.location.replace(target + window.location.search + window.location.hash);
        }
      })
      .catch(function () { /* stay on the current language */ });
  }

  autoSelectLocale();

  var picker = document.querySelector("[data-locale-picker]");
  if (picker) {
    picker.addEventListener("change", function () {
      var code = picker.value;
      if (!supportedLocales[code]) {
        return;
      }
      rememberLocale(code);
      var path = pathForLocale(code, window.location.pathname);
      window.location.pathname = path;
    });
  }


  /* ---------- Hrossagrith state display ---------- */

  var HROSSAGRITH_STANDARDS = {
    timeZone: "Europe/Dublin",
    dateOrder: "DMY",
    datePattern: "DD/MM/YYYY",
    hourCycle: "h23",
    units: "metric"
  };

  /* The old horse-centred slogan is retired across every locale/version. */
  var oldMottos = document.querySelectorAll(".masthead__motto");
  for (var m = 0; m < oldMottos.length; m++) {
    oldMottos[m].remove();
  }

  var utilityInner = document.querySelector(".utility__inner");
  if (utilityInner && !utilityInner.querySelector(".hrossagrith-clock")) {
    var clock = document.createElement("p");
    clock.className = "hrossagrith-clock";
    clock.setAttribute(
      "title",
      "Hrossagrith time · Europe/Dublin · DD/MM/YYYY · 24-hour clock · metric standards"
    );

    var note = utilityInner.querySelector(".utility__note");
    if (note && note.nextSibling) {
      utilityInner.insertBefore(clock, note.nextSibling);
    } else if (note) {
      utilityInner.appendChild(clock);
    } else {
      utilityInner.insertBefore(clock, utilityInner.firstChild);
    }

    var hrossagrithFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: HROSSAGRITH_STANDARDS.timeZone,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: HROSSAGRITH_STANDARDS.hourCycle
    });

    function updateHrossagrithClock() {
      var values = {};
      var parts = hrossagrithFormatter.formatToParts(new Date());
      for (var p = 0; p < parts.length; p++) {
        if (parts[p].type !== "literal") {
          values[parts[p].type] = parts[p].value;
        }
      }

      clock.textContent =
        "Hrossagrith · " +
        values.day + "/" + values.month + "/" + values.year +
        " · " +
        values.hour + ":" + values.minute + ":" + values.second;
    }

    updateHrossagrithClock();
    window.setInterval(updateHrossagrithClock, 1000);
  }


  /* ---------- Regional content policy ---------- */

  var pageLanguage = (document.documentElement.lang || "").toLowerCase().split("-")[0];
  var regionalPolicy = {
    "ru": "restricted"
  };

  if (regionalPolicy[pageLanguage] === "restricted") {
    document.documentElement.setAttribute("data-regional-policy", "restricted");

    var restricted = document.querySelectorAll("[data-region-restricted]");
    for (var r = 0; r < restricted.length; r++) {
      restricted[r].remove();
    }

    var footerBottom = document.querySelector(".footer__bottom");
    if (footerBottom && !footerBottom.querySelector(".footer__legal")) {
      var legal = document.createElement("p");
      legal.className = "footer__legal";
      legal.textContent =
        "Правовая оговорка. Хроссагрид — вымышленный художественный проект. " +
        "Материалы не являются официальными документами, юридической консультацией или призывом к каким-либо действиям. " +
        "Содержание портала может быть сокращено или адаптировано с учётом применимых требований законодательства.";
      footerBottom.appendChild(legal);
    }
  }

  /* ---------- Search ---------- */

  var results = document.querySelector("[data-search-results]");
  if (results) {
    runSearch(results);
  }

  function currentQuery() {
    var match = window.location.search.match(/[?&]q=([^&]*)/);
    return match ? decodeURIComponent(match[1].replace(/\+/g, " ")) : "";
  }

  function runSearch(container) {
    var query = currentQuery().trim();
    var field = document.getElementById("q");
    if (field) {
      field.value = query;
    }
    var heading = document.querySelector("[data-search-heading]");

    if (!query) {
      setMessage(container, say("search_prompt",
        "Type a word or phrase above to search every page of this portal."));
      return;
    }

    setMessage(container, say("search_running", "Searching\u2026"));

    fetch(base + "search-index.json")
      .then(function (response) {
        if (!response.ok) {
          throw new Error("index unavailable");
        }
        return response.json();
      })
      .then(function (index) {
        var terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        var hits = index
          .map(function (page) {
            var haystack = (page.title + " " + page.section + " " + page.text).toLowerCase();
            var score = 0;
            for (var i = 0; i < terms.length; i++) {
              if (haystack.indexOf(terms[i]) === -1) {
                return null;
              }
              score += page.title.toLowerCase().indexOf(terms[i]) !== -1 ? 5 : 1;
            }
            return { page: page, score: score };
          })
          .filter(Boolean)
          .sort(function (a, b) {
            return b.score - a.score;
          });

        if (heading) {
          heading.textContent = count(hits.length, query);
        }

        container.innerHTML = "";
        if (!hits.length) {
          setMessage(container, say("search_none",
            "No entry in the register matches every word. Try fewer or different words."));
          return;
        }
        hits.forEach(function (hit) {
          container.appendChild(resultItem(hit.page, terms));
        });
      })
      .catch(function () {
        setMessage(container, say("search_error",
          "The search index could not be loaded. Please try again."));
      });
  }

  function setMessage(container, text) {
    container.innerHTML = "";
    var p = document.createElement("p");
    p.className = "search__message";
    p.textContent = text;
    container.appendChild(p);
  }

  function resultItem(page, terms) {
    var li = document.createElement("li");
    li.className = "result";

    var kicker = document.createElement("p");
    kicker.className = "result__section";
    kicker.textContent = page.section;

    var title = document.createElement("h3");
    var link = document.createElement("a");
    link.href = base + page.url;
    link.textContent = page.title;
    title.appendChild(link);

    var snippet = document.createElement("p");
    snippet.className = "result__snippet";
    snippet.textContent = excerpt(page.text, terms);

    li.appendChild(kicker);
    li.appendChild(title);
    li.appendChild(snippet);
    return li;
  }

  function excerpt(text, terms) {
    var lower = text.toLowerCase();
    var at = lower.indexOf(terms[0]);
    if (at === -1) {
      return text.slice(0, 220) + "…";
    }
    var start = Math.max(0, at - 90);
    var piece = text.slice(start, start + 240).trim();
    return (start > 0 ? "…" : "") + piece + "…";
  }

  /* ---------- History: expand and collapse every part at once ---------- */

  var expandAll = document.querySelector("[data-expand-all]");
  if (expandAll) {
    /* The parts are served open, so the button starts as a collapse control. */
    setExpandLabel(document.querySelectorAll("details.part[open]").length ===
                   document.querySelectorAll("details.part").length);

    expandAll.addEventListener("click", function () {
      var parts = document.querySelectorAll("details.part");
      var opening = expandAll.getAttribute("aria-pressed") !== "true";
      for (var i = 0; i < parts.length; i++) {
        parts[i].open = opening;
      }
      setExpandLabel(opening);
    });
  }

  /* A part linked to directly should open itself. */
  function openTarget() {
    if (!window.location.hash) {
      return;
    }
    var target = document.querySelector(window.location.hash);
    while (target) {
      if (target.tagName === "DETAILS") {
        target.open = true;
      }
      target = target.parentElement;
    }
  }

  openTarget();
  window.addEventListener("hashchange", openTarget);
  function setExpandLabel(open) {
    expandAll.setAttribute("aria-pressed", open ? "true" : "false");
    expandAll.textContent = open
      ? say("collapse_all", "Collapse all parts")
      : say("expand_all", "Expand all parts");
  }

})();
