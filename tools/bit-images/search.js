/* Bit register image research, stage 1: query Wikimedia Commons for free-licence
   photographs of every cheek, mouthpiece and named combination, write
   candidates.json and download small review thumbnails. Runs in GitHub Actions
   (the development container has no access to Commons). */
"use strict";
const fs = require("fs");
const path = require("path");

const here = __dirname;
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

/* Files in a category tree, breadth first, up to a depth and a count. */
async function crawl(rootTitle, maxDepth, maxFiles) {
  const seenCats = new Set([rootTitle]);
  const queue = [{ title: rootTitle, depth: 0 }];
  const files = [];
  const seenFiles = new Set();
  while (queue.length && files.length < maxFiles) {
    const cat = queue.shift();
    let cont = null;
    do {
      const params = new URLSearchParams({
        action: "query", generator: "categorymembers", gcmtitle: cat.title, gcmtype: "file|subcat", gcmlimit: "100",
        prop: "imageinfo|categoryinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: String(REVIEW_WIDTH),
        iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|ImageDescription", format: "json"
      });
      if (cont) { params.set("gcmcontinue", cont); }
      const res = await fetch(API + "?" + params.toString(), { headers });
      if (!res.ok) { console.error("HTTP " + res.status + " for " + cat.title); break; }
      const data = await res.json();
      const pages = data.query ? Object.values(data.query.pages) : [];
      for (const p of pages) {
        if (p.ns === 14) {
          if (cat.depth < maxDepth && !seenCats.has(p.title)) { seenCats.add(p.title); queue.push({ title: p.title, depth: cat.depth + 1 }); }
          continue;
        }
        if (p.ns !== 6 || seenFiles.has(p.pageid)) { continue; }
        const ii = (p.imageinfo || [])[0] || {};
        const meta = ii.extmetadata || {};
        const get = (k) => (meta[k] ? strip(meta[k].value) : "");
        const c = {
          title: p.title, pageid: p.pageid, mime: ii.mime, width: ii.width, height: ii.height, thumb: ii.thumburl, page: ii.descriptionurl,
          license: get("LicenseShortName"), licenseUrl: get("LicenseUrl"), artist: get("Artist").slice(0, 120), description: get("ImageDescription").slice(0, 240),
          category: cat.title
        };
        if (c.thumb && /image\/(jpeg|png)/.test(c.mime || "") && FREE.test(c.license)) { seenFiles.add(p.pageid); files.push(c); }
      }
      cont = data["continue"] ? data["continue"].gcmcontinue : null;
      await sleep(250);
    } while (cont && files.length < maxFiles);
  }
  return files;
}

(async () => {
  const which = process.env.QUERIES || "queries.json";
  const q = JSON.parse(fs.readFileSync(path.join(here, which), "utf8"));
  const outName = process.env.OUT || "candidates.json";
  const outDir = process.env.OUT_DIR || "candidates";
  const out = { generated: new Date().toISOString(), cheeks: {}, mouthpieces: {}, pairings: {}, categories: [] };
  for (const root of (q.categories || [])) {
    const files = await crawl(root, 3, 1500);
    console.log("category", root, files.length);
    for (const c of files) {
      const ext = /png/.test(c.mime) ? "png" : "jpg";
      const rel = path.join(outDir, "categories", c.pageid + "." + ext);
      if (!fs.existsSync(path.join(here, rel))) {
        try { await download(c.thumb, path.join(here, rel)); } catch (err) { console.error("thumb", c.pageid, err.message); continue; }
        await sleep(100);
      }
      c.review = rel;
      out.categories.push(c);
    }
  }
  for (const kind of ["cheeks", "mouthpieces", "pairings"]) {
    for (const id of Object.keys(q[kind] || {})) {
      const seen = new Set();
      const list = [];
      for (const term of q[kind][id]) {
        try {
          for (const c of await search(term)) {
            if (!seen.has(c.pageid) && list.length < MAX_PER_ITEM) { seen.add(c.pageid); list.push(Object.assign({ term }, c)); }
          }
        } catch (err) { console.error(kind, id, term, err.message); }
        await sleep(300);
      }
      for (const c of list) {
        const ext = /png/.test(c.mime) ? "png" : "jpg";
        const rel = path.join(outDir, kind, id.replace("|", "__"), c.pageid + "." + ext);
        try { await download(c.thumb, path.join(here, rel)); c.review = rel; } catch (err) { console.error("thumb", id, c.pageid, err.message); }
        await sleep(120);
      }
      out[kind][id] = list;
      console.log(kind, id, list.length);
    }
  }
  fs.writeFileSync(path.join(here, outName), JSON.stringify(out, null, 1));
})();
