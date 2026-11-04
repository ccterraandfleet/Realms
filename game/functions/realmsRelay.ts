import { createClientFromRequest } from "npm:@base44/sdk@0.8.49";

/**
 * Realms netcode relay: intents up, world snapshots down.
 *
 * Matchmaking lives in realmsLobby; this function only carries traffic for a
 * match that already exists. Records are append-only because service-role
 * update() is refused on this platform.
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
  if (!code) return json({ error: "no code" }, 400);

  if (action === "post") {
    await Net.create({
      code,
      kind: "intent",
      player: Number(body.player ?? 0),
      tick: Number(body.tick ?? 0),
      payload: JSON.stringify(body.data ?? {}),
    });
    return json({ ok: true });
  }

  if (action === "poll") {
    const since = Number(body.since ?? 0);
    const rows: any[] = (await Net.filter({ code, kind: "intent" }, "-created_date", 120)) ?? [];
    const intents = rows
      .map((r) => {
        let d: any = {};
        try {
          d = JSON.parse(r.payload || "{}");
        } catch {
          d = {};
        }
        return { id: r.id, player: Number(r.player ?? 0), tick: Number(r.tick ?? 0), at: new Date(r.created_date).getTime(), data: d };
      })
      .filter((x) => x.at > since)
      .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
    return json({ intents });
  }

  if (action === "snap") {
    await Net.create({
      code,
      kind: "snap",
      player: 0,
      tick: Number(body.tick ?? 0),
      payload: String(body.state ?? ""),
    });
    // Pruning is costly, so it runs only when the client asks (about one post
    // in eight) instead of on every frame of the world.
    if (body.prune) {
      const olds: any[] = (await Net.filter({ code, kind: "snap" }, "-created_date", 40)) ?? [];
      for (const r of olds.slice(16)) {
        try {
          await Net.delete(r.id);
        } catch {
          /* best effort */
        }
      }
    }
    return json({ ok: true });
  }

  if (action === "view") {
    const rows: any[] = (await Net.filter({ code, kind: "snap" }, "-created_date", 1)) ?? [];
    if (!rows.length) return json({ state: null, at: 0 });
    return json({ state: rows[0].payload, at: new Date(rows[0].created_date).getTime() });
  }

  return json({ error: "unknown action" }, 400);
});
