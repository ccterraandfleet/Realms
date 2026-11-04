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

// screen position of a tile, straight from the live camera
const toScreen = (tile) => page.evaluate((t) => {
  const { game, cam } = window.__realms;
  const x = t % game.world.w, y = (t / game.world.w) | 0;
  return { x: cam.x + (x + 0.5) * cam.scale, y: cam.y + (y + 0.5) * cam.scale };
}, tile);

// --- spawn: one single click still places the castle ---
const spawnTile = await page.evaluate(() => {
  const { game } = window.__realms;
  let best = -1, bd = Infinity;
  for (let i = 0; i < game.owners.length; i++) {
    if (!game.isLand(i) || game.owners[i] >= 0) continue;
    const x = i % game.world.w, y = (i / game.world.w) | 0;
    const d = Math.hypot(x - game.world.w / 2, y - game.world.h / 2);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
});
let p = await toScreen(spawnTile);
await page.mouse.click(Math.round(p.x), Math.round(p.y));
const phase = await page.evaluate(() => window.__realms.game.phase);
console.log("single click in spawn phase plants the castle:", phase === "playing");

// screen centre the player's holding so the test clicks real ground
await page.evaluate(() => {
  const { game, cam } = window.__realms;
  const me = game.players[0];
  me.troops = 12000;
  const castle = [...game.structs.values()].find((s) => s.owner === me.id);
  const x = castle.tile % game.world.w, y = (castle.tile / game.world.w) | 0;
  cam.scale = 8;
  cam.x = window.innerWidth / 2 - x * cam.scale;
  cam.y = window.innerHeight / 2 - y * cam.scale;
  window.__realms.__target = game.tileAt(x + 10, y + 3);
});
const targetTile = await page.evaluate(() => window.__realms.__target);
p = await toScreen(targetTile);

const mine = () => page.evaluate(() => window.__realms.game.armies.filter((a) => a.owner === 0).length);

// --- one click must NOT send anything ---
await page.mouse.click(Math.round(p.x), Math.round(p.y));
await new Promise((r) => setTimeout(r, 120));
const afterSingle = await mine();
console.log("single click sent no advance:", afterSingle === 0);

// --- double click sends exactly one advance at that point ---
await page.mouse.click(Math.round(p.x), Math.round(p.y), { clickCount: 2, delay: 60 });
await new Promise((r) => setTimeout(r, 120));
const afterDouble = await mine();
const order = await page.evaluate(() => {
  const a = window.__realms.game.armies.find((x) => x.owner === 0);
  return a ? { target: a.target, troops: Math.round(a.troops), speed: Number(a.speed.toFixed(2)) } : null;
});
console.log("double click sent an advance:", afterDouble === 1, "| aimed at the clicked tile:", order && order.target === targetTile, order);

// --- and it actually collects ground toward that point ---
const advance = await page.evaluate(async () => {
  const { game } = window.__realms;
  const me = game.players[0];
  const before = me.tileCount;
  const a = game.armies.find((x) => x.owner === 0);
  const startTile = a.tile;
  for (let s = 0; s < 40; s++) game.tick(0.1);
  return { before, after: me.tileCount, taken: a.taken, movedFrom: startTile, nowAt: a.tile, holding: a.holding };
});
console.log("the column advanced:", JSON.stringify(advance));
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: "test/shot_double.png" });
console.log("errors:", errors.length ? errors.slice(0, 3) : "none");
await browser.close();
