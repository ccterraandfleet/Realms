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
const seen = [];
for (let i = 0; i < 7; i++) {
  seen.push(await p.evaluate(() => document.getElementById("countdown")?.textContent ?? "-"));
  await new Promise((r) => setTimeout(r, 700));
}
console.log("countdown over time:", seen.join(" "));
// swirl: is the human colour painted in arcs around the spawn?
const swirl = await p.evaluate(() => {
  const cv = document.getElementById("map");
  const ctx = cv.getContext("2d");
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let hits = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], bl = d[i + 2];
    if (r > 150 && g > 40 && g < 110 && bl < 90) hits++;
  }
  return hits;
});
console.log("warm-colour pixels on canvas (swirl + territory):", swirl);
await b.close();
