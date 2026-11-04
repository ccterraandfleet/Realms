import puppeteer from "puppeteer-core";

const launch = () => puppeteer.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox","--disable-dev-shm-usage"], defaultViewport: { width: 1300, height: 850 } });
const b = await launch();
const ctx = b.defaultBrowserContext();
await ctx.overridePermissions("http://localhost:8412", ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
const p = await b.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
await p.goto("http://localhost:8412/?seed=7", { waitUntil: "load" });
await p.waitForSelector(".lobby-copy", { timeout: 60000 });

// 1. lobby invite link copies on click
await p.click(".lobby-copy");
await new Promise((r) => setTimeout(r, 300));
const lobbyLabel = await p.evaluate(() => document.querySelector(".lobby-copy").textContent);
const clip1 = await p.evaluate(() => navigator.clipboard.readText());
console.log("lobby button label:", lobbyLabel);
console.log("clipboard after lobby click:", clip1);

// 2. take the field, then the in-game bar copies too
await p.click(".lobby-go");
await p.waitForSelector("#copy-invite", { timeout: 30000 });
await new Promise((r) => setTimeout(r, 500));
await p.click("#copy-invite");
await new Promise((r) => setTimeout(r, 300));
const barLabel = await p.evaluate(() => document.getElementById("copy-invite").textContent);
const clip2 = await p.evaluate(() => navigator.clipboard.readText());
console.log("bar button label:", barLabel);
console.log("clipboard after bar click:", clip2);
console.log("errors:", errs.length ? errs : "none");
await b.close();
