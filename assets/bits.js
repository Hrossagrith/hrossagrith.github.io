/* Bit mechanics register: chooser and dossier behaviour.
   Logic, events and attribute binding only. Every piece of markup lives in the
   page or in a <template>; this file clones templates and sets text, attributes
   and SVG geometry. Physics is in bits-model.js; prose, labels and sources are
   in the data files. Bits are classified by mechanism (catalogue groups), and
   drawn from their catalogue `draw` specification, never from their names. */

(function () {
  "use strict";

  var body = document.body;
  var page = body.getAttribute("data-bits-page");
  var lang = body.getAttribute("data-lang") || "en";
  var dataBase = body.getAttribute("data-bits-data") || "";
  var M = window.BitModel;
  var CATALOG = null;
  var TEXT = null;
  var IMAGES = null;
  var REFERENCE_RANK = null;
  var SVG_NS = "http://www.w3.org/2000/svg";

  if (!page || !M) {
    return;
  }

  /* ---------- Small helpers ---------- */

  function t(obj) {
    if (!obj) { return ""; }
    if (typeof obj === "string") { return obj; }
    return obj[lang] || obj.en || "";
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

  function N(x) { return num(x, x < 10 ? 1 : 0) + " " + ui("unit_N", "N"); }
  function kPa(x) { return num(x, 0) + " " + ui("unit_kPa", "kPa"); }
  function mm(x, digits) { return num(x, digits == null ? 0 : digits) + " " + ui("unit_mm", "mm"); }
  function pct(x) { return num(x * 100, 0) + " %"; }

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

  function el(id) {
    return document.getElementById(id);
  }

  /* SVG visibility helper: hidden elements keep their geometry but do not paint. */
  function vis(id, visible) {
    var node = el(id);
    if (!node) { return null; }
    if (visible) { node.removeAttribute("visibility"); } else { node.setAttribute("visibility", "hidden"); }
    return node;
  }

  function attrs(node, values) {
    if (!node) { return; }
    for (var key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        var v = values[key];
        node.setAttribute(key, typeof v === "number" ? v.toFixed(2) : v);
      }
    }
  }

  function f1(x) { return Number(x).toFixed(1); }

  function levelOf(kpa) {
    var th = CATALOG.thresholds_kpa;
    if (kpa < th.pain_free_upper) { return "good"; }
    if (kpa < th.face_ppt) { return "warning"; }
    if (kpa < th.hand_ppt) { return "serious"; }
    return "critical";
  }

  var RISK_LEVELS = ["good", "warning", "serious", "critical"];

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

  /* Alternative names in the page's own language only. */
  function akaText(entity) {
    var list = entity.aka && entity.aka[lang] ? entity.aka[lang] : [];
    return list.join(" · ");
  }

  function groupOf(id) { return M.byId(CATALOG.groups, id); }
  function subgroupOf(id) { return M.byId(CATALOG.subgroups, id); }
  function familyOf(id) { return M.byId(CATALOG.mouthpiece_families, id); }
  function disciplineOf(id) { return M.byId(CATALOG.disciplines, id); }

  function tagNames(cheek) {
    return (cheek.tags || []).map(function (id) {
      var d = disciplineOf(id);
      return d ? t(d.name) : id;
    });
  }

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

  function photoOf(kind, id) {
    return IMAGES && IMAGES[kind] ? IMAGES[kind][id] || null : null;
  }

  function imageUrl(photo) {
    return dataBase.replace(/data\/bits\/$/, "img/bits/") + photo.file;
  }

  /* Fill one photo figure: image, caption, source link, author and licence. */
  function showPhoto(figure, photo, altText) {
    if (!figure) { return false; }
    if (!photo) { show(figure, false); return false; }
    var img = figure.querySelector("img");
    img.setAttribute("src", imageUrl(photo));
    img.setAttribute("alt", altText || "");
    if (photo.width && photo.height) { img.setAttribute("width", photo.width); img.setAttribute("height", photo.height); }
    setText("[data-photo-caption]", photo.caption ? t(photo.caption) : "", figure);
    var source = figure.querySelector("[data-photo-source]");
    if (source) {
      source.setAttribute("href", photo.source || "#");
      if (photo.provider) { source.textContent = photo.provider; }
    }
    setText("[data-photo-author]", photo.author || "", figure);
    var license = figure.querySelector("[data-photo-license]");
    if (license) {
      license.textContent = photo.license || "";
      if (photo.license_url) { license.setAttribute("href", photo.license_url); } else { license.removeAttribute("href"); }
    }
    show(figure, true);
    return true;
  }

  function sourceIndex(id) {
    var list = TEXT.sources || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) { return i + 1; }
    }
    return 0;
  }

  /* ---------- Loading ---------- */

  function load(name) {
    return fetch(dataBase + name, { cache: "no-cache" }).then(function (response) {
      if (!response.ok) { throw new Error(name + " unavailable"); }
      return response.json();
    });
  }

  /* Photographs are optional: the register works without the images file. */
  function loadImages() {
    return load("images.json").catch(function () { return null; });
  }

  Promise.all([load("catalog.json"), load("text.json"), loadImages()])
    .then(function (files) {
      CATALOG = files[0];
      TEXT = files[1];
      IMAGES = files[2];
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
    var state = { group: null, cheek: null, mouth: null, discipline: null };
    var steps = {
      group: document.querySelector('[data-step="group"]'),
      cheek: document.querySelector('[data-step="cheek"]'),
      mouth: document.querySelector('[data-step="mouth"]')
    };
    var result = document.querySelector("[data-result]");
    var dossierBase = body.getAttribute("data-bits-dossier") || "dossier/";

    function choice(entity, badgeText, badgeClass, kind) {
      var node = clone("tpl-choice");
      var photo = kind ? photoOf(kind, entity.id) : null;
      var img = node.querySelector(".bits-choice__img");
      if (img && photo) {
        img.setAttribute("src", imageUrl(photo));
        img.setAttribute("alt", t(entity.name));
        show(img, true);
      }
      node.querySelector(".bits-choice__name").textContent = t(entity.name);
      node.querySelector(".bits-choice__aka").textContent = entity.summary ? t(entity.summary) : akaText(entity);
      node.querySelector(".bits-choice__badge").textContent = badgeText || "";
      var tags = node.querySelector(".bits-choice__tags");
      if (tags && entity.tags) {
        entity.tags.forEach(function (id) {
          var tag = clone("tpl-tag");
          var d = disciplineOf(id);
          tag.textContent = d ? t(d.name) : id;
          if (id === "underground") { tag.classList.add("bits-tag--underground"); }
          tags.appendChild(tag);
        });
      }
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
        var count = CATALOG.cheeks.filter(function (c) { return c.group === group.id; }).length;
        var node = choice(group, fill(ui("cheek_count", "{n} cheeks"), { n: count }));
        node.addEventListener("click", function () {
          state.group = group.id;
          state.cheek = null;
          state.mouth = null;
          press(container, group.id);
          renderFilters();
          renderCheeks();
          show(steps.cheek, true);
          show(steps.mouth, false);
          show(result, false);
          steps.cheek.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        container.appendChild(node);
      });
    }

    function renderFilters() {
      var holder = steps.cheek.querySelector("[data-filters]");
      if (!holder) { return; }
      clear(holder);
      var inGroup = CATALOG.cheeks.filter(function (c) { return c.group === state.group; });
      var used = {};
      inGroup.forEach(function (c) { (c.tags || []).forEach(function (id) { used[id] = true; }); });
      function chip(id, label) {
        var node = clone("tpl-filter");
        node.textContent = label;
        node.setAttribute("data-id", id || "");
        node.setAttribute("aria-pressed", (state.discipline || "") === (id || "") ? "true" : "false");
        node.addEventListener("click", function () {
          state.discipline = id;
          var chips = holder.querySelectorAll("[data-filter]");
          for (var i = 0; i < chips.length; i++) {
            chips[i].setAttribute("aria-pressed", chips[i].getAttribute("data-id") === (id || "") ? "true" : "false");
          }
          renderCheeks();
        });
        holder.appendChild(node);
      }
      chip(null, ui("filter_all", "All disciplines"));
      CATALOG.disciplines.forEach(function (d) {
        if (used[d.id]) { chip(d.id, t(d.name)); }
      });
      if (state.discipline && !used[state.discipline]) { state.discipline = null; }
    }

    function renderCheeks() {
      var container = steps.cheek.querySelector("[data-choices]");
      clear(container);
      var shown = 0;
      CATALOG.subgroups.filter(function (sg) { return sg.group === state.group; }).forEach(function (sg) {
        var cheeks = CATALOG.cheeks.filter(function (c) {
          return c.subgroup === sg.id && (!state.discipline || (c.tags || []).indexOf(state.discipline) !== -1);
        });
        if (!cheeks.length) { return; }
        var head = clone("tpl-subhead");
        head.textContent = t(sg.name);
        container.appendChild(head);
        cheeks.forEach(function (cheek) {
          var node = choice(cheek, "", "", "cheeks");
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
          shown++;
        });
      });
      show(steps.cheek.querySelector("[data-no-cheeks]"), shown === 0);
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
          var node = choice(mouth, ui("validity_" + status, status), status, "mouthpieces");
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
      var note = ui("validity_" + status, status);
      if (pair) { note += " · " + t(pair.name); }
      var rank = rankOf(state.cheek, state.mouth);
      if (rank.row) {
        note += " · " + ui("class_" + rank.row.harmClass, "") + " · " + fill(ui("rank_line", "Rank {rank} of {total}, kindest first"), { rank: rank.rank, total: rank.total });
      }
      field("selection-note", note);
      var link = result.querySelector("[data-dossier-link]");
      link.setAttribute("href", dossierUrl(dossierBase, state.cheek, state.mouth));
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

      CATALOG.groups.forEach(function (group) {
        var cheeks = CATALOG.cheeks.filter(function (c) { return c.group === group.id; });
        if (!cheeks.length) { return; }
        var groupRow = clone("tpl-matrix-group");
        var groupCell = groupRow.querySelector("th");
        groupCell.textContent = t(group.name);
        groupCell.setAttribute("colspan", String(CATALOG.mouthpieces.length + 1));
        tbody.appendChild(groupRow);
        cheeks.forEach(function (cheek) {
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
              cell.querySelector(".visually-hidden").textContent = label + ": " + ui("validity_invalid", "impossible");
            } else {
              var row = lookup[cheek.id + "|" + mouth.id];
              cell.classList.add("bits-cell--c" + row.harmClass);
              if (status === "theoretical") { cell.classList.add("bits-cell--theoretical"); }
              cell.setAttribute("href", dossierUrl(dossierBase, cheek.id, mouth.id));
              var rank = rankLookup[cheek.id + "|" + mouth.id];
              var title = label + " — " + ui("class_" + row.harmClass, "") + " · " + ui("index_short", "index") + " " + num(row.composite, 0);
              if (rank) { title += ", " + fill(ui("rank_short", "rank {rank}"), { rank: rank }); }
              cell.setAttribute("title", title);
              cell.querySelector(".bits-cell__num").textContent = num(row.composite, 0);
              cell.querySelector(".visually-hidden").textContent = title;
            }
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
      });
    }

    function extremeCard(kicker, row, total) {
      var cheek = M.byId(CATALOG.cheeks, row.cheek);
      var mouth = M.byId(CATALOG.mouthpieces, row.mouth);
      var node = clone("tpl-extreme");
      node.querySelector(".bits-extreme__kicker").textContent = kicker;
      var link = node.querySelector("h3 a");
      link.textContent = t(cheek.name) + " × " + t(mouth.name);
      link.setAttribute("href", dossierUrl(dossierBase, cheek.id, mouth.id));
      var badge = node.querySelector(".bits-class");
      badge.textContent = ui("class_" + row.harmClass, "");
      badge.setAttribute("data-class", String(row.harmClass));
      node.querySelector(".bits-extreme__meta").textContent = fill(ui("extreme_meta", "Index {index} · rank {rank} of {total} · peak {peak} on the {site}"), {
        index: num(row.composite, 0), rank: row.rank, total: total,
        peak: kPa(row.peak), site: ui("tissue_" + row.peakSite, row.peakSite)
      });
      return node;
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
        if (card.row) { container.appendChild(extremeCard(card.kicker, card.row, ranking.length)); }
      });
      var groupsHolder = document.querySelector("[data-extremes-groups]");
      if (!groupsHolder) { return; }
      CATALOG.groups.forEach(function (group) {
        var rows = ranking.filter(function (r) { return r.group === group.id; });
        if (!rows.length) { return; }
        groupsHolder.appendChild(extremeCard(t(group.name), rows[rows.length - 1], ranking.length));
      });
    }

    renderGroups();
    renderMatrix();
    renderExtremes();
  }

  /* =====================================================================
     Shared drawing: a mouthpiece seen from the front
     ===================================================================== */

  /* Pattern id for a textured surface, from the catalogue draw spec. */
  function texturePattern(draw) {
    var map = { twist: "pat-twist", corkscrew: "pat-corkscrew", wire: "pat-wire", serrated: "pat-serrated", square: "pat-square", saw: "pat-saw" };
    if (draw.rope) { return "pat-rope"; }
    return draw.texture ? map[draw.texture] || "pat-twist" : null;
  }

  function softClass(node, soft) {
    if (!node) { return; }
    if (soft) { node.classList.add("viz-soft"); } else { node.classList.remove("viz-soft"); }
  }

  /* Draw the mouthpiece into the element set `prefix-*`.
       geo: { cx, cy, width, h, scale } in px; width is the whole mouthpiece,
            h its drawn thickness, scale px per mm.
       lift: upward displacement of a single joint (px), from the palate model.
       palateY: y of the palate line (px), to stop ports and spoons there. */
  function drawMouth(prefix, geo, draw, mp, lift, palateY) {
    var ids = ["bar", "port", "cannon-l", "cannon-r", "cannon-l2", "cannon-r2", "link", "balls", "rollers", "keys", "spade", "cricket", "tongueplate", "texture", "ring-l", "ring-r"];
    ids.forEach(function (id) { vis(prefix + "-" + id, false); });
    var cx = geo.cx;
    var cy = geo.cy;
    var w = geo.width;
    var h = geo.h;
    var k = geo.scale;
    var left = cx - w / 2;
    var right = cx + w / 2;
    var kind = draw.mouth || "bar";
    var soft = !!draw.soft;
    var ph = (mp.port_height || 0) * k;
    if (palateY != null) {
      ph = Math.min(ph, Math.max(0, cy - h / 2 - palateY));
    }

    function rect(id, x, y, width, height, rx) {
      var node = vis(prefix + "-" + id, true);
      attrs(node, { x: x, y: y, width: Math.max(1, width), height: Math.max(1, height), rx: rx == null ? height / 2 : rx });
      node.removeAttribute("transform");
      softClass(node, soft);
      return node;
    }

    function strokePath(id, d, width) {
      var node = vis(prefix + "-" + id, true);
      node.setAttribute("d", d);
      node.style.fill = "none";
      node.style.strokeWidth = width.toFixed(1);
      node.setAttribute("stroke-linecap", "round");
      node.setAttribute("stroke-linejoin", "round");
      node.style.stroke = soft ? "" : "var(--viz-metal)";
      softClass(node, soft);
      if (soft) { node.setAttribute("data-stroke", "1"); } else { node.removeAttribute("data-stroke"); }
      return node;
    }

    function fillPath(id, d) {
      var node = vis(prefix + "-" + id, true);
      node.setAttribute("d", d);
      node.style.fill = "";
      node.style.strokeWidth = "";
      return node;
    }

    function cannons(gap, tilt, dy, thickness) {
      var span = cx - gap - left;
      var hh = thickness || h;
      var y = cy + (dy || 0);
      var l = rect("cannon-l", left, y - hh / 2, span, hh);
      var r = rect("cannon-r", cx + gap, y - hh / 2, span, hh);
      if (tilt) {
        l.setAttribute("transform", "rotate(" + (-tilt).toFixed(2) + " " + f1(cx - gap) + " " + f1(y) + ")");
        r.setAttribute("transform", "rotate(" + tilt.toFixed(2) + " " + f1(cx + gap) + " " + f1(y) + ")");
      }
    }

    function texture(x, y, width, height) {
      var pattern = texturePattern(draw);
      if (!pattern) { return; }
      var node = rect("texture", x, y, width, height, height / 2);
      node.style.fill = "url(#" + pattern + ")";
      node.classList.remove("viz-soft");
    }

    function endRings() {
      var rl = vis(prefix + "-ring-l", true);
      var rr = vis(prefix + "-ring-r", true);
      attrs(rl, { cx: left - h * 0.45, cy: cy, r: Math.max(4, h * 0.4) });
      attrs(rr, { cx: right + h * 0.45, cy: cy, r: Math.max(4, h * 0.4) });
    }

    var gap;
    var jointLift = lift || 0;
    var tilt = 0;

    if (kind === "mullen") {
      var curve = draw.soft ? w * 0.06 : w * 0.08;
      strokePath("port", "M" + f1(left + h / 2) + " " + f1(cy) + " Q" + f1(cx) + " " + f1(cy - curve) + " " + f1(right - h / 2) + " " + f1(cy), h);
      if (draw.rope) { texture(left, cy - h / 2 - curve / 2, w, h + curve / 2); }
      if (draw.keys) {
        /* Ring arc: a thin curved bar with loose rings hanging from it. */
        var keysArc = vis(prefix + "-keys", true);
        var arcs = keysArc.querySelectorAll("rect");
        for (var a = 0; a < arcs.length; a++) {
          attrs(arcs[a], { x: cx - 14 * k + a * 11 * k, y: cy - curve / 2, width: Math.max(2, 3 * k), height: 14 * k, rx: 1.5 * k });
        }
      }
    } else if (kind === "bar") {
      rect("bar", left, cy - h / 2, w, h);
      if (draw.keys) {
        var keys = vis(prefix + "-keys", true);
        var keyRects = keys.querySelectorAll("rect");
        for (var j = 0; j < keyRects.length; j++) {
          attrs(keyRects[j], { x: cx - 11 * k + j * 10 * k, y: cy, width: Math.max(2, 3.5 * k), height: 16 * k, rx: 1.5 * k });
        }
      }
      if (draw.spoonUp) {
        /* Palate spoon: a plate rising from the centre of the bar to the palate. */
        var sw = 14 * k;
        var base = cy - h / 2 + 1;
        fillPath("spade", "M" + f1(cx - sw * 0.4) + " " + f1(base) + " L" + f1(cx - sw) + " " + f1(base - ph * 0.85) + " Q" + f1(cx) + " " + f1(base - ph * 1.08) + " " + f1(cx + sw) + " " + f1(base - ph * 0.85) + " L" + f1(cx + sw * 0.4) + " " + f1(base) + " Z");
      }
    } else if (kind === "port") {
      gap = (draw.narrow ? 9 : draw.wide ? 24 : 15) * k;
      var top = cy - ph;
      strokePath("port", "M" + f1(left + h / 2) + " " + f1(cy) + " L" + f1(cx - gap) + " " + f1(cy) + " L" + f1(cx - gap * (draw.narrow ? 0.9 : 0.75)) + " " + f1(top) + " L" + f1(cx + gap * (draw.narrow ? 0.9 : 0.75)) + " " + f1(top) + " L" + f1(cx + gap) + " " + f1(cy) + " L" + f1(right - h / 2) + " " + f1(cy), h);
      if (draw.barrel) {
        rect("link", cx - gap * 0.6, cy - h * 0.65, gap * 1.2, h * 1.3, 3);
      }
      if (draw.cricket) {
        var cricket = vis(prefix + "-cricket", true);
        attrs(cricket, { cx: cx, cy: cy - ph * 0.5, r: Math.max(3, Math.min(gap * 0.5, h * 0.45)) });
        cricket.style.strokeWidth = "1.5";
      }
      if (draw.hood) {
        fillPath("spade", "M" + f1(cx - gap - h * 0.3) + " " + f1(cy - ph * 0.45) + " L" + f1(cx - gap * 0.8) + " " + f1(top - h * 0.5) + " L" + f1(cx + gap * 0.8) + " " + f1(top - h * 0.5) + " L" + f1(cx + gap + h * 0.3) + " " + f1(cy - ph * 0.45) + " Z");
      }
    } else if (kind === "spade") {
      gap = 10 * k;
      cannons(gap, 0, 0);
      var spoonW = 16 * k;
      fillPath("spade", "M" + f1(cx - gap) + " " + f1(cy + h / 2) + " L" + f1(cx - gap * 0.5) + " " + f1(cy - ph * 0.5) + " L" + f1(cx - spoonW) + " " + f1(cy - ph * 0.86) + " Q" + f1(cx) + " " + f1(cy - ph * 1.08) + " " + f1(cx + spoonW) + " " + f1(cy - ph * 0.86) + " L" + f1(cx + gap * 0.5) + " " + f1(cy - ph * 0.5) + " L" + f1(cx + gap) + " " + f1(cy + h / 2) + " Z");
      /* Braces from the spoon to the cannons. */
      strokePath("port", "M" + f1(cx - 2.6 * gap) + " " + f1(cy) + " L" + f1(cx - 0.6 * gap) + " " + f1(cy - ph * 0.55) + " M" + f1(cx + 2.6 * gap) + " " + f1(cy) + " L" + f1(cx + 0.6 * gap) + " " + f1(cy - ph * 0.55), Math.max(2, h * 0.3));
      var cricketS = vis(prefix + "-cricket", true);
      attrs(cricketS, { cx: cx, cy: cy - ph * 0.3, r: Math.max(3, h * 0.4) });
      cricketS.style.strokeWidth = "1.5";
    } else if (kind === "single") {
      gap = h * 0.25;
      if (draw.arch) {
        jointLift = Math.max(jointLift, ph * 0.5);
      }
      tilt = Math.atan2(jointLift, cx - gap - left) * 180 / Math.PI;
      cannons(gap, tilt, 0);
      /* Joint: the two interlocking eyes. */
      var jointH = h * 0.95;
      rect("link", cx - h * 0.55, cy - jointLift - jointH / 2, h * 1.1, jointH, jointH / 2);
      if (draw.rollers) {
        var rollers = vis(prefix + "-rollers", true);
        var circles = rollers.querySelectorAll("circle");
        for (var c = 0; c < circles.length; c++) {
          var side = c < 3 ? -1 : 1;
          var pos = (c % 3) + 1;
          var rx = cx + side * (gap + pos * (cx - gap - left) / 4);
          var ry = cy - jointLift * (1 - pos / 4);
          attrs(circles[c], { cx: rx, cy: ry, r: h * 0.36 });
        }
      }
      if (draw.plateUnder) {
        var plateW = (mp.selection && mp.selection.plate === "extended" ? 60 : 40) * k;
        rect("tongueplate", cx - plateW / 2, cy + h / 2 + 2, plateW, Math.max(3, 3 * k), 2);
      }
      texture(left, cy - h / 2 - jointLift, w, h + jointLift);
    } else if (kind === "scissor") {
      /* Two cannons crossing at the centre and sliding past each other. */
      var l = rect("cannon-l", left, cy - h / 2, cx - left + 18 * k, h);
      var r = rect("cannon-r", cx - 18 * k, cy - h / 2, right - cx + 18 * k, h);
      l.setAttribute("transform", "rotate(6 " + f1(cx) + " " + f1(cy) + ")");
      r.setAttribute("transform", "rotate(-6 " + f1(cx) + " " + f1(cy) + ")");
      var pivot = vis(prefix + "-cricket", true);
      attrs(pivot, { cx: cx, cy: cy, r: h * 0.3 });
      pivot.style.strokeWidth = "1.5";
    } else if (kind === "double") {
      gap = (draw.link === "ball" ? 9 : 14) * k;
      var dy = -jointLift;
      cannons(gap, 0, dy);
      var linkH = h * 0.9;
      var linkW = gap * 2;
      var rxL = linkH / 2;
      if (draw.link === "plate" || draw.link === "plate-angled") { linkH = Math.max(4, h * 0.35); rxL = 2; }
      if (draw.link === "ball") { linkW = h * 1.35; linkH = h * 1.35; rxL = linkH / 2; }
      if (draw.link === "barrel") { linkH = h * 1.15; rxL = 3; }
      if (draw.link === "lozenge") { linkH = h * 1.05; rxL = linkH / 2; }
      var link = rect("link", cx - linkW / 2, cy + dy - linkH / 2, linkW, linkH, rxL);
      if (draw.link === "plate-angled") {
        link.setAttribute("transform", "rotate(38 " + f1(cx) + " " + f1(cy + dy) + ")");
      } else if (draw.link === "plate" && geo.plateTilt) {
        link.setAttribute("transform", "rotate(" + geo.plateTilt + " " + f1(cx) + " " + f1(cy + dy) + ")");
      }
    } else if (kind === "double-strand") {
      var off = h * 0.9;
      var thin = h;
      rect("cannon-l", left, cy - off - thin / 2, cx - 10 * k - left, thin);
      rect("cannon-r", cx - 4 * k, cy - off - thin / 2, right - cx + 4 * k, thin);
      rect("cannon-l2", left, cy + off - thin / 2, cx + 4 * k - left, thin);
      rect("cannon-r2", cx + 10 * k, cy + off - thin / 2, right - cx - 10 * k, thin);
      texture(left, cy - off - thin / 2, w, 2 * off + thin);
    } else if (kind === "correction") {
      gap = 16 * k;
      cannons(gap + 6 * k, 0, 0);
      rect("link", cx - gap - 7 * k, cy - h * 0.6, 7 * k, h * 1.2, 2);
      rect("tongueplate", cx + gap, cy - h * 0.6, 7 * k, h * 1.2, 2);
      strokePath("port", "M" + f1(cx - gap) + " " + f1(cy) + " L" + f1(cx - gap * 0.7) + " " + f1(cy - ph) + " L" + f1(cx + gap * 0.7) + " " + f1(cy - ph) + " L" + f1(cx + gap) + " " + f1(cy), h);
    } else if (kind === "balls") {
      var balls = vis(prefix + "-balls", true);
      var ballNodes = balls.querySelectorAll("circle");
      var rb = h / 2;
      for (var b = 0; b < ballNodes.length; b++) {
        attrs(ballNodes[b], { cx: left + rb + b * (w - 2 * rb) / (ballNodes.length - 1), cy: cy, r: rb });
      }
    } else if (kind === "chain") {
      var n = 12;
      var linkLen = w / (n * 0.78);
      var d = "";
      for (var i = 0; i < n; i++) {
        var lx = left + linkLen / 2 + i * (w - linkLen) / (n - 1);
        d += "M" + f1(lx - linkLen / 2) + " " + f1(cy) + " a" + f1(linkLen / 2) + " " + f1(h / 2) + " 0 1 0 " + f1(linkLen) + " 0 a" + f1(linkLen / 2) + " " + f1(h / 2) + " 0 1 0 " + f1(-linkLen) + " 0 ";
      }
      strokePath("port", d, Math.max(1.5, h * 0.28));
      if (draw.texture) { texture(left, cy - h * 0.7, w, h * 1.4); }
    } else {
      rect("bar", left, cy - h / 2, w, h);
    }
    endRings();
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
    var mech = cheek.mechanism;
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
    var tBadge = document.querySelector('[data-field="tags"]');
    if (tBadge && cheek.tags && cheek.tags.length) {
      tBadge.textContent = tagNames(cheek).join(" · ");
      show(tBadge, true);
    }
    field("cheek-name", t(cheek.name));
    field("mouth-name", t(mouth.name));

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
    renderPhotos();

    /* ---------- Controls ---------- */

    var postureSelect = controls.querySelector('[name="posture"]');
    CATALOG.postures.forEach(function (posture) {
      var opt = document.createElement("option");
      opt.value = posture.id;
      opt.textContent = t(posture.name) + " (θ = " + posture.theta + "°)";
      postureSelect.appendChild(opt);
    });
    show(controls.querySelector('[data-show="posture"]'), mech !== "check");
    if (mech === "check") {
      field("force-label", ui("force_label_check", "Push of the horse against the check, each side"));
    } else if (mech === "jaw-ring" && (cheek.tags || []).indexOf("in-hand") !== -1) {
      field("force-label", ui("force_label_lead", "Pull on the lead, each side"));
    }

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
      var risks = M.injuryRisks(CATALOG, res);
      var rank = rankOf(cheekId, mouthId);

      controls.querySelector('[data-out="F"]').textContent = N(state.F);
      controls.querySelector('[data-out="d"]').textContent = mm(state.d);
      controls.querySelector('[data-out="space"]').textContent = mm(state.space);
      controls.querySelector('[data-out="curbShare"]').textContent = pct(state.curbShare);
      var twoReins = res.ch.rein_mode === "two" || !!cheek.double_bridle || mech === "gag-curb";
      show(controls.querySelector('[data-show="curb-share"]'), twoReins);
      show(controls.querySelector('[data-show="chain"]'), !!res.ch.chain && !res.ch.rigid_ring);

      renderHero(res, sc, rank);
      renderFields(res);
      figure0(res);
      figureA(res);
      figureB(res);
      figureC(res);
      figureD(res);
      figureE(land);
      figureF(risks, res);
      figureG(sc, res);
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
      field("index", num(sc.composite, 0));
      field("rank", rank.rank ? String(rank.rank) : "—");
      field("rank-total", String(rank.total));
      field("peak", kPa(res.pressures.peak));
      field("peak-site", ui("tissue_" + res.pressures.peakSite, res.pressures.peakSite));
      field("peak-verdict", ui("peak_" + levelOf(res.pressures.peak), ""));
      var cls = sc.harm.cls;
      var badge = document.querySelector('[data-field="class-badge"]');
      badge.textContent = ui("class_" + cls, "");
      badge.setAttribute("data-class", String(cls));
      field("class-def", ui("class_def_" + cls, ""));
      var refBadge = document.querySelector('[data-field="class-ref"]');
      if (refBadge && rank.row) {
        refBadge.textContent = ui("class_" + rank.row.harmClass, "");
        refBadge.setAttribute("data-class", String(rank.row.harmClass));
      }
      var meter = document.querySelector("[data-meter]");
      meter.style.width = Math.min(100, sc.composite) + "%";
      meter.setAttribute("data-class", String(cls));
    }

    function restraintKind(ch) {
      if (!ch.chain) { return "none"; }
      if (ch.rigid_ring) { return "ring"; }
      if (ch.chin_guarded || state.guard) { return "strap"; }
      return "chain";
    }

    function renderFields(res) {
      var f = res.forces;
      var ch = res.ch;
      var mp = res.mp;
      field("F", N(res.inputs.F));
      field("press-total", N(f.pressTotal));
      field("lip-total", N(2 * f.lipPerSide));
      field("lever-ratio", num(f.leverRatio, 1));
      field("rho", num(f.rho, 0));
      field("chain-force", N(f.chain));
      field("chin-force", N(f.chinLoad));
      field("cheek-force", N(f.cheekpiece));
      field("jaw-force", N(f.jawLoad));
      field("nose-force", N(f.noseLoad));
      field("mouth-share", pct(Math.max(0, 1 - (ch.share_nose || 0) - (ch.share_chin || 0) - (ch.share_jaw || 0))));
      field("amplification", num(f.amplification, 1));
      field("lift", mm(f.liftMm, 0));
      field("poll-force", N(f.pollLoad));
      field("poll-kpa", kPa(res.pressures.poll));
      field("total-thickness", mm(res.totalThickness));
      field("bit-space", mm(res.inputs.bitSpace));
      field("fit-pct", pct(res.fit - 1));
      field("palate", num(res.palate, 2));
      field("port-height", mm(mp.port_height || 0));
      field("contact-pct", pct(mp.contact_fraction || 1));
      var edge = (mp.edge || 1) * (ch.free_pivot ? 1 + 0.6 * (ch.pivot_factor != null ? ch.pivot_factor : 1) : 1);
      field("edge", num(edge, 2));
      field("guard-pct", pct(ch.pull_through_guard || 0));
      field("chin-kpa", kPa(res.pressures.chin));
      field("cheek-kpa", kPa(res.pressures.cheek));
      field("second-d", mm(ch.second_bar_d || 0));
      field("second-share", pct(ch.second_bar_share || 0));
      field("bit-mass", num(ch.bit_mass_kg || 0, 2) + " " + ui("unit_kg", "kg"));
      field("rest-weight", N(f.restingWeight));
      field("dim-p", mm(ch.purchase || 0));
      field("dim-s", mm(ch.shank || 0));
      field("restraint-kind", ui("restraint_" + restraintKind(ch), restraintKind(ch)));
      var legendF = f.Flever > 0 && (f.Fdirect > 0 || f.Fpulley > 0) ? N(f.Flever) + " + Fₛ " + N(f.Fdirect + f.Fpulley) : N(f.Flever > 0 ? f.Flever : f.Fdirect + f.Fpulley);
      field("legend-F", "= " + legendF);
      var cValue = f.chain > 0 ? f.chain : (f.jawLoad > 0 ? f.jawLoad / 2 : (f.noseLoad > 0 ? f.noseLoad / 2 : 0));
      field("legend-C", cValue > 0 ? "= " + N(cValue) : "—");
      field("legend-T", "= " + N(f.cheekpiece));
      field("legend-R", "= " + N(Math.sqrt(f.sumX * f.sumX + f.sumY * f.sumY)));
      var pollNoteKey;
      if (mech === "direct") {
        pollNoteKey = cheekId === "baucher" ? "poll_note_baucher" : (ch.ring_through_mouthpiece && !ch.cheek_squeeze ? "poll_note_loose" : "poll_note_direct");
      } else if (mech === "curb") { pollNoteKey = "poll_note_curb"; }
      else if (mech === "gag-slide") { pollNoteKey = "poll_note_gag_slide"; }
      else if (mech === "gag-curb") { pollNoteKey = "poll_note_gag_curb"; }
      else if (mech === "jaw-ring") { pollNoteKey = "poll_note_jaw_ring"; }
      else if (mech === "combination") { pollNoteKey = "poll_note_combination"; }
      else if (mech === "check") { pollNoteKey = "poll_note_check"; }
      else { pollNoteKey = ch.chain ? "poll_note_curb" : "poll_note_gag_lever"; }
      field("poll-note", ui(pollNoteKey, ""));
    }

    /* ---------- Figure 0: the bit itself ---------- */

    var F0_SIDE = ["cheekstrap", "cord", "ring", "egg", "dee", "arm", "hanger", "hanger-ring", "shank", "purchase-ring", "rein-ring", "snaffle-ring", "stack", "slots", "chain", "bottom-bar", "jawring", "cage", "spoons", "sidebar", "burr", "plate", "noselink", "chinstrap", "horseshoe", "check", "mouth-end", "dim-p", "dim-s", "dim-p-t", "dim-s-t", "l-rein", "l-bridle", "l-restraint"];

    function figure0(res) {
      var ch = res.ch;
      var mp = res.mp;
      var draw = cheek.draw || {};
      var p = ch.purchase || 0;
      var s = ch.shank || 0;
      var R = ((ch.ring_diameter || 65) / 2);
      var reach = Math.max(p, s, R, 50);
      var k = Math.min(0.9, 150 / reach);
      var labels = { rein: null, bridle: null, restraint: null, restraintText: "" };

      F0_SIDE.forEach(function (id) { vis("f0-" + id, false); });
      vis("f0-mouth-end", true);
      attrs(el("f0-mouth-end"), { cx: 0, cy: 0, r: Math.max(3, res.inputs.d * k / 2) });

      function line(id, x1, y1, x2, y2) {
        attrs(vis("f0-" + id, true), { x1: x1, y1: y1, x2: x2, y2: y2 });
      }
      function path(id, d, cls) {
        var node = vis("f0-" + id, true);
        node.setAttribute("d", d);
        if (cls) { node.setAttribute("class", cls); }
        return node;
      }
      function metalPath(id, d, width) {
        var node = path(id, d, "viz-metal");
        node.style.fill = "none";
        node.style.stroke = "var(--viz-metal)";
        node.style.strokeWidth = String(width);
        return node;
      }
      function circle(id, cx, cy, r) {
        attrs(vis("f0-" + id, true), { cx: cx, cy: cy, r: r });
      }
      function strap(top) {
        /* The cheekpiece runs from the bridle attachment up out of the frame. */
        line("cheekstrap", top.x, top.y, top.x + 4, -150);
        labels.bridle = { x: top.x + 10, y: top.y - 8 };
      }
      function chainTo(from, strapLike, label) {
        var chin = { x: 48 * k + 6, y: 20 * k + 6 };
        var mid = { x: (from.x + chin.x) / 2 + 16, y: (from.y + chin.y) / 2 + 4 };
        path("chain", "M" + f1(from.x) + " " + f1(from.y) + " Q" + f1(mid.x) + " " + f1(mid.y) + " " + f1(chin.x) + " " + f1(chin.y), strapLike ? "viz-strap" : "viz-chainline");
        labels.restraint = { x: chin.x + 8, y: chin.y + 14 };
        labels.restraintText = label;
      }
      function shankArms(opts) {
        opts = opts || {};
        var pk = p * k;
        var sk = s * k;
        var d = "M0 " + f1(-pk) + " L0 0 ";
        if (opts.sweep) {
          d += "Q0 " + f1(sk * 0.55) + " " + f1(sk * 0.32) + " " + f1(sk * 0.96);
        } else if (opts.setBack) {
          d += "L8 8 L8 " + f1(sk);
        } else {
          d += "L0 " + f1(sk);
        }
        metalPath("shank", d, 6);
        var reinAt = opts.sweep ? { x: sk * 0.32, y: sk * 0.96 } : { x: opts.setBack ? 8 : 0, y: sk };
        if (sk > 0) {
          circle("rein-ring", reinAt.x, reinAt.y + 6, 6);
          labels.rein = { x: reinAt.x + 12, y: reinAt.y + 10 };
        }
        if (pk > 0) {
          circle("purchase-ring", 0, -pk - 6, 6);
          strap({ x: 0, y: -pk - 12 });
        } else {
          strap({ x: 0, y: -R * k });
        }
        if (pk > 0 || sk > 0) {
          line("dim-p", -40, 0, -40, -pk);
          line("dim-s", -40, 0, -40, sk);
          var tp = vis("f0-dim-p-t", pk > 0);
          attrs(tp, { x: -46, y: -pk / 2 + 4 });
          tp.setAttribute("text-anchor", "end");
          tp.textContent = "p = " + mm(p);
          var ts = vis("f0-dim-s-t", sk > 0);
          attrs(ts, { x: -46, y: sk / 2 + 4 });
          ts.setAttribute("text-anchor", "end");
          ts.textContent = "s = " + mm(s);
        }
        return { pk: pk, sk: sk, reinAt: reinAt };
      }
      function slideSlot() {
        var slide = (ch.mouthpiece_slide || 0) * k;
        if (slide <= 0) { return; }
        var slots = vis("f0-slots", true);
        var rects = slots.querySelectorAll("rect");
        attrs(rects[0], { x: -4, y: -slide * 0.7, width: 8, height: slide, rx: 3 });
        attrs(rects[1], { x: 0, y: 0, width: 0, height: 0 });
      }

      var kind = draw.cheek || "ring";
      var Rk = R * k;

      if (kind === "ring" || kind === "gagring") {
        circle("ring", 0, 0, Rk);
        strap({ x: 0, y: -Rk });
        labels.rein = { x: 8, y: Rk + 18 };
        if (kind === "gagring") {
          path("cord", "M0 -150 L0 " + f1(Rk + 46), "viz-strap");
          el("f0-cord").setAttribute("stroke-dasharray", "6 4");
          labels.rein = { x: 8, y: Rk + 52 };
          labels.restraint = { x: 8, y: -Rk - 30 };
          labels.restraintText = ui("label_cord", "cheekpiece runs through to the rein");
          if (draw.arms) {
            var armLen = (ch.cheek_length || 150) * k / 2;
            attrs(vis("f0-arm", true), { x: -3, y: -armLen, width: 6, height: 2 * armLen });
          }
        }
        if (draw.cheeker) {
          path("noselink", "M0 " + f1(-Rk) + " C-14 " + f1(-Rk - 40) + " -30 -110 -36 -150", "viz-strap");
          labels.restraint = { x: -70, y: -120 };
          labels.restraintText = ui("label_cheeker", "cheeker over the nose");
        }
        if (draw.burr) {
          circle("burr", 0, 0, Rk * 0.66);
          labels.restraint = { x: Rk * 0.5, y: -Rk * 0.5 - 8 };
          labels.restraintText = ui("label_burr", "burr pad inside the ring");
        }
        if (draw.plate) {
          var plate = vis("f0-plate", true);
          attrs(plate, { x: -Rk * 0.72, y: -Rk * 0.72, width: Rk * 1.44, height: Rk * 1.44, rx: Rk * 0.3 });
          plate.style.opacity = "0.55";
          labels.restraint = { x: Rk * 0.5, y: -Rk * 0.5 - 8 };
          labels.restraintText = ui("label_plate", "lugging plate inside the ring");
        }
        if (draw.cage) {
          metalPath("cage", "M" + f1(-Rk * 0.45) + " " + f1(Rk * 0.9) + " C" + f1(-Rk * 0.5) + " " + f1(Rk * 2.6) + " " + f1(Rk * 0.5) + " " + f1(Rk * 2.6) + " " + f1(Rk * 0.45) + " " + f1(Rk * 0.9), 4);
          labels.restraint = { x: Rk * 0.6, y: Rk * 2.3 };
          labels.restraintText = ui("label_cage", "cage under the jaw");
        }
        if (draw.noseLink) {
          path("noselink", "M0 " + f1(-Rk) + " C-24 " + f1(-Rk - 24) + " -56 -70 -72 -104", "viz-strap");
          labels.restraint = { x: -112, y: -112 };
          labels.restraintText = ui("label_nose", "to the nose strap");
        }
        if (draw.secondBar) {
          var second = vis("f0-plate", true);
          attrs(second, { x: -16, y: 2, width: 7, height: 7, rx: 3.5 });
          second.style.opacity = "1";
        }
        if (draw.spoons) {
          path("spoons", "M4 6 Q30 10 34 36 Q20 44 10 26 Z");
          labels.restraint = { x: 40, y: 40 };
          labels.restraintText = ui("label_spoons", "spoons against the jaw");
        }
      } else if (kind === "eggbutt") {
        attrs(vis("f0-egg", true), { cx: 0, cy: 0, rx: Rk * 0.72, ry: Rk * 0.88 });
        attrs(vis("f0-sidebar", true), { x: -3, y: -10, width: 6, height: 20, rx: 2 });
        strap({ x: 0, y: -Rk * 0.88 });
        labels.rein = { x: 8, y: Rk * 0.88 + 18 };
      } else if (kind === "dee") {
        metalPath("dee", "M0 " + f1(-Rk) + " L0 " + f1(Rk) + " A" + f1(Rk) + " " + f1(Rk) + " 0 0 0 0 " + f1(-Rk), 5);
        strap({ x: 0, y: -Rk });
        labels.rein = { x: Rk + 6, y: 6 };
      } else if (kind === "fullcheek" || kind === "fulmer") {
        var half = (ch.cheek_length || 150) * k / 2;
        attrs(vis("f0-arm", true), { x: -3, y: -half, width: 6, height: 2 * half });
        circle("ring", kind === "fulmer" ? 5 : 0, 0, Rk * 0.72);
        var keepers = ch.selection && ch.selection.keepers === "with";
        if (keepers) {
          circle("hanger-ring", 0, -half - 5, 5);
          strap({ x: 0, y: -half - 10 });
          labels.restraint = { x: 10, y: -half + 12 };
          labels.restraintText = ui("label_keepers", "keeper holds the arm to the cheekpiece");
        } else {
          strap({ x: 0, y: -Rk * 0.72 });
        }
        labels.rein = { x: Rk * 0.72 + 8, y: 6 };
      } else if (kind === "halfcheek") {
        circle("ring", 0, 0, Rk * 0.75);
        attrs(vis("f0-arm", true), { x: -3, y: 0, width: 6, height: (ch.cheek_length || 75) * k * 0.55 });
        strap({ x: 0, y: -Rk * 0.75 });
        labels.rein = { x: Rk * 0.75 + 8, y: 6 };
        if (draw.chinStrap) {
          path("chinstrap", "M0 " + f1(Rk * 0.75) + " C14 " + f1(Rk * 1.2) + " 34 " + f1(Rk * 1.1) + " 48 " + f1(Rk * 0.8), "viz-strap");
          labels.restraint = { x: 54, y: Rk * 0.8 + 4 };
          labels.restraintText = ui("label_chin_strap", "chin strap, no lever");
        }
        if (draw.jawRing) {
          attrs(vis("f0-jawring", true), { cx: 4, cy: 42 * k, rx: 12 * k, ry: 42 * k });
          labels.restraint = { x: 16 * k + 8, y: 60 * k };
          labels.restraintText = ui("label_jaw_ring", "ring through the mouth, around the jaw");
        }
        if (draw.check) {
          path("check", "M0 " + f1(-Rk * 0.75) + " C12 -70 40 -120 70 -150", "viz-strap");
          labels.restraint = { x: 50, y: -118 };
          labels.restraintText = ui("label_check", "check rein to the harness saddle");
          labels.rein = null;
        }
      } else if (kind === "baucher") {
        var pk0 = (ch.purchase || 25) * k;
        attrs(vis("f0-arm", true), { x: -3, y: -pk0, width: 6, height: pk0 });
        circle("hanger-ring", 0, -pk0 - 6, 6);
        circle("snaffle-ring", 0, 0, Rk * 0.66);
        strap({ x: 0, y: -pk0 - 12 });
        labels.rein = { x: Rk * 0.66 + 8, y: 6 };
        line("dim-p", -40, 0, -40, -pk0);
        var tb = vis("f0-dim-p-t", true);
        attrs(tb, { x: -46, y: -pk0 / 2 + 4 });
        tb.setAttribute("text-anchor", "end");
        tb.textContent = "p = " + mm(ch.purchase || 25);
      } else if (kind === "scorrier") {
        circle("ring", 0, 0, Rk);
        circle("snaffle-ring", -8, 0, Rk * 0.55);
        strap({ x: -8, y: -Rk * 0.55 });
        labels.rein = { x: Rk + 6, y: 6 };
        labels.restraint = { x: -Rk - 6, y: Rk + 16 };
        labels.restraintText = ui("label_inner_ring", "inner ring runs on the cheekpiece: squeezes the cheek");
        el("f0-l-restraint").setAttribute("text-anchor", "start");
      } else if (kind === "shank") {
        var arms = shankArms({ sweep: !!draw.sweep, setBack: !!draw.setBack });
        if (draw.snaffleRing) {
          circle("snaffle-ring", draw.looseSnaffleRing ? 12 : 0, 0, 16);
        }
        if (draw.swivel) {
          attrs(vis("f0-hanger-ring", true), { cx: 0, cy: 0, r: 5 });
        }
        if (draw.slide) { slideSlot(); }
        if (draw.slots) {
          var slotRects = vis("f0-slots", true).querySelectorAll("rect");
          attrs(slotRects[0], { x: -3, y: arms.sk * 0.42, width: 6, height: 11, rx: 2 });
          attrs(slotRects[1], { x: -3, y: arms.sk * 0.74, width: 6, height: 11, rx: 2 });
        }
        if (draw.bar) {
          line("bottom-bar", -10, arms.sk + 12, 10, arms.sk + 12);
        }
        if (draw.spade) {
          var sph = (mp.port_height || 60) * k;
          path("spoons", "M-5 0 L" + f1(-sph * 0.42) + " " + f1(-sph * 0.88) + " Q" + f1(-sph * 0.36) + " " + f1(-sph * 1.04) + " " + f1(-sph * 0.26) + " " + f1(-sph * 0.9) + " L5 0 Z");

        }
        if (draw.cord) {
          path("cord", "M0 -150 L0 " + f1(arms.sk * 0.5 + 40), "viz-strap");
          el("f0-cord").setAttribute("stroke-dasharray", "6 4");
        }
        if (draw.noseRope) {
          path("noselink", "M0 " + f1(-arms.pk) + " C-30 " + f1(-arms.pk - 20) + " -60 -60 -84 -92", "viz-strap");
        }
        if (draw.jawRing) {
          attrs(vis("f0-jawring", true), { cx: 24 * k + 6, cy: 10 * k + 6, rx: 30 * k, ry: 24 * k });
          labels.restraint = { x: 56 * k + 10, y: 34 * k + 10 };
          labels.restraintText = ui("restraint_ring", "rigid ring");
        } else if (ch.chain) {
          var kindR = restraintKind(ch);
          chainTo({ x: 0, y: -arms.pk - 6 }, kindR === "strap", ui("restraint_" + kindR, kindR));
        } else {
          labels.restraint = { x: 36, y: 24 };
          labels.restraintText = ui("restraint_none", "no chin restraint");
        }
        if (draw.noseRope) {
          labels.restraintText += " · " + ui("label_nose", "to the nose strap");
        }
        if (draw.spade) {
          labels.restraintText += " · " + ui("label_spade", "spade rises into the mouth");
        }
      } else if (kind === "kimblewick") {
        var pk1 = p * k;
        var sk1 = s * k;
        var rD = (pk1 + sk1) / 2;
        metalPath("dee", "M0 " + f1(-pk1) + " L0 " + f1(sk1) + " A" + f1(rD) + " " + f1(rD) + " 0 0 0 0 " + f1(-pk1), 5);
        circle("purchase-ring", 0, -pk1 - 6, 6);
        strap({ x: 0, y: -pk1 - 12 });
        chainTo({ x: 0, y: -pk1 - 6 }, restraintKind(ch) === "strap", ui("restraint_" + restraintKind(ch), ""));
        labels.rein = { x: rD + 8, y: 10 };
        if (draw.slots) {
          var kr = vis("f0-slots", true).querySelectorAll("rect");
          var c0 = (sk1 - pk1) / 2;
          attrs(kr[0], { x: rD * 0.87 - 3, y: c0 + rD * 0.5 - 6, width: 6, height: 12, rx: 2 });
          attrs(kr[1], { x: rD * 0.5 - 3, y: c0 + rD * 0.87 - 6, width: 6, height: 12, rx: 2 });
        }
        line("dim-p", -40, 0, -40, -pk1);
        line("dim-s", -40, 0, -40, sk1);
        var tpk = vis("f0-dim-p-t", true);
        attrs(tpk, { x: -46, y: -pk1 / 2 + 4 });
        tpk.setAttribute("text-anchor", "end");
        tpk.textContent = "p = " + mm(p);
        var tsk = vis("f0-dim-s-t", true);
        attrs(tsk, { x: -46, y: sk1 / 2 + 4 });
        tsk.setAttribute("text-anchor", "end");
        tsk.textContent = "s = " + mm(s);
      } else if (kind === "stack") {
        var pk2 = p * k;
        var big = 22;
        var small = 8;
        var stack = vis("f0-stack", true);
        var rings = stack.querySelectorAll("circle");
        attrs(rings[0], { cx: 0, cy: 0, r: big });
        for (var i = 1; i <= 3; i++) {
          attrs(rings[i], { cx: 0, cy: big + small + 2 + (i - 1) * (2 * small + 4), r: small });
        }
        attrs(rings[4], { cx: 0, cy: -pk2 - 5, r: 5 });
        strap({ x: 0, y: -pk2 - 10 });
        var reinY = s * k;
        circle("rein-ring", 0, reinY, small + 3);
        labels.rein = { x: small + 12, y: reinY + 4 };
        line("dim-p", -40, 0, -40, -pk2);
        line("dim-s", -40, 0, -40, reinY);
        var tps = vis("f0-dim-p-t", true);
        attrs(tps, { x: -46, y: -pk2 / 2 + 4 });
        tps.setAttribute("text-anchor", "end");
        tps.textContent = "p = " + mm(p);
        var tss = vis("f0-dim-s-t", true);
        attrs(tss, { x: -46, y: reinY / 2 + 4 });
        tss.setAttribute("text-anchor", "end");
        tss.textContent = "s = " + mm(s);
        if (ch.chain) {
          chainTo({ x: 0, y: -pk2 - 5 }, true, ui("restraint_strap", "curb strap"));
        } else {
          labels.restraint = { x: big + 10, y: -big + 4 };
          labels.restraintText = ui("restraint_none", "no chin restraint");
        }
      } else if (kind === "wilkie") {
        circle("ring", 0, 0, Rk);
        var wr = vis("f0-slots", true).querySelectorAll("rect");
        attrs(wr[0], { x: -3, y: -Rk - 6, width: 6, height: 12, rx: 2 });
        attrs(wr[1], { x: -3, y: Rk - 6, width: 6, height: 12, rx: 2 });
        attrs(vis("f0-sidebar", true), { x: -2.5, y: -Rk * 0.55, width: 5, height: Rk * 1.1, rx: 2 });
        strap({ x: 0, y: -Rk });
        labels.rein = { x: 10, y: Rk + 18 };
        labels.restraint = { x: -Rk - 6, y: Rk + 38 };
        labels.restraintText = ui("label_wilkie", "slots offset from the mouthpiece: one ring radius of lever");
        el("f0-l-restraint").setAttribute("text-anchor", "start");
      } else if (kind === "horseshoe") {
        metalPath("horseshoe", "M" + f1(-Rk * 0.87) + " " + f1(-Rk * 0.5) + " A" + f1(Rk) + " " + f1(Rk) + " 0 1 0 " + f1(Rk * 0.87) + " " + f1(-Rk * 0.5), 6);
        line("bottom-bar", -Rk * 0.87, -Rk * 0.5, Rk * 0.87, -Rk * 0.5);
        strap({ x: 0, y: -Rk * 0.5 });
        labels.rein = { x: 8, y: Rk + 18 };
      } else if (kind === "sidebar") {
        circle("ring", 6, 0, Rk * 0.72);
        attrs(vis("f0-sidebar", true), { x: -16, y: -46, width: 6, height: 92, rx: 3 });
        strap({ x: 6, y: -Rk * 0.72 });
        labels.rein = { x: Rk * 0.72 + 12, y: 6 };
        labels.restraint = { x: -22, y: 62 };
        labels.restraintText = ui("label_sidebar", "side bar outside the jaw");
        el("f0-l-restraint").setAttribute("text-anchor", "end");
      } else if (kind === "tattersall" || kind === "chifney") {
        var ry = 44 * k;
        attrs(vis("f0-jawring", true), { cx: 4, cy: ry, rx: 12 * k, ry: ry });
        circle("rein-ring", 4, 2 * ry + 6, 6);
        strap({ x: 0, y: -6 });
        labels.rein = { x: 16, y: 2 * ry + 12 };
        labels.restraint = { x: 16 * k + 8, y: ry };
        labels.restraintText = ui("label_jaw_ring", "ring through the mouth, around the jaw");
      } else {
        circle("ring", 0, 0, Rk);
        strap({ x: 0, y: -Rk });
        labels.rein = { x: 8, y: Rk + 18 };
      }

      function placeLabel(id, pos, text) {
        var node = vis("f0-" + id, !!pos && !!text);
        if (pos) {
          attrs(node, { x: pos.x, y: pos.y });
          node.textContent = text;
        }
      }
      placeLabel("l-rein", labels.rein, mech === "check" ? "" : ui(mech === "jaw-ring" && (cheek.tags || []).indexOf("in-hand") !== -1 ? "label_lead" : "label_rein", "rein"));
      placeLabel("l-bridle", labels.bridle, ui(mech === "check" ? "label_headstall" : "label_bridle", "bridle"));
      placeLabel("l-restraint", labels.restraint, labels.restraintText);

      /* Mouthpiece, front view. */
      var k2 = 200 / (res.inputs.bitWidth);
      var h2 = Math.max(3, res.inputs.d * k2);
      drawMouth("f0", { cx: 0, cy: 0, width: res.inputs.bitWidth * k2, h: h2, scale: k2 }, mouth.draw || {}, mp, 0, null);
      attrs(el("f0-dim-w"), { x1: -100, x2: 100, y1: 60, y2: 60 });
      el("f0-dim-w-t").textContent = fill(ui("width_line", "width {w}"), { w: mm(res.inputs.bitWidth) });
      attrs(el("f0-dim-d"), { x1: 122, x2: 122, y1: -h2 / 2, y2: h2 / 2 });
      el("f0-dim-d-t").textContent = mm(res.inputs.d);
      el("f0-mouth-caption").textContent = t(mouth.name) + (mp.port_height ? " · " + fill(ui("port_line", "port {h}"), { h: mm(mp.port_height) }) : "");
      el("f0-caption").textContent = t(cheek.name) + " · " + t(group.name) + " · " + fill(ui("scale_side", "side view 1 mm = {k} px"), { k: num(k, 2) });
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
      var line = el(id);
      if (!line) { return null; }
      if (length < 1) {
        line.setAttribute("visibility", "hidden");
        return null;
      }
      line.removeAttribute("visibility");
      var norm = Math.sqrt(dir.x * dir.x + dir.y * dir.y) || 1;
      var to = { x: from.x + dir.x / norm * length, y: from.y + dir.y / norm * length };
      attrs(line, { x1: from.x, y1: from.y, x2: to.x, y2: to.y });
      return to;
    }

    function labelAt(id, pointHead, headRotation, text, dx, dy) {
      var label = el(id);
      if (!label) { return; }
      if (!pointHead) {
        label.textContent = "";
        return;
      }
      var world = rot(pointHead, headRotation);
      attrs(label, { x: ORIGIN_A.x + ZOOM_A * world.x + (dx || 0), y: ORIGIN_A.y + ZOOM_A * world.y + (dy || 0) });
      label.textContent = text;
    }

    function figureA(res) {
      var f = res.forces;
      var theta = res.inputs.theta;
      var headRotation = 90 - theta;
      var head = el("fa-head");
      head.setAttribute("transform", "rotate(" + headRotation.toFixed(1) + ")");
      el("fa-world").setAttribute("transform", "translate(" + ORIGIN_A.x + " " + ORIGIN_A.y + ") scale(" + ZOOM_A + ")");
      var handLine = el("fa-handline");
      attrs(handLine, { x1: ORIGIN_A.x, y1: ORIGIN_A.y, y2: ORIGIN_A.y });
      handLine.setAttribute("visibility", mech === "check" ? "hidden" : "visible");

      var ch = res.ch;
      var p = (ch.purchase || 0) * SCALE_A;
      var s = (ch.shank || 0) * SCALE_A;
      var rho = f.rho * Math.PI / 180;
      var leverMech = mech === "curb" || mech === "gag-lever" || mech === "gag-curb" || (mech === "combination" && s > 0);
      var hasShank = leverMech && (p > 0 || s > 0);
      var upper = hasShank ? { x: -p * Math.sin(rho), y: -p * Math.cos(rho) } : { x: 0, y: cheekId === "baucher" ? -(ch.purchase || 25) * SCALE_A : 0 };
      var lower = hasShank ? { x: s * Math.sin(rho), y: s * Math.cos(rho) } : { x: 0, y: 0 };
      var poll = { x: 14, y: -256 };
      var chin = { x: 36, y: 14 };
      var nose = { x: -50, y: -70 };

      var shank = el("fa-shank");
      shank.setAttribute("d", hasShank ? "M" + f1(upper.x) + " " + f1(upper.y) + " L0 0 L" + f1(lower.x) + " " + f1(lower.y) : (cheekId === "baucher" ? "M0 0 L0 " + f1(upper.y) : ""));

      var cheekpiece = el("fa-cheekpiece");
      attrs(cheekpiece, { x1: upper.x, y1: upper.y, x2: poll.x, y2: poll.y });

      var chainPath = el("fa-chain");
      var restraint = restraintKind(ch);
      if (ch.chain && hasShank) {
        var mid = { x: (upper.x + chin.x) / 2 + 14, y: (upper.y + chin.y) / 2 + 6 };
        chainPath.setAttribute("d", "M" + f1(upper.x) + " " + f1(upper.y) + " Q" + f1(mid.x) + " " + f1(mid.y) + " " + chin.x + " " + chin.y);
        chainPath.setAttribute("class", restraint === "chain" ? "viz-chainline" : "viz-strap");
      } else {
        chainPath.setAttribute("d", "");
      }

      /* Rings around the jaw, nose straps and check reins. */
      var jawRing = el("fa-jawring");
      if (mech === "jaw-ring" || ch.rigid_ring) {
        attrs(jawRing, { cx: 10, cy: 26, rx: 9, ry: 30 });
        jawRing.removeAttribute("visibility");
      } else {
        jawRing.setAttribute("visibility", "hidden");
      }
      var nosePath = el("fa-nose");
      nosePath.setAttribute("d", (ch.share_nose || 0) > 0 ? "M" + f1(upper.x) + " " + f1(upper.y) + " Q" + f1((upper.x + nose.x) / 2 - 10) + " " + f1((upper.y + nose.y) / 2) + " " + nose.x + " " + nose.y : "");
      var checkPath = el("fa-check");
      checkPath.setAttribute("d", mech === "check" ? "M0 0 C-30 -60 -52 -140 -46 -290" : "");

      var maxForce = Math.max(f.Fdirect, f.Flever, f.Fpulley, f.chain, f.cheekpiece, f.jawLoad / 2, f.noseLoad / 2, Math.sqrt(f.sumX * f.sumX + f.sumY * f.sumY), 1);
      var k = Math.min(2.5, 150 / maxForce);
      var reinDir = { x: Math.sin(theta * Math.PI / 180), y: -Math.cos(theta * Math.PI / 180) };

      var atBit = f.Fdirect + f.Fpulley;
      var reinFrom = hasShank && f.Flever > 0 ? lower : { x: 0, y: 0 };
      var reinForce = hasShank && f.Flever > 0 ? f.Flever : atBit;
      var tipRein = arrow("fa-arrow-rein", reinFrom, reinDir, reinForce * k);
      labelAt("fa-l-rein", tipRein, headRotation, "F", 8, 5);

      var tipRein2 = null;
      if (hasShank && f.Flever > 0 && atBit > 0) {
        tipRein2 = arrow("fa-arrow-rein2", { x: 0, y: 0 }, reinDir, atBit * k);
      } else {
        arrow("fa-arrow-rein2", { x: 0, y: 0 }, reinDir, 0);
      }
      labelAt("fa-l-rein2", tipRein2, headRotation, tipRein2 ? "Fₛ" : "", 8, 16);

      var tipChain = null;
      if (ch.chain && hasShank && f.chain > 0) {
        tipChain = arrow("fa-arrow-chain", upper, { x: chin.x - upper.x, y: chin.y - upper.y }, f.chain * k);
      } else if (mech === "jaw-ring" && f.jawLoad > 0) {
        tipChain = arrow("fa-arrow-chain", { x: 10, y: 56 }, { x: -0.2, y: -1 }, f.jawLoad / 2 * k);
      } else if ((ch.share_nose || 0) > 0 && f.noseLoad > 0) {
        tipChain = arrow("fa-arrow-chain", nose, { x: upper.x - nose.x, y: upper.y - nose.y }, f.noseLoad / 2 * k);
      } else {
        arrow("fa-arrow-chain", upper, { x: 1, y: 0 }, 0);
      }
      labelAt("fa-l-chain", tipChain, headRotation, "C", 6, 16);

      var pollDir = mech === "check" ? { x: -0.15, y: -1 } : { x: poll.x - upper.x, y: poll.y - upper.y };
      var tipPoll = arrow("fa-arrow-poll", upper, pollDir, f.cheekpiece * k);
      labelAt("fa-l-poll", tipPoll, headRotation, "T", 8, -4);

      var reaction = { x: -f.sumY, y: f.sumX };
      var reactionMag = Math.sqrt(f.sumX * f.sumX + f.sumY * f.sumY);
      var tipReaction = arrow("fa-arrow-reaction", { x: 0, y: 0 }, reaction, reactionMag * k);
      labelAt("fa-l-reaction", tipReaction, headRotation, "R", -8, 16);
      el("fa-l-reaction").setAttribute("text-anchor", "end");

      var posture = M.byId(CATALOG.postures, state.posture);
      el("fa-l-posture").textContent = mech === "check" ? ui("posture_check", "Check rein: lift along the face at every carriage") : t(posture.name) + " · θ = " + theta + "°";
      el("fa-l-amp").textContent = fill(ui("amp_line", "Force onto tongue and bars: {press} ({amp}× the rein component in that direction)"), {
        press: N(f.pressTotal), amp: num(f.amplification, 1)
      });
      el("fa-l-rho").textContent = hasShank ? fill(ui("rho_line", "shank rotation ρ = {rho}°"), { rho: num(f.rho, 0) }) : "";
    }

    /* ---------- Figure B: cross-section ---------- */

    var SCALE_B = 2.4; /* px per mm */

    function figureB(res) {
      var d = res.inputs.d;
      var mp = res.mp;
      var ch = res.ch;
      var h = d * SCALE_B;
      var barsTop = 152;
      var height = CATALOG.mouth.tongue_thickness + CATALOG.mouth.bit_space;
      var tongueMm = Math.max(5, Math.min(CATALOG.mouth.tongue_thickness, height - res.totalThickness - 1));
      var tongueH = tongueMm * SCALE_B;
      var tongue = el("fb-tongue");
      attrs(tongue, { ry: tongueH / 2, cy: barsTop - tongueH / 2 + 3 });
      var bitBottom = barsTop - tongueH + 2;
      var bitMid = bitBottom - h / 2;
      var width = res.inputs.bitWidth * SCALE_B;

      var lift = 0;
      if (mp.joints === 1 && !mp.port_height) { lift = res.palate * 16; }
      if (mp.joints === 2 && !mp.two_strands && !mp.port_height) { lift = -4; }
      var plateTilt = 0;
      if (mp.plate && mp.plate_tilt_sensitive && ((ch.ride_up_guard || 0) >= 0.6 || mech === "curb")) { plateTilt = 18; }
      drawMouth("fb", { cx: 240, cy: bitMid, width: width, h: h, scale: SCALE_B, plateTilt: plateTilt }, mouth.draw || {}, mp, lift, 76);

      var pr = res.pressures;
      function zone(id, value, scale) {
        var node = el(id);
        var opacity = Math.max(0, Math.min(0.9, value / scale));
        node.style.opacity = opacity.toFixed(2);
      }
      var zoneT = el("fb-zone-tongue");
      attrs(zoneT, { y: bitBottom, x: 240 - 44 });
      zone("fb-zone-tongue", pr.tongue, 400);
      zone("fb-zone-bar-l", pr.bars, 400);
      zone("fb-zone-bar-r", pr.bars, 400);
      zone("fb-zone-lip-l", pr.lips, 400);
      zone("fb-zone-lip-r", pr.lips, 400);
      zone("fb-zone-palate", res.palate * 300, 400);
      zone("fb-zone-jaw-l", pr.jaw, 400);
      zone("fb-zone-jaw-r", pr.jaw, 400);
      zone("fb-zone-cheek-l", pr.cheek, 400);
      zone("fb-zone-cheek-r", pr.cheek, 400);

      el("fb-l-tongue").textContent = ui("tissue_tongue", "tongue") + " " + kPa(pr.tongue);
      el("fb-l-bar-l").textContent = ui("tissue_bars", "bars") + " " + kPa(pr.bars);
      el("fb-l-bar-r").textContent = kPa(pr.bars);
      el("fb-l-lip-l").textContent = ui("lips_short", "lips") + " " + kPa(pr.lips);
      el("fb-l-lip-r").textContent = ui("lips_short", "lips") + " " + kPa(pr.lips);
      el("fb-l-palate").textContent = fill(ui("palate_risk", "palate risk {r}"), { r: num(res.palate, 2) });
      el("fb-l-jaw").textContent = pr.jaw > 0 ? ui("tissue_jaw", "jaw") + " " + kPa(pr.jaw) : "";
      el("fb-l-cheek").textContent = pr.cheek > 0 ? ui("tissue_cheek", "cheek") + " " + kPa(pr.cheek) : "";
      el("fb-l-scale").textContent = fill(ui("scale_line", "to scale: 1 mm = {px} px · mouthpiece {d}"), { px: SCALE_B, d: mm(d) });
      el("fb-l-fit").textContent = fill(ui("fit_line", "tongue left {mm} of its {full}"), { mm: mm(tongueMm), full: mm(CATALOG.mouth.tongue_thickness) });
    }

    /* ---------- Figure C: pressure bars ---------- */

    var TISSUES_C = ["bars", "tongue", "lips", "chin", "jaw", "cheek", "nose", "poll"];

    function figureC(res) {
      var pr = res.pressures;
      var f = res.forces;
      var th = CATALOG.thresholds_kpa;
      var mainFraction = 1 - (res.ch.second_bar_share || 0);
      var loads = {
        bars: { load: f.pressTotal * mainFraction * res.mp.share.bars / 2, area: res.areas.bar, always: true },
        tongue: { load: f.pressTotal * mainFraction * res.mp.share.tongue * res.fit, area: res.areas.tongue, always: true },
        lips: { load: f.lipPerSide, area: res.areas.lip, always: true },
        chin: { load: f.chinLoad, area: res.areas.chin },
        jaw: { load: f.jawLoad, area: res.areas.jaw },
        cheek: { load: f.cheekLoad, area: res.areas.cheek },
        nose: { load: f.noseLoad, area: res.areas.nose },
        poll: { load: f.pollLoad, area: res.areas.poll, always: true }
      };
      var visible = TISSUES_C.filter(function (tissue) { return loads[tissue].always || loads[tissue].load > 0.05; });
      var maxVal = 300;
      visible.forEach(function (tissue) { maxVal = Math.max(maxVal, pr[tissue]); });
      var axisMax = Math.min(2000, Math.ceil(maxVal / 100) * 100 + 100);
      var x0 = 200;
      var span = 400;
      function x(v) { return x0 + span * Math.min(v, axisMax) / axisMax; }
      var rowStep = 40;
      var top = 30;
      var bottom = top + visible.length * rowStep - 8;
      var svg = el("fc-grid").ownerSVGElement;
      svg.setAttribute("viewBox", "0 0 640 " + (bottom + 56));

      var grid = el("fc-grid");
      clear(grid);
      var step = axisMax > 1000 ? 500 : axisMax > 600 ? 200 : 100;
      for (var v = step; v <= axisMax; v += step) {
        var tickLine = document.createElementNS(SVG_NS, "line");
        tickLine.setAttribute("class", "viz-grid");
        attrs(tickLine, { x1: x(v), x2: x(v), y1: 20, y2: bottom });
        grid.appendChild(tickLine);
        var tickText = document.createElementNS(SVG_NS, "text");
        tickText.setAttribute("class", "viz-muted viz-small");
        tickText.setAttribute("text-anchor", "middle");
        attrs(tickText, { x: x(v), y: bottom + 28 });
        tickText.textContent = String(v);
        grid.appendChild(tickText);
      }
      ["free", "face"].forEach(function (name) {
        var value = name === "free" ? th.pain_free_upper : th.face_ppt;
        attrs(el("fc-th-" + name), { x1: x(value), x2: x(value), y1: 20, y2: bottom });
        attrs(el("fc-th-" + name + "-l"), { x: x(value) + (name === "free" ? -4 : 4) });
      });
      var axisLine = svg.querySelector("line.viz-axis");
      attrs(axisLine, { y2: bottom });
      var zeroLabel = svg.querySelector("text.viz-muted.viz-small:last-of-type");
      if (zeroLabel) { attrs(zeroLabel, { y: bottom + 30 }); }

      var table = document.querySelector("[data-pressure-table]");
      var i = 0;
      TISSUES_C.forEach(function (tissue) {
        var g = svg.querySelector('[data-row="' + tissue + '"]');
        var row = table.querySelector('[data-tissue="' + tissue + '"]');
        var on = visible.indexOf(tissue) !== -1;
        if (!on) {
          g.setAttribute("visibility", "hidden");
          show(row, false);
          return;
        }
        g.removeAttribute("visibility");
        show(row, true);
        var y = top + i * rowStep;
        i++;
        var value = pr[tissue];
        var bar = g.querySelector("rect");
        var w = Math.max(0, x(value) - x0);
        attrs(bar, { x: x0, y: y, width: w, height: 20, rx: w > 4 ? 4 : 0 });
        attrs(g.querySelector("text"), { y: y + 14 });
        var val = g.querySelector("[data-val]");
        attrs(val, { x: x0 + w + 6, y: y + 14 });
        val.textContent = (value > axisMax ? "▸ " : "") + kPa(value);
        row.querySelector('[data-cell="load"]').textContent = N(loads[tissue].load);
        row.querySelector('[data-cell="area"]').textContent = num(loads[tissue].area, 0) + " " + ui("unit_mm2", "mm²");
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
      if (ch.stop === "suspension") { stopMm = 3; stopLabel = ui("stop_suspension", "fixed cheek holds it here"); }
      else if (ch.stop === "chain") { stopMm = 2; stopLabel = fill(ui(ch.rigid_ring ? "stop_rigid" : "stop_chain", "shank stops at {rho}°; mouthpiece does not rise"), { rho: num(f.rho, 0) }); }
      else if (ch.stop === "cheekpiece") { stopMm = Math.min(travelMax, f.liftMm); stopLabel = fill(ui("stop_cheekpiece", "cheekpiece taut after {mm}"), { mm: mm(f.liftMm) }); }
      else if (ch.stop === "bone") { stopMm = 4; stopLabel = ui("stop_bone", "the jaw bone is the stop"); }
      else if (ch.stop === "none") {
        if (mech === "check") { stopMm = travelMax; stopLabel = ui("stop_check", "no stop and no release"); }
        else if ((ch.slide_limit || 0) > 0) { stopMm = ch.slide_limit; stopLabel = fill(ui("stop_fitted", "rubber stop at {mm}"), { mm: mm(ch.slide_limit) }); }
        else { stopMm = travelMax; stopLabel = ui("stop_none", "no stop before the teeth"); }
      } else { stopMm = 18; stopLabel = ui("stop_tissue", "lip stretch · the only stop"); }

      if (mech === "direct" || mech === "jaw-ring" || (mech === "combination" && !f.liftMm)) {
        lift = (ch.ride_up_guard || 0) >= 0.6 ? 2 : Math.min(18, f.lipPerSide / 2);
      }
      var bitX = 60 + lift * pxPerMm;
      attrs(el("fd-bit"), { cx: bitX });
      attrs(el("fd-travel"), { width: lift * pxPerMm });
      var stopX = 60 + stopMm * pxPerMm;
      attrs(el("fd-stop"), { x1: stopX, x2: stopX });
      var sl = el("fd-stop-label");
      attrs(sl, { x: stopX });
      sl.setAttribute("text-anchor", stopX > 420 ? "end" : stopX < 200 ? "start" : "middle");
      sl.textContent = stopLabel;
      var ll = el("fd-lift-label");
      attrs(ll, { x: bitX });
      ll.setAttribute("text-anchor", bitX > 420 ? "end" : bitX < 200 ? "start" : "middle");
      ll.textContent = fill(ui("lift_line", "modelled rise at this tension: {mm}"), { mm: mm(lift) });

      var rotText;
      if (ch.chain && ch.rigid_ring) { rotText = fill(ui("rot_rigid", "rigid ring engages at {rho}°: no give at all"), { rho: num(f.rho, 0) }); }
      else if (ch.chain && f.hasChainLever) { rotText = fill(ui("rot_chain", "chain engages at {rho}°: rotation stops, force does not"), { rho: num(f.rho, 0) }); }
      else if (mech === "gag-lever" && (ch.shank || 0) > 0) { rotText = fill(ui("rot_gag_lever", "none: rotates to {rho}° until the lips stop it"), { rho: num(f.rho, 0) }); }
      else if (mech === "gag-slide") { rotText = ui("rot_pulley", "not applicable: the ring is a pulley, the bit slides"); }
      else if (mech === "jaw-ring") { rotText = ui("rot_jaw", "not applicable: the ring clamps, it does not rotate"); }
      else if (mech === "check") { rotText = ui("rot_check", "not applicable: a strap, set once"); }
      else { rotText = ui("rot_direct", "not applicable: no lever"); }
      el("fd-rot-label").textContent = rotText;

      var guard = ch.pull_through_guard || 0;
      attrs(el("fd-guard-bar"), { width: 200 * guard });
      el("fd-guard-label").textContent = pct(guard) + " · " + ui(guard >= 0.8 ? "guard_full" : guard >= 0.5 ? "guard_part" : "guard_none", "");
    }

    /* ---------- Figure E: posture landscape ---------- */

    function figureE(land) {
      var scale = 150 / Math.max(120, Math.max.apply(null, land.postures.map(function (p) { return p.peak; })));
      land.postures.forEach(function (p) {
        var g = document.querySelector('[data-posture="' + p.id + '"]');
        if (!g) { return; }
        var h = Math.min(150, p.peak * scale);
        var col = g.querySelector(".col");
        attrs(col, { height: h, y: 270 - h, rx: 4 });
        col.setAttribute("class", "col viz-bar" + (p.id === land.bias ? "" : " viz-bar--dim"));
        var val = g.querySelector(".val");
        attrs(val, { y: 270 - h - 8 });
        val.textContent = kPa(p.peak);
        var site = g.querySelector(".site");
        attrs(site, { y: 270 - h - 24 });
        site.textContent = ui("tissue_" + p.site, p.site);
      });
      var bias = M.byId(CATALOG.postures, land.bias);
      el("fe-bias").textContent = mech === "check" ? ui("bias_check", "A check rein does not vary with carriage: it fixes the carriage") : fill(ui("bias_line", "Least pain under a holding hand: {posture}"), { posture: t(bias.name) });
    }

    /* ---------- Figure F: likely injuries ---------- */

    function figureF(risks, res) {
      var table = document.querySelector("[data-injuries]");
      if (!table) { return; }
      var seen = {};
      risks.forEach(function (risk) {
        seen[risk.id] = true;
        var row = table.querySelector('[data-risk="' + risk.id + '"]');
        if (!row) { return; }
        show(row, true);
        var level = row.querySelector('[data-cell="level"]');
        level.setAttribute("data-level", RISK_LEVELS[risk.level]);
        level.textContent = ui("risk_level_" + risk.level, String(risk.level));
        var values = {
          kpa: kPa(risk.value || 0), value: num(risk.value || 0, 2), lift: mm(res.forces.liftMm),
          edge: num(res.mp.edge || 1, 2), contact: pct(res.mp.contact_fraction || 1), rho: num(res.forces.rho, 0),
          peak: kPa(res.pressures.peak), site: ui("tissue_" + res.pressures.peakSite, res.pressures.peakSite)
        };
        var whyKey = "risk_why_" + risk.id + "_" + (risk.level >= 2 ? "high" : "low");
        row.querySelector('[data-cell="why"]').textContent = fill(ui(whyKey, ui("risk_why_" + risk.id, "")), values);
        var cell = row.querySelector('[data-cell="sources"]');
        clear(cell);
        risk.sources.forEach(function (sourceId, i) {
          var n = sourceIndex(sourceId);
          if (!n) { return; }
          if (cell.childNodes.length) { cell.appendChild(document.createTextNode(", ")); }
          var a = document.createElement("a");
          a.setAttribute("href", "#src-" + sourceId);
          a.textContent = String(n);
          cell.appendChild(a);
        });
      });
      var rows = table.querySelectorAll("[data-risk]");
      for (var i = 0; i < rows.length; i++) {
        if (!seen[rows[i].getAttribute("data-risk")]) { show(rows[i], false); }
      }
    }

    /* ---------- Figure G: harm index and class ---------- */

    function figureG(sc, res) {
      var H = CATALOG.harm;
      var parts = { pain: H.weights.pain, injury: H.weights.injury, control: H.weights.control };
      for (var key in parts) {
        if (!Object.prototype.hasOwnProperty.call(parts, key)) { continue; }
        var g = document.querySelector('[data-part="' + key + '"]');
        if (!g) { continue; }
        var value = sc.components[key];
        attrs(g.querySelector("rect"), { width: value * 3, rx: value > 2 ? 4 : 0 });
        var v = g.querySelector(".v");
        attrs(v, { x: 300 + value * 3 + 6 });
        v.textContent = num(value, 0);
        g.querySelector(".w").textContent = "× " + num(parts[key], 1);
      }
      var sub = document.querySelector('[data-part="control"] .sub');
      if (sub) {
        sub.textContent = fill(ui("control_sub", "stop {stop} · release {release} · signal {signal}"), { stop: num(sc.sub.stop, 0), release: num(sc.sub.release, 0), signal: num(sc.sub.signal, 0) });
      }
      el("fg-formula").textContent = fill(ui("index_formula", "index = {wp} × pain + {wi} × injury + {wc} × control = {index}"), {
        wp: num(H.weights.pain, 1), wi: num(H.weights.injury, 1), wc: num(H.weights.control, 1), index: num(sc.composite, 0)
      });
      var harm = sc.harm;
      var reasons = [];
      reasons.push(fill(ui("class_why_pain_" + harm.painIdx, ""), { peak: kPa(harm.peak), site: ui("tissue_" + res.pressures.peakSite, res.pressures.peakSite) }));
      if (harm.worstRisk) {
        reasons.push(fill(ui("class_why_injury_" + harm.injuryIdx, ""), { risk: ui("risk_name_" + harm.worstRisk.id, harm.worstRisk.id), level: ui("risk_level_" + harm.worstRisk.level, String(harm.worstRisk.level)) }));
      } else {
        reasons.push(ui("class_why_injury_0", ""));
      }
      if (harm.design) {
        reasons.push(ui("class_why_design_" + harm.design, ""));
      }
      field("class-name", ui("class_" + harm.cls, ""));
      field("class-why", reasons.join(" "));
      var nameNode = document.querySelector('[data-field="class-name"]');
      if (nameNode) { nameNode.setAttribute("data-class", String(harm.cls)); }
    }

    /* ---------- Conditional statements ---------- */

    function statements(res, land, sc, ref) {
      var ch = res.ch;
      var mp = res.mp;
      var f = res.forces;
      var shank = (ch.shank || 0) > 0;
      var chained = f.hasChainLever;
      var leverNoChain = (mech === "gag-lever" || mech === "combination") && shank && !ch.chain;

      say("draw-direct", mech === "direct" || (mech === "gag-lever" && !shank));
      say("draw-curb", chained && mech !== "gag-curb");
      say("draw-gag-lever", leverNoChain);
      say("draw-gag-slide", mech === "gag-slide" || mech === "gag-curb");
      say("draw-jaw-ring", mech === "jaw-ring");
      say("draw-combination", mech === "combination");
      say("draw-check", mech === "check");

      say("direct-sum", mech === "direct" || (mech === "gag-lever" && !shank));
      say("curb-sum", chained && mech === "curb");
      say("gag-lever-sum", mech === "gag-lever" && leverNoChain);
      say("gag-slide-sum", mech === "gag-slide");
      say("gag-curb-sum", mech === "gag-curb");
      say("jaw-ring-sum", mech === "jaw-ring");
      say("combination-sum", mech === "combination");
      say("check-sum", mech === "check");
      say("second-bar", (ch.second_bar_d || 0) > 0);
      say("weight", (ch.bit_mass_kg || 0) > 0.3);
      say("poll", true);

      say("fit-tight", res.fit > 1.02);
      say("fit-ok", res.fit <= 1.02);
      say("nutcracker", mp.joints === 1 && !mp.scissor);
      say("double-joint", mp.joints === 2 && !mp.two_strands && !mp.port_height);
      say("plate-tilt", !!mp.plate && !mp.plate_under && (mp.edge > 1.2 || ch.ride_up_guard >= 0.6 || mech === "curb" || mech === "gag-lever"));
      say("unjointed", mp.joints === 0 && !mp.keys && !mp.port_height);
      say("port", !!mp.port_height && !mp.palate_by_design);
      say("palate-design", !!mp.palate_by_design);
      say("textured", (mp.contact_fraction || 1) < 0.9 && (mp.edge || 1) > 1.2);
      say("multilink", mouth.family === "multi");
      say("two-strands", !!mp.two_strands);
      say("scissor", !!mp.scissor);
      say("tongue-plate", !!mp.plate_under);
      say("keys", !!mp.keys);
      say("soft-mouth", !!(mouth.draw && mouth.draw.soft));
      say("free-pivot", !!ch.free_pivot);

      say("tension-context", mech !== "check" && !(mech === "jaw-ring" && (cheek.tags || []).indexOf("in-hand") !== -1));
      say("lead-context", mech === "jaw-ring" && (cheek.tags || []).indexOf("in-hand") !== -1);
      say("sustained", true);

      say("stop-suspension", ch.stop === "suspension");
      say("stop-tissue", ch.stop === "tissue");
      say("stop-chain", ch.stop === "chain" && !ch.rigid_ring);
      say("stop-rigid", ch.stop === "chain" && !!ch.rigid_ring);
      say("stop-cheekpiece", ch.stop === "cheekpiece" && !ch.chain);
      say("stop-none", ch.stop === "none" && !(ch.slide_limit > 0) && mech !== "check");
      say("stop-bone", ch.stop === "bone");
      say("stop-check", mech === "check");
      say("stops-fitted", ch.stop === "none" && ch.slide_limit > 0);
      say("pull-through", (ch.pull_through_guard || 0) < 0.5);
      say("lip-pinch", !!ch.ring_through_mouthpiece && (ch.lip_pinch || 0) >= 0.3);
      say("cheek-squeeze", (ch.cheek_squeeze || 0) > 0);
      say("held-high", (ch.held_high || 0) > 0);

      ["above", "correct", "vertical", "btv"].forEach(function (id) { say("bias-" + id, mech !== "check" && land.bias === id); });
      say("curb-head", chained);
      say("gag-head", mech === "gag-slide" || mech === "gag-curb" || (mech === "gag-lever" && leverNoChain));
      say("check-head", mech === "check");
      say("btv-horse", mech !== "check");
      field("btv-verdict", ui("btv_" + land.bias, ""));

      say("v-reference", true);
      field("ref-peak", kPa(ref.result.pressures.peak));
      field("ref-site", ui("tissue_" + ref.result.pressures.peakSite, ref.result.pressures.peakSite));
      field("ref-verdict", ui("ref_" + levelOf(ref.result.pressures.peak), ""));
      say("v-kind", ref.harm.cls <= 1);
      say("v-mid", ref.harm.cls === 2);
      say("v-harsh", ref.harm.cls >= 3);
      say("v-rplus", true);
      say("v-lift", ch.stop === "none" || ch.stop === "cheekpiece");
      say("v-chain", !!ch.chain && !ch.rigid_ring && !res.inputs.chinGuard && f.chain > 0);
      say("v-banned", (cheek.tags || []).indexOf("underground") !== -1 || !!mouth.restricted);
    }

    /* ---------- Photographs ---------- */

    function renderPhotos() {
      var holder = document.querySelector("[data-photos]");
      if (!holder) { return; }
      var shown = 0;
      if (showPhoto(holder.querySelector('[data-photo="cheek"]'), photoOf("cheeks", cheekId), t(cheek.name))) { shown++; }
      if (showPhoto(holder.querySelector('[data-photo="mouth"]'), photoOf("mouthpieces", mouthId), t(mouth.name))) { shown++; }
      if (showPhoto(holder.querySelector('[data-photo="pair"]'), photoOf("pairings", cheekId + "|" + mouthId), title)) { shown++; }
      show(holder, shown > 0);
      show(document.querySelector("[data-no-photos]"), shown === 0);
    }

    /* ---------- Interaction notes, parameters, sources ---------- */

    function matches(when, chModel, mpModel) {
      if (!when) { return true; }
      if (when.cheeks && when.cheeks.indexOf(cheekId) === -1) { return false; }
      if (when.mouths && when.mouths.indexOf(mouthId) === -1) { return false; }
      if (when.mechanisms && when.mechanisms.indexOf(mech) === -1) { return false; }
      if (when.groups && when.groups.indexOf(cheek.group) === -1) { return false; }
      if (when.families && when.families.indexOf(mouth.family) === -1) { return false; }
      if (when.tags && !(cheek.tags || []).some(function (tag) { return when.tags.indexOf(tag) !== -1; })) { return false; }
      if (when.joints != null && mpModel.joints !== when.joints) { return false; }
      if (when.chain != null && !!chModel.chain !== when.chain) { return false; }
      if (when.plate != null && !!mpModel.plate !== when.plate) { return false; }
      if (when.port != null && (!!mpModel.port_height) !== when.port) { return false; }
      if (when.palate_by_design != null && !!mpModel.palate_by_design !== when.palate_by_design) { return false; }
      if (when.textured != null && (((mpModel.contact_fraction || 1) < 0.9) !== when.textured)) { return false; }
      if (when.ring_through != null && !!chModel.ring_through_mouthpiece !== when.ring_through) { return false; }
      if (when.suspended != null && ((chModel.ride_up_guard || 0) >= 0.6) !== when.suspended) { return false; }
      if (when.min_shank != null && (chModel.shank || 0) < when.min_shank) { return false; }
      if (when.slide != null && ((chModel.mouthpiece_slide || 0) > 0) !== when.slide) { return false; }
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
        if (source.id) { li.id = "src-" + source.id; }
        li.querySelector("span").textContent = typeof source.text === "string" ? source.text : t(source.text);
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
