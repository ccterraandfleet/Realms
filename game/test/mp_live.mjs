import puppeteer from "puppeteer-core";

const B = "https://ccterraandfleet.github.io/Realms";
const launch = () =>
  puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1280, height: 800 },
  });

const errs = [];
const watch = (name, pg) => {
  pg.on("pageerror", (e) => errs.push(`${name}: ${e.message.slice(0, 160)}`));
};

// two separate browsers, exactly like two people on two machines
const hostBrowser = await launch();
const host = await hostBrowser.newPage();
watch("host", host);
await host.goto(`${B}/?seed=7&host=1`, { waitUntil: "load" });
await host.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("Room"), { timeout: 45000 });
const code = (await host.evaluate(() => document.getElementById("netbar").textContent)).match(/Room\s*([A-Z0-9]{4})/)[1];
console.log("room:", code);

const guestBrowser = await launch();
const guest = await guestBrowser.newPage();
watch("guest", guest);
await guest.goto(`${B}/?seed=7&room=${code}`, { waitUntil: "load" });
await guest.waitForFunction(() => document.getElementById("netbar")?.textContent?.includes("player 2"), { timeout: 45000 });
console.log("guest joined");

await new Promise((r) => setTimeout(r, 2500));
console.log("guest view:", await guest.evaluate(() => {
  const g = window.__realms.game;
  const me = g.players[1];
  return { human: g.human, p1tiles: me?.tileCount ?? -1, grain: Math.round(me?.grain ?? -1), structs: g.structs.size };
}));

const sent = await guest.evaluate(() => {
  const g = window.__realms.game;
  const me = g.players[1];
  for (const own of me.tiles) {
    for (const n of g.neighbors4(own)) {
      if (g.isLand(n) && g.owners[n] < 0) {
        window.__realms.attackTile(n);
        return { target: n, troops: Math.round(me.troops) };
      }
    }
  }
  return null;
});
console.log("guest ordered an advance:", sent);

await new Promise((r) => setTimeout(r, 4000));
console.log("host saw player 2:", await host.evaluate(() => {
  const g = window.__realms.game;
  return { armies: g.armies.filter((a) => a.owner === 1).length, p1tiles: g.players[1].tileCount };
}));
console.log("guest sees its own advance:", await guest.evaluate(() => window.__realms.game.armies.filter((a) => a.owner === 1).length));

await host.screenshot({ path: "test/mp_host.png" });
await guest.screenshot({ path: "test/mp_guest.png" });
console.log("errors:", errs.length ? errs.slice(0, 4) : "none");
await hostBrowser.close();
await guestBrowser.close();
