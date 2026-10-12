/* Bit register image research, stage 1: query Wikimedia Commons for free-licence
   photographs of every cheek, mouthpiece and named combination, write
   candidates.json and download small review thumbnails. Runs in GitHub Actions
   (the development container has no access to Commons). */
"use strict";
const fs = require("fs");
const path = require("path");

const here = __dirname;
const queries = JSON.parse(fs.readFileSync(path.join(here, "queries.json"), "utf8"));
const API = "https://commons.wikimedia.org/w/api.php";
const FREE = /^(CC0|CC BY|CC BY-SA|Public domain|PD)/i;
const REVIEW_WIDTH = 240;
const MAX_PER_ITEM = 14;
const headers = { "User-Agent": "hrossagrith-bit-register/1.0 (https://hrossagrith.github.io; worldbuilding site image research)" };

function strip(html) {
  return String(html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function search(term) {
  const params = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: term, gsrnamespace: "6", gsrlimit: "10",
    prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: String(REVIEW_WIDTH),
    iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ImageDescription|Credit|Attribution",
    format: "json"
  });
  const res = await fetch(API + "?" + params.toString(), { headers });
  if (!res.ok) { throw new Error("HTTP " + res.status + " for " + term); }
  const data = await res.json();
  const pages = data.query ? data.query.pages : {};
  return Object.values(pages).map((p) => {
    const ii = (p.imageinfo || [])[0] || {};
    const meta = ii.extmetadata || {};
    const get = (k) => (meta[k] ? strip(meta[k].value) : "");
    return {
      title: p.title, pageid: p.pageid, mime: ii.mime, width: ii.width, height: ii.height,
      thumb: ii.thumburl, page: ii.descriptionurl,
      license: get("LicenseShortName"), licenseUrl: get("LicenseUrl"), artist: get("Artist").slice(0, 120),
      description: get("ImageDescription").slice(0, 240)
    };
  }).filter((c) => c.thumb && /image\/(jpeg|png)/.test(c.mime || "") && FREE.test(c.license));
}

async function download(url, target) {
  const res = await fetch(url, { headers });
  if (!res.ok) { throw new Error("HTTP " + res.status + " for " + url); }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const out = { generated: new Date().toISOString(), cheeks: {}, mouthpieces: {}, pairings: {} };
  for (const kind of ["cheeks", "mouthpieces", "pairings"]) {
    for (const id of Object.keys(queries[kind] || {})) {
      const seen = new Set();
      const list = [];
      for (const term of queries[kind][id]) {
        try {
          for (const c of await search(term)) {
            if (!seen.has(c.pageid) && list.length < MAX_PER_ITEM) { seen.add(c.pageid); list.push(Object.assign({ term }, c)); }
          }
        } catch (err) { console.error(kind, id, term, err.message); }
        await sleep(300);
      }
      for (const c of list) {
        const ext = /png/.test(c.mime) ? "png" : "jpg";
        const rel = path.join("candidates", kind, id.replace("|", "__"), c.pageid + "." + ext);
        try { await download(c.thumb, path.join(here, rel)); c.review = rel; } catch (err) { console.error("thumb", id, c.pageid, err.message); }
        await sleep(120);
      }
      out[kind][id] = list;
      console.log(kind, id, list.length);
    }
  }
  fs.writeFileSync(path.join(here, "candidates.json"), JSON.stringify(out, null, 1));
})();
