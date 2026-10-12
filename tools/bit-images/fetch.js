/* Bit register image research, stage 2: download the chosen photographs at
   640 px into assets/img/bits and write assets/data/bits/images.json with the
   attribution the licences require. picks.json maps each id to a Commons
   page id, or to { pageid, caption: { en, ru } }. */
"use strict";
const fs = require("fs");
const path = require("path");

const here = __dirname;
const root = path.join(here, "..", "..");
const candidates = JSON.parse(fs.readFileSync(path.join(here, "candidates.json"), "utf8"));
const picks = JSON.parse(fs.readFileSync(path.join(here, "picks.json"), "utf8"));
const WIDTH = 640;
const headers = { "User-Agent": "hrossagrith-bit-register/1.0 (https://hrossagrith.github.io; worldbuilding site image research)" };
const dirs = { cheeks: "cheeks", mouthpieces: "mouths", pairings: "pairs" };

const pool = [];
for (const kind of Object.keys(candidates)) {
  if (typeof candidates[kind] !== "object") { continue; }
  for (const list of Object.values(candidates[kind])) { for (const c of list) { pool.push(c); } }
}

function byPageId(pageid) {
  return pool.find((c) => c.pageid === pageid);
}

function fullThumb(c) {
  /* Commons thumbnail URLs carry the width as a prefix of the file name. */
  return c.thumb.replace(/\/\d+px-/, "/" + WIDTH + "px-");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const images = { version: 1, generated: new Date().toISOString(), cheeks: {}, mouthpieces: {}, pairings: {} };
  for (const kind of Object.keys(dirs)) {
    for (const id of Object.keys(picks[kind] || {})) {
      const pick = picks[kind][id];
      const pageid = typeof pick === "number" ? pick : pick.pageid;
      const c = byPageId(pageid);
      if (!c) { console.error("no candidate", kind, id, pageid); continue; }
      const ext = /png/.test(c.mime) ? "png" : "jpg";
      const rel = dirs[kind] + "/" + id.replace("|", "__") + "." + ext;
      const target = path.join(root, "assets", "img", "bits", rel);
      const res = await fetch(fullThumb(c), { headers });
      if (!res.ok) { console.error("download failed", id, res.status); continue; }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
      const scale = Math.min(1, WIDTH / c.width);
      images[kind][id] = {
        file: rel, title: c.title, source: c.page, author: c.artist, license: c.license, license_url: c.licenseUrl,
        width: Math.round(c.width * scale), height: Math.round(c.height * scale),
        caption: typeof pick === "object" && pick.caption ? pick.caption : undefined
      };
      console.log(kind, id, rel);
      await sleep(150);
    }
  }
  fs.writeFileSync(path.join(root, "assets", "data", "bits", "images.json"), JSON.stringify(images, null, 1));
})();
