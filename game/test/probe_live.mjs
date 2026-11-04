import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1200, height: 800 } });
const p = await b.newPage();
await p.goto("https://ccterraandfleet.github.io/Realms/?seed=7", { waitUntil: "load", timeout: 90000 });
await p.waitForSelector(".lobby-go", { timeout: 60000 });
await p.click(".lobby-go");
await p.waitForFunction(() => window.__realms?.game?.phase === "playing", { timeout: 45000 });
console.log(await p.evaluate(() => {
  const g = window.__realms.game;
  return { keys: Object.keys(g).slice(0, 24), hasOwners: "owners" in g, ownersType: typeof g.owners, claimNodes: Array.isArray(g.claimNodes) };
}));
await b.close();
