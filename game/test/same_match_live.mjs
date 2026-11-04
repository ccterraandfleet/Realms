import puppeteer from "puppeteer-core";
const B = "https://ccterraandfleet.github.io/Realms";
const launch = () => puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1200, height: 800 } });
const errs = [];

async function enter(pg, name) {
  await pg.waitForSelector(".lobby-card", { timeout: 60000 });
  await pg.evaluate((n) => { const i = document.querySelector(".lobby-input"); i.value = n; i.dispatchEvent(new Event("input", { bubbles: true })); }, name);
  const code = await pg.evaluate(() => document.querySelector(".lobby-code").textContent);
  await pg.screenshot({ path: `test/shot_live_${name}.png` });
  await pg.click(".lobby-go");
  await pg.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 30000 });
  return code;
}

// Player A uses the PLAIN link
const b1 = await launch();
const a = await b1.newPage();
a.on("pageerror", (e) => errs.push("A: " + e.message.slice(0, 140)));
await a.goto(`${B}/?seed=7`, { waitUntil: "load" });
const codeA = await enter(a, "Mason");
console.log("A match:", codeA);

// Player B also uses the PLAIN link, several seconds later
await new Promise((r) => setTimeout(r, 6000));
const b2 = await launch();
const bb = await b2.newPage();
bb.on("pageerror", (e) => errs.push("B: " + e.message.slice(0, 140)));
await bb.goto(`${B}/?seed=7`, { waitUntil: "load" });
const codeB = await enter(bb, "Canzanora");
console.log("B match:", codeB, codeA === codeB ? "SAME GAME" : "DIFFERENT GAMES");

await new Promise((r) => setTimeout(r, 3500));
console.log("B sync flag:", await bb.evaluate(() => document.getElementById("sync-flag")?.textContent ?? "none"));
console.log("A sees players:", await a.evaluate(() => window.__realms.game.players.slice(0, 2).map((p) => `${p.name} (${p.color}) tiles=${p.tileCount}`)));
console.log("B sees players:", await bb.evaluate(() => window.__realms.game.players.slice(0, 2).map((p) => `${p.name} (${p.color}) tiles=${p.tileCount}`)));
console.log("errors:", errs.length ? errs : "none");
await b1.close(); await b2.close();
