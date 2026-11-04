import puppeteer from "puppeteer-core";
const B = "https://ccterraandfleet.github.io/Realms";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1400, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 130)));
await p.goto(B, { waitUntil: "load" });
await p.waitForSelector(".lobby-actions button", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1600));
await p.evaluate(() => {
  const btns = [...document.querySelectorAll(".lobby-actions button")];
  (btns.find((x) => /START A NEW MATCH|START A MATCH/.test(x.textContent)) ?? btns[0]).click();
});
await p.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 40000 });
await new Promise((r) => setTimeout(r, 40000));
const info = await p.evaluate(() => {
  const g = window.__realms.game, W = g.world, me = g.players[g.human];
  const mid = W.richness.filter((r) => r > 1.5).length;
  const pocket = W.richness.filter((r) => r > 0.9 && r < 1.1).length;
  // is my realm's ground surrounded by water?
  let shore = 0;
  for (const t of me.tiles) for (const n of g.neighbors4(t)) if (W.terrain[n] === 0) shore++;
  return { players: g.players.length, pockets: W.pockets.length, midTiles: mid, pocketTiles: pocket, myTiles: me.tileCount, shoreTouch: shore, grain: +me.rates.grain.toFixed(2), land: W.landTiles };
});
console.log("live world:", JSON.stringify(info));
// zoom the camera out so the whole layout is on screen
await p.evaluate(() => { const c = window.__realms.cam; c.scale = 2.2; c.x = innerWidth / 2 - (400 / 2) * 2.2; c.y = innerHeight / 2 - (260 / 2) * 2.2; });
await new Promise((r) => setTimeout(r, 900));
await p.screenshot({ path: "test/shot_pockets.png" });
console.log("errors:", errs.length ? errs : "none");
await b.close();
