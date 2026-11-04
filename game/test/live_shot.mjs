import puppeteer from "puppeteer-core";
const B = "https://ccterraandfleet.github.io/Realms";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1500, height: 950 } });
const p = await b.newPage();
await p.goto(B, { waitUntil: "load" });
await p.waitForSelector(".lobby-actions button", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1600));
await p.evaluate(() => {
  const btns = [...document.querySelectorAll(".lobby-actions button")];
  (btns.find((x) => /START A NEW MATCH|START A MATCH/.test(x.textContent)) ?? btns[0]).click();
});
await p.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 40000 });
await new Promise((r) => setTimeout(r, 36000));
// zoom out with real wheel events, then center on the map middle
const cv = await p.$("canvas");
for (let i = 0; i < 40; i++) {
  await p.mouse.move(750, 475);
  await p.mouse.wheel({ deltaY: 260 });
  await new Promise((r) => setTimeout(r, 40));
}
await new Promise((r) => setTimeout(r, 1200));
console.log("scale now:", await p.evaluate(() => {
  const c = (window.__realms && window.__realms.cam) || null;
  return c ? +c.scale.toFixed(2) : "no cam exposed";
}));
await p.screenshot({ path: "test/shot_pockets.png" });
await b.close();
