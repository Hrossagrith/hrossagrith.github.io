/* Imperial Market: renders listings from assets/data/market/catalog.json into
   the <template> elements of each page. UI strings come from
   assets/data/market/text.json. The bag and Grith Points live in localStorage. */
(function () {
  "use strict";

  var body = document.body;
  var LANG = body.getAttribute("data-lang") || "en";
  var ROOT = body.getAttribute("data-root") || "";
  var MROOT = body.getAttribute("data-mroot") || "./";
  var PAGE = body.getAttribute("data-page");
  var DEPT = body.getAttribute("data-dept");
  var STORE_KEY = "hrossagrith-market";
  var PAGE_SIZE = 24;
  var POINTS_WELCOME = 50;
  var POINTS_TIERS = [500, 1500, 4000];
  var VIEW_NAMES = {
    horse: { exterior: ["left", "front_left", "front", "front_right", "right", "rear_right", "rear", "rear_left"], detail: ["head", "back", "legs", "hooves"] },
    tack: { exterior: ["left", "front_left", "front", "front_right", "right", "rear_right", "rear", "rear_left"], interior: ["underside", "lining", "fittings", "stitching"] }
  };

  var cat = null;
  var text = null;
  var index = { item: {}, seller: {}, region: {}, breed: {}, hcat: {}, tcat: {}, disc: {} };

  /* ---------- helpers ---------- */

  function tr(value) {
    if (value && typeof value === "object") { return value[LANG] || value.en || ""; }
    return value == null ? "" : String(value);
  }

  function t(key, vars) {
    var entry = text[key];
    var out = entry ? (entry[LANG] || entry.en) : key;
    if (vars) {
      Object.keys(vars).forEach(function (k) { out = out.split("{" + k + "}").join(String(vars[k])); });
    }
    return out;
  }

  var numberFormat = new Intl.NumberFormat(LANG === "ru" ? "ru-RU" : "en-GB");

  function money(n) { return numberFormat.format(n) + " " + tr(cat.currency.short); }

  function clone(id) { return document.getElementById(id).content.firstElementChild.cloneNode(true); }

  function fill(node, map) {
    Object.keys(map).forEach(function (key) {
      var targets = node.querySelectorAll('[data-f="' + key + '"]');
      Array.prototype.forEach.call(targets, function (el) { el.textContent = map[key]; });
    });
    return node;
  }

  function setHref(node, href) {
    var el = node.hasAttribute("data-href") ? node : node.querySelector("[data-href]");
    if (el) { el.setAttribute("href", href); }
    return node;
  }

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); }

  function clear(el) { while (el.firstChild) { el.removeChild(el.firstChild); } }

  function query() { return new URLSearchParams(location.search); }

  /* ---------- store ---------- */

  function loadStore() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { data = null; }
    if (!data || typeof data !== "object") { data = {}; }
    if (!Array.isArray(data.bag)) { data.bag = []; }
    if (typeof data.points !== "number") { data.points = POINTS_WELCOME; }
    return data;
  }

  function saveStore(store) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* storage unavailable: the bag lasts for this page only */ }
  }

  var store = loadStore();

  /* ---------- listing facts ---------- */

  function isHorse(item) { return item.kind === "horse"; }

  function itemUrl(item) { return MROOT + "item/?id=" + encodeURIComponent(item.id); }

  function sellerUrl(id) { return MROOT + "seller/?id=" + encodeURIComponent(id); }

  function hands(cm) {
    var inches = Math.round(cm / 2.54);
    return Math.floor(inches / 4) + "." + (inches % 4);
  }

  function lowestOffer(item) {
    return item.offers.reduce(function (best, o) { return !best || o.price < best.price ? o : best; }, null);
  }

  function basePrice(item) { return isHorse(item) ? item.price : lowestOffer(item).price; }

  function eyebrow(item) {
    if (isHorse(item)) { return tr(index.hcat[item.category].name) + " · " + tr(index.disc[item.discipline].name); }
    return tr(index.seller[item.brand].name) + " · " + tr(index.tcat[item.category].name);
  }

  function horseMeta(h) {
    return [tr(index.breed[h.breed].name), tr(cat.sexes[h.sex]), t("age_years", { n: h.age }), t("height_short", { cm: h.height_cm, hh: hands(h.height_cm) })].join(" · ");
  }

  function cardMeta(item) {
    if (isHorse(item)) { return horseMeta(item) + " · " + tr(index.region[item.region].name); }
    return t("rating_line", { r: numberFormat.format(item.rating), n: item.reviews });
  }

  function cardPrice(item) {
    return isHorse(item) ? money(item.price) : t("price_from", { p: money(basePrice(item)) });
  }

  function views(item, mode) {
    var count = cat.views[item.kind][mode];
    var names = VIEW_NAMES[item.kind][mode];
    var files = (item.images && item.images[mode]) || [];
    var out = [];
    for (var i = 0; i < count; i += 1) {
      out.push({ name: t("view_" + names[i]), src: files[i] ? ROOT + cat.image_root + item.id + "/" + files[i] : "" });
    }
    return out;
  }

  function paintMedia(node, item, view) {
    var fig = node.hasAttribute("data-media") ? node : node.querySelector("[data-media]");
    if (!fig) { return; }
    fig.style.setProperty("--tone", item.tone);
    var img = fig.querySelector("img");
    var ph = fig.querySelector("[data-ph]");
    var shot = view || views(item, "exterior")[0];
    if (shot.src) {
      img.src = shot.src;
      img.alt = item.name;
      img.hidden = false;
      ph.hidden = true;
    } else {
      ph.textContent = item.name.charAt(0);
    }
  }

  function card(item) {
    var node = clone("tpl-card");
    fill(node, { eyebrow: eyebrow(item), name: item.name, line: tr(item.line), meta: cardMeta(item), price: cardPrice(item) });
    setHref(node, itemUrl(item));
    paintMedia(node, item);
    return node;
  }

  function haystack(item) {
    var parts = [item.name, item.id];
    if (isHorse(item)) {
      parts.push(index.breed[item.breed].name, index.hcat[item.category].name, index.disc[item.discipline].name, item.coat, cat.sexes[item.sex], index.seller[item.seller].name, index.region[item.region].name, item.passport);
    } else {
      parts.push(index.seller[item.brand].name, index.tcat[item.category].name, item.line, item.certificate);
    }
    return parts.map(function (p) { return typeof p === "object" ? p.en + " " + p.ru : p; }).join(" ").toLowerCase();
  }

  function searchScore(item, terms) {
    if (!terms.length) { return 1; }
    var hay = item._hay || (item._hay = haystack(item));
    var name = item.name.toLowerCase();
    var score = 0;
    for (var i = 0; i < terms.length; i += 1) {
      if (hay.indexOf(terms[i]) === -1) { return 0; }
      score += name.indexOf(terms[i]) === 0 ? 3 : 1;
    }
    return score;
  }

  function terms(q) { return (q || "").toLowerCase().split(/\s+/).filter(Boolean); }

  /* ---------- shared chrome ---------- */

  function initChrome() {
    var nav = $("[data-nav]");
    var menuBtn = $("[data-menu]");
    var search = $("[data-search]");
    var searchBtn = $("[data-search-open]");
    var scrim = $("[data-scrim]");
    var input = $("[data-search-input]");

    function closeAll() {
      nav.classList.remove("is-menu");
      menuBtn.setAttribute("aria-expanded", "false");
      search.hidden = true;
      searchBtn.setAttribute("aria-expanded", "false");
      scrim.hidden = true;
      body.classList.remove("is-locked");
    }

    menuBtn.addEventListener("click", function () {
      var open = !nav.classList.contains("is-menu");
      closeAll();
      if (open) {
        nav.classList.add("is-menu");
        menuBtn.setAttribute("aria-expanded", "true");
        body.classList.add("is-locked");
      }
    });

    searchBtn.addEventListener("click", function () {
      var open = search.hidden;
      closeAll();
      if (open) {
        search.hidden = false;
        scrim.hidden = false;
        searchBtn.setAttribute("aria-expanded", "true");
        input.focus();
      }
    });

    scrim.addEventListener("click", closeAll);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAll(); } });

    $$("[data-keep-query]").forEach(function (a) {
      if (location.search) { a.setAttribute("href", a.getAttribute("href") + location.search); }
    });

    $$("[data-scroller]").forEach(initScroller);
    updateBagCount();
  }

  function initSearch() {
    var input = $("[data-search-input]");
    var quick = $("[data-search-quick]");
    var results = $("[data-search-results]");
    var head = $("[data-search-head]");
    var all = cat.horses.concat(cat.tack);

    input.addEventListener("input", function () {
      var q = terms(input.value.trim());
      clear(results);
      if (!q.length) {
        results.hidden = true;
        quick.hidden = false;
        head.textContent = t("search_quick");
        return;
      }
      var hits = all.map(function (item) { return { item: item, s: searchScore(item, q) }; })
        .filter(function (h) { return h.s > 0; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, 6);
      hits.forEach(function (h) {
        var node = clone("tpl-search-result");
        fill(node, { name: h.item.name, meta: eyebrow(h.item) });
        setHref(node, itemUrl(h.item));
        results.appendChild(node);
      });
      head.textContent = hits.length ? t("search_suggested") : t("search_none");
      results.hidden = false;
      quick.hidden = true;
    });
  }

  function initScroller(scroller) {
    var track = $(".mk-scroller__track", scroller);
    $$("[data-paddle]", scroller).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var dir = Number(btn.getAttribute("data-paddle"));
        track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: "smooth" });
      });
    });
  }

  function updateBagCount() {
    var badge = $("[data-bag-count]");
    badge.textContent = String(store.bag.length);
    badge.hidden = store.bag.length === 0;
  }

  function toast(message) {
    var el = $("[data-toast]");
    el.textContent = message;
    el.hidden = false;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(function () { el.hidden = true; }, 2600);
  }

  function initFooter() {
    var list = $("[data-foot-disciplines]");
    cat.disciplines.forEach(function (d) {
      var li = clone("tpl-link");
      var a = $("a", li);
      a.href = MROOT + "horses/?discipline=" + d.id;
      a.textContent = tr(d.name);
      list.appendChild(li);
    });
  }

  /* ---------- points ---------- */

  function pointsFor(total) { return Math.floor(total / 10); }

  function nextTier(points) {
    for (var i = 0; i < POINTS_TIERS.length; i += 1) {
      if (points < POINTS_TIERS[i]) { return { goal: POINTS_TIERS[i], name: t("tier_" + i) }; }
    }
    return null;
  }

  function paintPoints(scope, pending) {
    var line = $("[data-points-line]", scope);
    var fillEl = $("[data-points-fill]", scope);
    if (!line || !fillEl) { return; }
    var total = store.points + (pending || 0);
    var tier = nextTier(total);
    if (!tier) {
      line.textContent = t("points_top", { p: numberFormat.format(total) });
      fillEl.style.width = "100%";
      return;
    }
    var key = pending ? "points_line_pending" : "points_line";
    line.textContent = t(key, { p: numberFormat.format(store.points), add: numberFormat.format(pending || 0), left: numberFormat.format(tier.goal - total), tier: tier.name });
    fillEl.style.width = Math.max(4, Math.round(100 * total / tier.goal)) + "%";
  }

  /* ---------- home ---------- */

  function renderHome() {
    var tiles = $("[data-home-tiles]");
    cat.horse_categories.forEach(function (c) {
      var n = cat.horses.filter(function (h) { return h.category === c.id; }).length;
      var node = clone("tpl-tile");
      fill(node, { name: tr(c.name), count: t("count_listings", { n: n }) });
      setHref(node, MROOT + "horses/?category=" + c.id);
      tiles.appendChild(node);
    });
    cat.tack_categories.forEach(function (c) {
      var n = cat.tack.filter(function (x) { return x.category === c.id; }).length;
      var node = clone("tpl-tile");
      node.classList.add("mk-tiles__item--tack");
      fill(node, { name: tr(c.name), count: t("count_items", { n: n }) });
      setHref(node, MROOT + "tack/?category=" + c.id);
      tiles.appendChild(node);
    });

    var latest = cat.horses.slice().sort(function (a, b) { return a.listed_days - b.listed_days; }).slice(0, 12);
    var latestEl = $("[data-home-latest]");
    latest.forEach(function (h) { latestEl.appendChild(card(h)); });

    var discEl = $("[data-home-disciplines]");
    cat.disciplines.forEach(function (d) {
      var list = cat.horses.filter(function (h) { return h.discipline === d.id; });
      var from = Math.min.apply(null, list.map(function (h) { return h.price; }));
      var node = clone("tpl-feature");
      fill(node, { eyebrow: t("count_listings", { n: list.length }), name: tr(d.name), line: t("price_from", { p: money(from) }) });
      setHref(node, MROOT + "horses/?discipline=" + d.id);
      node.querySelector("[data-ph]").textContent = tr(d.name).charAt(0);
      discEl.appendChild(node);
    });

    var tackEl = $("[data-home-tack]");
    cat.tack.slice().sort(function (a, b) { return b.reviews - a.reviews; }).slice(0, 12)
      .forEach(function (x) { tackEl.appendChild(card(x)); });

    var makersEl = $("[data-home-makers]");
    cat.sellers.filter(function (s) { return s.kind === "maker"; }).forEach(function (s) {
      var node = clone("tpl-feature");
      node.classList.add("mk-slot--maker");
      fill(node, { eyebrow: t("since", { y: s.since }), name: tr(s.name), line: tr(s.line) });
      setHref(node, sellerUrl(s.id));
      node.querySelector("[data-ph]").textContent = tr(s.name).charAt(0);
      makersEl.appendChild(node);
    });

    paintPoints(document);
  }

  /* ---------- browse ---------- */

  function facetDefs(dept) {
    var sellerKind = function (item) { return index.seller[item.seller || item.brand].kind; };
    if (dept === "horses") {
      return {
        facets: [
          { id: "category", name: t("f_category"), values: cat.horse_categories, get: function (h) { return h.category; } },
          { id: "discipline", name: t("f_discipline"), values: cat.disciplines, get: function (h) { return h.discipline; } },
          { id: "breed", name: t("f_breed"), values: cat.breeds, get: function (h) { return h.breed; } },
          { id: "sex", name: t("f_sex"), values: Object.keys(cat.sexes).map(function (k) { return { id: k, name: cat.sexes[k] }; }), get: function (h) { return h.sex; } },
          { id: "region", name: t("f_region"), values: cat.regions, get: function (h) { return h.region; } },
          { id: "seller", name: t("f_seller"), values: ["stud", "state", "dealer", "private"].map(function (k) { return { id: k, name: cat.seller_kinds[k] }; }), get: sellerKind },
          { id: "cert", name: t("f_cert"), values: ["A", "B", "C"].map(function (k) { return { id: k, name: t("cert_" + k) }; }), get: function (h) { return h.certificate; } }
        ],
        ranges: [
          { id: "price", name: t("f_price"), get: function (h) { return h.price; } },
          { id: "age", name: t("f_age"), get: function (h) { return h.age; } },
          { id: "height", name: t("f_height"), get: function (h) { return h.height_cm; } }
        ]
      };
    }
    if (dept === "tack") {
      return {
        facets: [
          { id: "category", name: t("f_category"), values: cat.tack_categories, get: function (x) { return x.category; } },
          { id: "brand", name: t("f_brand"), values: cat.sellers.filter(function (s) { return s.kind === "maker"; }).map(function (s) { return { id: s.id, name: tr(s.name) }; }), get: function (x) { return x.brand; } }
        ],
        ranges: [{ id: "price", name: t("f_price"), get: basePrice }]
      };
    }
    return {
      facets: [{ id: "kind", name: t("f_kind"), values: [{ id: "horse", name: t("nav_horses") }, { id: "tack", name: t("nav_tack") }], get: function (x) { return x.kind; } }],
      ranges: [{ id: "price", name: t("f_price"), get: basePrice }]
    };
  }

  function renderBrowse() {
    var items = DEPT === "horses" ? cat.horses : DEPT === "tack" ? cat.tack : cat.horses.concat(cat.tack);
    var defs = facetDefs(DEPT);
    var params = query();
    var state = { q: params.get("q") || "", sort: params.get("sort") || "relevant", shown: PAGE_SIZE, sel: {}, range: {} };
    defs.facets.forEach(function (f) {
      var v = params.get(f.id);
      state.sel[f.id] = v ? v.split(",").filter(function (x) { return f.values.some(function (val) { return val.id === x; }); }) : [];
    });
    defs.ranges.forEach(function (r) {
      var lo = parseInt(params.get(r.id + "_min"), 10);
      var hi = parseInt(params.get(r.id + "_max"), 10);
      state.range[r.id] = { min: isNaN(lo) ? null : lo, max: isNaN(hi) ? null : hi };
    });

    var groupsEl = $("[data-filter-groups]");
    var resultsEl = $("[data-results]");
    var chipsEl = $("[data-chips]");
    var countEl = $("[data-browse-count]");
    var moreBtn = $("[data-more]");
    var emptyEl = $("[data-empty]");
    var qInput = $("[data-browse-q]");
    var sortSel = $("[data-sort]");
    var filtersEl = $("[data-filters]");
    var counters = {};

    qInput.value = state.q;
    sortSel.value = state.sort;
    if (DEPT === "all" && !state.q) { $("[data-browse-title]").textContent = t("title_search"); }

    defs.facets.forEach(function (f) {
      var group = clone("tpl-fgroup");
      fill(group, { name: f.name });
      var bodyEl = $("[data-body]", group);
      counters[f.id] = {};
      f.values.forEach(function (v) {
        var row = clone("tpl-fcheck");
        var input = $("input", row);
        input.name = f.id;
        input.value = v.id;
        input.checked = state.sel[f.id].indexOf(v.id) !== -1;
        fill(row, { name: tr(v.name) });
        counters[f.id][v.id] = { row: row, count: $('[data-f="count"]', row) };
        input.addEventListener("change", function () {
          var list = state.sel[f.id];
          var at = list.indexOf(v.id);
          if (input.checked && at === -1) { list.push(v.id); }
          if (!input.checked && at !== -1) { list.splice(at, 1); }
          state.shown = PAGE_SIZE;
          update();
        });
        bodyEl.appendChild(row);
      });
      groupsEl.appendChild(group);
    });

    defs.ranges.forEach(function (r) {
      var group = clone("tpl-fgroup");
      fill(group, { name: r.name });
      var range = clone("tpl-frange");
      var lo = $("[data-min]", range);
      var hi = $("[data-max]", range);
      var vals = items.map(r.get);
      lo.placeholder = String(Math.min.apply(null, vals));
      hi.placeholder = String(Math.max.apply(null, vals));
      if (state.range[r.id].min !== null) { lo.value = state.range[r.id].min; }
      if (state.range[r.id].max !== null) { hi.value = state.range[r.id].max; }
      function onRange() {
        var a = parseInt(lo.value, 10);
        var b = parseInt(hi.value, 10);
        state.range[r.id] = { min: isNaN(a) || a < 0 ? null : a, max: isNaN(b) || b < 0 ? null : b };
        state.shown = PAGE_SIZE;
        update();
      }
      lo.addEventListener("change", onRange);
      hi.addEventListener("change", onRange);
      $("[data-body]", group).appendChild(range);
      groupsEl.appendChild(group);
    });

    function matches(item, skipFacet) {
      for (var i = 0; i < defs.facets.length; i += 1) {
        var f = defs.facets[i];
        if (f.id !== skipFacet && state.sel[f.id].length && state.sel[f.id].indexOf(f.get(item)) === -1) { return false; }
      }
      for (var j = 0; j < defs.ranges.length; j += 1) {
        var r = defs.ranges[j];
        var v = r.get(item);
        var b = state.range[r.id];
        if ((b.min !== null && v < b.min) || (b.max !== null && v > b.max)) { return false; }
      }
      return true;
    }

    function writeUrl() {
      var p = new URLSearchParams();
      if (state.q) { p.set("q", state.q); }
      defs.facets.forEach(function (f) { if (state.sel[f.id].length) { p.set(f.id, state.sel[f.id].join(",")); } });
      defs.ranges.forEach(function (r) {
        if (state.range[r.id].min !== null) { p.set(r.id + "_min", state.range[r.id].min); }
        if (state.range[r.id].max !== null) { p.set(r.id + "_max", state.range[r.id].max); }
      });
      if (state.sort !== "relevant") { p.set("sort", state.sort); }
      var qs = p.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
      $$("[data-keep-query]").forEach(function (a) {
        a.setAttribute("href", a.getAttribute("href").split("?")[0] + (qs ? "?" + qs : ""));
      });
    }

    function renderChips() {
      clear(chipsEl);
      var active = 0;
      defs.facets.forEach(function (f) {
        state.sel[f.id].forEach(function (id) {
          var v = f.values.filter(function (x) { return x.id === id; })[0];
          var chip = clone("tpl-chip");
          fill(chip, { name: tr(v.name) });
          $("button", chip).addEventListener("click", function () {
            state.sel[f.id].splice(state.sel[f.id].indexOf(id), 1);
            $$('input[name="' + f.id + '"]', groupsEl).forEach(function (inp) { if (inp.value === id) { inp.checked = false; } });
            update();
          });
          chipsEl.appendChild(chip);
          active += 1;
        });
      });
      defs.ranges.forEach(function (r) {
        if (state.range[r.id].min !== null || state.range[r.id].max !== null) { active += 1; }
      });
      $("[data-filter-count]").textContent = active ? "(" + active + ")" : "";
    }

    function update() {
      var q = terms(state.q);
      var list = items.filter(function (item) { return matches(item) && (item._score = searchScore(item, q)) > 0; });
      var sorters = {
        relevant: function (a, b) { return (b._score - a._score) || (a.listed_days || 0) - (b.listed_days || 0); },
        "new": function (a, b) { return (a.listed_days || 0) - (b.listed_days || 0); },
        "price-asc": function (a, b) { return basePrice(a) - basePrice(b); },
        "price-desc": function (a, b) { return basePrice(b) - basePrice(a); }
      };
      list.sort(sorters[state.sort] || sorters.relevant);

      defs.facets.forEach(function (f) {
        var base = items.filter(function (item) { return matches(item, f.id) && searchScore(item, q) > 0; });
        f.values.forEach(function (v) {
          var n = base.filter(function (item) { return f.get(item) === v.id; }).length;
          var c = counters[f.id][v.id];
          c.count.textContent = String(n);
          c.row.classList.toggle("is-empty", n === 0);
        });
      });

      clear(resultsEl);
      list.slice(0, state.shown).forEach(function (item) { resultsEl.appendChild(card(item)); });
      countEl.textContent = t(DEPT === "tack" ? "count_items" : "count_listings", { n: list.length });
      moreBtn.hidden = list.length <= state.shown;
      emptyEl.hidden = list.length > 0;
      renderChips();
      writeUrl();
    }

    $("[data-browse-form]").addEventListener("submit", function (e) {
      e.preventDefault();
      state.q = qInput.value.trim().slice(0, 80);
      state.shown = PAGE_SIZE;
      update();
    });
    qInput.addEventListener("search", function () { if (!qInput.value) { state.q = ""; update(); } });
    sortSel.addEventListener("change", function () { state.sort = sortSel.value; update(); });
    moreBtn.addEventListener("click", function () { state.shown += PAGE_SIZE; update(); });
    $$("[data-filters-reset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        defs.facets.forEach(function (f) { state.sel[f.id] = []; });
        defs.ranges.forEach(function (r) { state.range[r.id] = { min: null, max: null }; });
        $$("input", groupsEl).forEach(function (inp) { if (inp.type === "checkbox") { inp.checked = false; } else { inp.value = ""; } });
        state.q = "";
        qInput.value = "";
        update();
      });
    });
    $("[data-filters-open]").addEventListener("click", function () { filtersEl.classList.add("is-open"); body.classList.add("is-locked"); });
    $("[data-filters-close]").addEventListener("click", function () { filtersEl.classList.remove("is-open"); body.classList.remove("is-locked"); });

    update();
  }

  /* ---------- item ---------- */

  function similar(item, n) {
    var pool = isHorse(item) ? cat.horses : cat.tack;
    var price = basePrice(item);
    return pool.filter(function (x) { return x.id !== item.id && x.category === item.category && (!isHorse(item) || x.discipline === item.discipline); })
      .sort(function (a, b) { return Math.abs(basePrice(a) - price) - Math.abs(basePrice(b) - price); })
      .slice(0, n);
  }

  function compareRows(item) {
    if (isHorse(item)) {
      return [
        [t("f_breed"), tr(index.breed[item.breed].name)],
        [t("f_age"), t("age_years", { n: item.age })],
        [t("f_height"), t("height_short", { cm: item.height_cm, hh: hands(item.height_cm) })],
        [t("trait_calm"), t("scale_" + item.temperament.calm)],
        [t("f_cert"), t("cert_" + item.certificate)],
        [t("f_region"), tr(index.region[item.region].name)]
      ];
    }
    var rows = [[t("f_brand"), tr(index.seller[item.brand].name)]];
    item.specs.forEach(function (s) { rows.push([tr(s.k), tr(s.v)]); });
    rows.push([t("rating"), t("rating_line", { r: numberFormat.format(item.rating), n: item.reviews })]);
    return rows;
  }

  function renderItem() {
    var id = query().get("id");
    var item = id && index.item[id];
    if (!item) { $("[data-notfound]").hidden = false; return; }
    var root = $("[data-item]");
    var horse = isHorse(item);
    root.hidden = false;
    root.classList.add(horse ? "is-horse" : "is-tack");
    $$("[data-only]", root).forEach(function (el) { if (el.getAttribute("data-only") !== item.kind) { el.remove(); } });
    document.title = item.name + " · " + t("market_name");

    var sellerId = horse ? item.seller : item.brand;
    var seller = index.seller[sellerId];
    fill(root, {
      name: item.name,
      eyebrow: eyebrow(item),
      line: tr(item.line),
      "price-from": horse ? money(item.price) : t("price_from", { p: money(basePrice(item)) }),
      certificate: item.certificate
    });
    var sl = $('[data-f="seller-link"]', root);
    sl.textContent = tr(seller.name);
    sl.href = sellerUrl(seller.id);
    $$("[data-buy-label]", root).forEach(function (a) { a.textContent = t(horse ? "reserve" : "buy"); });
    $("[data-buy-title]", root).textContent = t(horse ? "buy_title_horse" : "buy_title_tack", { name: item.name });

    var crumbDept = $("[data-crumb-dept]", root);
    crumbDept.textContent = t(horse ? "nav_horses" : "nav_tack");
    crumbDept.href = MROOT + (horse ? "horses/" : "tack/");
    var crumbCat = $("[data-crumb-cat]", root);
    crumbCat.textContent = tr((horse ? index.hcat : index.tcat)[item.category].name);
    crumbCat.href = MROOT + (horse ? "horses/" : "tack/") + "?category=" + item.category;

    initViewer(item, root);

    var hl = $("[data-highlights]", root);
    var highlights = horse ? [
      [String(item.age), t("hl_age")],
      [hands(item.height_cm) + " hh", t("hl_height", { cm: item.height_cm })],
      [item.certificate, t("hl_cert")],
      [tr(index.region[item.region].name), t("hl_region")]
    ] : item.specs.filter(function (s) { return tr(s.v).length <= 14; }).map(function (s) { return [tr(s.v), tr(s.k)]; })
      .concat([[String(item.offers.length), t("hl_sellers")], [numberFormat.format(item.rating), t("hl_rating", { n: item.reviews })]]);
    highlights.forEach(function (h) { hl.appendChild(fill(clone("tpl-highlight"), { value: h[0], label: h[1] })); });

    if (horse) {
      var bars = $("[data-temperament]", root);
      ["calm", "curiosity", "sensitivity", "energy"].forEach(function (k) {
        var node = clone("tpl-bar");
        var v = item.temperament[k];
        fill(node, { label: t("trait_" + k), word: t("scale_" + v) });
        $("[data-fill]", node).style.width = (v * 20) + "%";
        bars.appendChild(node);
      });
      ["training", "fits", "not_for"].forEach(function (key) {
        var ul = $('[data-list="' + key + '"]', root);
        item[key].forEach(function (line) { var li = clone("tpl-li"); li.textContent = tr(line); ul.appendChild(li); });
      });
      var rec = $("[data-record]", root);
      [
        [t("rec_passport"), item.passport],
        [t("rec_cert"), t("cert_" + item.certificate)],
        [t("rec_coat"), tr(item.coat) + ", " + tr(item.marking)],
        [t("rec_health"), item.health.map(tr).join("; ")],
        [t("rec_transfer"), t("rec_transfer_v")],
        [t("rec_listed"), t("listed_days", { n: item.listed_days })]
      ].forEach(function (r) { rec.appendChild(fill(clone("tpl-fact"), { k: r[0], v: r[1] })); });
    } else {
      var specs = $("[data-specs]", root);
      item.specs.forEach(function (s) { specs.appendChild(fill(clone("tpl-spec"), { k: tr(s.k), v: tr(s.v), rule: tr(s.rule) })); });
    }

    var cmp = $("[data-compare]", root);
    [item].concat(similar(item, 2)).forEach(function (x, i) {
      var col = clone("tpl-compare-col");
      fill(col, { badge: i === 0 ? t("compare_this") : eyebrow(x), name: x.name, price: cardPrice(x) });
      paintMedia(col, x);
      var dl = $("[data-rows]", col);
      compareRows(x).forEach(function (r) { dl.appendChild(fill(clone("tpl-row"), { k: r[0], v: r[1] })); });
      var link = $("[data-href]", col);
      if (i === 0) { link.href = "#buy"; link.textContent = t(horse ? "reserve" : "buy"); } else { link.href = itemUrl(x); }
      if (i === 0) { col.classList.add("is-current"); }
      cmp.appendChild(col);
    });

    var sc = clone("tpl-sellercard");
    fill(sc, { kind: tr(cat.seller_kinds[seller.kind]), name: tr(seller.name), line: tr(seller.line) });
    var facts = $("[data-facts]", sc);
    sellerFacts(seller).forEach(function (r) { facts.appendChild(fill(clone("tpl-fact"), { k: r[0], v: r[1] })); });
    setHref(sc, sellerUrl(seller.id));
    $("[data-sellercard]", root).appendChild(sc);

    var rel = $("[data-related]", root);
    var pool = horse ? cat.horses : cat.tack;
    pool.filter(function (x) { return x.id !== item.id && x.category === item.category; }).slice(0, 10)
      .forEach(function (x) { rel.appendChild(card(x)); });

    initBuy(item, root);
    initLocalNav(root);
  }

  function initViewer(item, root) {
    var stage = $("[data-stage]", root);
    var img = $("[data-stage-img]", root);
    var ph = $("[data-stage-ph]", root);
    var label = $("[data-stage-view]", root);
    var dial = $("[data-dial]", root);
    var modesEl = $("[data-modes]", root);
    var modes = Object.keys(cat.views[item.kind]);
    var state = { mode: modes[0], i: 0 };
    stage.style.setProperty("--tone", item.tone);

    function show() {
      var list = views(item, state.mode);
      var v = list[state.i];
      dial.max = String(list.length - 1);
      dial.value = String(state.i);
      dial.setAttribute("aria-valuetext", v.name);
      label.textContent = v.name;
      stage.setAttribute("aria-label", item.name + ": " + v.name);
      stage.style.setProperty("--turn", String(state.i / list.length));
      if (v.src) { img.src = v.src; img.alt = item.name + ": " + v.name; img.hidden = false; ph.hidden = true; } else { img.hidden = true; ph.hidden = false; }
      $$("[role=tab]", modesEl).forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-mode") === state.mode)); });
    }

    modes.forEach(function (m) {
      var b = clone("tpl-mode");
      b.textContent = t("mode_" + m);
      b.setAttribute("data-mode", m);
      b.addEventListener("click", function () { state.mode = m; state.i = 0; show(); });
      modesEl.appendChild(b);
    });

    dial.addEventListener("input", function () { state.i = Number(dial.value); show(); });

    function step(d) {
      var n = views(item, state.mode).length;
      state.i = (state.i + d + n) % n;
      show();
    }
    stage.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { step(1); e.preventDefault(); }
      if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); }
    });
    var drag = null;
    stage.addEventListener("pointerdown", function (e) { drag = { x: e.clientX }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener("pointermove", function (e) {
      if (!drag) { return; }
      var dx = e.clientX - drag.x;
      if (Math.abs(dx) > 40) { step(dx < 0 ? 1 : -1); drag.x = e.clientX; root.classList.add("is-turned"); }
    });
    stage.addEventListener("pointerup", function () { drag = null; });
    stage.addEventListener("pointercancel", function () { drag = null; });

    var sw = $("[data-viewer-swatches]", root);
    if (!isHorse(item)) {
      item.options.filter(function (o) { return o.values.some(function (v) { return v.tone; }); }).slice(0, 1).forEach(function (o) {
        o.values.forEach(function (v, i) {
          var node = clone("tpl-swatch");
          var input = $("input", node);
          input.name = "viewer-" + o.id;
          input.value = v.id;
          input.checked = i === 0;
          $("[data-dot]", node).style.background = v.tone;
          fill(node, { name: tr(v.name) });
          input.addEventListener("change", function () {
            stage.style.setProperty("--tone", v.tone);
            var buyInput = $('[data-buy-form] input[name="opt-' + o.id + '"][value="' + v.id + '"]');
            if (buyInput && !buyInput.checked) { buyInput.checked = true; buyInput.dispatchEvent(new Event("change", { bubbles: true })); }
          });
          sw.appendChild(node);
        });
      });
    }
    show();
  }

  function choice(name, value, title, line, price, checked) {
    var node = clone("tpl-choice");
    var input = $("input", node);
    input.name = name;
    input.value = value;
    input.checked = !!checked;
    fill(node, { name: title, line: line || "", price: price });
    return node;
  }

  function initBuy(item, root) {
    var form = $("[data-buy-form]", root);
    var totalEl = $("[data-total]", root);
    var earnEl = $("[data-points-earn]", root);
    var media = $("[data-buy-media]", root);
    var fig = clone("tpl-card").querySelector("[data-media]");
    media.appendChild(fig);
    paintMedia(fig, item);

    if (isHorse(item)) {
      var plans = $("[data-plans]", root);
      cat.plans.forEach(function (p, i) {
        var best = i === cat.plans.length - 1;
        var node = choice("plan", p.id, tr(p.name), tr(p.line), p.price ? "+ " + money(p.price) : t("included"), best);
        if (best) { node.classList.add("is-best"); node.setAttribute("data-badge", t("best_value")); }
        plans.appendChild(node);
      });
      var del = $("[data-delivery]", root);
      cat.delivery.forEach(function (d, i) {
        del.appendChild(choice("delivery", d.id, tr(d.name), d.id === "transport" ? t("delivery_transport_line") : t("delivery_collect_line"), d.price ? "+ " + money(d.price) : t("included"), i === 0));
      });
    } else {
      var opts = $("[data-options]", root);
      item.options.forEach(function (o) {
        var group = clone("tpl-option-group");
        fill(group, { name: tr(o.name) });
        var list = $("[data-body]", group);
        o.values.forEach(function (v, i) {
          var node;
          if (v.tone) {
            node = clone("tpl-swatch");
            var input = $("input", node);
            input.name = "opt-" + o.id;
            input.value = v.id;
            input.checked = i === 0;
            $("[data-dot]", node).style.background = v.tone;
            fill(node, { name: tr(v.name) });
            list.classList.add("mk-choice__list--swatches");
          } else {
            node = choice("opt-" + o.id, v.id, tr(v.name), "", v.delta ? "+ " + money(v.delta) : "", i === 0);
          }
          list.appendChild(node);
        });
        opts.appendChild(group);
      });
      var offers = $("[data-offers]", root);
      var low = lowestOffer(item);
      item.offers.forEach(function (o) {
        var s = index.seller[o.seller];
        var line = t("dispatch_days", { n: o.days }) + (o === low ? " · " + t("lowest_price") : "");
        offers.appendChild(choice("offer", o.seller, tr(s.name), line, money(o.price), o === low));
      });
    }

    function selection() {
      var data = new FormData(form);
      var sel = { id: item.id, kind: item.kind, opts: {} };
      if (isHorse(item)) {
        sel.plan = data.get("plan");
        sel.delivery = data.get("delivery");
      } else {
        sel.offer = data.get("offer");
        item.options.forEach(function (o) { sel.opts[o.id] = data.get("opt-" + o.id); });
      }
      return sel;
    }

    function update() {
      var total = linePrice(selection());
      totalEl.textContent = total === null ? "—" : money(total);
      earnEl.textContent = total === null ? "" : t("points_earn", { p: numberFormat.format(pointsFor(total)) });
    }

    form.addEventListener("change", function (e) {
      var tgt = e.target;
      if (tgt.name && tgt.name.indexOf("opt-") === 0) {
        var vs = $('[data-viewer-swatches] input[name="viewer-' + tgt.name.slice(4) + '"][value="' + tgt.value + '"]', root);
        if (vs && !vs.checked) { vs.checked = true; vs.dispatchEvent(new Event("change")); }
      }
      update();
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var sel = selection();
      var err = $("[data-buy-error]", root);
      if (linePrice(sel) === null) { err.hidden = false; return; }
      err.hidden = true;
      if (isHorse(item)) {
        store.bag = store.bag.filter(function (b) { return b.id !== item.id; });
      }
      store.bag.push(sel);
      saveStore(store);
      updateBagCount();
      toast(t("added", { name: item.name }));
      window.setTimeout(function () { location.href = MROOT + "bag/"; }, 700);
    });
    update();
  }

  function linePrice(sel) {
    var item = index.item[sel.id];
    if (!item) { return null; }
    if (isHorse(item)) {
      var plan = cat.plans.filter(function (p) { return p.id === sel.plan; })[0];
      var del = cat.delivery.filter(function (d) { return d.id === sel.delivery; })[0];
      if (!plan || !del) { return null; }
      return item.price + plan.price + del.price;
    }
    var offer = item.offers.filter(function (o) { return o.seller === sel.offer; })[0];
    if (!offer) { return null; }
    var total = offer.price;
    for (var i = 0; i < item.options.length; i += 1) {
      var o = item.options[i];
      var v = o.values.filter(function (x) { return x.id === (sel.opts || {})[o.id]; })[0];
      if (!v) { return null; }
      total += v.delta;
    }
    return total;
  }

  function lineDetails(sel) {
    var item = index.item[sel.id];
    if (isHorse(item)) {
      var plan = cat.plans.filter(function (p) { return p.id === sel.plan; })[0];
      var del = cat.delivery.filter(function (d) { return d.id === sel.delivery; })[0];
      return { meta: horseMeta(item), extra: tr(plan.name) + " · " + tr(del.name) };
    }
    var opts = item.options.map(function (o) {
      var v = o.values.filter(function (x) { return x.id === sel.opts[o.id]; })[0];
      return tr(o.name) + ": " + tr(v.name);
    });
    return { meta: opts.join(" · "), extra: t("sold_by") + " " + tr(index.seller[sel.offer].name) };
  }

  function initLocalNav(root) {
    var nav = $("[data-localnav]", root);
    var hero = $(".mk-hero", root);
    if (!("IntersectionObserver" in window)) { return; }
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { nav.classList.toggle("is-stuck", !en.isIntersecting && en.boundingClientRect.top < 0); });
    }).observe(hero);
  }

  /* ---------- sellers ---------- */

  function sellerFacts(s) {
    var n = cat.horses.filter(function (h) { return h.seller === s.id; }).length +
      cat.tack.filter(function (x) { return x.offers.some(function (o) { return o.seller === s.id; }); }).length;
    return [
      [t("seller_licence"), s.licence],
      [t("seller_since"), String(s.since)],
      [t("f_region"), tr(index.region[s.region].name)],
      [t("seller_listings"), String(n)]
    ];
  }

  function sellerItems(id) {
    return cat.horses.filter(function (h) { return h.seller === id; })
      .concat(cat.tack.filter(function (x) { return x.offers.some(function (o) { return o.seller === id; }); }));
  }

  function renderSellers() {
    var wrap = $("[data-seller-groups]");
    ["state", "stud", "dealer", "maker", "shop", "private"].forEach(function (kind) {
      var list = cat.sellers.filter(function (s) { return s.kind === kind; });
      if (!list.length) { return; }
      var group = clone("tpl-seller-group");
      fill(group, { name: tr(cat.seller_kinds[kind]) });
      var ul = $("[data-body]", group);
      list.forEach(function (s) {
        var tile = clone("tpl-seller-tile");
        fill(tile, { name: tr(s.name), line: tr(s.line), meta: t("seller_meta", { y: s.since, r: tr(index.region[s.region].name), n: sellerItems(s.id).length }) });
        setHref(tile, sellerUrl(s.id));
        ul.appendChild(tile);
      });
      wrap.appendChild(group);
    });
  }

  function renderSeller() {
    var s = index.seller[query().get("id")];
    if (!s) { $("[data-notfound]").hidden = false; return; }
    document.title = tr(s.name) + " · " + t("market_name");
    var head = $("[data-seller]");
    head.hidden = false;
    fill(head, { kind: tr(cat.seller_kinds[s.kind]), name: tr(s.name), line: tr(s.line) });
    var facts = $("[data-seller-facts]");
    sellerFacts(s).forEach(function (r) { facts.appendChild(fill(clone("tpl-fact"), { k: r[0], v: r[1] })); });
    var bodyEl = $("[data-seller-body]");
    bodyEl.hidden = false;
    var grid = $("[data-results]", bodyEl);
    sellerItems(s.id).forEach(function (x) { grid.appendChild(card(x)); });
  }

  /* ---------- bag ---------- */

  function fitSize(h) {
    if (h.height_cm <= 148) { return "pony"; }
    if (h.height_cm <= 160) { return "cob"; }
    return "full";
  }

  function renderBag() {
    var view = $("[data-bag-view]");
    var listEl = $("[data-bag-list]");
    var rowsEl = $("[data-bag-rows]");
    var form = $("[data-check]");
    var regionSel = $("[data-region-select]");
    cat.regions.forEach(function (r) {
      var opt = clone("tpl-option");
      opt.value = r.id;
      opt.textContent = tr(r.name);
      regionSel.appendChild(opt);
    });

    store.bag = store.bag.filter(function (b) { return linePrice(b) !== null; });

    function draw() {
      var lines = store.bag;
      var total = lines.reduce(function (sum, b) { return sum + linePrice(b); }, 0);
      $("[data-bag-title]").textContent = lines.length ? t("bag_title_total", { p: money(total) }) : t("bag_title");
      $("[data-bag-sub]").textContent = lines.length ? t("bag_sub") : "";
      $("[data-bag-empty]").hidden = lines.length > 0;
      $("[data-bag-body]").hidden = lines.length === 0;
      clear(listEl);
      lines.forEach(function (b, i) {
        var item = index.item[b.id];
        var node = clone("tpl-bag-line");
        var d = lineDetails(b);
        fill(node, { name: item.name, meta: d.meta, extra: d.extra, price: money(linePrice(b)) });
        setHref(node, itemUrl(item));
        paintMedia(node, item);
        $("[data-remove]", node).addEventListener("click", function () {
          store.bag.splice(i, 1);
          saveStore(store);
          updateBagCount();
          draw();
        });
        listEl.appendChild(node);
      });
      clear(rowsEl);
      [[t("subtotal"), money(total)], [t("points_name"), t("points_earn", { p: numberFormat.format(pointsFor(total)) })]]
        .forEach(function (r) { rowsEl.appendChild(fill(clone("tpl-row"), { k: r[0], v: r[1] })); });
      $("[data-bag-total]").textContent = money(total);
      paintPoints(view, pointsFor(total));
      $("[data-suitability]").hidden = !lines.some(function (b) { return b.kind === "horse"; });
      drawRecs();
    }

    function drawRecs() {
      var wrap = $("[data-recs-wrap]");
      var ul = $("[data-recs]");
      clear(ul);
      var inBag = store.bag.map(function (b) { return b.id; });
      var horse = store.bag.map(function (b) { return index.item[b.id]; }).filter(isHorse)[0];
      var wanted = horse ? ["bridles", "halters", "pads", "rugs"] : ["halters", "grooming", "hoof", "rugs"];
      var picks = wanted.map(function (c) {
        return cat.tack.filter(function (x) { return x.category === c && inBag.indexOf(x.id) === -1; })
          .sort(function (a, b) { return b.reviews - a.reviews; })[0];
      }).filter(Boolean);
      $("[data-recs-title]").textContent = horse ? t("recs_title_horse", { name: horse.name, size: t("size_" + fitSize(horse)) }) : t("recs_title");
      picks.forEach(function (x) { ul.appendChild(card(x)); });
      wrap.hidden = picks.length === 0;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var errors = [];
      var hasHorse = store.bag.some(function (b) { return b.kind === "horse"; });
      var data = new FormData(form);
      if (hasHorse) {
        if (!data.get("company")) { errors.push(t("err_company_missing")); }
        if (data.get("company") === "no") { errors.push(t("err_company_no")); }
        if (!data.get("premises")) { errors.push(t("err_premises_missing")); }
        if (data.get("premises") === "none") { errors.push(t("err_premises_none")); }
        if (!data.get("experience")) { errors.push(t("err_experience")); }
        if (!data.get("vet") || !data.get("farrier") || !data.get("disqualified")) { errors.push(t("err_care")); }
      }
      var name = String(data.get("name") || "").trim();
      var email = String(data.get("email") || "").trim();
      if (name.length < 2) { errors.push(t("err_name")); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(t("err_email")); }
      if (!data.get("region")) { errors.push(t("err_region")); }
      var errEl = $("[data-check-errors]");
      clear(errEl);
      errors.forEach(function (msg) { var li = clone("tpl-li"); li.textContent = msg; errEl.appendChild(li); });
      errEl.hidden = errors.length === 0;
      if (errors.length) { errEl.scrollIntoView({ block: "center", behavior: "smooth" }); return; }

      var total = store.bag.reduce(function (sum, b) { return sum + linePrice(b); }, 0);
      store.points += pointsFor(total);
      store.bag = [];
      saveStore(store);
      updateBagCount();
      view.hidden = true;
      var done = $("[data-done]");
      $("[data-done-ref]").textContent = t("done_ref", { ref: "IM-" + Date.now().toString(36).toUpperCase() });
      done.hidden = false;
      done.focus();
      window.scrollTo(0, 0);
    });

    draw();
  }

  /* ---------- boot ---------- */

  function buildIndex() {
    cat.horses.concat(cat.tack).forEach(function (x) { index.item[x.id] = x; });
    cat.sellers.forEach(function (s) { index.seller[s.id] = s; });
    cat.regions.forEach(function (r) { index.region[r.id] = r; });
    cat.breeds.forEach(function (b) { index.breed[b.id] = b; });
    cat.horse_categories.forEach(function (c) { index.hcat[c.id] = c; });
    cat.tack_categories.forEach(function (c) { index.tcat[c.id] = c; });
    cat.disciplines.forEach(function (d) { index.disc[d.id] = d; });
  }

  var PAGES = { index: renderHome, browse: renderBrowse, item: renderItem, sellers: renderSellers, seller: renderSeller, bag: renderBag };

  function getJson(path) {
    return fetch(ROOT + path, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) { throw new Error(path + " " + r.status); }
      return r.json();
    });
  }

  initChrome();
  Promise.all([getJson("assets/data/market/catalog.json"), getJson("assets/data/market/text.json")])
    .then(function (res) {
      cat = res[0];
      text = res[1];
      buildIndex();
      initSearch();
      initFooter();
      if (PAGES[PAGE]) { PAGES[PAGE](); }
    })
    .catch(function () { $("[data-load-error]").hidden = false; });
}());
