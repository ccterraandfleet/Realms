/**
 * Realms netcode client.
 *
 * The host runs the simulation and publishes snapshots; the guest renders the
 * host's world and sends intents back. One source of truth means the two
 * clients can never drift apart, which matters more here than shaving latency.
 */

const ENDPOINT = "https://lyra-01a6009e.base44.app/functions/realmsRelay";

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`relay ${res.status}`);
  return (await res.json()) as T;
}

export interface RoomInfo {
  code: string;
  seed: number;
  createdAt?: number;
}

export interface RemoteIntent {
  id: string;
  player: number;
  tick: number;
  at: number;
  data: { kind: string; [key: string]: unknown };
}

/**
 * Match code for a given moment. Matches snap to the minute, so anyone loading
 * in the same minute computes the same code and lands in the same match. The
 * shared link carries the code, which pins the exact match regardless of when
 * your friend clicks it.
 */
export function minuteCode(at = Date.now()): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let n = Math.floor(at / 60000);
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += alphabet[n % alphabet.length];
    n = Math.floor(n / alphabet.length);
  }
  return out;
}

export const createRoom = (seed: number) =>
  call<{ code: string; seed: number }>({ action: "create", seed });

export const getRoom = (code: string) => call<RoomInfo>({ action: "room", code });

export const postIntent = (
  code: string,
  player: number,
  tick: number,
  data: Record<string, unknown>,
) => call<{ ok: boolean }>({ action: "post", code, player, tick, data });

export const pollIntents = (code: string, since: number) =>
  call<{ intents: RemoteIntent[] }>({ action: "poll", code, since });

export const postSnapshot = (code: string, tick: number, state: string) =>
  call<{ ok: boolean }>({ action: "snap", code, tick, state });

export const getSnapshot = (code: string) =>
  call<{ state: string | null; tick?: number }>({ action: "view", code });

/* ------------------------------------------------------------------ */
/* Matchmaking (separate function so the relay stays small)            */
/* ------------------------------------------------------------------ */

const LOBBY = "https://lyra-01a6009e.base44.app/functions/realmsLobby";

async function lobbyCall<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(LOBBY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`lobby ${res.status}`);
  return (await res.json()) as T;
}

export interface MatchInfo {
  code: string;
  seed?: number;
  host: boolean;
}

/** Open a match, or adopt the live one if somebody opened it first. */
export const openMatch = (seed: number, client: string) =>
  lobbyCall<MatchInfo>({ action: "open", seed, client });

export const currentMatch = (client: string) =>
  lobbyCall<{ room: MatchInfo | null }>({ action: "current", client });

export const matchByCode = (code: string) =>
  lobbyCall<{ room: MatchInfo | null }>({ action: "byCode", code });
