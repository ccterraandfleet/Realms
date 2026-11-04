import { createClientFromRequest } from "npm:@base44/sdk@0.8.49";

/**
 * Realms matchmaking. Kept separate from the relay so it stays small.
 *
 * A match is one room record that lives for JOIN_WINDOW. Opening creates one
 * if none is live; joining picks the live one. When two players open at almost
 * the same instant they can each create a room, so "current" always resolves to
 * the EARLIEST room in the window: both sides adopt it and end up together.
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

const JOIN_WINDOW = 45 * 60 * 1000;

type Rec = { id: string; created_date: string; code: string; payload: string };

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

  const live = async (): Promise<Rec | null> => {
    const rows: Rec[] = (await Net.filter({ kind: "room" }, "-created_date", 25)) ?? [];
    const now = Date.now();
    const usable = rows
      .map((r) => {
        let p: any = {};
        try {
          p = JSON.parse(r.payload || "{}");
        } catch {
          p = {};
        }
        return { r, p };
      })
      .filter(({ r, p }) => {
        const started = p.startAt ?? new Date(r.created_date).getTime();
        return now - started < JOIN_WINDOW && now - started > -60000;
      });
    if (!usable.length) return null;
    // Earliest wins, so simultaneous creators converge on one room.
    usable.sort((a, b) => {
      const ta = a.p.startAt ?? new Date(a.r.created_date).getTime();
      const tb = b.p.startAt ?? new Date(b.r.created_date).getTime();
      return ta - tb;
    });
    return usable[0].r;
  };

  if (action === "open") {
    const seed = Number(body.seed ?? 7) || 7;
    const client = String(body.client ?? "").slice(0, 40);
    const existing = await live();
    if (existing) {
      const p = JSON.parse(existing.payload || "{}");
      return json({ code: existing.code, seed: p.seed ?? seed, host: p.hostClient === client, adopted: true });
    }
    const code = makeCode();
    await Net.create({
      code,
      kind: "room",
      player: 0,
      tick: 0,
      payload: JSON.stringify({ seed, startAt: Date.now(), hostClient: client }),
    });
    return json({ code, seed, host: true, created: true });
  }

  if (action === "current") {
    const client = String(body.client ?? "").slice(0, 40);
    const room = await live();
    if (!room) return json({ room: null });
    const p = JSON.parse(room.payload || "{}");
    return json({ room: { code: room.code, seed: p.seed ?? 7, host: p.hostClient === client } });
  }

  if (action === "byCode") {
    const code = String(body.code ?? "").toUpperCase().slice(0, 8);
    if (!code) return json({ error: "no code" }, 400);
    const rows: Rec[] = (await Net.filter({ code, kind: "room" }, "-created_date", 1)) ?? [];
    if (!rows.length) return json({ room: null });
    const p = JSON.parse(rows[0].payload || "{}");
    return json({ room: { code, seed: p.seed ?? 7, host: false } });
  }

  return json({ error: "unknown action" }, 400);
});
