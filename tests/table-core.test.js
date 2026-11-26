// Table de jeu : moteur de règles (script #core), sans navigateur.
const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { loadCore } = require("./table-helpers");

const Core = loadCore();
let ts = 0;

/** Table avec n joueurs (p1, p2…) ayant chacun 1 commandant + 20 cartes. */
function table(n = 2) {
  const s = Core.newState();
  for (let i = 1; i <= n; i++) {
    const pid = "p" + i;
    const cards = [
      { id: pid + "-cmd", name: "Commandant " + i, cmd: true },
      ...Array.from({ length: 20 }, (_, k) => ({
        id: pid + "-c" + k,
        name: "Carte " + k,
        tl: k < 5 ? "Basic Land — Swamp" : "Creature — Rat",
      })),
    ];
    Core.apply(s, {
      type: "join",
      by: pid,
      ts: ++ts,
      player: { id: pid, name: "Joueur " + i, deck: "Deck " + i },
      cards,
      order: cards.filter((c) => !c.cmd).map((c) => c.id),
    });
  }
  return s;
}
const act = (s, by, a) => Core.apply(s, { by, ts: ++ts, ...a });
const lastLog = (s) => s.log[s.log.length - 1].m;
const core3 = (v) => v && { txt: v.txt, dp: v.dp, dt: v.dt };

describe("installation", () => {
  test("un joueur qui s'installe a 40 PV, 7 cartes en main et son commandant en zone de commandement", () => {
    const s = table(1),
      p = s.players.p1;
    assert.equal(p.life, 40);
    assert.equal(p.zones.hand.length, 7);
    assert.equal(p.zones.library.length, 13);
    assert.deepEqual(p.zones.command, ["p1-cmd"]);
    assert.equal(s.turn, "p1");
    assert.equal(s.turnNo, 1);
  });

  test("la pioche prend le dessus de la bibliothèque, dans l'ordre du mélange", () => {
    const s = table(1);
    assert.deepEqual(s.players.p1.zones.hand.slice(0, 2), ["p1-c0", "p1-c1"]);
    act(s, "p1", { type: "draw", pid: "p1", n: 1 });
    assert.equal(s.players.p1.zones.hand[7], "p1-c7");
  });
});

describe("déplacements", () => {
  test("une carte qui quitte le champ de bataille perd ses marqueurs et se dégage", () => {
    const s = table(1);
    act(s, "p1", {
      type: "move",
      cid: "p1-c0",
      to: { pid: "p1", zone: "battlefield" },
      x: 10,
      y: 10,
    });
    act(s, "p1", { type: "tap", cids: ["p1-c0"] });
    act(s, "p1", { type: "counter", cid: "p1-c0", k: "+1/+1", d: 2 });
    assert.equal(s.cards["p1-c0"].tapped, true);
    assert.equal(s.cards["p1-c0"].counters["+1/+1"], 2);
    act(s, "p1", {
      type: "move",
      cid: "p1-c0",
      to: { pid: "p1", zone: "graveyard" },
    });
    assert.equal(s.cards["p1-c0"].tapped, false);
    assert.deepEqual(s.cards["p1-c0"].counters, {});
    assert.deepEqual(s.players.p1.zones.graveyard, ["p1-c0"]);
  });

  test("un jeton qui quitte le champ de bataille disparaît", () => {
    const s = table(1);
    act(s, "p1", {
      type: "token",
      pid: "p1",
      card: { id: "tk", name: "Zombie", pt: "2/2", x: 5, y: 5 },
    });
    assert.ok(s.cards.tk.token);
    act(s, "p1", { type: "move", cid: "tk", to: { pid: "p1", zone: "hand" } });
    assert.equal(s.cards.tk, undefined);
    assert.ok(!s.players.p1.zones.hand.includes("tk"));
  });

  test("une carte dont un adversaire a pris le contrôle retourne chez son propriétaire en quittant le champ de bataille", () => {
    const s = table(2);
    act(s, "p1", {
      type: "move",
      cid: "p1-c0",
      to: { pid: "p1", zone: "battlefield" },
    });
    act(s, "p2", {
      type: "move",
      cid: "p1-c0",
      to: { pid: "p2", zone: "battlefield" },
    });
    assert.equal(s.cards["p1-c0"].ctrl, "p2");
    assert.match(lastLog(s), /Joueur 2 prend le contrôle/);
    act(s, "p2", {
      type: "move",
      cid: "p1-c0",
      to: { pid: "p2", zone: "graveyard" },
    });
    assert.ok(s.players.p1.zones.graveyard.includes("p1-c0"));
    assert.ok(!s.players.p2.zones.graveyard.includes("p1-c0"));
  });

  test("le journal ne nomme pas une carte qui passe d'une zone cachée à une autre", () => {
    const s = table(1);
    act(s, "p1", {
      type: "move",
      cid: "p1-c0",
      to: { pid: "p1", zone: "library", pos: "bottom" },
    });
    assert.match(lastLog(s), /une carte : main → bibliothèque \(dessous\)/);
    const lib = s.players.p1.zones.library;
    assert.equal(lib[lib.length - 1], "p1-c0");
  });

  test("tout le cimetière peut être remélangé dans la bibliothèque", () => {
    const s = table(1);
    act(s, "p1", { type: "mill", pid: "p1", n: 3 });
    assert.equal(s.players.p1.zones.graveyard.length, 3);
    act(s, "p1", {
      type: "zoneAll",
      pid: "p1",
      from: "graveyard",
      to: "library",
    });
    assert.equal(s.players.p1.zones.graveyard.length, 0);
    assert.equal(s.players.p1.zones.library.length, 13);
  });
});

