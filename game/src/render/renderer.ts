/**
 * Canvas renderer for Realms. Draws a medieval map: textured terrain, heraldic
 * territory with inked borders, stone castles and watchtowers, harbours, siege
 * camps, and marching columns of soldiers between tiles.
 *
 * Everything is drawn from the seed and the sim state, so there are no image
 * files to load and nothing to download.
 */

import { FOREST, MOUNTAIN, OCEAN, PLAINS, SAND } from "../sim/world";
import { Game, PALETTE, Structure } from "../sim/game";

const P = 3; // offscreen pixels per tile

const TERRAIN: Record<number, [number, number, number]> = {
  [OCEAN]: [26, 55, 74],
  [SAND]: [201, 182, 141],
  [PLAINS]: [109, 138, 74],
  [FOREST]: [58, 92, 54],
  [MOUNTAIN]: [126, 122, 111],
};

export interface Camera {
  x: number;
  y: number;
  scale: number; // screen px per tile
}

function hash(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 2246822519;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

export class Renderer {
  private terrainCv: HTMLCanvasElement;
  private ownerCv: HTMLCanvasElement;
  private borderCv: HTMLCanvasElement;
  private g: Game;
  /** Border tiles, rebuilt a few times a second: the standing lines. */
  private frontier: number[] = [];
  private frontierTimer = 0;

  constructor(public canvas: HTMLCanvasElement, game: Game) {
    this.g = game;
    const { w, h } = game.world;
    const mk = () => {
      const c = document.createElement("canvas");
      c.width = w * P;
      c.height = h * P;
      return c;
    };
    this.terrainCv = mk();
    this.ownerCv = mk();
    this.borderCv = mk();
    this.paintTerrain();
    this.repaintAll();
  }

  /* ---------------------------------------------------------------- */
  /* Terrain                                                          */
  /* ---------------------------------------------------------------- */

  private paintTerrain() {
    const { w, h, terrain } = this.g.world;
    const ctx = this.terrainCv.getContext("2d")!;
    const img = ctx.createImageData(w * P, h * P);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = terrain[y * w + x];
        const base = TERRAIN[t];
        const n = hash(x, y, 11) - 0.5;
        const lift = 1 + n * (t === OCEAN ? 0.1 : 0.24);
        // Shade slopes by comparing height with the northern neighbour, so
        // hillsides read as ridges instead of flat colour.
        let slope = 1;
        if (y > 0) {
          const up = terrain[(y - 1) * w + x];
          slope = t === OCEAN ? 1 : 1 + (t - up) * 0.06;
        }
        const r = Math.min(255, base[0] * lift * slope);
        const gch = Math.min(255, base[1] * lift * slope);
        const b = Math.min(255, base[2] * lift * slope);
        for (let py = 0; py < P; py++) {
          for (let px = 0; px < P; px++) {
            const i = (((y * P + py) * w * P) + (x * P + px)) * 4;
            d[i] = r;
            d[i + 1] = gch;
            d[i + 2] = b;
            d[i + 3] = 255;
          }
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    // Scatter woodland and rock detail on top of the base colours.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = terrain[y * w + x];
        const r = hash(x, y, 5);
        if (t === FOREST && r > 0.35) {
          ctx.fillStyle = r > 0.8 ? "#4e7d47" : "#31502e";
          const cx = x * P + 1 + hash(x, y, 3) * 1.2;
          const cy = y * P + 1.2 + hash(x, y, 4) * 1.2;
          ctx.beginPath();
          ctx.moveTo(cx, cy - 1.5);
          ctx.lineTo(cx + 1.15, cy + 1.2);
          ctx.lineTo(cx - 1.15, cy + 1.2);
          ctx.closePath();
          ctx.fill();
        } else if (t === MOUNTAIN && r > 0.55) {
          ctx.fillStyle = r > 0.85 ? "#efece4" : "#a9a49a";
          ctx.beginPath();
          ctx.moveTo(x * P + 1.5, y * P + 0.4);
          ctx.lineTo(x * P + 2.9, y * P + 2.6);
          ctx.lineTo(x * P + 0.1, y * P + 2.6);
          ctx.closePath();
          ctx.fill();
        } else if (t === OCEAN && r > 0.86) {
          ctx.fillStyle = "rgba(150,196,214,0.18)";
          ctx.fillRect(x * P, y * P + 1, P, 1);
        }
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* Territory                                                        */
  /* ---------------------------------------------------------------- */

  private paintTile(t: number) {
    const { w, h } = this.g.world;
    const x = t % w;
    const y = (t / w) | 0;
    const owner = this.g.ownerAt(t);
    const octx = this.ownerCv.getContext("2d")!;
    const bctx = this.borderCv.getContext("2d")!;

    octx.clearRect(x * P, y * P, P, P);
    if (owner >= 0) {
      octx.globalAlpha = 0.5;
      octx.fillStyle = PALETTE[owner % PALETTE.length];
      octx.fillRect(x * P, y * P, P, P);
      octx.globalAlpha = 1;
    }

    bctx.clearRect(x * P, y * P, P, P);
    if (owner < 0) return;
    const col = shade(PALETTE[owner % PALETTE.length], 0.5);
    bctx.fillStyle = col;
    const bx = x * P;
    const by = y * P;
    const same = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return false;
      return this.g.ownerAt(ny * w + nx) === owner;
    };
    const T = Math.max(1, P * 0.42);
    if (!same(x, y - 1)) bctx.fillRect(bx, by, P, T);
    if (!same(x, y + 1)) bctx.fillRect(bx, by + P - T, P, T);
    if (!same(x - 1, y)) bctx.fillRect(bx, by, T, P);
    if (!same(x + 1, y)) bctx.fillRect(bx + P - T, by, T, P);
  }

  /** Repaint the whole territory layer (used on init and world reset). */
  repaintAll() {
    const { w, h } = this.g.world;
    this.ownerCv.getContext("2d")!.clearRect(0, 0, w * P, h * P);
    this.borderCv.getContext("2d")!.clearRect(0, 0, w * P, h * P);
    for (let t = 0; t < w * h; t++) this.paintTile(t);
  }

  private rebuildFrontier() {
    const { w, h, terrain } = this.g.world;
    const out: number[] = [];
    for (let t = 0; t < w * h; t++) {
      const owner = this.g.ownerAt(t);
      if (owner < 0 || terrain[t] === 0) continue;
      const x = t % w;
      const y = (t / w) | 0;
      if (
        (x > 0 && this.g.ownerAt(t - 1) !== owner) ||
        (x < w - 1 && this.g.ownerAt(t + 1) !== owner) ||
        (y > 0 && this.g.ownerAt(t - w) !== owner) ||
        (y < h - 1 && this.g.ownerAt(t + w) !== owner)
      ) {
        out.push(t);
      }
    }
    this.frontier = out;
  }

  /** Flush tiles that changed ownership since the last frame. */
  flushDirty() {
    const dirty = this.g.dirty;
    if (!dirty.size) return;
    let n = 0;
    for (const t of dirty) {
      this.paintTile(t);
      if (++n > 6000) break; // keep the frame budget sane during big pushes
    }
    dirty.clear();
  }

  /* ---------------------------------------------------------------- */
  /* Frame                                                            */
  /* ---------------------------------------------------------------- */

  draw(cam: Camera, hover: number, buildKind: string | null, dpr: number) {
    const ctx = this.canvas.getContext("2d")!;
    const { w, h } = this.g.world;
    this.flushDirty();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#0d1c26";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const dw = w * cam.scale;
    const dh = h * cam.scale;
    ctx.drawImage(this.terrainCv, 0, 0, this.terrainCv.width, this.terrainCv.height, cam.x, cam.y, dw, dh);
    ctx.drawImage(this.ownerCv, 0, 0, this.ownerCv.width, this.ownerCv.height, cam.x, cam.y, dw, dh);
    ctx.drawImage(this.borderCv, 0, 0, this.borderCv.width, this.borderCv.height, cam.x, cam.y, dw, dh);

    const toScreen = (t: number): [number, number] => {
      const x = (t % w) + 0.5;
      const y = ((t / w) | 0) + 0.5;
      return [cam.x + x * cam.scale, cam.y + y * cam.scale];
    };

    // Standing lines: soldiers holding every stretch of border, on both sides.
    if (cam.scale >= 2.6) {
      this.frontierTimer -= 1;
      if (this.frontierTimer <= 0) {
        this.frontierTimer = 20; // rebuild about every 20 frames
        this.rebuildFrontier();
      }
      const r = Math.max(0.7, cam.scale * 0.085);
      for (const t of this.frontier) {
        const owner = this.g.ownerAt(t);
        if (owner < 0) continue;
        const x = t % w;
        const y = (t / w) | 0;
        const sx = cam.x + (x + 0.5) * cam.scale;
        const sy = cam.y + (y + 0.5) * cam.scale;
        if (sx < -20 || sy < -20 || sx > this.canvas.width / dpr + 20 || sy > this.canvas.height / dpr + 20) continue;
        // Pick the side of the tile that faces hostile ground and stand there.
        let ox = 0;
        let oy = 0;
        for (const n of this.g.neighbors4(t)) {
          if (this.g.ownerAt(n) === owner) continue;
          const nx = n % w;
          const ny = (n / w) | 0;
          ox += Math.sign(nx - x) * 0.26;
          oy += Math.sign(ny - y) * 0.26;
        }
        // Picket line: one soldier every other border tile, so a front reads
        // as held ground without turning the border into mush.
        if (((x + y) & 1) === 0) continue;
        const px = sx + ox * cam.scale;
        const py = sy + oy * cam.scale;
        ctx.fillStyle = "rgba(20,16,10,0.45)";
        ctx.beginPath();
        ctx.arc(px, py + r * 0.5, r * 1.35, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = "#f6efd9";
        ctx.beginPath();
        ctx.arc(px, py, r * 1.3, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = PALETTE[owner % PALETTE.length];
        ctx.beginPath();
        ctx.arc(px, py, r * 0.8, 0, 6.283);
        ctx.fill();
      }
    }

    // Columns in the field.
    for (const a of this.g.armies) {
      const col = PALETTE[a.owner % PALETTE.length];
      const [ax, ay] = toScreen(a.tile);
      const [bx, by] = toScreen(a.target);
      if (ax < -80 || ay < -80 || ax > this.canvas.width / dpr + 80 || ay > this.canvas.height / dpr + 80) continue;

      // Line of advance toward the objective.
      ctx.strokeStyle = "rgba(18,14,8,0.4)";
      ctx.lineWidth = Math.max(1, cam.scale * 0.12);
      ctx.setLineDash([Math.max(3, cam.scale * 0.5), Math.max(3, cam.scale * 0.45)]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);

      // The column itself: dots, one per slice of strength.
      const dots = Math.max(3, Math.min(9, 2 + Math.floor(Math.log10(1 + a.troops) * 2)));
      const r = Math.max(1.2, cam.scale * 0.16);
      for (let i = 0; i < dots; i++) {
        const ang = (i / dots) * 6.283;
        const rad = cam.scale * (0.3 + 0.11 * (i % 3));
        const px = ax + Math.cos(ang) * rad;
        const py = ay - cam.scale * 0.1 + Math.sin(ang) * rad * 0.7;
        ctx.fillStyle = i === 0 ? "#fdf6e4" : col;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, 6.283);
        ctx.fill();
      }

      if (a.cutOff) {
        // Cut off from home: ring it, so the rout is no surprise.
        ctx.strokeStyle = "rgba(240,90,80,0.9)";
        ctx.lineWidth = Math.max(1.2, cam.scale * 0.11);
        ctx.setLineDash([Math.max(2, cam.scale * 0.25), Math.max(2, cam.scale * 0.2)]);
        ctx.beginPath();
        ctx.arc(ax, ay, cam.scale * 0.9, 0, 6.283);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (a.holding) {
        ctx.strokeStyle = "rgba(250,240,205,0.75)";
        ctx.lineWidth = Math.max(1, cam.scale * 0.08);
        ctx.beginPath();
        ctx.arc(ax, ay, cam.scale * 0.72, 0, 6.283);
        ctx.stroke();
      }
    }

    // Structures.
    for (const s of this.g.structs.values()) {
      const [sx, sy] = toScreen(s.tile);
      if (sx < -60 || sy < -60 || sx > this.canvas.width / dpr + 60 || sy > this.canvas.height / dpr + 60) continue;
      this.drawStructure(ctx, s, sx, sy, cam.scale);
    }

    // Hover / target marker.
    if (hover >= 0) {
      const [hx, hy] = toScreen(hover);
      const me = this.g.players[this.g.human];
      const size = Math.max(6, cam.scale * 1.1);
      let col = "rgba(255,255,255,0.5)";
      if (me && this.g.phase === "playing") {
        if (buildKind) col = this.g.canBuild(me, buildKind as never, hover) ? "rgba(140,230,140,0.85)" : "rgba(230,120,120,0.8)";
        else col = this.g.canAttack(me, hover) ? "rgba(255,225,140,0.95)" : "rgba(255,255,255,0.35)";
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.strokeRect(hx - size / 2, hy - size / 2, size, size);
    }
  }

  private drawStructure(
    ctx: CanvasRenderingContext2D,
    s: Structure,
    x: number,
    y: number,
    scale: number,
  ) {
    const col = PALETTE[s.owner % PALETTE.length];
    const k = Math.max(0.6, Math.min(2.4, scale / 3.2));

    if (s.kind === "castle") {
      // Two flanking turrets, a crenellated curtain wall and a gate, so the
      // silhouette reads as a hold rather than a box with a chimney.
      const w2 = 7.5 * k;              // half width
      const wallH = 7 * k;
      const turretW = 3.4 * k;
      const turretH = 11 * k;
      const stroke = Math.max(1, 1 * k);
      ctx.lineWidth = stroke;
      ctx.strokeStyle = "#191309";

      const turret = (cx: number) => {
        ctx.fillStyle = shade(col, 0.38);
        ctx.beginPath();
        ctx.rect(cx - turretW / 2, y - turretH * 0.5, turretW, turretH * 0.72);
        ctx.fill();
        ctx.stroke();
        // Crenellations on the turret
        ctx.fillStyle = shade(col, 0.52);
        const n = 2;
        const tw = turretW / (n * 2 - 1);
        for (let i = 0; i < n; i++) {
          ctx.fillRect(cx - turretW / 2 + i * tw * 2, y - turretH * 0.5 - 1.9 * k, tw, 1.9 * k);
        }
      };
      turret(x - w2 + turretW / 2);
      turret(x + w2 - turretW / 2);

      // Curtain wall between the turrets
      ctx.fillStyle = shade(col, 0.46);
      ctx.beginPath();
      ctx.rect(x - w2 + turretW * 0.7, y - wallH * 0.18, w2 * 2 - turretW * 1.4, wallH * 0.66);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = shade(col, 0.6);
      const merlons = 3;
      const mw = (w2 * 2 - turretW * 1.4) / (merlons * 2 - 1);
      for (let i = 0; i < merlons; i++) {
        ctx.fillRect(x - w2 + turretW * 0.7 + i * mw * 2, y - wallH * 0.18 - 1.5 * k, mw, 1.5 * k);
      }

      // Gate
      ctx.fillStyle = "#241c12";
      ctx.beginPath();
      ctx.moveTo(x - 1.9 * k, y + wallH * 0.48);
      ctx.lineTo(x - 1.9 * k, y + wallH * 0.06);
      ctx.quadraticCurveTo(x, y - 1.4 * k, x + 1.9 * k, y + wallH * 0.06);
      ctx.lineTo(x + 1.9 * k, y + wallH * 0.48);
      ctx.closePath();
      ctx.fill();

      // Banner on the keep
      ctx.strokeStyle = "#2a2118";
      ctx.lineWidth = Math.max(1, 0.9 * k);
      ctx.beginPath();
      ctx.moveTo(x, y - wallH * 0.18);
      ctx.lineTo(x, y - wallH * 1.15);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x, y - wallH * 1.15);
      ctx.lineTo(x + 5 * k, y - wallH * 0.98);
      ctx.lineTo(x, y - wallH * 0.72);
      ctx.closePath();
      ctx.fill();

      if (s.level > 1) {
        ctx.fillStyle = "#f6e7c1";
        for (let i = 0; i < Math.min(8, s.level); i++) {
          ctx.fillRect(x - 4 * k + i * 1.6 * k, y + wallH * 0.62, 1.2 * k, 1.2 * k);
        }
      }
    } else if (s.kind === "tower") {
      ctx.fillStyle = shade(col, 0.4);
      ctx.strokeStyle = "#1c1710";
      ctx.lineWidth = Math.max(1, 1 * k);
      ctx.beginPath();
      ctx.rect(x - 2.2 * k, y - 6 * k, 4.4 * k, 10 * k);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = shade(col, 0.62);
      ctx.beginPath();
      ctx.moveTo(x - 3.6 * k, y - 6 * k);
      ctx.lineTo(x, y - 12.5 * k);
      ctx.lineTo(x + 3.6 * k, y - 6 * k);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (s.kind === "harbor") {
      ctx.strokeStyle = "#3b2d1e";
      ctx.lineWidth = Math.max(1, 1.2 * k);
      ctx.beginPath();
      ctx.moveTo(x, y + 3.5 * k);
      ctx.lineTo(x, y - 5 * k);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x + 0.8 * k, y - 5 * k);
      ctx.lineTo(x + 5.5 * k, y - 1.6 * k);
      ctx.lineTo(x + 0.8 * k, y - 1.6 * k);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#6b5334";
      ctx.fillRect(x - 5 * k, y + 3.5 * k, 10 * k, 1.8 * k);
    } else {
      // Siege camp: a trebuchet arm.
      ctx.strokeStyle = "#4a3623";
      ctx.fillStyle = shade(col, 0.45);
      ctx.lineWidth = Math.max(1, 1.3 * k);
      ctx.beginPath();
      ctx.rect(x - 4.5 * k, y + 1.5 * k, 9 * k, 2.4 * k);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 3 * k, y + 2 * k);
      ctx.lineTo(x + 3.5 * k, y - 6.5 * k);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x + 4.2 * k, y - 7.2 * k, 1.8 * k, 0, 6.283);
      ctx.fill();
    }
  }
}
