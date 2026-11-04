import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1400, height: 900 } });
const p = await browser.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));
await p.goto("https://ccterraandfleet.github.io/Realms/?seed=7", { waitUntil: "load", timeout: 90000 });
await p.waitForSelector(".lobby-go", { timeout: 60000 });
await p.click(".lobby-go");
await p.waitForFunction(() => window.__realms?.game?.phase === "playing", { timeout: 45000 });
const out = await p.evaluate(async () => {
  const { game } = window.__realms;
  const me = game.players[0];
  // find open ground 10-16 tiles from our castle
  const home = [...me.tiles][0];
  let target = -1;
  for (let i = 0; i < game.owners.length; i++) {
    if (game.owners[i] !== -1 || !game.isLand(i)) continue;
    const d = game.tileDistance(i, home);
    if (d > 8 && d < 16) { target = i; break; }
  }
  const before = me.tileCount;
  const ok = game.orderArmy(me, target, 0.3);
  const nodes = game.claimNodes.length;
  await new Promise((r) => setTimeout(r, 4000));
  return {
    planted: ok, nodes, armies: game.armies.filter((a) => a.owner === me.id).length,
    grew: me.tileCount - before, nodeDone: game.claimNodes[0]?.done ?? null,
  };
});
console.log(out, "errors:", errs.length ? errs : "none");
await browser.close();
