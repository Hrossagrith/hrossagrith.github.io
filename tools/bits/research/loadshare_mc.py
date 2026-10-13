"""Tongue/bar load share, worst case and Monte Carlo for a plain snaffle.

Physics:
  * The tongue is a soft, nearly incompressible muscle (in-vivo shear modulus
    2.7-3.0 kPa by MR elastography, Cheng 2011, Brown 2015; ~14 kPa by shear-wave
    elastography, Yanagawa 2025; E = 3G). It stands above the bar crest by h_p.
  * The bar mucosa is a 1-2 mm layer on bone (Anttila 2022 citing Engelke &
    Gasse 2003) with modulus 0.08-1 MPa (Sawada 2011; Chen 2015): its stiffness
    per unit area E/h is 10^2-10^4 times the tongue's E/T, so once the
    mouthpiece has pressed the tongue down by h_p, further load goes to the bars.
  * Tongue reaction at indentation delta: uniaxial estimate
    F_t = E * (delta / T) * A(delta), A = contact chord * tongue width.
    This overestimates the tongue's resistance (the tongue escapes sideways),
    so it is conservative for the bars.
Thresholds: attached gingiva PPT 152.0 +/- 62.4 kPa, 4.8 mm probe
  (Baad-Hansen 2013, Table 1a), size law P* ~ d^(n-2), n in [0.61, 1.0]
  (Taylor 2016; Pongratz & Licka 2017; Greenspan & McGillis 1991).
Depth check: horse gingival epithelium 0.75-0.83 mm (Kunze & Muehlbach 1885),
  nerve fibres reach papilla tips (0.28-0.36 mm high) -> endings ~0.4-0.55 mm deep.
"""
import math
import numpy as np

rng = np.random.default_rng(20261013)


def chord(r, delta):
    d = np.minimum(delta, r)
    return 2 * np.sqrt(np.maximum(0.0, 2 * r * d - d * d))


def tongue_force(E_kpa, delta, T, r, width):
    """Uniaxial estimate of the tongue reaction (N) at indentation delta (mm)."""
    area = np.where(delta < r, chord(r, delta), math.pi * r) * width
    return E_kpa * 1e-3 * (delta / T) * area


def bars_mean_pressure(F, theta, d, mucosa, crest, E_t, h_p, T, width):
    """Mean pressure on each bar (kPa) for rein tension F per side (N)."""
    r = d / 2
    total = 2 * F * np.sin(np.radians(theta))          # ventral load, both sides
    f_tongue_max = tongue_force(E_t, h_p, T, r, width)  # tongue load when bit reaches the bars
    to_bars = np.maximum(0.0, total - f_tongue_max)
    share_bars = np.where(total > 0, to_bars / total, 0)
    area = chord(r, mucosa) * crest                     # per bar
    return (to_bars / 2) / area * 1000, share_bars, area


def threshold(p_ref, n, d_eq, d_ref=4.8):
    return p_ref * (d_eq / d_ref) ** (n - 2)


def d_eq_strip(w, length):
    return 2 * w * length / (w + length)


# ---------- 0. Depth of the nerve endings ----------
print("0. Stress at nerve-ending depth vs surface pressure (2D Hertz, on axis: 1/sqrt(1+z^2/a^2))")
for d in (10, 16, 22):
    a = chord(d / 2, 1.5) / 2
    for z in (0.2, 0.5, 0.8):
        print(f"   bit {d} mm, half-width {a:.1f} mm, depth {z} mm: {1 / math.sqrt(1 + (z / a) ** 2):.3f}")

# ---------- 1. Load share ----------
print("\n1. Share of the ventral load reaching the bars, 16 mm snaffle, theta 70 deg")
for label, E in (("MRE passive 8 kPa", 8), ("SWE passive 42 kPa", 42), ("braced x10 420 kPa", 420)):
    row = []
    for h in (2, 5, 10):
        for F in (7, 20, 50):
            _, s, _ = bars_mean_pressure(F, 70, 16, 1.5, 12, E, h, 16, 30)
            row.append(f"h{h}/F{F}:{float(s):.2f}")
    print(f"   {label}: " + "  ".join(row))

# ---------- 2. Worst case for the conclusion ----------
print("\n2. Worst case for 'the bars reach the pain threshold' (everything favours the bit)")
wc = dict(theta=45, d=22, mucosa=2.0, crest=15, E_t=42, h_p=10, T=13, width=35)
w = chord(wc["d"] / 2, wc["mucosa"])
thr_wc = threshold(152.0 + 62.4, 1.0, d_eq_strip(w, wc["crest"]))
for F in np.arange(5, 61, 1.0):
    p, s, _ = bars_mean_pressure(F, **wc)
    if p >= thr_wc:
        print(f"   threshold {thr_wc:.0f} kPa (+1 SD, n=1.0, widest contact) reached at {F:.0f} N per rein "
              f"(bars share {float(s):.2f}, theta 45, 22 mm, passive SWE tongue protruding 10 mm)")
        break

