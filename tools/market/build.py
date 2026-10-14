#!/usr/bin/env python3
"""Build the Imperial Market pages for the English and Russian editions.

Each page in tools/market/templates is wrapped in _layout.html, its {{t.key}}
placeholders filled from assets/data/market/text.json for one language, and
written to market/<page>/index.html (English) and ru/market/<page>/index.html
(Russian). Dynamic content is rendered in the browser by assets/market.js from
assets/data/market/catalog.json.

Usage: python3 tools/market/build.py
"""

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEMPLATES = ROOT / "tools" / "market" / "templates"
TEXT = json.loads((ROOT / "assets" / "data" / "market" / "text.json").read_text(encoding="utf-8"))

LANGS = {
    "en": {"prefix": "", "html_lang": "en-GB", "portal": ""},
    "ru": {"prefix": "ru/", "html_lang": "ru", "portal": "ru/"},
}
PAGES = [
    ("index", "", "market_sub"),
    ("catalogue", "catalogue/", "title_catalogue"),
    ("item", "item/", "title_item"),
]
TOKEN = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


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
    layout = (TEMPLATES / "_layout.html").read_text(encoding="utf-8")
    templates = (TEMPLATES / "_templates.html").read_text(encoding="utf-8")
    written = 0
    for lang, spec in LANGS.items():
        other = "ru" if lang == "en" else "en"
        for name, sub, title_key in PAGES:
            rel = spec["prefix"] + "market/" + sub
            depth = rel.count("/")
            root = "../" * depth
            mroot = "../" * sub.count("/") if sub else "./"
            other_rel = LANGS[other]["prefix"] + "market/" + sub
            values = {
                "lang": lang,
                "other_lang": other,
                "html_lang": spec["html_lang"],
                "root": root,
                "mroot": mroot,
                "page": name,
                "self_path": rel,
                "other_path": other_rel,
                "other_href": root + other_rel,
                "portal_href": root + spec["portal"],
                "page_title": html.escape(TEXT[title_key][lang]),
            }
            body = fill((TEMPLATES / (name + ".html")).read_text(encoding="utf-8"), values, lang)
            values["content"] = body
            values["templates"] = templates
            page = fill(layout, values, lang)
            out = ROOT / rel / "index.html"
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(page, encoding="utf-8")
            written += 1
    print("pages written:", written)


if __name__ == "__main__":
    main()
