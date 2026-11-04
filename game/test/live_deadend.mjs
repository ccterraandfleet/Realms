import puppeteer from "puppeteer-core";
const B = "https://ccterraandfleet.github.io/Realms";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1300, height: 850 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
await p.goto(B, { waitUntil: "load" });
await p.waitForSelector(".lobby-actions button", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1600));
await p.evaluate(() => {
  const btns = [...document.querySelectorAll(".lobby-actions button")];
  (btns.find((x) => /START A NEW MATCH|START A MATCH/.test(x.textContent)) ?? btns[0]).click();
});
await p.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 40000 });
await new Promise((r) => setTimeout(r, 36000));
// strip the player to nothing exactly like a bad purchase would
const after = await p.evaluate(async () => {
  const g = window.__realms.game;
  const me = g.players[g.human];
  me.grain = 0; me.timber = 0; me.ore = 0; me.gold = 0;
  const t0 = me.tileCount;
  await new Promise((r) => setTimeout(r, 26000));
  return { t0, t1: me.tileCount, rates: { ...me.rates }, tiles: me.tileCount };
});
console.log(`broke at ${after.t0} tiles -> ${after.t1} tiles after 26 real-s (13 sim-s)`);
console.log("income now:", Object.fromEntries(Object.entries(after.rates).map(([k, v]) => [k, +v.toFixed(2)])));
console.log(after.t1 > after.t0 ? "PASS  live realm recovers on land income alone" : "FAIL  still stuck live");
console.log("errors:", errs.length ? errs : "none");
await b.close();
