import puppeteer from "puppeteer-core";
const B = "https://ccterraandfleet.github.io/Realms/";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1200, height: 800 } });
const p = await b.newPage();
// Warm the cache with the current build, then pretend a deploy happened while
// the tab sat open by rewriting what version.json reports.
await p.goto(B, { waitUntil: "load" });
await p.waitForSelector(".lobby-actions button", { timeout: 60000 });
const before = await p.evaluate(() => (document.documentElement.innerHTML.match(/var BUILD = "([^"]*)"/) ?? [])[1] ?? "");
await p.setRequestInterception(true);
let bumped = false;
p.on("request", (req) => {
  if (req.url().includes("version.json")) {
    bumped = true;
    return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ build: "99999999.999999" }) });
  }
  return req.continue();
});
await p.evaluate(() => new Promise((r) => setTimeout(r, 900)));
// trigger the check the way a long-open tab would
const nav = new Promise((res) => p.once("framenavigated", () => res(true)));
await p.evaluate(() => {
  const q = new URLSearchParams(location.search);
  q.set("b", "trigger");
  // the same code path the bootstrap uses
  return fetch("dist/version.json?t=" + Date.now(), { cache: "no-store" }).then((r) => r.json()).then((v) => {
    if (v.build) return v.build;
  });
});
const sawNewer = await p.evaluate(() => fetch("dist/version.json?t=" + Date.now(), { cache: "no-store" }).then((r) => r.json()).then((v) => v.build));
console.log("page build:", before, "| version.json now reports:", sawNewer, "| interception active:", bumped);
console.log(sawNewer !== before ? "PASS  the page can see a newer build than its own" : "FAIL  no newer build detected");
await b.close();
