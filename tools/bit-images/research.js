/* Research for the head-carriage drawings: anatomical plates of the horse's
   head and neck (and free photographs of the carriages as a fallback) from
   open-access collections. Writes research.json and review thumbnails into
   research/. Runs in GitHub Actions; the development container cannot reach
   these hosts. */
"use strict";
const fs = require("fs");
const path = require("path");

const here = __dirname;
const OUT_DIR = path.join(here, "research");
const Q = JSON.parse(fs.readFileSync(path.join(here, "research-queries.json"), "utf8"));
const headers = { "User-Agent": "hrossagrith-bit-register/1.0 (https://hrossagrith.github.io; anatomical reference research)" };
const REVIEW = 700;
const PAGE_THUMB = 260;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const seen = new Set();

function strip(html) {
  return String(html || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

async function getJson(url, tries) {
  for (let i = 0; i < (tries || 3); i++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429) { await sleep(5000 * (i + 1)); continue; }
      if (!res.ok) { throw new Error("HTTP " + res.status); }
      return await res.json();
    } catch (e) {
      if (i === (tries || 3) - 1) { console.log("fail", url, e.message); return null; }
      await sleep(1500 * (i + 1));
    }
  }
  return null;
}

async function download(url, file) {
  const target = path.join(OUT_DIR, file);
  if (fs.existsSync(target)) { return file; }
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) { throw new Error("HTTP " + res.status); }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
      return file;
    } catch (e) {
      if (i === 2) { console.log("download fail", url, e.message); return null; }
      await sleep(1500 * (i + 1));
    }
  }
  return null;
}

function add(item) {
  const key = item.provider + ":" + item.id;
  if (seen.has(key)) { return false; }
  seen.add(key);
  results.push(item);
  return true;
}

/* ---------- Wikimedia Commons ---------- */
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const FREE = /^(CC0|CC BY|CC BY-SA|Public domain|PD|No restrictions)/i;

function commonsItem(p, query) {
  const ii = (p.imageinfo || [])[0] || {};
  const meta = ii.extmetadata || {};
  const get = (k) => (meta[k] ? strip(meta[k].value) : "");
  return {
    provider: "commons", id: String(p.pageid), title: p.title, query: query,
    width: ii.width, height: ii.height, mime: ii.mime, thumb: ii.thumburl, full: ii.url, page: ii.descriptionurl,
    license: get("LicenseShortName"), creator: get("Artist").slice(0, 160), date: get("DateTimeOriginal").slice(0, 40),
    description: get("ImageDescription").slice(0, 300)
  };
}

async function commonsFiles(term) {
  const params = new URLSearchParams({
    action: "query", generator: "search", gsrsearch: term, gsrnamespace: "6", gsrlimit: "30",
    prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: String(REVIEW),
    iiextmetadatafilter: "LicenseShortName|Artist|ImageDescription|DateTimeOriginal", format: "json"
  });
  const data = await getJson(COMMONS + "?" + params.toString());
  const pages = data && data.query ? Object.values(data.query.pages) : [];
  return pages.map((p) => commonsItem(p, term));
}

async function commonsCategoriesFor(term) {
  const params = new URLSearchParams({ action: "query", list: "search", srsearch: term, srnamespace: "14", srlimit: "10", format: "json" });
  const data = await getJson(COMMONS + "?" + params.toString());
  return data && data.query ? data.query.search.map((s) => s.title) : [];
}

async function commonsCategory(title, limit) {
  const out = [];
  let cont = null;
  do {
    const params = new URLSearchParams({
      action: "query", generator: "categorymembers", gcmtitle: title, gcmtype: "file", gcmlimit: "100",
      prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: String(REVIEW),
      iiextmetadatafilter: "LicenseShortName|Artist|ImageDescription|DateTimeOriginal", format: "json"
    });
    if (cont) { params.set("gcmcontinue", cont); }
    const data = await getJson(COMMONS + "?" + params.toString());
    if (!data) { break; }
    const pages = data.query ? Object.values(data.query.pages) : [];
    pages.forEach((p) => out.push(commonsItem(p, title)));
    cont = data.continue ? data.continue.gcmcontinue : null;
    await sleep(300);
  } while (cont && out.length < limit);
  return out;
}

