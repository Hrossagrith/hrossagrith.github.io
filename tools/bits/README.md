# Bit register tools

Scripts behind the numbers of the bit-mechanics register (`lab/bits/`). The register itself runs
`assets/bits-model.js` on `assets/data/bits/catalog.json`; these scripts derive or check what the
catalogue holds.

## Catalogue data

- `postures.py` — measures each carriage's rein angle `theta` and head axis on its drawing
  (`catalog.postures[].anchors`) and writes them into the catalogue.
  Run from the repository root: `python3 tools/bits/postures.py`.

## Research (`research/`)

Python 3 with NumPy and SciPy.

- `fe_layer.py`, `fe_grid.py` — plane-strain finite-element contact of a rigid mouthpiece on a thin
  mucosa layer bonded to bone. `fe_grid.json` holds the 243 runs; the 193 that do not bottom out give
  the elastic-foundation factor `mouth.winkler_alpha` (medians 2.1 / 2.5 / 2.8 for Poisson ratios
  0.40 / 0.45 / 0.47) and the peak-to-mean ratio `mouth.peak_to_mean`.
- `derive.py` — derives the pain thresholds from human measurements with the contact-size law and
  checks the transfer against thresholds measured on horses' faces.
- `loadshare_mc.py` — load share between tongue and bars, the worst case for the conclusion, a Monte
  Carlo over the unmeasured parameters, and the comparison with rein tensions horses choose themselves.
  It uses the earlier fixed-depth contact and is kept as the record of that step; the register now uses
  the finite-element-calibrated contact.