describe("mulligan de Londres (CR 103.5)", () => {
  const mull = (s) =>
    act(s, "p1", {
      type: "mulligan",
      pid: "p1",
      order: [...s.players.p1.zones.library, ...s.players.p1.zones.hand],
    });
  test("chaque mulligan repioche 7 cartes ; le premier est gratuit", () => {
    const s = table(1),
      p = s.players.p1;
    mull(s);
    assert.equal(p.zones.hand.length, 7);
    assert.equal(p.zones.library.length, 13);
    assert.equal(Core.mullBottom(p), 0);
    mull(s);
    mull(s);
    assert.equal(p.zones.hand.length, 7);
    assert.equal(Core.mullBottom(p), 2);
  });

  test("garder exige exactement le bon nombre de cartes, qui vont sous la bibliothèque", () => {
    const s = table(1),
      p = s.players.p1;
    mull(s);
    mull(s);
    const [a, b] = p.zones.hand;
    act(s, "p1", { type: "keep", pid: "p1", cids: [a, b] });
    assert.equal(p.kept, false, "2 cartes au lieu d'1 : refusé");
    act(s, "p1", { type: "keep", pid: "p1", cids: ["p2-c0"] });
    assert.equal(p.kept, false, "carte hors de la main : refusé");
    act(s, "p1", { type: "keep", pid: "p1", cids: [b] });
    assert.equal(p.kept, true);
    assert.equal(p.zones.hand.length, 6);
    assert.equal(p.zones.library[p.zones.library.length - 1], b);
  });

  test("plus de mulligan une fois la main gardée ; une nouvelle partie le permet à nouveau", () => {
    const s = table(1),
      p = s.players.p1;
    act(s, "p1", { type: "keep", pid: "p1", cids: [] });
    const hand = [...p.zones.hand];
    mull(s);
    assert.deepEqual([...p.zones.hand], hand);
    act(s, "p1", { type: "newGame", orders: {}, first: "p1" });
    assert.equal(p.kept, false);
    assert.equal(p.mull, 0);
  });
});

describe("défaite", () => {
  test("0 PV, 10 poison ou 21 blessures d'un même commandant", () => {
    const s = table(2),
      p = s.players.p2;
    assert.equal(Core.lethal(s, p), "");
    act(s, "p1", { type: "cmd", pid: "p2", cid: "p1-cmd", d: 20 });
    assert.equal(Core.lethal(s, p), "", "20 blessures : pas encore");
    act(s, "p1", { type: "cmd", pid: "p2", cid: "p1-cmd", d: 1 });
    assert.equal(Core.lethal(s, p), "21 blessures de Commandant 1");
    const s2 = table(2);
    act(s2, "p2", { type: "poison", pid: "p2", d: 10 });
    assert.equal(Core.lethal(s2, s2.players.p2), "10 marqueurs poison");
    act(s2, "p2", { type: "life", pid: "p2", set: 0 });
    assert.equal(Core.lethal(s2, s2.players.p2), "0 PV");
  });
});

