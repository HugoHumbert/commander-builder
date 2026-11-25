// Table de jeu : interface (plateau, menus, decks de l'éditeur) et multijoueur.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { fakeDir } = require("./helpers");
const { openTable, makeHub, editorDeck, waitFor } = require("./table-helpers");

const opened = [];
const open = async (o) => {
  const t = await openTable(o);
  opened.push(t);
  return t;
};
afterEach(() => opened.splice(0).forEach((t) => t.close()));

const JUDITH = "Judith, the Scourge Diva";
const LIB_REF = "lib:Proxys/Rakdos/judith.png";
// 21 cartes : 1 commandant (proxy local), Sol Ring (proxy web), 10 Mountain…
const DECK = editorDeck([
  { name: JUDITH, cmd: true, variant: "Dame Papillon", proxyImg: LIB_REF },
  { name: "Sol Ring", proxyImg: "https://ex.test/sol.png" },
  { name: "Lightning Bolt", variant: "Éclair" },
  { name: "Mountain", qty: 10 },
  { name: "Counterspell" },
  { name: "Fireball" },
  { name: "Relentless Rats", qty: 5 },
  { name: "Vincent Valentine // Galian Beast" },
]);
const TREE = { Rakdos: { "judith.png": "img" } };

/** IndexedDB de l'éditeur avec le dossier « Proxys » déjà enregistré. */
function proxyFolder(perm) {
  const idb = new Map();
  return {
    idb,
    setup: (w) => {
      idb.set("roots", ["Proxys"]);
      idb.set("root:Proxys", fakeDir(w, "Proxys", TREE, perm));
    },
  };
}
const cardsNamed = (t, name) =>
  Object.values(t.run("S.cards")).filter((c) => c.name === name);
const myZone = (t, zone) => t.run(`me().zones.${zone}`);
/** clic gauche tel que le voit la table (pointerdown + pointerup) */
function press(t, el) {
  const w = t.window,
    Ev = w.PointerEvent || w.MouseEvent,
    o = { bubbles: true, button: 0, clientX: 5, clientY: 5 };
  el.dispatchEvent(new Ev("pointerdown", o));
  el.dispatchEvent(new Ev("pointerup", o));
}
/** hôte installé avec le deck de test */
async function seated(o = {}) {
  const t = await open({ editor: DECK, ...proxyFolder(), ...o });
  const code = await t.host();
  await t.pickEditorDeck("Rakdos");
  await t.play();
  return { t, code };
}
/** invité qui rejoint la table et s'installe avec le même deck */
async function guestOf(hub, code, o = {}) {
  const g = await open({ hub, editor: DECK, ...proxyFolder(), ...o });
  await g.join(code);
  await g.pickEditorDeck("Rakdos");
  await g.play();
  return g;
}

