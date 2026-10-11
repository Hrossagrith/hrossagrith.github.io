/* Bit mechanics model for the Hrossagrith bit register.
   Pure functions only: no DOM, no markup. Runs in the browser (window.BitModel)
   and in Node (module.exports) so the same code produces the page figures and
   the offline ranking.

   Frame of reference (sagittal plane of the head):
     x̂  along the head, from the mouth towards the poll
     ŷ  perpendicular, from the palate towards the mandible (ventral)
   The rein leaves the bit at an angle theta to x̂. theta ≈ 20° with the nose
   stretched out, ≈ 70° with the head on the vertical, > 90° behind the vertical.
   Rotations of a shank are measured by rho: the lower arm swings towards +ŷ.

   Lengths in millimetres, forces in newtons, pressures in kilopascals.
   Every number that is an assumption is read from the catalogue, never typed
   here, so the page can show it and the user can change it. */

(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.BitModel = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEG = Math.PI / 180;

  /* ---------- Catalogue helpers ---------- */

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        return list[i];
      }
    }
    return null;
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* Merge the chosen option values into a copy of the entity's model block.
     `chosen` maps option id -> value id; unspecified options use their default. */
  function resolve(entity, chosen) {
    var model = clone(entity.model || {});
    var options = entity.options || [];
    var selection = {};
    for (var i = 0; i < options.length; i++) {
      var option = options[i];
      var wanted = (chosen && chosen[option.id]) || option["default"];
      var value = byId(option.values, wanted) || byId(option.values, option["default"]);
      selection[option.id] = value.id;
      for (var key in value) {
        if (key !== "id" && key !== "name" && Object.prototype.hasOwnProperty.call(value, key)) {
          model[key] = clone(value[key]);
        }
      }
    }
    model.selection = selection;
    return model;
  }

  function validity(catalog, cheekId, mouthId) {
    var rules = catalog.validity;
    var order = ["invalid", "theoretical", "rare", "common"];
    for (var i = 0; i < order.length; i++) {
      var table = rules[order[i]] || {};
      var list = table[cheekId];
      if (list && list.indexOf(mouthId) !== -1) {
        return order[i];
      }
    }
    return rules["default"] || "exists";
  }

  function pairing(catalog, cheekId, mouthId) {
    var list = catalog.pairings || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].cheek === cheekId && list[i].mouth === mouthId) {
        return list[i];
      }
    }
    return null;
  }

  /* ---------- Contact geometry ---------- */

  /* Width of the contact strip when a cylinder of radius r sinks a depth delta
     into a flat tissue bed (chord of the circle at that depth). */
  function chord(r, delta) {
    var d = Math.min(delta, r);
    return 2 * Math.sqrt(Math.max(0, 2 * r * d - d * d));
  }

  /* ---------- Shank statics ---------- */

  /* Moment balance of one shank about the mouthpiece.
       F      rein tension on this side
       theta  rein angle to x̂ (degrees)
       s, p   lower and upper arm
       rho    rotation of the shank (degrees), lower arm towards +ŷ
       lambda share of the restoring moment carried by the cheekpiece
              (the rest is carried by the chain)
     Returns chain tension C and cheekpiece tension T. */
  function shankBalance(F, theta, s, p, rho, lambda, chainArmFactor) {
    var moment = F * s * Math.sin((theta + rho) * DEG);
    var sinRho = Math.sin(rho * DEG);
    var T = sinRho > 0.05 ? (lambda * moment) / (p * sinRho) : 0;
    var chainArm = p * chainArmFactor;
    var C = chainArm > 0 ? ((1 - lambda) * moment) / chainArm : 0;
    return { moment: moment, T: T, C: C };
  }

  /* ---------- Main computation ---------- */

  function compute(catalog, cheekId, mouthId, settings) {
    settings = settings || {};
    var cheek = byId(catalog.cheeks, cheekId);
    var mouthpiece = byId(catalog.mouthpieces, mouthId);
    if (!cheek || !mouthpiece) {
      return null;
    }
    var ch = resolve(cheek, settings.cheekOptions);
    var mp = resolve(mouthpiece, settings.mouthOptions);
    var mouth = catalog.mouth;
    var defaults = catalog.defaults;

    var F = settings.reinTension != null ? settings.reinTension : defaults.rein_tension;
    var theta = settings.theta != null ? settings.theta : thetaOf(catalog, defaults.posture);
    var d = settings.diameter != null ? settings.diameter : mp.d;
    var bitSpace = settings.bitSpace != null ? settings.bitSpace : mouth.bit_space;
    var chinGuard = settings.chinGuard != null ? settings.chinGuard : defaults.chin_guard;
    var curbShare = settings.curbReinShare != null ? settings.curbReinShare : defaults.curb_rein_share;

    var bitWidth = settings.bitWidth != null ? settings.bitWidth : mouth.mouth_width + 5;
    var mechanism = cheek.mechanism;
    var r = d / 2;
    var doubleBridle = !!cheek.double_bridle;

    /* Rein split between a direct (snaffle) action and a lever action. */
    var Fdirect = 0;
    var Flever = 0;
    if (mechanism === "direct") {
      Fdirect = F;
    } else if (mechanism === "gag-slide") {
      Fdirect = 0;
      Flever = F;
    } else if (doubleBridle) {
      /* In a double bridle the bradoon carries the direct rein; the curb rein
         is held lighter. Only the curb's own load is modelled here. */
      Fdirect = 0;
      Flever = F * curbShare;
    } else {
      var mode = ch.rein_mode || "curb";
      if (mode === "two") {
        Fdirect = F;
        Flever = F * curbShare;
      } else if (mode === "roundings") {
        Fdirect = F * 0.5;
        Flever = F * 0.5;
      } else {
        Fdirect = 0;
        Flever = F;
      }
    }

    /* Per-side force components acting on the bit body, head frame. */
    var sumX = 0;   /* +x̂ : towards the poll, i.e. up into the commissures */
    var sumY = 0;   /* +ŷ : towards the mandible, i.e. onto tongue and bars */
    var C = 0;      /* chain tension per side */
    var T = 0;      /* cheekpiece tension per side */
    var rho = 0;    /* shank rotation reached */
    var leverRatio = 0;
    var amplification = 1;
    var liftMm = 0;
    var cordUp = 0;

    sumX += Fdirect * Math.cos(theta * DEG);
    sumY += Fdirect * Math.sin(theta * DEG);

    var s = ch.shank || 0;
    var p = ch.purchase || 0;

    if (mechanism === "curb" || (mechanism === "gag-lever" && ch.chain)) {
      if (ch.shank_floating) {
        /* Plain Kimblewick: the rein slides on the D. A high hand carries it
           up to the mouthpiece and the lever vanishes. */
        s = s * Math.min(1, Math.max(0.15, theta / 60));
      }
      leverRatio = p > 0 ? s / p : 0;
      rho = ch.chain_engage_deg || 45;
      var lambda = 0.15;
      var bal = shankBalance(Flever, theta, s, p, rho, lambda, Math.cos(rho * DEG));
      C = bal.C;
      T = bal.T;
      /* Chain pulls from the purchase ring towards the chin groove:
         mostly +ŷ, slightly −x̂. */
      var chainDirX = -0.27;
      var chainDirY = 0.96;
      sumX += Flever * Math.cos(theta * DEG) + C * chainDirX + T;
      sumY += Flever * Math.sin(theta * DEG) + C * chainDirY;
      amplification = Flever > 0 ? (Flever * Math.sin(theta * DEG) + C * chainDirY) / (Flever * Math.sin(theta * DEG)) : 1;
    } else if (mechanism === "gag-lever") {
      /* Ring stack or sliding shank without a chain. Nothing stops the
         rotation except the cheekpiece, so the shank swings until the lips
         stop the mouthpiece rising: a floating fulcrum. */
      leverRatio = p > 0 ? s / p : 0;
      var travel = (settings.lipTravel != null ? settings.lipTravel : mouth.commissure_to_premolar) + (ch.mouthpiece_slide || 0);
      var rhoLip = p > 0 && travel < p ? Math.acos(1 - travel / p) / DEG : 90;
      var rhoAlign = 180 - theta - 5;
      rho = Math.max(5, Math.min(rhoLip, rhoAlign, 80));
      if (s > 0) {
        var balG = shankBalance(Flever, theta, s, p, rho, 1.0, 0);
        T = balG.T;
      } else {
        rho = 0;
        T = 0;
      }
      liftMm = p * (1 - Math.cos(rho * DEG));
      sumX += Flever * Math.cos(theta * DEG) + T;
      sumY += Flever * Math.sin(theta * DEG);
      amplification = 1;
    } else if (mechanism === "gag-slide") {
      /* The cheekpiece cord runs through the ring to the rein: the ring is a
         pulley. The upper segment pulls towards the poll with the rein
         tension reduced by friction over the quarter wrap. */
      var mu = ch.cord_friction || 0.4;
      cordUp = Flever * Math.exp(-mu * Math.PI / 2);
      T = cordUp;
      sumX += Flever * Math.cos(theta * DEG) + cordUp;
      sumY += Flever * Math.sin(theta * DEG);
      amplification = Math.sqrt(1 + Math.pow(cordUp / Flever, 2) + 2 * (cordUp / Flever) * Math.cos(theta * DEG));
      var limit = ch.slide_limit || 0;
      liftMm = limit > 0 ? limit : mouth.commissure_to_premolar;
    }

    /* Suspension by a fixed cheek takes part of the upward component before
       the lips do. */
    var guard = ch.ride_up_guard || 0;
    var lipPerSide = Math.max(0, sumX) * (1 - guard);
    var bridlePerSide = Math.max(0, sumX) * guard + (ch.poll_transfer || 0) * F;
    var pressTotal = 2 * Math.max(0, sumY);
    var pressTowardPalate = 2 * Math.max(0, -sumY);

    /* ---------- Tissue loads and pressures ---------- */

    var share = mp.share;
    var totalThickness = d + (doubleBridle ? 12 : 0);
    /* Static crowding of the tongue: half of the excess thickness ratio is
       taken as an added load factor (the tongue is already compressed before
       any rein tension arrives). */
    var fit = 1 + 0.5 * Math.max(0, totalThickness / bitSpace - 1);

    var tongueLoad = pressTotal * share.tongue * fit;
    var barLoadPerSide = (pressTotal * share.bars) / 2;

    var conformFactor = 0.6 + 0.4 * (mp.conform || 0.5);
    var tongueArea = chord(r, mouth.tongue_indent) * mouth.tongue_contact_width * conformFactor * (mp.concentration || 1) * (mp.contact_fraction || 1);
    if (mp.plate) {
      tongueArea += 120 * (mp.edge < 1.2 ? 1 : 0.4);
    }
    var barArea = chord(r, mouth.bar_mucosa) * mouth.bar_width * (mp.contact_fraction || 1);
    var lipArea = chord(r, mouth.lip_indent) * mouth.lip_contact_length * (mp.contact_fraction || 1);

    var edge = mp.edge || 1;
    var kPa = 1000; /* N/mm² -> kPa */

    var pTongue = tongueArea > 0 ? (tongueLoad / tongueArea) * edge * kPa : 0;
    var pBar = barArea > 0 ? (barLoadPerSide / barArea) * edge * kPa : 0;
    var pLip = lipArea > 0 ? (lipPerSide / lipArea) * edge * kPa : 0;

    var chinLoad = 1.8 * C;
    var chinArea = chinGuard ? mouth.chin_area_guarded : mouth.chin_area_chain;
    var pChin = chinLoad / chinArea * kPa;

    var pollLoad = 2 * T + 2 * bridlePerSide * 0.3;
    var pPoll = pollLoad / mouth.poll_area * kPa;

    /* Palate: a risk index, not a pressure. */
    var palate = mp.palate || 0;
    if (ch.mouthpiece_rotates_with_shank && (mechanism === "curb" || mechanism === "gag-lever")) {
      palate = Math.min(1, palate * Math.min(1.6, Math.pow(Math.max(rho, 10) / 45, 1.5)));
    }
    if (mechanism === "direct" || mechanism === "gag-slide") {
      /* A high hand lifts a jointed mouthpiece; a bit wider than the mouth
         lets the joint rise further towards the palate. */
      var oversize = Math.max(0, (bitWidth - mouth.mouth_width - 5) / 20);
      palate = Math.min(1, palate * (theta < 45 ? 1.5 : 1) * (mp.joints === 1 ? 1 + oversize : 1));
    }
    if (pressTowardPalate > 0) {
      palate = Math.min(1, palate + pressTowardPalate / (4 * F));
    }

    var peak = Math.max(pTongue, pBar, pLip, pChin);
    var peakSite = peak === pBar ? "bars" : peak === pTongue ? "tongue" : peak === pLip ? "lips" : "chin";

    /* ---------- Stop analysis ---------- */

    var stop = {
      type: ch.stop,
      slideLimit: ch.slide_limit || 0,
      liftMm: liftMm,
      pullThroughGuard: ch.pull_through_guard || 0,
      rideUpGuard: guard,
      rotationStop: !!ch.chain,
      rotationDeg: rho,
      forceBounded: false
    };

    var result = {
      cheek: cheek,
      mouthpiece: mouthpiece,
      ch: ch,
      mp: mp,
      inputs: { F: F, theta: theta, d: d, bitSpace: bitSpace, bitWidth: bitWidth, chinGuard: chinGuard, curbShare: curbShare, doubleBridle: doubleBridle },
      forces: {
        Fdirect: Fdirect, Flever: Flever,
        chain: C, cheekpiece: T, cordUp: cordUp,
        sumX: sumX, sumY: sumY,
        pressTotal: pressTotal, lipPerSide: lipPerSide, bridlePerSide: bridlePerSide,
        chinLoad: chinLoad, pollLoad: pollLoad,
        leverRatio: leverRatio, amplification: amplification, rho: rho, liftMm: liftMm
      },
      areas: { tongue: tongueArea, bar: barArea, lip: lipArea, chin: chinArea, poll: mouth.poll_area },
      pressures: { tongue: pTongue, bars: pBar, lips: pLip, chin: pChin, poll: pPoll, peak: peak, peakSite: peakSite },
      palate: palate,
      fit: fit,
      totalThickness: totalThickness,
      stop: stop,
      validity: validity(catalog, cheekId, mouthId),
      pairing: pairing(catalog, cheekId, mouthId)
    };
    return result;
  }

  function thetaOf(catalog, postureId) {
    var posture = byId(catalog.postures, postureId);
    return posture ? posture.theta : 70;
  }

  /* Peak pressure under a fixed hand at every catalogued posture. The posture
     with the lowest peak is where the horse finds the least pain if the rider
     does not yield: the device's intrinsic bias. */
  function landscape(catalog, cheekId, mouthId, settings) {
    var out = [];
    var best = null;
    for (var i = 0; i < catalog.postures.length; i++) {
      var posture = catalog.postures[i];
      var local = clone(settings || {});
      local.theta = posture.theta;
      var res = compute(catalog, cheekId, mouthId, local);
      var entry = {
        id: posture.id, theta: posture.theta,
        peak: res.pressures.peak, site: res.pressures.peakSite,
        tongue: res.pressures.tongue, bars: res.pressures.bars, lips: res.pressures.lips, chin: res.pressures.chin,
        lift: res.forces.liftMm, palate: res.palate
      };
      out.push(entry);
      if (!best || entry.peak < best.peak) {
        best = entry;
      }
    }
    return { postures: out, bias: best ? best.id : null };
  }

  /* ---------- Scores ---------- */

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  /* Component scores 0–100, higher = heavier burden on the horse. Evaluated at
     the catalogue's reference condition unless overridden. */
  function scores(catalog, cheekId, mouthId, settings) {
    var local = clone(settings || {});
    if (local.reinTension == null) { local.reinTension = catalog.defaults.rein_tension; }
    if (local.theta == null) { local.theta = thetaOf(catalog, catalog.defaults.posture); }
    var res = compute(catalog, cheekId, mouthId, local);
    if (!res) { return null; }
    var cheek = res.cheek;
    var ch = res.ch;
    var mp = res.mp;
    var th = catalog.thresholds_kpa;

    var peakScore = 100 * clamp01((res.pressures.peak - 50) / 450);

    var stopTable = { none: 100, cheekpiece: 85, tissue: 70, suspension: 30, chain: 20 };
    var stopScore = stopTable[ch.stop] != null ? stopTable[ch.stop] : 70;
    if (ch.stop === "none" && (ch.slide_limit || 0) > 0) { stopScore = 75; }
    if ((ch.pull_through_guard || 0) < 0.5) { stopScore = Math.min(100, stopScore + 10); }

    var edgeScore = clamp01((mp.edge - 0.75) / 1.5);
    var pinchScore = 100 * (0.4 * (ch.lip_pinch || 0) + 0.3 * (mp.tongue_pinch || 0) + 0.2 * edgeScore + 0.1 * (mp.link_pinch || 0));

    var extraScore = 100 * (0.7 * clamp01(res.pressures.chin / th.face_ppt) + 0.3 * clamp01(res.pressures.poll / 30));

    var palateScore = 100 * res.palate;

    var conflicting = (cheek.mechanism === "gag-slide" || cheek.mechanism === "gag-lever") ? 0.25 : 0;
    var signalScore = 100 * clamp01(1 - (ch.signal_clarity || 0.8) + conflicting);

    var spaceScore = 100 * clamp01((res.totalThickness - res.inputs.bitSpace) / 10);

    var releaseTable = { direct: 0.95, curb: 0.7, "gag-slide": 0.8, "gag-lever": 0.75 };
    var release = releaseTable[cheek.mechanism] || 0.8;
    if (ch.chain_engage_deg && ch.chain_engage_deg < 35) { release -= 0.2; }
    if (ch.rein_mode === "roundings") { release -= 0.15; }
    if (mp.keys) { release -= 0.1; }
    var releaseScore = 100 * clamp01(1 - release);

    var w = catalog.weights;
    var composite =
      w.peak_pressure * peakScore +
      w.stop * stopScore +
      w.pinch_edges * pinchScore +
      w.extra_forces * extraScore +
      w.palate * palateScore +
      w.signal * signalScore +
      w.bit_space * spaceScore +
      w.release * releaseScore;

    return {
      components: {
        peak_pressure: peakScore, stop: stopScore, pinch_edges: pinchScore, extra_forces: extraScore,
        palate: palateScore, signal: signalScore, bit_space: spaceScore, release: releaseScore
      },
      composite: composite,
      result: res
    };
  }

  /* Every combination, ranked kindest first. `filter` may exclude validity
     classes (for example ["invalid", "theoretical"]). */
  function rankAll(catalog, settings, exclude) {
    exclude = exclude || ["invalid"];
    var rows = [];
    for (var i = 0; i < catalog.cheeks.length; i++) {
      for (var j = 0; j < catalog.mouthpieces.length; j++) {
        var cheekId = catalog.cheeks[i].id;
        var mouthId = catalog.mouthpieces[j].id;
        var v = validity(catalog, cheekId, mouthId);
        if (exclude.indexOf(v) !== -1) {
          continue;
        }
        var sc = scores(catalog, cheekId, mouthId, settings);
        rows.push({ cheek: cheekId, mouth: mouthId, validity: v, composite: sc.composite, components: sc.components, peak: sc.result.pressures.peak, peakSite: sc.result.pressures.peakSite });
      }
    }
    rows.sort(function (a, b) { return a.composite - b.composite; });
    for (var k = 0; k < rows.length; k++) {
      rows[k].rank = k + 1;
    }
    return rows;
  }

  function label(entity, lang) {
    return entity && entity.name ? (entity.name[lang] || entity.name.en) : "";
  }

  return {
    byId: byId,
    resolve: resolve,
    validity: validity,
    pairing: pairing,
    chord: chord,
    shankBalance: shankBalance,
    compute: compute,
    landscape: landscape,
    scores: scores,
    rankAll: rankAll,
    thetaOf: thetaOf,
    label: label
  };
});
