# Realms on OpenFront — fork plan (Rev A, Oct 29 2026)

Base: github.com/openfrontio/OpenFrontIO @ 8ca8e58 (Oct 28 2026). Verified in sandbox: `npm run inst` ok,
`npm run typecheck` clean, `vite build` ok, 77 engine attack tests pass, dev server serves the real homepage.

## License (read this before anything ships)
- Code: **AGPL-3.0**. We may modify freely. If we let anyone play our build over the network we must
  publish our modified source under AGPL and keep "© OpenFront and Contributors" in footer + loading screen.
- `/resources` (maps, sprites, sounds): **CC BY-SA 4.0**, credit "OpenFront".
- `/proprietary` (1 font, 8 images, 5 sounds): **all rights reserved, cannot ship in a fork.** Must be replaced.
- Their API (auth, stats, cosmetics, lobbies at :8787) is closed source and not in the repo. Dev mode runs
  without it (warnings only). Solo and private lobbies work; accounts/ranked/store do not.

## How it is built (what we inherit)
- `packages/engine` — deterministic sim, runs in a Web Worker **on every client**; server only relays intents.
  Must stay bit-identical: seeded PRNG, DetMath, no Date/Math.random. Tests mandatory for engine changes.
- `packages/engine-lib/src/configuration/Config.ts` — every rule number (troop growth, attack rates, costs).
- `packages/engine/src/execution/*Execution.ts` — one file per action (Attack, City, Factory, Port, Train,
  Nuke, SAM, DefensePost…). Adding a mechanic = adding an Execution + an Intent in `engine-api/src/Schemas.ts`.
- `packages/engine/src/game/RailNetwork*.ts, Railroad.ts, TrainStation.ts` — **an existing graph-on-map
  system (stations + rails + trains).** This is the closest thing to our roads.
- `src/client/render/` — WebGL2 renderer. `src/client/hud/` — Lit UI.
- `map-generator/` (Go) — PNG blue channel → `map.bin`. Blue <140 plains, 140-200 hills, >200 mountain.
  Our Python worldgen can emit that PNG + `info.json` → seeded Realms maps in their format.

## Mapping Mason's design onto it
| Realms idea | OpenFront hook | Size |
|---|---|---|
| Seeded map | worldgen.py → PNG → map-generator | small |
| Capital spot, cities, factories | SpawnExecution, CityExecution, FactoryExecution (exist) | reuse |
| Roads between cities | RailNetwork/Railroad + TrainStation, renamed + auto-generated between cities | medium |
| Armies move/fight only on roads | new RoadArmyExecution replacing tile-flood AttackExecution for road travel | large |
| Walls / chokepoints | DefensePostExecution restricted to road segments + directional bonus | medium |
| Flanking | falls out of directional walls | free |
| Dots not units | client render layer: army = dot on road | medium |
| Persistent world | hardest. Engine is lobby-shaped. Path: run `GameRunner` headless in Node (they already do
  for WinnerReplay), snapshot to disk, clients join a running game. Or accept long matches first. | very large |

## Order of work
1. Fork to Mason's GitHub (AGPL needs a public home anyway). Strip `/proprietary`, swap in our assets.
2. Seeded Realms map through map-generator; add to map list. First visible "ours" change.
3. Config pass: slower economy, longer games (`Config.ts` only).
4. Roads: generate stations at city sites + rails between neighbours on map load.
5. Road armies: new unit type that marches the rail graph; combat on segment meeting; capture on arrival.
6. Directional walls on segments.
7. Render: dots on roads, front lines.
8. Persistence experiment: headless GameRunner + snapshot, joinable running world.

## Running it
```
git clone <fork>; cd OpenFrontIO
npm install --global npm@12.1.0 --ignore-scripts
npm run inst          # not npm install
npm run dev           # client :9000, server :3000
```
Needs Node 24. Runs fine on the M5 or ThinkCentre; the Base44 sandbox cannot host it (no persistent process).
