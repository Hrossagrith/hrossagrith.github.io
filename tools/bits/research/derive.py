"""Derivation of equine pressure-pain thresholds from human calibration data.

Size law: threshold force F* ~ d^n (Greenspan & McGillis 1991; Garell 1996: n~1;
horse: Taylor 2016 n=0.61, Pongratz & Licka 2017 n=0.71), so threshold pressure
P*(d) = P_ref * (d / d_ref)^(n - 2). Non-circular contacts use the hydraulic
diameter d_eq = 4A / perimeter, which equals d for a disc and keeps the
perimeter law exact for n = 1.
Species transfer: equal epidermal thickness and nerve-fibre density in horse and
human skin (Tong et al. 2020), so human thresholds per tissue type are carried
over unchanged and only the contact size is rescaled. Step 1 tests this on the
only equine head data that exist.
"""
import math

N_SET = {"horse_low": 0.61, "horse_mid": 0.70, "perimeter": 1.00}


def p_star(p_ref, d_ref, d, n):
    return p_ref * (d / d_ref) ** (n - 2)


def chord(r, delta):
    d = min(delta, r)
    return 2 * math.sqrt(max(0.0, 2 * r * d - d * d))


def d_eq_strip(w, length):
    return 2 * w * length / (w + length)


print("STEP 1. Validation: human face skin -> horse face skin")
face_ref, face_d = 232.4, 11.28  # Magerl 2010 via Musial & Weiss 2025, 1 cm^2 probe
measured = [  # (label, tip diameter mm, measured kPa range)
    ("Kafer-Karrer 2026 IOF, 2 mm", 2.0, (6.5 - 1.9) / 3.1416 * 1000, (6.5 + 1.9) / 3.1416 * 1000),
    ("Kafer-Karrer 2026 TMJ, 2 mm", 2.0, (8.5 - 3.4) / 3.1416 * 1000, (8.5 + 3.4) / 3.1416 * 1000),
    ("Khatib 2026 TMJ, 3 mm", 3.0, 971.0, 1214.0),
]
for label, d, lo, hi in measured:
    preds = {k: p_star(face_ref, face_d, d, n) for k, n in N_SET.items()}
    print(f"  {label}: measured {lo:.0f}-{hi:.0f} kPa | predicted " +
          ", ".join(f"n={N_SET[k]}: {v:.0f}" for k, v in preds.items()))

print("\nSTEP 2. Inside vs outside the mouth at the same probe size (11.28 mm)")
ging_ref, ging_sd, ging_d = 152.0, 62.4, 4.8  # Baad-Hansen 2013 Table 1a
for k, n in N_SET.items():
    g = p_star(ging_ref, ging_d, face_d, n)
    print(f"  n={n}: gingiva {g:.0f} kPa vs face skin {face_ref:.0f} kPa -> gingiva {face_ref / g:.1f}x more sensitive")

print("\nSTEP 3. Equine tissue thresholds at bit-sized contacts (kPa, mean and +/-1 SD of the human reference)")
# Site factors relative to attached gingiva, same method (Ogimoto 2002, Ogawa 2003):
#   palate 3.7-4.9x gingiva/labial/buccal; labial ~ gingiva; tongue pinprick ~ gingiva (Hartmann 2022).
sites = {
    "bars (mucosa over bone)": (1.0, 1.0),
    "lip commissure": (0.88, 1.2),
    "tongue (no PPT exists; pinprick ~ gingiva)": (1.0, 1.0),
    "hard palate": (3.7, 4.9),
}
for d_bit in (10, 14, 16, 18, 22):
    r = d_bit / 2
    w = chord(r, 1.5)          # sinks to bone through 1-2 mm mucosa
    de = d_eq_strip(w, 12.0)   # 12 mm bar crest
    row = []
    for k, n in N_SET.items():
        base = p_star(ging_ref, ging_d, de, n)
        lo = p_star(ging_ref - ging_sd, ging_d, de, n)
        hi = p_star(ging_ref + ging_sd, ging_d, de, n)
        row.append(f"n={n}: {base:.0f} ({lo:.0f}-{hi:.0f})")
    print(f"  bars, mouthpiece {d_bit} mm, contact {w:.1f} x 12 mm, d_eq {de:.1f} mm: " + "; ".join(row))

n = N_SET["horse_mid"]
de16 = d_eq_strip(chord(8, 1.5), 12.0)
print(f"\n  All sites, 16 mm mouthpiece (d_eq {de16:.1f} mm), n={n}:")
for name, (f_lo, f_hi) in sites.items():
    b = p_star(ging_ref, ging_d, de16, n)
    print(f"    {name}: {b * f_lo:.0f}-{b * f_hi:.0f} kPa")
chain_de = d_eq_strip(8.0, 30.0)
print(f"    chin groove skin, flat chain 8 x 30 mm (d_eq {chain_de:.1f}): {p_star(face_ref, face_d, chain_de, n):.0f} kPa")
print(f"    nasal bridge skin, noseband 20 x 60 mm: {p_star(face_ref, face_d, d_eq_strip(20, 60), n):.0f} kPa")

print("\nSTEP 4. Rein tension at which a plain 16 mm snaffle reaches the bars threshold")
# Direct statics, independent of the register model: per side the rein's ventral
# component F sin(theta); bars share s of the total ventral load (two bars).
thr = p_star(ging_ref, ging_d, de16, n)
area = chord(8, 1.5) * 12.0
for share in (0.25, 0.35, 0.5):
    for theta in (45, 70, 90):
        # per bar load = 2 F sin(theta) * share / 2 = F sin(theta) * share; uniform mean pressure
        F = thr * 1e-3 * area / (math.sin(math.radians(theta)) * share)
        print(f"  bars share {share}, rein angle {theta} deg: threshold reached at {F:.1f} N per rein")
