/* Bit register image research: Openverse (CC-licensed photographs aggregated from
   Flickr, Wikimedia and others). Reads queries-openverse.json, writes
   candidates-openverse.json and review thumbnails. Anonymous access is rate
   limited, so the script paces itself from the response headers and waits
   out a 429. Runs in GitHub Actions. */
"use strict";
const fs = require("fs");
const path = require("path");

const here = __dirname;
const q = JSON.parse(fs.readFileSync(path.join(here, "queries-openverse.json"), "utf8"));
const API = "https://api.openverse.org/v1/images/";
const OK_LICENSES = new Set(["cc0", "pdm", "by", "by-sa"]);
const OUT_DIR = "candidates-openverse";
const headers = { "User-Agent": "hrossagrith-bit-register/1.0 (https://hrossagrith.github.io; worldbuilding site image research)", "Accept": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function search(term) {
  const params = new URLSearchParams({ q: term, license: "cc0,pdm,by,by-sa", page_size: "20", mature: "false" });
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = await fetch(API + "?" + params.toString(), { headers });
    const limitInfo = ["x-ratelimit-limit-anon_burst", "x-ratelimit-available-anon_burst", "x-ratelimit-limit-anon_sustained", "x-ratelimit-available-anon_sustained", "retry-after"]
      .map((h) => h + "=" + (res.headers.get(h) || "-")).join(" ");
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after")) || 900;
      console.log("429 for", JSON.stringify(term), limitInfo, "waiting", wait, "s");
      if (wait > 1800) { throw new Error("QUOTA"); }
      await sleep(wait * 1000 + 2000);
      continue;
    }
    if (!res.ok) { throw new Error("HTTP " + res.status + " for " + term); }
    console.log("ok", JSON.stringify(term), limitInfo);
    const data = await res.json();
    return (data.results || []).filter((r) => OK_LICENSES.has(String(r.license).toLowerCase())).map((r) => ({
      id: r.id, title: r.title, url: r.url, thumb: r.thumbnail, page: r.foreign_landing_url, source: r.source, provider: r.provider,
      license: (r.license + " " + (r.license_version || "")).trim().toUpperCase(), licenseUrl: r.license_url, artist: r.creator || "", artistUrl: r.creator_url || "",
      width: r.width, height: r.height, mime: r.filetype ? "image/" + r.filetype : "image/jpeg", tags: (r.tags || []).slice(0, 8).map((t) => t.name)
    }));
  }
  return [];
}

async function download(url, target) {
  const res = await fetch(url, { headers: { "User-Agent": headers["User-Agent"] } });
  if (!res.ok) { throw new Error("HTTP " + res.status + " for " + url); }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
}

(async () => {
  const out = { generated: new Date().toISOString(), cheeks: {}, mouthpieces: {}, pairings: {} };
  const outFile = path.join(here, "candidates-openverse.json");
  for (const kind of ["cheeks", "mouthpieces", "pairings"]) {
    for (const id of Object.keys(q[kind] || {})) {
      const seen = new Set();
      const list = [];
      for (const term of q[kind][id]) {
        try {
          for (const c of await search(term)) {
            if (!seen.has(c.id) && list.length < 16) { seen.add(c.id); list.push(Object.assign({ term }, c)); }
          }
        } catch (err) {
          if (err.message === "QUOTA") { console.log("daily quota reached; writing partial results"); fs.writeFileSync(outFile, JSON.stringify(out, null, 1)); process.exit(0); }
          console.error(kind, id, term, err.message);
        }
        await sleep(1500);
      }
      for (const c of list) {
        const rel = path.join(OUT_DIR, kind, id.replace("|", "__"), c.id + ".jpg");
        try { await download(c.thumb, path.join(here, rel)); c.review = rel; } catch (err) { console.error("thumb", id, c.id, err.message); }
        await sleep(300);
      }
      out[kind][id] = list;
      console.log(kind, id, list.length);
      fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
    }
  }
})();
