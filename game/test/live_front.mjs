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
await new Promise((r) => setTimeout(r, 45000));
const r = await p.evaluate(() => {
  const g = window.__realms.game;
  const me = g.players[g.human];
  const hosts = g.armies.map((a) => ({ o: a.owner, t: Math.round(a.troops), sp: a.supply?.toFixed(2), mo: a.morale?.toFixed(2), rt: !!a.routed }));
  return {
    build: document.getElementById("build-stamp")?.textContent?.trim(),
    phase: g.phase,
    armies: hosts.slice(0, 4),
    count: hosts.length,
    myTroops: Math.round(me.troops),
    myTiles: me.tileCount,
    camp: [...g.structs.values()].filter((s) => s.kind === "camp").length,
  };
});
console.log("build:", r.build, "| phase:", r.phase);
console.log("hosts:", r.count, JSON.stringify(r.armies));
console.log("my pool:", r.myTroops, "men | tiles:", r.myTiles, "| camps:", r.camp);
console.log("errors:", errs.length ? errs.slice(0, 2) : "none");
await b.close();
