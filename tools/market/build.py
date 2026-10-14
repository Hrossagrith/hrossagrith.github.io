#!/usr/bin/env python3
"""Build the Imperial Market pages.

Each page in tools/market/templates is wrapped in _layout.html, its {{t.key}}
placeholders filled from assets/data/market/text.json for one language, and
written to market/<page>/index.html. Listings are rendered in the browser by assets/market.js from
assets/data/market/catalog.json and horses.json, using the <template> elements in
_templates.html.

Usage: python3 tools/market/build.py
"""

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = ROOT / "tools" / "market" / "templates"
TEXT = json.loads((ROOT / "assets" / "data" / "market" / "text.json").read_text(encoding="utf-8"))

# English only for now; add a language here once its strings exist in text.json.
LANGS = {
    "en": {"prefix": "", "html_lang": "en-GB", "portal": ""},
}
# (template, output sub-path, title key)
PAGES = [
    ("index", "", "title_home"),
    ("horses", "horses/", "title_horses"),
    ("tack", "tack/", "title_tack"),
    ("item", "item/", "title_item"),
    ("sellers", "sellers/", "title_sellers"),
    ("seller", "seller/", "title_seller"),
    ("my", "my/", "title_my"),
    ("sell", "sell/", "title_sell"),
    ("bag", "bag/", "title_bag"),
]
TOKEN = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


def check_text():
    for key, entry in TEXT.items():
        missing = [lang for lang in LANGS if not entry.get(lang)]
        if missing:
            raise SystemExit("text key " + key + " has no " + ", ".join(missing))


def fill(template, values, lang):
    def sub(match):
        key = match.group(1)
        if key.startswith("t."):
            entry = TEXT.get(key[2:])
            if entry is None:
                raise SystemExit("missing text key: " + key[2:])
            return html.escape(entry[lang], quote=True)
        if key not in values:
            raise SystemExit("missing value: " + key)
        return values[key]
    return TOKEN.sub(sub, template)


def main():
    check_text()
    layout = (TEMPLATES / "_layout.html").read_text(encoding="utf-8")
    templates = (TEMPLATES / "_templates.html").read_text(encoding="utf-8")
    written = 0
    for lang, spec in LANGS.items():
        for name, sub, title_key in PAGES:
            rel = spec["prefix"] + "market/" + sub
            root = "../" * rel.count("/")
            values = {
                "lang": lang,
                "html_lang": spec["html_lang"],
                "root": root,
                "mroot": "../" * sub.count("/") if sub else "./",
                "page": name,
                "self_path": rel,
                "portal_href": root + spec["portal"],
                "page_title": html.escape(TEXT[title_key][lang]),
            }
            values["content"] = fill((TEMPLATES / (name + ".html")).read_text(encoding="utf-8"), values, lang)
            values["templates"] = fill(templates, values, lang)
            out = ROOT / rel / "index.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(fill(layout, values, lang), encoding="utf-8")
            written += 1
    print("pages written:", written)


if __name__ == "__main__":
    main()