async function commons() {
  for (const term of Q.commons.files) {
    const items = await commonsFiles(term);
    let n = 0;
    for (const it of items) {
      if (!it.thumb || !/image\/(jpeg|png|tiff)/.test(it.mime || "") || !FREE.test(it.license)) { continue; }
      if (add(it)) { n++; }
    }
    console.log("commons", term, n);
    await sleep(400);
  }
  const cats = new Set();
  for (const term of Q.commons.categories) {
    (await commonsCategoriesFor(term)).forEach((c) => cats.add(c));
    await sleep(300);
  }
  for (const cat of cats) {
    const items = await commonsCategory(cat, 300);
    let n = 0;
    for (const it of items) {
      if (!it.thumb || !/image\/(jpeg|png|tiff)/.test(it.mime || "") || !FREE.test(it.license)) { continue; }
      if (add(it)) { n++; }
    }
    console.log("commons category", cat, n);
  }
}

/* ---------- IIIF books (Wellcome, Internet Archive) ---------- */
function canvasesOf(manifest) {
  const out = [];
  if (manifest.sequences) {
    (manifest.sequences[0].canvases || []).forEach((c) => {
      const img = c.images && c.images[0] && c.images[0].resource;
      if (!img) { return; }
      const svc = img.service ? (Array.isArray(img.service) ? img.service[0] : img.service) : null;
      out.push({ label: String(c.label || ""), width: c.width, height: c.height, service: svc ? (svc["@id"] || svc.id) : null, full: img["@id"] || img.id });
    });
  } else if (manifest.items) {
    manifest.items.forEach((c) => {
      const anno = c.items && c.items[0] && c.items[0].items && c.items[0].items[0];
      const body = anno && anno.body;
      if (!body) { return; }
      const svcList = body.service || [];
      const svc = Array.isArray(svcList) ? svcList[0] : svcList;
      const label = c.label ? JSON.stringify(c.label).slice(0, 60) : "";
      out.push({ label: label, width: c.width, height: c.height, service: svc ? (svc["@id"] || svc.id) : null, full: body.id || body["@id"] });
    });
  }
  return out;
}

async function book(provider, id, meta, manifestUrl) {
  const manifest = await getJson(manifestUrl);
  if (!manifest) { return; }
  const canvases = canvasesOf(manifest).slice(0, Q.book_page_limit);
  console.log("book", provider, id, canvases.length, "pages");
  const pages = [];
  for (let i = 0; i < canvases.length; i++) {
    const c = canvases[i];
    if (!c.service) { continue; }
    const file = await download(c.service.replace(/\/$/, "") + "/full/" + PAGE_THUMB + ",/0/default.jpg", "books/" + provider + "-" + id + "/" + String(i).padStart(3, "0") + ".jpg");
    pages.push({ index: i, label: c.label, width: c.width, height: c.height, service: c.service, thumb: file });
    await sleep(provider === "archive" ? 400 : 150);
  }
  add(Object.assign({ provider: provider, id: id, kind: "book", manifest: manifestUrl, pages: pages }, meta));
}

async function wellcome() {
  const books = [];
  for (const term of Q.wellcome) {
    const url = "https://api.wellcomecollection.org/catalogue/v2/works?query=" + encodeURIComponent(term) + "&include=items,contributors,production&availabilities=online&pageSize=40";
    const data = await getJson(url);
    const works = data && data.results ? data.results : [];
    console.log("wellcome", term, works.length);
    for (const w of works) {
      let manifestUrl = null;
      let license = "";
      (w.items || []).forEach((it) => (it.locations || []).forEach((loc) => {
        if (loc.locationType && /iiif-presentation/.test(loc.locationType.id)) {
          manifestUrl = loc.url;
          license = loc.license ? loc.license.label || loc.license.id : "";
        }
      }));
      if (!manifestUrl) { continue; }
      const meta = {
        title: w.title, creator: (w.contributors || []).map((c) => c.agent && c.agent.label).filter(Boolean).join("; ").slice(0, 160),
        date: (w.production || []).map((p) => (p.dates || []).map((d) => d.label).join(" ")).join(" ").slice(0, 60),
        license: license, page: "https://wellcomecollection.org/works/" + w.id, query: term, workType: w.workType ? w.workType.label : ""
      };
      books.push({ id: w.id, meta: meta, manifestUrl: manifestUrl });
    }
    await sleep(300);
  }
  const uniq = [];
  const ids = new Set();
  books.forEach((b) => { if (!ids.has(b.id)) { ids.add(b.id); uniq.push(b); } });
  for (const b of uniq.slice(0, 60)) {
    if (/stubbs|leisering|gurlt|ruini|landseer|ellenberger|horse|cheval|pferd|cavallo/i.test(b.meta.title + " " + b.meta.creator)) {
      await book("wellcome", b.id, b.meta, b.manifestUrl);
    }
  }
}

