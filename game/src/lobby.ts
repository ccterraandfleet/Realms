/**
 * Pre-match lobby: build your faction, see the match you are about to join,
 * and enter. Nothing here touches the simulation.
 */

import {
  COLORS,
  EMBLEM_NAMES,
  Faction,
  SHIELD_NAMES,
  badgeDataUrl,
  drawBadge,
  loadFaction,
  saveFaction,
} from "./faction";

export interface LobbyOptions {
  roomCode: string;
  startAt: number;
  role: "host" | "guest";
  link: string;
}

function elt<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = "") {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

export function openLobby(opts: LobbyOptions): Promise<Faction> {
  return new Promise((resolve) => {
    const faction = loadFaction();
    const wrap = elt("div", "lobby");
    const card = elt("div", "lobby-card");

    const head = elt("div", "lobby-head");
    head.append(elt("h1", "", "REALMS"));
    head.append(elt("p", "lobby-sub", "Build your banner, then take the field."));
    card.append(head);

    // ---- match panel -------------------------------------------------
    const matchBox = elt("div", "lobby-match");
    const codeEl = elt("div", "lobby-code", opts.roomCode);
    const roleEl = elt("div", "lobby-role", opts.role === "host" ? "you host this match" : "joining a friend's match");
    const countEl = elt("div", "lobby-count", "");
    matchBox.append(elt("div", "lobby-label", "MATCH"), codeEl, roleEl, countEl);
    card.append(matchBox);

    // ---- banner ------------------------------------------------------
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

    // ---- footer ------------------------------------------------------
    const foot = elt("div", "lobby-foot");
    const linkBox = elt("div", "lobby-link");
    linkBox.append(elt("span", "lobby-label", "INVITE LINK"));
    const linkText = elt("button", "lobby-copy", opts.link) as HTMLButtonElement;
    linkText.title = "Click to copy the invite link";
    linkText.addEventListener("click", async () => {
      const before = linkText.textContent ?? "";
      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(opts.link);
          ok = true;
        }
      } catch {
        ok = false;
      }
      if (!ok) {
        try {
          const ta = document.createElement("textarea");
          ta.value = opts.link;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          ok = document.execCommand("copy");
          ta.remove();
        } catch {
          ok = false;
        }
      }
      linkText.textContent = ok ? "Invite link copied" : "Press Ctrl+C to copy";
      linkText.classList.add("copied");
      window.setTimeout(() => {
        linkText.textContent = before;
        linkText.classList.remove("copied");
      }, 1800);
    });
    linkBox.append(linkText);
    foot.append(linkBox);
    const go = elt("button", "lobby-go", "TAKE THE FIELD") as HTMLButtonElement;
    foot.append(go);
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

    const tick = () => {
      const left = Math.max(0, opts.startAt - Date.now());
      if (left <= 0) {
        countEl.textContent = "in progress";
        if (!wrap.isConnected) return;
      } else {
        const s = Math.ceil(left / 1000);
        countEl.textContent = `starts in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      }
      if (wrap.isConnected) requestAnimationFrame(tick);
    };

    nameInput.addEventListener("input", () => {
      faction.name = nameInput.value.trim() || "Warden";
    });

    go.addEventListener("click", () => {
      faction.name = (nameInput.value.trim() || "Warden").slice(0, 18);
      saveFaction(faction);
      wrap.remove();
      resolve(faction);
    });

    // A badge you can glance at while you fill the rest in.
    const preview = document.getElementById("you");
    if (preview) preview.innerHTML = `<img alt="" src="${badgeDataUrl(faction, 48)}" />`;

    paint();
    tick();
    nameInput.focus();
    nameInput.select();
  });
}
