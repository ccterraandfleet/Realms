import puppeteer from "puppeteer-core";
const B = "http://localhost:8412";
const launch = () => puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1400, height: 900 } });
const errs = [];

// A: lands on the lobby, no match exists -> starts one
const b1 = await launch();
const a = await b1.newPage();
a.on("pageerror", (e) => errs.push("A: " + e.message.slice(0, 160)));
await a.goto(`${B}/?seed=7`, { waitUntil: "load" });
await a.waitForSelector(".lobby-actions .lobby-go", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
console.log("A sees:", await a.evaluate(() => document.querySelector(".lobby-matchline")?.textContent?.trim()));
const btnText = await a.evaluate(() => [...document.querySelectorAll(".lobby-actions button")].map((b) => b.textContent));
console.log("A buttons:", btnText);
await a.screenshot({ path: "test/shot_front_lobby.png" });
await a.click(".lobby-actions .lobby-go");
await a.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 30000 });
const codeA = (await a.evaluate(() => document.getElementById("netbar").textContent)).match(/Match\s*([A-Z0-9]{4})/)[1];
console.log("A started match:", codeA);

// B: lands on the lobby, sees the live match, joins it
await new Promise((r) => setTimeout(r, 1500));
const b2 = await launch();
const bb = await b2.newPage();
bb.on("pageerror", (e) => errs.push("B: " + e.message.slice(0, 160)));
await bb.goto(`${B}/?seed=7`, { waitUntil: "load" });
await bb.waitForSelector(".lobby-actions button", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
console.log("B sees:", await bb.evaluate(() => document.querySelector(".lobby-matchline")?.textContent?.trim()));
console.log("B buttons:", await bb.evaluate(() => [...document.querySelectorAll(".lobby-actions button")].map((b) => b.textContent)));
await bb.click(".lobby-actions .lobby-go");
await bb.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 30000 });
const codeB = (await bb.evaluate(() => document.getElementById("netbar").textContent)).match(/Match\s*([A-Z0-9]{4})/)[1];
console.log("B joined match:", codeB, codeA === codeB ? "SAME GAME" : "MISMATCH");

await new Promise((r) => setTimeout(r, 3000));
console.log("B sync:", await bb.evaluate(() => document.getElementById("sync-flag")?.textContent ?? "none"));
console.log("A players:", await a.evaluate(() => window.__realms.game.players.slice(0, 2).map((p) => p.name)));
console.log("B players:", await bb.evaluate(() => window.__realms.game.players.slice(0, 2).map((p) => p.name)));
console.log("errors:", errs.length ? errs : "none");
await b1.close(); await b2.close();
