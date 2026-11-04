import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1400, height: 900 } });
const p = await b.newPage();
await p.goto("http://localhost:8412/?seed=7", { waitUntil: "load" });
await p.waitForSelector(".lobby-card", { timeout: 60000 });
const info = await p.evaluate(() => {
  const labels = [...document.querySelectorAll(".lobby-field > span")].map((n) => n.textContent);
  const cv = document.querySelector(".lobby-badge");
  const ctx = cv.getContext("2d");
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let painted = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 10) painted++;
  return {
    labels,
    matchCode: document.querySelector(".lobby-code")?.textContent,
    count: document.querySelector(".lobby-count")?.textContent,
    link: document.querySelector(".lobby-link code")?.textContent?.slice(0, 70),
    swatches: document.querySelectorAll(".swatch").length,
    chips: document.querySelectorAll(".chip").length,
    badgePainted: Math.round((painted / (cv.width * cv.height)) * 100) + "%",
    button: document.querySelector(".lobby-go")?.textContent,
  };
});
console.log(info);
await b.close();
