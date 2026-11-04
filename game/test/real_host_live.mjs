import puppeteer from "puppeteer-core";
const B = "https://ccterraandfleet.github.io/Realms";
const launch = () => puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1300, height: 850 } });
const errs = [];
async function enter(pg, name) {
  await pg.waitForSelector(".lobby-actions button", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1600));
  const label = await pg.evaluate(() => document.querySelector(".lobby-actions .lobby-go")?.textContent);
  await pg.evaluate((n) => { const i = document.querySelector(".lobby-input"); i.value = n; i.dispatchEvent(new Event("input", { bubbles: true })); }, name);
  await pg.screenshot({ path: `test/shot_live_door_${name}.png` });
  await pg.click(".lobby-actions .lobby-go");
  await pg.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 30000 });
  const code = (await pg.evaluate(() => document.getElementById("netbar").textContent)).match(/Match\s*([A-Z0-9]{4})/)[1];
  return { code, label };
}

const b1 = await launch(); const a = await b1.newPage();
a.on("pageerror", (e) => errs.push("A: " + e.message.slice(0, 140)));
await a.goto(`${B}/?seed=7`, { waitUntil: "load" });
const A = await enter(a, "Mason");
console.log("A button:", A.label, "| match:", A.code);

const b2 = await launch(); const bb = await b2.newPage();
bb.on("pageerror", (e) => errs.push("B: " + e.message.slice(0, 140)));
await bb.goto(`${B}/?seed=7&room=${A.code}`, { waitUntil: "load" });
const C = await enter(bb, "Canzanora");
console.log("B button:", C.label, "| match:", C.code, A.code === C.code ? "SAME GAME" : "MISMATCH");

const t0 = await a.evaluate(() => window.__realms.game.time);
await new Promise((r) => setTimeout(r, 6000));
const t1 = await a.evaluate(() => window.__realms.game.time);
const tb1 = await bb.evaluate(() => window.__realms.game.time);
console.log("A world clock advanced:", (t1 - t0).toFixed(1), "s");
console.log("A flag:", await a.evaluate(() => document.getElementById("sync-flag")?.textContent), "| B flag:", await bb.evaluate(() => document.getElementById("sync-flag")?.textContent));
console.log("A players:", await a.evaluate(() => window.__realms.game.players.slice(0, 2).map((p) => p.name)));
console.log("B players:", await bb.evaluate(() => window.__realms.game.players.slice(0, 2).map((p) => p.name)));
console.log("B world clock:", tb1.toFixed(1));
console.log("errors:", errs.length ? errs : "none");
await b1.close(); await b2.close();
