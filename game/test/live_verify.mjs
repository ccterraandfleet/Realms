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

await page.goto("https://realms-uxvo.onrender.com/?seed=7", { waitUntil: "load", timeout: 90000 });
await page.waitForFunction("window.__realms && window.__realms.game", { timeout: 90000 });

const spawn = await page.evaluate(() => {
  const { game } = window.__realms;
  let best = -1, bd = Infinity;
  for (let i = 0; i < game.owners.length; i++) {
    if (!game.isLand(i) || game.owners[i] >= 0) continue;
    const x = i % game.world.w, y = (i / game.world.w) | 0;
    const d = Math.hypot(x - game.world.w / 2, y - game.world.h / 2);
    if (d < bd) { bd = d; best = i; }
  }
  window.__realms.clickTile(best);
  return { phase: game.phase, tiles: game.players[0].tileCount, lords: game.players.length - 1 };
});
console.log("spawn on live:", spawn);

// click-push like a player: order an army at a point, then watch it advance
const push = await page.evaluate(() => {
  const { game } = window.__realms;
  const me = game.players[0];
  me.troops = 9000;
  const castle = [...game.structs.values()].find((s) => s.owner === me.id);
  const cx = castle.tile % game.world.w, cy = (castle.tile / game.world.w) | 0;
  const target = game.tileAt(cx + 22, cy + 6);
  const before = me.tileCount;
  const ordered = game.orderArmy(me, target, 0.4);
  const a = game.armies[0];
  const trail = [];
  for (let chunk = 0; chunk < 5; chunk++) {
    for (let s = 0; s < 20; s++) game.tick(0.1);
    if (game.armies[0]) trail.push({ tile: game.armies[0].tile, taken: game.armies[0].taken, troops: Math.round(game.armies[0].troops), cutOff: game.armies[0].cutOff });
  }
  const cam = window.__realms.cam;
  cam.scale = 8;
  cam.x = window.innerWidth / 2 - cx * cam.scale;
  cam.y = window.innerHeight / 2 - cy * cam.scale;
  return { ordered, tilesBefore: before, tilesAfter: me.tileCount, trail, host: Math.round(me.troops), cap: game.capacity(me) };
});
console.log("push on live:", JSON.stringify(push, null, 1));
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: "test/live_push.png" });
console.log("errors:", errors.length ? errors.slice(0, 4) : "none");
await browser.close();
