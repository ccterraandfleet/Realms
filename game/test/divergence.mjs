import puppeteer from "puppeteer-core";
const B = "http://localhost:8412";
const launch = () => puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1200, height: 800 } });
const errs = [];
const enter = async (pg, name) => {
  await pg.waitForSelector(".lobby-actions button", { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1600));
  await pg.evaluate((n) => { const i = document.querySelector(".lobby-input"); i.value = n; i.dispatchEvent(new Event("input", { bubbles: true })); }, name);
  await pg.click(".lobby-actions .lobby-go");
  await pg.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Match"), { timeout: 30000 });
  return (await pg.evaluate(() => document.getElementById("netbar").textContent)).match(/Match\s*([A-Z0-9]{4})/)[1];
};
const snap = (pg) => pg.evaluate(() => {
  const g = window.__realms.game;
  return {
    flag: document.getElementById("sync-flag")?.textContent?.trim(),
    clock: +g.time.toFixed(1),
    players: g.players.filter((p) => p.tileCount > 0).slice(0, 4).map((p) => `${p.name}:${p.tileCount}`),
    armies: g.armies.length,
    structs: g.structs.size,
  };
});

const b1 = await launch(); const a = await b1.newPage();
a.on("pageerror", (e) => errs.push("A: " + e.message.slice(0, 140)));
await a.goto(`${B}/?seed=7`, { waitUntil: "load" });
const code = await enter(a, "Mason");

const b2 = await launch(); const bb = await b2.newPage();
bb.on("pageerror", (e) => errs.push("B: " + e.message.slice(0, 140)));
await bb.goto(`${B}/?seed=7&room=${code}`, { waitUntil: "load" });
await enter(bb, "Canzanora");
console.log("match:", code);

for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  const ha = await snap(a);
  const gb = await snap(bb);
  const size = await a.evaluate(() => window.__realms.game.snapshot().length);
  console.log(`t+${(i + 1) * 10}s | payload ${size}B | A(${ha.flag}) clock=${ha.clock} armies=${ha.armies} ${ha.players.join(" ")}`);
  console.log(`         | B(${gb.flag}) clock=${gb.clock} armies=${gb.armies} ${gb.players.join(" ")}`);
}
console.log("errors:", errs.length ? errs.slice(0, 3) : "none");
await b1.close(); await b2.close();
