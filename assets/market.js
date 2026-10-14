/* Imperial Market: renders listings from assets/data/market/catalog.json and
   horses.json into the <template> elements of each page. UI strings come from
   assets/data/market/text.json. The shortlist, viewings, bag, stamp card and
   saved searches live in localStorage. */
(function () {
  "use strict";

  var body = document.body;
  var LANG = body.getAttribute("data-lang") || "en";
  var ROOT = body.getAttribute("data-root") || "";
  var MROOT = body.getAttribute("data-mroot") || "./";
  var PAGE = body.getAttribute("data-page");
  var STORE_KEY = "hrossagrith-market";
  var VIEW_NAMES = {
    horse: { exterior: ["left", "front_left", "front", "front_right", "right", "rear_right", "rear", "rear_left"], detail: ["head", "back", "legs", "hooves"] },
    tack: { exterior: ["left", "front_left", "front", "front_right", "right", "rear_right", "rear", "rear_left"], interior: ["underside", "lining", "fittings", "stitching"] }
  };
  var FACETS = ["breed", "cat", "disc", "sex", "region", "seller", "cert", "trait"];
  var RANGES = ["price", "age", "cm"];
  var TRAITS = ["calm", "curious", "sensitive", "energy"];

  var cat = null;
  var text = null;
  var horses = [];
  var index = { item: {}, seller: {}, region: {}, breed: {}, tcat: {} };
  var vocab = [];

  /* ---------- helpers ---------- */

  function fmt(template, vars) {
    return Object.keys(vars).reduce(function (s, k) { return s.split("{" + k + "}").join(String(vars[k])); }, template);
  }

  function t(key, vars) {
    var entry = text[key];
    var out = entry ? (entry[LANG] || entry.en) : key;
    return vars ? fmt(out, vars) : out;
  }

  var num = new Intl.NumberFormat("en-GB");
  function money(n) { return num.format(n) + " " + cat.currency.short; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function lower(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

  function clone(id) { return document.getElementById(id).content.firstElementChild.cloneNode(true); }

  function fill(node, map) {
    Object.keys(map).forEach(function (key) {
      Array.prototype.forEach.call(node.querySelectorAll('[data-f="' + key + '"]'), function (el) { el.textContent = map[key]; });
    });
    return node;
  }

  function setHref(node, href) {
    if (node.hasAttribute("data-href")) { node.setAttribute("href", href); }
    Array.prototype.forEach.call(node.querySelectorAll("[data-href]"), function (el) { el.setAttribute("href", href); });
    return node;
  }

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); }
  function clear(el) { while (el.firstChild) { el.removeChild(el.firstChild); } }
  function query() { return new URLSearchParams(location.search); }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function roundTo(n, step) { return Math.round(n / step) * step; }
  function kindName(id) { return cat.seller_kinds.filter(function (k) { return k.id === id; })[0].name; }

  function quantile(sorted, q) {
    if (!sorted.length) { return 0; }
    var pos = (sorted.length - 1) * q;
    var lo = Math.floor(pos);
    var hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  /* ---------- store ---------- */

  function loadStore() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { data = null; }
    if (!data || typeof data !== "object") { data = {}; }
    ["bag", "shortlist", "viewings", "searches", "ads", "orders"].forEach(function (k) { if (!Array.isArray(data[k])) { data[k] = []; } });
    if (typeof data.stamps !== "number") { data.stamps = -1; }
    data.plus = data.plus === true;
    return data;
  }

  var store = loadStore();

  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* storage unavailable: state lasts for this page only */ }
    updateCounts();
  }

  /* ---------- listings ---------- */

  function decodeHorses(data) {
    var f = {};
    data.fields.forEach(function (name, i) { f[name] = i; });
    horses = data.rows.map(function (r) {
      var disc = cat.disciplines[r[f.disc]];
      var region = cat.regions[r[f.region]];
      var coat = cat.coats[r[f.coat]];
      var names = r[f.sex] === 0 || r[f.sex] === 2 ? cat.names.female : cat.names.male;
      var health = cat.copy.health.filter(function (line, k) { return r[f.health] & (1 << k); });
      var h = {
        id: data.id_prefix + (data.id_base + r[f.n]), n: r[f.n], kind: "horse", loan: r[f.loan] === 1,
        name: names[r[f.name]], breed: cat.breeds[r[f.breed]], cat: cat.horse_categories[r[f.cat]], disc: disc, sex: cat.sexes[r[f.sex]],
        age: r[f.age], cm: r[f.cm], coat: coat, tone: coat.tone, mark: cat.markings[r[f.mark]],
        region: region, town: region.towns[r[f.town]], seller: cat.sellers[r[f.seller]], price: r[f.price],
        cert: ["A", "B", "C"][r[f.cert]],
        temperament: { calm: r[f.calm], curious: r[f.curious], sensitive: r[f.sensitive], energy: r[f.energy] },
        days: r[f.days], health: health, notfor: cat.copy.not_for[r[f.notfor]], scene: cat.copy.scenes[disc.id][r[f.scene]], titleN: r[f.title]
      };
      index.item[h.id] = h;
      return h;
    });
  }

  function isHorse(item) { return item.kind === "horse"; }
  function itemUrl(item) { return MROOT + "item/?id=" + encodeURIComponent(item.id); }
  function sellerUrl(id) { return MROOT + "seller/?id=" + encodeURIComponent(id); }

  function hands(cm) {
    var inches = Math.round(cm / 2.54);
    return Math.floor(inches / 4) + "." + (inches % 4);
  }

  function leadTrait(h) {
    var best = null;
    TRAITS.forEach(function (k) { if (h.temperament[k] >= 4 && (!best || h.temperament[k] > h.temperament[best])) { best = k; } });
    return best || "default";
  }

  function horseTitle(h) {
    var words = cat.copy.title_words[leadTrait(h)];
    return t("title_pattern", { word: words[h.titleN % words.length], hh: hands(h.cm), breed: h.breed.name, sex: h.sex.name, age: h.age });
  }

  function height(cm) { return t("height_short", { hh: hands(cm), cm: cm }); }

  function horseFacts(h) {
    return [h.breed.name, h.sex.name, t("age_years", { n: h.age }), height(h.cm), h.coat.name].join(" · ");
  }

  function horsePrice(h) { return h.loan ? t("per_month", { p: money(h.price) }) : money(h.price); }

  function lowestOffer(item) {
    return item.offers.reduce(function (best, o) { return !best || o.price < best.price ? o : best; }, null);
  }

  function basePrice(item) { return isHorse(item) ? item.price : lowestOffer(item).price; }

  function views(item, mode) {
    var names = VIEW_NAMES[item.kind][mode];
    var files = (cat.images[item.id] && cat.images[item.id][mode]) || [];
    var out = [];
    for (var i = 0; i < cat.views[item.kind][mode]; i += 1) {
      out.push({ name: t("view_" + names[i]), src: files[i] ? ROOT + cat.image_root + item.id + "/" + files[i] : "" });
    }
    return out;
  }

  function paintMedia(node, item) {
    var fig = node.hasAttribute("data-media") ? node : node.querySelector("[data-media]");
    if (!fig) { return; }
    fig.style.setProperty("--tone", item.tone);
    var shot = views(item, "exterior")[0];
    var img = fig.querySelector("img");
    var ph = fig.querySelector("[data-ph]");
    if (shot.src) {
      img.src = shot.src;
      img.alt = item.name;
      img.hidden = false;
      ph.hidden = true;
    } else {
      ph.textContent = item.name.charAt(0);
    }
  }

  function tackEyebrow(x) { return index.seller[x.brand].name + " · " + index.tcat[x.category].name; }

  function tackRatingLine(x) {
    if (x.rating) { return t("rating_line", { q: x.rating.quality, v: x.rating.value, n: num.format(x.rating.count) }); }
    var brand = index.seller[x.brand];
    return t("house_line", { y: brand.since, place: index.region[brand.region].name });
  }

  function card(item) {
    var node = clone("tpl-card");
    if (isHorse(item)) {
      fill(node, { eyebrow: item.loan ? t("type_loan") : item.disc.name, name: item.name, line: item.scene, meta: horseFacts(item) + " · " + item.town, price: horsePrice(item) });
    } else {
      fill(node, { eyebrow: tackEyebrow(item), name: item.name, line: item.line, meta: tackRatingLine(item), price: t("price_from", { p: money(basePrice(item)) }) });
    }
    setHref(node, itemUrl(item));
    paintMedia(node, item);
    return node;
  }

  /* ---------- search state ---------- */

  function emptyState() {
    var s = { loan: 0, q: "", sort: "best", page: 1, sel: {}, range: {} };
    FACETS.forEach(function (f) { s.sel[f] = []; });
    RANGES.forEach(function (r) { s.range[r] = { min: null, max: null }; });
    return s;
  }

  function cloneState(s) { return JSON.parse(JSON.stringify(s)); }

  function facetValues(f) {
    switch (f) {
      case "breed": return cat.breeds;
      case "cat": return cat.horse_categories;
      case "disc": return cat.disciplines;
      case "sex": return cat.sexes;
      case "region": return cat.regions;
      case "seller": return cat.seller_kinds.filter(function (k) { return ["stud", "dealer", "private", "state"].indexOf(k.id) !== -1; });
      case "cert": return ["A", "B", "C"].map(function (k) { return { id: k, name: t("cert_" + k) }; });
      case "trait": return TRAITS.map(function (k) { return { id: k, name: t("trait_" + k) }; });
    }
    return [];
  }

  function facetGet(f, h) {
    switch (f) {
      case "breed": return h.breed.id;
      case "cat": return h.cat.id;
      case "disc": return h.disc.id;
      case "sex": return h.sex.id;
      case "region": return h.region.id;
      case "seller": return h.seller.kind;
      case "cert": return h.cert;
    }
    return null;
  }

  function rangeGet(r, h) { return r === "price" ? h.price : r === "age" ? h.age : h.cm; }

  function stateFromUrl(params) {
    var s = emptyState();
    s.loan = params.get("loan") === "1" ? 1 : 0;
    s.sort = params.get("sort") || "best";
    s.page = Math.max(1, parseInt(params.get("page"), 10) || 1);
    FACETS.forEach(function (f) {
      var v = params.get(f);
      if (v) { s.sel[f] = v.split(",").filter(function (x) { return facetValues(f).some(function (val) { return val.id === x; }); }); }
    });
    RANGES.forEach(function (r) {
      var lo = parseInt(params.get(r + "_min"), 10);
      var hi = parseInt(params.get(r + "_max"), 10);
      s.range[r] = { min: isNaN(lo) ? null : lo, max: isNaN(hi) ? null : hi };
    });
    var q = (params.get("q") || "").trim().slice(0, 120);
    if (q) { mergeParsed(s, parseQuery(q)); }
    return s;
  }

  function horsesUrl(s, page) {
    var p = new URLSearchParams();
    if (s.loan) { p.set("loan", "1"); }
    if (s.q) { p.set("q", s.q); }
    FACETS.forEach(function (f) { if (s.sel[f].length) { p.set(f, s.sel[f].join(",")); } });
    RANGES.forEach(function (r) {
      if (s.range[r].min !== null) { p.set(r + "_min", s.range[r].min); }
      if (s.range[r].max !== null) { p.set(r + "_max", s.range[r].max); }
    });
    if (s.sort && s.sort !== "best") { p.set("sort", s.sort); }
    if (page > 1) { p.set("page", page); }
    var qs = p.toString();
    return MROOT + "horses/" + (qs ? "?" + qs : "");
  }

  function matches(h, s, skip) {
    if ((h.loan ? 1 : 0) !== s.loan) { return false; }
    for (var i = 0; i < FACETS.length; i += 1) {
      var f = FACETS[i];
      if (f === skip || !s.sel[f].length) { continue; }
      if (f === "trait") {
        for (var k = 0; k < s.sel.trait.length; k += 1) { if (h.temperament[s.sel.trait[k]] < 4) { return false; } }
      } else if (s.sel[f].indexOf(facetGet(f, h)) === -1) { return false; }
    }
    for (var j = 0; j < RANGES.length; j += 1) {
      var r = RANGES[j];
      if (r === skip) { continue; }
      var v = rangeGet(r, h);
      var b = s.range[r];
      if ((b.min !== null && v < b.min) || (b.max !== null && v > b.max)) { return false; }
    }
    if (s.q) {
      var hay = h._hay || (h._hay = (h.name + " " + h.town + " " + h.seller.name + " " + h.coat.name + " " + h.mark).toLowerCase());
      var words = s.q.toLowerCase().split(/\s+/);
      for (var w = 0; w < words.length; w += 1) { if (words[w] && hay.indexOf(words[w]) === -1) { return false; } }
    }
    return true;
  }

  function run(s) { return horses.filter(function (h) { return matches(h, s); }); }

  function sortList(list, s) {
    list.forEach(function (h) {
      var v = (60 - h.days) / 30 + (h.seller.reply_h <= 4 ? 0.5 : 0);
      s.sel.trait.forEach(function (k) { v += h.temperament[k]; });
      if (s.q && h.name.toLowerCase().indexOf(s.q.toLowerCase()) === 0) { v += 10; }
      h._score = v;
    });
    var sorters = {
      best: function (a, b) { return (b._score - a._score) || (a.n - b.n); },
      "new": function (a, b) { return (a.days - b.days) || (a.n - b.n); },
      "price-asc": function (a, b) { return (a.price - b.price) || (a.n - b.n); },
      "price-desc": function (a, b) { return (b.price - a.price) || (a.n - b.n); }
    };
    return list.sort(sorters[s.sort] || sorters.best);
  }

  function priceBand(list) {
    var prices = list.map(function (h) { return h.price; }).sort(function (a, b) { return a - b; });
    if (prices.length < 5) { return null; }
    var step = prices[0] < 300 ? 5 : 50;
    return { lo: roundTo(quantile(prices, 0.25), step), hi: roundTo(quantile(prices, 0.75), step), n: prices.length };
  }

  /* ---------- query parsing: a short query becomes a specific one ---------- */

  function buildVocab() {
    function add(words, facet, id) { words.forEach(function (w) { vocab.push({ w: w.toLowerCase(), facet: facet, id: id }); }); }
    cat.breeds.forEach(function (b) { add([b.name, b.plural].concat(b.words), "breed", b.id); });
    cat.horse_categories.forEach(function (c) { add(c.words, "cat", c.id); });
    cat.disciplines.forEach(function (d) { add([d.name].concat(d.words), "disc", d.id); });
    cat.sexes.forEach(function (x) { add(x.words, "sex", x.id); });
    cat.regions.forEach(function (r) { add([r.name], "region", r.id); });
    Object.keys(cat.copy.title_words).forEach(function (k) { if (k !== "default") { add(cat.copy.title_words[k], "trait", k); } });
    add(cat.vocabulary.loan, "loan", 1);
    add(cat.vocabulary.sale, "loan", 0);
    vocab.sort(function (a, b) { return b.w.length - a.w.length; });
  }

  function parseNumber(str) {
    var m = String(str).replace(/,/g, "").match(/^(\d+(?:\.\d+)?)(k?)$/i);
    return m ? Math.round(parseFloat(m[1]) * (m[2] ? 1000 : 1)) : null;
  }

  function parseQuery(input) {
    var out = { sel: {}, range: {}, loan: null, rest: [] };
    var str = " " + input.toLowerCase().replace(/[“”"!?;:()]/g, " ").replace(/\s+/g, " ") + " ";
    var under = "(?:" + cat.vocabulary.under.map(escapeRe).join("|") + ")";
    var over = "(?:" + cat.vocabulary.over.map(escapeRe).join("|") + ")";
    var isUnder = new RegExp("^" + under + "$");

    function setRange(key, dir, v, spread) {
      if (dir && isUnder.test(dir)) { out.range[key] = { min: null, max: v }; }
      else if (dir) { out.range[key] = { min: v, max: null }; }
      else { out.range[key] = { min: v - spread, max: v + spread }; }
    }

    str = str.replace(new RegExp("(" + under + "|" + over + ")?\\s*(\\d{1,2})(?:\\.(\\d))?\\s*hh\\b", "g"), function (m, dir, h, i) {
      setRange("cm", dir, Math.round((parseInt(h, 10) * 4 + (i ? parseInt(i, 10) : 0)) * 2.54), 3);
      return " ";
    });
    str = str.replace(new RegExp("(" + under + "|" + over + ")?\\s*(\\d{2,3})\\s*cm\\b", "g"), function (m, dir, v) {
      setRange("cm", dir, parseInt(v, 10), 3);
      return " ";
    });
    str = str.replace(new RegExp("(" + under + "|" + over + ")?\\s*(\\d{1,2})\\s*(?:yo|y/o|yrs?|years?)\\b", "g"), function (m, dir, v) {
      setRange("age", dir, parseInt(v, 10), 1);
      return " ";
    });
    str = str.replace(new RegExp("(" + under + "|" + over + ")\\s*(\\d[\\d,]*(?:\\.\\d+)?k?)\\s*(?:cr|crowns)?(?=\\s|$)", "g"), function (m, dir, v) {
      var n = parseNumber(v);
      if (n === null) { return m; }
      setRange("price", dir, n, 0);
      return " ";
    });
    str = str.replace(/\s(\d[\d,]*(?:\.\d+)?k?)\s*(?:cr|crowns)(?=\s|$)/g, function (m, v) {
      var n = parseNumber(v);
      if (n === null) { return m; }
      out.range.price = { min: null, max: n };
      return " ";
    });

    vocab.forEach(function (entry) {
      var re = new RegExp("(^|\\s)" + escapeRe(entry.w) + "(?=\\s|$)", "g");
      if (!re.test(str)) { return; }
      if (entry.facet === "loan") { out.loan = entry.id; } else {
        out.sel[entry.facet] = out.sel[entry.facet] || [];
        if (out.sel[entry.facet].indexOf(entry.id) === -1) { out.sel[entry.facet].push(entry.id); }
      }
      str = str.replace(re, " ");
    });
    cat.regions.forEach(function (r) {
      r.towns.forEach(function (town) {
        var re = new RegExp("(^|\\s)" + escapeRe(town.toLowerCase()) + "(?=\\s|$)");
        if (re.test(str)) { out.rest.push(town); str = str.replace(re, " "); }
      });
    });
    str.split(" ").forEach(function (w) { if (w && cat.vocabulary.stop.indexOf(w) === -1 && !/^\d+$/.test(w)) { out.rest.push(w); } });
    return out;
  }

  function mergeParsed(s, parsed) {
    Object.keys(parsed.sel).forEach(function (f) {
      parsed.sel[f].forEach(function (id) { if (s.sel[f].indexOf(id) === -1) { s.sel[f].push(id); } });
    });
    Object.keys(parsed.range).forEach(function (r) { s.range[r] = parsed.range[r]; });
    if (parsed.loan !== null) { s.loan = parsed.loan; }
    s.q = parsed.rest.join(" ");
    return s;
  }

  /* ---------- headline: the results page repeats the query in full ---------- */

  function rangeText(r, b, loan) {
    function v(n) {
      if (r === "price") { return loan ? t("per_month", { p: money(n) }) : money(n); }
      return r === "age" ? t("age_years", { n: n }) : height(n);
    }
    if (b.min !== null && b.max !== null) { return t("range_" + r + "_between", { a: v(b.min), b: v(b.max) }); }
    if (b.max !== null) { return t("range_" + r + "_under", { v: v(b.max) }); }
    if (b.min !== null) { return t("range_" + r + "_over", { v: v(b.min) }); }
    return "";
  }

  function nameList(f, ids, prop) {
    return facetValues(f).filter(function (v) { return ids.indexOf(v.id) !== -1; }).map(function (v) { return v[prop] || v.name; }).join(t("or"));
  }

  function headline(s) {
    var noun;
    var sexes = s.sel.sex.length ? nameList("sex", s.sel.sex, "plural") : "";
    if (s.sel.breed.length) {
      noun = sexes ? nameList("breed", s.sel.breed, "name") + " " + sexes : nameList("breed", s.sel.breed, "plural");
    } else if (s.sel.cat.length) {
      noun = lower(nameList("cat", s.sel.cat, "name")) + (sexes ? " (" + sexes + ")" : "");
    } else {
      noun = sexes || t("noun_horses");
    }
    var traits = s.sel.trait.map(function (k) { return lower(cat.copy.title_words[k][0]); }).join(t("and"));
    var parts = [traits ? traits + " " + noun : noun];
    if (s.sel.disc.length) { parts.push(t("for_x", { x: lower(nameList("disc", s.sel.disc, "name")) })); }
    if (s.sel.region.length) { parts.push(t("in_x", { x: nameList("region", s.sel.region, "name") })); }
    var tail = s.loan ? [t("on_loan")] : [];
    if (s.sel.seller.length) { tail.push(t("from_x", { x: lower(nameList("seller", s.sel.seller, "name")) })); }
    if (s.sel.cert.length) { tail.push(nameList("cert", s.sel.cert, "name")); }
    RANGES.forEach(function (r) { var x = rangeText(r, s.range[r], s.loan); if (x) { tail.push(x); } });
    if (s.q) { tail.push(t("matching_x", { x: s.q })); }
    return cap(parts.join(" ")) + (tail.length ? ", " + tail.join(", ") : "");
  }

  /* ---------- refinement: the next most useful question, one tap away ---------- */

  function refineOptions(s, list) {
    var candidates = [];
    ["disc", "breed", "region", "sex"].forEach(function (f) {
      if (s.sel[f].length) { return; }
      candidates.push({ label: t("refine_" + f), options: facetValues(f).map(function (v) {
        return { name: v.name, n: list.filter(function (h) { return facetGet(f, h) === v.id; }).length, apply: function (st) { st.sel[f] = [v.id]; } };
      }) });
    });
    [["cm", "cm"], ["age", "age"], ["price", s.loan ? "loan_price" : "price"]].forEach(function (pair) {
      var r = pair[0];
      if (s.range[r].min !== null || s.range[r].max !== null) { return; }
      candidates.push({ label: t("refine_" + r), options: cat.bands[pair[1]].map(function (b) {
        return {
          name: b.name,
          n: list.filter(function (h) { var v = rangeGet(r, h); return (b.min === null || v >= b.min) && (b.max === null || v <= b.max); }).length,
          apply: function (st) { st.range[r] = { min: b.min, max: b.max }; }
        };
      }) });
    });
    var best = null;
    candidates.forEach(function (c) {
      var total = c.options.reduce(function (a, o) { return a + o.n; }, 0);
      var used = c.options.filter(function (o) { return o.n > 0; });
      if (used.length < 2 || !total) { return; }
      var h = used.reduce(function (a, o) { var p = o.n / total; return a - p * Math.log(p); }, 0);
      if (!best || h > best.h) { best = { h: h, c: c }; }
    });
    return best ? best.c : null;
  }

  /* ---------- shared chrome ---------- */

  function initChrome() {
    var nav = $("[data-nav]");
    var menuBtn = $("[data-menu]");
    var search = $("[data-search]");
    var searchBtn = $("[data-search-open]");
    var scrim = $("[data-scrim]");

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
        $("[data-search-input]").focus();
      }
    });
    scrim.addEventListener("click", closeAll);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAll(); } });
    $$("[data-scroller]").forEach(function (scroller) {
      var track = $(".mk-scroller__track", scroller);
      $$("[data-paddle]", scroller).forEach(function (btn) {
        btn.addEventListener("click", function () {
          track.scrollBy({ left: Number(btn.getAttribute("data-paddle")) * track.clientWidth * 0.8, behavior: "smooth" });
        });
      });
    });
    updateCounts();
  }

  function updateCounts() {
    var bag = $("[data-bag-count]");
    bag.textContent = String(store.bag.length);
    bag.hidden = store.bag.length === 0;
    var my = $("[data-my-count]");
    my.textContent = String(store.shortlist.length);
    my.hidden = store.shortlist.length === 0;
  }

  function toast(message) {
    var el = $("[data-toast]");
    el.textContent = message;
    el.hidden = false;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* Search box suggestions: every suggestion is a complete, specific query with its count. */
  function suggestions(raw) {
    var out = [];
    var s = mergeParsed(emptyState(), parseQuery(raw));
    var list = run(s);
    if (list.length) { out.push({ kind: t("suggest_search"), text: headline(s), count: t("count_horses", { n: num.format(list.length) }), href: horsesUrl(s) }); }
    var ref = refineOptions(s, list);
    if (ref) {
      ref.options.filter(function (o) { return o.n > 0; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 3).forEach(function (o) {
        var narrower = cloneState(s);
        o.apply(narrower);
        out.push({ kind: t("suggest_narrow"), text: headline(narrower), count: t("count_horses", { n: num.format(o.n) }), href: horsesUrl(narrower) });
      });
    }
    var word = raw.trim().toLowerCase();
    if (word.length >= 3) {
      cat.sellers.filter(function (x) { return x.kind !== "private" && x.name.toLowerCase().indexOf(word) !== -1; }).slice(0, 2).forEach(function (x) {
        out.push({ kind: t("suggest_seller"), text: x.name, count: "", href: sellerUrl(x.id) });
      });
      cat.tack.filter(function (x) { return (x.name + " " + index.tcat[x.category].name).toLowerCase().indexOf(word) !== -1; }).slice(0, 2).forEach(function (x) {
        out.push({ kind: t("suggest_tack"), text: x.name, count: t("price_from", { p: money(basePrice(x)) }), href: itemUrl(x) });
      });
    }
    return out;
  }

  function wireSearch(input, form, listEl, headEl) {
    function render(items) {
      clear(listEl);
      items.forEach(function (it) {
        var node = clone("tpl-suggest");
        fill(node, { kind: it.kind, text: it.text, count: it.count });
        setHref(node, it.href);
        listEl.appendChild(node);
      });
      listEl.hidden = items.length === 0;
    }
    function update() {
      var v = input.value.trim();
      if (headEl) { headEl.textContent = v ? t("search_suggested") : t("search_try"); }
      render(v ? suggestions(v) : popularQueries().slice(0, 4).map(function (p) { return { kind: t("suggest_popular"), text: p.text, count: p.count, href: p.href }; }));
    }
    input.addEventListener("input", update);
    input.addEventListener("focus", update);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var v = input.value.trim();
      if (!v) { return; }
      var seller = cat.sellers.filter(function (x) { return x.kind !== "private" && x.name.toLowerCase() === v.toLowerCase(); })[0];
      location.href = seller ? sellerUrl(seller.id) : horsesUrl(mergeParsed(emptyState(), parseQuery(v)));
    });
    if (headEl) { update(); }
  }

  var popularCache = null;
  function popularQueries() {
    if (popularCache) { return popularCache; }
    var combos = {};
    horses.forEach(function (h) {
      if (!h.loan) { combos[h.breed.id + "|" + h.disc.id] = (combos[h.breed.id + "|" + h.disc.id] || 0) + 1; }
    });
    popularCache = Object.keys(combos).sort(function (a, b) { return combos[b] - combos[a]; }).slice(0, 8).map(function (key) {
      var s = emptyState();
      var parts = key.split("|");
      s.sel.breed = [parts[0]];
      s.sel.disc = [parts[1]];
      var band = priceBand(run(s));
      if (cat.copy.calm_disciplines.indexOf(parts[1]) !== -1) { s.sel.trait = ["calm"]; }
      if (band) { s.range.price = { min: null, max: roundTo(band.hi, 500) }; }
      var list = run(s);
      var b2 = priceBand(list);
      return { text: headline(s), count: t("count_horses", { n: num.format(list.length) }), meta: b2 ? t("typical_range", { lo: money(b2.lo), hi: money(b2.hi) }) : "", href: horsesUrl(s) };
    });
    return popularCache;
  }

  /* ---------- the buyer's path: shortlist, viewing, visit, reservation ---------- */

  function dayLabel(iso) {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  }

  function pathState() {
    var viewed = store.viewings.filter(function (v) { return v.done && index.item[v.id]; });
    var reserved = store.orders.filter(function (o) { return o.horses && o.horses.length; });
    var steps = [
      { key: "shortlist", n: store.shortlist.length },
      { key: "viewing", n: store.viewings.length },
      { key: "viewed", n: viewed.length },
      { key: "reserved", n: reserved.length }
    ];
    var reached = 0;
    steps.forEach(function (st, i) { if (st.n > 0) { reached = i + 1; } });
    var firstShort = store.shortlist.map(function (id) { return index.item[id]; }).filter(Boolean)[0];
    var pending = store.viewings.filter(function (v) { return !v.done && index.item[v.id]; })[0];
    var next;
    if (viewed.length && !reserved.length) { next = { text: t("next_reserve", { name: index.item[viewed[0].id].name }), href: itemUrl(index.item[viewed[0].id]) + "#buy" }; }
    else if (pending) { next = { text: t("next_visit", { name: index.item[pending.id].name, date: dayLabel(pending.date) + ", " + pending.time }), href: MROOT + "my/" }; }
    else if (firstShort) { next = { text: t("next_viewing", { name: firstShort.name }), href: itemUrl(firstShort) + "#viewing" }; }
    else { next = { text: t("next_search"), href: MROOT + "horses/" }; }
    return { steps: steps, reached: reached, next: next };
  }

  function renderPath(host) {
    clear(host);
    var p = pathState();
    var node = clone("tpl-steps");
    var list = $("[data-body]", node);
    p.steps.forEach(function (st, i) {
      var li = clone("tpl-step");
      fill(li, { num: String(i + 1), label: t("step_" + st.key), count: st.n ? t("step_count", { n: st.n }) : "", hint: t("step_hint_" + st.key) });
      if (i < p.reached) { li.classList.add("is-done"); }
      if (i === p.reached) { li.classList.add("is-next"); }
      list.appendChild(li);
    });
    $("[data-fill]", node).style.width = Math.max(4, Math.round(100 * p.reached / p.steps.length)) + "%";
    fill(node, { next: p.next.text });
    setHref(node, p.next.href);
    host.appendChild(node);
  }

  /* ---------- stamp card and Market Plus ---------- */

  function stamps() { return store.stamps < 0 ? cat.card.welcome : store.stamps; }
  function addStamps(n) { store.stamps = Math.min(cat.card.size, stamps() + n); }

  function renderCard() {
    var list = $("[data-stamps]");
    if (!list) { return; }
    clear(list);
    var have = stamps();
    for (var i = 0; i < cat.card.size; i += 1) {
      var li = clone("tpl-stamp");
      if (i < have) { li.classList.add("is-on"); }
      list.appendChild(li);
    }
    var left = cat.card.size - have;
    $("[data-card-title]").textContent = left > 0 ? t("card_title", { n: left }) : t("card_full");
    $("[data-card-line]").textContent = t("card_line", { reward: cat.card.reward });
  }

  function plusInBag() { return store.bag.some(function (b) { return b.kind === "plus"; }); }

  function renderPlus() {
    var title = $("[data-plus-title]");
    if (!title) { return; }
    var m = cat.membership;
    var ul = $("[data-plus-benefits]");
    clear(ul);
    m.benefits.forEach(function (b) { var li = clone("tpl-li"); li.textContent = b; ul.appendChild(li); });
    var member = store.plus || plusInBag();
    title.textContent = member ? t("plus_have", { name: m.name }) : t("plus_title", { name: m.name, p: money(m.price) });
    $("[data-plus-add]").hidden = member;
  }

  /* ---------- rows ---------- */

  function matchChips(h, s) {
    var out = [];
    if (!s) { return out; }
    s.sel.trait.forEach(function (k) { out.push(t("trait_" + k) + " " + h.temperament[k] + "/5"); });
    if (s.sel.disc.length) { out.push(h.disc.name); }
    if (s.sel.region.length || s.q) { out.push(h.town + ", " + h.region.name); }
    if (s.range.cm.min !== null || s.range.cm.max !== null) { out.push(height(h.cm)); }
    if (s.range.age.min !== null || s.range.age.max !== null) { out.push(t("age_years", { n: h.age })); }
    return out;
  }

  function listedText(days) { return days === 0 ? t("listed_today") : days === 1 ? t("listed_yesterday") : t("listed_days", { n: days }); }

  function rowMeta(h) { return [h.town + ", " + h.region.name, h.seller.name, listedText(h.days)].join(" · "); }

  function fillMatch(node, chips) {
    var ul = $("[data-match]", node);
    chips.forEach(function (c) { var li = clone("tpl-matchchip"); li.textContent = c; ul.appendChild(li); });
    ul.hidden = chips.length === 0;
  }

  function shortlistButton(h, onChange) {
    var btn = clone("tpl-action");
    function paint() {
      var on = store.shortlist.indexOf(h.id) !== -1;
      btn.textContent = on ? t("shortlisted") : t("shortlist");
      btn.setAttribute("aria-pressed", String(on));
    }
    btn.addEventListener("click", function () {
      var at = store.shortlist.indexOf(h.id);
      if (at === -1) { store.shortlist.push(h.id); toast(t("shortlist_added", { name: h.name })); } else { store.shortlist.splice(at, 1); }
      saveStore();
      paint();
      if (onChange) { onChange(); }
    });
    paint();
    return btn;
  }

  function horseRow(h, s) {
    var node = clone("tpl-row");
    fill(node, { title: h.name + " · " + horseTitle(h), facts: horseFacts(h), scene: h.scene, meta: rowMeta(h), price: horsePrice(h), note: h.loan ? t("loan_note") : "" });
    setHref(node, itemUrl(h));
    paintMedia(node, h);
    fillMatch(node, matchChips(h, s));
    $("[data-actions]", node).appendChild(shortlistButton(h));
    return node;
  }

  function topCard(h, s, badge) {
    var node = clone("tpl-top");
    fill(node, { badge: badge, title: h.name + " · " + horseTitle(h), scene: h.scene, facts: horseFacts(h), price: horsePrice(h), note: h.loan ? t("loan_note") : "", meta: rowMeta(h) });
    setHref(node, itemUrl(h));
    $("[data-viewing-link]", node).setAttribute("href", itemUrl(h) + "#viewing");
    paintMedia(node, h);
    fillMatch(node, matchChips(h, s));
    return node;
  }

  /* ---------- home ---------- */

  function renderHome() {
    var sellersN = cat.sellers.filter(function (x) { return ["stud", "dealer", "private", "state"].indexOf(x.kind) !== -1; }).length;
    $("[data-home-sub]").textContent = t("home_sub", { n: num.format(horses.length), s: num.format(sellersN) });
    wireSearch($("[data-home-input]"), $("[data-home-search]"), $("[data-home-suggest]"), null);

    var pop = $("[data-popular]");
    popularQueries().slice(0, 6).forEach(function (p) {
      var node = clone("tpl-query");
      fill(node, { text: p.text, meta: p.count + (p.meta ? " · " + p.meta : "") });
      setHref(node, p.href);
      pop.appendChild(node);
    });

    var tiles = $("[data-home-tiles]");
    function tile(name, count, href, tack) {
      var node = clone("tpl-tile");
      if (tack) { node.classList.add("mk-tiles__item--tack"); }
      fill(node, { name: name, count: count });
      setHref(node, href);
      tiles.appendChild(node);
    }
    cat.horse_categories.forEach(function (c) {
      tile(c.name, t("count_horses", { n: num.format(horses.filter(function (h) { return h.cat.id === c.id && !h.loan; }).length) }), MROOT + "horses/?cat=" + c.id);
    });
    tile(t("type_loan"), t("count_horses", { n: num.format(horses.filter(function (h) { return h.loan; }).length) }), MROOT + "horses/?loan=1");
    cat.tack_categories.forEach(function (c) {
      tile(c.name, t("count_items", { n: cat.tack.filter(function (x) { return x.category === c.id; }).length }), MROOT + "tack/?category=" + c.id, true);
    });

    var latestEl = $("[data-home-latest]");
    horses.filter(function (h) { return !h.loan && h.days === 0; }).slice(0, 12).forEach(function (h) { latestEl.appendChild(card(h)); });

    renderPath($("[data-path]"));

    var tackEl = $("[data-home-tack]");
    cat.tack.forEach(function (x) { tackEl.appendChild(card(x)); });

    var housesEl = $("[data-home-houses]");
    cat.sellers.filter(function (x) { return x.tier === "house"; }).forEach(function (x) {
      var node = clone("tpl-feature");
      fill(node, { eyebrow: t("since", { y: x.since }), name: x.name, line: x.line, mark: x.mark });
      setHref(node, sellerUrl(x.id));
      housesEl.appendChild(node);
    });

    renderCard();
    renderPlus();
  }

  /* ---------- horse results ---------- */

  function renderHorses() {
    var s = stateFromUrl(query());
    var groupsEl = $("[data-filter-groups]");
    var filtersEl = $("[data-filters]");
    var qInput = $("[data-results-q]");
    var sortSel = $("[data-sort]");
    var counters = {};
    var rangeInputs = {};

    $$("[data-type-tab]").forEach(function (a) {
      var v = Number(a.getAttribute("data-type-tab"));
      var other = cloneState(s);
      other.loan = v;
      other.range.price = { min: null, max: null };
      a.setAttribute("href", horsesUrl(other));
      a.setAttribute("aria-selected", String(v === s.loan));
    });

    FACETS.forEach(function (f) {
      var group = clone("tpl-fgroup");
      fill(group, { name: t("f_" + f) });
      var bodyEl = $("[data-body]", group);
      counters[f] = {};
      facetValues(f).forEach(function (v) {
        var row = clone("tpl-fcheck");
        var input = $("input", row);
        input.name = f;
        input.value = v.id;
        fill(row, { name: cap(v.name) });
        counters[f][v.id] = { row: row, count: $('[data-f="count"]', row) };
        input.addEventListener("change", function () {
          var list = s.sel[f];
          var at = list.indexOf(v.id);
          if (input.checked && at === -1) { list.push(v.id); }
          if (!input.checked && at !== -1) { list.splice(at, 1); }
          s.page = 1;
          update(true);
        });
        bodyEl.appendChild(row);
      });
      if (!s.sel[f].length && ["sex", "seller", "cert", "trait", "region"].indexOf(f) !== -1) { group.removeAttribute("open"); }
      groupsEl.appendChild(group);
    });
    RANGES.forEach(function (r) {
      var group = clone("tpl-fgroup");
      fill(group, { name: t(r === "price" && s.loan ? "f_price_loan" : "f_" + r) });
      var range = clone("tpl-frange");
      var lo = $("[data-min]", range);
      var hi = $("[data-max]", range);
      rangeInputs[r] = { lo: lo, hi: hi };
      function onRange() {
        var a = parseInt(lo.value, 10);
        var b = parseInt(hi.value, 10);
        s.range[r] = { min: isNaN(a) || a < 0 ? null : a, max: isNaN(b) || b < 0 ? null : b };
        s.page = 1;
        update(true);
      }
      lo.addEventListener("change", onRange);
      hi.addEventListener("change", onRange);
      $("[data-body]", group).appendChild(range);
      groupsEl.appendChild(group);
    });

    function syncInputs() {
      qInput.value = s.q;
      sortSel.value = s.sort;
      RANGES.forEach(function (r) {
        rangeInputs[r].lo.value = s.range[r].min === null ? "" : s.range[r].min;
        rangeInputs[r].hi.value = s.range[r].max === null ? "" : s.range[r].max;
      });
      $$("input[type=checkbox]", groupsEl).forEach(function (inp) { inp.checked = s.sel[inp.name].indexOf(inp.value) !== -1; });
    }

    function chip(label, onRemove) {
      var node = clone("tpl-chip");
      fill(node, { name: label });
      $("button", node).addEventListener("click", function () { onRemove(); s.page = 1; update(true); });
      return node;
    }

    function renderChips() {
      var chipsEl = $("[data-chips]");
      clear(chipsEl);
      var active = 0;
      FACETS.forEach(function (f) {
        s.sel[f].forEach(function (id) {
          var v = facetValues(f).filter(function (x) { return x.id === id; })[0];
          chipsEl.appendChild(chip(cap(v.name), function () { s.sel[f].splice(s.sel[f].indexOf(id), 1); }));
          active += 1;
        });
      });
      RANGES.forEach(function (r) {
        var label = rangeText(r, s.range[r], s.loan);
        if (label) { chipsEl.appendChild(chip(cap(label), function () { s.range[r] = { min: null, max: null }; })); active += 1; }
      });
      if (s.q) { chipsEl.appendChild(chip("“" + s.q + "”", function () { s.q = ""; })); active += 1; }
      $("[data-filter-count]").textContent = active ? "(" + active + ")" : "";
    }

    function chipLinks(ul, options) {
      clear(ul);
      options.forEach(function (o) {
        var node = clone("tpl-refine-chip");
        fill(node, { name: o.name, count: num.format(o.n) });
        setHref(node, horsesUrl(o.s));
        ul.appendChild(node);
      });
    }

    function renderRefine(list) {
      var wrap = $("[data-refine]");
      var ref = list.length > cat.page_size ? refineOptions(s, list) : null;
      wrap.hidden = !ref;
      if (!ref) { return; }
      $("[data-refine-label]").textContent = ref.label;
      chipLinks($("[data-refine-list]"), ref.options.filter(function (o) { return o.n > 0; }).map(function (o) {
        var narrower = cloneState(s);
        narrower.page = 1;
        o.apply(narrower);
        return { name: o.name, n: o.n, s: narrower };
      }));
    }

    function renderRelax() {
      var options = [];
      FACETS.forEach(function (f) {
        s.sel[f].forEach(function (id) {
          var relaxed = cloneState(s);
          relaxed.sel[f] = relaxed.sel[f].filter(function (x) { return x !== id; });
          options.push({ name: t("without_x", { x: facetValues(f).filter(function (v) { return v.id === id; })[0].name }), s: relaxed });
        });
      });
      RANGES.forEach(function (r) {
        if (s.range[r].min === null && s.range[r].max === null) { return; }
        var relaxed = cloneState(s);
        relaxed.range[r] = { min: null, max: null };
        options.push({ name: t("without_x", { x: rangeText(r, s.range[r], s.loan) }), s: relaxed });
      });
      if (s.q) { var rq = cloneState(s); rq.q = ""; options.push({ name: t("without_x", { x: "“" + s.q + "”" }), s: rq }); }
      chipLinks($("[data-empty-relax]"), options.map(function (o) { o.n = run(o.s).length; return o; })
        .filter(function (o) { return o.n > 0; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 4));
    }

    function renderEntry(list) {
      var el = $("[data-entry]");
      var other = cloneState(s);
      other.loan = s.loan ? 0 : 1;
      other.range.price = { min: null, max: null };
      var alt = run(other);
      if (!alt.length || !list.length) { el.hidden = true; return; }
      if (!s.loan) {
        var pick = sortList(alt, other)[0];
        fill(el, { label: t("entry_loan_label"), text: t("entry_loan_text", { name: pick.name, breed: pick.breed.name, town: pick.town, p: t("per_month", { p: money(pick.price) }), n: num.format(alt.length) }) });
      } else {
        fill(el, { label: t("entry_sale_label"), text: t("entry_sale_text", { n: num.format(alt.length) }) });
      }
      el.setAttribute("href", horsesUrl(other));
      el.hidden = false;
    }

    function renderPager(total) {
      var pager = $("[data-pager]");
      clear(pager);
      var pages = Math.max(1, Math.ceil(total / cat.page_size));
      if (pages <= 1) { return; }
      function link(p, label, current) {
        var a = clone("tpl-pagelink");
        a.textContent = label;
        a.setAttribute("href", horsesUrl(s, p));
        if (current) { a.setAttribute("aria-current", "page"); }
        pager.appendChild(a);
      }
      if (s.page > 1) { link(s.page - 1, t("prev"), false); }
      var from = Math.max(1, Math.min(s.page - 2, pages - 4));
      for (var p = from; p <= Math.min(pages, from + 4); p += 1) { link(p, String(p), p === s.page); }
      if (s.page < pages) { link(s.page + 1, t("next"), false); }
    }

    function update(push) {
      var list = sortList(run(s), s);
      var line = headline(s);
      $("[data-headline]").textContent = line;
      $("[data-count]").textContent = t("count_horses", { n: num.format(list.length) });
      document.title = line + " · " + t("market_name");

      var band = priceBand(list);
      var ref = $("[data-refprice]");
      ref.hidden = !band;
      if (band) { ref.textContent = t(s.loan ? "typical_loan" : "typical_search", { lo: money(band.lo), hi: money(band.hi) }); }

      FACETS.forEach(function (f) {
        var base = horses.filter(function (h) { return matches(h, s, f); });
        facetValues(f).forEach(function (v) {
          var n = f === "trait" ? base.filter(function (h) { return h.temperament[v.id] >= 4; }).length : base.filter(function (h) { return facetGet(f, h) === v.id; }).length;
          counters[f][v.id].count.textContent = num.format(n);
          counters[f][v.id].row.classList.toggle("is-empty", n === 0);
        });
      });

      var top = $("[data-top]");
      var rows = $("[data-rows]");
      clear(top);
      clear(rows);
      var start = (s.page - 1) * cat.page_size;
      var pageList = list.slice(start, start + cat.page_size);
      if (s.page === 1) {
        pageList.slice(0, 2).forEach(function (h, i) { top.appendChild(topCard(h, s, t(i === 0 ? "badge_best" : "badge_close"))); });
        pageList = pageList.slice(2);
      }
      pageList.forEach(function (h) { rows.appendChild(horseRow(h, s)); });
      top.hidden = s.page !== 1 || !list.length;

      $("[data-empty]").hidden = list.length > 0;
      if (!list.length) { renderRelax(); }
      renderRefine(list);
      renderEntry(list);
      renderPager(list.length);
      renderChips();
      syncInputs();
      if (push) { history.replaceState(null, "", horsesUrl(s, s.page)); window.scrollTo(0, 0); }
    }

    $("[data-results-form]").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = qInput.value.trim();
      var next = cloneState(s);
      next.q = "";
      location.href = horsesUrl(v ? mergeParsed(next, parseQuery(v)) : next);
    });
    sortSel.addEventListener("change", function () { s.sort = sortSel.value; s.page = 1; update(true); });
    $$("[data-filters-reset]").forEach(function (btn) {
      btn.addEventListener("click", function () { var e = emptyState(); e.loan = s.loan; location.href = horsesUrl(e); });
    });
    $("[data-filters-open]").addEventListener("click", function () { filtersEl.classList.add("is-open"); body.classList.add("is-locked"); });
    $("[data-filters-close]").addEventListener("click", function () { filtersEl.classList.remove("is-open"); body.classList.remove("is-locked"); });
    $("[data-save-search]").addEventListener("click", function () {
      var href = horsesUrl(s).slice(MROOT.length);
      if (!store.searches.some(function (x) { return x.href === href; })) {
        store.searches.unshift({ href: href, text: headline(s), n: run(s).length });
        store.searches = store.searches.slice(0, 12);
        saveStore();
      }
      toast(t("search_saved"));
    });

    update(false);
  }

  /* ---------- tack ---------- */

  function renderTack() {
    var params = query();
    var current = index.tcat[params.get("category")] ? params.get("category") : "";
    var qv = (params.get("q") || "").trim().toLowerCase().slice(0, 120);
    var input = $("[data-results-q]");
    input.value = qv;
    var list = cat.tack.filter(function (x) {
      return (!current || x.category === current) && (!qv || (x.name + " " + x.line + " " + index.seller[x.brand].name + " " + index.tcat[x.category].name).toLowerCase().indexOf(qv) !== -1);
    });
    if (current) { $("[data-headline]").textContent = index.tcat[current].name; }
    $("[data-count]").textContent = t("count_items", { n: list.length });
    var cats = $("[data-tack-cats]");
    [{ id: "", name: t("all_tack") }].concat(cat.tack_categories).forEach(function (c) {
      var node = clone("tpl-refine-chip");
      fill(node, { name: c.name, count: String(cat.tack.filter(function (x) { return !c.id || x.category === c.id; }).length) });
      setHref(node, MROOT + "tack/" + (c.id ? "?category=" + c.id : ""));
      if (c.id === current) { $("a", node).setAttribute("aria-current", "true"); }
      cats.appendChild(node);
    });
    var grid = $("[data-grid]");
    list.forEach(function (x) { grid.appendChild(card(x)); });
    $("[data-empty]").hidden = list.length > 0;
    $("[data-results-form]").addEventListener("submit", function (e) {
      e.preventDefault();
      var p = new URLSearchParams();
      if (current) { p.set("category", current); }
      if (input.value.trim()) { p.set("q", input.value.trim()); }
      location.href = MROOT + "tack/" + (p.toString() ? "?" + p.toString() : "");
    });
  }

  /* ---------- item ---------- */

  function description(h) {
    var c = cat.copy;
    var vars = { name: h.name, age: h.age, coat: h.coat.name, breed: h.breed.name, sex: h.sex.name, hh: hands(h.cm), cm: h.cm, mark: h.mark };
    var out = [fmt(c.open[h.n % c.open.length], vars)];
    var traitLines = TRAITS.filter(function (k) { return h.temperament[k] >= 4; }).map(function (k) { var l = c.trait_lines[k]; return fmt(l[h.n % l.length], vars); });
    if (traitLines.length) { out.push(traitLines.join(" ")); }
    out.push(fmt(c.close[h.n % c.close.length], vars) + " " + fmt(c.close[(h.n + 1) % c.close.length], vars));
    return out;
  }

  function addFacts(dl, rows, tpl) {
    rows.forEach(function (r) { dl.appendChild(fill(clone(tpl || "tpl-fact"), { k: r[0], v: r[1] })); });
  }

  function renderItem() {
    var id = query().get("id");
    var item = id && index.item[id];
    if (!item) { $("[data-notfound]").hidden = false; return; }
    var root = $("[data-item]");
    root.hidden = false;
    $$("[data-only]", root).forEach(function (el) { if (el.getAttribute("data-only") !== item.kind) { el.remove(); } });
    var crumbDept = $("[data-crumb-dept]", root);
    var crumbCat = $("[data-crumb-cat]", root);
    var desc = $("[data-description]", root);
    var kf = $("[data-keyfacts]", root);
    var sellerLink = $('[data-f="seller-link"]', root);

    if (isHorse(item)) {
      var h = item;
      var band = priceBand(horses.filter(function (x) { return x.id !== h.id && x.loan === h.loan && x.breed === h.breed && x.disc === h.disc && Math.abs(x.age - h.age) <= 2; }));
      document.title = h.name + " · " + horseTitle(h) + " · " + t("market_name");
      fill(root, {
        name: h.name,
        eyebrow: (h.loan ? t("type_loan") : t("type_sale")) + " · " + h.disc.name,
        title: h.name + " · " + horseTitle(h),
        scene: h.scene,
        price: horsePrice(h),
        "price-note": h.loan ? t("loan_note") : "",
        refprice: band ? t(h.loan ? "typical_item_loan" : "typical_item", { lo: money(band.lo), hi: money(band.hi), plural: h.breed.plural, age: h.age, disc: lower(h.disc.name) }) : "",
        "seller-kind": kindName(h.seller.kind),
        "seller-reply": t("seller_reply", { h: h.seller.reply_h }),
        "seller-offer": cat.viewing_offers[h.seller.offer],
        "viewing-offer": t("viewing_offer", { seller: h.seller.name, offer: lower(cat.viewing_offers[h.seller.offer]) }),
        "reserve-label": h.loan ? t("reserve_loan") : t("reserve"),
        "about-title": t("about_horse", { name: h.name })
      });
      addFacts(kf, [[t("f_breed"), h.breed.name], [t("f_sex"), cap(h.sex.name)], [t("f_age"), t("age_years", { n: h.age })], [t("f_cm"), height(h.cm)],
        [t("k_coat"), cap(h.coat.name) + ", " + h.mark], [t("k_location"), h.town + ", " + h.region.name], [t("f_cert"), t("cert_" + h.cert)]]);
      crumbDept.textContent = h.loan ? t("type_loan") : t("nav_horses");
      crumbDept.href = MROOT + "horses/" + (h.loan ? "?loan=1" : "");
      crumbCat.textContent = h.breed.plural;
      crumbCat.href = MROOT + "horses/?breed=" + h.breed.id + (h.loan ? "&loan=1" : "");
      sellerLink.textContent = h.seller.name;
      sellerLink.href = sellerUrl(h.seller.id);
      $("[data-shortlist]", root).replaceWith(shortlistButton(h));

      description(h).forEach(function (p) { var el = clone("tpl-para"); el.textContent = p; desc.appendChild(el); });
      var bars = $("[data-temperament]", root);
      TRAITS.forEach(function (k) {
        var node = clone("tpl-bar");
        fill(node, { label: t("trait_" + k), word: t("scale_" + h.temperament[k]) });
        $("[data-fill]", node).style.width = (h.temperament[k] * 20) + "%";
        bars.appendChild(node);
      });
      [["training", cat.copy.training[h.disc.id]], ["fits", [cat.copy.fits[h.disc.id]]], ["not_for", [h.notfor]]].forEach(function (pair) {
        var ul = $('[data-list="' + pair[0] + '"]', root);
        pair[1].forEach(function (line) { var li = clone("tpl-li"); li.textContent = line; ul.appendChild(li); });
      });
      addFacts($("[data-record]", root), [[t("rec_passport"), "HG-" + h.region.id.slice(0, 3).toUpperCase() + "-" + (20000 + h.n * 7)],
        [t("rec_health"), h.health.length ? h.health.join("; ") : t("rec_none")], [t("rec_transfer"), t("rec_transfer_v")],
        [t("rec_listed"), listedText(h.days)]]);
      initViewing(h, root);
    } else {
      var x = item;
      var brand = index.seller[x.brand];
      document.title = x.name + " · " + t("market_name");
      fill(root, {
        name: x.name, eyebrow: tackEyebrow(x), title: x.name, scene: x.line,
        price: t("price_from", { p: money(basePrice(x)) }), "price-note": t("offers_n", { n: x.offers.length }), refprice: "",
        "seller-kind": kindName(brand.kind), "seller-reply": "", certificate: x.certificate ? t("certificate_line", { c: x.certificate }) : "",
        "about-title": x.name
      });
      var facts = [[t("k_maker"), brand.name], [t("f_category"), index.tcat[x.category].name]];
      if (x.rating) { facts.push([t("k_quality"), t("out_of_5", { v: x.rating.quality })], [t("k_value"), t("out_of_5", { v: x.rating.value })], [t("k_owners"), num.format(x.rating.count)]); }
      if (x.certificate) { facts.push([t("certificate"), x.certificate]); }
      addFacts(kf, facts);
      crumbDept.textContent = t("nav_tack");
      crumbDept.href = MROOT + "tack/";
      crumbCat.textContent = index.tcat[x.category].name;
      crumbCat.href = MROOT + "tack/?category=" + x.category;
      sellerLink.textContent = brand.name;
      sellerLink.href = sellerUrl(brand.id);
      var para = clone("tpl-para");
      para.textContent = x.line;
      desc.appendChild(para);
      var prov = clone("tpl-provenance");
      fill(prov, { eyebrow: brand.tier === "house" ? t("house_eyebrow", { y: brand.since }) : t("everyday_eyebrow"), name: brand.name, line: brand.mark || brand.line });
      addFacts($("[data-facts]", prov), [[t("k_workshop"), index.region[brand.region].name], [t("seller_since"), String(brand.since)], [t("seller_licence"), brand.licence]]);
      setHref(prov, sellerUrl(brand.id));
      $("[data-provenance]", root).appendChild(prov);
      var specs = $("[data-specs]", root);
      x.specs.forEach(function (sp) { specs.appendChild(fill(clone("tpl-spec"), { k: sp.k, v: sp.v, rule: sp.rule || "—" })); });
    }

    initViewer(item, root);
    renderConsider(item, root);
    initBuy(item, root);

    var rel = $("[data-related]", root);
    var pool = isHorse(item)
      ? horses.filter(function (x) { return x.loan === item.loan && x.breed === item.breed && x.disc === item.disc && x.id !== item.id; }).slice(0, 10)
      : cat.tack.filter(function (x) { return x.id !== item.id && x.category === item.category; }).concat(cat.tack.filter(function (x) { return x.category !== item.category; }).slice(0, 6));
    pool.forEach(function (x) { rel.appendChild(card(x)); });

    var nav = $("[data-localnav]", root);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { nav.classList.toggle("is-stuck", !en.isIntersecting && en.boundingClientRect.top < 0); });
      }).observe($(".mk-pdp", root));
    }
  }

  /* One real alternative next to the listing. */
  function renderConsider(item, root) {
    var wrap = $("[data-compare]", root);
    var alt;
    if (isHorse(item)) {
      alt = horses.filter(function (x) { return x.id !== item.id && x.loan === item.loan && x.disc === item.disc && x.breed === item.breed; })
        .sort(function (a, b) { return (Math.abs(a.price - item.price) + Math.abs(a.age - item.age) * 50) - (Math.abs(b.price - item.price) + Math.abs(b.age - item.age) * 50); })[0];
    } else {
      alt = cat.tack.filter(function (x) { return x.id !== item.id && x.category === item.category; })
        .sort(function (a, b) { return Math.abs(basePrice(a) - basePrice(item)) - Math.abs(basePrice(b) - basePrice(item)); })[0];
    }
    if (!alt) { $("#consider", root).remove(); return; }
    [item, alt].forEach(function (x, i) {
      var col = clone("tpl-compare-col");
      fill(col, { badge: i === 0 ? t("consider_this") : t("consider_alt"), name: isHorse(x) ? x.name + " · " + horseTitle(x) : x.name,
        price: isHorse(x) ? horsePrice(x) : t("price_from", { p: money(basePrice(x)) }) });
      paintMedia(col, x);
      addFacts($("[data-rows]", col), isHorse(x)
        ? [[t("f_age"), t("age_years", { n: x.age })], [t("f_cm"), height(x.cm)], [t("trait_calm"), t("scale_" + x.temperament.calm)],
          [t("trait_energy"), t("scale_" + x.temperament.energy)], [t("f_cert"), t("cert_" + x.cert)], [t("k_location"), x.town + ", " + x.region.name], [t("f_seller"), x.seller.name]]
        : [[t("k_maker"), index.seller[x.brand].name]].concat(x.specs.map(function (sp) { return [sp.k, sp.v]; })), "tpl-kv");
      var link = $("[data-href]", col);
      if (i === 0) {
        col.classList.add("is-current");
        link.setAttribute("href", isHorse(x) ? "#viewing" : "#buy");
        link.textContent = isHorse(x) ? t("book_viewing") : t("buy");
      } else {
        link.setAttribute("href", itemUrl(x));
        link.textContent = t("see_listing");
      }
      wrap.appendChild(col);
    });
  }

  function initViewer(item, root) {
    var stage = $("[data-stage]", root);
    var img = $("[data-stage-img]", root);
    var ph = $("[data-stage-ph]", root);
    var label = $("[data-stage-view]", root);
    var dial = $("[data-dial]", root);
    var modesEl = $("[data-modes]", root);
    var modes = Object.keys(cat.views[item.kind]);
    var st = { mode: modes[0], i: 0 };
    stage.style.setProperty("--tone", item.tone);

    function show() {
      var list = views(item, st.mode);
      var v = list[st.i];
      dial.max = String(list.length - 1);
      dial.value = String(st.i);
      dial.setAttribute("aria-valuetext", v.name);
      label.textContent = v.name;
      stage.setAttribute("aria-label", item.name + ": " + v.name);
      stage.style.setProperty("--turn", String(st.i / list.length));
      if (v.src) { img.src = v.src; img.alt = item.name + ": " + v.name; img.hidden = false; ph.hidden = true; } else { img.hidden = true; ph.hidden = false; }
      $$("[role=tab]", modesEl).forEach(function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-mode") === st.mode)); });
    }
    modes.forEach(function (m) {
      var b = clone("tpl-mode");
      b.textContent = t("mode_" + m);
      b.setAttribute("data-mode", m);
      b.addEventListener("click", function () { st.mode = m; st.i = 0; show(); });
      modesEl.appendChild(b);
    });
    dial.addEventListener("input", function () { st.i = Number(dial.value); show(); });
    function step(d) { var n = views(item, st.mode).length; st.i = (st.i + d + n) % n; show(); }
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

    if (!isHorse(item)) {
      var sw = $("[data-viewer-swatches]", root);
      item.options.filter(function (o) { return o.values.some(function (v) { return v.tone; }); }).slice(0, 1).forEach(function (o) {
        o.values.forEach(function (v, i) {
          var node = clone("tpl-swatch");
          var input = $("input", node);
          input.name = "viewer-" + o.id;
          input.value = v.id;
          input.checked = i === 0;
          $("[data-dot]", node).style.background = v.tone;
          fill(node, { name: v.name });
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

  function isoDay(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* In-person viewing, booked on the listing itself. */
  function initViewing(h, root) {
    var form = $("[data-viewing-form]", root);
    var daysEl = $("[data-days]", root);
    var timesEl = $("[data-times]", root);
    var done = $("[data-viewing-done]", root);
    var allowed = cat.slot_days[h.seller.slots];
    var today = new Date();
    function dayChip(name, value, top, main) {
      var chip = clone("tpl-daychip");
      var input = $("input", chip);
      input.name = name;
      input.value = value;
      fill(chip, { top: top, main: main });
      return chip;
    }
    for (var i = 1; i <= cat.viewing_horizon_days; i += 1) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      if (allowed.indexOf((d.getDay() + 6) % 7) === -1) { continue; }
      daysEl.appendChild(dayChip("day", isoDay(d), d.toLocaleDateString("en-GB", { weekday: "short" }), d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })));
    }
    cat.viewing_times.forEach(function (tm) { timesEl.appendChild(dayChip("time", tm, "", tm)); });
    var per = store.plus ? 2 : 1;
    $("[data-viewing-stamp]", root).textContent = t("viewing_stamp", { n: per });

    function showBooked(v) {
      done.textContent = t("viewing_booked", { name: h.name, date: dayLabel(v.date), time: v.time, seller: h.seller.name });
      done.hidden = false;
      $("[data-viewing-submit]", root).textContent = t("viewing_change");
    }
    var existing = store.viewings.filter(function (v) { return v.id === h.id; })[0];
    if (existing) { showBooked(existing); }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var err = $("[data-viewing-error]", root);
      if (!data.get("day") || !data.get("time")) { err.hidden = false; return; }
      err.hidden = true;
      var first = !store.viewings.some(function (v) { return v.id === h.id; });
      store.viewings = store.viewings.filter(function (v) { return v.id !== h.id; });
      var v = { id: h.id, date: String(data.get("day")), time: String(data.get("time")), done: false };
      store.viewings.push(v);
      if (store.shortlist.indexOf(h.id) === -1) { store.shortlist.push(h.id); }
      if (first) { addStamps(per); }
      saveStore();
      showBooked(v);
      toast(t("viewing_toast", { name: h.name }));
    });
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

  function markBest(node) { node.classList.add("is-best"); node.setAttribute("data-badge", t("best_value")); return node; }

  function transportFree() { return store.plus || plusInBag(); }

  function initBuy(item, root) {
    var form = $("[data-buy-form]", root);
    var totalEl = $("[data-total]", root);
    var fig = clone("tpl-card").querySelector("[data-media]");
    $("[data-buy-media]", root).appendChild(fig);
    paintMedia(fig, item);
    $("[data-buy-title]", root).textContent = isHorse(item) ? t(item.loan ? "buy_title_loan" : "buy_title_horse", { name: item.name }) : t("buy_title_tack", { name: item.name });
    $("[data-buy-submit]", root).textContent = t("add_to_bag");

    if (isHorse(item)) {
      var plans = $("[data-plans]", root);
      cat.plans.forEach(function (p) {
        var node = choice("plan", p.id, p.name, p.line, p.price ? "+ " + money(p.price) : t("included"), p.best);
        plans.appendChild(p.best ? markBest(node) : node);
      });
      var del = $("[data-delivery]", root);
      cat.delivery.forEach(function (d, i) {
        var free = d.plus_free && transportFree();
        var line = d.line + (d.plus_free && !free ? " " + t("plus_free_hint", { name: cat.membership.name }) : "");
        del.appendChild(choice("delivery", d.id, d.name, line, d.price && !free ? "+ " + money(d.price) : t("included"), i === 0));
      });
    } else {
      var opts = $("[data-options]", root);
      item.options.forEach(function (o) {
        var group = clone("tpl-option-group");
        fill(group, { name: o.name });
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
            fill(node, { name: v.name });
            list.classList.add("mk-choice__list--swatches");
          } else {
            node = choice("opt-" + o.id, v.id, v.name, "", v.delta ? "+ " + money(v.delta) : "", o.id === "set" ? v.best : i === 0);
            if (v.best) { markBest(node); }
          }
          list.appendChild(node);
        });
        opts.appendChild(group);
      });
      var offers = $("[data-offers]", root);
      var low = lowestOffer(item);
      item.offers.forEach(function (o) {
        offers.appendChild(choice("offer", o.seller, index.seller[o.seller].name, t("dispatch_days", { n: o.days }) + (o === low ? " · " + t("lowest_price") : ""), money(o.price), o === low));
      });
    }

    function selection() {
      var data = new FormData(form);
      var sel = { id: item.id, kind: item.kind, opts: {} };
      if (isHorse(item)) { sel.plan = data.get("plan"); sel.delivery = data.get("delivery"); }
      else {
        sel.offer = data.get("offer");
        item.options.forEach(function (o) { sel.opts[o.id] = data.get("opt-" + o.id); });
      }
      return sel;
    }
    function update() { var total = linePrice(selection()); totalEl.textContent = total === null ? "—" : money(total); }
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
      if (isHorse(item)) { store.bag = store.bag.filter(function (b) { return b.id !== item.id; }); }
      store.bag.push(sel);
      saveStore();
      toast(t("added", { name: item.name }));
      window.setTimeout(function () { location.href = MROOT + "bag/"; }, 600);
    });
    update();
  }

  function linePrice(sel) {
    if (sel.kind === "plus") { return cat.membership.price; }
    var item = index.item[sel.id];
    if (!item) { return null; }
    if (isHorse(item)) {
      var plan = cat.plans.filter(function (p) { return p.id === sel.plan; })[0];
      var del = cat.delivery.filter(function (d) { return d.id === sel.delivery; })[0];
      if (!plan || !del) { return null; }
      return item.price + plan.price + (del.plus_free && transportFree() ? 0 : del.price);
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

  /* ---------- sellers ---------- */

  function sellerStock(s) {
    if (s.kind === "maker" || s.kind === "shop") {
      return { horses: [], tack: cat.tack.filter(function (x) { return x.offers.some(function (o) { return o.seller === s.id; }); }) };
    }
    return { horses: horses.filter(function (h) { return h.seller === s; }), tack: [] };
  }

  function renderSellers() {
    var wrap = $("[data-seller-groups]");
    var input = $("[data-sellers-q]");
    var counts = {};
    horses.forEach(function (h) { counts[h.seller.id] = (counts[h.seller.id] || 0) + 1; });

    function draw() {
      clear(wrap);
      var qv = input.value.trim().toLowerCase();
      ["state", "stud", "dealer", "maker", "shop", "private"].forEach(function (kind) {
        var list = cat.sellers.filter(function (s) { return s.kind === kind && (!qv || s.name.toLowerCase().indexOf(qv) !== -1); });
        if (!list.length) { return; }
        var group = clone("tpl-seller-group");
        fill(group, { name: kindName(kind), count: num.format(list.length) });
        var ul = $("[data-body]", group);
        var more = $("[data-more]", group);
        var shown = 0;
        function page() {
          list.slice(shown, shown + 24).forEach(function (s) {
            var tile = clone("tpl-seller-tile");
            fill(tile, { name: s.name, line: s.line, meta: t("seller_meta", { y: s.since, r: index.region[s.region].name, n: counts[s.id] || sellerStock(s).tack.length }) });
            setHref(tile, sellerUrl(s.id));
            ul.appendChild(tile);
          });
          shown += 24;
          more.hidden = shown >= list.length;
        }
        more.addEventListener("click", page);
        page();
        wrap.appendChild(group);
      });
    }
    $("[data-sellers-form]").addEventListener("submit", function (e) { e.preventDefault(); draw(); });
    input.addEventListener("input", draw);
    draw();
  }

  function renderSeller() {
    var s = index.seller[query().get("id")];
    if (!s) { $("[data-notfound]").hidden = false; return; }
    document.title = s.name + " · " + t("market_name");
    var head = $("[data-seller]");
    head.hidden = false;
    var trade = s.kind === "maker" || s.kind === "shop";
    var stock = sellerStock(s);
    fill(head, { kind: kindName(s.kind), name: s.name, line: s.mark || s.line, offer: trade ? "" : cat.viewing_offers[s.offer] });
    $("[data-seller-offer]").hidden = trade;
    addFacts($("[data-seller-facts]"), [[t("seller_licence"), s.licence], [t("seller_since"), String(s.since)], [t("f_region"), index.region[s.region].name],
      [t("seller_listings"), num.format(stock.horses.length + stock.tack.length)]].concat(s.reply_h ? [[t("k_reply"), t("seller_reply", { h: s.reply_h })]] : []));
    var bodyEl = $("[data-seller-body]");
    bodyEl.hidden = false;
    var rows = $("[data-rows]", bodyEl);
    var more = $("[data-more]", bodyEl);
    var shown = 0;
    var list = stock.horses.sort(function (a, b) { return a.days - b.days; });
    function page() {
      list.slice(shown, shown + 20).forEach(function (h) { rows.appendChild(horseRow(h, null)); });
      shown += 20;
      more.hidden = shown >= list.length;
    }
    more.addEventListener("click", page);
    page();
    var grid = $("[data-grid]", bodyEl);
    stock.tack.forEach(function (x) { grid.appendChild(card(x)); });
  }

  /* ---------- my search ---------- */

  function renderMy() {
    function action(label, fn) {
      var btn = clone("tpl-action");
      btn.textContent = label;
      btn.addEventListener("click", fn);
      return btn;
    }
    function draw() {
      $("[data-my-sub]").textContent = t("my_sub", { s: store.shortlist.length, v: store.viewings.length });
      renderPath($("[data-path]"));

      var vEl = $("[data-my-viewings]");
      clear(vEl);
      var vs = store.viewings.filter(function (v) { return index.item[v.id]; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      vs.forEach(function (v) {
        var h = index.item[v.id];
        var row = horseRow(h, null);
        fill(row, { note: v.done ? t("viewed_on", { date: dayLabel(v.date) }) : t("viewing_on", { date: dayLabel(v.date), time: v.time }) });
        var actions = $("[data-actions]", row);
        clear(actions);
        if (!v.done) {
          actions.appendChild(action(t("mark_viewed"), function () { v.done = true; saveStore(); draw(); }));
          actions.appendChild(action(t("cancel_viewing"), function () { store.viewings.splice(store.viewings.indexOf(v), 1); saveStore(); draw(); }));
        } else {
          actions.appendChild(action(h.loan ? t("reserve_loan") : t("reserve"), function () { location.href = itemUrl(h) + "#buy"; }));
        }
        vEl.appendChild(row);
      });
      $("[data-my-viewings-empty]").hidden = vs.length > 0;

      var sEl = $("[data-my-shortlist]");
      clear(sEl);
      var shortlist = store.shortlist.map(function (id) { return index.item[id]; }).filter(Boolean);
      shortlist.forEach(function (h) {
        var row = horseRow(h, null);
        var actions = $("[data-actions]", row);
        clear(actions);
        actions.appendChild(shortlistButton(h, draw));
        sEl.appendChild(row);
      });
      $("[data-my-shortlist-empty]").hidden = shortlist.length > 0;

      var qEl = $("[data-my-searches]");
      clear(qEl);
      store.searches.forEach(function (q) {
        var node = clone("tpl-query");
        fill(node, { text: q.text, meta: t("count_horses", { n: num.format(q.n) }) });
        setHref(node, MROOT + q.href);
        qEl.appendChild(node);
      });
      $("[data-my-searches-empty]").hidden = store.searches.length > 0;

      var aEl = $("[data-my-ads]");
      clear(aEl);
      store.ads.forEach(function (ad) {
        var li = clone("tpl-li");
        li.textContent = t("my_ad_line", { name: ad.name, breed: index.breed[ad.breed] ? index.breed[ad.breed].name : "", p: money(ad.price), pkg: ad.pkg });
        aEl.appendChild(li);
      });
      $("[data-my-ads-empty]").hidden = store.ads.length > 0;
      renderCard();
    }
    draw();
  }

  /* ---------- sell ---------- */

  function renderSell() {
    var form = $("[data-sell-form]");
    var lists = { breeds: cat.breeds, sexes: cat.sexes, disciplines: cat.disciplines, regions: cat.regions };
    $$("[data-sell-select]", form).forEach(function (sel) {
      lists[sel.getAttribute("data-sell-select")].forEach(function (v) {
        var opt = clone("tpl-option");
        opt.value = v.id;
        opt.textContent = cap(v.name);
        sel.appendChild(opt);
      });
    });
    var packs = $("[data-packages]", form);
    cat.ad_packages.forEach(function (p) {
      var node = choice("pkg", p.id, p.name, p.line, money(p.price), p.best);
      packs.appendChild(p.best ? markBest(node) : node);
    });
    var totalEl = $("[data-sell-total]");
    var refEl = $("[data-sell-ref]");
    function update() {
      var data = new FormData(form);
      var p = cat.ad_packages.filter(function (x) { return x.id === data.get("pkg"); })[0];
      totalEl.textContent = p ? money(p.price) : "—";
      var breed = data.get("breed");
      var disc = data.get("disc");
      var age = parseInt(data.get("age"), 10);
      var band = breed && disc && !isNaN(age)
        ? priceBand(horses.filter(function (h) { return !h.loan && h.breed.id === breed && h.disc.id === disc && Math.abs(h.age - age) <= 2; })) : null;
      refEl.textContent = band ? t("sell_ref", { lo: money(band.lo), hi: money(band.hi), n: band.n }) : "";
    }
    form.addEventListener("change", update);
    form.addEventListener("input", update);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var errors = [];
      $$("input, select, textarea", form).forEach(function (el) {
        if (el.name && el.type !== "radio" && !el.checkValidity()) {
          errors.push(t("err_field", { field: el.closest("label").querySelector("span").textContent }));
        }
      });
      var data = new FormData(form);
      if (!data.get("pkg")) { errors.push(t("err_package")); }
      var errEl = $("[data-sell-errors]");
      clear(errEl);
      errors.forEach(function (msg) { var li = clone("tpl-li"); li.textContent = msg; errEl.appendChild(li); });
      errEl.hidden = errors.length === 0;
      if (errors.length) { return; }
      var pkg = cat.ad_packages.filter(function (x) { return x.id === data.get("pkg"); })[0];
      store.ads.unshift({ name: String(data.get("name")).trim().slice(0, 40), breed: data.get("breed"), price: parseInt(data.get("price"), 10), pkg: pkg.name });
      saveStore();
      form.hidden = true;
      var done = $("[data-sell-done]");
      done.hidden = false;
      done.focus();
      window.scrollTo(0, 0);
    });
    update();
  }

  /* ---------- bag ---------- */

  function fitSize(h) { return h.cm <= 148 ? "pony" : h.cm <= 160 ? "cob" : "full"; }

  function renderBag() {
    var view = $("[data-bag-view]");
    var listEl = $("[data-bag-list]");
    var rowsEl = $("[data-bag-rows]");
    var form = $("[data-check]");
    var regionSel = $("[data-region-select]");
    cat.regions.forEach(function (r) {
      var opt = clone("tpl-option");
      opt.value = r.id;
      opt.textContent = r.name;
      regionSel.appendChild(opt);
    });

    if (query().get("add") === "plus" && !plusInBag() && !store.plus) { store.bag.push({ kind: "plus", id: "plus" }); }
    store.bag = store.bag.filter(function (b) { return linePrice(b) !== null; });
    saveStore();
    $("[data-plus-add]").addEventListener("click", function () {
      if (!plusInBag()) { store.bag.push({ kind: "plus", id: "plus" }); saveStore(); }
      draw();
    });

    function lineInfo(b) {
      if (b.kind === "plus") { return { name: cat.membership.name, meta: cat.membership.benefits.join(" · "), extra: t("plus_period"), href: MROOT + "bag/" }; }
      var item = index.item[b.id];
      if (isHorse(item)) {
        var plan = cat.plans.filter(function (p) { return p.id === b.plan; })[0];
        var del = cat.delivery.filter(function (d) { return d.id === b.delivery; })[0];
        return { name: item.name + " · " + horseTitle(item), meta: horseFacts(item), extra: plan.name + " · " + del.name + (item.loan ? " · " + t("loan_first_month") : ""), href: itemUrl(item), item: item };
      }
      var opts = item.options.map(function (o) { return o.name + ": " + o.values.filter(function (x) { return x.id === b.opts[o.id]; })[0].name; });
      return { name: item.name, meta: opts.join(" · "), extra: t("sold_by_x", { x: index.seller[b.offer].name }), href: itemUrl(item), item: item };
    }

    function draw() {
      var lines = store.bag;
      var total = lines.reduce(function (sum, b) { return sum + linePrice(b); }, 0);
      $("[data-bag-title]").textContent = lines.length ? t("bag_title_total", { p: money(total) }) : t("bag_title");
      $("[data-bag-sub]").textContent = lines.length ? t("bag_sub") : "";
      $("[data-bag-empty]").hidden = lines.length > 0;
      $("[data-bag-body]").hidden = lines.length === 0;
      clear(listEl);
      lines.forEach(function (b, i) {
        var info = lineInfo(b);
        var node = clone("tpl-bag-line");
        fill(node, { name: info.name, meta: info.meta, extra: info.extra, price: money(linePrice(b)) });
        setHref(node, info.href);
        if (info.item) { paintMedia(node, info.item); } else { node.classList.add("mk-bagline--plus"); }
        $("[data-remove]", node).addEventListener("click", function () { store.bag.splice(i, 1); saveStore(); draw(); });
        listEl.appendChild(node);
      });
      clear(rowsEl);
      addFacts(rowsEl, [[t("subtotal"), money(total)], [t("card_name"), t("stamps_earn", { n: 1 })]], "tpl-kv");
      $("[data-bag-total]").textContent = money(total);
      $("[data-suitability]").hidden = !lines.some(function (b) { return b.kind === "horse"; });
      renderCard();
      renderPlus();
      drawRecs();
    }

    function drawRecs() {
      var wrap = $("[data-recs-wrap]");
      var ul = $("[data-recs]");
      clear(ul);
      var inBag = store.bag.map(function (b) { return b.id; });
      var horse = store.bag.map(function (b) { return index.item[b.id]; }).filter(function (x) { return x && isHorse(x); })[0];
      var wanted = horse ? cat.copy.recs_with_horse : cat.copy.recs_without_horse;
      var picks = wanted.map(function (c) { return cat.tack.filter(function (x) { return x.category === c && inBag.indexOf(x.id) === -1; })[0]; }).filter(Boolean);
      $("[data-recs-title]").textContent = horse ? t("recs_title_horse", { name: horse.name, size: t("size_" + fitSize(horse)) }) : t("recs_title");
      picks.forEach(function (x) { ul.appendChild(card(x)); });
      wrap.hidden = picks.length === 0;
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var errors = [];
      var data = new FormData(form);
      if (store.bag.some(function (b) { return b.kind === "horse"; })) {
        if (!data.get("company")) { errors.push(t("err_company_missing")); }
        if (data.get("company") === "no") { errors.push(t("err_company_no")); }
        if (!data.get("premises")) { errors.push(t("err_premises_missing")); }
        if (data.get("premises") === "none") { errors.push(t("err_premises_none")); }
        if (!data.get("experience")) { errors.push(t("err_experience")); }
        if (!data.get("vet") || !data.get("farrier") || !data.get("disqualified")) { errors.push(t("err_care")); }
      }
      if (String(data.get("name") || "").trim().length < 2) { errors.push(t("err_name")); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.get("email") || "").trim())) { errors.push(t("err_email")); }
      if (!data.get("region")) { errors.push(t("err_region")); }
      var errEl = $("[data-check-errors]");
      clear(errEl);
      errors.forEach(function (msg) { var li = clone("tpl-li"); li.textContent = msg; errEl.appendChild(li); });
      errEl.hidden = errors.length === 0;
      if (errors.length) { errEl.scrollIntoView({ block: "center", behavior: "smooth" }); return; }

      if (plusInBag()) { store.plus = true; }
      store.orders.push({ at: Date.now(), horses: store.bag.filter(function (b) { return b.kind === "horse"; }).map(function (b) { return b.id; }) });
      addStamps(1);
      store.bag = [];
      saveStore();
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
    cat.tack.forEach(function (x) { index.item[x.id] = x; });
    cat.sellers.forEach(function (s) { index.seller[s.id] = s; });
    cat.regions.forEach(function (r) { index.region[r.id] = r; });
    cat.breeds.forEach(function (b) { index.breed[b.id] = b; });
    cat.tack_categories.forEach(function (c) { index.tcat[c.id] = c; });
  }

  var PAGES = { index: renderHome, horses: renderHorses, tack: renderTack, item: renderItem, sellers: renderSellers, seller: renderSeller, my: renderMy, sell: renderSell, bag: renderBag };

  function getJson(path) {
    return fetch(ROOT + path).then(function (r) {
      if (!r.ok) { throw new Error(path + " " + r.status); }
      return r.json();
    });
  }

  initChrome();
  Promise.all([getJson("assets/data/market/catalog.json"), getJson("assets/data/market/horses.json"), getJson("assets/data/market/text.json")])
    .then(function (res) {
      cat = res[0];
      text = res[2];
      buildIndex();
      decodeHorses(res[1]);
      buildVocab();
      wireSearch($("[data-search-input]"), $("[data-search-form]"), $("[data-suggest]"), $("[data-search-head]"));
      if (PAGES[PAGE]) { PAGES[PAGE](); }
    })
    .catch(function (err) {
      $("[data-load-error]").hidden = false;
      if (window.console) { window.console.error(err); }
    });
}());
