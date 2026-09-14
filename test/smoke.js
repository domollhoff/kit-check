/* Kit Check smoke test. Serves the repo, drives it headless.
   Run after ANY change to the data layer, service worker, tokens, or a flow.

     npm install
     npm test

   Exits non-zero on failure. Writes test/screenshot.png. */

const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");

const ROOT = process.env.KC_ROOT || path.resolve(__dirname, "..");
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
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const pass = [], fail = [], errs = [];
  page.on("pageerror", e => errs.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("dialog", d => d.accept());
  const ok = m => pass.push(m), bad = m => fail.push(m);
  const URL_ = `http://localhost:${PORT}/`;
  const wait = ms => page.waitForTimeout(ms);
  const swipe = async (sel, x0, x1, y) => page.evaluate(async ([sel, x0, x1, y]) => {
    const el = document.querySelector(sel);
    const mk = (type, x, yy) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: el, clientX: x, clientY: yy })] });
    el.dispatchEvent(mk("touchstart", x0, y));
    const step = (x1 - x0) / 6;
    for (let i = 1; i <= 6; i++) { el.dispatchEvent(mk("touchmove", x0 + step * i, y + 2)); await new Promise(r => setTimeout(r, 12)); }
    const mid = el.style.transform;
    el.dispatchEvent(mk("touchend", x1, y + 2));
    await new Promise(r => setTimeout(r, 750));
    return { mid, hash: location.hash, after: el.style.transform };
  }, [sel, x0, x1, y]);

  /* ===================== first run ===================== */
  await page.goto(URL_, { waitUntil: "networkidle" }); await wait(1200);
  const h1 = await page.textContent(".fr0 h1").catch(() => "");
  /Pack against/.test(h1 || "") ? ok("first run shows on an empty database") : bad("first run did not show: " + h1);
  (await page.isHidden("#tabs")) ? ok("tabs hidden during first run") : bad("tabs visible during first run");

  await page.click("[data-act=fr-start]");
  await page.fill("#frKit", "Interview kit"); await page.click("#frNext");
  await page.fill("#frItem", "Sony FX6"); await page.press("#frItem", "Enter"); await wait(80);
  const firstRowMark = await page.evaluate(() => { const r = document.querySelector("#frList .row"); r.dataset.mark = "kept"; return getComputedStyle(document.querySelector("#frHero .blobs")).transform; });
  for (const n of ["Shotgun mic", "Lav mics"]) { await page.fill("#frItem", n); await page.press("#frItem", "Enter"); await wait(80); }
  (await page.locator("#frList .row").count()) === 3 ? ok("first run: 3 items added by typing") : bad("first run rows wrong");
  const kept = await page.evaluate(() => !!document.querySelector('#frList .row[data-mark="kept"]'));
  kept ? ok("first-run list patches in place, existing rows are not rebuilt") : bad("first-run list was rebuilt on add");
  await wait(900);
  const heroT = await page.evaluate(() => ({ fill: getComputedStyle(document.querySelector("#frHero")).getPropertyValue("--fill").trim(), tf: getComputedStyle(document.querySelector("#frHero .blobs")).transform }));
  (parseFloat(heroT.fill) > 0.2 && heroT.tf !== firstRowMark) ? ok("first-run gradient band grows and drifts as items are added") : bad("band: " + JSON.stringify(heroT) + " vs " + firstRowMark);
  await page.click("[data-act=fr-save]"); await wait(700);
  const afterFR = await page.evaluate(async () => ({ items: (await DB.all("items")).length, kits: await DB.all("kits"), meta: await DB.get("meta", "onboarded"), hash: location.hash }));
  (afterFR.items === 3 && afterFR.kits.length === 1 && afterFR.kits[0].itemIds.length === 3 && afterFR.meta && afterFR.meta.value === true) ? ok("first run saved 1 kit with 3 items") : bad("first run save wrong: " + JSON.stringify(afterFR));
  /^#\/home/.test(afterFR.hash) ? ok("lands on Home after first run") : bad("landed on " + afterFR.hash);
  (await page.isVisible("#tabs")) ? ok("tabs visible after first run") : bad("tabs still hidden");

  /* ===================== home ===================== */
  const heroTxt = await page.textContent(".hero");
  /Plan the next shoot/.test(heroTxt) ? ok("home hero with no gig invites planning a shoot") : bad("hero text: " + heroTxt);
  (await page.locator(".hrow .tile").count()) >= 3 ? ok("home shows kit and case tiles") : bad("tiles missing");
  const blobScale = await page.evaluate(() => getComputedStyle(document.querySelector(".hero .blobs")).transform);
  /matrix/.test(blobScale) ? ok("hero blob scales with inventory") : bad("blob transform: " + blobScale);

  /* ===================== photos ===================== */
  const ph = await page.evaluate(async () => {
    const cv = document.createElement("canvas"); cv.width = 2400; cv.height = 1600; const g = cv.getContext("2d"); g.fillStyle = "#c74d3c"; g.fillRect(0, 0, 2400, 1600);
    const big = await new Promise(r => cv.toBlob(r, "image/png")); const id = await Photos.store(big); const rec = await DB.get("photos", id); const bmp = await createImageBitmap(rec.blob);
    return { inBytes: big.size, outBytes: rec.blob.size, type: rec.blob.type, w: bmp.width, h: bmp.height };
  });
  (ph.w === 800 && ph.h === 533 && ph.type === "image/jpeg") ? ok("photo resized to " + ph.w + "x" + ph.h + " jpeg") : bad("photo pipeline: " + JSON.stringify(ph));

  /* ===================== gear ===================== */
  await page.click("[data-go=gear]"); await wait(450);
  await page.click("[data-act=case-new]"); await page.fill("#cName", "Gray Nanuk"); await page.click("#colPick [data-col]"); await page.click("#sheetSave"); await wait(350);
  const cases = await page.evaluate(() => DB.all("containers"));
  cases.length === 1 && cases[0].name === "Gray Nanuk" ? ok("case created") : bad("case create: " + JSON.stringify(cases));
  await page.click("[data-act=item-new]"); await page.fill("#iName", "Step-up rings"); await page.selectOption("#iCase", cases[0].id); await page.fill("#iNote", "The one that slips"); await page.click("#sheetSave"); await wait(350);
  const secs = await page.$$eval("#main .sec h2", els => els.map(e => e.textContent.trim()));
  secs.some(s => /Gray Nanuk/.test(s)) && secs.some(s => /Not in a case/.test(s)) ? ok("gear grouped by case with an unassigned group") : bad("gear groups: " + secs);
  const popped = await page.$$eval("#main .row.new .t", els => els.map(e => e.textContent.trim()));
  popped[0] === "Step-up rings" ? ok("new item pops") : bad("pop: " + JSON.stringify(popped));
  await page.fill("#gearQ", "step"); await wait(350);
  (await page.locator("#main .row").count()) === 1 ? ok("search filters to 1 match") : bad("search");
  await page.fill("#gearQ", ""); await wait(350);

  /* ===================== kits ===================== */
  await page.click("[data-go=kits]"); await wait(450);
  await page.click("[data-act=kit-new]"); await page.fill("#kName", "Lens set");
  const picks = await page.locator("[data-pick]").count();
  await page.click("[data-pick] >> nth=0"); await page.click("[data-pick] >> nth=1"); await page.click("#sheetSave"); await wait(350);
  const kits = await page.evaluate(() => DB.all("kits")); const lens = kits.find(k => k.name === "Lens set");
  (picks === 4 && lens && lens.itemIds.length === 2) ? ok("kit created with 2 of " + picks + " items") : bad("kit create: " + JSON.stringify(kits));

  /* ===================== gigs + pack ===================== */
  await page.click("[data-go=gigs]"); await wait(450);
  await page.click("[data-act=gig-new]"); await page.fill("#gName", "Test shoot"); await page.fill("#gDate", "2026-12-24");
  await page.click("#kitPick .chip >> nth=0"); await page.click("#kitPick .chip >> nth=1"); await page.click("#sheetSave"); await wait(600);
  const gigHash = await page.evaluate(() => location.hash);
  /^#\/gig\//.test(gigHash) ? ok("creating a gig opens its pack screen") : bad("after gig create: " + gigHash);
  const p0 = await page.evaluate(() => { const g = S.gigs[route.arg]; return progress(g); });
  (p0.total === 4 && p0.done === 0 && p0.exTotal === 0) ? ok("gig lists 4 items from 2 kits, none packed") : bad("progress: " + JSON.stringify(p0));
  (await page.locator("#rings circle.ar").count()) === 3 ? ok("three rings drawn") : bad("rings missing");
  const off0 = await page.$eval("#rings circle.ar", c => parseFloat(c.getAttribute("stroke-dashoffset")));

  /* home hero now shows the next shoot */
  await page.click("[data-go=home]"); await wait(450);
  /Next shoot/.test(await page.textContent(".hero")) ? ok("home hero shows the next shoot") : bad("hero missing next shoot");
  await page.click(".hero [data-go=gig]"); await wait(450);

  /* tick one: the existing ring and row must be patched, not rebuilt, so CSS transitions run */
  await page.evaluate(() => { document.querySelector("#rings circle.ar").dataset.mark = "kept"; document.querySelectorAll("#main .row.pack").forEach((r, i) => r.dataset.mark = "r" + i); });
  await page.click("#main .row.pack >> nth=0"); await wait(450);
  const off1 = await page.$eval("#rings circle.ar", c => parseFloat(c.getAttribute("stroke-dashoffset")));
  off1 < off0 ? ok("ticking an item advances the outer ring (" + off0.toFixed(0) + " → " + off1.toFixed(0) + ")") : bad("ring did not advance");
  (await page.locator("#main .row.pack.done").count()) === 1 ? ok("ticked row shows done") : bad("row not done");
  const same = await page.evaluate(() => ({ ring: document.querySelector('#rings circle.ar[data-mark="kept"]') !== null, rows: document.querySelectorAll('#main .row.pack[data-mark]').length }));
  (same.ring && same.rows >= 4) ? ok("tick patches the ring and rows in place, nothing rebuilt") : bad("tick rebuilt the screen: " + JSON.stringify(same));
  const ringTransition = await page.evaluate(() => getComputedStyle(document.querySelector("#rings circle.ar")).transitionDuration);
  /0\.[5-9]|1\./.test(ringTransition) ? ok("ring has a transition to animate through (" + ringTransition + ")") : bad("ring transition: " + ringTransition);

  /* one-off: first make sure there is something not already on the gig */
  await page.evaluate(() => Store.save("items", { id: "x_slider", name: "Slider", category: "grip", containerId: "", photoId: "", note: "", archived: false, createdAt: new Date().toISOString() }));
  await page.click("[data-act=addone]"); await wait(450);
  await page.click("[data-pick] >> nth=0"); await page.click("#sheetSave"); await wait(450);
  (await page.locator(".grp.oneoff").count()) === 1 && (await page.locator(".grp.oneoff .pill").count()) === 1 ? ok("one-off block appears at the top with a pill") : bad("one-off block missing");
  const p1 = await page.evaluate(() => progress(S.gigs[route.arg]));
  p1.exTotal === 1 && p1.total === 5 ? ok("one-off counted separately (" + p1.exTotal + " of " + p1.total + ")") : bad("one-off count: " + JSON.stringify(p1));

  /* tick everything, expect the punch and the load-out */
  let guard = 0;
  while ((await page.locator("#main .row.pack[data-act=tick]:not(.done)").count()) > 0 && guard++ < 12) { await page.click("#main .row.pack[data-act=tick]:not(.done) >> nth=0"); await wait(320); }
  await wait(300);
  (await page.locator("#punch").count()) === 1 ? ok("completion punch fires") : bad("no punch");
  (await page.locator("#loadout").count()) === 1 ? ok("load-out card appears when everything is packed") : bad("no load-out");
  (await page.locator(".grp.collapsed").count()) >= 1 ? ok("a fully packed case collapses to a done row") : bad("no collapsed group");
  const collapsedBefore = await page.locator(".grp.collapsed").count();
  await page.click(".donerow[data-act=expand] >> nth=0"); await wait(300);
  (await page.locator(".grp.collapsed").count()) === collapsedBefore - 1 ? ok("collapsed case expands on tap") : bad("did not expand");

  /* load the cases */
  while ((await page.locator("#loadout .row.pack:not(.done)").count()) > 0 && guard++ < 24) { await page.click("#loadout .row.pack:not(.done) >> nth=0"); await wait(320); }
  await wait(200);
  const done = await page.evaluate(() => { const g = S.gigs[route.arg]; return { completed: !!g.completedAt, ready: !!document.querySelector(".ready") }; });
  done.completed && done.ready ? ok("loading every case completes the gig") : bad("completion: " + JSON.stringify(done));

  /* ===================== motion & identity ===================== */
  await page.click("[data-go=home]"); await wait(500);
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('800 20px "Jakarta"'); });
  fonts ? ok("self-hosted Jakarta loaded") : bad("font not loaded");
  const stag = await page.$$eval("#main .tile", els => els.slice(0, 2).map(e => getComputedStyle(e).animationDelay));
  stag.length === 2 && stag[0] !== stag[1] ? ok("tiles stagger in") : bad("no stagger: " + stag);
  const sw1 = await swipe("#main", 300, 120, 600);
  (/translateX\(-/.test(sw1.mid) && /gigs/.test(sw1.hash) && sw1.after === "") ? ok("swipe home → gigs follows the finger and commits") : bad("swipe: " + JSON.stringify(sw1));
  await page.click("[data-act=gig-new]"); await wait(450);
  const dismissed = await page.evaluate(async () => { const s = document.getElementById("sheet"); if (!s) return "no sheet";
    const mk = (type, y) => new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: s, clientX: 200, clientY: y })] });
    s.dispatchEvent(mk("touchstart", 100)); for (let y = 100; y <= 300; y += 40) s.dispatchEvent(mk("touchmove", y)); s.dispatchEvent(mk("touchend", 300));
    await new Promise(r => setTimeout(r, 400)); return document.getElementById("sheet") ? "still open" : "closed"; });
  dismissed === "closed" ? ok("sheet dismisses on drag down") : bad("sheet drag: " + dismissed);

  /* ===================== foundation still true ===================== */
  await page.click("[data-go=home]"); await wait(300); await page.click("[data-go=settings]"); await wait(450);
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return r ? (r.active ? "active" : "installing") : "none"; });
  sw !== "none" ? ok("service worker " + sw) : bad("no service worker");
  const rt = await page.evaluate(async () => { const snap = await Backup.export(); const before = await DB.counts(); await DB.clearAll(); const mid = await DB.counts(); await Backup.restore(snap); const after = await DB.counts(); const g = (await DB.all("gigs"))[0]; return { before, mid, after, packedKept: g && Object.keys(g.packed || {}).length }; });
  (rt.mid.items === 0 && JSON.stringify(rt.before) === JSON.stringify(rt.after) && rt.after.gigs === 1 && rt.packedKept === 5) ? ok("backup round trip with a packed gig: " + JSON.stringify(rt.after)) : bad("ROUND TRIP: " + JSON.stringify(rt));
  await page.reload({ waitUntil: "networkidle" }); await wait(700);
  (await page.evaluate(() => DB.counts())).gigs === 1 ? ok("data survives reload") : bad("lost data on reload");
  await ctx.setOffline(true); const p2 = await ctx.newPage(); let offOK = false;
  try { await p2.goto(URL_, { waitUntil: "domcontentloaded", timeout: 15000 }); await p2.waitForTimeout(700); offOK = !!(await p2.textContent(".hero")); } catch (e) {}
  offOK ? ok("opens offline") : bad("did not open offline"); await ctx.setOffline(false); await p2.close();
  const themes = await page.evaluate(() => { const o = {}; for (const t of ["light", "dark"]) { document.documentElement.setAttribute("data-theme", t); const cs = getComputedStyle(document.documentElement); o[t] = { ink: cs.getPropertyValue("--ink").trim(), body: getComputedStyle(document.body).backgroundColor }; } document.documentElement.removeAttribute("data-theme"); return o; });
  (themes.light.ink !== themes.dark.ink && themes.light.body !== "rgba(0, 0, 0, 0)") ? ok("both themes resolve") : bad("themes: " + JSON.stringify(themes));
  for (const w of [390, 320]) { await page.setViewportSize({ width: w, height: 844 }); await wait(120); const s = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); !s ? ok("no sideways scroll at " + w) : bad("sideways scroll at " + w); }
  await page.setViewportSize({ width: 390, height: 844 });
  const htmlBuild = (fs.readFileSync(path.join(ROOT, "index.html"), "utf8").match(/const BUILD = (\d+)/) || [])[1];
  const swBuild = (fs.readFileSync(path.join(ROOT, "sw.js"), "utf8").match(/const BUILD = (\d+)/) || [])[1];
  htmlBuild === swBuild ? ok("BUILD matches in index.html and sw.js (" + htmlBuild + ")") : bad("BUILD MISMATCH " + htmlBuild + " vs " + swBuild);
  const small = await page.$$eval("button:not([hidden])", els => els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 36; }).map(e => e.className + ":" + Math.round(e.getBoundingClientRect().height)));
  small.length === 0 ? ok("every visible button ≥ 36px tall") : bad("small tap targets: " + small.slice(0, 5).join(", "));

  await page.screenshot({ path: path.join(__dirname, "screenshot.png"), fullPage: true });
  console.log(""); pass.forEach(p => console.log("  ✓ " + p)); fail.forEach(f => console.log("  ✗ " + f)); [...new Set(errs)].slice(0, 8).forEach(e => console.log("  ! " + e));
  console.log("\n" + pass.length + " passed, " + fail.length + " failed, " + new Set(errs).size + " js errors\n");
  await browser.close(); server.close();
  process.exit(fail.length || errs.length ? 1 : 0);
})();
