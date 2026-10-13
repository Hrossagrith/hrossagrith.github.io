/* Portal reading layer for the English and Russian editions: reading progress,
   on-page contents, reading lists with "next" links, and a per-device record of
   what has been read. Logic and events only: every element is built with the
   DOM API, every word comes from assets/data/portal/portal.json. */

(function () {
  "use strict";

  var main = document.getElementById("main");
  if (!main || !window.fetch) {
    return;
  }

  var body = document.body;
  var lang = (document.documentElement.lang || "").toLowerCase().indexOf("ru") === 0 ? "ru" : "en";
  var root = body.getAttribute("data-root") || "";
  var base = body.getAttribute("data-base") || root;
  var STORE_KEY = "hrossagrith-reading";
  var READ_AT = 85;

  var data = null;
  var strings = {};
  var here = pathOf(window.location.pathname);

  /* ---------- Helpers ---------- */

  function pathOf(pathname) {
    var path = pathname.replace(/index\.html$/, "").replace(/^\/+/, "");
    var match = path.match(/^(ru)\//);
    if (match) {
      path = path.slice(match[0].length);
    } else if (path === "ru") {
      path = "";
    }
    return path;
  }

  function languageOf(pathname) {
    return /^\/ru(\/|$)/.test(pathname) ? "ru" : "en";
  }

  function say(key, values) {
    var text = strings[key] || "";
    if (values) {
      for (var name in values) {
        if (Object.prototype.hasOwnProperty.call(values, name)) {
          text = text.split("{" + name + "}").join(String(values[name]));
        }
      }
    }
    return text;
  }

  function make(tag, className, text) {
    var element = document.createElement(tag);
    if (className) {
      element.className = className;
    }
    if (text !== undefined && text !== null) {
      element.textContent = text;
    }
    return element;
  }

  function href(path) {
    return base + path;
  }

  function readStore() {
    try {
      var stored = JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}");
      if (!stored || typeof stored !== "object") {
        return { pages: {}, last: null };
      }
      stored.pages = stored.pages && typeof stored.pages === "object" ? stored.pages : {};
      return stored;
    } catch (error) {
      return { pages: {}, last: null };
    }
  }

  function writeStore(store) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (error) { /* storage unavailable: the page still works */ }
  }

  function isRead(store, path) {
    return (store.pages[path] || 0) >= READ_AT;
  }

  function routeById(id) {
    for (var i = 0; i < data.routes.length; i++) {
      if (data.routes[i].id === id) {
        return data.routes[i];
      }
    }
    return null;
  }

  /* ---------- Reading progress ---------- */

  var store = readStore();
  var progressBar = null;
  var progressFill = null;
  var lastSaved = store.pages[here] || 0;
  var tracking = false;

  function readingSpan() {
    var top = main.getBoundingClientRect().top + window.pageYOffset;
    var end = top + main.offsetHeight - window.innerHeight;
    return { top: top, end: end };
  }

  function percentRead() {
    var span = readingSpan();
    if (span.end <= span.top) {
      return 100;
    }
    var value = (window.pageYOffset - span.top) / (span.end - span.top) * 100;
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function setupProgress() {
    var nav = document.querySelector(".nav");
    if (!nav) {
      return;
    }
    progressBar = make("div", "portal-progress");
    progressBar.setAttribute("role", "progressbar");
    progressBar.setAttribute("aria-label", say("progress"));
    progressBar.setAttribute("aria-valuemin", "0");
    progressBar.setAttribute("aria-valuemax", "100");
    progressFill = make("span", "portal-progress__fill");
    progressBar.appendChild(progressFill);
    nav.appendChild(progressBar);
  }

  function saveProgress(pct, force) {
    if (!data.pages[here]) {
      return;
    }
    if (pct > lastSaved || force) {
      var fresh = readStore();
      fresh.pages[here] = Math.max(fresh.pages[here] || 0, pct);
      fresh.last = { path: here, lang: lang, pct: fresh.pages[here], at: Date.now() };
      writeStore(fresh);
      store = fresh;
      lastSaved = fresh.pages[here];
    }
  }

  function onScroll() {
    if (tracking) {
      return;
    }
    tracking = true;
    window.requestAnimationFrame(function () {
      tracking = false;
      var pct = percentRead();
      if (progressFill) {
        progressFill.style.transform = "scaleX(" + (pct / 100) + ")";
        progressBar.setAttribute("aria-valuenow", String(pct));
      }
      if (pct >= lastSaved + 5 || (pct >= READ_AT && lastSaved < READ_AT)) {
        saveProgress(pct, false);
      }
      updateDock();
      updateCurrentSection();
    });
  }

  /* ---------- On-page contents ---------- */

  var sections = [];
  var dock = null;
  var tocToggle = null;
  var tocCount = null;
  var tocPanel = null;
  var topButton = null;
  var currentIndex = -1;

  function slug(text, used) {
    var value = text.toLowerCase()
      .replace(/[^\wЀ-ӿ]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
    var candidate = value;
    var n = 2;
    while (used[candidate] || document.getElementById(candidate)) {
      candidate = value + "-" + n;
      n += 1;
    }
    used[candidate] = true;
    return candidate;
  }

  function collectSections() {
    var parts = main.querySelectorAll("details.part");
    var nodes = [];
    var i;
    if (parts.length >= 2) {
      for (i = 0; i < parts.length; i++) {
        nodes.push(parts[i]);
      }
    } else {
      var headings = main.querySelectorAll("h2");
      for (i = 0; i < headings.length; i++) {
        nodes.push(headings[i]);
      }
    }

    var used = {};
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var label = node.textContent;
      if (node.tagName === "DETAILS") {
        var summary = node.querySelector("summary") || node;
        var pieces = [];
        for (var c = 0; c < summary.children.length; c++) {
          pieces.push(summary.children[c].textContent.trim());
        }
        label = pieces.length ? pieces.filter(Boolean).join(" · ") : summary.textContent;
      }
      label = label.replace(/\s+/g, " ").trim();
      if (!label) {
        continue;
      }
      if (!node.id) {
        node.id = slug(label, used);
      }
      sections.push({ node: node, label: label });
    }
  }

  function openSection(node) {
    var target = node;
    while (target) {
      if (target.tagName === "DETAILS") {
        target.open = true;
      }
      target = target.parentElement;
    }
  }

  function buildDock() {
    dock = make("div", "portal-dock");

    if (sections.length >= 3) {
      tocToggle = make("button", "portal-dock__button portal-dock__button--contents");
      tocToggle.type = "button";
      tocToggle.setAttribute("aria-expanded", "false");
      tocToggle.setAttribute("aria-controls", "portal-toc");
      tocToggle.appendChild(make("span", "portal-dock__label", say("contents")));
      tocCount = make("span", "portal-dock__count");
      tocToggle.appendChild(tocCount);
      tocToggle.addEventListener("click", function () {
        setToc(tocPanel.hidden);
      });
      dock.appendChild(tocToggle);
      buildTocPanel();
    }

    topButton = make("button", "portal-dock__button portal-dock__button--top");
    topButton.type = "button";
    topButton.setAttribute("aria-label", say("back_to_top"));
    topButton.title = say("back_to_top");
    topButton.appendChild(make("span", "portal-dock__arrow"));
    topButton.addEventListener("click", function () {
      setToc(false);
      window.scrollTo(0, 0);
      var skip = document.querySelector(".skip-link");
      if (skip) {
        skip.focus();
      }
    });
    dock.appendChild(topButton);

    body.appendChild(dock);
  }

  function buildTocPanel() {
    tocPanel = make("nav", "portal-toc");
    tocPanel.id = "portal-toc";
    tocPanel.hidden = true;
    tocPanel.setAttribute("aria-label", say("contents"));

    var head = make("div", "portal-toc__head");
    head.appendChild(make("p", "portal-toc__title", say("contents")));
    var close = make("button", "portal-toc__close");
    close.type = "button";
    close.setAttribute("aria-label", say("contents_close"));
    close.title = say("contents_close");
    close.addEventListener("click", function () {
      setToc(false);
      tocToggle.focus();
    });
    head.appendChild(close);
    tocPanel.appendChild(head);

    var list = make("ol", "portal-toc__list");
    for (var i = 0; i < sections.length; i++) {
      var item = make("li");
      var link = make("a", null, sections[i].label);
      link.href = "#" + sections[i].node.id;
      link.setAttribute("data-index", String(i));
      link.addEventListener("click", onTocLink);
      sections[i].link = link;
      item.appendChild(link);
      list.appendChild(item);
    }
    tocPanel.appendChild(list);
    body.appendChild(tocPanel);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !tocPanel.hidden) {
        setToc(false);
        tocToggle.focus();
      }
    });
    document.addEventListener("click", function (event) {
      if (!tocPanel.hidden && !tocPanel.contains(event.target) && !tocToggle.contains(event.target)) {
        setToc(false);
      }
    });
  }

  function onTocLink(event) {
    var index = Number(event.currentTarget.getAttribute("data-index"));
    var node = sections[index].node;
    event.preventDefault();
    setToc(false);
    openSection(node);
    node.scrollIntoView();
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, "", "#" + node.id);
    }
    var focusTarget = node.tagName === "DETAILS" ? node.querySelector("summary") : node;
    if (focusTarget) {
      if (focusTarget.tagName !== "SUMMARY") {
        focusTarget.setAttribute("tabindex", "-1");
      }
      focusTarget.focus({ preventScroll: true });
    }
  }

  function setToc(open) {
    if (!tocPanel) {
      return;
    }
    tocPanel.hidden = !open;
    tocToggle.setAttribute("aria-expanded", open ? "true" : "false");
    body.classList.toggle("portal-toc-open", open);
    if (open && currentIndex >= 0) {
      sections[currentIndex].link.scrollIntoView({ block: "nearest" });
    }
  }

  function updateCurrentSection() {
    if (!sections.length || !tocCount) {
      return;
    }
    var line = window.innerHeight * 0.3;
    var index = -1;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].node.getBoundingClientRect().top <= line) {
        index = i;
      } else {
        break;
      }
    }
    if (index === currentIndex) {
      return;
    }
    if (currentIndex >= 0) {
      sections[currentIndex].link.removeAttribute("aria-current");
    }
    currentIndex = index;
    if (index >= 0) {
      sections[index].link.setAttribute("aria-current", "location");
    }
    tocCount.textContent = say("section_of", {
      i: Math.max(1, index + 1),
      n: sections.length
    });
  }

  function updateDock() {
    if (!dock) {
      return;
    }
    var visible = window.pageYOffset > window.innerHeight * 0.9;
    dock.classList.toggle("is-visible", visible || body.classList.contains("portal-toc-open"));
    if (topButton) {
      topButton.hidden = !visible;
    }
  }

  /* ---------- Page facts and the next document ---------- */

  function routePosition() {
    var page = data.pages[here];
    if (!page) {
      return null;
    }
    var route = routeById(page.route);
    var index = route.pages.indexOf(here);
    return { route: route, index: index };
  }

  function insertFacts(position) {
    var anchor = main.querySelector(".page-standfirst") || main.querySelector("h1");
    if (!anchor) {
      return;
    }
    var facts = make("p", "portal-facts");
    facts.appendChild(make("span", "portal-facts__item",
      say("minutes", { n: data.pages[here].minutes[lang] })));
    var link = make("a", "portal-facts__item", say("route_part", {
      i: position.index + 1,
      n: position.route.pages.length,
      route: position.route.title[lang]
    }));
    link.href = href("") + "#start-" + position.route.id;
    facts.appendChild(link);
    anchor.parentNode.insertBefore(facts, anchor.nextSibling);
  }

  function card(kind, label, path, current) {
    var page = data.pages[path];
    var link = make("a", "portal-next__card portal-next__card--" + kind);
    link.href = href(path);
    link.setAttribute("rel", kind === "previous" ? "prev" : "next");
    link.appendChild(make("span", "portal-next__label", label));
    link.appendChild(make("span", "portal-next__title", page.title[lang]));
    var meta = make("span", "portal-next__meta", say("minutes", { n: page.minutes[lang] }));
    if (isRead(current, path)) {
      meta.appendChild(make("span", "portal-check", say("read_mark")));
    }
    link.appendChild(meta);
    return link;
  }

  function insertNext(position) {
    var route = position.route;
    var section = make("nav", "portal-next");
    section.setAttribute("aria-label", route.title[lang]);
    var grid = make("div", "portal-next__grid");

    if (position.index > 0) {
      grid.appendChild(card("previous", say("previous"), route.pages[position.index - 1], store));
    }

    if (position.index < route.pages.length - 1) {
      grid.appendChild(card("next", say("next"), route.pages[position.index + 1], store));
    } else {
      var at = data.routes.indexOf(route);
      var following = data.routes[(at + 1) % data.routes.length];
      section.appendChild(make("p", "portal-next__done", say("route_done", { route: route.title[lang] })));
      grid.appendChild(card("next", say("next_route") + " · " + following.title[lang],
        following.pages[0], store));
    }

    section.appendChild(grid);
    main.appendChild(section);
  }

  /* ---------- Read marks on links to documents ---------- */

  function markReadLinks() {
    var links = document.querySelectorAll(".menu__grid a, .footer a, .services a, .register a");
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      if (link.host !== window.location.host || link.hash || languageOf(link.pathname) !== lang) {
        continue;
      }
      var path = pathOf(link.pathname);
      if (data.pages[path] && isRead(store, path) && !link.querySelector(".portal-check")) {
        link.appendChild(make("span", "portal-check", say("read_mark")));
      }
    }
  }

  /* ---------- Home: where to begin ---------- */

  function routeCard(route) {
    var item = make("li", "portal-route");
    item.id = "start-" + route.id;

    var minutes = 0;
    var done = 0;
    var resumeAt = null;
    for (var i = 0; i < route.pages.length; i++) {
      var path = route.pages[i];
      minutes += data.pages[path].minutes[lang];
      if (isRead(store, path)) {
        done += 1;
      } else if (resumeAt === null) {
        resumeAt = path;
      }
    }

    item.appendChild(make("h3", "portal-route__title", route.title[lang]));
    item.appendChild(make("p", "portal-route__summary", route.summary[lang]));
    item.appendChild(make("p", "portal-route__meta",
      say("route_meta", { n: route.pages.length, m: minutes })));

    var steps = make("ol", "portal-route__steps");
    for (var j = 0; j < route.pages.length; j++) {
      var step = make("li", isRead(store, route.pages[j]) ? "is-read" : "");
      var link = make("a", null, data.pages[route.pages[j]].title[lang]);
      link.href = href(route.pages[j]);
      step.appendChild(link);
      if (isRead(store, route.pages[j])) {
        step.appendChild(make("span", "portal-check", say("read_mark")));
      }
      steps.appendChild(step);
    }
    item.appendChild(steps);

    var foot = make("div", "portal-route__foot");
    var meter = make("span", "portal-route__meter");
    meter.setAttribute("role", "img");
    meter.setAttribute("aria-label", say("route_progress", { r: done, n: route.pages.length }));
    var fill = make("span", "portal-route__fill");
    fill.style.transform = "scaleX(" + (done / route.pages.length) + ")";
    meter.appendChild(fill);
    foot.appendChild(meter);
    foot.appendChild(make("span", "portal-route__count",
      say("route_progress", { r: done, n: route.pages.length })));

    var action = make("a", "portal-route__action",
      done === 0 ? say("route_begin") : (resumeAt ? say("route_resume") : say("route_review")));
    action.href = href(resumeAt || route.pages[0]);
    foot.appendChild(action);
    item.appendChild(foot);
    return item;
  }

  function buildStart(container) {
    var head = make("div", "portal-start__head");
    var title = make("h2", "portal-start__title", say("start_title"));
    title.id = "portal-start-title";
    head.appendChild(title);
    head.appendChild(make("p", "portal-start__lead", say("start_lead")));
    container.appendChild(head);

    var last = store.last;
    if (last && last.lang === lang && data.pages[last.path] && last.pct < 95) {
      var resume = make("a", "portal-resume");
      resume.href = href(last.path);
      resume.appendChild(make("span", "portal-resume__label", say("resume_title")));
      resume.appendChild(make("span", "portal-resume__title", data.pages[last.path].title[lang]));
      resume.appendChild(make("span", "portal-resume__meta", say("resume_meta", { p: last.pct })));
      container.appendChild(resume);
    }

    var list = make("ol", "portal-start__routes");
    for (var i = 0; i < data.routes.length; i++) {
      list.appendChild(routeCard(data.routes[i]));
    }
    container.appendChild(list);
    container.hidden = false;

    if (window.location.hash) {
      var target = document.getElementById(window.location.hash.slice(1));
      if (target) {
        target.scrollIntoView();
      }
    }
  }

  /* ---------- Start ---------- */

  function start(json) {
    data = json;
    strings = json.strings[lang] || json.strings.en;

    setupProgress();
    collectSections();
    buildDock();

    var position = routePosition();
    if (position) {
      insertFacts(position);
      insertNext(position);
    }

    var startBlock = document.querySelector("[data-portal-start]");
    if (startBlock) {
      buildStart(startBlock);
    }

    markReadLinks();
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    window.addEventListener("pagehide", function () {
      saveProgress(percentRead(), false);
    });
  }

  fetch(root + "assets/data/portal/portal.json")
    .then(function (response) {
      if (!response.ok) {
        throw new Error("portal data unavailable");
      }
      return response.json();
    })
    .then(start)
    .catch(function () { /* the page reads perfectly well without this layer */ });
})();
