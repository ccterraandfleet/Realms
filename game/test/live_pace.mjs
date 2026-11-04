import puppeteer from "puppeteer-core";
const B = "https://ccterraandfleet.github.io/Realms";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1300, height: 850 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
await p.goto(`${B}/?delay=3000`, { waitUntil: "load" });
await p.waitForSelector(".lobby-actions button", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1600));
await p.evaluate(() => {
  const btns = [...document.querySelectorAll(".lobby-actions button")];
  (btns.find((x) => /START A NEW MATCH|START A MATCH/.test(x.textContent)) ?? btns[0]).click();
});
await p.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 40000 });
await new Promise((r) => setTimeout(r, 34000));   // clear the 30s countdown
const t0 = Date.now();
const s0 = await p.evaluate(() => window.__realms.game.time);
await new Promise((r) => setTimeout(r, 10000));
const s1 = await p.evaluate(() => window.__realms.game.time);
const real = (Date.now() - t0) / 1000;
console.log(`sim advanced ${(s1 - s0).toFixed(1)}s in ${real.toFixed(1)}s real -> speed ${((s1 - s0) / real).toFixed(2)}x`);
console.log("muster line:", await p.evaluate(() => document.getElementById("army-note")?.textContent));
console.log("hosts:", await p.evaluate(() => window.__realms.game.armies.filter((a) => a.owner === window.__realms.game.human).map((a) => Math.round(a.troops))));
console.log("stores:", await p.evaluate(() => { const m = window.__realms.game.players[window.__realms.game.human]; return { grain: Math.round(m.grain), timber: Math.round(m.timber), ore: Math.round(m.ore), gold: Math.round(m.gold) }; }));
console.log("errors:", errs.length ? errs : "none");
await p.screenshot({ path: "test/shot_pace.png" });
await b.close();
