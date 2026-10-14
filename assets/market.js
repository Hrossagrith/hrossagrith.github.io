/* Imperial Market: catalogue, finder, listing pages and reservations.
   Logic and events only. Markup lives in <template> elements of each page,
   data in assets/data/market/catalog.json, words in assets/data/market/text.json. */

(function () {
  "use strict";

  var body = document.body;
  var lang = body.getAttribute("data-lang") === "ru" ? "ru" : "en";
  var root = body.getAttribute("data-root") || "";
  var mroot = body.getAttribute("data-mroot") || "";
  var page = body.getAttribute("data-page");
  var STORE_KEY = "hrossagrith-market";
  var POINTS_GOAL = 10;
  var POINTS_START = 2;
  var POINTS_PER_RESERVATION = 3;

  var CAT = null;
  var TXT = {};

  /* ---------- Helpers ---------- */

  function L(value) {
    if (value === null || value === undefined) {
      return "";
    }
    return typeof value === "string" ? value : (value[lang] || value.en || "");
  }

  function t(key, values) {
    var text = L(TXT[key]);
    if (values) {
      Object.keys(values).forEach(function (name) {
        text = text.split("{" + name + "}").join(String(values[name]));
      });
    }
    return text;
  }

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function tpl(id) {
    var node = document.getElementById(id);
    return node.content.firstElementChild.cloneNode(true);
  }

  function setText(node, text) {
    if (node) {
      node.textContent = text;
    }
  }

  function clear(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function param(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (error) {
      return null;
    }
  }

  var numberFormat = new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "en-GB");

  function money(amount) {
    return numberFormat.format(amount) + " " + L(CAT.currency.short);
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        return list[i];
      }
    }
    return null;
  }

  function findItem(id) {
    var horse = byId(CAT.horses, id);
    if (horse) {
      return { kind: "horse", data: horse };
    }
    var tack = byId(CAT.tack, id);
    return tack ? { kind: "tack", data: tack } : null;
  }

  function itemHref(id) {
    return mroot + "item/?id=" + encodeURIComponent(id);
  }

  function readStore() {
    try {
      var stored = JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}");
      return stored && typeof stored === "object" ? stored : {};
    } catch (error) {
      return {};
    }
  }

  function writeStore(store) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (error) { /* storage unavailable: the market still works */ }
  }

  function points() {
    var stored = readStore();
    return typeof stored.points === "number" ? stored.points : POINTS_START;
  }

  /* A listing's picture: its photographs when they exist, otherwise a field
     in the horse's own coat colour (or the leather's) until they arrive. */
  function paintMedia(media, item, frame) {
    var ph = $(".mk-media__ph", media);
    var images = item.images || [];
    media.style.setProperty("--tone", item.tone || "#444");
    var img = $("img", media);
    if (images.length) {
      if (!img) {
        img = document.createElement("img");
        img.decoding = "async";
        img.loading = "lazy";
        media.appendChild(img);
      }
      img.src = root + images[frame || 0];
      img.alt = item.name;
      if (ph) {
        ph.hidden = true;
      }
    } else if (img) {
      img.remove();
    }
  }

  function kicker(entry) {
    if (entry.kind === "horse") {
      var h = entry.data;
      return [L(h.breed), L(h.sex), t("years", { n: h.age })].join(" · ");
    }
    var brand = byId(CAT.brands, entry.data.brand);
    var category = byId(CAT.tack_categories, entry.data.category);
    return (brand ? brand.name : "") + " · " + L(category && category.name);
  }

  function priceLine(entry) {
    return entry.kind === "tack" && (entry.data.options || []).length
      ? t("from") + " " + money(entry.data.price)
      : money(entry.data.price);
  }

  function card(entry, onCompare, compared) {
    var node = tpl("tpl-card");
    var link = $(".mk-card__link", node);
    link.href = itemHref(entry.data.id);
    paintMedia($(".mk-media", node), entry.data);
    setText($(".mk-card__kicker", node), kicker(entry));
    setText($(".mk-card__name", node), entry.data.name);
    setText($(".mk-card__tag", node), L(entry.data.tagline));
    setText($(".mk-card__price", node), priceLine(entry));
    var label = $(".mk-card__compare", node);
    if (onCompare) {
      var box = $("input", label);
      box.checked = !!compared;
      setText($("span", label), t("compare"));
      box.addEventListener("change", function () {
        onCompare(entry, box.checked, box);
      });
    } else {
      label.remove();
    }
    return node;
  }

  /* Single-choice chip group. `options` = [{ v, label }]; existing buttons are reused. */
  function chips(container, options, onPick) {
    if (options) {
      clear(container);
      options.forEach(function (option) {
        var chip = tpl("tpl-chip");
        chip.setAttribute("data-v", option.v);
        chip.textContent = option.label;
        container.appendChild(chip);
      });
    }
    $$(".mk-chip", container).forEach(function (chip) {
      chip.addEventListener("click", function () {
        $$(".mk-chip", container).forEach(function (other) {
          other.setAttribute("aria-pressed", other === chip ? "true" : "false");
        });
        onPick(chip.getAttribute("data-v"));
      });
    });
  }

  function press(container, value) {
    $$(".mk-chip", container).forEach(function (chip) {
      chip.setAttribute("aria-pressed", chip.getAttribute("data-v") === value ? "true" : "false");
    });
  }

  function horseEntries(filter) {
    return CAT.horses.filter(filter || function () { return true; }).map(function (h) {
      return { kind: "horse", data: h };
    });
  }

  function tackEntries(filter) {
    return CAT.tack.filter(filter || function () { return true; }).map(function (k) {
      return { kind: "tack", data: k };
    });
  }

  function keepLanguageLinkQuery() {
    var link = $(".mk-lang");
    if (link && window.location.search) {
      link.href = link.getAttribute("href") + window.location.search;
    }
  }

  /* ---------- Home ---------- */

  function renderPoints() {
    var fill = $("[data-points-fill]");
    var label = $("[data-points-label]");
    if (!fill) {
      return;
    }
    var n = Math.min(points(), POINTS_GOAL);
    fill.style.transform = "scaleX(" + (n / POINTS_GOAL) + ")";
    setText(label, t("points_of", { n: n, m: POINTS_GOAL }));
  }

  /* Score every horse against the three answers and keep the best two: a
     choice of two converts better than a wall of options, and better than one. */
  function bestTwo(answers) {
    var targetEnergy = { calm: 2, mid: 3, keen: 4.5 }[answers.pace];
    var scored = CAT.horses.map(function (h) {
      var score = 0;
      if (h.discipline === answers.use) { score += 6; }
      score -= Math.abs(h.temperament.energy - targetEnergy) * 1.5;
      if (answers.exp === "new") {
        score += (h.temperament.calm - 3) - Math.max(0, h.temperament.sensitivity - 3) * 1.5;
      } else if (answers.exp === "some") {
        score += (h.temperament.calm - 3) * 0.5;
      }
      return { h: h, score: score };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, 2).map(function (s) { return { kind: "horse", data: s.h }; });
  }

  function home() {
    var tiles = $("[data-tiles]");
    CAT.disciplines.forEach(function (d) {
      var tile = tpl("tpl-tile");
      tile.href = mroot + "catalogue/?d=horses&k=" + d.id;
      var count = CAT.horses.filter(function (h) { return h.discipline === d.id; }).length;
      setText($(".mk-tile__name", tile), L(d.name));
      setText($(".mk-tile__lede", tile), L(d.lede));
      setText($(".mk-tile__count", tile), t("count_horses", { n: count }));
      tiles.appendChild(tile);
    });

    var answers = {};
    var result = $("[data-result]");
    var resultCards = $("[data-result-cards]");
    function update() {
      if (!answers.use || !answers.exp || !answers.pace) {
        return;
      }
      clear(resultCards);
      bestTwo(answers).forEach(function (entry) {
        resultCards.appendChild(card(entry));
      });
      var first = result.hidden;
      result.hidden = false;
      if (first) {
        result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
    chips($('[data-q="use"]'), CAT.disciplines.map(function (d) {
      return { v: d.id, label: L(d.name) };
    }), function (v) { answers.use = v; update(); });
    chips($('[data-q="exp"]'), null, function (v) { answers.exp = v; update(); });
    chips($('[data-q="pace"]'), null, function (v) { answers.pace = v; update(); });

    var featured = $("[data-featured-tack]");
    tackEntries().slice(0, 4).forEach(function (entry) {
      featured.appendChild(card(entry));
    });

    var brands = $("[data-brands]");
    CAT.brands.forEach(function (b) {
      var node = tpl("tpl-brand");
      setText($(".mk-brandcard__name", node), b.name);
      setText($(".mk-brandcard__since", node), t("since", { y: b.since }));
      setText($(".mk-brandcard__line", node), L(b.line));
      brands.appendChild(node);
    });

    renderPoints();
  }

  /* ---------- Catalogue ---------- */

  function catalogue() {
    var dept = param("d") === "tack" ? "tack" : "horses";
    var kind = param("k");
    var department = byId(CAT.departments, dept);
    $$("[data-dept] .mk-dept__tab").forEach(function (tab) {
      tab.setAttribute("aria-selected", tab.getAttribute("data-d") === dept ? "true" : "false");
    });
    setText($("[data-cat-title]"), L(department.name));
    setText($("[data-cat-lede]"), L(department.lede));

    var groups = dept === "horses" ? CAT.disciplines : CAT.tack_categories;
    var filters = $("[data-filters]");
    var options = [{ v: "", label: t("all") }].concat(groups.map(function (g) {
      return { v: g.id, label: L(g.name) };
    }));

    var picked = [];
    var bar = $("[data-cmpbar]");
    var count = $("[data-cmp-count]");

    function syncBar() {
      bar.hidden = picked.length === 0;
      setText(count, picked.length < 2 ? t("compare_pick") : t("compare") + ": " + picked.map(function (e) { return e.data.name; }).join(" · "));
      $("[data-cmp-open]").disabled = picked.length !== 2;
    }

    function onCompare(entry, on, box) {
      picked = picked.filter(function (e) { return e.data.id !== entry.data.id; });
      if (on) {
        if (picked.length === 2) {
          box.checked = false;
          return;
        }
        picked.push(entry);
      }
      syncBar();
    }

    function render(k) {
      var grid = $("[data-cards]");
      clear(grid);
      var entries = dept === "horses"
        ? horseEntries(function (h) { return !k || h.discipline === k; })
        : tackEntries(function (x) { return !k || x.category === k; });
      entries.forEach(function (entry) {
        var on = picked.some(function (p) { return p.data.id === entry.data.id; });
        grid.appendChild(card(entry, onCompare, on));
      });
      $("[data-empty]").hidden = entries.length > 0;
      var group = byId(groups, k || "");
      if (group && group.lede) {
        setText($("[data-cat-lede]"), L(group.lede));
      } else {
        setText($("[data-cat-lede]"), L(department.lede));
      }
    }

    chips(filters, options, function (v) {
      var url = "?d=" + dept + (v ? "&k=" + v : "");
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", url);
      }
      render(v);
    });
    press(filters, kind || "");
    render(kind || "");

    var sheet = $("[data-cmp-sheet]");
    $("[data-cmp-open]").addEventListener("click", function () {
      fillCompare($("[data-cmp]"), picked);
      openSheet(sheet);
    });
    $("[data-cmp-clear]").addEventListener("click", function () {
      picked = [];
      $$(".mk-card__compare input").forEach(function (box) { box.checked = false; });
      syncBar();
    });
    wireClose(sheet);
    syncBar();
  }

  function rowsFor(entry) {
    if (entry.kind === "horse") {
      var h = entry.data;
      return [
        [t("ext_breed"), L(h.breed)], [t("ext_sex"), L(h.sex)], [t("ext_age"), t("years", { n: h.age })],
        [t("ext_height"), t("hands", { cm: h.height_cm })], [t("ext_coat"), L(h.coat)],
        [t("int_calm"), String(h.temperament.calm) + "/5"], [t("int_energy"), String(h.temperament.energy) + "/5"],
        [t("int_sensitivity"), String(h.temperament.sensitivity) + "/5"],
        [t("certificate"), t("cert_class", { c: h.work_certificate })], [t("price_total"), money(h.price)]
      ];
    }
    var k = entry.data;
    var brand = byId(CAT.brands, k.brand);
    return [[t("seller"), brand ? brand.name : ""]].concat((k.specs || []).map(function (s) {
      return [L(s.k), L(s.v)];
    })).concat([[t("price_total"), priceLine(entry)]]);
  }

  function fillRows(dl, rows) {
    clear(dl);
    rows.forEach(function (row) {
      var node = tpl("tpl-row");
      setText($("dt", node), row[0]);
      setText($("dd", node), row[1]);
      dl.appendChild(node);
    });
  }

  function fillCompare(container, entries) {
    clear(container);
    entries.forEach(function (entry) {
      var col = tpl("tpl-cmp-col");
      setText($(".mk-cmp__name", col), entry.data.name);
      fillRows($(".mk-rows", col), rowsFor(entry));
      container.appendChild(col);
    });
  }

  /* ---------- Sheets ---------- */

  function openSheet(sheet) {
    if (typeof sheet.showModal === "function") {
      sheet.showModal();
    } else {
      sheet.setAttribute("open", "");
    }
  }

  function closeSheet(sheet) {
    if (typeof sheet.close === "function") {
      sheet.close();
    } else {
      sheet.removeAttribute("open");
    }
  }

  function wireClose(sheet) {
    $$("[data-close]", sheet).forEach(function (button) {
      button.addEventListener("click", function () { closeSheet(sheet); });
    });
    sheet.addEventListener("click", function (event) {
      if (event.target === sheet) {
        closeSheet(sheet);
      }
    });
  }

  /* ---------- Listing ---------- */

  function item() {
    var entry = findItem(param("id") || "");
    if (!entry) {
      window.location.replace(mroot + "catalogue/?d=horses");
      return;
    }
    var d = entry.data;
    var isHorse = entry.kind === "horse";
    document.title = d.name + " · " + t("market_name");

    var chosen = {};
    function currentPrice() {
      var total = d.price;
      (d.options || []).forEach(function (option) {
        var value = byId(option.values, chosen[option.id]);
        total += value ? (value.delta || 0) : 0;
      });
      return total;
    }
    function paintPrice() {
      var text = money(currentPrice());
      setText($("[data-price]"), text);
      setText($("[data-bar-price]"), text);
    }

    setText($("[data-kicker]"), kicker(entry));
    setText($("[data-name]"), d.name);
    setText($("[data-bar-name]"), d.name);
    setText($("[data-tag]"), L(d.tagline));
    setText($("[data-story]"), L(d.story));

    /* Viewer: one photograph shows as is; a sequence of frames turns under the pointer. */
    var stage = $("[data-stage]");
    var frame = 0;
    paintMedia(stage, d, frame);
    var frames = (d.images || []).length;
    var hint = $("[data-hint]");
    if (frames > 1) {
      setText(hint, t("rotate_hint"));
      var startX = null;
      stage.addEventListener("pointerdown", function (event) {
        startX = event.clientX;
        stage.setPointerCapture(event.pointerId);
      });
      stage.addEventListener("pointermove", function (event) {
        if (startX === null) { return; }
        var step = Math.round((event.clientX - startX) / 24);
        if (step !== 0) {
          frame = (frame + step + frames) % frames;
          startX = event.clientX;
          paintMedia(stage, d, frame);
        }
      });
      stage.addEventListener("pointerup", function () { startX = null; });
    } else {
      hint.hidden = frames === 1;
    }

    /* Options (tack): each choice adjusts the price. */
    var optionsBox = $("[data-options]");
    (d.options || []).forEach(function (option) {
      var node = tpl("tpl-opt");
      setText($("legend", node), L(option.name));
      chosen[option.id] = option.values[0].id;
      var group = $(".mk-chips", node);
      chips(group, option.values.map(function (v) {
        return { v: v.id, label: L(v.name) + (v.delta ? " +" + money(v.delta) : "") };
      }), function (v) { chosen[option.id] = v; paintPrice(); });
      press(group, chosen[option.id]);
      optionsBox.appendChild(node);
    });
    paintPrice();

    /* Tabs */
    var tabA = $('[data-tab="a"]');
    var tabB = $('[data-tab="b"]');
    setText(tabA, isHorse ? t("tab_exterior") : t("tab_design"));
    setText(tabB, isHorse ? t("tab_interior") : t("tab_standard"));
    [tabA, tabB].forEach(function (tab) {
      tab.addEventListener("click", function () {
        var key = tab.getAttribute("data-tab");
        [tabA, tabB].forEach(function (other) {
          other.setAttribute("aria-selected", other === tab ? "true" : "false");
        });
        $$("[data-panel]").forEach(function (panel) {
          panel.hidden = panel.getAttribute("data-panel") !== key;
        });
      });
    });
    var panelA = $('[data-panel="a"]');
    var panelB = $('[data-panel="b"]');
    if (isHorse) {
      var ext = document.createElement("dl");
      ext.className = "mk-rows mk-rows--wide";
      fillRows(ext, [
        [t("ext_breed"), L(d.breed)], [t("ext_sex"), L(d.sex)], [t("ext_age"), t("years", { n: d.age })],
        [t("ext_height"), t("hands", { cm: d.height_cm })], [t("ext_coat"), L(d.coat)],
        [t("passport"), d.passport], [t("certificate"), t("cert_class", { c: d.work_certificate })]
      ]);
      panelA.appendChild(ext);

      var meters = document.createElement("div");
      meters.className = "mk-meters";
      var heading = document.createElement("h3");
      heading.className = "mk-h3";
      heading.textContent = t("int_temperament");
      panelB.appendChild(heading);
      ["calm", "curiosity", "sensitivity", "energy"].forEach(function (key) {
        var meter = tpl("tpl-bar");
        setText($(".mk-meter__k", meter), t("int_" + key));
        $(".mk-meter__fill", meter).style.transform = "scaleX(" + (d.temperament[key] / 5) + ")";
        meters.appendChild(meter);
      });
      panelB.appendChild(meters);
      [["int_training", d.training], ["int_health", d.health]].forEach(function (pair) {
        var h = document.createElement("h3");
        h.className = "mk-h3";
        h.textContent = t(pair[0]);
        var ul = document.createElement("ul");
        ul.className = "mk-list";
        fillList(ul, pair[1]);
        panelB.appendChild(h);
        panelB.appendChild(ul);
      });
    } else {
      var brand = byId(CAT.brands, d.brand);
      var design = document.createElement("dl");
      design.className = "mk-rows mk-rows--wide";
      fillRows(design, [[t("seller"), brand ? brand.name : ""], [t("founded"), brand ? String(brand.since) : ""]]);
      panelA.appendChild(design);

      var table = document.createElement("table");
      table.className = "mk-spec";
      var tbody = document.createElement("tbody");
      (d.specs || []).forEach(function (s) {
        var row = tpl("tpl-spec");
        setText($("th", row), L(s.k));
        setText($(".mk-spec__v", row), L(s.v));
        setText($(".mk-spec__rule", row), L(s.rule));
        tbody.appendChild(row);
      });
      table.appendChild(tbody);
      panelB.appendChild(table);
      if (d.standard && d.standard !== "—") {
        var cert = document.createElement("p");
        cert.className = "mk-badge";
        cert.textContent = t("certified", { n: d.standard });
        panelB.appendChild(cert);
      }
    }

    fillList($("[data-fits]"), d.fits || []);
    var notFor = d.not_for || [];
    $("[data-notfor-wrap]").hidden = notFor.length === 0;
    fillList($("[data-notfor]"), notFor);
    var seller = byId(CAT.brands, isHorse ? d.seller : d.brand);
    setText($("[data-seller]"), seller ? seller.name + " · " + t("since", { y: seller.since }) + ". " + L(seller.line) : "");

    /* Two alternatives: a single option makes people want to look elsewhere. */
    var alts = $("[data-alts]");
    var pool = isHorse
      ? horseEntries(function (h) { return h.id !== d.id && h.discipline === d.discipline; })
          .concat(horseEntries(function (h) { return h.id !== d.id && h.discipline !== d.discipline; }))
      : tackEntries(function (x) { return x.id !== d.id && x.category === d.category; })
          .concat(tackEntries(function (x) { return x.id !== d.id && x.category !== d.category; }));
    pool.slice(0, 2).forEach(function (alt) { alts.appendChild(card(alt)); });

    /* Buy bar appears once the main button scrolls away. */
    var mainButton = $(".mk-item__head [data-reserve]");
    var buybar = $("[data-buybar]");
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (items) {
        var gone = !items[0].isIntersecting && items[0].boundingClientRect.top < 0;
        buybar.classList.toggle("is-on", gone);
      }).observe(mainButton);
    }

    /* Reservation with the suitability check of Welfare Code Art. 92. */
    var sheet = $("[data-sheet]");
    wireClose(sheet);
    setText($("[data-sheet-title]"), t("sheet_title", { name: d.name }));
    var check = {};
    var confirm = $("[data-confirm]");
    var msg = $("[data-check-msg]");
    var checkStep = $('[data-step="check"]');
    var doneStep = $('[data-step="done"]');
    $$("[data-c]", sheet).forEach(function (group) {
      chips(group, null, function (v) {
        check[group.getAttribute("data-c")] = v;
        var complete = check.home && check.company && check.use;
        var blocked = check.home === "none" || check.company === "no" || check.use === "no";
        msg.hidden = !(complete && blocked);
        setText(msg, blocked ? t("check_hold") : "");
        confirm.disabled = !complete;
      });
    });

    function finish() {
      var store = readStore();
      store.points = (typeof store.points === "number" ? store.points : POINTS_START) + POINTS_PER_RESERVATION;
      store.reserved = (store.reserved || []).concat([d.id]);
      writeStore(store);
      setText($("[data-done-body]"), t("done_body", { name: d.name }));
      var upsell = $("[data-upsell]");
      clear(upsell);
      var picks = isHorse
        ? tackEntries(function (x) { return x.id === "calla" || x.id === "merrow-rug"; })
        : tackEntries(function (x) { return x.id !== d.id && x.category !== d.category; }).slice(0, 2);
      picks.forEach(function (p) { upsell.appendChild(card(p)); });
      checkStep.hidden = true;
      doneStep.hidden = false;
    }

    confirm.addEventListener("click", finish);
    $$("[data-reserve]").forEach(function (button) {
      button.addEventListener("click", function () {
        checkStep.hidden = false;
        doneStep.hidden = true;
        if (!isHorse) {
          finish();
        }
        openSheet(sheet);
      });
    });
  }

  function fillList(ul, items) {
    clear(ul);
    items.forEach(function (text) {
      var li = tpl("tpl-li");
      li.textContent = L(text);
      ul.appendChild(li);
    });
  }

  /* ---------- Start ---------- */

  function start(files) {
    CAT = files[0];
    TXT = files[1];
    keepLanguageLinkQuery();
    if (page === "index") { home(); }
    if (page === "catalogue") { catalogue(); }
    if (page === "item") { item(); }
  }

  Promise.all([
    fetch(root + "assets/data/market/catalog.json").then(function (r) { if (!r.ok) { throw new Error("catalog"); } return r.json(); }),
    fetch(root + "assets/data/market/text.json").then(function (r) { if (!r.ok) { throw new Error("text"); } return r.json(); })
  ]).then(start).catch(function () {
    var error = $("[data-load-error]");
    if (error) { error.hidden = false; }
  });
})();
