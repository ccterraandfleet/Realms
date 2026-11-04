import puppeteer from "puppeteer-core";

const launch = () => puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1400, height: 900 } });
const errs = [];

async function enter(page, name, colorIdx) {
  await page.waitForSelector(".lobby-card", { timeout: 60000 });
  await page.type(".lobby-input", name, { delay: 10 });
  const sw = await page.$$(".swatch");
  await sw[colorIdx].click();
  const chips = await page.$$(".chip");
  await chips[1 + 2].click();  // shield round-ish
  await chips[5].click();  // emblem pick
  await page.screenshot({ path: "test/shot_lobby.png" });
  await page.click(".lobby-go");
  await page.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 30000 });
  return (await page.evaluate(() => document.getElementById("netbar").textContent)).match(/Match\s*([A-Z0-9]{4})/)[1];
}

const b1 = await launch();
const host = await b1.newPage();
host.on("pageerror", (e) => errs.push("host: " + e.message));
await host.goto("http://localhost:8412/?seed=7", { waitUntil: "load" });
const code = await enter(host, "Mason", 0);
const link = await host.evaluate(() => document.querySelector("#netbar code").textContent);
console.log("match code:", code);
console.log("invite link:", link);

const b2 = await launch();
const guest = await b2.newPage();
guest.on("pageerror", (e) => errs.push("guest: " + e.message));
await guest.goto(link, { waitUntil: "load" });
const gcode = await enter(guest, "Canzanora", 4);
console.log("guest matched code:", gcode, gcode === code ? "SAME MATCH" : "MISMATCH");

await new Promise((r) => setTimeout(r, 4000));
const state = await host.evaluate(() => {
  const g = window.__realms.game;
  return g.players.slice(0, 3).map((p) => ({ id: p.id, name: p.name, color: p.color, tiles: p.tileCount }));
});
console.log("host sees:", state);
const idA = await host.evaluate(() => (document.getElementById("you")?.textContent ?? "").trim());
const idB = await guest.evaluate(() => (document.getElementById("you")?.textContent ?? "").trim());
console.log("header A:", idA, "| header B:", idB);
console.log("errors:", errs.length ? errs : "none");
await guest.screenshot({ path: "test/shot_guest.png" });
await b1.close(); await b2.close();
