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

   Mechanisms (classification by what the parts do, never by the name):
     direct       rein at the mouthpiece, no lever
     curb         lever against a chin restraint (chain, strap or rigid ring)
     gag-lever    lever with no chin restraint (ring stack, sliding shank)
     gag-slide    cheekpiece through the ring: a pulley
     gag-curb     pulley rein and curb rein on one bit
     jaw-ring     ring, bar or cage around the lower jaw
     combination  part of the force routed to nose, chin or jaw plates
     check        constant lift from a harness check rein

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
  var G = 9.81;

  /* ---------- Catalogue helpers ---------- */

  function byId(list, id) {
    for (var i = 0; i < (list || []).length; i++) {
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

  /* Direction of the chain from the purchase ring towards the chin groove,
     and of the cheekpiece towards the poll, in the head frame. */
  var CHAIN_DIR = { x: -0.27, y: 0.96 };

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
    var mechanism = cheek.mechanism;

    var F = settings.reinTension != null ? settings.reinTension : defaults.rein_tension;
    var theta = settings.theta != null ? settings.theta : thetaOf(catalog, defaults.posture);
    if (mechanism === "check") {
      /* A check rein runs up the face to the harness saddle: the lift is along
         the head whatever the carriage, and the force is the horse's own push. */
      theta = 15;
    }
    var d = settings.diameter != null ? settings.diameter : mp.d;
    var bitSpace = settings.bitSpace != null ? settings.bitSpace : mouth.bit_space;
    var chinGuard = settings.chinGuard != null ? settings.chinGuard : (ch.chin_guarded != null ? ch.chin_guarded : defaults.chin_guard);
    var curbShare = settings.curbReinShare != null ? settings.curbReinShare : defaults.curb_rein_share;
    var bitWidth = settings.bitWidth != null ? settings.bitWidth : mouth.mouth_width + 5;
    var r = d / 2;
    var doubleBridle = !!cheek.double_bridle;

    /* Shares of the rein force that never reach the mouthpiece (combination bits). */
    var shareNose = ch.share_nose || 0;
    var shareChinStrap = ch.share_chin || 0;
    var shareJaw = ch.share_jaw || 0;
    var mouthFraction = Math.max(0, 1 - shareNose - shareChinStrap - shareJaw);

    /* Rein split between a direct action and a lever action, per side. */
    var Fdirect = 0;
    var Flever = 0;
    var Fpulley = 0;
    var mode = ch.rein_mode || "curb";
    if (mechanism === "direct" || mechanism === "jaw-ring" || mechanism === "check") {
      Fdirect = F;
    } else if (mechanism === "gag-slide") {
      Fpulley = F;
    } else if (mechanism === "gag-curb") {
      Fpulley = F;
      Flever = F * curbShare;
    } else if (mechanism === "combination") {
      if ((ch.shank || 0) > 0 && ch.chain) {
        Flever = F * mouthFraction;
      } else {
        Fdirect = F * mouthFraction;
      }
    } else if (doubleBridle) {
      /* In a double bridle the bradoon carries the direct rein; the curb rein
         is held lighter. Only the curb's own load is modelled here. */
      Flever = F * curbShare;
    } else if (mode === "two") {
      Fdirect = F;
      Flever = F * curbShare;
    } else if (mode === "roundings") {
      Fdirect = F * 0.5;
      Flever = F * 0.5;
    } else {
      Flever = F;
    }
    if (Flever > 0 && (ch.shank || 0) === 0 && mechanism !== "gag-curb") {
      /* A rein on a ring at mouthpiece level has no lever arm: direct action. */
      Fdirect += Flever;
      Flever = 0;
    }

    /* Per-side force components acting on the bit body, head frame. */
    var sumX = 0;   /* +x̂ : towards the poll, i.e. up into the commissures */
    var sumY = 0;   /* +ŷ : towards the mandible, i.e. onto tongue and bars */
    var C = 0;      /* chain (or rigid ring) tension per side */
    var T = 0;      /* cheekpiece tension per side */
    var rho = 0;    /* shank rotation reached */
    var leverRatio = 0;
    var liftMm = 0;
    var cordUp = 0;

    sumX += Fdirect * Math.cos(theta * DEG);
    sumY += Fdirect * Math.sin(theta * DEG);

    var s = ch.shank || 0;
    var p = ch.purchase || 0;
    var hasChainLever = (mechanism === "curb" || mechanism === "gag-curb" || ((mechanism === "gag-lever" || mechanism === "combination") && ch.chain)) && s > 0 && p > 0;

    if (hasChainLever) {
      if (ch.shank_floating) {
        /* Plain Kimblewick: the rein slides on the D. A high hand carries it
           up to the mouthpiece and the lever vanishes. */
        s = s * Math.min(1, Math.max(0.15, theta / 60));
      }
      leverRatio = s / p;
      rho = ch.chain_engage_deg || 45;
      /* Share of the restoring moment taken by the cheekpiece: a modelling
         assumption (direct measurement shows the chain takes most of it). */
      var lambda = defaults.cheekpiece_moment_share != null ? defaults.cheekpiece_moment_share : 0.15;
      var bal = shankBalance(Flever, theta, s, p, rho, lambda, Math.cos(rho * DEG));
      C = bal.C;
      T += bal.T;
      sumX += Flever * Math.cos(theta * DEG) + C * CHAIN_DIR.x + bal.T;
      sumY += Flever * Math.sin(theta * DEG) + C * CHAIN_DIR.y;
    } else if (mechanism === "gag-lever" || (mechanism === "combination" && s > 0)) {
      /* Ring stack or sliding shank without a chain. Nothing stops the
         rotation except the cheekpiece, so the shank swings until the lips
         stop the mouthpiece rising: a floating fulcrum. */
      leverRatio = p > 0 ? s / p : 0;
      var travel = (settings.lipTravel != null ? settings.lipTravel : mouth.commissure_to_premolar) + (ch.mouthpiece_slide || 0);
      var rhoLip = p > 0 && travel < p ? Math.acos(1 - travel / p) / DEG : 90;
      var rhoAlign = 180 - theta - 5;
      rho = Math.max(5, Math.min(rhoLip, rhoAlign, ch.rho_max || 80));
      var Fl = Flever > 0 ? Flever : Fdirect;
      if (s > 0 && p > 0) {
        var balG = shankBalance(Fl, theta, s, p, rho, 1.0, 0);
        T += balG.T;
        sumX += Fl * Math.cos(theta * DEG) + balG.T;
        sumY += Fl * Math.sin(theta * DEG);
        if (Flever === 0) {
          /* The force was already added as direct above; undo the duplicate. */
          sumX -= Fdirect * Math.cos(theta * DEG);
          sumY -= Fdirect * Math.sin(theta * DEG);
        }
      } else {
        rho = 0;
      }
      liftMm = Math.min(mouth.commissure_to_premolar + 5, p * (1 - Math.cos(rho * DEG)) + (ch.mouthpiece_slide || 0) * 0.5);
    }

    if (Fpulley > 0) {
      /* The cheekpiece cord runs through the ring to the rein: the ring is a
         pulley. The upper strand pulls towards the poll with the rein
         tension reduced by friction over the quarter wrap. */
      var mu = ch.cord_friction || 0.4;
      cordUp = Fpulley * Math.exp(-mu * Math.PI / 2);
      T += cordUp;
      sumX += Fpulley * Math.cos(theta * DEG) + cordUp;
      sumY += Fpulley * Math.sin(theta * DEG);
      var limit = ch.slide_limit || 0;
      liftMm = Math.max(liftMm, limit > 0 ? limit : mouth.commissure_to_premolar);
    }

    if (mechanism === "check") {
      liftMm = Math.min(mouth.commissure_to_premolar, 6 + F / 4);
    } else if (liftMm > 0 && mouth.lift_full_tension > 0) {
      /* The lips resist the rise: the full travel is taken to be reached at
         the reference contact and proportionally less below it. */
      liftMm = liftMm * Math.min(1, F / mouth.lift_full_tension);
    }

    /* Amplification: force onto tongue and bars compared with the rein's own
       component in that direction. */
    var reinPress = (Fdirect + Flever + Fpulley) * Math.sin(theta * DEG);
    var amplification = reinPress > 0 ? Math.max(0, sumY) / reinPress : 1;

    /* Suspension by a fixed cheek takes part of the upward component before
       the lips do. Behind the vertical the rein draws the bit towards the
       front of the mouth (sumX < 0): the cheekpieces hold it, so that
       component goes to the bridle and the poll instead of vanishing. */
    var guard = ch.ride_up_guard || 0;
    var lipPerSide = Math.max(0, sumX) * (1 - guard) + (ch.held_high || 0) * 6;
    var bridlePerSide = Math.max(0, sumX) * guard + Math.max(0, -sumX) + (ch.poll_transfer || 0) * F;
    var restingWeight = 0.5 * (ch.bit_mass_kg || 0) * G;
    var pressTotal = 2 * Math.max(0, sumY) + restingWeight;
    var pressTowardPalate = 2 * Math.max(0, -sumY);

    /* ---------- Tissue loads and pressures ---------- */

    var share = mp.share;
    var secondBarD = ch.second_bar_d || 0;
    var totalThickness = d + (doubleBridle ? 12 : 0) + secondBarD;
    /* Static crowding of the tongue: half of the excess thickness ratio is
       taken as an added load factor (the tongue is already compressed before
       any rein tension arrives). */
    var fit = 1 + 0.5 * Math.max(0, totalThickness / bitSpace - 1);

    var mainFraction = 1 - (ch.second_bar_share || 0);
    var tongueLoad = pressTotal * mainFraction * share.tongue * fit;
    var barLoadPerSide = (pressTotal * mainFraction * share.bars) / 2;

    var conformFactor = 0.6 + 0.4 * (mp.conform || 0.5);
    var tongueArea = chord(r, mouth.tongue_indent) * mouth.tongue_contact_width * conformFactor * (mp.concentration || 1) * (mp.contact_fraction || 1);
    if (mp.plate) {
      tongueArea += 120 * (mp.edge < 1.2 ? 1 : 0.4);
    }
    if (mp.plate_under) {
      tongueArea += 400;
    }
    var barArea = chord(r, mouth.bar_mucosa) * mouth.bar_width * (mp.contact_fraction || 1);
    var lipArea = chord(r, mouth.lip_indent) * mouth.lip_contact_length * (mp.contact_fraction || 1);

    var edge = mp.edge || 1;
    if (ch.free_pivot) {
      /* A mouthpiece that pivots freely on its ring presents its edge to the
         tongue when the lead is pulled. */
      edge = edge * (1 + 0.6 * (ch.pivot_factor != null ? ch.pivot_factor : 1));
    }
    var kPa = 1000; /* N/mm² -> kPa */

    var pTongue = tongueArea > 0 ? (tongueLoad / tongueArea) * edge * kPa : 0;
    var pBar = barArea > 0 ? (barLoadPerSide / barArea) * edge * kPa : 0;
    var pLip = lipArea > 0 ? (lipPerSide / lipArea) * edge * kPa : 0;

    /* A second thin bar (Norton pattern) takes its share on a narrow strip. */
    var pSecond = 0;
    if (secondBarD > 0) {
      var r2 = secondBarD / 2;
      var secondLoadPerSide = (pressTotal * (ch.second_bar_share || 0) * 0.5) / 2;
      var secondArea = chord(r2, mouth.bar_mucosa) * mouth.bar_width * 0.5;
      pSecond = secondArea > 0 ? (secondLoadPerSide / secondArea) * 1.6 * kPa : 0;
      pBar = Math.max(pBar, pSecond);
    }

    var chinLoad = 1.8 * C + shareChinStrap * 2 * F;
    var chinArea = ch.chin_area || (chinGuard ? mouth.chin_area_guarded : mouth.chin_area_chain);
    var pChin = chinLoad / chinArea * kPa;

    var pollLoad = 2 * T + 2 * bridlePerSide * 0.3;
    var pPoll = pollLoad / mouth.poll_area * kPa;

    /* Outside of the face: cheek squeeze (four-ring bits, burrs, lugging plates)
       and jaw clamps (rings, cages, side bars, spoons). */
    var cheekLoad = (ch.cheek_squeeze || 0) * F;
    var cheekArea = ch.cheek_prongs ? 40 : 300;
    var pCheek = cheekLoad / cheekArea * kPa;

    var jawLoad = 0;
    if (mechanism === "jaw-ring") {
      jawLoad = (ch.jaw_clamp || 0.6) * 2 * F;
    }
    if (ch.jaw_plates) {
      jawLoad += 0.5 * F;
    }
    jawLoad += shareJaw * 2 * F;
    var jawArea = ch.jaw_area || 200;
    var pJaw = jawLoad / jawArea * kPa;

    var noseLoad = shareNose * 2 * F;
    var noseArea = ch.nose_area || 800;
    var pNose = noseLoad / noseArea * kPa;

    /* Palate: a risk index, not a pressure. */
    var palate = mp.palate || 0;
    if (ch.mouthpiece_rotates_with_shank && (hasChainLever || mechanism === "gag-lever")) {
      palate = Math.min(1, palate * Math.min(1.6, Math.pow(Math.max(rho, 10) / 45, 1.5)));
    }
    if (mechanism === "direct" || mechanism === "gag-slide" || mechanism === "jaw-ring" || mechanism === "combination") {
      /* A high hand lifts a jointed mouthpiece; a bit wider than the mouth
         lets the joint rise further towards the palate. */
      var oversize = Math.max(0, (bitWidth - mouth.mouth_width - 5) / 20);
      palate = Math.min(1, palate * (theta < 45 ? 1.5 : 1) * (mp.joints === 1 ? 1 + oversize : 1));
    }
    if (pressTowardPalate > 0) {
      palate = Math.min(1, palate + pressTowardPalate / (4 * F));
    }
    if (mp.palate_by_design) {
      palate = Math.max(palate, mechanism === "check" ? 1 : 0.9);
    }

    var pressures = { tongue: pTongue, bars: pBar, lips: pLip, chin: pChin, poll: pPoll, cheek: pCheek, jaw: pJaw, nose: pNose, secondBar: pSecond };
    var peak = 0;
    var peakSite = "tongue";
    ["bars", "tongue", "lips", "chin", "jaw", "cheek", "nose"].forEach(function (site) {
      if (pressures[site] > peak) {
        peak = pressures[site];
        peakSite = site;
      }
    });
    pressures.peak = peak;
    pressures.peakSite = peakSite;

    /* ---------- Stop analysis ---------- */

    var stop = {
      type: ch.stop,
      slideLimit: ch.slide_limit || 0,
      liftMm: liftMm,
      pullThroughGuard: ch.pull_through_guard || 0,
      rideUpGuard: guard,
      rotationStop: !!ch.chain,
      rigidRing: !!ch.rigid_ring,
      rotationDeg: rho,
      forceBounded: false
    };

    return {
      cheek: cheek,
      mouthpiece: mouthpiece,
      ch: ch,
      mp: mp,
      mechanism: mechanism,
      inputs: { F: F, theta: theta, d: d, bitSpace: bitSpace, bitWidth: bitWidth, chinGuard: chinGuard, curbShare: curbShare, doubleBridle: doubleBridle },
      forces: {
        Fdirect: Fdirect, Flever: Flever, Fpulley: Fpulley,
        chain: C, cheekpiece: T, cordUp: cordUp,
        sumX: sumX, sumY: sumY,
        pressTotal: pressTotal, lipPerSide: lipPerSide, bridlePerSide: bridlePerSide,
        chinLoad: chinLoad, pollLoad: pollLoad, cheekLoad: cheekLoad, jawLoad: jawLoad, noseLoad: noseLoad,
        restingWeight: restingWeight,
        leverRatio: leverRatio, amplification: amplification, rho: rho, liftMm: liftMm,
        hasChainLever: hasChainLever
      },
      areas: { tongue: tongueArea, bar: barArea, lip: lipArea, chin: chinArea, poll: mouth.poll_area, cheek: cheekArea, jaw: jawArea, nose: noseArea },
      pressures: pressures,
      palate: palate,
      fit: fit,
      totalThickness: totalThickness,
      stop: stop,
      validity: validity(catalog, cheekId, mouthId),
      pairing: pairing(catalog, cheekId, mouthId)
    };
  }

  function thetaOf(catalog, postureId) {
    var posture = byId(catalog.postures, postureId);
    return posture ? posture.theta : 70;
  }

  /* Peak pressure at every catalogued posture for the same rein tension (a
     static model: in practice tension changes with carriage). The posture with
     the lowest peak is the device's mechanical bias only when it is clearly
     lower than the next one; differences inside the model's margin are
     reported as no bias (null). */
  function landscape(catalog, cheekId, mouthId, settings) {
    var out = [];
    var best = null;
    var margin = catalog.defaults.bias_margin != null ? catalog.defaults.bias_margin : 0;
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
    var runnerUp = null;
    for (var k = 0; k < out.length; k++) {
      if (best && out[k].id !== best.id && (!runnerUp || out[k].peak < runnerUp.peak)) {
        runnerUp = out[k];
      }
    }
    var clear = best && runnerUp && runnerUp.peak > 0 && (runnerUp.peak - best.peak) / runnerUp.peak >= margin;
    return { postures: out, bias: clear ? best.id : null, lowest: best ? best.id : null };
  }

  /* ---------- Injury risks ---------- */

  function levelFor(kpa, th) {
    if (kpa >= th.hand_ppt) { return 3; }
    if (kpa >= th.face_ppt) { return 2; }
    if (kpa >= th.lowest_reported) { return 1; }
    return 0;
  }

  /* Likely issues for the horse, each with a level 0–3 and the sources that
     describe the lesion or mechanism. Levels are read from the model's own
     pressures and flags; the sources are catalogue ids in text.json. */
  function injuryRisks(catalog, res) {
    var th = catalog.thresholds_kpa;
    var ch = res.ch;
    var mp = res.mp;
    var p = res.pressures;
    var f = res.forces;
    var mech = res.mechanism;
    var out = [];

    function add(id, level, sources, value) {
      out.push({ id: id, level: Math.max(0, Math.min(3, Math.round(level))), sources: sources, value: value });
    }

    var noStop = ch.stop === "none" || ch.stop === "cheekpiece" || ch.stop === "tissue";
    var lipLevel = levelFor(p.lips, th);
    if (noStop && f.liftMm >= 15) { lipLevel = Math.max(lipLevel, 2); }
    if (ch.stop === "none" && f.liftMm >= 20 && p.lips >= th.lowest_reported) { lipLevel = 3; }
    add("commissure", lipLevel, ["tuomola2019", "uldahl2019", "tuomola2021event"], p.lips);

    var barLevel = levelFor(p.bars, th);
    if ((mp.contact_fraction || 1) < 0.9 && barLevel < 3) { barLevel += 1; }
    if (mp.joints === 0 && !mp.port_height && barLevel < 3 && p.bars >= th.lowest_reported) { barLevel += 0.5; }
    add("bars", barLevel, ["tuomola2021", "bjornsdottir2014", "mellor2020"], p.bars);

    var tongueLevel = levelFor(p.tongue, th);
    var sharp = (mp.edge || 1) >= 1.3 || mp.two_strands || mp.scissor;
    if (sharp) { tongueLevel = Math.max(tongueLevel, p.tongue >= th.lowest_reported ? 2 : 1); }
    if (mp.tongue_pinch >= 0.8 && tongueLevel < 3) { tongueLevel += 0.5; }
    /* A design flag alone marks a risk; "likely" needs the pressure as well. */
    if (p.tongue < th.face_ppt) { tongueLevel = Math.min(tongueLevel, 2); }
    add("tongue", tongueLevel, ["tuomola2019", "manfredi2005", "chifney_hh"], p.tongue);

    var palateLevel = res.palate >= 0.7 ? 3 : res.palate >= 0.4 ? 2 : res.palate >= 0.2 ? 1 : 0;
    add("palate", palateLevel, ["manfredi2005", "spade_wiki", "critdavis"], res.palate);

    var chinLevel = levelFor(p.chin, th);
    if (ch.rigid_ring && chinLevel < 3) { chinLevel += 1; }
    add("chin", f.chinLoad > 0 ? chinLevel : 0, ["cross2017", "met_ringbit"], p.chin);

    var cheekLevel = 0;
    if (p.cheek > 0) { cheekLevel = levelFor(p.cheek, th); }
    if (ch.cheek_prongs) { cheekLevel = Math.max(cheekLevel, 2); }
    if ((ch.pull_through_guard || 0) < 0.5) { cheekLevel = Math.max(cheekLevel, 1); }
    if (f.liftMm >= 20 && noStop) { cheekLevel = Math.max(cheekLevel, 2); }
    add("cheek_teeth", cheekLevel, ["pollaris2025", "hrnz_burrs", "bergh_burr"], p.cheek);

    var trapLevel = (mp.link_pinch || 0) >= 0.5 ? 2 : (mp.link_pinch || 0) >= 0.25 ? 1 : 0;
    if (ch.ring_through_mouthpiece && (ch.lip_pinch || 0) >= 0.4) { trapLevel = Math.max(trapLevel, 1 + Math.round(ch.lip_pinch)); }
    add("pinch", trapLevel, ["pollaris2025", "bitguard_wiki"], ch.lip_pinch || 0);

    if (mech === "jaw-ring" || p.jaw > 0) {
      var jawLevel = Math.max(levelFor(p.jaw, th), mech === "jaw-ring" ? 2 : 1);
      if (ch.free_pivot && (ch.pivot_factor == null || ch.pivot_factor >= 0.8)) {
        jawLevel = p.jaw >= th.face_ppt ? 3 : Math.max(jawLevel, 2);
      }
      add("jaw", jawLevel, ["chifney_hh", "houghton_forum", "dexter_wiki"], p.jaw);
    }

    if (p.nose > 0) {
      add("nose", Math.max(1, levelFor(p.nose, th)), ["myler_hh", "norton_hh"], p.nose);
    }

    var airway = 0;
    if ((mp.tongue_restraint || 0) >= 0.5) { airway = 2; }
    if (mech === "check") { airway = Math.max(airway, 2); }
    if (mp.palate_by_design && mech === "check") { airway = 3; }
    if (airway > 0) { add("airway", airway, ["overcheck_wiki", "wtp_sellers", "critdavis"], mp.tongue_restraint || 0); }

    var behaviour = p.peak >= th.hand_ppt ? 3 : p.peak >= th.face_ppt ? 2 : 1;
    if (mech === "gag-slide" || mech === "gag-lever" || mech === "gag-curb") { behaviour = Math.max(behaviour, 2); }
    add("behaviour", behaviour, ["dyson2018", "manfredi2010", "christensen2011"], p.peak);

    return out;
  }

  /* ---------- Harm index and harm class ---------- */

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  /* Piecewise-linear reading of a pressure against the pain thresholds:
     the curve's knots are catalogue data (kPa, 0–1). */
  function painCurve(curve, kpa) {
    if (kpa <= curve[0][0]) { return curve[0][1]; }
    for (var i = 1; i < curve.length; i++) {
      if (kpa <= curve[i][0]) {
        var x0 = curve[i - 1][0], y0 = curve[i - 1][1], x1 = curve[i][0], y1 = curve[i][1];
        return y0 + (y1 - y0) * (kpa - x0) / (x1 - x0);
      }
    }
    return curve[curve.length - 1][1];
  }

  /* Harm class 0–4: the worst of three readings, never an average.
       pain:   where the peak pressure stands against the thresholds
       injury: the worst lesion risk of injuryRisks (behaviour excluded)
       design: devices whose mechanism is pain (palate spoons, prongs,
               cutting surfaces, scissor mouths)
     Returns the class and the readings that produced it. */
  function harmClass(catalog, res, risks) {
    var th = catalog.thresholds_kpa;
    var rules = catalog.harm.class_rules;
    var peak = res.pressures.peak;
    var painIdx = peak < th.lowest_reported ? 0 : peak < th.face_ppt ? 1 : peak < th.hand_ppt ? 2 : 3;
    var injuryIdx = 0;
    var worst = null;
    for (var i = 0; i < risks.length; i++) {
      var r = risks[i];
      if (rules.exclude.indexOf(r.id) !== -1) { continue; }
      var sev = catalog.harm.injury_severity[r.id] || 0.5;
      var idx = r.level >= 3 ? 3 : r.level === 2 ? (sev >= rules.severity_for_class_2 ? 2 : 1) : r.level;
      if (idx > injuryIdx || (idx === injuryIdx && worst && sev > (catalog.harm.injury_severity[worst.id] || 0.5))) {
        injuryIdx = idx;
        worst = r;
      }
    }
    var mp = res.mp;
    var ch = res.ch;
    var design = null;
    if (mp.palate_by_design) { design = "palate"; }
    else if (ch.cheek_prongs) { design = "prongs"; }
    else if (mp.scissor) { design = "scissor"; }
    else if ((mp.edge || 1) >= rules.design_edge) { design = "edge"; }
    var cls = Math.max(painIdx, injuryIdx, design ? 4 : 0);
    return { cls: cls, painIdx: painIdx, injuryIdx: injuryIdx, worstRisk: worst, design: design, peak: peak };
  }

  /* Harm index 0–100 and its three parts, evaluated at the catalogue's
     reference condition unless overridden. Higher = more harm. */
  function scores(catalog, cheekId, mouthId, settings) {
    var local = clone(settings || {});
    if (local.reinTension == null) { local.reinTension = catalog.defaults.rein_tension; }
    if (local.theta == null) { local.theta = thetaOf(catalog, catalog.defaults.posture); }
    var res = compute(catalog, cheekId, mouthId, local);
    if (!res) { return null; }
    var ch = res.ch;
    var mp = res.mp;
    var H = catalog.harm;
    var mech = res.mechanism;
    var p = res.pressures;

    /* Pain now: the worst tissue, and the average over every loaded tissue. */
    var loaded = ["bars", "tongue", "lips", "chin", "jaw", "cheek", "nose"].filter(function (t) { return p[t] > 0.5; });
    var avg = 0;
    for (var i = 0; i < loaded.length; i++) { avg += painCurve(H.pain_curve, p[loaded[i]]); }
    avg = loaded.length ? avg / loaded.length : 0;
    var pain = 100 * clamp01(H.pain_mix.peak * painCurve(H.pain_curve, p.peak) + H.pain_mix.average * avg);

    /* Injury expected: each likely lesion weighted by its severity. */
    var risks = injuryRisks(catalog, res);
    var maxTerm = 0, sum = 0, sumW = 0, wMax = 0;
    for (var j = 0; j < risks.length; j++) {
      var w = H.injury_severity[risks[j].id] || 0.5;
      maxTerm = Math.max(maxTerm, w * risks[j].level);
      sum += w * risks[j].level;
      sumW += w;
      wMax = Math.max(wMax, w);
    }
    var injury = 100 * clamp01(H.injury_mix.worst * (wMax > 0 ? maxTerm / (3 * wMax) : 0) + H.injury_mix.sum * Math.min(1, H.injury_mix.sum_gain * (sumW > 0 ? sum / (3 * sumW) : 0)));

    /* Loss of control: no stop, no release, an ambiguous signal. */
    var stopTable = { none: 100, bone: 95, cheekpiece: 85, tissue: 70, suspension: 30, chain: 20 };
    var stopScore = stopTable[ch.stop] != null ? stopTable[ch.stop] : 70;
    if (ch.stop === "none" && (ch.slide_limit || 0) > 0) { stopScore = 75; }
    if ((ch.pull_through_guard || 0) < 0.5) { stopScore = Math.min(100, stopScore + 10); }
    if (ch.rigid_ring) { stopScore = Math.min(100, stopScore + 25); }
    if (mech === "check") { stopScore = 100; }

    var conflicting = (mech === "gag-slide" || mech === "gag-lever" || mech === "gag-curb") ? 0.25 : 0;
    if (mech === "check") { conflicting = 0.5; }
    var signalScore = 100 * clamp01(1 - (ch.signal_clarity || 0.8) + conflicting);

    var releaseTable = { direct: 0.95, curb: 0.7, "gag-slide": 0.8, "gag-lever": 0.75, "gag-curb": 0.65, "jaw-ring": 0.6, combination: 0.7, check: 0.0 };
    var release = releaseTable[mech] != null ? releaseTable[mech] : 0.8;
    if (ch.chain_engage_deg && ch.chain_engage_deg < 35) { release -= 0.2; }
    if (ch.rein_mode === "roundings") { release -= 0.15; }
    if (mp.keys) { release -= 0.1; }
    if ((ch.held_high || 0) > 0) { release -= 0.3 * ch.held_high; }
    if ((ch.bit_mass_kg || 0) > 0.4) { release -= 0.1; }
    var releaseScore = 100 * clamp01(1 - release);

    var cw = H.control_weights;
    var control = cw.stop * stopScore + cw.release * releaseScore + cw.signal * signalScore;

    var hw = H.weights;
    var composite = hw.pain * pain + hw.injury * injury + hw.control * control;
    var cls = harmClass(catalog, res, risks);

    return {
      components: { pain: pain, injury: injury, control: control },
      sub: { stop: stopScore, release: releaseScore, signal: signalScore },
      composite: composite,
      harm: cls,
      risks: risks,
      result: res
    };
  }

  /* Every combination, ranked kindest first. `exclude` lists validity
     classes to leave out (for example ["invalid", "theoretical"]). */
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
        rows.push({ cheek: cheekId, mouth: mouthId, validity: v, composite: sc.composite, components: sc.components, harmClass: sc.harm.cls, peak: sc.result.pressures.peak, peakSite: sc.result.pressures.peakSite, group: catalog.cheeks[i].group, tags: catalog.cheeks[i].tags || [] });
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
    injuryRisks: injuryRisks,
    harmClass: harmClass,
    painCurve: painCurve,
    scores: scores,
    rankAll: rankAll,
    thetaOf: thetaOf,
    label: label
  };
});
