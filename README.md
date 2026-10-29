# Realms

A medieval conquest game. Pick a seat on a seeded continent, plant your castle,
and grow a realm by sending your host at the land that borders you.

The code here is our own, written from scratch: a deterministic simulation, a
canvas renderer, and a thin client. The rules live in `game/src/sim`, which is
UI-free so the same simulation can run on a server for the one persistent world.

## Play

Open the deployed URL, or run it locally:

```sh
cd game && npx esbuild src/main.ts --bundle --outfile=dist/game.js --format=iife --target=es2020
node server.mjs        # then open http://localhost:10000
```

`?seed=N` in the URL picks the world. Same seed, same continent, every time.

## What works

- Seed-generated continents: coastline, plains, forest belts, mountain ranges.
- Spawn phase: click open land, receive a small castle and the ground around it.
- Territory as a tile blob, expansion by attacking bordering tiles with a share
  of your host (`Host sent` slider).
- Gold from land and harbours; castles raise the army ceiling and can be raised
  to level 8; watchtowers stiffen the defence of nearby tiles; siege camps
  unlock bombards later.
- Eleven rival lords doing all of the above, with elimination and a victory
  condition at half the world's land.

## Next

- Bombardment (siege camps), rivers and crossings, transports for sea assault.
- Server-authoritative persistent world on one seed, with accounts.
