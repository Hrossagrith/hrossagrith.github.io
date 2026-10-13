/* Bit mechanics model for the Hrossagrith bit register.
   Pure functions only: no DOM, no markup. Runs in the browser (window.BitModel)
   and in Node (module.exports) so the same code produces the page figures and
   the offline ranking.

   Frame of reference (sagittal plane of the head):
     x̂  along the head, from the mouth towards the poll
     ŷ  perpendicular, from the palate towards the mandible (ventral)
   The rein leaves the bit at an angle theta to x̂; each posture's theta is
   measured on its drawing (tools/bits/postures.py). Rotations of a shank are
   measured by rho: the lower arm swings towards +ŷ.

   Mechanisms (classification by what the parts do, never by the name):
     direct       rein at the mouthpiece, no lever
     curb         lever against a chin restraint (chain, strap or rigid ring)
     gag-lever    lever with no chin restraint (ring stack, sliding shank)
     gag-slide    cheekpiece through the ring: a pulley
     gag-curb     pulley rein and curb rein on one bit
     jaw-ring     ring, bar or cage around the lower jaw
     combination  part of the force routed to nose, chin or jaw plates
     check        constant lift from a harness check rein

   Physics used:
     statics of the shank and mouthpiece as one rigid body; straps and chains
     carry tension only; belt pressure p = T / (R w) (Euler-Eytelwein);
     capstan friction over the wrap angle; contact of a cylinder with a thin
     mucosa layer bonded to bone as an elastic foundation, k = alpha E / h,
     with alpha fitted to plane-strain finite-element runs; the soft tongue as
     a uniaxial elastic body that the mouthpiece presses down onto the bars.
   Pain thresholds are derived per tissue from human pressure-pain thresholds
   and a contact-size law, P* = P_ref (d / d_ref)^(n - 2).

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
  var KPA = 1000; /* N/mm² -> kPa */

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

  function pick(value, fallback) {
    return value != null ? value : fallback;
  }

  /* ---------- Geometry and contact mechanics ---------- */

  /* Width of the contact strip when a cylinder of radius r sinks a depth delta
     into a flat tissue bed (chord of the circle at that depth). */
  function chord(r, delta) {
    var d = Math.min(delta, r);
    return 2 * Math.sqrt(Math.max(0, 2 * r * d - d * d));
  }

  /* Hydraulic diameter of a rectangular contact patch: 4 A / perimeter. It is
     the diameter of a disc for a disc and keeps the perimeter law exact. */
  function patchDiameter(a, b) {
    return a + b > 0 ? 2 * a * b / (a + b) : 0;
  }

  /* Effective radius of a mouthpiece surface. An edge factor e > 1 stands for
     a sharper surface of radius r / e²; e < 1 for a conforming cover. */
  function effectiveRadius(r, edge) {
    var e = edge > 0 ? edge : 1;
    return r / (e * e);
  }

  /* Cylinder of radius R pressed into a thin layer (thickness h, modulus E in
     kPa) bonded to bone, line load q in N/mm: elastic-foundation solution
       k = alpha E / h,  a = (3 q R / (2 k))^(1/3),  mean p = q / (2 a)
     (Johnson 1985, ch. 5; alpha from plane-strain finite-element runs).
     When the layer would be squeezed beyond `bottom` of its thickness the
     contact width is capped and the pressure is a lower bound. */
  function layerContact(q, R, h, E, alpha, bottom) {
    if (q <= 0) {
      return { a: 0, mean: 0, depth: 0, bottomed: false };
    }
    var k = alpha * (E / KPA) / h;
    var a = Math.pow(3 * q * R / (2 * k), 1 / 3);
    var depth = a * a / (2 * R);
    var bottomed = false;
    if (depth > bottom * h) {
      depth = bottom * h;
      a = Math.sqrt(2 * R * depth);
      bottomed = true;
    }
    return { a: a, mean: q / (2 * a) * KPA, depth: depth, bottomed: bottomed };
  }

  /* Uniaxial reaction of the tongue (N) pressed down by delta (mm): the
     contact grows as the tongue wraps the mouthpiece, up to half its girth. */
  function tongueArea(R, delta, width) {
    var w = delta < R ? chord(R, delta) : Math.PI * R;
    return w * width;
  }

  function tongueForce(t, delta) {
    if (delta <= 0) {
      return 0;
    }
    return (t.E / KPA) * (delta / t.T) * tongueArea(t.R, delta, t.width);
  }

  /* Indentation reached by a given tongue load (bisection on the monotone law). */
  function tongueDepth(t, load, maxDepth) {
    if (load <= 0) {
      return 0;
    }
    var lo = 0;
    var hi = maxDepth;
    for (var i = 0; i < 50; i++) {
      var mid = (lo + hi) / 2;
      if (tongueForce(t, mid) > load) { hi = mid; } else { lo = mid; }
    }
    return (lo + hi) / 2;
  }

  /* ---------- Pain thresholds ---------- */

  /* Derived pressure-pain threshold (kPa) of a tissue for a contact patch of
     hydraulic diameter dEq: P* = factor * P_ref * (dEq / d_ref)^(n - 2). */
  function threshold(catalog, tissue, dEq) {
    var th = catalog.thresholds;
    var spec = th.tissues[tissue];
    if (!spec || !(dEq > 0)) {
      return 0;
    }
    var ref = th.references[spec.ref];
    return spec.factor * ref.kpa * Math.pow(dEq / ref.probe_d, th.size_exponent - 2);
  }

  /* ---------- Shank statics ---------- */

  /* Moment balance of one shank about the mouthpiece.
       F      rein tension on this side
       theta  rein angle to x̂ (degrees)
       s, p   lower and upper arm
       rho    rotation of the shank (degrees), lower arm towards +ŷ
       c      unit vector of the chain from the purchase eye (null: no chain)
       kappa  stiffness ratio cheekpiece : chain
     The restoring moment is shared by cheekpiece and chain in proportion to
     stiffness times arm squared (compatibility of a small rotation).
     Returns chain tension C, cheekpiece tension T and the moment. */
  function shankBalance(F, theta, s, p, rho, c, kappa) {
    var moment = F * s * Math.sin((theta + rho) * DEG);
    var eye = { x: p * Math.cos(rho * DEG), y: -p * Math.sin(rho * DEG) };
    var armT = p * Math.sin(rho * DEG);
    var armC = c ? eye.x * c.y - eye.y * c.x : 0;
    if (armC < 0) { armC = 0; }
    var wT = kappa * armT * armT;
    var wC = armC * armC;
    var lambda = wT + wC > 0 ? wT / (wT + wC) : 1;
    var T = armT > 0 ? lambda * moment / armT : 0;
    var C = armC > 0 ? (1 - lambda) * moment / armC : 0;
    return { moment: moment, T: T, C: C, lambda: lambda, armC: armC, armT: armT, eye: eye };
  }

  /* Unit vector from the purchase eye to the chin groove. */
  function chainDirection(catalog, p, rho) {
    var g = catalog.mouth.chin_groove_point;
    var ex = p * Math.cos(rho * DEG);
    var ey = -p * Math.sin(rho * DEG);
    var dx = g[0] - ex;
    var dy = g[1] - ey;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / len, y: dy / len };
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
    var mechanism = cheek.mechanism;

    var F = settings.reinTension != null ? settings.reinTension : defaults.rein_tension;
    var theta = settings.theta != null ? settings.theta : thetaOf(catalog, defaults.posture);
    var postureId = settings.posture || postureOfTheta(catalog, theta);
    if (mechanism === "check") {
      /* A check rein runs up the face to the harness saddle: the lift is along
         the head whatever the carriage, and the force is the horse's own push. */
      theta = defaults.check.theta;
    }
    var d = settings.diameter != null ? settings.diameter : mp.d;
    var bitSpace = settings.bitSpace != null ? settings.bitSpace : mouth.bit_space;
    var chinGuard = settings.chinGuard != null ? settings.chinGuard : (ch.chin_guarded != null ? ch.chin_guarded : defaults.chin_guard);
    var curbShare = settings.curbReinShare != null ? settings.curbReinShare : defaults.curb_rein_share;
    var bitWidth = settings.bitWidth != null ? settings.bitWidth : mouth.mouth_width + mouth.bit_width_allowance;
    var r = d / 2;
    var doubleBridle = !!cheek.double_bridle;

    /* Shares of the rein force that never reach the mouthpiece (combination bits). */
    var shareNose = ch.share_nose || 0;
    var shareChinStrap = ch.share_chin || 0;
    var shareJaw = ch.share_jaw || 0;
    var mouthFraction = Math.max(0, 1 - shareNose - shareChinStrap - shareJaw);

    /* Rein split. F is the whole tension the hand applies on one side, for
       every mechanism, so devices are compared at the same hand. */
    var Fdirect = 0;
    var Flever = 0;
    var Fpulley = 0;
    var Fbradoon = 0;
    var mode = ch.rein_mode || "curb";
    var jawClamp = 0;
    if (mechanism === "jaw-ring") {
      /* Ring and mouthpiece form one closed body around the jaw: the rein acts
         on the mouthpiece in full, and the ring adds a clamp that squeezes the
         jaw between the ring (underneath) and the mouthpiece (on the bars).
         The clamp is an internal force set by the fit of the ring. */
      jawClamp = pick(ch.jaw_clamp, defaults.jaw_clamp);
      Fdirect = F;
    } else if (mechanism === "direct" || mechanism === "check") {
      Fdirect = F;
    } else if (mechanism === "gag-slide") {
      Fpulley = F;
    } else if (mechanism === "gag-curb") {
      Fpulley = F * (1 - curbShare);
      Flever = F * curbShare;
    } else if (mechanism === "combination") {
      if ((ch.shank || 0) > 0 && ch.chain) {
        Flever = F * mouthFraction;
      } else {
        Fdirect = F * mouthFraction;
      }
    } else if (doubleBridle) {
      /* Curb and bradoon: two mouthpieces, the hand's tension split between them. */
      Flever = F * curbShare;
      Fbradoon = F * (1 - curbShare);
    } else if (mode === "two") {
      Fdirect = F * (1 - curbShare);
      Flever = F * curbShare;
    } else if (mode === "roundings") {
      Fdirect = F * defaults.roundings_direct_share;
      Flever = F * (1 - defaults.roundings_direct_share);
    } else {
      Flever = F;
    }
    /* Side plates against the face press when the bit is drawn sideways; they
       do not take rein tension off the mouthpiece. */
    var jawPlates = ch.jaw_plates ? pick(ch.jaw_plate_share, defaults.jaw_plate_share) : 0;
    if (Flever > 0 && (ch.shank || 0) === 0 && !ch.d_arc_offset && mechanism !== "gag-curb") {
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
    var cDir = null;
    var lambda = 0;

    sumX += Fdirect * Math.cos(theta * DEG);
    sumY += Fdirect * Math.sin(theta * DEG);

    var s = ch.d_arc_offset || ch.shank || 0;
    var p = ch.purchase || 0;
    var hasChainLever = (mechanism === "curb" || mechanism === "gag-curb" || ((mechanism === "gag-lever" || mechanism === "combination") && ch.chain)) && s > 0 && p > 0;
    var kappa = defaults.cheekpiece_stiffness_ratio;

    if (hasChainLever) {
      /* For a plain Kimblewick the rein ring slides on the D; a frictionless
         ring settles where the rein line passes through the centre of the D's
         arc, so the lever arm is the distance to that centre (d_arc_offset). */
      leverRatio = s / p;
      rho = pick(ch.chain_engage_deg, defaults.chain_engage_deg);
      cDir = chainDirection(catalog, p, rho);
      var bal = shankBalance(Flever, theta, s, p, rho, cDir, kappa);
      C = bal.C;
      T += bal.T;
      lambda = bal.lambda;
      sumX += Flever * Math.cos(theta * DEG) + C * cDir.x + bal.T;
      sumY += Flever * Math.sin(theta * DEG) + C * cDir.y;
    } else if (mechanism === "gag-lever" || (mechanism === "combination" && s > 0)) {
      /* Ring stack or sliding shank without a chain. Nothing stops the
         rotation except the cheekpiece, so the shank swings until the lips
         stop the mouthpiece rising: a floating fulcrum. Sliding of the
         mouthpiece along the shank adds lift but no rotation. */
      var gag = defaults.gag;
      leverRatio = p > 0 ? s / p : 0;
      var travel = settings.lipTravel != null ? settings.lipTravel : mouth.commissure_to_premolar;
      var rhoLip = p > 0 && travel < p ? Math.acos(1 - travel / p) / DEG : 90;
      var rhoAlign = 180 - theta - gag.align_margin;
      rho = Math.max(gag.rho_min, Math.min(rhoLip, rhoAlign, pick(ch.rho_max, gag.rho_max)));
      var Fl = Flever > 0 ? Flever : Fdirect;
      if (s > 0 && p > 0) {
        var balG = shankBalance(Fl, theta, s, p, rho, null, kappa);
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
      liftMm = Math.min(mouth.commissure_to_premolar + gag.lift_extra, p * (1 - Math.cos(rho * DEG)) + (ch.mouthpiece_slide || 0));
    }

    if (Fpulley > 0) {
      /* The cheekpiece cord runs through the ring to the rein: the ring is a
         pulley. The cord turns from the poll direction to the rein direction,
         a wrap of pi - theta; friction reduces the upper strand's tension. */
      var mu = pick(ch.cord_friction, defaults.gag.cord_friction);
      var wrap = Math.max(0, Math.min(Math.PI, Math.PI - theta * DEG));
      cordUp = Fpulley * Math.exp(-mu * wrap);
      T += cordUp;
      sumX += Fpulley * Math.cos(theta * DEG) + cordUp;
      sumY += Fpulley * Math.sin(theta * DEG);
      var limit = ch.slide_limit || 0;
      liftMm = Math.max(liftMm, limit > 0 ? limit : mouth.commissure_to_premolar);
    }

    if (mechanism === "check") {
      liftMm = Math.min(mouth.commissure_to_premolar, defaults.check.lift_base + F * defaults.check.lift_per_newton);
    } else if (liftMm > 0 && mouth.lift_full_tension > 0) {
      /* The lips resist the rise: the full travel is taken to be reached at
         the reference contact and proportionally less below it. */
      liftMm = liftMm * Math.min(1, F / mouth.lift_full_tension);
    }

    /* Amplification: force onto tongue and bars compared with the rein's own
       component in that direction. */
    var reinPress = (Fdirect + Flever + Fpulley) * Math.sin(theta * DEG);
    var amplification = reinPress > 0 ? Math.max(0, sumY) / reinPress : 1;

    /* Straps carry tension only. A component towards the poll (+x̂) drives the
       mouthpiece into the corners of the mouth whatever the cheek; only a
       component towards the front of the mouth (sumX < 0) is held by the
       cheekpieces and passes to the poll. A cheek held high by its keepers
       adds its preload to both. */
    var preload = (ch.held_high || 0) * defaults.held_high_preload;
    var lipPerSide = Math.max(0, sumX) + preload;
    var bridlePerSide = Math.max(0, -sumX) + preload + (ch.poll_transfer || 0) * F;

    /* Weight of the bit: its component along ŷ depends on how the head is carried. */
    var posture = byId(catalog.postures, postureId);
    var headAxis = posture && posture.head_axis_deg != null ? posture.head_axis_deg : theta;
    var restingWeight = defaults.bit_weight_on_mouth * (ch.bit_mass_kg || 0) * G * Math.cos(headAxis * DEG);
    /* The jaw-ring clamp presses the mouthpiece onto the bars as hard as the
       ring presses under the jaw. */
    var clampLoad = 2 * F * jawClamp;
    var pressTotal = Math.max(0, 2 * Math.max(0, sumY) + restingWeight + clampLoad);
    var pressTowardPalate = 2 * Math.max(0, -sumY) + Math.max(0, -restingWeight);

    /* ---------- Tongue and bars ---------- */

    var edge = mp.edge || 1;
    if (ch.free_pivot) {
      /* A mouthpiece that pivots freely on its ring presents its edge to the
         tongue when the lead is pulled. */
      edge = edge * (1 + defaults.free_pivot_edge_gain * pick(ch.pivot_factor, 1));
    }
    var Reff = effectiveRadius(r, edge);
    var contactFraction = mp.contact_fraction || 1;
    var conformFactor = defaults.conform_base + (1 - defaults.conform_base) * pick(mp.conform, 0.5);
    var secondBarD = ch.second_bar_d || 0;
    var bradoonD = doubleBridle ? defaults.bradoon_d : 0;
    var totalThickness = d + bradoonD + secondBarD;

    var tongue = {
      E: mouth.tongue_modulus_kpa,
      T: mouth.tongue_thickness,
      R: Reff,
      width: mouth.tongue_contact_width * contactFraction * conformFactor * (mp.concentration || 1) * pick(mp.tongue_engagement, 1)
    };
    var plateArea = 0;
    if (mp.plate) {
      plateArea += edge < 1.2 ? mouth.plate_area : mouth.plate_area_edged;
    }
    if (mp.plate_under) {
      plateArea += mouth.plate_under_area;
    }
    var hp = mouth.tongue_above_bars;
    /* A mouthpiece thicker than the space above the tongue is pressed into it by
       the palate before any rein tension: a static load on the tongue. */
    var crowd = Math.max(0, totalThickness - bitSpace);
    var tonguePre = tongueForce(tongue, Math.min(crowd, hp));
    var tongueCap = tongueForce(tongue, hp);
    var mainFraction = 1 - (ch.second_bar_share || 0);
    var ventral = pressTotal * mainFraction;
    var tongueLoad = Math.max(tonguePre, Math.min(ventral, tongueCap));
    var barsTotal = Math.max(0, ventral - tongueCap);
    var tongueDelta = tongueDepth(tongue, tongueLoad, hp);
    var tongueContactW = tongueDelta < Reff ? chord(Reff, tongueDelta) : Math.PI * Reff;
    var tArea = tongueArea(Reff, tongueDelta, tongue.width) + plateArea;
    var pTongue = tArea > 0 && tongueLoad > 0 ? tongueLoad / tArea * KPA : 0;

    var crest = mouth.bar_width * contactFraction;
    var barLoadPerSide = barsTotal / 2;
    var barContact = layerContact(barLoadPerSide / crest, Reff, mouth.bar_mucosa, mouth.mucosa_modulus_kpa, mouth.winkler_alpha, mouth.bottom_out);
    var pBar = barContact.mean;
    var barArea = 2 * barContact.a * crest;
    var barPatch = patchDiameter(2 * barContact.a, crest);

    /* A second thin bar (Norton pattern) takes its share of the ventral load on its own strip. */
    var pSecond = 0;
    var secondContact = null;
    if (secondBarD > 0) {
      var secondLoadPerSide = pressTotal * (ch.second_bar_share || 0) / 2;
      var secondCrest = mouth.bar_width * (ch.second_bar_contact || 1);
      var r2 = effectiveRadius(secondBarD / 2, ch.second_bar_edge || 1);
      secondContact = layerContact(secondLoadPerSide / secondCrest, r2, mouth.bar_mucosa, mouth.mucosa_modulus_kpa, mouth.winkler_alpha, mouth.bottom_out);
      pSecond = secondContact.mean;
      if (pSecond > pBar) {
        pBar = pSecond;
        barPatch = patchDiameter(2 * secondContact.a, secondCrest);
        barArea = 2 * secondContact.a * secondCrest;
      }
    }

    /* Bradoon of a double bridle: a thin direct bit on its own strip of the bars. */
    var bradoon = null;
    if (Fbradoon > 0) {
      var bY = 2 * Fbradoon * Math.sin(theta * DEG);
      var bToBars = Math.max(0, bY - tongueCap);
      var bContact = layerContact(bToBars / 2 / mouth.bar_width, bradoonD / 2, mouth.bar_mucosa, mouth.mucosa_modulus_kpa, mouth.winkler_alpha, mouth.bottom_out);
      bradoon = { load: bY, bars: bContact.mean, a: bContact.a, lips: Fbradoon * Math.max(0, Math.cos(theta * DEG)) };
      if (bContact.mean > pBar) {
        pBar = bContact.mean;
        barPatch = patchDiameter(2 * bContact.a, mouth.bar_width);
        barArea = 2 * bContact.a * mouth.bar_width;
      }
      pressTotal += bY;
      lipPerSide += bradoon.lips;
    }

    /* ---------- Lips, chin, poll and the outside of the face ---------- */

    var lipW = chord(Reff, mouth.lip_indent);
    var lipLen = mouth.lip_contact_length * contactFraction;
    var lipArea = lipW * lipLen;
    var pLip = lipArea > 0 ? lipPerSide / lipArea * KPA : 0;

    /* Chain or strap in the chin groove: belt pressure p = C / (R w); the
       resultant on the jaw is the two strands, 2 C. */
    var chainW = chinGuard ? mouth.chain_guard_width : mouth.chain_width;
    var chinLoad = 2 * C + shareChinStrap * 2 * F;
    var chinPatch = 0;
    var pChin = 0;
    var chinArea = 0;
    if (ch.chin_area && C > 0) {
      chinArea = ch.chin_area;
      pChin = 2 * C / chinArea * KPA;
      chinPatch = Math.sqrt(chinArea);
    } else if (C > 0) {
      pChin = C / (mouth.chin_groove_radius * chainW) * KPA;
      chinArea = chainW * mouth.chin_groove_radius * mouth.chin_wrap_rad;
      chinPatch = patchDiameter(chainW, mouth.chin_groove_radius * mouth.chin_wrap_rad);
    }
    if (shareChinStrap > 0) {
      var strapP = shareChinStrap * F / (mouth.chin_groove_radius * mouth.chain_guard_width) * KPA;
      pChin += strapP;
      if (!chinPatch) {
        chinArea = mouth.chain_guard_width * mouth.chin_groove_radius * mouth.chin_wrap_rad;
        chinPatch = patchDiameter(mouth.chain_guard_width, mouth.chin_groove_radius * mouth.chin_wrap_rad);
      }
    }

    /* Headpiece over the poll: belt pressure from the cheekpiece tension. */
    var pollTension = T + bridlePerSide;
    var pollLoad = 2 * pollTension;
    var pPoll = pollTension / (mouth.poll_radius * mouth.headpiece_width) * KPA;
    var pollPatch = patchDiameter(mouth.headpiece_width, mouth.poll_radius * Math.PI / 2);

    var cheekLoad = (ch.cheek_squeeze || 0) * F;
    var cheekArea = ch.cheek_prongs ? mouth.cheek_area_prongs : mouth.cheek_area_flat;
    var pCheek = cheekLoad / cheekArea * KPA;

    var jawLoad = 2 * F * jawClamp + F * jawPlates + shareJaw * 2 * F;
    var jawArea = ch.jaw_area || mouth.jaw_area;
    var pJaw = jawLoad / jawArea * KPA;

    var noseLoad = shareNose * 2 * F;
    var noseArea = ch.nose_area || mouth.nose_area;
    var pNose = noseLoad / noseArea * KPA;

    /* ---------- Palate: a risk index, not a pressure ---------- */

    var pi = catalog.palate_index;
    var palate = mp.palate || 0;
    if (ch.mouthpiece_rotates_with_shank && (hasChainLever || mechanism === "gag-lever")) {
      palate = Math.min(1, palate * Math.min(pi.rotation_cap, Math.pow(Math.max(rho, pi.rotation_floor_deg) / pi.rotation_reference_deg, pi.rotation_exponent)));
    }
    if (mechanism === "direct" || mechanism === "gag-slide" || mechanism === "jaw-ring" || mechanism === "combination") {
      /* A high hand lifts a jointed mouthpiece; a bit wider than the mouth
         lets the joint rise further towards the palate. */
      var oversize = Math.max(0, (bitWidth - mouth.mouth_width - mouth.bit_width_allowance) / pi.oversize_scale);
      palate = Math.min(1, palate * (theta < pi.high_hand_theta ? pi.high_hand_factor : 1) * (mp.joints === 1 ? 1 + oversize : 1));
    }
    if (pressTowardPalate > 0 && F > 0) {
      palate = Math.min(1, palate + pressTowardPalate / (pi.push_scale * F));
    }
    if (mp.palate_by_design) {
      palate = Math.max(palate, mechanism === "check" ? pi.by_design_check : pi.by_design);
    }

    /* ---------- Thresholds and ratios ---------- */

    var pressures = { tongue: pTongue, bars: pBar, lips: pLip, chin: pChin, poll: pPoll, cheek: pCheek, jaw: pJaw, nose: pNose, secondBar: pSecond };
    var patches = {
      tongue: patchDiameter(tongueContactW, tongue.width),
      bars: barPatch,
      lips: patchDiameter(lipW, lipLen),
      chin: chinPatch,
      poll: pollPatch,
      cheek: Math.sqrt(cheekArea),
      jaw: Math.sqrt(jawArea),
      nose: Math.sqrt(noseArea)
    };
    var thresholds = {};
    var ratios = {};
    ["bars", "tongue", "lips", "chin", "jaw", "cheek", "nose", "poll"].forEach(function (site) {
      thresholds[site] = threshold(catalog, site, patches[site]);
      ratios[site] = thresholds[site] > 0 ? pressures[site] / thresholds[site] : 0;
    });
    var peakRatio = 0;
    var peakSite = "tongue";
    ["bars", "tongue", "lips", "chin", "jaw", "cheek", "nose"].forEach(function (site) {
      if (ratios[site] > peakRatio) {
        peakRatio = ratios[site];
        peakSite = site;
      }
    });
    pressures.peak = pressures[peakSite];
    pressures.peakSite = peakSite;
    pressures.peakRatio = peakRatio;

    /* ---------- Stop analysis ---------- */

    var stop = {
      type: ch.stop,
      slideLimit: ch.slide_limit || 0,
      liftMm: liftMm,
      pullThroughGuard: ch.pull_through_guard || 0,
      rotationGuard: ch.rotation_guard || 0,
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
      inputs: { F: F, theta: theta, d: d, bitSpace: bitSpace, bitWidth: bitWidth, chinGuard: chinGuard, curbShare: curbShare, doubleBridle: doubleBridle, posture: postureId },
      forces: {
        Fdirect: Fdirect, Flever: Flever, Fpulley: Fpulley, Fbradoon: Fbradoon,
        chain: C, cheekpiece: T, cordUp: cordUp, lambda: lambda,
        sumX: sumX, sumY: sumY,
        pressTotal: pressTotal, lipPerSide: lipPerSide, bridlePerSide: bridlePerSide,
        chinLoad: chinLoad, pollLoad: pollLoad, cheekLoad: cheekLoad, jawLoad: jawLoad, noseLoad: noseLoad,
        tongueLoad: tongueLoad, tonguePreload: tonguePre, barLoadPerSide: barLoadPerSide,
        barsShare: ventral > 0 ? barsTotal / ventral : 0,
        restingWeight: restingWeight,
        leverRatio: leverRatio, amplification: amplification, rho: rho, liftMm: liftMm,
        hasChainLever: hasChainLever
      },
      contact: {
        tongueDepth: tongueDelta, barHalfWidth: barContact.a, barDepth: barContact.depth,
        bottomed: barContact.bottomed || !!(secondContact && secondContact.bottomed), effectiveRadius: Reff, edge: edge
      },
      areas: { tongue: tArea, bar: barArea, lip: lipArea, chin: chinArea, poll: mouth.headpiece_width * mouth.poll_radius * Math.PI / 2, cheek: cheekArea, jaw: jawArea, nose: noseArea },
      pressures: pressures,
      thresholds: thresholds,
      ratios: ratios,
      patches: patches,
      bradoon: bradoon,
      palate: palate,
      crowding: crowd,
      totalThickness: totalThickness,
      stop: stop,
      validity: validity(catalog, cheekId, mouthId),
      pairing: pairing(catalog, cheekId, mouthId)
    };
  }

  function thetaOf(catalog, postureId) {
    var posture = byId(catalog.postures, postureId);
    return posture ? posture.theta : byId(catalog.postures, catalog.defaults.posture).theta;
  }

  function postureOfTheta(catalog, theta) {
    var best = null;
    for (var i = 0; i < catalog.postures.length; i++) {
      var posture = catalog.postures[i];
      if (!best || Math.abs(posture.theta - theta) < Math.abs(best.theta - theta)) {
        best = posture;
      }
    }
    return best ? best.id : catalog.defaults.posture;
  }

  /* Peak pressure ratio at every catalogued posture for the same rein
     tension (a static model: in practice tension changes with carriage). The
     posture with the lowest ratio is the device's mechanical bias only when it
     is clearly lower than the next one; differences inside the model's margin
     are reported as no bias (null). */
  function landscape(catalog, cheekId, mouthId, settings) {
    var out = [];
    var best = null;
    var margin = catalog.defaults.bias_margin != null ? catalog.defaults.bias_margin : 0;
    for (var i = 0; i < catalog.postures.length; i++) {
      var posture = catalog.postures[i];
      var local = clone(settings || {});
      local.theta = posture.theta;
      local.posture = posture.id;
      var res = compute(catalog, cheekId, mouthId, local);
      var entry = {
        id: posture.id, theta: posture.theta,
        peak: res.pressures.peak, ratio: res.pressures.peakRatio, site: res.pressures.peakSite,
        tongue: res.pressures.tongue, bars: res.pressures.bars, lips: res.pressures.lips, chin: res.pressures.chin,
        lift: res.forces.liftMm, palate: res.palate
      };
      out.push(entry);
      if (!best || entry.ratio < best.ratio) {
        best = entry;
      }
    }
    var runnerUp = null;
    for (var k = 0; k < out.length; k++) {
      if (best && out[k].id !== best.id && (!runnerUp || out[k].ratio < runnerUp.ratio)) {
        runnerUp = out[k];
      }
    }
    var clear = best && runnerUp && runnerUp.ratio > 0 && (runnerUp.ratio - best.ratio) / runnerUp.ratio >= margin;
    /* Rein tension and the rein's angle both change with carriage, and neither
       is measured per carriage, so a preference is reported only when the
       catalogue allows it. */
    var report = !!catalog.defaults.report_posture_bias;
    return { postures: out, bias: report && clear ? best.id : null, lowest: best ? best.id : null };
  }

  /* ---------- Injury risks ---------- */

  /* Level 0–3 from the ratio of pressure to the tissue's derived threshold. */
  function levelFor(ratio, breaks) {
    if (ratio >= breaks[2]) { return 3; }
    if (ratio >= breaks[1]) { return 2; }
    if (ratio >= breaks[0]) { return 1; }
    return 0;
  }

  /* Likely issues for the horse, each with a level 0–3 and the sources that
     describe the lesion or mechanism. Levels are read from the model's own
     pressure ratios and flags; the sources are catalogue ids in text.json. */
  function injuryRisks(catalog, res) {
    var rules = catalog.harm.risk_rules;
    var breaks = rules.injury_ratio_breaks;
    var ch = res.ch;
    var mp = res.mp;
    var q = res.ratios;
    var f = res.forces;
    var mech = res.mechanism;
    var out = [];

    function add(id, level, sources, value) {
      out.push({ id: id, level: Math.max(0, Math.min(3, Math.floor(level))), sources: sources, value: value });
    }

    var noStop = ch.stop === "none" || ch.stop === "cheekpiece" || ch.stop === "tissue";
    var lipLevel = levelFor(q.lips, breaks);
    if (noStop && f.liftMm >= rules.lift_mark) { lipLevel = Math.max(lipLevel, 2); }
    if (ch.stop === "none" && f.liftMm >= rules.lift_severe && q.lips >= breaks[0]) { lipLevel = 3; }
    add("commissure", lipLevel, ["tuomola2019", "uldahl2019", "tuomola2021event"], res.pressures.lips);

    var barLevel = levelFor(q.bars, breaks);
    if ((mp.contact_fraction || 1) < rules.partial_contact && barLevel < 3) { barLevel += 1; }
    if (mp.joints === 0 && !mp.port_height && barLevel < 3 && q.bars >= breaks[0]) { barLevel += 1; }
    add("bars", barLevel, ["tuomola2021", "bjornsdottir2014", "johnson2002", "cook2011"], res.pressures.bars);

    var tongueLevel = levelFor(q.tongue, breaks);
    var sharp = (mp.edge || 1) >= rules.sharp_edge || mp.two_strands || mp.scissor;
    if (sharp) { tongueLevel = Math.max(tongueLevel, q.tongue >= breaks[0] ? 2 : 1); }
    if (mp.tongue_pinch >= rules.tongue_pinch && tongueLevel < 3) { tongueLevel += 1; }
    /* A design flag alone marks a risk; "likely" needs the pressure as well. */
    if (q.tongue < breaks[1]) { tongueLevel = Math.min(tongueLevel, 2); }
    add("tongue", tongueLevel, ["tuomola2019", "engelke2002pem", "mellor2020"], res.pressures.tongue);

    var pl = rules.palate_levels;
    var palateLevel = res.palate >= pl[2] ? 3 : res.palate >= pl[1] ? 2 : res.palate >= pl[0] ? 1 : 0;
    add("palate", palateLevel, ["engelke2002pem", "manfredi2005"], res.palate);

    var chinLevel = levelFor(q.chin, breaks);
    if (ch.rigid_ring && chinLevel < 3) { chinLevel += 1; }
    add("chin", f.chinLoad > 0 ? chinLevel : 0, ["cross2017"], res.pressures.chin);

    var cheekLevel = 0;
    if (res.pressures.cheek > 0) { cheekLevel = levelFor(q.cheek, breaks); }
    if (ch.cheek_prongs) { cheekLevel = Math.max(cheekLevel, 2); }
    if ((ch.pull_through_guard || 0) < 0.5) { cheekLevel = Math.max(cheekLevel, 1); }
    if (f.liftMm >= rules.lift_severe && noStop) { cheekLevel = Math.max(cheekLevel, 2); }
    add("cheek_teeth", cheekLevel, ["pollaris2025", "tuomola2019", "bjornsdottir2014"], res.pressures.cheek);

    var lp = rules.link_pinch_levels;
    var trapLevel = (mp.link_pinch || 0) >= lp[1] ? 2 : (mp.link_pinch || 0) >= lp[0] ? 1 : 0;
    if (ch.ring_through_mouthpiece && (ch.lip_pinch || 0) >= rules.lip_pinch_min) { trapLevel = Math.max(trapLevel, 1 + Math.round(ch.lip_pinch)); }
    add("pinch", trapLevel, ["pollaris2025"], ch.lip_pinch || 0);

    if (mech === "jaw-ring" || res.pressures.jaw > 0) {
      var jawLevel = Math.max(levelFor(q.jaw, breaks), mech === "jaw-ring" ? 2 : 1);
      if (ch.free_pivot && (ch.pivot_factor == null || ch.pivot_factor >= rules.pivot_full)) {
        jawLevel = q.jaw >= breaks[1] ? 3 : Math.max(jawLevel, 2);
      }
      add("jaw", jawLevel, [], res.pressures.jaw);
    }

    if (res.pressures.nose > 0) {
      add("nose", Math.max(1, levelFor(q.nose, breaks)), ["perezmanrique2020"], res.pressures.nose);
    }

    var airway = 0;
    if ((mp.tongue_restraint || 0) >= rules.tongue_restraint) { airway = 2; }
    if (mech === "check") { airway = Math.max(airway, 2); }
    if (mp.palate_by_design && mech === "check") { airway = 3; }
    if (airway > 0) { add("airway", airway, [], mp.tongue_restraint || 0); }

    var behaviour = res.pressures.peakRatio >= breaks[2] ? 3 : res.pressures.peakRatio >= breaks[1] ? 2 : 1;
    if (mech === "gag-slide" || mech === "gag-lever" || mech === "gag-curb") { behaviour = Math.max(behaviour, 2); }
    add("behaviour", behaviour, ["dyson2018", "christensen2011", "piccolo2019"], res.pressures.peakRatio);

    return out;
  }

  /* ---------- Harm index and harm class ---------- */

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  /* Piecewise-linear reading of a pressure ratio: the curve's knots are
     catalogue data (ratio, 0–1). */
  function painCurve(curve, ratio) {
    if (ratio <= curve[0][0]) { return curve[0][1]; }
    for (var i = 1; i < curve.length; i++) {
      if (ratio <= curve[i][0]) {
        var x0 = curve[i - 1][0], y0 = curve[i - 1][1], x1 = curve[i][0], y1 = curve[i][1];
        return y0 + (y1 - y0) * (ratio - x0) / (x1 - x0);
      }
    }
    return curve[curve.length - 1][1];
  }

  /* Rein tension per side (N) at which the most loaded tissue reaches its
     derived pain threshold, found by bisection on a logarithmic scale. */
  function thresholdTension(catalog, cheekId, mouthId, settings) {
    var search = catalog.harm.class_rules.tension_search;
    var lo = Math.log(search[0]);
    var hi = Math.log(search[1]);
    var local = clone(settings || {});
    local.reinTension = search[0];
    if (compute(catalog, cheekId, mouthId, local).pressures.peakRatio >= 1) { return search[0]; }
    local.reinTension = search[1];
    if (compute(catalog, cheekId, mouthId, local).pressures.peakRatio < 1) { return Infinity; }
    for (var i = 0; i < search[2]; i++) {
      var mid = (lo + hi) / 2;
      local.reinTension = Math.exp(mid);
      if (compute(catalog, cheekId, mouthId, local).pressures.peakRatio >= 1) { hi = mid; } else { lo = mid; }
    }
    return Math.exp((lo + hi) / 2);
  }

  /* Harm class 0–4.
       pain:   the rein tension at which the most loaded tissue reaches its
               derived pain threshold, read against measured rein tensions
               (class_rules.tension_breaks, highest first)
       design: devices built around a point load (palate spoons, prongs,
               cutting surfaces, scissor mouths) are class 4
     Lesion risks are reported beside the class, not folded into it: pain and
     injury are different things. Returns the class and its readings. */
  function harmClass(catalog, res, risks, fStar) {
    var rules = catalog.harm.class_rules;
    var breaks = rules.tension_breaks;
    var painIdx = 0;
    for (var k = 0; k < breaks.length; k++) {
      if (fStar < breaks[k]) { painIdx = k + 1; }
    }
    var sevDefault = catalog.harm.risk_rules.default_severity;
    var worst = null;
    for (var i = 0; i < risks.length; i++) {
      var r = risks[i];
      if (rules.exclude.indexOf(r.id) !== -1) { continue; }
      var sev = pick(catalog.harm.injury_severity[r.id], sevDefault);
      if (!worst || r.level > worst.level || (r.level === worst.level && sev > pick(catalog.harm.injury_severity[worst.id], sevDefault))) {
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
    var cls = design ? 4 : painIdx;
    return { cls: cls, painIdx: painIdx, worstRisk: worst, design: design, peak: res.pressures.peak, ratio: res.pressures.peakRatio, fStar: fStar };
  }

  /* Harm index 0–100 and its three parts, evaluated at the catalogue's
     reference condition unless overridden. Higher = more harm. */
  function scores(catalog, cheekId, mouthId, settings) {
    var local = clone(settings || {});
    if (local.reinTension == null) { local.reinTension = catalog.defaults.rein_tension; }
    if (local.theta == null) {
      local.theta = thetaOf(catalog, catalog.defaults.posture);
      local.posture = catalog.defaults.posture;
    }
    var res = compute(catalog, cheekId, mouthId, local);
    if (!res) { return null; }
    var ch = res.ch;
    var mp = res.mp;
    var H = catalog.harm;
    var K = H.control;
    var mech = res.mechanism;
    var q = res.ratios;
    var p = res.pressures;

    /* Pain now: the worst tissue, and the average over every loaded tissue. */
    var loaded = ["bars", "tongue", "lips", "chin", "jaw", "cheek", "nose"].filter(function (t) { return p[t] > K.loaded_kpa; });
    var avg = 0;
    for (var i = 0; i < loaded.length; i++) { avg += painCurve(H.pain_curve, q[loaded[i]]); }
    avg = loaded.length ? avg / loaded.length : 0;
    var pain = 100 * clamp01(H.pain_mix.peak * painCurve(H.pain_curve, p.peakRatio) + H.pain_mix.average * avg);

    /* Injury expected: each likely lesion weighted by its severity. */
    var risks = injuryRisks(catalog, res);
    var maxTerm = 0, sum = 0, sumW = 0, wMax = 0;
    for (var j = 0; j < risks.length; j++) {
      var w = pick(H.injury_severity[risks[j].id], H.risk_rules.default_severity);
      maxTerm = Math.max(maxTerm, w * risks[j].level);
      sum += w * risks[j].level;
      sumW += w;
      wMax = Math.max(wMax, w);
    }
    var injury = 100 * clamp01(H.injury_mix.worst * (wMax > 0 ? maxTerm / (3 * wMax) : 0) + H.injury_mix.sum * Math.min(1, H.injury_mix.sum_gain * (sumW > 0 ? sum / (3 * sumW) : 0)));

    /* Loss of control: no stop, no release, an ambiguous signal. */
    var stopScore = K.stop[ch.stop] != null ? K.stop[ch.stop] : K.stop_default;
    if (ch.stop === "none" && (ch.slide_limit || 0) > 0) { stopScore = K.stop_none_limited; }
    if ((ch.pull_through_guard || 0) < K.weak_guard) { stopScore = Math.min(100, stopScore + K.weak_guard_add); }
    if (ch.rigid_ring) { stopScore = Math.min(100, stopScore + K.rigid_ring_add); }
    if (mech === "check") { stopScore = 100; }

    var conflicting = (mech === "gag-slide" || mech === "gag-lever" || mech === "gag-curb") ? K.conflicting.gag : 0;
    if (mech === "check") { conflicting = K.conflicting.check; }
    var signalScore = 100 * clamp01(1 - pick(ch.signal_clarity, K.signal_default) + conflicting);

    var release = K.release[mech] != null ? K.release[mech] : K.release_default;
    if (ch.chain_engage_deg && ch.chain_engage_deg < K.release_quick_chain_deg) { release -= K.release_quick_chain; }
    if (ch.rein_mode === "roundings") { release -= K.release_roundings; }
    if (mp.keys) { release -= K.release_keys; }
    if ((ch.held_high || 0) > 0) { release -= K.release_held_high * ch.held_high; }
    if ((ch.bit_mass_kg || 0) > K.release_heavy_kg) { release -= K.release_heavy; }
    var releaseScore = 100 * clamp01(1 - release);

    var cw = H.control_weights;
    var control = cw.stop * stopScore + cw.release * releaseScore + cw.signal * signalScore;

    var hw = H.weights;
    var composite = hw.pain * pain + hw.injury * injury + hw.control * control;
    var cls = harmClass(catalog, res, risks, thresholdTension(catalog, cheekId, mouthId, local));

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
        rows.push({ cheek: cheekId, mouth: mouthId, validity: v, composite: sc.composite, components: sc.components, harmClass: sc.harm.cls, peak: sc.result.pressures.peak, ratio: sc.result.pressures.peakRatio, peakSite: sc.result.pressures.peakSite, group: catalog.cheeks[i].group, tags: catalog.cheeks[i].tags || [] });
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
    patchDiameter: patchDiameter,
    layerContact: layerContact,
    threshold: threshold,
    shankBalance: shankBalance,
    thresholdTension: thresholdTension,
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
