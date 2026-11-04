import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1400, height: 900 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
await p.goto("https://ccterraandfleet.github.io/Realms/", { waitUntil: "load" });
await p.waitForSelector(".lobby-actions button", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1600));
await p.evaluate(() => {
  const btns = [...document.querySelectorAll(".lobby-actions button")];
  (btns.find((x) => /START A NEW MATCH|START A MATCH/.test(x.textContent)) ?? btns[0]).click();
});
await p.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 40000 });
await new Promise((r) => setTimeout(r, 34000));
const r = await p.evaluate(() => {
  const g = window.__realms.game, me = g.players[g.human];
  return { rates: Object.fromEntries(Object.entries(me.rates).map(([k, v]) => [k, +v.toFixed(2)])), grainProd: +me.grainProd.toFixed(2), tiles: me.tileCount, hud: document.getElementById("resbar")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 130) ?? "" };
});
console.log("live:", JSON.stringify(r.rates), "land+base grain", r.grainProd, "tiles", r.tiles);
console.log("hud:", r.hud);
console.log("errors:", errs.length ? errs : "none");
await b.close();
