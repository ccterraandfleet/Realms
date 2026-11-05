import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1300, height: 850 } });
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
await p.goto("https://ccterraandfleet.github.io/Realms/", { waitUntil: "load" });
await p.waitForSelector(".lobby-actions button", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await p.evaluate(() => {
  const btns = [...document.querySelectorAll(".lobby-actions button")];
  (btns.find((x) => /START A NEW MATCH|START A MATCH/.test(x.textContent)) ?? btns[0]).click();
});
await p.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 40000 });
await new Promise((r) => setTimeout(r, 14000));
const r = await p.evaluate(() => {
  const g = window.__realms.game;
  return {
    build: document.getElementById("build-stamp")?.textContent?.trim(),
    phase: g.phase,
    alive: g.players.filter((x) => x.alive).length,
    realms: g.players.filter((x) => x.alive && x.tileCount > 0).map((x) => `${x.name}:${x.tileCount}pk${x.peak}`),
  };
});
console.log("build:", r.build);
console.log("phase:", r.phase, "| alive:", r.alive);
console.log("realms:", r.realms.join(" "));
console.log("errors:", errs.length ? errs.slice(0, 2) : "none");
await b.close();
