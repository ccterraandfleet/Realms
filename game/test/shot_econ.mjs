import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const errs = [];
page.on("pageerror", (e) => errs.push("page: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
await page.goto("file:///app/conversations/6aa33724f3157777399c8b42/realms/index.html?seed=7", { waitUntil: "load" });
await page.waitForFunction("window.__realms && window.__realms.game");

// seat the human on good mixed ground, then run a short economy, then push
const info = await page.evaluate(() => {
  const r = window.__realms;
  const g = r.game;
  let best = -1, bs = -1;
  for (let i = 0; i < g.owners.length; i += 7) {
    if (!g.isLand(i) || g.owners[i] >= 0) continue;
    const q = g.siteQuality(i, 5);
    if (q > bs) { bs = q; best = i; }
  }
  r.clickTile(best);
  const me = g.players[g.human];
  me.timber = 2500; me.gold = 900; me.ore = 700; me.grain = 600;
  for (let i = 0; i < 900; i++) {
    g.tick(0.1);
    if (i % 20) continue;
    for (const [kind, terr] of [["farm", 2], ["lumber", 3], ["mine", 4]]) {
      const t = [...me.tiles].find((x) => g.world.terrain[x] === terr && !g.structs.has(x));
      if (t !== undefined) g.build(me, kind, t);
    }
    const keep = [...me.tiles].find((x) => !g.structs.has(x));
    if (keep !== undefined) g.build(me, "castle", keep);
    for (const own of me.tiles) {
      let done = false;
      for (const n of g.neighbors4(own)) {
        if (g.owners[n] !== me.id && g.isLand(n) && g.orderArmy(me, n, 0.3)) { done = true; break; }
      }
      if (done) break;
    }
  }
  // frame the holding
  const t = [...me.tiles][Math.floor(me.tiles.size / 2)];
  r.cam.scale = 6;
  r.cam.x = window.innerWidth / 2 - (t % g.world.w) * 6;
  r.cam.y = window.innerHeight / 2 - Math.floor(t / g.world.w) * 6;
  const counts = {};
  for (const s of g.structs.values()) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
  return {
    tiles: me.tileCount, cap: g.capacity(me), grain: me.grainProd.toFixed(1),
    timber: me.rates.timber.toFixed(2), ore: me.rates.ore.toFixed(2), gold: me.rates.gold.toFixed(2),
    structures: counts, armies: g.armies.filter((a) => a.owner === me.id).length,
  };
});
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: "test/shot_econ.png" });
console.log(JSON.stringify(info));
console.log("errors:", errs.length ? errs.slice(0, 4) : "none");
await browser.close();
