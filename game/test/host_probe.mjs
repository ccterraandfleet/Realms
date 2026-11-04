import puppeteer from "puppeteer-core";
const B = "https://ccterraandfleet.github.io/Realms";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1200, height: 800 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));
p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });
await p.goto(`${B}/?seed=7`, { waitUntil: "load" });
await p.waitForSelector(".lobby-actions button", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await p.click(".lobby-actions .lobby-go");
await p.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 30000 });
const code = (await p.evaluate(() => document.getElementById("netbar").textContent)).match(/Match\s*([A-Z0-9]{4})/)[1];
console.log("code:", code);
for (const t of [5, 10, 20]) {
  await new Promise((r) => setTimeout(r, 5000));
  console.log(`+${t}s sync flag:`, await p.evaluate(() => document.getElementById("sync-flag")?.textContent), "| phase:", await p.evaluate(() => window.__realms.game.phase));
}
console.log("errors:", errs.length ? errs.slice(0, 3) : "none");
await b.close();
