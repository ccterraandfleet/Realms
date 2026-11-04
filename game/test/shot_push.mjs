import puppeteer from "puppeteer-core";

const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("file:///app/conversations/6aa33724f3157777399c8b42/realms/index.html?seed=7", { waitUntil: "load" });
await page.waitForFunction("window.__realms && window.__realms.game");

const info = await page.evaluate(() => {
  const { game } = window.__realms;
  let best = -1, bd = Infinity;
  for (let i = 0; i < game.owners.length; i++) {
    if (!game.isLand(i) || game.owners[i] >= 0) continue;
    const x = i % game.world.w, y = (i / game.world.w) | 0;
    const d = Math.hypot(x - game.world.w / 2, y - game.world.h / 2);
    if (d < bd) { bd = d; best = i; }
  }
  window.__realms.clickTile(best);
  return { tile: best, phase: game.phase, tiles: game.players[0].tileCount };
});
console.log("spawned:", info);

// launch several pushes in different directions and let them advance
const state = await page.evaluate(() => {
  const { game } = window.__realms;
  const me = game.players[0];
  me.troops = 26000;
  const castle = [...game.structs.values()].find((s) => s.owner === me.id);
  const cx = castle.tile % game.world.w, cy = (castle.tile / game.world.w) | 0;
  const dirs = [[26, 2], [-22, 8], [4, -24], [16, 18]];
  for (const [dx, dy] of dirs) {
    const t = game.tileAt(cx + dx, cy + dy);
    if (t >= 0) game.orderArmy(me, t, 0.16);
  }
  for (let s = 0; s < 70; s++) game.tick(0.1);
  // cut one column off from home so the rout warning is on screen
  const far = game.armies.slice().sort((a, b) => b.taken - a.taken)[0];
  if (far) {
    const rival = game.players.find((p) => p.isBot && p.alive);
    const ax = far.tile % game.world.w, ay = (far.tile / game.world.w) | 0;
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
      const t = game.tileAt(ax + dx, ay + dy);
      if (t < 0 || game.ownerAt(t) !== me.id) continue;
      game.owners[t] = rival.id;
      me.tiles.delete(t); rival.tiles.add(t);
      me.tileCount--; rival.tileCount++;
      game.dirty.add(t);
    }
    for (let s = 0; s < 12; s++) game.tick(0.1);
  }
  // frame the player's holding
  const cam = window.__realms.cam;
  cam.scale = 9;
  cam.x = window.innerWidth / 2 - cx * cam.scale;
  cam.y = window.innerHeight / 2 - cy * cam.scale;
  return {
    armies: game.armies.length,
    cutOff: game.armies.filter((a) => a.cutOff).length,
    tiles: me.tileCount,
    taken: game.armies.map((a) => a.taken),
  };
});
console.log("field:", state);
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: "test/shot_push.png" });
console.log("errors:", errors.length ? errors.slice(0, 4) : "none");
await browser.close();
