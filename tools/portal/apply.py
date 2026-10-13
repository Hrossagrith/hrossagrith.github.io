#!/usr/bin/env python3
"""Attach the portal reading layer to every English (en-GB) and Russian page.

Adds assets/portal.css after style.css and assets/portal.js after site.js,
and the "where to begin" container to both home pages. Idempotent: a page
that already carries the layer is left as it is. The bit register under
lab/ has its own interface and is not touched.

Usage: python3 tools/portal/apply.py
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STYLE = re.compile(r'(<link rel="stylesheet" href="((?:\.\./)*)assets/style\.css">)')
SCRIPT = re.compile(r'(<script src="((?:\.\./)*)assets/site\.js"></script>)')
OTHER_EDITIONS = {"de", "fi", "fr", "it", "ja", "ko", "nl", "no", "sv", "zh", "en-us"}
HOME_ANCHOR = '<main id="main" class="shell wrap">'
HOME_BLOCK = '<section class="shell portal-start" data-portal-start hidden aria-labelledby="portal-start-title"></section>\n\n'


def pages():
    for path in sorted(ROOT.rglob("index.html")):
        parts = path.relative_to(ROOT).parts
        if parts[0] in OTHER_EDITIONS or "lab" in parts or parts[0] in {".git", "tools", "payload"}:
            continue
        yield path


def main():
    changed = 0
    for path in pages():
        source = path.read_text(encoding="utf-8")
        result = source
        if "assets/portal.css" not in result:
            result, n = STYLE.subn(r'\1\n<link rel="stylesheet" href="\2assets/portal.css">', result, count=1)
            if n != 1:
                raise SystemExit("no style.css link in " + str(path))
        if "assets/portal.js" not in result:
            result, n = SCRIPT.subn(r'\1\n<script src="\2assets/portal.js"></script>', result, count=1)
            if n != 1:
                raise SystemExit("no site.js script in " + str(path))
        rel = path.relative_to(ROOT).as_posix()
        if rel in ("index.html", "ru/index.html") and "data-portal-start" not in result:
            if HOME_ANCHOR not in result:
                raise SystemExit("no <main> anchor in " + rel)
            result = result.replace(HOME_ANCHOR, HOME_BLOCK + HOME_ANCHOR, 1)
        if result != source:
            path.write_text(result, encoding="utf-8")
            changed += 1
    print("pages updated:", changed)


if __name__ == "__main__":
    main()
