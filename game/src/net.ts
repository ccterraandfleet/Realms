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
