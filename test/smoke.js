/* Case Check smoke test.
   Serves the repo and drives it in a headless browser. Run it after ANY change
   to the data layer, the service worker, or the theme tokens.

     npm install
     npm test

   The backup round trip is the one that matters. If it fails, do not deploy:
   a schema mistake that ships is a lost gear library. */

const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8123;
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".png":"image/png",
                ".webmanifest":"application/manifest+json", ".json":"application/json",
                ".css":"text/css", ".svg":"image/svg+xml" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); return res.end("not found");
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream",
                       "Service-Worker-Allowed": "/" });
  res.end(fs.readFileSync(f));
});

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const pass = [], fail = [], errs = [];

  page.on("pageerror", e => errs.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("dialog", d => d.accept());

  const ok  = (m) => pass.push(m);
  const bad = (m) => fail.push(m);

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  /* 1. boots */
  const h2 = await page.textContent("h2");
  h2 && h2.length > 5 ? ok("renders") : bad("did not render");

  /* 2. database */
  const dbv = await page.evaluate(() => (window.DB && DB._db) ? DB._db.version : null);
  dbv ? ok("IndexedDB open at v" + dbv) : bad("database did not open");

  const stores = await page.evaluate(() => Array.from(DB._db.objectStoreNames).sort());
  stores.length >= 6 ? ok("stores: " + stores.join(",")) : bad("missing stores: " + stores);

  /* 3. service worker */
  const sw = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return r ? (r.active ? "active" : r.installing ? "installing" : "waiting") : "none";
  });
  sw !== "none" ? ok("service worker " + sw) : bad("service worker did not register");

  /* 4. backup round trip — the important one */
  const rt = await page.evaluate(async () => {
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    await DB.put("containers", { id:"t_c", name:"Gray Nanuk", color:"#8b9296", order:1 });
    await DB.put("items",      { id:"t_i", name:"Sony FX6", category:"camera", containerId:"t_c", photoId:"t_p", note:"", archived:false, createdAt:new Date().toISOString() });
    await DB.put("kits",       { id:"t_k", name:"A-cam", itemIds:["t_i"], order:1 });
    await DB.put("gigs",       { id:"t_g", name:"Test", client:"", date:"2026-09-18", kitIds:["t_k"], extraItemIds:[], packed:{ t_i:true }, loaded:{}, notes:[], createdAt:new Date().toISOString(), completedAt:null });
    await DB.put("photos",     { id:"t_p", blob: await (await fetch(png)).blob() });

    const snap   = await Backup.export();
    const before = await DB.counts();
    await DB.clearAll();
    const mid    = await DB.counts();
    await Backup.restore(snap);
    const after  = await DB.counts();

    const item = await DB.get("items", "t_i");
    const gig  = await DB.get("gigs", "t_g");
    const ph   = await DB.get("photos", "t_p");
    return { before, mid, after,
             name: item && item.name,
             packedKept: !!(gig && gig.packed && gig.packed.t_i),
             photoBytes: ph && ph.blob ? ph.blob.size : 0 };
  });
  const rtOK = rt.mid.items === 0 && rt.name === "Sony FX6" && rt.packedKept
    && rt.photoBytes > 0 && JSON.stringify(rt.before) === JSON.stringify(rt.after);
  rtOK ? ok("backup round trip, photo " + rt.photoBytes + "B")
       : bad("BACKUP ROUND TRIP FAILED: " + JSON.stringify(rt));

  /* 5. persistence */
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const kept = await page.evaluate(() => DB.counts());
  kept.items >= 1 ? ok("data survives reload") : bad("data lost on reload");

  /* 6. offline */
  await ctx.setOffline(true);
  const p2 = await ctx.newPage();
  let offTitle = "";
  try { await p2.goto(`http://localhost:${PORT}/`, { waitUntil: "domcontentloaded", timeout: 15000 });
        offTitle = await p2.textContent("h2"); } catch (e) { offTitle = ""; }
  offTitle ? ok("opens offline") : bad("did not open offline");
  await ctx.setOffline(false);
  await p2.close();

  /* 7. themes both resolve and body is painted */
  const themes = await page.evaluate(() => {
    const out = {};
    for (const t of ["light", "dark"]) {
      document.documentElement.setAttribute("data-theme", t);
      const cs = getComputedStyle(document.documentElement);
      out[t] = { ink: cs.getPropertyValue("--ink").trim(), bg: cs.getPropertyValue("--bg").trim(),
                 body: getComputedStyle(document.body).backgroundColor };
    }
    document.documentElement.removeAttribute("data-theme");
    return out;
  });
  (themes.light.ink && themes.dark.ink && themes.light.ink !== themes.dark.ink
    && themes.light.body !== "rgba(0, 0, 0, 0)")
    ? ok("both themes resolve, body painted") : bad("theme tokens: " + JSON.stringify(themes));

  /* 8. layout holds down to 320 */
  for (const w of [390, 360, 320]) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.waitForTimeout(120);
    const r = await page.evaluate(() => {
      const card = document.querySelector(".card");
      const inner = card.getBoundingClientRect().right - parseFloat(getComputedStyle(card).paddingRight);
      const over = [...document.querySelectorAll(".kv div")]
        .map(d => d.lastElementChild.getBoundingClientRect().right - inner);
      return { scroll: document.documentElement.scrollWidth > window.innerWidth + 1,
               overflow: Math.max(...over) };
    });
    (!r.scroll && r.overflow <= 0.5)
      ? ok("layout holds at " + w + "px")
      : bad("layout breaks at " + w + "px (sideways scroll: " + r.scroll + ", overflow: " + r.overflow.toFixed(1) + "px)");
  }

  /* 9. manifest and icons */
  const man = await page.evaluate(async () => {
    const j = await (await fetch("manifest.webmanifest")).json();
    const codes = await Promise.all(j.icons.map(i => fetch(i.src).then(r => r.status)));
    return { display: j.display, codes };
  });
  (man.display === "standalone" && man.codes.every(c => c === 200))
    ? ok("manifest + " + man.codes.length + " icons")
    : bad("manifest or icons: " + JSON.stringify(man));

  /* 10. build numbers agree — the update-never-lands bug */
  const htmlBuild = (fs.readFileSync(path.join(ROOT, "index.html"), "utf8").match(/const BUILD = (\d+)/) || [])[1];
  const swBuild   = (fs.readFileSync(path.join(ROOT, "sw.js"),      "utf8").match(/const BUILD = (\d+)/) || [])[1];
  (htmlBuild && htmlBuild === swBuild)
    ? ok("BUILD matches in index.html and sw.js (" + htmlBuild + ")")
    : bad("BUILD MISMATCH: index.html=" + htmlBuild + " sw.js=" + swBuild + " — updates will not land on installed apps");

  await page.screenshot({ path: path.join(__dirname, "screenshot.png"), fullPage: true });

  console.log("");
  pass.forEach(p => console.log("  ✓ " + p));
  fail.forEach(f => console.log("  ✗ " + f));
  [...new Set(errs)].slice(0, 8).forEach(e => console.log("  ! " + e));
  console.log("\n" + pass.length + " passed, " + fail.length + " failed, " + new Set(errs).size + " js errors");
  console.log("screenshot: test/screenshot.png\n");

  await browser.close();
  server.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
