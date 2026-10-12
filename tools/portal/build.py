#!/usr/bin/env python3
"""Build assets/data/portal/portal.json from tools/portal/routes.json.

For every page named in a reading route, the title is taken from the page's
<h1> and the reading time from the word count of its <main>, separately for
each language, so the reading lists never drift from the published pages.

Usage: python3 tools/portal/build.py
"""

import html
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools" / "portal" / "routes.json"
TARGET = ROOT / "assets" / "data" / "portal" / "portal.json"

H1 = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S)
MAIN = re.compile(r"<main[^>]*>(.*?)</main>", re.S)
TAG = re.compile(r"<[^>]+>")
WORD = re.compile(r"\w+", re.U)


def text_of(fragment):
    return html.unescape(TAG.sub(" ", fragment))


def describe(path, words_per_minute):
    source = path.read_text(encoding="utf-8")
    heading = H1.search(source)
    body = MAIN.search(source)
    if not heading or not body:
        raise SystemExit("missing <h1> or <main> in " + str(path))
    title = " ".join(text_of(heading.group(1)).split())
    words = len(WORD.findall(text_of(body.group(1))))
    return title, max(1, math.ceil(words / words_per_minute))


def main():
    spec = json.loads(SOURCE.read_text(encoding="utf-8"))
    pages = {}
    for route in spec["routes"]:
        for page in route["pages"]:
            if page in pages:
                raise SystemExit("page listed in two routes: " + page)
            entry = {"route": route["id"], "title": {}, "minutes": {}}
            for code, language in spec["languages"].items():
                file = ROOT / (language["prefix"] + page) / "index.html"
                title, minutes = describe(file, language["words_per_minute"])
                entry["title"][code] = title
                entry["minutes"][code] = minutes
            pages[page] = entry

    out = {
        "generated_by": "tools/portal/build.py",
        "routes": [
            {key: route[key] for key in ("id", "title", "summary", "pages")}
            for route in spec["routes"]
        ],
        "pages": pages,
        "strings": spec["strings"],
    }
    TARGET.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", TARGET.relative_to(ROOT), "-", len(pages), "pages")


if __name__ == "__main__":
    main()
