/* Bit mechanics register: chooser and dossier behaviour.
   Logic, events and attribute binding only. Every piece of markup lives in the
   page or in a <template>; this file clones templates and sets text and
   attributes. Physics is in bits-model.js; prose is in the data files. */

(function () {
  "use strict";

  var body = document.body;
  var page = body.getAttribute("data-bits-page");
  var lang = body.getAttribute("data-lang") || "en";
  var alt = lang === "ru" ? "en" : "ru";
  var dataBase = body.getAttribute("data-bits-data") || "";
  var M = window.BitModel;
  var CATALOG = null;
  var TEXT = null;
  var REFERENCE_RANK = null;

  if (!page || !M) {
    return;
  }

  /* ---------- Small helpers ---------- */

  function t(obj) {
    if (!obj) { return ""; }
    if (typeof obj === "string") { return obj; }
    return obj[lang] || obj.en || "";
  }

  function ta(obj) {
    if (!obj) { return ""; }
    return obj[alt] || "";
  }

  function ui(key, fallback) {
    var entry = TEXT && TEXT.ui ? TEXT.ui[key] : null;
    return entry ? (entry[lang] || entry.en || fallback || key) : (fallback || key);
  }

  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, function (match, key) {
      return values[key] != null ? values[key] : match;
    });
  }

  function num(x, digits) {
    var factor = Math.pow(10, digits || 0);
    var v = Math.round(x * factor) / factor;
    var s = v.toFixed(digits || 0);
    return lang === "ru" ? s.replace(".", ",") : s;
  }

  function N(x) { return num(x, x < 10 ? 1 : 0) + " " + ui("unit_N", "N"); }
  function kPa(x) { return num(x, 0) + " " + ui("unit_kPa", "kPa"); }
  function mm(x, digits) { return num(x, digits == null ? 0 : digits) + " " + ui("unit_mm", "mm"); }
  function pct(x) { return num(x * 100, 0) + " %"; }

  function clone(id) {
    var tpl = document.getElementById(id);
    return tpl ? tpl.content.firstElementChild.cloneNode(true) : null;
  }

  function clear(node) {
    while (node && node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function setText(selector, text, root) {
    var nodes = (root || document).querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = text;
    }
  }

  function field(name, text) {
    setText('[data-field="' + name + '"]', text);
  }

  function show(node, visible) {
    if (!node) { return; }
    if (visible) { node.removeAttribute("hidden"); } else { node.setAttribute("hidden", ""); }
  }

  function say(key, visible) {
    var nodes = document.querySelectorAll('[data-say="' + key + '"]');
    for (var i = 0; i < nodes.length; i++) {
      show(nodes[i], visible);
    }
  }

  function levelOf(kpa) {
    var th = CATALOG.thresholds_kpa;
    if (kpa < th.pain_free_upper) { return "good"; }
    if (kpa < th.face_ppt) { return "warning"; }
    if (kpa < th.hand_ppt) { return "serious"; }
    return "critical";
  }

  function query() {
    var out = {};
    var raw = window.location.search.replace(/^\?/, "");
    if (!raw) { return out; }
    var parts = raw.split("&");
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split("=");
      if (kv[0]) {
        out[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || "").replace(/\+/g, " "));
      }
    }
    return out;
  }

  function buildQuery(params) {
    var pairs = [];
    for (var key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key) && params[key] != null && params[key] !== "") {
        pairs.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
      }
    }
    return pairs.length ? "?" + pairs.join("&") : "";
  }

  function akaText(entity) {
    var list = entity.aka ? (entity.aka[lang] || entity.aka.en || []) : [];
    return list.join(" · ");
  }

  function groupOf(id) { return M.byId(CATALOG.groups, id); }
  function subgroupOf(id) { return M.byId(CATALOG.subgroups, id); }
  function familyOf(id) { return M.byId(CATALOG.mouthpiece_families, id); }

  function dossierUrl(base, cheekId, mouthId, extra) {
    var params = { cheek: cheekId, mouth: mouthId };
    if (extra) {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) { params[key] = extra[key]; }
      }
    }
    return base + buildQuery(params);
  }

  function referenceRanking() {
    if (!REFERENCE_RANK) {
      REFERENCE_RANK = M.rankAll(CATALOG, {}, ["invalid", "theoretical"]);
    }
    return REFERENCE_RANK;
  }

  function rankOf(cheekId, mouthId) {
    var rows = referenceRanking();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].cheek === cheekId && rows[i].mouth === mouthId) {
        return { rank: rows[i].rank, total: rows.length, row: rows[i] };
      }
    }
    return { rank: null, total: rows.length, row: null };
  }

  /* ---------- Loading ---------- */

  function load(name) {
    return fetch(dataBase + name, { cache: "no-cache" }).then(function (response) {
      if (!response.ok) { throw new Error(name + " unavailable"); }
      return response.json();
    });
  }

  Promise.all([load("catalog.json"), load("text.json")])
    .then(function (files) {
      CATALOG = files[0];
      TEXT = files[1];
      var loading = document.querySelector("[data-loading]");
      if (loading) { loading.remove(); }
      if (page === "chooser") {
        chooser();
      } else if (page === "dossier") {
        dossier();
      }
    })
    .catch(function (error) {
      var loading = document.querySelector("[data-loading]");
      if (loading) {
        loading.textContent = ui("load_error", "The register data could not be loaded.");
      }
      if (window.console) { window.console.error(error); }
    });

  /* =====================================================================
     Chooser
     ===================================================================== */

  function chooser() {
    var state = { group: null, cheek: null, mouth: null };
    var steps = {
      group: document.querySelector('[data-step="group"]'),
      cheek: document.querySelector('[data-step="cheek"]'),
      mouth: document.querySelector('[data-step="mouth"]')
    };
    var result = document.querySelector("[data-result]");
    var dossierBase = body.getAttribute("data-bits-dossier") || "dossier/";

    function choice(entity, badgeText, badgeClass) {
      var node = clone("tpl-choice");
      node.querySelector(".bits-choice__name").textContent = t(entity.name);
      node.querySelector(".bits-choice__alt").textContent = ta(entity.name);
      node.querySelector(".bits-choice__aka").textContent = entity.summary ? t(entity.summary) : akaText(entity);
      node.querySelector(".bits-choice__badge").textContent = badgeText || "";
      if (badgeClass) { node.classList.add("bits-choice--" + badgeClass); }
      node.setAttribute("data-id", entity.id);
      return node;
    }

    function press(container, id) {
      var buttons = container.querySelectorAll("[data-choice]");
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute("aria-pressed", buttons[i].getAttribute("data-id") === id ? "true" : "false");
      }
    }

    function renderGroups() {
      var container = steps.group.querySelector("[data-choices]");
      clear(container);
      CATALOG.groups.forEach(function (group) {
        var node = choice(group);
        node.addEventListener("click", function () {
          state.group = group.id;
          state.cheek = null;
          state.mouth = null;
          press(container, group.id);
          renderCheeks();
          show(steps.cheek, true);
          show(steps.mouth, false);
          show(result, false);
          steps.cheek.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        container.appendChild(node);
      });
    }

    function renderCheeks() {
      var container = steps.cheek.querySelector("[data-choices]");
      clear(container);
      CATALOG.subgroups.filter(function (sg) { return sg.group === state.group; }).forEach(function (sg) {
        var head = clone("tpl-subhead");
        head.textContent = t(sg.name);
        container.appendChild(head);
        CATALOG.cheeks.filter(function (c) { return c.subgroup === sg.id; }).forEach(function (cheek) {
          var node = choice(cheek);
          node.addEventListener("click", function () {
            state.cheek = cheek.id;
            state.mouth = null;
            press(container, cheek.id);
            renderMouths();
            show(steps.mouth, true);
            show(result, false);
            steps.mouth.scrollIntoView({ behavior: "smooth", block: "start" });
          });
          container.appendChild(node);
        });
      });
    }

    function renderMouths() {
      var container = steps.mouth.querySelector("[data-choices]");
      clear(container);
      CATALOG.mouthpiece_families.forEach(function (family) {
        var head = clone("tpl-subhead");
        head.textContent = t(family.name);
        container.appendChild(head);
        CATALOG.mouthpieces.filter(function (m) { return m.family === family.id; }).forEach(function (mouth) {
          var status = M.validity(CATALOG, state.cheek, mouth.id);
          var node = choice(mouth, ui("validity_" + status, status), status);
          if (status === "invalid") {
            node.setAttribute("disabled", "");
          } else {
            node.addEventListener("click", function () {
              state.mouth = mouth.id;
              press(container, mouth.id);
              renderResult(status);
              show(result, true);
              result.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
          }
          container.appendChild(node);
        });
      });
    }

    function renderResult(status) {
      var cheek = M.byId(CATALOG.cheeks, state.cheek);
      var mouth = M.byId(CATALOG.mouthpieces, state.mouth);
      var pair = M.pairing(CATALOG, state.cheek, state.mouth);
      field("selection", t(cheek.name) + " × " + t(mouth.name));
      field("selection-alt", ta(cheek.name) + " × " + ta(mouth.name));
      var note = ui("validity_" + status, status);
      if (pair) { note += " · " + t(pair.name); }
      var rank = rankOf(state.cheek, state.mouth);
      if (rank.rank) {
        note += " · " + fill(ui("rank_line", "Rank {rank} of {total}, kindest first"), { rank: rank.rank, total: rank.total });
      }
      field("selection-note", note);
      var link = result.querySelector("[data-dossier-link]");
      link.setAttribute("href", dossierUrl(dossierBase, state.cheek, state.mouth));
    }

    function bin(composite) {
      if (composite < 12) { return 1; }
      if (composite < 18) { return 2; }
      if (composite < 28) { return 3; }
      if (composite < 42) { return 4; }
      return 5;
    }

    function renderMatrix() {
      var table = document.querySelector("[data-matrix]");
      if (!table) { return; }
      var headRow = table.querySelector("thead tr");
      var tbody = table.querySelector("tbody");
      CATALOG.mouthpieces.forEach(function (mouth) {
        var th = clone("tpl-matrix-col");
        th.querySelector("span").textContent = t(mouth.name);
        th.setAttribute("title", t(mouth.name));
        headRow.appendChild(th);
      });
      var all = M.rankAll(CATALOG, {}, ["invalid"]);
      var lookup = {};
      all.forEach(function (row) { lookup[row.cheek + "|" + row.mouth] = row; });
      var ranking = referenceRanking();
      var rankLookup = {};
      ranking.forEach(function (row) { rankLookup[row.cheek + "|" + row.mouth] = row.rank; });

      CATALOG.cheeks.forEach(function (cheek) {
        var tr = clone("tpl-matrix-row");
        tr.querySelector("th").textContent = t(cheek.name);
        CATALOG.mouthpieces.forEach(function (mouth) {
          var td = clone("tpl-matrix-cell");
          var cell = td.querySelector("a");
          var status = M.validity(CATALOG, cheek.id, mouth.id);
          var label = t(cheek.name) + " × " + t(mouth.name);
          if (status === "invalid") {
            cell.classList.add("bits-cell--invalid");
            cell.removeAttribute("href");
            cell.setAttribute("aria-disabled", "true");
            cell.querySelector("span").textContent = label + ": " + ui("validity_invalid", "impossible");
          } else {
            var row = lookup[cheek.id + "|" + mouth.id];
            cell.classList.add("bits-cell--" + bin(row.composite));
            if (status === "theoretical") { cell.classList.add("bits-cell--theoretical"); }
            cell.setAttribute("href", dossierUrl(dossierBase, cheek.id, mouth.id));
            var rank = rankLookup[cheek.id + "|" + mouth.id];
            var title = label + " — " + ui("index_short", "index") + " " + num(row.composite, 1);
            if (rank) { title += ", " + fill(ui("rank_short", "rank {rank}"), { rank: rank }); }
            cell.setAttribute("title", title);
            cell.querySelector("span").textContent = title;
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    }

    function renderExtremes() {
      var container = document.querySelector("[data-extremes]");
      if (!container) { return; }
      var ranking = referenceRanking();
      var common = ranking.filter(function (r) { return r.validity === "common"; });
      var cards = [
        { kicker: ui("kindest_made", "Kindest of everything made"), row: ranking[0] },
        { kicker: ui("kindest_common", "Kindest of the common bits"), row: common[0] },
        { kicker: ui("harshest_common", "Harshest of the common bits"), row: common[common.length - 1] },
        { kicker: ui("harshest_made", "Harshest of everything made"), row: ranking[ranking.length - 1] }
      ];
      cards.forEach(function (card) {
        if (!card.row) { return; }
        var cheek = M.byId(CATALOG.cheeks, card.row.cheek);
        var mouth = M.byId(CATALOG.mouthpieces, card.row.mouth);
        var node = clone("tpl-extreme");
        node.querySelector(".bits-extreme__kicker").textContent = card.kicker;
        var link = node.querySelector("h3 a");
        link.textContent = t(cheek.name) + " × " + t(mouth.name);
        link.setAttribute("href", dossierUrl(dossierBase, cheek.id, mouth.id));
        node.querySelector(".bits-alt").textContent = ta(cheek.name) + " × " + ta(mouth.name);
        node.querySelector(".bits-extreme__meta").textContent = fill(ui("extreme_meta", "Index {index} · rank {rank} of {total} · peak {peak} on the {site}"), {
          index: num(card.row.composite, 1), rank: card.row.rank, total: ranking.length,
          peak: kPa(card.row.peak), site: ui("tissue_" + card.row.peakSite, card.row.peakSite)
        });
        container.appendChild(node);
      });
    }

    renderGroups();
    renderMatrix();
    renderExtremes();
  }

  /* =====================================================================
     Dossier
     ===================================================================== */

  function dossier() {
    var params = query();
    var cheekId = params.cheek;
    var mouthId = params.mouth;
    var cheek = M.byId(CATALOG.cheeks, cheekId);
    var mouth = M.byId(CATALOG.mouthpieces, mouthId);
    var missing = document.querySelector("[data-missing]");
    var container = document.querySelector("[data-dossier]");

    if (!cheek || !mouth || M.validity(CATALOG, cheekId, mouthId) === "invalid") {
      show(missing, true);
      return;
    }
    show(container, true);

    var controls = document.querySelector("[data-controls]");
    var chooserBase = body.getAttribute("data-bits-chooser") || "../";
    var state = {
      F: params.F ? Number(params.F) : CATALOG.defaults.rein_tension,
      posture: params.posture || CATALOG.defaults.posture,
      d: params.d ? Number(params.d) : null,
      space: params.space ? Number(params.space) : CATALOG.mouth.bit_space,
      guard: params.guard === "1",
      curbShare: params.curbShare ? Number(params.curbShare) : CATALOG.defaults.curb_rein_share,
      cheekOptions: {},
      mouthOptions: {}
    };
    (cheek.options || []).forEach(function (option) {
      state.cheekOptions[option.id] = params["co." + option.id] || option["default"];
    });
    (mouth.options || []).forEach(function (option) {
      state.mouthOptions[option.id] = params["mo." + option.id] || option["default"];
    });

    /* ---------- Static header ---------- */

    var group = groupOf(cheek.group);
    var subgroup = subgroupOf(cheek.subgroup);
    var validityStatus = M.validity(CATALOG, cheekId, mouthId);
    var pair = M.pairing(CATALOG, cheekId, mouthId);
    var title = t(cheek.name) + " × " + t(mouth.name);
    document.title = title + " — " + document.title.split(" — ").pop();
    field("crumb", title);
    field("group-name", t(group.name));
    field("subgroup-name", t(subgroup.name) + " · " + t(familyOf(mouth.family).name));
    field("title", title);
    field("title-alt", ta(cheek.name) + " × " + ta(mouth.name));
    var aka = [];
    if (akaText(cheek)) { aka.push(t(cheek.name) + ": " + akaText(cheek)); }
    if (akaText(mouth)) { aka.push(t(mouth.name) + ": " + akaText(mouth)); }
    field("aka", aka.join(" — "));
    var vBadge = document.querySelector('[data-field="validity"]');
    vBadge.textContent = ui("validity_" + validityStatus, validityStatus);
    vBadge.classList.add("bits-badge--" + validityStatus);
    show(vBadge, true);
    var pBadge = document.querySelector('[data-field="pairing"]');
    if (pair) { pBadge.textContent = t(pair.name); show(pBadge, true); }
    show(document.querySelector('[data-field="double-bridle"]'), !!cheek.double_bridle);
    field("cheek-name", t(cheek.name));
    field("cheek-name-alt", ta(cheek.name));
    field("mouth-name", t(mouth.name));
    field("mouth-name-alt", ta(mouth.name));

    /* Prose */
    var cheekText = TEXT.cheeks[cheekId] || {};
    var mouthText = TEXT.mouthpieces[mouthId] || {};
    setText('[data-text="cheek.mechanics"]', t(cheekText.mechanics));
    setText('[data-text="cheek.stop"]', t(cheekText.stop));
    setText('[data-text="cheek.head"]', t(cheekText.head));
    setText('[data-text="cheek.welfare"]', t(cheekText.welfare));
    setText('[data-text="mouth.mechanics"]', t(mouthText.mechanics));
    setText('[data-text="mouth.tissue"]', t(mouthText.tissue));
    setText('[data-text="mouth.welfare"]', t(mouthText.welfare));
    renderInteractions();
    renderParams();
    renderSources();

    /* ---------- Controls ---------- */

    var postureSelect = controls.querySelector('[name="posture"]');
    CATALOG.postures.forEach(function (posture) {
      var opt = document.createElement("option");
      opt.value = posture.id;
      opt.textContent = t(posture.name) + " (θ = " + posture.theta + "°)";
      postureSelect.appendChild(opt);
    });

    function optionControls(entity, holder, stateKey, prefix) {
      clear(holder);
      (entity.options || []).forEach(function (option) {
        var node = clone("tpl-option");
        node.querySelector("span").textContent = t(option.name);
        var select = node.querySelector("select");
        select.name = prefix + option.id;
        option.values.forEach(function (value) {
          var opt = document.createElement("option");
          opt.value = value.id;
          opt.textContent = t(value.name);
          select.appendChild(opt);
        });
        select.value = state[stateKey][option.id];
        select.addEventListener("change", function () {
          state[stateKey][option.id] = select.value;
          update();
        });
        holder.appendChild(node);
      });
    }
    optionControls(cheek, controls.querySelector('[data-options="cheek"]'), "cheekOptions", "co.");
    optionControls(mouth, controls.querySelector('[data-options="mouth"]'), "mouthOptions", "mo.");

    var fInput = controls.querySelector('[name="F"]');
    var dInput = controls.querySelector('[name="d"]');
    var spaceInput = controls.querySelector('[name="space"]');
    var shareInput = controls.querySelector('[name="curbShare"]');
    var guardInput = controls.querySelector('[name="guard"]');
    var range = CATALOG.defaults.rein_tension_range;
    fInput.min = range[0];
    fInput.max = range[1];
    var mpModel = M.resolve(mouth, state.mouthOptions);
    dInput.min = mpModel.d_range[0];
    dInput.max = mpModel.d_range[1];
    if (state.d == null) { state.d = mpModel.d; }
    var spaceRange = CATALOG.mouth.bit_space_range;
    spaceInput.min = spaceRange[0];
    spaceInput.max = spaceRange[1];

    function syncControls() {
      fInput.value = state.F;
      postureSelect.value = state.posture;
      dInput.value = state.d;
      spaceInput.value = state.space;
      shareInput.value = state.curbShare;
      guardInput.checked = state.guard;
    }
    syncControls();

    fInput.addEventListener("input", function () { state.F = Number(fInput.value); update(); });
    postureSelect.addEventListener("change", function () { state.posture = postureSelect.value; update(); });
    dInput.addEventListener("input", function () { state.d = Number(dInput.value); update(); });
    spaceInput.addEventListener("input", function () { state.space = Number(spaceInput.value); update(); });
    shareInput.addEventListener("input", function () { state.curbShare = Number(shareInput.value); update(); });
    guardInput.addEventListener("change", function () { state.guard = guardInput.checked; update(); });

    controls.querySelector("[data-reset]").addEventListener("click", function () {
      state.F = CATALOG.defaults.rein_tension;
      state.posture = CATALOG.defaults.posture;
      state.d = M.resolve(mouth, state.mouthOptions).d;
      state.space = CATALOG.mouth.bit_space;
      state.guard = CATALOG.defaults.chin_guard;
      state.curbShare = CATALOG.defaults.curb_rein_share;
      (cheek.options || []).forEach(function (o) { state.cheekOptions[o.id] = o["default"]; });
      (mouth.options || []).forEach(function (o) { state.mouthOptions[o.id] = o["default"]; });
      optionControls(cheek, controls.querySelector('[data-options="cheek"]'), "cheekOptions", "co.");
      optionControls(mouth, controls.querySelector('[data-options="mouth"]'), "mouthOptions", "mo.");
      syncControls();
      update();
    });
    controls.querySelector("[data-print]").addEventListener("click", function () {
      window.print();
    });

    /* ---------- Update cycle ---------- */

    function settings(overrides) {
      var s = {
        reinTension: state.F,
        theta: M.thetaOf(CATALOG, state.posture),
        diameter: state.d,
        bitSpace: state.space,
        chinGuard: state.guard,
        curbReinShare: state.curbShare,
        cheekOptions: state.cheekOptions,
        mouthOptions: state.mouthOptions
      };
      if (overrides) {
        for (var key in overrides) {
          if (Object.prototype.hasOwnProperty.call(overrides, key)) { s[key] = overrides[key]; }
        }
      }
      return s;
    }

    function update() {
      var res = M.compute(CATALOG, cheekId, mouthId, settings());
      var sc = M.scores(CATALOG, cheekId, mouthId, settings());
      var ref = M.scores(CATALOG, cheekId, mouthId, settings({ reinTension: CATALOG.defaults.rein_tension, theta: M.thetaOf(CATALOG, CATALOG.defaults.posture) }));
      var land = M.landscape(CATALOG, cheekId, mouthId, settings());
      var rank = rankOf(cheekId, mouthId);

      controls.querySelector('[data-out="F"]').textContent = N(state.F);
      controls.querySelector('[data-out="d"]').textContent = mm(state.d);
      controls.querySelector('[data-out="space"]').textContent = mm(state.space);
      controls.querySelector('[data-out="curbShare"]').textContent = pct(state.curbShare);
      var twoReins = res.ch.rein_mode === "two" || !!cheek.double_bridle;
      show(controls.querySelector('[data-show="curb-share"]'), twoReins);
      show(controls.querySelector('[data-show="chain"]'), !!res.ch.chain);

      renderHero(res, sc, rank);
      renderFields(res);
      figureA(res);
      figureB(res);
      figureC(res);
      figureD(res);
      figureE(land);
      figureF(sc);
      statements(res, land, sc, ref);
      updateUrl();
    }

    function updateUrl() {
      var q = { cheek: cheekId, mouth: mouthId, F: state.F, posture: state.posture, d: state.d, space: state.space };
      if (state.guard) { q.guard = 1; }
      if (state.curbShare !== CATALOG.defaults.curb_rein_share) { q.curbShare = state.curbShare; }
      for (var key in state.cheekOptions) {
        if (Object.prototype.hasOwnProperty.call(state.cheekOptions, key)) { q["co." + key] = state.cheekOptions[key]; }
      }
      for (var mkey in state.mouthOptions) {
        if (Object.prototype.hasOwnProperty.call(state.mouthOptions, mkey)) { q["mo." + mkey] = state.mouthOptions[mkey]; }
      }
      var url = window.location.pathname + buildQuery(q);
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", url);
      }
      var printUrl = document.querySelector("[data-print-url]");
      if (printUrl) { printUrl.setAttribute("data-url", window.location.origin + url); }
    }

    function renderHero(res, sc, rank) {
      field("index", num(sc.composite, 1));
      field("rank", rank.rank ? String(rank.rank) : "—");
      field("rank-total", String(rank.total));
      field("peak", kPa(res.pressures.peak));
      field("peak-site", ui("tissue_" + res.pressures.peakSite, res.pressures.peakSite));
      field("peak-verdict", ui("peak_" + levelOf(res.pressures.peak), ""));
      var meter = document.querySelector("[data-meter]");
      meter.style.width = Math.min(100, sc.composite) + "%";
      meter.setAttribute("data-level", sc.composite < 15 ? "good" : sc.composite < 30 ? "warning" : sc.composite < 45 ? "serious" : "critical");
    }

    function renderFields(res) {
      var f = res.forces;
      field("F", N(res.inputs.F));
      field("press-total", N(f.pressTotal));
      field("lip-total", N(2 * f.lipPerSide));
      field("lever-ratio", num(f.leverRatio, 1));
      field("rho", num(f.rho, 0));
      field("chain-force", N(f.chain));
      field("chin-force", N(f.chinLoad));
      field("cheek-force", N(f.cheekpiece));
      field("amplification", num(f.amplification, 1));
      field("lift", mm(f.liftMm, 0));
      field("poll-force", N(f.pollLoad));
      field("poll-kpa", kPa(res.pressures.poll));
      field("total-thickness", mm(res.totalThickness));
      field("bit-space", mm(res.inputs.bitSpace));
      field("fit-pct", pct(res.fit - 1));
      field("palate", num(res.palate, 2));
      field("contact-pct", pct(res.mp.contact_fraction || 1));
      field("edge", num(res.mp.edge || 1, 2));
      field("guard-pct", pct(res.ch.pull_through_guard || 0));
      field("chin-kpa", kPa(res.pressures.chin));
      var legendF = f.Flever > 0 && f.Fdirect > 0 ? N(f.Flever) + " + F\u209b " + N(f.Fdirect) : N(f.Flever > 0 ? f.Flever : f.Fdirect);
      field("legend-F", "= " + legendF);
      field("legend-C", res.forces.chain > 0 ? "= " + N(res.forces.chain) : "\u2014");
      field("legend-T", "= " + N(res.forces.cheekpiece));
      field("legend-R", "= " + N(Math.sqrt(f.sumX * f.sumX + f.sumY * f.sumY)));
      var pollNoteKey = cheek.mechanism === "direct" ? (cheekId === "baucher" ? "poll_note_baucher" : cheekId === "loose-ring" ? "poll_note_loose" : "poll_note_direct")
        : cheek.mechanism === "curb" ? "poll_note_curb" : cheek.mechanism === "gag-slide" ? "poll_note_gag_slide" : (res.ch.chain ? "poll_note_curb" : "poll_note_gag_lever");
      field("poll-note", ui(pollNoteKey, ""));
    }

    /* ---------- Figure A: free-body diagram ---------- */

    var SCALE_A = 0.5; /* px per mm inside the head group */
    var ORIGIN_A = { x: 300, y: 280 }; /* where the bit sits in the figure */
    var ZOOM_A = 0.82; /* the head group is scaled so the ears fit */

    function rot(point, deg) {
      var a = deg * Math.PI / 180;
      return { x: point.x * Math.cos(a) - point.y * Math.sin(a), y: point.x * Math.sin(a) + point.y * Math.cos(a) };
    }

    function arrow(id, from, dir, length) {
      var line = document.getElementById(id);
      if (!line) { return null; }
      if (length < 1) {
        line.setAttribute("visibility", "hidden");
        return null;
      }
      line.removeAttribute("visibility");
      var norm = Math.sqrt(dir.x * dir.x + dir.y * dir.y) || 1;
      var to = { x: from.x + dir.x / norm * length, y: from.y + dir.y / norm * length };
      line.setAttribute("x1", from.x.toFixed(1));
      line.setAttribute("y1", from.y.toFixed(1));
      line.setAttribute("x2", to.x.toFixed(1));
      line.setAttribute("y2", to.y.toFixed(1));
      return to;
    }

    function labelAt(id, pointHead, headRotation, text, dx, dy) {
      var label = document.getElementById(id);
      if (!label) { return; }
      if (!pointHead) {
        label.textContent = "";
        return;
      }
      var world = rot(pointHead, headRotation);
      label.setAttribute("x", (ORIGIN_A.x + ZOOM_A * world.x + (dx || 0)).toFixed(1));
      label.setAttribute("y", (ORIGIN_A.y + ZOOM_A * world.y + (dy || 0)).toFixed(1));
      label.textContent = text;
    }

    function midpoint(a, b) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    function figureA(res) {
      var f = res.forces;
      var theta = res.inputs.theta;
      var headRotation = 90 - theta;
      var head = document.getElementById("fa-head");
      head.setAttribute("transform", "rotate(" + headRotation.toFixed(1) + ")");
      document.getElementById("fa-world").setAttribute("transform", "translate(" + ORIGIN_A.x + " " + ORIGIN_A.y + ") scale(" + ZOOM_A + ")");
      var handLine = document.getElementById("fa-handline");
      handLine.setAttribute("x1", ORIGIN_A.x);
      handLine.setAttribute("y1", ORIGIN_A.y);
      handLine.setAttribute("y2", ORIGIN_A.y);

      var mech = cheek.mechanism;
      var ch = res.ch;
      var p = (ch.purchase || 0) * SCALE_A;
      var s = (ch.shank || 0) * SCALE_A;
      var rho = f.rho * Math.PI / 180;
      var hasShank = (mech === "curb" || mech === "gag-lever") && (p > 0 || s > 0);
      var upper = hasShank ? { x: -p * Math.sin(rho), y: -p * Math.cos(rho) } : { x: 0, y: cheekId === "baucher" ? -(ch.purchase || 25) * SCALE_A : 0 };
      var lower = hasShank ? { x: s * Math.sin(rho), y: s * Math.cos(rho) } : { x: 0, y: 0 };
      var poll = { x: -4, y: -236 };
      var chin = { x: 36, y: 10 };

      var shank = document.getElementById("fa-shank");
      shank.setAttribute("d", hasShank ? "M" + upper.x.toFixed(1) + " " + upper.y.toFixed(1) + " L0 0 L" + lower.x.toFixed(1) + " " + lower.y.toFixed(1) : (cheekId === "baucher" ? "M0 0 L0 " + upper.y.toFixed(1) : ""));

      var cheekpiece = document.getElementById("fa-cheekpiece");
      cheekpiece.setAttribute("x1", upper.x.toFixed(1));
      cheekpiece.setAttribute("y1", upper.y.toFixed(1));
      cheekpiece.setAttribute("x2", poll.x);
      cheekpiece.setAttribute("y2", poll.y);

      var chainPath = document.getElementById("fa-chain");
      if (ch.chain && hasShank) {
        var mid = { x: (upper.x + chin.x) / 2 + 14, y: (upper.y + chin.y) / 2 + 6 };
        chainPath.setAttribute("d", "M" + upper.x.toFixed(1) + " " + upper.y.toFixed(1) + " Q" + mid.x.toFixed(1) + " " + mid.y.toFixed(1) + " " + chin.x + " " + chin.y);
      } else {
        chainPath.setAttribute("d", "");
      }

      var maxForce = Math.max(f.Fdirect, f.Flever, f.chain, f.cheekpiece, Math.sqrt(f.sumX * f.sumX + f.sumY * f.sumY), 1);
      var k = Math.min(2.5, 150 / maxForce);
      var reinDir = { x: Math.sin(theta * Math.PI / 180), y: -Math.cos(theta * Math.PI / 180) };

      var reinFrom = mech === "direct" || mech === "gag-slide" ? { x: 0, y: 0 } : lower;
      var reinForce = mech === "direct" || mech === "gag-slide" ? f.Fdirect || f.Flever : f.Flever;
      var tipRein = arrow("fa-arrow-rein", reinFrom, reinDir, reinForce * k);
      labelAt("fa-l-rein", tipRein, headRotation, "F", 8, 5);

      var tipRein2 = null;
      if (hasShank && f.Fdirect > 0) {
        tipRein2 = arrow("fa-arrow-rein2", { x: 0, y: 0 }, reinDir, f.Fdirect * k);
      } else {
        arrow("fa-arrow-rein2", { x: 0, y: 0 }, reinDir, 0);
      }
      labelAt("fa-l-rein2", tipRein2, headRotation, tipRein2 ? "F\u209b" : "", 8, 16);

      var chainDir = { x: chin.x - upper.x, y: chin.y - upper.y };
      var tipChain = arrow("fa-arrow-chain", upper, chainDir, (ch.chain && hasShank) ? f.chain * k : 0);
      labelAt("fa-l-chain", tipChain, headRotation, "C", 6, 16);

      var pollDir = { x: poll.x - upper.x, y: poll.y - upper.y };
      var tipPoll = arrow("fa-arrow-poll", upper, pollDir, f.cheekpiece * k);
      labelAt("fa-l-poll", tipPoll, headRotation, "T", 8, -4);

      var reaction = { x: -f.sumY, y: f.sumX };
      var reactionMag = Math.sqrt(f.sumX * f.sumX + f.sumY * f.sumY);
      var tipReaction = arrow("fa-arrow-reaction", { x: 0, y: 0 }, reaction, reactionMag * k);
      labelAt("fa-l-reaction", tipReaction, headRotation, "R", -8, 16);
      var rl = document.getElementById("fa-l-reaction");
      if (rl) { rl.setAttribute("text-anchor", "end"); }

      var posture = M.byId(CATALOG.postures, state.posture);
      document.getElementById("fa-l-posture").textContent = t(posture.name) + " · θ = " + theta + "°";
      document.getElementById("fa-l-amp").textContent = fill(ui("amp_line", "Force onto tongue and bars: {press} ({amp}× the rein component in that direction)"), {
        press: N(f.pressTotal), amp: num(f.amplification, 1)
      });
      document.getElementById("fa-l-rho").textContent = hasShank ? fill(ui("rho_line", "shank rotation ρ = {rho}°"), { rho: num(f.rho, 0) }) : "";
    }

    /* ---------- Figure B: cross-section ---------- */

    var SCALE_B = 2.4; /* px per mm */

    function figureB(res) {
      var d = res.inputs.d;
      var mp = res.mp;
      var h = d * SCALE_B;
      var barsTop = 152;
      var height = CATALOG.mouth.tongue_thickness + CATALOG.mouth.bit_space;
      var tongueMm = Math.max(5, Math.min(CATALOG.mouth.tongue_thickness, height - res.totalThickness - 1));
      var tongueH = tongueMm * SCALE_B;
      var tongue = document.getElementById("fb-tongue");
      tongue.setAttribute("ry", (tongueH / 2).toFixed(1));
      tongue.setAttribute("cy", (barsTop - tongueH / 2 + 3).toFixed(1));
      var bitBottom = barsTop - tongueH + 2;
      var bitTop = bitBottom - h;
      var bitMid = bitBottom - h / 2;
      var left = 240 - (res.inputs.bitWidth * SCALE_B) / 2;
      var width = res.inputs.bitWidth * SCALE_B;

      var families = { bar: false, port: false, cannons: false, link: false, balls: false, keys: false };
      var family = mouth.family;
      var portPx = (mp.port_height || 0) * SCALE_B * 0.6;
      if (family === "unjointed" && !mp.port_height) { families.bar = true; }
      if (mp.keys) { families.bar = true; families.keys = true; }
      if (mp.port_height && mp.joints === 0) { families.cannons = true; families.port = true; }
      if (mp.joints === 1 && !mp.port_height) { families.cannons = true; }
      if (mp.joints === 1 && mp.port_height) { families.cannons = true; families.port = true; }
      if (mp.joints === 2 && !mp.two_strands) { families.cannons = true; families.link = true; }
      if (mp.two_strands) { families.cannons = true; }
      if (family === "multi") { families.balls = true; }

      var bar = document.getElementById("fb-bar");
      bar.setAttribute("visibility", families.bar ? "visible" : "hidden");
      bar.setAttribute("x", left.toFixed(1));
      bar.setAttribute("width", width.toFixed(1));
      bar.setAttribute("y", bitTop.toFixed(1));
      bar.setAttribute("height", h.toFixed(1));
      bar.setAttribute("rx", (h / 2).toFixed(1));

      var cannonL = document.getElementById("fb-cannon-l");
      var cannonR = document.getElementById("fb-cannon-r");
      var link = document.getElementById("fb-link");
      var port = document.getElementById("fb-port");
      var joint = { x: 240, y: bitMid };
      var lift = 0;
      if (mp.joints === 1) {
        lift = res.palate * 16;
      } else if (mp.joints === 2 && !mp.two_strands) {
        lift = -4;
      }
      joint.y = bitMid - lift;
      var gap = families.link ? 30 : (families.port ? 40 : 0);
      var cannonW = 240 - left - gap;
      var angle = families.cannons && mp.joints === 1 ? Math.atan2(lift, cannonW) * 180 / Math.PI : 0;

      [cannonL, cannonR].forEach(function (node, i) {
        node.setAttribute("visibility", families.cannons ? "visible" : "hidden");
        var x = i === 0 ? left : 240 + gap;
        node.setAttribute("x", x.toFixed(1));
        node.setAttribute("width", cannonW.toFixed(1));
        node.setAttribute("y", (joint.y - h / 2).toFixed(1));
        node.setAttribute("height", h.toFixed(1));
        node.setAttribute("rx", (h / 2).toFixed(1));
        var pivotX = i === 0 ? 240 - gap : 240 + gap;
        node.setAttribute("transform", "rotate(" + ((i === 0 ? -angle : angle)).toFixed(2) + " " + pivotX + " " + joint.y.toFixed(1) + ")");
      });

      link.setAttribute("visibility", families.link ? "visible" : "hidden");
      var linkH = mp.plate ? Math.max(6, h * 0.35) : h * 0.9;
      link.setAttribute("x", (240 - gap).toFixed(1));
      link.setAttribute("width", (2 * gap).toFixed(1));
      link.setAttribute("y", (joint.y - linkH / 2).toFixed(1));
      link.setAttribute("height", linkH.toFixed(1));
      link.setAttribute("rx", (mp.plate ? 3 : linkH / 2).toFixed(1));
      if (mp.plate && mp.edge > 1.2) {
        link.setAttribute("transform", "rotate(35 240 " + joint.y.toFixed(1) + ")");
      } else if (mp.plate_tilt_sensitive && (res.ch.ride_up_guard >= 0.6 || cheek.mechanism === "curb")) {
        link.setAttribute("transform", "rotate(18 240 " + joint.y.toFixed(1) + ")");
      } else {
        link.removeAttribute("transform");
      }

      port.setAttribute("visibility", families.port ? "visible" : "hidden");
      port.setAttribute("fill", "none");
      port.setAttribute("stroke-width", h.toFixed(1));
      port.setAttribute("stroke-linecap", "round");
      port.setAttribute("d", "M" + (240 - gap) + " " + joint.y.toFixed(1) + " Q240 " + (joint.y - portPx - h * 0.4).toFixed(1) + " " + (240 + gap) + " " + joint.y.toFixed(1));

      var balls = document.getElementById("fb-balls");
      balls.setAttribute("visibility", families.balls ? "visible" : "hidden");
      var circles = balls.querySelectorAll("circle");
      for (var i = 0; i < circles.length; i++) {
        var cx = left + h / 2 + i * (width - h) / (circles.length - 1);
        circles[i].setAttribute("cx", cx.toFixed(1));
        circles[i].setAttribute("cy", bitMid.toFixed(1));
        circles[i].setAttribute("r", (h / 2).toFixed(1));
      }

      var keys = document.getElementById("fb-keys");
      keys.setAttribute("visibility", families.keys ? "visible" : "hidden");
      var keyRects = keys.querySelectorAll("rect");
      for (var j = 0; j < keyRects.length; j++) {
        keyRects[j].setAttribute("x", (240 - 14 + j * 11).toFixed(1));
        keyRects[j].setAttribute("y", (bitBottom - 4).toFixed(1));
      }

      ["fb-ring-l", "fb-ring-r"].forEach(function (id, i) {
        var ring = document.getElementById(id);
        ring.setAttribute("cx", (i === 0 ? left - 8 : left + width + 8).toFixed(1));
        ring.setAttribute("cy", bitMid.toFixed(1));
      });

      var pr = res.pressures;
      function zone(id, value, scale) {
        var node = document.getElementById(id);
        var opacity = Math.max(0, Math.min(0.9, value / scale));
        node.style.opacity = opacity.toFixed(2);
      }
      var zoneT = document.getElementById("fb-zone-tongue");
      zoneT.setAttribute("y", bitBottom.toFixed(1));
      zoneT.setAttribute("x", (240 - 44).toFixed(1));
      zone("fb-zone-tongue", pr.tongue, 400);
      zone("fb-zone-bar-l", pr.bars, 400);
      zone("fb-zone-bar-r", pr.bars, 400);
      zone("fb-zone-lip-l", pr.lips, 400);
      zone("fb-zone-lip-r", pr.lips, 400);
      zone("fb-zone-palate", res.palate * 300, 400);

      document.getElementById("fb-l-tongue").textContent = ui("tissue_tongue", "tongue") + " " + kPa(pr.tongue);
      document.getElementById("fb-l-bar-l").textContent = ui("tissue_bars", "bars") + " " + kPa(pr.bars);
      document.getElementById("fb-l-bar-r").textContent = kPa(pr.bars);
      document.getElementById("fb-l-lip-l").textContent = ui("lips_short", "lips") + " " + kPa(pr.lips);
      document.getElementById("fb-l-lip-r").textContent = ui("lips_short", "lips") + " " + kPa(pr.lips);
      document.getElementById("fb-l-palate").textContent = fill(ui("palate_risk", "palate risk {r}"), { r: num(res.palate, 2) });
      document.getElementById("fb-l-scale").textContent = fill(ui("scale_line", "to scale: 1 mm = {px} px · mouthpiece {d}"), { px: SCALE_B, d: mm(d) });
      document.getElementById("fb-l-fit").textContent = fill(ui("fit_line", "tongue left {mm} of its {full}"), { mm: mm(tongueMm), full: mm(CATALOG.mouth.tongue_thickness) });
    }

    /* ---------- Figure C: pressure bars ---------- */

    function figureC(res) {
      var pr = res.pressures;
      var th = CATALOG.thresholds_kpa;
      var maxVal = Math.max(pr.tongue, pr.bars, pr.lips, pr.chin, pr.poll, 300);
      var axisMax = Math.min(2000, Math.ceil(maxVal / 100) * 100 + 100);
      var x0 = 200;
      var span = 400;
      function x(v) { return x0 + span * Math.min(v, axisMax) / axisMax; }

      var grid = document.getElementById("fc-grid");
      clear(grid);
      var step = axisMax > 1000 ? 500 : axisMax > 600 ? 200 : 100;
      for (var v = step; v <= axisMax; v += step) {
        var tick = clone("tpl-axis-tick");
        var line = tick.querySelector("line");
        line.setAttribute("x1", x(v).toFixed(1));
        line.setAttribute("x2", x(v).toFixed(1));
        line.setAttribute("y1", 20);
        line.setAttribute("y2", 222);
        var text = tick.querySelector("text");
        text.setAttribute("x", x(v).toFixed(1));
        text.setAttribute("y", 250);
        text.textContent = String(v);
        grid.appendChild(tick);
      }
      document.getElementById("fc-axis-max").textContent = "";

      ["free", "face"].forEach(function (name) {
        var value = name === "free" ? th.pain_free_upper : th.face_ppt;
        var line = document.getElementById("fc-th-" + name);
        line.setAttribute("x1", x(value).toFixed(1));
        line.setAttribute("x2", x(value).toFixed(1));
        var label = document.getElementById("fc-th-" + name + "-l");
        label.setAttribute("x", x(value).toFixed(1));
      });

      var table = document.querySelector("[data-pressure-table]");
      var loads = {
        bars: { load: res.forces.pressTotal * res.mp.share.bars / 2, area: res.areas.bar },
        tongue: { load: res.forces.pressTotal * res.mp.share.tongue * res.fit, area: res.areas.tongue },
        lips: { load: res.forces.lipPerSide, area: res.areas.lip },
        chin: { load: res.forces.chinLoad, area: res.areas.chin },
        poll: { load: res.forces.pollLoad, area: res.areas.poll }
      };
      ["bars", "tongue", "lips", "chin", "poll"].forEach(function (tissue) {
        var value = pr[tissue];
        var bar = document.querySelector('[data-bar="' + tissue + '"]');
        var w = Math.max(0, x(value) - x0);
        bar.setAttribute("width", w.toFixed(1));
        bar.setAttribute("rx", w > 4 ? 4 : 0);
        var val = document.querySelector('[data-val="' + tissue + '"]');
        val.setAttribute("x", (x0 + w + 6).toFixed(1));
        val.textContent = (value > axisMax ? "▸ " : "") + kPa(value);
        var row = table.querySelector('[data-tissue="' + tissue + '"]');
        row.querySelector('[data-cell="load"]').textContent = N(loads[tissue].load);
        row.querySelector('[data-cell="area"]').textContent = num(loads[tissue].area, 0) + " " + ui("unit_mm2", "mm²");
        row.querySelector('[data-cell="kpa"]').textContent = kPa(value);
        var status = row.querySelector('[data-cell="status"]');
        var level = levelOf(value);
        status.setAttribute("data-level", level);
        status.textContent = ui("level_" + level, level);
      });
    }

    /* ---------- Figure D: stops ---------- */

    function figureD(res) {
      var f = res.forces;
      var ch = res.ch;
      var travelMax = CATALOG.mouth.commissure_to_premolar;
      var pxPerMm = 500 / travelMax;
      var lift = Math.min(travelMax, f.liftMm);
      var stopMm;
      var stopLabel;
      var mech = cheek.mechanism;
      if (ch.stop === "suspension") { stopMm = 3; stopLabel = ui("stop_suspension", "fixed cheek holds it here"); }
      else if (ch.stop === "chain") { stopMm = 2; stopLabel = fill(ui("stop_chain", "shank stops at {rho}°; mouthpiece does not rise"), { rho: num(f.rho, 0) }); }
      else if (ch.stop === "cheekpiece") { stopMm = Math.min(travelMax, f.liftMm); stopLabel = fill(ui("stop_cheekpiece", "cheekpiece taut after {mm}"), { mm: mm(f.liftMm) }); }
      else if (ch.stop === "none") {
        if ((ch.slide_limit || 0) > 0) { stopMm = ch.slide_limit; stopLabel = fill(ui("stop_fitted", "rubber stop at {mm}"), { mm: mm(ch.slide_limit) }); }
        else { stopMm = travelMax; stopLabel = ui("stop_none", "no stop before the teeth"); }
      } else { stopMm = 18; stopLabel = ui("stop_tissue", "lip stretch · the only stop"); }

      if (mech === "direct") {
        lift = (ch.ride_up_guard || 0) >= 0.6 ? 2 : Math.min(18, f.lipPerSide / 2);
      }
      var bitX = 60 + lift * pxPerMm;
      document.getElementById("fd-bit").setAttribute("cx", bitX.toFixed(1));
      document.getElementById("fd-travel").setAttribute("width", (lift * pxPerMm).toFixed(1));
      var stopX = 60 + stopMm * pxPerMm;
      var stop = document.getElementById("fd-stop");
      stop.setAttribute("x1", stopX.toFixed(1));
      stop.setAttribute("x2", stopX.toFixed(1));
      var sl = document.getElementById("fd-stop-label");
      sl.setAttribute("x", stopX.toFixed(1));
      sl.setAttribute("text-anchor", stopX > 420 ? "end" : stopX < 200 ? "start" : "middle");
      sl.textContent = stopLabel;
      var ll = document.getElementById("fd-lift-label");
      ll.setAttribute("x", bitX.toFixed(1));
      ll.setAttribute("text-anchor", bitX > 420 ? "end" : bitX < 200 ? "start" : "middle");
      ll.textContent = fill(ui("lift_line", "modelled rise at this tension: {mm}"), { mm: mm(lift) });

      var rotText;
      if (ch.chain) { rotText = fill(ui("rot_chain", "chain engages at {rho}°: rotation stops, force does not"), { rho: num(f.rho, 0) }); }
      else if (mech === "gag-lever") { rotText = fill(ui("rot_gag_lever", "none: rotates to {rho}° until the lips stop it"), { rho: num(f.rho, 0) }); }
      else if (mech === "gag-slide") { rotText = ui("rot_pulley", "not applicable: the ring is a pulley, the bit slides"); }
      else { rotText = ui("rot_direct", "not applicable: no lever"); }
      document.getElementById("fd-rot-label").textContent = rotText;

      var guard = ch.pull_through_guard || 0;
      document.getElementById("fd-guard-bar").setAttribute("width", (200 * guard).toFixed(1));
      document.getElementById("fd-guard-label").textContent = pct(guard) + " · " + ui(guard >= 0.8 ? "guard_full" : guard >= 0.5 ? "guard_part" : "guard_none", "");
    }

    /* ---------- Figure E: posture landscape ---------- */

    function figureE(land) {
      var minPeak = Infinity;
      land.postures.forEach(function (p) { minPeak = Math.min(minPeak, p.peak); });
      var scale = 150 / Math.max(120, Math.max.apply(null, land.postures.map(function (p) { return p.peak; })));
      land.postures.forEach(function (p) {
        var g = document.querySelector('[data-posture="' + p.id + '"]');
        if (!g) { return; }
        var h = Math.min(150, p.peak * scale);
        var col = g.querySelector(".col");
        col.setAttribute("height", h.toFixed(1));
        col.setAttribute("y", (270 - h).toFixed(1));
        col.setAttribute("rx", 4);
        col.setAttribute("class", "col viz-bar" + (p.id === land.bias ? "" : " viz-bar--dim"));
        var val = g.querySelector(".val");
        val.setAttribute("y", (270 - h - 8).toFixed(1));
        val.textContent = kPa(p.peak);
        var site = g.querySelector(".site");
        site.setAttribute("y", (270 - h - 24).toFixed(1));
        site.textContent = ui("tissue_" + p.site, p.site);
      });
      var bias = M.byId(CATALOG.postures, land.bias);
      document.getElementById("fe-bias").textContent = fill(ui("bias_line", "Least pain under a holding hand: {posture}"), { posture: t(bias.name) });
    }

    /* ---------- Figure F: index components ---------- */

    function figureF(sc) {
      var w = CATALOG.weights;
      for (var key in sc.components) {
        if (!Object.prototype.hasOwnProperty.call(sc.components, key)) { continue; }
        var g = document.querySelector('[data-comp="' + key + '"]');
        if (!g) { continue; }
        var value = sc.components[key];
        var rect = g.querySelector("rect");
        rect.setAttribute("width", (value * 3).toFixed(1));
        rect.setAttribute("rx", value > 2 ? 4 : 0);
        var v = g.querySelector(".v");
        v.setAttribute("x", (300 + value * 3 + 6).toFixed(1));
        v.textContent = num(value, 0);
        g.querySelector(".w").textContent = "× " + num(w[key], 2);
      }
    }

    /* ---------- Conditional statements ---------- */

    function statements(res, land, sc, ref) {
      var ch = res.ch;
      var mp = res.mp;
      var mech = cheek.mechanism;
      var hasLever = (mech === "curb") || (mech === "gag-lever" && (ch.shank || 0) > 0);
      var chained = hasLever && !!ch.chain;

      say("direct-sum", mech === "direct" || (mech === "gag-lever" && (ch.shank || 0) === 0));
      say("curb-sum", chained);
      say("gag-lever-sum", mech === "gag-lever" && !ch.chain && (ch.shank || 0) > 0);
      say("gag-slide-sum", mech === "gag-slide");
      say("poll", true);

      say("fit-tight", res.fit > 1.02);
      say("fit-ok", res.fit <= 1.02);
      say("nutcracker", mp.joints === 1);
      say("double-joint", mp.joints === 2 && !mp.two_strands);
      say("plate-tilt", !!mp.plate && (mp.edge > 1.2 || ch.ride_up_guard >= 0.6 || mech === "curb" || mech === "gag-lever"));
      say("unjointed", mp.joints === 0 && !mp.keys && !mp.port_height);
      say("port", !!mp.port_height);
      say("textured", (mp.contact_fraction || 1) < 0.9 && (mp.edge || 1) > 1.2);
      say("multilink", mouth.family === "multi");
      say("keys", !!mp.keys);

      say("tension-context", true);
      say("sustained", true);

      say("stop-suspension", ch.stop === "suspension");
      say("stop-tissue", ch.stop === "tissue");
      say("stop-chain", ch.stop === "chain");
      say("stop-cheekpiece", ch.stop === "cheekpiece" && !ch.chain);
      say("stop-none", ch.stop === "none" && !(ch.slide_limit > 0));
      say("stops-fitted", ch.stop === "none" && ch.slide_limit > 0);
      say("pull-through", (ch.pull_through_guard || 0) < 0.5);
      say("lip-pinch", !!ch.ring_through_mouthpiece);

      ["above", "correct", "vertical", "btv"].forEach(function (id) { say("bias-" + id, land.bias === id); });
      say("curb-head", chained);
      say("gag-head", mech === "gag-slide" || (mech === "gag-lever" && !ch.chain && (ch.shank || 0) > 0));
      say("btv-horse", true);
      field("btv-verdict", ui("btv_" + land.bias, ""));

      say("v-reference", true);
      field("ref-peak", kPa(ref.result.pressures.peak));
      field("ref-site", ui("tissue_" + ref.result.pressures.peakSite, ref.result.pressures.peakSite));
      field("ref-verdict", ui("ref_" + levelOf(ref.result.pressures.peak), ""));
      say("v-kind", ref.composite < 15);
      say("v-mid", ref.composite >= 15 && ref.composite < 35);
      say("v-harsh", ref.composite >= 35);
      say("v-rplus", true);
      say("v-lift", ch.stop === "none" || ch.stop === "cheekpiece");
      say("v-chain", !!ch.chain && !res.inputs.chinGuard && res.forces.chain > 0);
    }

    /* ---------- Interaction notes, parameters, sources ---------- */

    function matches(when, chModel, mpModel) {
      if (!when) { return true; }
      if (when.cheeks && when.cheeks.indexOf(cheekId) === -1) { return false; }
      if (when.mouths && when.mouths.indexOf(mouthId) === -1) { return false; }
      if (when.mechanisms && when.mechanisms.indexOf(cheek.mechanism) === -1) { return false; }
      if (when.families && when.families.indexOf(mouth.family) === -1) { return false; }
      if (when.joints != null && mpModel.joints !== when.joints) { return false; }
      if (when.chain != null && !!chModel.chain !== when.chain) { return false; }
      if (when.plate != null && !!mpModel.plate !== when.plate) { return false; }
      if (when.textured != null && (((mpModel.contact_fraction || 1) < 0.9) !== when.textured)) { return false; }
      if (when.ring_through != null && !!chModel.ring_through_mouthpiece !== when.ring_through) { return false; }
      if (when.suspended != null && ((chModel.ride_up_guard || 0) >= 0.6) !== when.suspended) { return false; }
      if (when.not_cheeks && when.not_cheeks.indexOf(cheekId) !== -1) { return false; }
      if (when.not_mouths && when.not_mouths.indexOf(mouthId) !== -1) { return false; }
      return true;
    }

    function renderInteractions() {
      var list = document.querySelector("[data-interactions]");
      var pairNode = document.querySelector('[data-text="pairing"]');
      var chModel = M.resolve(cheek, state.cheekOptions);
      var mpModel = M.resolve(mouth, state.mouthOptions);
      clear(list);
      var count = 0;
      var pairText = TEXT.pairings ? TEXT.pairings[cheekId + "|" + mouthId] : null;
      if (pairText) {
        pairNode.textContent = t(pairText);
        show(pairNode, true);
        count++;
      }
      (TEXT.interactions || []).forEach(function (rule) {
        if (matches(rule.when, chModel, mpModel)) {
          var li = clone("tpl-interaction");
          li.textContent = t(rule.text);
          if (rule.tone) { li.setAttribute("data-tone", rule.tone); }
          list.appendChild(li);
          count++;
        }
      });
      show(document.querySelector("[data-no-interactions]"), count === 0);
    }

    function renderParams() {
      var tbody = document.querySelector("[data-params] tbody");
      if (!tbody) { return; }
      clear(tbody);
      (TEXT.model_params || []).forEach(function (param) {
        var row = clone("tpl-param-row");
        var value = param.group === "thresholds" ? CATALOG.thresholds_kpa[param.key] : (param.group === "defaults" ? CATALOG.defaults[param.key] : CATALOG.mouth[param.key]);
        row.querySelector("th").textContent = t(param.label);
        row.querySelector("td.num").textContent = Array.isArray(value) ? value.join("–") + " " + t(param.unit) : num(value, param.digits || 0) + " " + t(param.unit);
        row.querySelectorAll("td")[1].textContent = t(param.basis);
        tbody.appendChild(row);
      });
    }

    function renderSources() {
      var list = document.querySelector("[data-sources]");
      if (!list) { return; }
      clear(list);
      (TEXT.sources || []).forEach(function (source) {
        var li = clone("tpl-source");
        li.querySelector("span").textContent = source.text;
        var a = li.querySelector("a");
        if (source.url) {
          a.setAttribute("href", source.url);
          a.textContent = source.url.replace(/^https?:\/\//, "");
        } else {
          a.remove();
        }
        list.appendChild(li);
      });
    }

    update();
  }
})();