describe("decks de l'éditeur", () => {
  test("la fenêtre de deck s'ouvre à la création de la table et liste les decks de l'éditeur", async () => {
    const t = await open({ editor: DECK });
    await t.host();
    await waitFor(() => t.$('[data-ed="Rakdos"]'));
    assert.match(t.$('[data-ed="Rakdos"]').textContent, /Rakdos 21 · 🖼 2/);
  });

  test("les images proxy de l'éditeur sont reprises : fichier d'un dossier autorisé et lien web", async () => {
    const { t } = await seated();
    const judith = cardsNamed(t, JUDITH)[0],
      sol = cardsNamed(t, "Sol Ring")[0],
      bolt = cardsNamed(t, "Lightning Bolt")[0];
    assert.match(
      judith.img,
      /^p:/,
      "image locale rangée sous une clé partagée",
    );
    assert.equal(
      t.run(`IMG.get(${JSON.stringify(judith.img)})`),
      "data:image/jpeg;base64,judith.png",
    );
    assert.equal(sol.img, "https://ex.test/sol.png");
    assert.match(
      bolt.img,
      /^https:\/\/img\.test\//,
      "sans proxy : image Scryfall",
    );
    assert.equal(bolt.label, "Éclair", "le nom de variante sert d'étiquette");
    assert.equal(judith.cmd, true);
  });

  test("un dossier de proxys à réautoriser est signalé, et un clic suffit à récupérer les images", async () => {
    const t = await open({
      editor: DECK,
      ...proxyFolder({ state: "prompt", onRequest: "granted" }),
    });
    await t.host();
    await t.pickEditorDeck("Rakdos");
    const btn = t.$('[data-auth="Proxys"]');
    assert.ok(btn, "bouton de réautorisation");
    assert.match(t.$("#dinfo").textContent, /1 indisponible/);
    btn.click();
    await waitFor(() => !t.$('[data-auth="Proxys"]'), { msg: "réautorisé" });
    assert.doesNotMatch(t.$("#dinfo").textContent, /indisponible/);
    await t.play();
    assert.match(cardsNamed(t, JUDITH)[0].img, /^p:/);
  });

  test("un dossier inconnu de ce navigateur peut être choisi, et il est enregistré pour l'éditeur", async () => {
    const idb = new Map();
    const t = await open({
      editor: DECK,
      idb,
      setup: (w) => {
        w.showDirectoryPicker = async () => fakeDir(w, "Proxys", TREE);
      },
    });
    await t.host();
    await t.pickEditorDeck("Rakdos");
    t.$('[data-addroot="Proxys"]').click();
    await waitFor(() => !t.$('[data-addroot="Proxys"]'), {
      msg: "dossier ajouté",
    });
    assert.deepEqual([...idb.get("roots")], ["Proxys"]);
    assert.ok(idb.get("root:Proxys"));
    await t.play();
    assert.match(cardsNamed(t, JUDITH)[0].img, /^p:/);
  });

  test("sans le dossier, la carte garde l'image Scryfall et son nom de variante", async () => {
    const t = await open({ editor: DECK });
    await t.host();
    await t.pickEditorDeck("Rakdos");
    await t.play();
    const judith = cardsNamed(t, JUDITH)[0];
    assert.match(judith.img, /^https:\/\/img\.test\//);
    assert.equal(judith.label, "Dame Papillon");
  });

  test("régression : l'export JSON de l'éditeur garde ses images (champ proxyImg)", async () => {
    const t = await open();
    const json = JSON.stringify({
      name: "X",
      cards: [{ name: "Sol Ring", qty: 2, proxyImg: "https://ex.test/s.png" }],
    });
    const p = t.run(`parseDeck(${JSON.stringify(json)})`);
    assert.equal(p.name, "X");
    assert.deepEqual(p.entries[0], {
      name: "Sol Ring",
      qty: 2,
      variant: "",
      cmd: false,
      custom: "https://ex.test/s.png",
    });
  });

  test("l'éditeur peut ouvrir la table sur un deck précis (?deck=)", async () => {
    const t = await open({ editor: DECK, query: "?deck=d1" });
    await t.host();
    await waitFor(() => t.$("#dgo") && !t.$("#dgo").disabled, {
      msg: "deck préchargé",
    });
    assert.equal(t.$("#dname").value, "Rakdos");
  });

  test("le bouton ▶ de l'éditeur ouvre la table sur le deck actif", async () => {
    const { openApp } = require("./helpers");
    let url = null;
    const app = await openApp({
      stored: DECK,
      setup: (w) => (w.open = (u) => (url = u)),
    });
    app.$("#playBtn").click();
    await waitFor(() => url, { msg: "ouverture de la table" });
    app.close();
    assert.equal(url, "table-de-jeu-commander.html?deck=d1");
  });

  test("une carte double face garde sa seconde face", async () => {
    const { t } = await seated();
    const v = cardsNamed(t, "Vincent Valentine // Galian Beast")[0];
    assert.match(v.img, /vincent/);
    assert.match(v.img2, /galian/);
  });
});

describe("plateau", () => {
  test("chaque zone est sur le plateau : bibliothèque face cachée, cimetière, exil, zone de commandement, main", async () => {
    const { t } = await seated();
    const lib = t.$(".board.me .pile.library");
    assert.ok(lib.querySelector(".card.back"), "pile face cachée");
    assert.equal(lib.querySelector(".n").textContent, "13");
    assert.equal(lib.querySelector(".card").style.backgroundImage, "");
    assert.equal(t.$$(".board.me .pile.command .card").length, 1);
    assert.ok(t.$(".board.me .pile.graveyard"));
    assert.ok(t.$(".board.me .pile.exile"));
    assert.equal(t.$$("#handbar .card").length, 7);
    assert.ok(t.$(".board.me .bf"));
  });

  test("un clic sur la bibliothèque pioche une carte", async () => {
    const { t } = await seated();
    press(t, t.$(".board.me .pile.library .card"));
    await t.painted();
    assert.equal(myZone(t, "hand").length, 8);
    assert.equal(t.$(".board.me .pile.library .n").textContent, "12");
  });

  test("un clic sur un permanent l'engage, un second le dégage", async () => {
    const { t } = await seated();
    const id = myZone(t, "hand")[0];
    await t.act({
      type: "move",
      cid: id,
      to: { pid: t.run("myId"), zone: "battlefield" },
      x: 10,
      y: 10,
    });
    const el = () => t.$(`.bf .card[data-cid="${id}"]`);
    press(t, el());
    await t.painted();
    assert.ok(el().classList.contains("tapped"));
    press(t, el());
    await t.painted();
    assert.ok(!el().classList.contains("tapped"));
  });

  test("le dessus du cimetière est visible, et un clic ouvre la pile", async () => {
    const { t } = await seated();
    const id = myZone(t, "hand")[0];
    await t.act({
      type: "move",
      cid: id,
      to: { pid: t.run("myId"), zone: "graveyard" },
    });
    const top = t.$(".board.me .pile.graveyard .card");
    assert.equal(top.dataset.cid, id);
    assert.ok(!top.classList.contains("back"));
    press(t, top);
    assert.match(t.$("#modal h2").textContent, /Cimetière de Alice/);
    assert.equal(t.$$("#vgrid .cell").length, 1);
  });

  test("l'aperçu agrandi se place contre la carte survolée", async () => {
    const { t } = await seated();
    const rect = () => ({
      left: 300,
      right: 380,
      top: 200,
      bottom: 311,
      width: 80,
      height: 111,
    });
    const pv = t.$("#preview");
    // sur le plateau : juste à droite de la carte
    t.$(".pile.command .card").getBoundingClientRect = rect;
    t.run("0, showPreview(document.querySelector('.pile.command .card'))");
    assert.equal(pv.style.display, "block");
    assert.equal(pv.style.left, "390px");
    assert.notEqual(pv.style.backgroundImage, "");
    // en main : au-dessus de la carte
    t.$("#handbar .card").getBoundingClientRect = rect;
    t.run("0, showPreview(document.querySelector('#handbar .card'))");
    assert.equal(pv.style.left, "340px");
    assert.equal(pv.style.top, "190px");
  });

  test("la carte du dessus de la bibliothèque n'est jamais montrée dans l'aperçu", async () => {
    const { t } = await seated();
    t.run("0, showPreview(document.querySelector('.pile.library .card'))");
    assert.equal(t.$("#preview").style.display, "none");
  });
});

describe("mulligan de Londres", () => {
  const hand = (t) => t.run("me().zones.hand");
  test("la main de départ propose Garder ou Mulligan ; garder sans mulligan ne remet rien dessous", async () => {
    const { t } = await seated();
    assert.ok(t.$("#mullbar"), "barre de main de départ");
    const before = hand(t);
    t.$("#bkeep").click();
    await t.painted();
    assert.deepEqual(hand(t), before);
    assert.equal(t.run("me().kept"), true);
    assert.equal(t.$("#mullbar"), null);
    t.rightClick(t.$(".board.me .pile.library .card"));
    assert.ok(
      !t.menu().includes("Mulligan"),
      "plus de mulligan après avoir gardé",
    );
  });

  test("on repioche toujours 7 cartes ; le premier mulligan est gratuit, ensuite on remet une carte dessous par mulligan", async () => {
    const { t } = await seated();
    t.$("#bmull").click();
    await t.painted();
    assert.equal(hand(t).length, 7);
    assert.match(t.$("#mullbar").textContent, /1 mulligan \(gratuit\)/);
    t.$("#bmull").click();
    await t.painted();
    assert.equal(hand(t).length, 7, "toujours 7 cartes piochées");
    assert.match(
      t.$("#mullbar").textContent,
      /2 mulligans · 1 carte à remettre dessous/,
    );
    t.$("#bkeep").click();
    assert.match(t.$("#modal h2").textContent, /Garder ma main/);
    assert.ok(t.$("#keepok").disabled, "il faut choisir la carte");
    const chosen = t.$("#keepgrid [data-keep]").dataset.keep;
    t.$("#keepgrid [data-keep]").click();
    assert.ok(!t.$("#keepok").disabled);
    t.$("#keepok").click();
    await t.painted();
    assert.equal(hand(t).length, 6);
    assert.ok(!hand(t).includes(chosen));
    const lib = t.run("me().zones.library");
    assert.equal(lib[lib.length - 1], chosen, "sous la bibliothèque");
    const log = t.run("S.log").map((l) => l.m);
    assert.match(
      log[log.length - 1],
      /garde sa main de 6 cartes et met 1 carte sous sa bibliothèque/,
    );
    assert.doesNotMatch(
      log.join(" "),
      new RegExp(t.run(`S.cards["${chosen}"].name`) + ".*sous"),
    );
  });
});

describe("sons", () => {
  test("chaque son de la table se construit sans erreur", async () => {
    const t = await open();
    const names = t.run("Object.keys(SOUNDS)");
    for (const n of [
      "draw",
      "place",
      "tap",
      "flip",
      "shuffle",
      "dice",
      "tick",
      "up",
      "down",
      "turn",
      "ping",
      "end",
    ])
      assert.ok(names.includes(n), "son " + n);
    // faux contexte audio : vérifie que chaque son crée et démarre des sources
    const started = t.run(`(() => {
      const node = () => ({ connect: (x) => x, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } });
      let n = 0;
      const a = { sampleRate: 8000, currentTime: 0, destination: {},
        createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }),
        createBufferSource: () => Object.assign(node(), { start: () => n++ }),
        createOscillator: () => Object.assign(node(), { start: () => n++, stop() {} }),
        createBiquadFilter: node, createGain: node, createDynamicsCompressor: node };
      const out = {}, res = {};
      for (const k in SOUNDS) { n = 0; SOUNDS[k](a, node(), 0); res[k] = n; }
      return res;
    })()`);
    for (const [k, n] of Object.entries(started))
      assert.ok(n > 0, "son muet : " + k);
    assert.ok(
      started.shuffle > 30,
      "le mélange crépite (une source par carte)",
    );
  });
});

describe("menus du clic droit", () => {
  test("bibliothèque : piocher, mélanger, tuteurs, meule…", async () => {
    const { t } = await seated();
    t.rightClick(t.$(".board.me .pile.library .card"));
    const m = t.menu();
    for (const label of [
      "Piocher une carte",
      "Chercher une carte…",
      "Chercher un terrain…",
      "Chercher un terrain de base…",
      "Regarder les X cartes du dessus…",
      "Meuler X cartes…",
      "Mélanger",
      "Mulligan",
    ])
      assert.ok(m.includes(label), "menu : " + label);
  });

  test("tuteur de terrain : seuls les terrains sont proposés, puis la bibliothèque est mélangée", async () => {
    const { t } = await seated();
    const landsInLib = myZone(t, "library").filter(
      (id) => t.run(`S.cards["${id}"].name`) === "Mountain",
    );
    t.rightClick(t.$(".board.me .pile.library .card"));
    t.clickMenu("Chercher un terrain…");
    await t.painted();
    const cells = t.$$("#vgrid .cell");
    assert.equal(cells.length, landsInLib.length);
    assert.ok(
      cells.every((c) => c.querySelector("small").textContent === "Mountain"),
    );
    assert.ok(t.$('#vtypes [data-type="land"]').classList.contains("on"));
    const picked = cells[0].querySelector(".card").dataset.cid;
    cells[0].querySelector('[data-to="hand"]').click();
    await t.painted();
    assert.ok(myZone(t, "hand").includes(picked));
    t.$("#mclose").click();
    await t.painted();
    const log = t.run("S.log").map((l) => l.m);
    assert.ok(
      log.some((m) => /cherche un terrain dans sa bibliothèque/.test(m)),
    );
    assert.match(log[log.length - 1], /mélange sa bibliothèque/);
  });

  test("carte sur le champ de bataille : engager, marqueurs, jeton, déplacements", async () => {
    const { t } = await seated();
    const id = myZone(t, "hand")[0];
    await t.act({
      type: "move",
      cid: id,
      to: { pid: t.run("myId"), zone: "battlefield" },
      x: 10,
      y: 10,
    });
    t.rightClick(t.$(`.bf .card[data-cid="${id}"]`));
    const m = t.menu();
    for (const label of [
      "Engager",
      "+1/+1 : ajouter",
      "Autre marqueur…",
      "Retourner face cachée",
      "Créer une copie (jeton)",
      "Vers le cimetière",
      "Vers l'exil",
      "Dessous de la bibliothèque",
    ])
      assert.ok(m.includes(label), "menu : " + label);
    t.clickMenu("+1/+1 : ajouter");
    await t.painted();
    assert.equal(
      t.$(`.bf .card[data-cid="${id}"] .ctrs span`).textContent,
      "+1/+1 1",
    );
  });

  test("régression : aucune fenêtre n'affiche d'élément brut « [object … ] »", async () => {
    const { t } = await seated();
    t.$("#bhelp").click();
    assert.doesNotMatch(t.$("#modal").textContent, /\[object/);
    assert.match(t.$("#modal").textContent, /Piocher/);
    t.$("#btoken").click();
    assert.doesNotMatch(t.$("#modal").textContent, /\[object/);
    t.$("#bdeck").click();
    assert.doesNotMatch(t.$("#modal").textContent, /\[object/);
  });

  test("champ de bataille vide : création de jeton", async () => {
    const { t } = await seated();
    t.rightClick(t.$(".board.me .bf"));
    t.clickMenu("Créer un jeton…");
    t.$("#tkname").value = "Zombie";
    t.$("#tkfree").click();
    await t.painted();
    const tk = t.$(".board.me .bf .card.token");
    assert.ok(tk);
    assert.match(tk.textContent, /Zombie/);
  });
});

describe("multijoueur", () => {
  test("chacun voit le plateau de l'autre, et le compte des joueurs suit les arrivées", async () => {
    const hub = makeHub();
    const { t: host, code } = await seated({ hub });
    assert.equal(host.$("#pcount").textContent, "1 joueur à table");
    const guest = await guestOf(hub, code);
    await waitFor(() => host.run("S.order.length") === 2);
    await host.painted();
    assert.equal(host.$("#pcount").textContent, "2 joueurs à table");
    assert.equal(guest.$("#pcount").textContent, "2 joueurs à table");
    const opp = host.$("#opps .board");
    assert.match(opp.querySelector(".pname").textContent, /Bob/);
    assert.ok(opp.querySelector(".pile.library .card.back"));
    assert.equal(opp.querySelector(".handchip b").textContent, "7");
    assert.match(guest.$("#opps .pname").textContent, /Alice/);
  });

  test("quand un joueur quitte la table, son plateau disparaît et le compte est mis à jour", async () => {
    const hub = makeHub();
    const { t: host, code } = await seated({ hub });
    const guest = await guestOf(hub, code);
    await waitFor(() => host.run("S.order.length") === 2);
    guest.$("#bleave").click();
    guest.$("#askok").click();
    await waitFor(() => host.run("S.order.length") === 1, { msg: "départ" });
    await host.painted();
    assert.equal(host.$("#pcount").textContent, "1 joueur à table");
    assert.equal(host.$$("#opps [data-board]").length, 0);
    assert.ok(!guest.$("#lobby").hidden, "l'invité revient à l'accueil");
  });

  test("un joueur dont la connexion tombe est compté hors ligne", async () => {
    const hub = makeHub();
    const { t: host, code } = await seated({ hub });
    const guest = await guestOf(hub, code);
    await waitFor(() => host.run("S.order.length") === 2);
    guest.run("left = true, hostConn.close()");
    await waitFor(
      () => host.$("#pcount").textContent === "1 joueur à table · 1 hors ligne",
      { msg: "hors ligne" },
    );
    assert.match(host.$("#opps .pname").textContent, /hors ligne/);
  });

  test("l'hôte peut retirer un joueur de la table", async () => {
    const hub = makeHub();
    const { t: host, code } = await seated({ hub });
    const guest = await guestOf(hub, code);
    await waitFor(() => host.run("S.order.length") === 2);
    await host.painted();
    host.rightClick(host.$("#opps .bhead .pname"));
    host.clickMenu("Retirer Bob de la table");
    host.$("#askok").click();
    await waitFor(() => guest.run("S.order.length") === 1, { msg: "retiré" });
    assert.equal(guest.run("!!me()"), false);
  });

  test("une image proxy locale arrive chez les autres joueurs, même arrivés après", async () => {
    const hub = makeHub();
    const { t: host, code } = await seated({ hub });
    const key = cardsNamed(host, JUDITH)[0].img;
    const guest = await open({ hub });
    await guest.join(code);
    await waitFor(() => guest.run(`IMG.has(${JSON.stringify(key)})`), {
      msg: "image reçue",
    });
    assert.equal(
      guest.run(`IMG.get(${JSON.stringify(key)})`),
      "data:image/jpeg;base64,judith.png",
    );
    const el = guest.$("#opps .pile.command .card");
    assert.match(el.style.backgroundImage, /judith\.png/);
  });

  test("blessures de commandant : le compteur par commandant retire des PV chez tout le monde", async () => {
    const hub = makeHub();
    const { t: host, code } = await seated({ hub });
    const guest = await guestOf(hub, code);
    await waitFor(() => host.run("S.order.length") === 2);
    const hostCmd = cardsNamed(host, JUDITH).find(
      (c) => c.owner === host.run("myId"),
    );
    guest.$(".board.me [data-cmdd]").click();
    assert.match(guest.$("#modal h2").textContent, /Blessures de commandant/);
    const plus = guest.$(`[data-cd="${hostCmd.id}:1"]`);
    plus.click();
    await waitFor(
      () => host.run(`S.players["${guest.run("myId")}"].life`) === 39,
    );
    guest.$(`[data-cd="${hostCmd.id}:1"]`).click();
    await waitFor(() => guest.run("me().life") === 38);
    await host.painted();
    const tile = host.$(`#opps [data-ctile$="|${hostCmd.id}"]`);
    assert.equal(tile.querySelector("b").textContent, "2");
    assert.match(guest.$("#cdbox b:not(.lethal)").textContent, /Bob/);
    assert.match(guest.$("#cdbox .cdrow b").textContent, /2 \/ 21/);
  });

  test("chaque joueur affiche une pastille par commandant adverse : clic +1, clic droit −1", async () => {
    const hub = makeHub();
    const { t: host, code } = await seated({ hub });
    const guest = await guestOf(hub, code);
    await waitFor(() => host.run("S.order.length") === 2);
    await host.painted();
    await guest.painted();
    const hostCmd = host.run("me().zones.command[0]"),
      guestId = guest.run("myId");
    // chez l'hôte, sur le plateau de Bob : la pastille du commandant d'Alice
    const tile = () => host.$(`[data-ctile="${guestId}|${hostCmd}"]`);
    assert.ok(tile(), "pastille affichée sans blessure");
    assert.ok(tile().classList.contains("zero"));
    assert.ok(tile().classList.contains("edit"), "Alice possède ce commandant");
    tile().click();
    tile().click();
    await waitFor(() => guest.run("me().life") === 38, { msg: "2 blessures" });
    await host.painted();
    assert.equal(tile().querySelector("b").textContent, "2");
    host.rightClick(tile());
    await waitFor(() => guest.run("me().life") === 39, { msg: "−1" });
    // chez Bob, sur son propre plateau, la même pastille est visible et modifiable
    await guest.painted();
    const mine = guest.$(`.board.me [data-ctile="${guestId}|${hostCmd}"]`);
    assert.equal(mine.querySelector("b").textContent, "1");
    assert.ok(mine.classList.contains("edit"));
    // pas de pastille pour son propre commandant
    const own = guest.run("me().zones.command[0]");
    assert.equal(guest.$(`.board.me [data-ctile="${guestId}|${own}"]`), null);
  });

  test("21 blessures d'un même commandant : le joueur est signalé mort et peut se déclarer éliminé", async () => {
    const hub = makeHub();
    const { t: host, code } = await seated({ hub });
    const guest = await guestOf(hub, code);
    await waitFor(() => host.run("S.order.length") === 2);
    const hostCmd = host.run("me().zones.command[0]"),
      guestId = guest.run("myId");
    await host.act({ type: "cmd", pid: guestId, cid: hostCmd, d: 21 });
    await waitFor(() => guest.run("me().cmd")[hostCmd] === 21);
    await guest.painted();
    assert.ok(
      guest
        .$(`.board.me [data-ctile="${guestId}|${hostCmd}"]`)
        .classList.contains("lethal"),
    );
    const dead = guest.$(".board.me .tag.dead");
    assert.match(dead.textContent, /21 blessures de Judith/);
    assert.match(
      guest.$("#banner").textContent,
      /Bob : 21 blessures de Judith/,
    );
    dead.querySelector(".concede").click();
    await waitFor(() => host.run(`S.players["${guestId}"].out`) === true, {
      msg: "éliminé",
    });
  });

  test("clic droit sur son commandant : infliger des blessures à un adversaire", async () => {
    const hub = makeHub();
    const { t: host, code } = await seated({ hub });
    const guest = await guestOf(hub, code);
    await waitFor(() => host.run("S.order.length") === 2);
    const cmd = host.run("me().zones.command[0]");
    await host.act({
      type: "move",
      cid: cmd,
      to: { pid: host.run("myId"), zone: "battlefield" },
      x: 10,
      y: 10,
    });
    host.rightClick(host.$(`.bf .card[data-cid="${cmd}"]`));
    host.clickMenu("Infliger 1 blessure de commandant à Bob");
    await waitFor(() => guest.run("me().life") === 39);
    assert.equal(guest.run(`me().cmd["${cmd}"]`), 1);
    // la sortie de la zone de commandement a aussi fait monter la taxe
    assert.equal(host.$(".board.me .pile.command .tax").textContent, "+2");
  });

  test("finir la partie affiche le résultat chez tous, puis une nouvelle partie repart à zéro", async () => {
    const hub = makeHub();
    const { t: host, code } = await seated({ hub });
    const guest = await guestOf(hub, code);
    await waitFor(() => host.run("S.order.length") === 2);
    await host.act({ type: "life", pid: host.run("myId"), d: -12 });
    host.$("#bend").click();
    host.$("#endwin").value = guest.run("myId");
    host.$("#endok").click();
    await waitFor(() => guest.$("#over").style.display === "grid", {
      msg: "fin",
    });
    await host.painted();
    assert.equal(host.$("#over").style.display, "grid");
    assert.match(guest.$("#over").textContent, /Victoire de Bob/);
    // régression : le tableau des scores affichait « [object HTMLSpanElement] »
    assert.doesNotMatch(guest.$("#over").textContent, /object/);
    assert.match(guest.$("#over .score").textContent, /Alice♥ 28Rakdos/);
    guest.$("#onew").click();
    await waitFor(() => host.run("S.over") === null, {
      msg: "nouvelle partie",
    });
    await host.painted();
    assert.equal(host.$("#over").style.display, "none");
    assert.equal(host.run("me().life"), 40);
    assert.equal(host.run("me().zones.hand.length"), 7);
  });

  test("l'hôte qui recharge la page peut reprendre sa table avec le même code", async () => {
    const hub = makeHub();
    const { t: host, code } = await seated({ hub });
    await host.act({ type: "life", pid: host.run("myId"), d: -5 });
    host.run("saveHost()");
    const local = {
      "cmdtable-save": host.run("store('cmdtable-save')"),
      "cmdtable-ids": host.run("store('cmdtable-ids')"),
    };
    host.run("left = true, peer.destroy()");
    const again = await open({ hub, local });
    const btn = again.$("#lresume");
    assert.ok(!btn.hidden);
    assert.match(btn.textContent, new RegExp(code));
    btn.click();
    await waitFor(() => !again.$("#app").hidden);
    assert.equal(again.run("code"), code);
    assert.equal(again.run("me().life"), 35);
  });
});
