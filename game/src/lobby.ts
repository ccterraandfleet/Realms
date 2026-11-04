/**
 * The lobby is the front door now.
 *
 * You land here, build your banner, and then decide: start a fresh match, join
 * the one that is already running, or accept an invite that carried a code.
 * Nothing is created until you choose.
 */

import {
  COLORS,
  EMBLEM_NAMES,
  Faction,
  SHIELD_NAMES,
  drawBadge,
  loadFaction,
  saveFaction,
} from "./faction";
import * as net from "./net";

export interface LobbyResult {
  faction: Faction;
  code: string;
  host: boolean;
}

export interface LobbyOptions {
  seed: number;
  client: string;
  /** Set when the URL carried ?room=CODE. */
  inviteCode: string;
}

function elt<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m}m ago`;
}

export function openLobby(opts: LobbyOptions): Promise<LobbyResult> {
  return new Promise((resolve) => {
    const faction = loadFaction();
    const wrap = elt("div", "lobby");
    const card = elt("div", "lobby-card");

    const head = elt("div", "lobby-head");
    head.append(elt("h1", "", "REALMS"));
    head.append(elt("p", "lobby-sub", "Build your banner, then choose a field."));
    card.append(head);

    /* ---------------- match panel ---------------- */
    const matchBox = elt("div", "lobby-match");
    const matchLabel = elt("div", "lobby-label", "MATCH");
    const matchLine = elt("div", "lobby-matchline");
    const matchActions = elt("div", "lobby-actions");
    matchBox.append(matchLabel, matchLine, matchActions);
    card.append(matchBox);

    /* ---------------- banner ---------------- */
    const banner = elt("div", "lobby-banner");
    const big = elt("canvas", "lobby-badge") as HTMLCanvasElement;
    big.width = 160;
    big.height = 160;
    const right = elt("div", "lobby-fields");

    const nameRow = elt("label", "lobby-field");
    nameRow.append(elt("span", "", "NAME"));
    const nameInput = elt("input", "lobby-input") as HTMLInputElement;
    nameInput.value = faction.name;
    nameInput.maxLength = 18;
    nameRow.append(nameInput);
    right.append(nameRow);

    const colorRow = elt("div", "lobby-field");
    colorRow.append(elt("span", "", "COLOUR"));
    const swatches = elt("div", "swatches");
    COLORS.forEach((c) => {
      const b = elt("button", "swatch") as HTMLButtonElement;
      b.style.background = c;
      b.dataset.color = c;
      b.addEventListener("click", () => {
        faction.color = c;
        paint();
      });
      swatches.append(b);
    });
    colorRow.append(swatches);
    right.append(colorRow);

    const shieldRow = elt("div", "lobby-field");
    shieldRow.append(elt("span", "", "SHIELD"));
    const shields = elt("div", "chips");
    SHIELD_NAMES.forEach((label, i) => {
      const b = elt("button", "chip", label) as HTMLButtonElement;
      b.addEventListener("click", () => {
        faction.shield = i;
        paint();
      });
      shields.append(b);
    });
    shieldRow.append(shields);
    right.append(shieldRow);

    const emblemRow = elt("div", "lobby-field");
    emblemRow.append(elt("span", "", "CHARGE"));
    const emblems = elt("div", "chips");
    EMBLEM_NAMES.forEach((label, i) => {
      const b = elt("button", "chip", label) as HTMLButtonElement;
      b.addEventListener("click", () => {
        faction.emblem = i;
        paint();
      });
      emblems.append(b);
    });
    emblemRow.append(emblems);
    right.append(emblemRow);

    banner.append(big, right);
    card.append(banner);

    const foot = elt("div", "lobby-foot");
    foot.append(elt("div", "lobby-hint", "Your banner is saved on this device."));
    card.append(foot);

    wrap.append(card);
    document.body.append(wrap);

    const paint = () => {
      drawBadge(big, faction);
      swatches.querySelectorAll<HTMLButtonElement>(".swatch").forEach((b) => {
        b.classList.toggle("on", b.dataset.color === faction.color);
      });
      shields.querySelectorAll<HTMLButtonElement>(".chip").forEach((b, i) => b.classList.toggle("on", i === faction.shield));
      emblems.querySelectorAll<HTMLButtonElement>(".chip").forEach((b, i) => b.classList.toggle("on", i === faction.emblem));
    };

    nameInput.addEventListener("input", () => {
      faction.name = nameInput.value.trim() || "Warden";
    });

    const finish = (code: string, host: boolean) => {
      faction.name = (nameInput.value.trim() || "Warden").slice(0, 18);
      saveFaction(faction);
      wrap.remove();
      resolve({ faction, code, host });
    };

    const setLine = (code: string, sub: string) => {
      matchLine.innerHTML = "";
      matchLine.append(elt("b", "lobby-code", code));
      matchLine.append(elt("span", "lobby-sub", sub));
    };

    const addButton = (label: string, primary: boolean, onClick: () => void) => {
      const b = elt("button", primary ? "lobby-go" : "lobby-alt", label) as HTMLButtonElement;
      b.addEventListener("click", onClick);
      matchActions.append(b);
      return b;
    };

    const busy = (b: HTMLButtonElement) => {
      b.disabled = true;
      b.dataset.label = b.textContent ?? "";
      b.textContent = "starting…";
    };

    /* ---------------- decide what this visitor sees ---------------- */
    if (opts.inviteCode) {
      setLine(opts.inviteCode, "you were invited to this match");
      addButton("JOIN MATCH", true, () => finish(opts.inviteCode, false));
      paint();
      nameInput.focus();
      nameInput.select();
      return;
    }

    matchLine.append(elt("span", "lobby-sub", "looking for a live match…"));
    paint();

    void net
      .currentMatch(opts.client)
      .then((res) => {
        matchActions.innerHTML = "";
        const room = res.room;
        if (!room) {
          setLine("— none —", "no match running right now");
          const b = addButton("START A MATCH", true, () => {
            busy(b);
            void net
              .createMatch(opts.seed, opts.client)
              .then((m) => finish(m.code, true))
              .catch(() => {
                b.disabled = false;
                b.textContent = "could not start — try again";
              });
          });
          return;
        }
        setLine(room.code, `live · started ${ago(room.ageMs ?? 0)}`);
        addButton("JOIN THIS MATCH", true, () => finish(room.code, Boolean(room.host)));
        const b = addButton("START A NEW MATCH", false, () => {
          busy(b);
          void net
            .createMatch(opts.seed, opts.client)
            .then((m) => finish(m.code, true))
            .catch(() => {
              b.disabled = false;
              b.textContent = "could not start — try again";
            });
        });
      })
      .catch(() => {
        matchActions.innerHTML = "";
        setLine("— offline —", "cannot reach matchmaking");
        const b = addButton("TRY AGAIN", true, () => location.reload());
        b.dataset.label = "TRY AGAIN";
      });

    paint();
    nameInput.focus();
    nameInput.select();
  });
}
