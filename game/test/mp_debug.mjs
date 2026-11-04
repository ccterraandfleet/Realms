import puppeteer from "puppeteer-core";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport:{width:1280,height:800} });
const p = await browser.newPage();
p.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 200)));
p.on("pageerror", (e) => console.log("pageerror:", e.message.slice(0, 300)));
p.on("requestfailed", (r) => console.log("reqfailed:", r.url().slice(0, 90), r.failure()?.errorText));
await p.goto("http://localhost:8412/?seed=7&host=1", { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 6000));
console.log("hook:", await p.evaluate(() => Boolean(window.__realms)));
console.log("netbar:", await p.evaluate(() => document.getElementById("netbar")?.textContent ?? "MISSING"));
console.log("phase:", await p.evaluate(() => window.__realms?.game?.phase));
console.log("players:", await p.evaluate(() => window.__realms?.game?.players?.length));
console.log("direct fetch test:", await p.evaluate(async () => {
  try {
    const r = await fetch("https://lyra-01a6009e.base44.app/functions/realmsRelay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", seed: 7 }) });
    return `${r.status} ${(await r.text()).slice(0, 80)}`;
  } catch (e) { return "THREW " + e.message; }
}));
await browser.close();