# ---------- 3. Monte Carlo ----------
N = 200_000
samples = dict(
    theta=rng.uniform(45, 95, N),
    d=rng.uniform(10, 22, N),
    mucosa=rng.uniform(1.0, 2.0, N),
    crest=rng.uniform(10, 15, N),
    E_t=np.exp(rng.uniform(math.log(8), math.log(42), N)),
    h_p=rng.uniform(2, 10, N),
    T=rng.uniform(13, 18, N),
    width=rng.uniform(25, 35, N),
)
sigma_ln = math.sqrt(math.log(1 + (62.4 / 152.0) ** 2))
mu_ln = math.log(152.0) - sigma_ln ** 2 / 2
p_ref = rng.lognormal(mu_ln, sigma_ln, N)
n_exp = rng.uniform(0.61, 1.0, N)
w = chord(samples["d"] / 2, samples["mucosa"])
thr = threshold(p_ref, n_exp, d_eq_strip(w, samples["crest"]))

print("\n3. Monte Carlo, passive tongue (200 000 draws): probability that the mean bar pressure exceeds the threshold")
for F in (5, 7, 10, 15, 20, 30, 50, 100):
    p, s, _ = bars_mean_pressure(F, **samples)
    ratio = p / thr
    print(f"   {F:>3} N per rein: P(above) = {np.mean(ratio > 1):.2f}; median pressure/threshold = {np.median(ratio):.2f} "
          f"(5-95 %: {np.percentile(ratio, 5):.2f}-{np.percentile(ratio, 95):.2f}); median bars share {np.median(s):.2f}")

print("\n3b. Same, tongue actively braced (modulus x10, no measurement exists)")
braced = dict(samples, E_t=samples["E_t"] * 10)
for F in (7, 20, 50, 100):
    p, s, _ = bars_mean_pressure(F, **braced)
    print(f"   {F:>3} N: P(above) = {np.mean(p / thr > 1):.2f}; median bars share {np.median(s):.2f}")

# ---------- 4. Behavioural cross-check ----------
print("\n4. Rein tension at which P(above) = 0.5, passive tongue")
for F in np.arange(2, 40, 0.5):
    p, _, _ = bars_mean_pressure(F, **samples)
    if np.mean(p / thr > 1) >= 0.5:
        print(f"   {F:.1f} N per rein")
        break
print("   Self-chosen tension when horses can choose: 6.5-9.4 N unridden (Piccolo & Kienapfel 2019),"
      " 6.6-9.0 N walk maxima (Kau 2020), 10.2 -> 5.7 N over three days (Christensen 2011).")

# ---------- 5. Where the load goes when the tongue is braced ----------
print("\n5. Braced tongue: pressure on the tongue itself vs its threshold (tongue PPT assumed = gingiva,")
print("   pinprick tongue ~ gingiva, Hartmann 2022; contact = chord at the indentation reached x tongue width)")
for F in (7, 20, 50):
    total = 2 * F * np.sin(np.radians(braced["theta"]))
    r = braced["d"] / 2
    f_t_cap = tongue_force(braced["E_t"], braced["h_p"], braced["T"], r, braced["width"])
    f_t = np.minimum(total, f_t_cap)
    # indentation actually reached: invert the uniaxial law by bisection on a grid
    lo = np.zeros(N); hi = braced["h_p"].copy()
    for _ in range(40):
        mid = (lo + hi) / 2
        too_much = tongue_force(braced["E_t"], mid, braced["T"], r, braced["width"]) > f_t
        hi = np.where(too_much, mid, hi); lo = np.where(too_much, lo, mid)
    area_t = np.where(lo < r, chord(r, lo), math.pi * r) * braced["width"]
    p_t = np.where(area_t > 0, f_t / np.maximum(area_t, 1e-9) * 1000, 0)
    thr_t = threshold(p_ref, n_exp, d_eq_strip(np.maximum(chord(r, lo), 0.1), braced["width"]))
    p_b, _, _ = bars_mean_pressure(F, **braced)
    either = (p_t / thr_t > 1) | (p_b / thr > 1)
    print(f"   {F:>3} N: P(tongue above) = {np.mean(p_t / thr_t > 1):.2f}; P(tongue or bars above) = {np.mean(either):.2f}")
