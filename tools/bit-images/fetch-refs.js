/* Download anatomical reference plates (public domain / CC) from Wikimedia
   Commons at a given width into tools/bit-images/refs/, with their metadata.
   Runs in GitHub Actions. */
"use strict";
const fs = require("fs");
const path = require("path");
const here = __dirname;
const refs = JSON.parse(fs.readFileSync(path.join(here, "refs.json"), "utf8"));
const headers = { "User-Agent": "hrossagrith-bit-register/1.0 (https://hrossagrith.github.io; anatomy reference plates)" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const out = [];
  for (const ref of refs.pages) {
    const params = new URLSearchParams({ action: "query", pageids: String(ref.pageid), prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: String(refs.width), iiextmetadatafilter: "LicenseShortName|Artist|ImageDescription|Credit", format: "json" });
    const res = await fetch("https://commons.wikimedia.org/w/api.php?" + params.toString(), { headers });
    if (!res.ok) { console.error("api", ref.name, res.status); continue; }
    const page = Object.values((await res.json()).query.pages)[0];
    const ii = (page.imageinfo || [])[0];
    if (!ii) { console.error("no imageinfo", ref.name); continue; }
    const url = ii.thumburl || ii.url;
    const img = await fetch(url, { headers });
    if (!img.ok) { console.error("download", ref.name, img.status); continue; }
    const ext = /png/.test(ii.mime) ? "png" : "jpg";
    const rel = path.join("refs", ref.name + "." + ext);
    fs.mkdirSync(path.join(here, "refs"), { recursive: true });
    fs.writeFileSync(path.join(here, rel), Buffer.from(await img.arrayBuffer()));
    const meta = ii.extmetadata || {};
    const get = (k) => (meta[k] ? String(meta[k].value).replace(/<[^>]+>/g, "").trim() : "");
    out.push({ name: ref.name, pageid: ref.pageid, file: rel, title: page.title, page: ii.descriptionurl, license: get("LicenseShortName"), artist: get("Artist").slice(0, 120), description: get("ImageDescription").slice(0, 300), width: ii.thumbwidth || ii.width, height: ii.thumbheight || ii.height });
    console.log(ref.name, rel, get("LicenseShortName"));
    await sleep(300);
  }
  fs.writeFileSync(path.join(here, "refs", "refs-meta.json"), JSON.stringify(out, null, 1));
})();
