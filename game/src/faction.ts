/**
 * Faction setup: name, colour and a procedurally drawn badge.
 *
 * Everything here is yours before the match starts, and it is what the HUD and
 * the map both key off, so there is never any doubt about which realm is you.
 */

export interface Faction {
  name: string;
  color: string;
  shield: number;
  emblem: number;
  field: string;
  charge: string;
}

export const COLORS = [
  "#c8443a",
  "#d98a2b",
  "#c9b437",
  "#5b9c46",
  "#3f9d8f",
  "#3d78c4",
  "#6c5bb5",
  "#b8508f",
];

export const SHIELD_NAMES = ["Heater", "Pointed", "Round"];
export const EMBLEM_NAMES = ["Cross", "Star", "Tower", "Chevron", "Waves", "Sun"];

const KEY = "realms.faction";

export function loadFaction(): Faction {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const f = JSON.parse(raw) as Faction;
      if (f && typeof f.name === "string") return { ...defaultFaction(), ...f };
    }
  } catch {
    /* ignore a broken blob and fall through to a fresh faction */
  }
  return defaultFaction();
}

export function saveFaction(f: Faction) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {
    /* private mode: the faction simply will not persist */
  }
}

export function defaultFaction(): Faction {
  return {
    name: "Warden",
    color: COLORS[0],
    shield: 0,
    emblem: 0,
    field: "#1d2733",
    charge: "#e8d9a8",
  };
}

function shieldPath(ctx: CanvasRenderingContext2D, s: number, kind: number) {
  ctx.beginPath();
  if (kind === 0) {
    // heater
    ctx.moveTo(s * 0.18, s * 0.12);
    ctx.lineTo(s * 0.82, s * 0.12);
    ctx.lineTo(s * 0.82, s * 0.52);
    ctx.quadraticCurveTo(s * 0.82, s * 0.82, s * 0.5, s * 0.92);
    ctx.quadraticCurveTo(s * 0.18, s * 0.82, s * 0.18, s * 0.52);
    ctx.closePath();
  } else if (kind === 1) {
    // pointed
    ctx.moveTo(s * 0.5, s * 0.08);
    ctx.lineTo(s * 0.84, s * 0.26);
    ctx.lineTo(s * 0.84, s * 0.56);
    ctx.lineTo(s * 0.5, s * 0.94);
    ctx.lineTo(s * 0.16, s * 0.56);
    ctx.lineTo(s * 0.16, s * 0.26);
    ctx.closePath();
  } else {
    // round
    ctx.arc(s * 0.5, s * 0.48, s * 0.36, 0, Math.PI * 2);
  }
}

function emblemPath(ctx: CanvasRenderingContext2D, s: number, kind: number) {
  const cx = s * 0.5;
  const cy = s * 0.46;
  ctx.beginPath();
  if (kind === 0) {
    // cross
    ctx.rect(cx - s * 0.055, cy - s * 0.22, s * 0.11, s * 0.44);
    ctx.rect(cx - s * 0.2, cy - s * 0.055, s * 0.4, s * 0.11);
  } else if (kind === 1) {
    // star
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? s * 0.22 : s * 0.1;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (kind === 2) {
    // tower
    ctx.rect(cx - s * 0.13, cy - s * 0.05, s * 0.26, s * 0.27);
    ctx.rect(cx - s * 0.18, cy - s * 0.17, s * 0.1, s * 0.12);
    ctx.rect(cx - s * 0.05, cy - s * 0.17, s * 0.1, s * 0.12);
    ctx.rect(cx + s * 0.08, cy - s * 0.17, s * 0.1, s * 0.12);
  } else if (kind === 3) {
    // chevron
    ctx.moveTo(cx - s * 0.2, cy + s * 0.14);
    ctx.lineTo(cx, cy - s * 0.16);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.14);
    ctx.lineTo(cx + s * 0.2, cy + s * 0.24);
    ctx.lineTo(cx, cy - s * 0.06);
    ctx.lineTo(cx - s * 0.2, cy + s * 0.24);
    ctx.closePath();
  } else if (kind === 4) {
    // waves
    for (let row = 0; row < 3; row++) {
      const y = cy - s * 0.14 + row * s * 0.11;
      ctx.moveTo(cx - s * 0.22, y);
      for (let i = 0; i < 6; i++) {
        const x0 = cx - s * 0.22 + (i * s * 0.44) / 6;
        ctx.quadraticCurveTo(x0 + s * 0.037, y - s * 0.05, x0 + s * 0.074, y);
      }
    }
  } else {
    // sun
    ctx.arc(cx, cy, s * 0.1, 0, Math.PI * 2);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.moveTo(cx + Math.cos(a) * s * 0.14, cy + Math.sin(a) * s * 0.14);
      ctx.lineTo(cx + Math.cos(a) * s * 0.23, cy + Math.sin(a) * s * 0.23);
    }
  }
}

/** Draw a faction badge into a canvas at whatever size it is rendered. */
export function drawBadge(canvas: HTMLCanvasElement, f: Faction) {
  const s = canvas.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, s, s);
  ctx.save();
  shieldPath(ctx, s, f.shield);
  ctx.fillStyle = f.field;
  ctx.fill();
  ctx.lineWidth = Math.max(2, s * 0.045);
  ctx.strokeStyle = f.color;
  ctx.stroke();
  ctx.clip();
  ctx.save();
  emblemPath(ctx, s, f.emblem);
  ctx.fillStyle = f.charge;
  ctx.fill();
  if (f.emblem === 4) {
    ctx.strokeStyle = f.charge;
    ctx.lineWidth = Math.max(1.5, s * 0.035);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
}

export function badgeDataUrl(f: Faction, size = 64): string {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  drawBadge(c, f);
  return c.toDataURL();
}
