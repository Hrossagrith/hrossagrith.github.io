/* Custom domain for the GitHub Pages site.
   check  : public DNS answers, HTTP behaviour, GitHub's Pages health check and,
            when a Cloudflare token is present, the zone's current records.
   apply  : makes the Cloudflare zone match records.json (A/AAAA at the apex,
            CNAME at www, not proxied). Conflicting A/AAAA/CNAME records at those
            two names are deleted and logged; other records (MX, TXT...) are
            left alone.
   https  : asks GitHub Pages to enforce HTTPS once the certificate exists.
   Runs in GitHub Actions. Env: MODE, CLOUDFLARE_API_TOKEN, GITHUB_TOKEN,
   GITHUB_REPOSITORY. */
"use strict";
const fs = require("fs");
const path = require("path");
const dns = require("dns").promises;

const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "records.json"), "utf8"));
const MODE = process.env.MODE || "check";
const CF = "https://api.cloudflare.com/client/v4";
const GH = "https://api.github.com/repos/" + process.env.GITHUB_REPOSITORY;
const cfToken = process.env.CLOUDFLARE_API_TOKEN || "";
const ghToken = process.env.GITHUB_TOKEN || "";

async function cf(method, url, body) {
  const res = await fetch(CF + url, {
    method: method,
    headers: { Authorization: "Bearer " + cfToken, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (!data.success) { throw new Error(method + " " + url + ": " + JSON.stringify(data.errors)); }
  return data;
}

async function gh(method, url, body) {
  const res = await fetch(GH + url, {
    method: method,
    headers: { Authorization: "Bearer " + ghToken, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  return { status: res.status, data: data };
}

async function resolveAll(name) {
  const resolver = new dns.Resolver();
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  const out = {};
  for (const type of ["NS", "A", "AAAA", "CNAME"]) {
    try { out[type] = await resolver.resolve(name, type); } catch (e) { out[type] = e.code; }
  }
  return out;
}

async function http(url) {
  try {
    const res = await fetch(url, { redirect: "manual" });
    return res.status + (res.headers.get("location") ? " -> " + res.headers.get("location") : "");
  } catch (e) {
    return "error " + (e.cause ? e.cause.code || e.cause.message : e.message);
  }
}

async function zoneId() {
  const data = await cf("GET", "/zones?name=" + encodeURIComponent(cfg.zone));
  if (!data.result.length) { throw new Error("zone " + cfg.zone + " is not in this Cloudflare account (or the token cannot see it)"); }
  const z = data.result[0];
  console.log("zone", z.name, "status", z.status, "nameservers", (z.name_servers || []).join(", "));
  return z.id;
}

async function listRecords(id) {
  const data = await cf("GET", "/zones/" + id + "/dns_records?per_page=500");
  return data.result;
}

async function check() {
  for (const name of [cfg.zone, "www." + cfg.zone]) {
    console.log("dns", name, JSON.stringify(await resolveAll(name)));
  }
  for (const url of ["http://" + cfg.zone + "/", "https://" + cfg.zone + "/", "http://www." + cfg.zone + "/", "https://www." + cfg.zone + "/", "https://" + cfg.pages_host + "/"]) {
    console.log("http", url, await http(url));
  }
  if (ghToken) {
    const pages = await gh("GET", "/pages");
    console.log("pages", pages.status, JSON.stringify(pages.data && { cname: pages.data.cname, https_enforced: pages.data.https_enforced, status: pages.data.status, html_url: pages.data.html_url, https_certificate: pages.data.https_certificate, source: pages.data.source }));
    const health = await gh("GET", "/pages/health");
    console.log("pages health", health.status, JSON.stringify(health.data));
  }
  if (cfToken) {
    const id = await zoneId();
    (await listRecords(id)).forEach((r) => console.log("record", r.type, r.name, r.content, r.proxied ? "proxied" : "dns-only"));
  } else {
    console.log("no CLOUDFLARE_API_TOKEN secret: zone records not listed");
  }
}

async function apply() {
  if (!cfToken) { throw new Error("CLOUDFLARE_API_TOKEN secret is missing"); }
  const id = await zoneId();
  const names = new Set(cfg.records.map((r) => r.name));
  const current = (await listRecords(id)).filter((r) => names.has(r.name) && ["A", "AAAA", "CNAME"].includes(r.type));
  const wanted = (r) => cfg.records.some((w) => w.type === r.type && w.name === r.name && w.content.toLowerCase() === String(r.content).toLowerCase());
  for (const r of current) {
    if (wanted(r) && Boolean(r.proxied) === cfg.proxied) { continue; }
    console.log("delete", r.type, r.name, r.content, r.proxied ? "proxied" : "dns-only", "id", r.id);
    await cf("DELETE", "/zones/" + id + "/dns_records/" + r.id);
  }
  const after = await listRecords(id);
  for (const w of cfg.records) {
    const exists = after.some((r) => r.type === w.type && r.name === w.name && String(r.content).toLowerCase() === w.content.toLowerCase());
    if (exists) { console.log("keep", w.type, w.name, w.content); continue; }
    await cf("POST", "/zones/" + id + "/dns_records", { type: w.type, name: w.name, content: w.content, proxied: cfg.proxied, ttl: cfg.ttl });
    console.log("create", w.type, w.name, w.content);
  }
  (await listRecords(id)).forEach((r) => console.log("record", r.type, r.name, r.content, r.proxied ? "proxied" : "dns-only"));
}

async function https() {
  const res = await gh("PUT", "/pages", { https_enforced: true });
  console.log("enforce https", res.status, JSON.stringify(res.data));
}

(async () => {
  if (MODE === "check") { await check(); }
  if (MODE === "apply") { await apply(); await check(); }
  if (MODE === "https") { await https(); await check(); }
})().catch((e) => { console.error(e.message); process.exit(1); });
