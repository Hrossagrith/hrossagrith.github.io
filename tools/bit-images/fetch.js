/* Bit register image research, stage 2: download the chosen photographs at
   640 px into assets/img/bits and write assets/data/bits/images.json with the
   attribution the licences require. picks.json maps each id to a Commons
   page id, or to { pageid, caption: { en, ru } }. */
"use strict";
const fs = require("fs");
const path = require("path");

const here = __dirname;
const root = path.join(here, "..", "..");
const picks = JSON.parse(fs.readFileSync(path.join(here, "picks.json"), "utf8"));
/* Every candidate file from every search round, including category crawls. */
const candidateFiles = fs.readdirSync(here).filter((f) => /^candidates\d*\.json$/.test(f));
const WIDTH = 640;
const headers = { "User-Agent": "hrossagrith-bit-register/1.0 (https://hrossagrith.github.io; worldbuilding site image research)" };
const dirs = { cheeks: "cheeks", mouthpieces: "mouths", pairings: "pairs" };

const pool = [];
for (const file of candidateFiles) {
  const candidates = JSON.parse(fs.readFileSync(path.join(here, file), "utf8"));
  for (const kind of Object.keys(candidates)) {
    if (Array.isArray(candidates[kind])) { for (const c of candidates[kind]) { pool.push(c); } continue; }
    if (typeof candidates[kind] !== "object") { continue; }
    for (const list of Object.values(candidates[kind])) { for (const c of list) { pool.push(c); } }
  }
}

function byPageId(pageid) {
  if (typeof pageid === "string") {
    /* Openverse candidates carry a UUID; picks may give its first characters. */
    return pool.find((c) => typeof c.id === "string" && c.id.indexOf(pageid) === 0);
  }
  return pool.find((c) => c.pageid === pageid);
}

/* Ask the API for a thumbnail at the wanted width: rewriting the thumbnail URL
   by hand fails (HTTP 400) on files whose names need encoding or are
   already smaller than the wanted width. */
async function fullThumb(c) {
  if (c.pageid == null) { return c.url || c.thumb; }
  const params = new URLSearchParams({ action: "query", pageids: String(c.pageid), prop: "imageinfo", iiprop: "url|size", iiurlwidth: String(WIDTH), format: "json" });
  const res = await fetch("https://commons.wikimedia.org/w/api.php?" + params.toString(), { headers });
  if (!res.ok) { throw new Error("API " + res.status); }
  const data = await res.json();
  const page = Object.values(data.query.pages)[0];
  const ii = (page.imageinfo || [])[0];
  return ii && ii.thumburl ? ii.thumburl : c.thumb;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const images = { version: 1, generated: new Date().toISOString(), cheeks: {}, mouthpieces: {}, pairings: {} };
  for (const kind of Object.keys(dirs)) {
    for (const id of Object.keys(picks[kind] || {})) {
      const pick = picks[kind][id];
      const pageid = typeof pick === "number" ? pick : (pick.pageid != null ? pick.pageid : pick.id);
      const c = byPageId(pageid);
      if (!c) { console.error("no candidate", kind, id, pageid); continue; }
      const ext = /png/.test(c.mime) ? "png" : "jpg";
      const rel = dirs[kind] + "/" + id.replace("|", "__") + "." + ext;
      const target = path.join(root, "assets", "img", "bits", rel);
      let url;
      try { url = await fullThumb(c); } catch (err) { console.error("thumb url failed", id, err.message); continue; }
      const res = await fetch(url, { headers });
      if (!res.ok) { console.error("download failed", id, res.status, url); continue; }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
      const scale = Math.min(1, WIDTH / c.width);
      images[kind][id] = {
        file: rel, title: c.title, source: c.page, author: c.artist, license: c.license, license_url: c.licenseUrl,
        provider: c.pageid != null ? "Wikimedia Commons" : (c.provider || c.source || "Openverse"),
        width: Math.round(c.width * scale), height: Math.round(c.height * scale),
        caption: typeof pick === "object" && pick.caption ? pick.caption : undefined
      };
      console.log(kind, id, rel);
      await sleep(150);
    }
  }
  fs.writeFileSync(path.join(root, "assets", "data", "bits", "images.json"), JSON.stringify(images, null, 1));
})();
