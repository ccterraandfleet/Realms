import { createClientFromRequest } from "npm:@base44/sdk@0.8.49";

/**
 * Realms netcode relay. Two players, one shared world.
 *
 * The simulation is deterministic and runs on both clients; this function only
 * carries intents between them, so payloads stay tiny and no state is synced.
 * Records are APPEND-ONLY on purpose: entity update() is refused for service
 * role callers on this platform, so every action creates a record and readers
 * take the newest.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(): string {
  let out = "";
  for (let i = 0; i < 4; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const b44 = createClientFromRequest(req);
  const sr: any = (b44 as any).asServiceRole ?? b44;
  const Net = sr.entities.RealmsNet;
  const action = String(body.action ?? "");
  const code = String(body.code ?? "").toUpperCase().slice(0, 8);

  if (action === "create") {
    const seed = Number(body.seed ?? 7) || 7;
    const room = makeCode();
    await Net.create({
      code: room,
      kind: "room",
      player: 0,
      tick: 0,
      payload: JSON.stringify({ seed, createdAt: Date.now() }),
    });
    return json({ code: room, seed });
  }

  if (action === "create") {
    const seed = Number(body.seed ?? 7) || 7;
    const room = makeCode();
    await Net.create({
      code: room,
      kind: "room",
      player: 0,
      tick: 0,
      payload: JSON.stringify({ seed, createdAt: Date.now() }),
    });
    return json({ code: room, seed });
  }

  // Matchmaking. Matches snap to the minute: the first client to ask creates
  // it and hosts it, and everyone arriving in the join window lands in that
  // same match, so a plain shared link drops you both into one world.
  if (action === "match") {
    const now = Date.now();
    const seedWanted = Number(body.seed ?? 7) || 7;
    const client = String(body.client ?? "").slice(0, 32);
    const JOIN_WINDOW = 6 * 60 * 1000;

    const pick = async () => {
      const rows = await Net.filter({ kind: "match" }, "-created_date", 30);
      for (const r of rows ?? []) {
        let m: any = {};
        try {
          m = JSON.parse(r.payload || "{}");
        } catch {
          continue;
        }
        if (!m.startAt) continue;
        if (now >= m.startAt + JOIN_WINDOW) continue;
        if (now < m.startAt - 65000) continue;
        return { code: r.code, startAt: m.startAt, seed: m.seed ?? seedWanted, hostClient: m.hostClient };
      }
      return null;
    };

    let live = await pick();
    if (!live) {
      const startAt = Math.ceil((now + 2500) / 60000) * 60000;
      const room = makeCode();
      await Net.create({
        code: room,
        kind: "match",
        player: 0,
        tick: startAt,
        payload: JSON.stringify({ startAt, seed: seedWanted, hostClient: client }),
      });
      // Two clients can create at the same instant; both then settle on the
      // earliest match for that minute so nobody ends up alone.
      const all = await Net.filter({ kind: "match" }, "-created_date", 12);
      const same = (all ?? []).filter((r: any) => {
        try {
          return JSON.parse(r.payload || "{}").startAt === startAt;
        } catch {
          return false;
        }
      });
      const chosen = same.length ? same[same.length - 1] : null;
      const m = chosen ? JSON.parse(chosen.payload || "{}") : { startAt, seed: seedWanted, hostClient: client };
      live = { code: chosen ? chosen.code : room, startAt: m.startAt, seed: m.seed ?? seedWanted, hostClient: m.hostClient };
    }

    return json({
      code: live.code,
      startAt: live.startAt,
      seed: live.seed,
      host: live.hostClient === client,
      hostClient: live.hostClient,
    });
  }

  if (action === "room") {
    if (!code) return json({ error: "no code" }, 400);
    const rows = await Net.filter({ code, kind: "room" }, "-created_date", 1);
    if (!rows?.length) return json({ error: "no such room" }, 404);
    return json({ code, ...JSON.parse(rows[0].payload || "{}") });
  }

  if (action === "post") {
    if (!code) return json({ error: "no code" }, 400);
    const rec = await Net.create({
      code,
      kind: "intent",
      player: Number(body.player ?? 0),
      tick: Number(body.tick ?? 0),
      payload: JSON.stringify(body.data ?? {}),
    });
    return json({ ok: true, id: rec.id });
  }

  if (action === "poll") {
    if (!code) return json({ error: "no code" }, 400);
    const since = Number(body.since ?? 0);
    const rows = await Net.filter({ code, kind: "intent" }, "-created_date", 120);
    const list = (rows ?? [])
      .map((r: any) => ({
        id: r.id,
        player: Number(r.player ?? 0),
        tick: Number(r.tick ?? 0),
        at: new Date(r.created_date).getTime(),
        data: JSON.parse(r.payload || "{}"),
      }))
      .filter((r: any) => r.at > since)
      .sort((a: any, b: any) => a.tick - b.tick || a.player - b.player);
    return json({ intents: list, room: rows?.[0]?.code ?? code });
  }

  return json({ error: "unknown action" }, 400);
});
