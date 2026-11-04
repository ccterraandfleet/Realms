import puppeteer from "puppeteer-core";
const B = "https://ccterraandfleet.github.io/Realms";
const launch = () => puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1400, height: 900 } });
const errs = [];

const b1 = await launch();
const a = await b1.newPage();
a.on("pageerror", (e) => errs.push("A: " + e.message.slice(0, 160)));
await a.goto(`${B}/?seed=7`, { waitUntil: "load" });
await a.waitForSelector(".lobby-actions button", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1600));
console.log("A sees:", await a.evaluate(() => document.querySelector(".lobby-matchline")?.textContent?.trim()));
console.log("A buttons:", await a.evaluate(() => [...document.querySelectorAll(".lobby-actions button")].map((b) => b.textContent)));
await a.evaluate(() => { const i = document.querySelector(".lobby-input"); i.value = "Mason"; i.dispatchEvent(new Event("input", { bubbles: true })); });
await a.screenshot({ path: "test/shot_front_live.png" });
await a.click(".lobby-actions .lobby-go");
await a.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 30000 });
const codeA = (await a.evaluate(() => document.getElementById("netbar").textContent)).match(/Match\s*([A-Z0-9]{4})/)[1];
console.log("A started:", codeA, "| host flag:", await a.evaluate(() => document.querySelector("#sync-flag")?.textContent));
console.log("A is player 0 named:", await a.evaluate(() => window.__realms.game.players[0].name));

// B opens the invite link for that match
const b2 = await launch();
const bb = await b2.newPage();
bb.on("pageerror", (e) => errs.push("B: " + e.message.slice(0, 160)));
await bb.goto(`${B}/?seed=7&room=${codeA}`, { waitUntil: "load" });
await bb.waitForSelector(".lobby-actions .lobby-go", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 800));
console.log("B sees:", await bb.evaluate(() => document.querySelector(".lobby-matchline")?.textContent?.trim()));
await bb.click(".lobby-actions .lobby-go");
await bb.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 30000 });
console.log("B match:", (await bb.evaluate(() => document.getElementById("netbar").textContent)).match(/Match\s*([A-Z0-9]{4})/)[1], "| sync:", await bb.evaluate(() => document.getElementById("sync-flag")?.textContent));
console.log("errors:", errs.length ? errs : "none");
await b1.close(); await b2.close();
