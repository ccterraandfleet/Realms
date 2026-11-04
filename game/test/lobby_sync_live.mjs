import puppeteer from "puppeteer-core";
const B = "https://ccterraandfleet.github.io/Realms";
const launch = () => puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1300, height: 850 } });
const errs = [];
const enter = async (pg, name) => {
  await pg.waitForSelector(".lobby-actions button", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  await pg.evaluate((n) => { const i = document.querySelector(".lobby-input"); i.value = n; i.dispatchEvent(new Event("input", { bubbles: true })); }, name);
  await pg.click(".lobby-actions .lobby-go");
  await pg.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 30000 });
  return (await pg.evaluate(() => document.getElementById("netbar").textContent)).match(/Match\s*([A-Z0-9]{4})/)[1];
};

const b1 = await launch(); const a = await b1.newPage();
a.on("pageerror", (e) => errs.push("A: " + e.message.slice(0, 140)));
await a.goto(`${B}/?seed=7`, { waitUntil: "load" });
const code = await enter(a, "Mason");

const b2 = await launch(); const bb = await b2.newPage();
bb.on("pageerror", (e) => errs.push("B: " + e.message.slice(0, 140)));
await bb.goto(`${B}/?seed=7&room=${code}`, { waitUntil: "load" });
const codeB = await enter(bb, "Canzanora");

await new Promise((r) => setTimeout(r, 5000));
console.log("codes:", code, codeB, code === codeB ? "SAME GAME" : "MISMATCH");
console.log("A sync:", await a.evaluate(() => document.getElementById("sync-flag")?.textContent));
console.log("B sync:", await bb.evaluate(() => document.getElementById("sync-flag")?.textContent));
console.log("A world:", await a.evaluate(() => window.__realms.game.players.slice(0, 3).map((p) => `${p.name}:${p.tileCount}`)));
console.log("B world:", await bb.evaluate(() => window.__realms.game.players.slice(0, 3).map((p) => `${p.name}:${p.tileCount}`)));
console.log("errors:", errs.length ? errs : "none");
await b1.close(); await b2.close();
