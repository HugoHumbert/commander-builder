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