describe("règles Commander", () => {
  test("les blessures de commandant sont comptées par commandant et retirent autant de PV", () => {
    const s = table(3);
    act(s, "p1", { type: "cmd", pid: "p2", cid: "p1-cmd", d: 5 });
    act(s, "p3", { type: "cmd", pid: "p2", cid: "p3-cmd", d: 2 });
    assert.deepEqual({ ...s.players.p2.cmd }, { "p1-cmd": 5, "p3-cmd": 2 });
    assert.equal(s.players.p2.life, 33);
  });

  test("retirer une blessure de commandant rend le PV, sans descendre sous zéro blessure", () => {
    const s = table(2);
    act(s, "p1", { type: "cmd", pid: "p2", cid: "p1-cmd", d: 1 });
    act(s, "p1", { type: "cmd", pid: "p2", cid: "p1-cmd", d: -3 });
    assert.equal(s.players.p2.cmd["p1-cmd"], undefined);
    assert.equal(s.players.p2.life, 40);
  });

  test("21 blessures d'un même commandant sont signalées comme mortelles", () => {
    const s = table(2);
    act(s, "p1", { type: "cmd", pid: "p2", cid: "p1-cmd", d: 21 });
    assert.match(
      lastLog(s),
      /21 blessures de commandant de Commandant 1.*Mortel/,
    );
  });

  test("la taxe de commandant augmente à chaque sortie de la zone de commandement", () => {
    const s = table(1);
    const cast = () =>
      act(s, "p1", {
        type: "move",
        cid: "p1-cmd",
        to: { pid: "p1", zone: "battlefield" },
      });
    cast();
    assert.equal(s.cards["p1-cmd"].casts, 1);
    act(s, "p1", {
      type: "move",
      cid: "p1-cmd",
      to: { pid: "p1", zone: "command" },
    });
    assert.equal(
      s.cards["p1-cmd"].casts,
      1,
      "le retour ne remet pas la taxe à zéro",
    );
    cast();
    assert.equal(s.cards["p1-cmd"].casts, 2);
  });
});

describe("tours et joueurs", () => {
  test("le tour passe au joueur suivant et saute les joueurs éliminés", () => {
    const s = table(3);
    act(s, "p2", { type: "concede", pid: "p2" });
    act(s, "p1", { type: "turn" });
    assert.equal(s.turn, "p3");
    act(s, "p3", { type: "turn" });
    assert.equal(s.turn, "p1");
    assert.equal(s.turnNo, 3);
  });

  test("un joueur qui quitte la table disparaît avec ses cartes, et le tour passe au suivant", () => {
    const s = table(3);
    act(s, "p1", {
      type: "move",
      cid: "p1-c0",
      to: { pid: "p1", zone: "battlefield" },
    });
    act(s, "p2", {
      type: "move",
      cid: "p1-c0",
      to: { pid: "p2", zone: "battlefield" },
    });
    act(s, "p2", {
      type: "move",
      cid: "p2-c0",
      to: { pid: "p2", zone: "battlefield" },
    });
    act(s, "p1", { type: "turn" }); // au tour de p2
    act(s, "p2", { type: "leave", pid: "p2" });
    assert.deepEqual([...s.order], ["p1", "p3"]);
    assert.equal(s.players.p2, undefined);
    assert.equal(s.cards["p2-c0"], undefined);
    assert.equal(s.turn, "p3");
    // la carte de p1 que p2 contrôlait revient sur le champ de bataille de p1
    assert.equal(s.cards["p1-c0"].ctrl, "p1");
    assert.ok(s.players.p1.zones.battlefield.includes("p1-c0"));
    assert.match(lastLog(s), /Joueur 2 quitte la table/);
  });

  test("le dernier joueur qui quitte laisse une table vide", () => {
    const s = table(1);
    act(s, "p1", { type: "leave", pid: "p1" });
    assert.deepEqual([...s.order], []);
    assert.equal(s.turn, null);
    assert.deepEqual(Object.keys(s.cards), []);
  });
});

