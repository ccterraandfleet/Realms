import puppeteer from "puppeteer-core";
const B = "https://ccterraandfleet.github.io/Realms";
const launch = () => puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1200, height: 800 } });
const errs = [];
const enter = async (pg, name) => {
  await pg.waitForSelector(".lobby-actions button", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1600));
  await pg.evaluate((n) => { const i = document.querySelector(".lobby-input"); i.value = n; i.dispatchEvent(new Event("input", { bubbles: true })); }, name);
  // Always start a fresh match as host when the option exists.
  const picked = await pg.evaluate(() => {
    const btns = [...document.querySelectorAll(".lobby-actions button")];
    const fresh = btns.find((b) => /START A NEW MATCH|START A MATCH/.test(b.textContent));
    (fresh ?? btns[0]).click();
    return (fresh ?? btns[0]).textContent;
  });
  console.log("  clicked:", picked);
  await pg.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 30000 });
  return (await pg.evaluate(() => document.getElementById("netbar").textContent)).match(/Match\s*([A-Z0-9]{4})/)[1];
};

const b1 = await launch(); const a = await b1.newPage();
a.on("pageerror", (e) => errs.push("A: " + e.message.slice(0, 120)));
await a.goto(`${B}/?seed=7`, { waitUntil: "load" });
const code = await enter(a, "Mason");
await new Promise((r) => setTimeout(r, 900));
await a.screenshot({ path: "test/shot_countdown.png" });

const b2 = await launch(); const bb = await b2.newPage();
bb.on("pageerror", (e) => errs.push("B: " + e.message.slice(0, 120)));
await bb.goto(`${B}/?seed=7&room=${code}`, { waitUntil: "load" });
await enter(bb, "Canzanora");
await new Promise((r) => setTimeout(r, 1200));
await bb.screenshot({ path: "test/shot_swirl.png" });

// Put the host tab in the background behind another tab, the way a real player
// would when they click away.
const other = await b1.newPage();
await other.bringToFront();
await other.goto("about:blank");
console.log("host tab is now hidden:", await a.evaluate(() => document.hidden));

const clock0 = await a.evaluate(() => window.__realms.game.time);
const guestClock0 = await bb.evaluate(() => window.__realms.game.time);
await new Promise((r) => setTimeout(r, 20000));
const clock1 = await a.evaluate(() => window.__realms.game.time);
const guestClock1 = await bb.evaluate(() => window.__realms.game.time);
console.log("host advanced while hidden:", (clock1 - clock0).toFixed(1), "s in 20s");
console.log("guest advanced:", (guestClock1 - guestClock0).toFixed(1), "s");
console.log("host flag:", await a.evaluate(() => document.getElementById("sync-flag")?.textContent));
console.log("guest flag:", await bb.evaluate(() => document.getElementById("sync-flag")?.textContent));
console.log("guest tiles:", await bb.evaluate(() => window.__realms.game.players.slice(0,2).map((p) => p.tileCount)));
console.log("host tiles:", await a.evaluate(() => window.__realms.game.players.slice(0,2).map((p) => p.tileCount)));
console.log("errors:", errs.length ? errs : "none");
await b1.close(); await b2.close();
