/* Portal behaviour: language picker, search, and history navigation.
   Logic and events only: no markup is generated in JavaScript strings. */

(function () {
  "use strict";

  var root = document.body.getAttribute("data-root") || "";

  /* ---------- Language picker ---------- */

  var picker = document.querySelector("[data-locale-picker]");
  if (picker) {
    picker.addEventListener("change", function () {
      var code = picker.value;
      if (!code) {
        return;
      }
      /* Strip the current locale prefix, then apply the chosen one. */
      var path = window.location.pathname.replace(/^\/(en-us|ru|de|fr|nl|no|sv|fi|it|zh|ja|ko)(\/|$)/, "/");
      window.location.pathname = code === "en" ? path : "/" + code + path;
    });
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
      setMessage(container, "Type a word or phrase above to search every page of this portal.");
      return;
    }

    setMessage(container, "Searching…");

    fetch(root + "search-index.json")
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
          heading.textContent = hits.length
            ? hits.length + (hits.length === 1 ? " result for " : " results for ") + "“" + query + "”"
            : "Nothing found for “" + query + "”";
        }

        container.innerHTML = "";
        if (!hits.length) {
          setMessage(container, "No entry in the register matches every word. Try fewer or different words.");
          return;
        }
        hits.forEach(function (hit) {
          container.appendChild(resultItem(hit.page, terms));
        });
      })
      .catch(function () {
        setMessage(container, "The search index could not be loaded. Please try again.");
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
    link.href = root + page.url;
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
    expandAll.addEventListener("click", function () {
      var parts = document.querySelectorAll("details.part");
      var opening = expandAll.getAttribute("aria-pressed") !== "true";
      for (var i = 0; i < parts.length; i++) {
        parts[i].open = opening;
      }
      expandAll.setAttribute("aria-pressed", opening ? "true" : "false");
      expandAll.textContent = opening ? "Collapse all parts" : "Expand all parts";
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
})();