describe("fin de partie", () => {
  test("finir la partie désigne le vainqueur, une nouvelle partie remet tout le monde à neuf", () => {
    const s = table(2);
    act(s, "p1", { type: "life", pid: "p2", d: -40 });
    act(s, "p1", { type: "cmd", pid: "p2", cid: "p1-cmd", d: 3 });
    act(s, "p2", { type: "concede", pid: "p2" });
    act(s, "p1", {
      type: "token",
      pid: "p1",
      card: { id: "tk", name: "Zombie" },
    });
    act(s, "p1", { type: "endGame", winner: "p1" });
    assert.equal(s.over.winner, "p1");
    assert.match(lastLog(s), /Victoire de Joueur 1/);

    act(s, "p2", { type: "newGame", orders: {}, first: "p2" });
    assert.equal(s.over, null);
    assert.equal(s.turn, "p2");
    assert.equal(s.turnNo, 1);
    for (const p of Object.values(s.players)) {
      assert.equal(p.life, 40);
      assert.equal(p.out, false);
      assert.deepEqual({ ...p.cmd }, {});
      assert.equal(p.zones.hand.length, 7);
      assert.equal(p.zones.battlefield.length, 0);
      assert.equal(p.zones.command.length, 1);
    }
    assert.equal(s.cards.tk, undefined, "les jetons disparaissent");
  });
});

describe("force et endurance", () => {
  /** une créature 2/2 de p1 sur le champ de bataille */
  function onField() {
    const s = table(1);
    act(s, "p1", {
      type: "move",
      cid: "p1-c6",
      to: { pid: "p1", zone: "battlefield" },
      x: 10,
      y: 10,
    });
    s.cards["p1-c6"].pt = "2/2";
    return { s, c: s.cards["p1-c6"] };
  }

  test("les marqueurs +1/+1 et -1/-1 s'annulent (CR 704.5q)", () => {
    const { s, c } = onField();
    act(s, "p1", { type: "counter", cid: c.id, k: "+1/+1", d: 3 });
    act(s, "p1", { type: "counter", cid: c.id, k: "-1/-1", d: 2 });
    assert.deepEqual(c.counters, { "+1/+1": 1 });
    act(s, "p1", { type: "counter", cid: c.id, k: "-1/-1", d: 4 });
    assert.deepEqual(c.counters, { "-1/-1": 3 });
    assert.equal(Core.ptOf(c).txt, "-1/-1");
  });

  test("la force et l'endurance affichées cumulent marqueurs et bonus", () => {
    const { s, c } = onField();
    assert.deepEqual(core3(Core.ptOf(c)), { txt: "2/2", dp: 0, dt: 0 });
    act(s, "p1", { type: "counter", cid: c.id, k: "+1/+1", d: 2 });
    act(s, "p1", { type: "pt", cid: c.id, p: 3, t: -1, eot: true });
    act(s, "p1", { type: "pt", cid: c.id, p: -1, t: -1 });
    assert.deepEqual(core3(Core.ptOf(c)), { txt: "6/2", dp: 4, dt: 0 });
    assert.match(lastLog(s), /-1\/-1/);
  });

  test("un bonus jusqu'à la fin du tour disparaît au tour suivant, pas un bonus permanent", () => {
    const { s, c } = onField();
    act(s, "p1", { type: "pt", cid: c.id, p: 1, t: 1, eot: true });
    act(s, "p1", { type: "pt", cid: c.id, p: 2, t: 0 });
    assert.equal(Core.ptOf(c).txt, "5/3");
    act(s, "p1", { type: "turn" });
    assert.equal(Core.ptOf(c).txt, "4/2");
  });

  test("retirer les bonus, ou quitter le champ de bataille, remet la force et l'endurance de base", () => {
    const { s, c } = onField();
    act(s, "p1", { type: "pt", cid: c.id, p: 2, t: 2 });
    act(s, "p1", { type: "pt", cid: c.id, p: 1, t: 1, eot: true });
    act(s, "p1", { type: "pt", cid: c.id, reset: true });
    assert.equal(Core.ptOf(c).txt, "2/2");
    act(s, "p1", { type: "pt", cid: c.id, p: 2, t: 2 });
    act(s, "p1", { type: "move", cid: c.id, to: { pid: "p1", zone: "hand" } });
    assert.equal(Core.ptOf(c).txt, "2/2");
  });

  test("valeurs non numériques, cartes sans force et autre face", () => {
    const { s, c } = onField();
    c.pt = "*/1+*";
    act(s, "p1", { type: "counter", cid: c.id, k: "+1/+1", d: 1 });
    assert.equal(Core.ptOf(c).txt, "*+1/1+*+1");
    c.pt = "";
    c.counters = {};
    assert.equal(Core.ptOf(c), null, "pas de force sur un non-créature");
    act(s, "p1", { type: "pt", cid: c.id, p: 2, t: 2, eot: true });
    assert.equal(Core.ptOf(c).txt, "+2/+2");
    c.mod = c.eot = null;
    c.pt = "2/2";
    c.pt2 = "5/5";
    c.side = 1;
    assert.equal(Core.ptOf(c).txt, "5/5");
  });
});

