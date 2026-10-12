/* Download the chosen anatomical plates from IIIF image services listed in
   plates.json into plates/, at the configured width. Runs in GitHub Actions. */
"use strict";
const fs = require("fs");
const path = require("path");

const here = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(here, "plates.json"), "utf8"));
const out = path.join(here, "plates");
const headers = { "User-Agent": "hrossagrith-bit-register/1.0 (https://hrossagrith.com; anatomical reference plates)" };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  for (const p of cfg.plates) {
    const url = p.service.replace(/\/$/, "") + "/full/" + cfg.width + ",/0/default.jpg";
    for (let i = 0; i < 3; i++) {
      try {
        const res = await fetch(url, { headers });
        if (!res.ok) { throw new Error("HTTP " + res.status); }
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(path.join(out, p.name + ".jpg"), buf);
        console.log("saved", p.name, buf.length);
        break;
      } catch (e) {
        console.log("retry", p.name, e.message);
        await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
      }
    }
  }
})();
