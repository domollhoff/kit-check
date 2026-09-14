/* Kit Check smoke test. Serves the repo, drives it headless.
   Run after ANY change to the data layer, service worker, tokens, or a flow.

     npm install
     npm test

   Exits non-zero on failure. Writes test/screenshot.png. */

const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8123;
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".png":"image/png", ".webmanifest":"application/manifest+json", ".json":"application/json", ".css":"text/css", ".svg":"image/svg+xml", ".woff2":"font/woff2" };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Service-Worker-Allowed": "/" });
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
  const ok = m => pass.push(m), bad = m => fail.push(m);
  const URL_ = `http://localhost:${PORT}/`;

  /* ===================== Phase 1: first run ===================== */
  await page.goto(URL_, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  let h2 = await page.textContent("h2");
  /Pack against/.test(h2 || "") ? ok("first run shows on an empty database") : bad("first run did not show, got: " + h2);
  (await page.isHidden("#tabs")) ? ok("tabs hidden during first run") : bad("tabs visible during first run");

  await page.click("[data-act=fr-start]");
  await page.fill("#frKit", "Interview kit");
  await page.click("#frNext");
  for (const n of ["Sony FX6", "Shotgun mic", "Lav mics"]) { await page.fill("#frItem", n); await page.press("#frItem", "Enter"); await page.waitForTimeout(80); }
  const frCount = await page.locator("#frList .row").count();
  frCount === 3 ? ok("first run: 3 items added by typing") : bad("first run: expected 3 rows, got " + frCount);

  /* gradient responds to kit size */
  const op = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--p-op")));
  (op > 0.2 && op < 0.6) ? ok("gradient opacity tracks kit size (" + op.toFixed(2) + ")") : bad("gradient did not respond: " + op);

  await page.click("[data-act=fr-save]");
  await page.waitForTimeout(600);
  const afterFR = await page.evaluate(async () => ({ items: (await DB.all("items")).length, kits: await DB.all("kits"), meta: await DB.get("meta", "onboarded"), hash: location.hash }));
  (afterFR.items === 3 && afterFR.kits.length === 1 && afterFR.kits[0].itemIds.length === 3 && afterFR.meta && afterFR.meta.value === true)
    ? ok("first run saved 1 kit with 3 items and marked onboarded")
    : bad("first run save wrong: " + JSON.stringify(afterFR));
  /^#\/gear/.test(afterFR.hash) ? ok("lands on gear after first run") : bad("landed on " + afterFR.hash);
  (await page.isVisible("#tabs")) ? ok("tabs visible after first run") : bad("tabs still hidden");

  /* categories guessed from names */
  const cats = await page.evaluate(async () => (await DB.all("items")).map(i => i.name + ":" + i.category).sort());
  JSON.stringify(cats) === JSON.stringify(["Lav mics:audio", "Shotgun mic:audio", "Sony FX6:camera"]) ? ok("categories guessed from names") : bad("category guess: " + cats);

  /* ===================== Phase 1: photos ===================== */
  const ph = await page.evaluate(async () => {
    const cv = document.createElement("canvas"); cv.width = 2400; cv.height = 1600;
    const g = cv.getContext("2d"); g.fillStyle = "#c74d3c"; g.fillRect(0, 0, 2400, 1600); g.fillStyle = "#fff"; g.fillRect(200, 200, 800, 800);
    const big = await new Promise(r => cv.toBlob(r, "image/png"));
    const id = await Photos.store(big);
    const rec = await DB.get("photos", id);
    const bmp = await createImageBitmap(rec.blob);
    return { inBytes: big.size, outBytes: rec.blob.size, type: rec.blob.type, w: bmp.width, h: bmp.height };
  });
  (ph.w === 800 && ph.h === 533 && ph.type === "image/jpeg" && ph.outBytes < ph.inBytes)
    ? ok("photo resized 2400x1600 → " + ph.w + "x" + ph.h + " jpeg, " + ph.inBytes + "B → " + ph.outBytes + "B")
    : bad("photo pipeline: " + JSON.stringify(ph));

  /* ===================== Phase 1: gear, cases, search ===================== */
  await page.click("[data-act=case-new]");
  await page.fill("#cName", "Gray Nanuk");
  await page.click("#colPick [data-col]");
  await page.click("#sheetSave");
  await page.waitForTimeout(300);
  const cases = await page.evaluate(() => DB.all("containers"));
  cases.length === 1 && cases[0].name === "Gray Nanuk" ? ok("case created") : bad("case create: " + JSON.stringify(cases));

  await page.click("[data-act=item-new]");
  await page.fill("#iName", "Step-up rings");
  await page.selectOption("#iCase", cases[0].id);
  await page.fill("#iNote", "The one that slips");
  await page.click("#sheetSave");
  await page.waitForTimeout(300);
  const secs = await page.$$eval(".sectitle", els => els.map(e => e.textContent.trim()));
  secs.some(s => /Gray Nanuk/.test(s)) && secs.some(s => /Not in a case/.test(s)) ? ok("gear grouped by case with an unassigned group") : bad("gear groups: " + secs);

  await page.fill("#gearQ", "step");
  await page.waitForTimeout(350);
  const shown = await page.locator("#main .row").count();
  shown === 1 ? ok("search filters to 1 match") : bad("search showed " + shown + " rows for 'step'");
  await page.fill("#gearQ", ""); await page.waitForTimeout(350);

  /* edit an item: rename persists */
  const firstRowId = await page.getAttribute("#main .row[data-act=item-edit]", "data-id");
  await page.click(`#main .row[data-id="${firstRowId}"]`);
  await page.fill("#iName", "Renamed thing");
  await page.click("#sheetSave"); await page.waitForTimeout(300);
  const renamed = await page.evaluate(id => DB.get("items", id), firstRowId);
  renamed.name === "Renamed thing" ? ok("item edit persists") : bad("rename did not persist");

  /* ===================== Phase 1: kits ===================== */
  await page.click("[data-go=kits]"); await page.waitForTimeout(300);
  await page.click("[data-act=kit-new]");
  await page.fill("#kName", "Lens set");
  const picks = await page.locator("[data-pick]").count();
  await page.click("[data-pick] >> nth=0"); await page.click("[data-pick] >> nth=1");
  await page.click("#sheetSave"); await page.waitForTimeout(300);
  const kits = await page.evaluate(() => DB.all("kits"));
  const lens = kits.find(k => k.name === "Lens set");
  (picks === 4 && lens && lens.itemIds.length === 2) ? ok("kit created with 2 of " + picks + " items") : bad("kit create: " + JSON.stringify(kits));

  /* deleting a referenced item does not break kit render */
  await page.evaluate(async id => { await Store.remove("items", id); }, lens.itemIds[0]);
  await page.click("[data-go=gear]"); await page.click("[data-go=kits]"); await page.waitForTimeout(300);
  const kitRowText = await page.textContent(`.row[data-id="${lens.id}"]`);
  /1 item/.test(kitRowText) ? ok("kit survives deletion of a referenced item (shows 1 item)") : bad("kit row after delete: " + kitRowText);

  /* ===================== Phase 0: still true ===================== */
  await page.click("[data-go=settings]"); await page.waitForTimeout(300);
  const dbv = await page.evaluate(() => DB._db.version);
  dbv === 1 ? ok("IndexedDB v1") : bad("db version " + dbv);

  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? (r.active ? "active" : "installing") : "none"; });
  sw !== "none" ? ok("service worker " + sw) : bad("no service worker");

  const rt = await page.evaluate(async () => {
    const snap = await Backup.export(); const before = await DB.counts();
    await DB.clearAll(); const mid = await DB.counts();
    await Backup.restore(snap); const after = await DB.counts();
    const ph = (await DB.all("photos"))[0];
    return { before, mid, after, photoBytes: ph && ph.blob ? ph.blob.size : 0 };
  });
  (rt.mid.items === 0 && JSON.stringify(rt.before) === JSON.stringify(rt.after) && rt.photoBytes > 0 && rt.after.kits === 2)
    ? ok("backup round trip with real data: " + JSON.stringify(rt.after)) : bad("BACKUP ROUND TRIP FAILED: " + JSON.stringify(rt));

  await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(600);
  const kept = await page.evaluate(() => DB.counts());
  kept.kits === 2 ? ok("data survives reload") : bad("lost data on reload");

  await ctx.setOffline(true);
  const p2 = await ctx.newPage(); let offH2 = "";
  try { await p2.goto(URL_, { waitUntil: "domcontentloaded", timeout: 15000 }); await p2.waitForTimeout(600); offH2 = await p2.textContent("h2"); } catch (e) {}
  offH2 ? ok("opens offline") : bad("did not open offline");
  await ctx.setOffline(false); await p2.close();

  const themes = await page.evaluate(() => { const o = {}; for (const t of ["light", "dark"]) { document.documentElement.setAttribute("data-theme", t); const cs = getComputedStyle(document.documentElement); o[t] = { ink: cs.getPropertyValue("--ink").trim(), body: getComputedStyle(document.body).backgroundColor }; } document.documentElement.removeAttribute("data-theme"); return o; });
  (themes.light.ink !== themes.dark.ink && themes.light.body !== "rgba(0, 0, 0, 0)") ? ok("both themes resolve") : bad("themes: " + JSON.stringify(themes));

  for (const w of [390, 320]) {
    await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(120);
    const s = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    !s ? ok("no sideways scroll at " + w) : bad("sideways scroll at " + w);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  const htmlBuild = (fs.readFileSync(path.join(ROOT, "index.html"), "utf8").match(/const BUILD = (\d+)/) || [])[1];
  const swBuild = (fs.readFileSync(path.join(ROOT, "sw.js"), "utf8").match(/const BUILD = (\d+)/) || [])[1];
  htmlBuild === swBuild ? ok("BUILD matches in index.html and sw.js (" + htmlBuild + ")") : bad("BUILD MISMATCH " + htmlBuild + " vs " + swBuild);

  /* ===================== Motion & identity ===================== */
  await page.click("[data-go=gear]"); await page.waitForTimeout(500);
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return { display: document.fonts.check('800 20px "Archivo"'), mono: document.fonts.check('600 12px "Plex Mono"') }; });
  (fonts.display && fonts.mono) ? ok("self-hosted fonts loaded (Archivo, Plex Mono)") : bad("fonts not loaded: " + JSON.stringify(fonts));

  const h2font = await page.evaluate(() => getComputedStyle(document.querySelector("h2")).fontFamily);
  /Archivo/.test(h2font) ? ok("headings use the display face") : bad("h2 font: " + h2font);

  const stag = await page.$$eval("#main .row", els => els.slice(0, 3).map(e => getComputedStyle(e).animationDelay));
  (stag.length === 3 && stag[0] !== stag[2]) ? ok("rows stagger in (" + stag.join(", ") + ")") : bad("no stagger: " + stag);

  /* swipe right-to-left on gear should land on kits */
  const swiped = await page.evaluate(async () => {
    const main = document.getElementById("main");
    const mk = (type, x, y) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: main, clientX: x, clientY: y })] });
    main.dispatchEvent(mk("touchstart", 300, 400));
    for (let x = 300; x >= 120; x -= 30) { main.dispatchEvent(mk("touchmove", x, 402)); await new Promise(r => setTimeout(r, 12)); }
    const mid = main.style.transform;
    main.dispatchEvent(mk("touchend", 120, 402));
    await new Promise(r => setTimeout(r, 700));
    return { mid, hash: location.hash, transformAfter: main.style.transform };
  });
  (/translateX\(-/.test(swiped.mid) && /kits/.test(swiped.hash) && swiped.transformAfter === "")
    ? ok("swipe follows the finger and commits to the next tab") : bad("swipe: " + JSON.stringify(swiped));

  /* vertical drag must NOT navigate */
  const vert = await page.evaluate(async () => {
    const main = document.getElementById("main");
    const mk = (type, x, y) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: main, clientX: x, clientY: y })] });
    main.dispatchEvent(mk("touchstart", 200, 300));
    for (let y = 300; y <= 500; y += 40) main.dispatchEvent(mk("touchmove", 204, y));
    main.dispatchEvent(mk("touchend", 204, 500));
    await new Promise(r => setTimeout(r, 300));
    return { hash: location.hash, t: main.style.transform };
  });
  (/kits/.test(vert.hash) && !vert.t) ? ok("vertical drag leaves navigation alone") : bad("vertical drag: " + JSON.stringify(vert));

  /* tab indicator moved */
  const ind = await page.evaluate(() => document.getElementById("tabInd").style.transform);
  /200%|2 \*/.test(ind) ? ok("tab indicator tracks the active tab") : bad("indicator: " + ind);

  /* sheet: drag down dismisses */
  await page.click("[data-act=kit-new]"); await page.waitForTimeout(450);
  const dismissed = await page.evaluate(async () => {
    const s = document.getElementById("sheet"); if (!s) return "no sheet";
    const mk = (type, y) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: s, clientX: 200, clientY: y })] });
    s.dispatchEvent(mk("touchstart", 100));
    for (let y = 100; y <= 300; y += 40) s.dispatchEvent(mk("touchmove", y));
    s.dispatchEvent(mk("touchend", 300));
    await new Promise(r => setTimeout(r, 400));
    return document.getElementById("sheet") ? "still open" : "closed";
  });
  dismissed === "closed" ? ok("sheet dismisses on drag down") : bad("sheet drag: " + dismissed);

  /* a new item pops */
  await page.click("[data-go=gear]"); await page.waitForTimeout(500);
  await page.click("[data-act=item-new]"); await page.fill("#iName", "Popper"); await page.click("#sheetSave"); await page.waitForTimeout(150);
  const popped = await page.$$eval("#main .row.new .t", els => els.map(e => e.textContent.trim()));
  (popped.length === 1 && popped[0] === "Popper") ? ok("newly added item gets the pop animation") : bad("pop: " + JSON.stringify(popped));
  await page.waitForTimeout(500);

  /* tap targets on the gear list */
  await page.click("[data-go=gear]"); await page.waitForTimeout(300);
  const small = await page.$$eval("button:not([hidden])", els => els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 36; }).map(e => e.className + ":" + Math.round(e.getBoundingClientRect().height)));
  small.length === 0 ? ok("every visible button ≥ 36px tall") : bad("small tap targets: " + small.slice(0, 5).join(", "));

  await page.screenshot({ path: path.join(__dirname, "screenshot.png"), fullPage: true });

  console.log("");
  pass.forEach(p => console.log("  ✓ " + p));
  fail.forEach(f => console.log("  ✗ " + f));
  [...new Set(errs)].slice(0, 8).forEach(e => console.log("  ! " + e));
  console.log("\n" + pass.length + " passed, " + fail.length + " failed, " + new Set(errs).size + " js errors\n");
  await browser.close(); server.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