/** Table d'un joueur avec des cartes posées sur le champ de bataille (champs de mkCard en plus). */
function field(defs) {
  const s = table(1),
    out = {};
  Object.entries(defs).forEach(([key, extra], i) => {
    const id = "p1-c" + (6 + i);
    act(s, "p1", {
      type: "move",
      cid: id,
      to: { pid: "p1", zone: "battlefield" },
      x: 10 + i * 10,
      y: 30,
    });
    out[key] = Object.assign(s.cards[id], extra);
  });
  return { s, ...out };
}

describe("journal des points de vie", () => {
  test("les variations d'affilée d'un même joueur tiennent en une ligne", () => {
    const s = table(2),
      n = s.log.length,
      at = (t, a) => Core.apply(s, { by: "p1", ts: t, ...a });
    at(100000, { type: "life", pid: "p1", d: -1 });
    at(100500, { type: "life", pid: "p1", d: -1 });
    at(101000, { type: "life", pid: "p1", d: -3 });
    assert.equal(s.log.length, n + 1);
    assert.equal(lastLog(s), "Joueur 1 : -5 PV (35).");
    at(101200, { type: "life", pid: "p1", d: 2 });
    assert.equal(lastLog(s), "Joueur 1 : -3 PV (37).");
    // un autre joueur, ou bien plus tard : nouvelle ligne
    at(101300, { type: "life", pid: "p2", d: -2 });
    assert.equal(s.log.length, n + 2);
    at(120000, { type: "life", pid: "p2", d: -1 });
    assert.equal(s.log.length, n + 3);
    assert.equal(lastLog(s), "Joueur 2 : -1 PV (37).");
    // fixer les PV n'est pas cumulé
    at(120100, { type: "life", pid: "p2", set: 20 });
    assert.equal(s.log.length, n + 4);
  });
});

describe("équipements", () => {
  test("équiper ajoute le bonus, la carte suit sa créature, puis tombe quand elle part", () => {
    const { s, bear, axe } = field({
      bear: { pt: "2/2" },
      axe: { tl: "Artifact — Equipment", eqb: "+2/+0" },
    });
    act(s, "p1", { type: "attach", cid: axe.id, to: bear.id });
    assert.equal(axe.att, bear.id);
    assert.match(lastLog(s), /équipe .* sur /);
    assert.equal(Core.ptOf(bear, s).txt, "4/2");
    assert.equal(Core.ptOf(bear).txt, "2/2", "sans l'état, pas d'équipement");
    // rangé juste derrière la créature, décalé au-dessus
    const bf = s.players.p1.zones.battlefield;
    assert.equal(bf.indexOf(axe.id), bf.indexOf(bear.id) - 1);
    assert.ok(axe.y < bear.y);
    // la créature bouge : l'équipement suit
    act(s, "p1", { type: "pos", cid: bear.id, x: 50, y: 50 });
    assert.ok(Math.abs(axe.x - 51.2) < 0.01 && axe.y === 45);
    // la créature meurt : l'équipement reste, détaché
    act(s, "p1", {
      type: "move",
      cid: bear.id,
      to: { pid: "p1", zone: "graveyard" },
    });
    assert.equal(axe.att, null);
    assert.equal(axe.zone, "battlefield");
  });

  test("éloigner l'équipement de sa créature le détache", () => {
    const { s, bear, axe } = field({
      bear: { pt: "2/2" },
      axe: { tl: "Artifact — Equipment", eqb: "+2/+0" },
    });
    act(s, "p1", { type: "attach", cid: axe.id, to: bear.id });
    act(s, "p1", { type: "pos", cid: axe.id, x: 80, y: 60 });
    assert.equal(axe.att, null);
    assert.match(lastLog(s), /détache/);
    assert.equal(Core.ptOf(bear, s).txt, "2/2");
  });
});