async function archive() {
  let n = 0;
  for (const term of Q.archive) {
    const url = "https://archive.org/advancedsearch.php?q=" + encodeURIComponent(term + " AND mediatype:texts") + "&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=date&fl[]=licenseurl&rows=8&output=json";
    const data = await getJson(url);
    const docs = data && data.response ? data.response.docs : [];
    console.log("archive", term, docs.length);
    for (const d of docs.slice(0, 3)) {
      if (n >= Q.book_limit) { break; }
      const meta = { title: String(d.title || ""), creator: String(d.creator || ""), date: String(d.date || ""), license: d.licenseurl || "Internet Archive (public domain if pre-1930)", page: "https://archive.org/details/" + d.identifier, query: term };
      await book("archive", d.identifier, meta, "https://iiif.archive.org/iiif/3/" + d.identifier + "/manifest.json");
      n++;
    }
    await sleep(500);
  }
}

/* ---------- museum APIs ---------- */
async function met() {
  for (const term of Q.met) {
    const data = await getJson("https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=" + encodeURIComponent(term));
    const ids = data && data.objectIDs ? data.objectIDs.slice(0, 40) : [];
    let n = 0;
    for (const id of ids) {
      const o = await getJson("https://collectionapi.metmuseum.org/public/collection/v1/objects/" + id);
      await sleep(150);
      if (!o || !o.isPublicDomain || !o.primaryImageSmall) { continue; }
      if (!/horse|stubbs|anatom|equ/i.test(o.title + " " + o.artistDisplayName + " " + (o.tags || []).map((t) => t.term).join(" "))) { continue; }
      if (add({ provider: "met", id: String(id), title: o.title, creator: o.artistDisplayName, date: o.objectDate, license: "CC0 (Met Open Access)", page: o.objectURL, thumb: o.primaryImageSmall, full: o.primaryImage, extra: o.additionalImages || [], query: term })) { n++; }
    }
    console.log("met", term, n);
  }
}

async function aic() {
  for (const term of Q.aic) {
    const data = await getJson("https://api.artic.edu/api/v1/artworks/search?q=" + encodeURIComponent(term) + "&fields=id,title,artist_display,date_display,image_id,is_public_domain&limit=40");
    let n = 0;
    for (const a of (data && data.data) || []) {
      if (!a.is_public_domain || !a.image_id) { continue; }
      if (add({ provider: "aic", id: String(a.id), title: a.title, creator: a.artist_display, date: a.date_display, license: "CC0 (Art Institute of Chicago)", page: "https://www.artic.edu/artworks/" + a.id, thumb: "https://www.artic.edu/iiif/2/" + a.image_id + "/full/" + REVIEW + ",/0/default.jpg", full: "https://www.artic.edu/iiif/2/" + a.image_id + "/full/3000,/0/default.jpg", query: term })) { n++; }
    }
    console.log("aic", term, n);
    await sleep(300);
  }
}

async function cleveland() {
  for (const term of Q.cleveland) {
    const data = await getJson("https://openaccess-api.clevelandart.org/api/artworks/?q=" + encodeURIComponent(term) + "&has_image=1&cc0=1&limit=40");
    let n = 0;
    for (const a of (data && data.data) || []) {
      const img = a.images && (a.images.web || a.images.print);
      if (!img) { continue; }
      if (add({ provider: "cleveland", id: String(a.id), title: a.title, creator: (a.creators || []).map((c) => c.description).join("; "), date: a.creation_date, license: "CC0 (Cleveland Museum of Art)", page: a.url, thumb: img.url, full: a.images.full ? a.images.full.url : (a.images.print || img).url, query: term })) { n++; }
    }
    console.log("cleveland", term, n);
    await sleep(300);
  }
}

async function thumbs() {
  for (const r of results) {
    if (r.kind === "book" || !r.thumb) { continue; }
    const ext = /\.png($|\?)/i.test(r.thumb) ? ".png" : ".jpg";
    r.file = await download(r.thumb, r.provider + "/" + r.id.replace(/[^A-Za-z0-9_-]/g, "_") + ext);
    await sleep(120);
  }
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const steps = (process.env.STEPS || "commons,met,aic,cleveland,wellcome,archive").split(",");
  for (const step of steps) {
    try {
      if (step === "commons") { await commons(); }
      if (step === "met") { await met(); }
      if (step === "aic") { await aic(); }
      if (step === "cleveland") { await cleveland(); }
      if (step === "wellcome") { await wellcome(); }
      if (step === "archive") { await archive(); }
    } catch (e) {
      console.log("step failed", step, e.message);
    }
    fs.writeFileSync(path.join(here, "research.json"), JSON.stringify(results, null, 1));
  }
  await thumbs();
  fs.writeFileSync(path.join(here, "research.json"), JSON.stringify(results, null, 1));
  console.log("done", results.length);
})();
