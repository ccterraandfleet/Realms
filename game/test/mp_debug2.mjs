import puppeteer from "puppeteer-core";
const B = "http://localhost:8412";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport:{width:1280,height:800} });
const host = await browser.newPage();
await host.goto(`${B}/?seed=7&host=1`, { waitUntil: "load" });
await host.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Room"), { timeout: 45000 });
const code = (await host.evaluate(() => document.getElementById("netbar").textContent)).match(/Room\s*([A-Z0-9]{4})/)[1];
console.log("room", code);

const guest = await browser.newPage();
guest.on("pageerror", (e) => console.log("GUEST pageerror:", e.message.slice(0, 400)));
guest.on("console", (m) => { if (m.type() === "error") console.log("GUEST console:", m.text().slice(0, 300)); });
await guest.bringToFront();
await guest.goto(`${B}/?seed=7&room=${code}`, { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 7000));
console.log("guest netbar:", await guest.evaluate(() => document.getElementById("netbar")?.textContent ?? "MISSING"));
console.log("guest phase:", await guest.evaluate(() => window.__realms?.game?.phase));
console.log("guest room fetch:", await guest.evaluate(async (c) => {
  try { const r = await fetch("https://lyra-01a6009e.base44.app/functions/realmsRelay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "room", code: c }) }); return `${r.status} ${(await r.text()).slice(0,120)}`; } catch (e) { return "THREW " + e.message; }
}, code));
await browser.close();
