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

await page.goto("https://realms-uxvo.onrender.com/?seed=7", { waitUntil: "load" });
await page.waitForFunction("window.__realms && window.__realms.game");
await new Promise((r) => setTimeout(r, 400));

const info = await page.evaluate(() => {
  const { game } = window.__realms;
  return { phase: game.phase, w: game.world.w, h: game.world.h, land: game.world.landTiles };
});
console.log("loaded:", info);

// pick a central land tile, exactly like clicking the map
const picked = await page.evaluate(() => {
  const { game } = window.__realms;
  let best = -1, bd = Infinity;
  for (let i = 0; i < game.owners.length; i++) {
    if (!game.isLand(i) || game.owners[i] >= 0) continue;
    const x = i % game.world.w, y = (i / game.world.w) | 0;
    const d = Math.hypot(x - game.world.w / 2, y - game.world.h / 2);
    if (d < bd) { bd = d; best = i; }
  }
  window.__realms.clickTile(best);
  return { tile: best, phase: game.phase, tiles: game.players[0].tileCount, castles: [...game.structs.values()].length };
});
console.log("spawned:", picked);
await new Promise((r) => setTimeout(r, 800));

// play a bit: expand outward and drop a couple of buildings, so the shot has
// marching columns, several realms and structures in frame
await page.evaluate(() => {
  const { game } = window.__realms;
  const me = game.players[0];
  for (let k = 0; k < 90; k++) {
    const targets = [];
    for (const i of me.tiles) for (const n of game.neighbors8(i)) if (game.canAttack(me, n)) targets.push(n);
    targets.sort(() => Math.random() - 0.5);
    for (const t of targets.slice(0, 4)) game.attack(me, t, 0.3);
    for (let s = 0; s < 10; s++) game.tick(0.1);
  }
  me.gold = 900;
  const own = [...me.tiles];
  const empty = own.filter((t) => !game.structs.has(t));
  game.build(me, "castle", empty[3]);
  game.build(me, "tower", empty[6]);
  const coast = own.find((t) => game.isCoastal(t) && !game.structs.has(t));
  if (coast !== undefined) game.build(me, "harbor", coast);
  game.build(me, "siege", empty[9]);
});
await new Promise((r) => setTimeout(r, 500));

const state = await page.evaluate(() => {
  const { game } = window.__realms;
  const me = game.players[0];
  return {
    tiles: me.tileCount, troops: Math.round(me.troops), cap: game.capacity(me),
    gold: Math.round(me.gold), castles: me.castles,
    structures: [...game.structs.values()].length,
    attacks: game.attacks.length,
    lords: game.players.length - 1,
  };
});
console.log("state:", state);

await page.screenshot({ path: "test/live_world.png" });
// close-up of the player's holding, where castles and columns are legible
await page.evaluate(() => {
  const { game, cam } = window.__realms;
  const me = game.players[0];
  const first = [...me.tiles][0];
  const x = first % game.world.w, y = (first / game.world.w) | 0;
  cam.scale = 14;
  cam.x = window.innerWidth / 2 - x * cam.scale;
  cam.y = window.innerHeight / 2 - y * cam.scale;
});
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: "test/live_close.png" });

console.log("page errors:", errors.length ? errors.slice(0, 5) : "none");
await browser.close();