describe("vaisseaux, véhicules et force *", () => {
  test("un vaisseau devient une créature à son seuil de marqueurs charge", () => {
    const { s, ship, rat } = field({
      ship: { tl: "Artifact — Spacecraft", pt: "5/4", st: 8 },
      rat: { pt: "5/5" },
    });
    assert.equal(Core.isCreature(ship), false);
    assert.equal(Core.ptOf(ship, s).off, true);
    act(s, "p1", { type: "station", cid: ship.id, with: rat.id });
    assert.equal(rat.tapped, true, "la créature qui stationne s'engage");
    assert.equal(ship.counters.charge, 5);
    assert.equal(Core.isCreature(ship), false);
    act(s, "p1", { type: "station", cid: ship.id, n: 3 });
    assert.equal(ship.counters.charge, 8);
    assert.equal(Core.isCreature(ship), true);
    assert.match(lastLog(s), /C'est maintenant une créature/);
    assert.equal(Core.ptOf(ship, s).off, false);
    // une créature engagée ne peut pas stationner
    act(s, "p1", { type: "station", cid: ship.id, with: rat.id });
    assert.equal(ship.counters.charge, 8);
  });

  test("un véhicule piloté est une créature jusqu'à la fin du tour", () => {
    const { s, cop } = field({
      cop: { tl: "Artifact — Vehicle", pt: "3/3" },
    });
    assert.equal(Core.isCreature(cop), false);
    act(s, "p1", { type: "crew", cid: cop.id });
    assert.equal(Core.isCreature(cop), true);
    assert.match(lastLog(s), /pilote/);
    act(s, "p1", { type: "turn" });
    assert.equal(Core.isCreature(cop), false);
  });

  test("force et endurance * : valeur fixée à la main, marqueurs en plus", () => {
    const { s, lord } = field({ lord: { pt: "*/*" } });
    assert.equal(Core.ptOf(lord, s).txt, "*/*");
    assert.equal(Core.ptOf(lord, s).star, true);
    act(s, "p1", { type: "base", cid: lord.id, p: 7, t: 7 });
    act(s, "p1", { type: "counter", cid: lord.id, k: "+1/+1", d: 1 });
    assert.equal(Core.ptOf(lord, s).txt, "8/8");
    assert.equal(Core.ptOf(lord, s).star, false);
    act(s, "p1", { type: "base", cid: lord.id, reset: true });
    assert.equal(Core.ptOf(lord, s).txt, "*+1/*+1");
    act(s, "p1", { type: "base", cid: lord.id, p: 3, t: 3 });
    act(s, "p1", {
      type: "move",
      cid: lord.id,
      to: { pid: "p1", zone: "hand" },
    });
    assert.equal(lord.base, null, "valeur oubliée hors du champ de bataille");
  });
});

describe("plusieurs cartes à la fois", () => {
  test("marqueurs et bonus donnés à toutes les créatures d'un coup", () => {
    const { s, a, b, c } = field({
      a: { pt: "1/1" },
      b: { pt: "2/2" },
      c: { pt: "3/3" },
    });
    const ids = [a.id, b.id, c.id];
    act(s, "p1", { type: "counter", cids: ids, k: "+1/+1", d: 1 });
    assert.deepEqual(
      [a, b, c].map((x) => Core.ptOf(x).txt),
      ["2/2", "3/3", "4/4"],
    );
    assert.match(lastLog(s), /à chacune de/);
    act(s, "p1", { type: "pt", cids: ids, p: -2, t: -2, eot: true });
    assert.deepEqual(
      [a, b, c].map((x) => Core.ptOf(x).txt),
      ["0/0", "1/1", "2/2"],
    );
    act(s, "p1", { type: "pt", cids: ids, reset: true });
    assert.equal(Core.ptOf(c).txt, "4/4");
  });
});

describe("découvrir", () => {
  test("exile jusqu'à un non-terrain de valeur ≤ N, le reste va dessous", () => {
    const s = table(1),
      lib = s.players.p1.zones.library;
    const [l1, l2, big, ok] = lib.slice(0, 4);
    s.cards[l1].tl = s.cards[l2].tl = "Basic Land — Swamp";
    Object.assign(s.cards[big], { tl: "Creature — Rat", mv: 6 });
    Object.assign(s.cards[ok], { tl: "Creature — Rat", mv: 2 });
    const ids = [l1, l2, big, ok];
    act(s, "p1", {
      type: "discover",
      pid: "p1",
      n: 3,
      ids,
      hit: ok,
      to: "hand",
      rest: [big, l1, l2],
    });
    assert.ok(s.players.p1.zones.hand.includes(ok));
    assert.deepEqual(lib.slice(-3), [big, l1, l2]);
    assert.equal(lib.indexOf(ok), -1);
    assert.match(
      lastLog(s),
      /découvre 3 : exile .* Met .* dans sa main ; 3 cartes sous la bibliothèque/,
    );
  });

  test("refusé si les cartes ne sont pas le dessus de la bibliothèque", () => {
    const s = table(1),
      lib = s.players.p1.zones.library,
      before = lib.slice();
    act(s, "p1", {
      type: "discover",
      pid: "p1",
      n: 3,
      ids: [lib[2]],
      hit: lib[2],
    });
    assert.deepEqual(lib, before);
  });
});

describe("cartes double face", () => {
  function dfc(s, id) {
    Object.assign(s.cards[id], {
      name: "Delver of Secrets // Insectile Aberration",
      name2: "Insectile Aberration",
      img2: "https://img.test/back.jpg",
      pt: "1/1",
      pt2: "3/2",
    });
    return s.cards[id];
  }

  test("transformer : nom de la face visible dans le journal et la copie", () => {
    const s = table(1);
    act(s, "p1", {
      type: "move",
      cid: "p1-c6",
      to: { pid: "p1", zone: "battlefield" },
    });
    const c = dfc(s, "p1-c6");
    assert.equal(Core.faceName(c), "Delver of Secrets");
    act(s, "p1", { type: "transform", cid: c.id });
    assert.equal(c.side, 1);
    assert.equal(Core.faceName(c), "Insectile Aberration");
    assert.match(
      lastLog(s),
      /transforme Delver of Secrets en Insectile Aberration/,
    );
    act(s, "p1", { type: "tap", cids: [c.id], v: true });
    act(s, "p1", {
      type: "move",
      cid: c.id,
      to: { pid: "p1", zone: "graveyard" },
    });
    assert.equal(
      c.side,
      0,
      "hors du champ, la carte revient sur sa face avant",
    );
    assert.match(lastLog(s), /Insectile Aberration/);
  });

  test("une carte modale peut être jouée directement sur son autre face", () => {
    const s = table(1);
    const c = dfc(s, "p1-c1");
    act(s, "p1", {
      type: "move",
      cid: c.id,
      to: { pid: "p1", zone: "battlefield" },
      side: 1,
    });
    assert.equal(c.side, 1);
    assert.match(lastLog(s), /Insectile Aberration/);
    assert.equal(Core.ptOf(c).txt, "3/2");
    // une carte simple ignore la demande
    const k = s.cards["p1-c2"];
    act(s, "p1", {
      type: "move",
      cid: k.id,
      to: { pid: "p1", zone: "battlefield" },
      side: 1,
    });
    assert.equal(k.side, 0);
  });

  test("une carte scindée (« Fire // Ice ») garde son nom complet", () => {
    const s = table(1);
    s.cards["p1-c1"].name = "Fire // Ice";
    assert.equal(Core.faceName(s.cards["p1-c1"]), "Fire // Ice");
  });
});
