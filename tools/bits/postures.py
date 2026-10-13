"""Derive each posture's rein angle from its drawing.

theta is the angle between the head axis (bit anchor -> poll anchor) and the
rein, which the figure draws level towards the rider's hand. head_axis_deg is
the head axis above the horizontal; the model projects the bit's weight with it.
Run from the repository root: python3 tools/bits/postures.py
"""
import json
import math
from pathlib import Path

CATALOG = Path("assets/data/bits/catalog.json")


def main():
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    for posture in catalog["postures"]:
        anchors = posture["anchors"]
        bx, by = anchors["bit"]
        px, py = anchors["poll"]
        # Image y grows downwards; every drawing faces left, so the rider is to the right (+x).
        head = math.degrees(math.atan2(-(py - by), px - bx))
        posture["head_axis_deg"] = round(head, 1)
        posture["theta"] = round(head)
        print(f'{posture["id"]}: head axis {head:.1f} deg, theta {posture["theta"]}')
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
