import puppeteer from "puppeteer-core";
const B = "https://ccterraandfleet.github.io/Realms/";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1200, height: 800 } });
const errs = [];
const open = async (name) => {
  const p = await b.newPage();
  p.on("pageerror", (e) => errs.push(`${name}: ${e.message.slice(0, 100)}`));
  await p.goto(B, { waitUntil: "load" });
  await p.waitForSelector(".lobby-actions button", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  await p.evaluate((n) => {
    const inp = document.querySelector(".lobby input");
    if (inp) { inp.value = n; inp.dispatchEvent(new Event("input", { bubbles: true })); }
  }, name);
  await new Promise((r) => setTimeout(r, 400));
  return p;
};
const host = await open("Mason");
await host.evaluate(() => {
  const btns = [...document.querySelectorAll(".lobby-actions button")];
  (btns.find((x) => /START A NEW MATCH|START A MATCH/.test(x.textContent)) ?? btns[0]).click();
});
await host.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 40000 });
const code = await host.evaluate(() => (document.getElementById("netbar")?.textContent?.match(/\b([A-Z0-9]{4})\b/) ?? [])[1] ?? "");
console.log("match", code);
const guest = await open("Canzanora");
await guest.goto(`${B}?room=${code}`, { waitUntil: "load" });
await guest.waitForSelector(".lobby-actions button", { timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
await guest.evaluate(() => {
  const btns = [...document.querySelectorAll(".lobby-actions button")];
  (btns.find((x) => /JOIN/.test(x.textContent)) ?? btns[0]).click();
});
await guest.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 40000 });
await new Promise((r) => setTimeout(r, 42000));
const read = (p) => p.evaluate(() => {
  const g = window.__realms?.game;
  const el = document.getElementById("netbar");
  return {
    build: document.getElementById("build-stamp")?.textContent ?? "",
    sync: document.getElementById("sync-flag")?.textContent ?? "",
    tick: g ? +g.time.toFixed(1) : -1,
    players: g ? g.players.length : -1,
    tiles: g ? g.players.map((x) => x.tileCount) : [],
  };
});
const h1 = await read(host); const g1 = await read(guest);
await new Promise((r) => setTimeout(r, 12000));
const h2 = await read(host); const g2 = await read(guest);
const show = (l, x) => console.log(`${l}: tick ${x.tick} build "${x.build.trim()}" ${x.sync.trim()} tiles ${x.tiles.slice(0,3)}`);
show("host ", h2); show("guest", g2);
console.log("host advanced:", (h2.tick - h1.tick).toFixed(1), "guest advanced:", (g2.tick - g1.tick).toFixed(1));
console.log("same build:", h2.build === g2.build ? "yes" : "NO");
console.log("guest tracking host world:", Math.abs(h2.tick - g2.tick) < 3 ? "yes" : "NO");
console.log("errors:", errs.length ? errs.slice(0, 4) : "none");
await b.close();
