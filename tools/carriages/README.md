# Head-carriage drawings

Builds the six carriage drawings in `assets/img/postures/` from two
public-domain plates on Wikimedia Commons:

- `File:Horse anatomy head.jpg` — Ellenberger, Baum & Dittrich, *Handbuch der
  Anatomie der Tiere für Künstler* (1898), Tafel 6, Fig. 30: the head in
  profile (silhouette, eye, nostril, mouth, ears).
- `File:Description iconographique comparée du squelette et du système dentaire
  des mammifères récents et fossiles (Equus ferus caballus).jpg` — Blainville,
  *Ostéographie* (1839–1864): the skull and the cervical column.

The carriages (face angle, direction of each cervical vertebra, crest and
throat offsets) are set in `build.py` and follow the site author's sketches
kept in `assets/img/postures/author/`.

Run from a directory holding the two plates in `refs/` (the `refs` stage of
`.github/workflows/bit-images.yml` downloads them):

    PYTHONPATH=. python3 extract.py      # masks and ink layers from the plates
    PYTHONPATH=. python3 build.py out    # six PNGs, anchors.json, a review sheet

`anchors.json` holds the drawing sizes and the bit, poll, chin-groove and
nasal-bone anchor points that go into `assets/data/bits/catalog.json`.
Needs Pillow and NumPy only.
