import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1300, height: 850 } });
const p = await b.newPage();
await p.goto("http://localhost:8412/?seed=7", { waitUntil: "load" });
await p.waitForSelector(".lobby-actions button", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await p.evaluate(() => {
  const btns = [...document.querySelectorAll(".lobby-actions button")];
  (btns.find((x) => /START A NEW MATCH|START A MATCH/.test(x.textContent)) ?? btns[0]).click();
});
await p.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 30000 });
console.log(await p.evaluate(() => {
  const r = window.__realms.renderer;
  return { swirlTile: r.swirlTile, swirlFrom: r.swirlFrom, active: Date.now() < r.swirlFrom + 5200 };
}));
await new Promise((r) => setTimeout(r, 700));
await p.screenshot({ path: "test/shot_swirl_live.png" });
await b.close();
