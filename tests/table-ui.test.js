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
      foil: false,
      custom: "https://ex.test/s.png",
      custom2: "",
    });
  });

  test("le foil de l'éditeur et des listes Archidekt (*F*) est repris", async () => {
    const t = await open();
    const json = JSON.stringify({ cards: [{ name: "Sol Ring", foil: true }] });
    assert.equal(
      t.run(`parseDeck(${JSON.stringify(json)})`).entries[0].foil,
      true,
    );
    const txt = "1x Sol Ring (C21) 263 *F* [Ramp]\n1x Mountain (C21) 300";
    const e = t.run(`parseDeck(${JSON.stringify(txt)})`).entries;
    assert.deepEqual(
      e.map((x) => [x.name, x.foil]),
      [
        ["Sol Ring", true],
        ["Mountain", false],
      ],
    );
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

  test("le logo de l'éditeur ramène à l'accueil du site", async () => {
    const { openApp } = require("./helpers");
    const app = await openApp({ stored: DECK });
    const link = app.$("#homeLink");
    app.close();
    assert.equal(link.getAttribute("href"), "index.html");
    assert.ok(link.querySelector("svg.mark"));
  });

  test("cartes foil : reflet sur le plateau et dans l'aperçu", async () => {
    const t = await open({
      editor: editorDeck([
        { name: JUDITH, cmd: true, foil: true },
        { name: "Mountain", qty: 20 },
      ]),
    });
    await t.host();
    await t.pickEditorDeck("Rakdos");
    await t.play();
    assert.equal(cardsNamed(t, JUDITH)[0].foil, true);
    assert.equal(cardsNamed(t, "Mountain")[0].foil, false);
    const el = t.$(".pile.command .card");
    assert.ok(el.classList.contains("foil"));
    assert.equal(t.$$("#handbar .card.foil").length, 0);
    t.run("showPreview(document.querySelector('.pile.command .card'))");
    assert.ok(t.$("#preview").classList.contains("foil"));
    t.run("showPreview(document.querySelector('#handbar .card'))");
    assert.ok(!t.$("#preview").classList.contains("foil"));
    // face cachée : pas de reflet qui trahirait la carte
    const j = cardsNamed(t, JUDITH)[0];
    await t.act({
      type: "move",
      cid: j.id,
      to: { pid: t.run("myId"), zone: "battlefield" },
      faceDown: true,
    });
    assert.ok(!t.$(`.bf .card[data-cid="${j.id}"]`).classList.contains("foil"));
  });

  test("un proxy perso d'une carte double face garde le verso Scryfall", async () => {
    const t = await open({
      editor: editorDeck([
        { name: JUDITH, cmd: true },
        {
          name: "Vincent Valentine // Galian Beast",
          proxyImg: "https://ex.test/v.png",
        },
        { name: "Mountain", qty: 20 },
      ]),
    });
    await t.host();
    await t.pickEditorDeck("Rakdos");
    await t.play();
    const v = cardsNamed(t, "Vincent Valentine // Galian Beast")[0];
    assert.equal(v.img, "https://ex.test/v.png");
    assert.match(v.img2, /galian/);
    assert.equal(v.pt2, "5/5");
    assert.equal(v.name2, "Galian Beast");
  });

  test("un proxy perso peut aussi remplacer le verso", async () => {
    const t = await open({
      editor: editorDeck([
        { name: JUDITH, cmd: true },
        {
          name: "Vincent Valentine // Galian Beast",
          proxyImg: "https://ex.test/v.png",
          proxyImg2: "https://ex.test/g.png",
        },
        { name: "Mountain", qty: 20 },
      ]),
    });
    await t.host();
    await t.pickEditorDeck("Rakdos");
    await t.play();
    const v = cardsNamed(t, "Vincent Valentine // Galian Beast")[0];
    assert.equal(v.img, "https://ex.test/v.png");
    assert.equal(v.img2, "https://ex.test/g.png");
    assert.equal(v.pt2, "5/5");
    const saved = t.run("store('cmdtable-decks')").Rakdos.entries;
    assert.equal(
      saved.find((e) => /Vincent/.test(e.name)).custom2,
      "https://ex.test/g.png",
    );
  });

  test("double face : jouer l'autre face depuis la main, R pour transformer", async () => {
    const { t } = await seated();
    const v = cardsNamed(t, "Vincent Valentine // Galian Beast")[0],
      me = t.run("myId");
    await t.act({ type: "move", cid: v.id, to: { pid: me, zone: "hand" } });
    t.rightClick(t.$(`#handbar .card[data-cid="${v.id}"]`));
    assert.ok(t.menu().includes("Jouer l'autre face (Galian Beast)"));
    t.clickMenu("Jouer l'autre face");
    await new Promise((r) => setTimeout(r, 15));
    await t.painted();
    const c = () => t.run(`S.cards[${JSON.stringify(v.id)}]`);
    assert.equal(c().zone, "battlefield");
    assert.equal(c().side, 1);
    const el = () => t.$(`.bf .card[data-cid="${v.id}"]`);
    assert.equal(el().querySelector(".ptb").textContent, "5/5");
    // l'aperçu nomme l'autre face
    t.run(
      `showPreview(document.querySelector('.bf .card[data-cid="${v.id}"]'))`,
    );
    assert.match(
      t.$("#preview .pinfo").textContent,
      /Face avant : Vincent Valentine/,
    );
    // R sur la carte survolée
    t.run(`hover = document.querySelector('.bf .card[data-cid="${v.id}"]')`);
    t.run(
      `document.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }))`,
    );
    await new Promise((r) => setTimeout(r, 15));
    await t.painted();
    assert.equal(c().side, 0);
    assert.match(
      t.run("S.log[S.log.length - 1].m"),
      /transforme Galian Beast en Vincent Valentine/,
    );
  });

  test("une carte double face garde sa seconde face", async () => {
    const { t } = await seated();
    const v = cardsNamed(t, "Vincent Valentine // Galian Beast")[0];
    assert.match(v.img, /vincent/);
    assert.match(v.img2, /galian/);
  });
});

describe("équipements, vaisseaux, * et actions groupées", () => {
  const RULES = editorDeck([
    { name: JUDITH, cmd: true },
    { name: "Bonesplitter" },
    { name: "Atmospheric Greenhouse" },
    { name: "Smuggler's Copter" },
    { name: "Lord of Extinction" },
    { name: "Mountain", qty: 20 },
  ]);
  async function rules() {
    const t = await open({ editor: RULES });
    await t.host();
    await t.pickEditorDeck("Rakdos");
    await t.play();
    const me = t.run("myId");
    const put = async (name, x) => {
      const c = cardsNamed(t, name)[0];
      await t.act({
        type: "move",
        cid: c.id,
        to: { pid: me, zone: "battlefield" },
        x: x,
        y: 40,
      });
      return c.id;
    };
    const el = (id) => t.$(`.bf .card[data-cid="${id}"]`);
    return { t, me, put, el };
  }

  test("« Finir la partie » est loin de « Tour suivant », à côté de « Quitter »", async () => {
    const t = await open();
    assert.notEqual(t.$("#bturn").nextElementSibling.id, "bend");
    assert.equal(t.$("#bend").nextElementSibling.id, "bleave");
  });

  test("les données Scryfall utiles sont reprises : bonus d'équipement, station, *, valeur de mana", async () => {
    const { t } = await rules();
    const f = (n) => cardsNamed(t, n)[0];
    assert.equal(f("Bonesplitter").eqb, "+2/+0");
    assert.equal(f("Atmospheric Greenhouse").st, 8);
    assert.equal(f("Atmospheric Greenhouse").mv, 5);
    assert.match(
      f("Lord of Extinction").stx,
      /equal to the number of cards in all graveyards/,
    );
    assert.equal(f("Smuggler's Copter").st, 0);
  });

  test("équiper depuis le menu : clic sur la créature, bonus affiché et détaillé", async () => {
    const { t, put, el } = await rules();
    const j = await put(JUDITH, 20),
      b = await put("Bonesplitter", 60);
    t.rightClick(el(b));
    t.clickMenu("Équiper une créature…");
    assert.ok(t.$("body").classList.contains("picking"));
    press(t, el(j));
    await new Promise((r) => setTimeout(r, 15));
    await t.painted();
    assert.ok(!t.$("body").classList.contains("picking"));
    assert.equal(t.run(`S.cards["${b}"].att`), j);
    assert.equal(el(j).querySelector(".ptb").textContent, "4/2");
    t.run(`showPreview(document.querySelector('.bf .card[data-cid="${j}"]'))`);
    assert.match(
      t.$("#preview .pmods").textContent,
      /Équipement Bonesplitter\s*\+2\/\+0/,
    );
    t.rightClick(el(b));
    t.clickMenu("Détacher de");
    await t.painted();
    assert.equal(el(j).querySelector(".ptb").textContent, "2/2");
  });

  test("glisser un équipement sur une créature l'équipe", async () => {
    const { t, put, el } = await rules();
    const j = await put(JUDITH, 20),
      b = await put("Bonesplitter", 60);
    t.run(
      `document.elementsFromPoint = () => [document.querySelector('.bf .card[data-cid="${j}"]')]`,
    );
    const w = t.window,
      Ev = w.PointerEvent || w.MouseEvent;
    t.run(
      `document.elementFromPoint = () => document.querySelector('.bf[data-bf="${t.run("myId")}"]')`,
    );
    el(b).dispatchEvent(
      new Ev("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 5,
        clientY: 5,
      }),
    );
    w.document.dispatchEvent(
      new Ev("pointermove", { bubbles: true, clientX: 60, clientY: 60 }),
    );
    w.document.dispatchEvent(
      new Ev("pointerup", { bubbles: true, clientX: 60, clientY: 60 }),
    );
    await new Promise((r) => setTimeout(r, 15));
    await t.painted();
    assert.equal(t.run(`S.cards["${b}"].att`), j);
  });

  test("un vaisseau n'est pas une créature avant son seuil : pastille grisée, puis normale", async () => {
    const { t, put, el } = await rules();
    const g = await put("Atmospheric Greenhouse", 30);
    const badge = () => el(g).querySelector(".ptb");
    assert.ok(badge().classList.contains("off"));
    t.rightClick(el(g));
    assert.ok(t.menu().includes("Stationner avec une créature…"));
    t.clickMenu("Ajouter des marqueurs charge…");
    t.$("#ask input").value = "8";
    t.$("#askok").click();
    await new Promise((r) => setTimeout(r, 15));
    await t.painted();
    assert.ok(!badge().classList.contains("off"));
    assert.match(el(g).querySelector(".ctrs").textContent, /charge ×8\/8/);
  });

  test("véhicule : piloter le rend créature jusqu'à la fin du tour", async () => {
    const { t, put, el } = await rules();
    const c = await put("Smuggler's Copter", 30);
    assert.ok(el(c).querySelector(".ptb").classList.contains("off"));
    t.rightClick(el(c));
    t.clickMenu("Piloter");
    await t.painted();
    assert.ok(!el(c).querySelector(".ptb").classList.contains("off"));
  });

  test("créature */* : on fixe la valeur, la phrase de la carte est rappelée", async () => {
    const { t, put, el } = await rules();
    const l = await put("Lord of Extinction", 30);
    assert.equal(el(l).querySelector(".ptb").textContent, "*/*");
    assert.ok(el(l).querySelector(".ptb").classList.contains("star"));
    t.rightClick(el(l));
    t.clickMenu("Valeur de *");
    assert.match(t.$("#ask").textContent, /all graveyards/);
    t.$("#askp").value = "6";
    t.$("#askt").value = "6";
    t.$("#askok").click();
    await new Promise((r) => setTimeout(r, 15));
    await t.painted();
    assert.equal(el(l).querySelector(".ptb").textContent, "6/6");
    assert.ok(!el(l).querySelector(".ptb").classList.contains("star"));
  });

  test("clic droit sur le champ de bataille : +1/+1 à toutes mes créatures d'un coup", async () => {
    const { t, me, put, el } = await rules();
    const j = await put(JUDITH, 10),
      l = await put("Lord of Extinction", 30);
    await put("Bonesplitter", 50);
    await put("Smuggler's Copter", 70);
    t.rightClick(t.$(`.bf[data-bf="${me}"]`));
    t.clickMenu("Modifier toutes mes créatures…");
    assert.ok(t.$("#menu").textContent.includes("mes créatures (2)"));
    t.clickMenu("+1/+1 : ajouter");
    await t.painted();
    assert.equal(t.run(`S.cards["${j}"].counters["+1/+1"]`), 1);
    assert.equal(t.run(`S.cards["${l}"].counters["+1/+1"]`), 1);
    assert.match(t.run("S.log[S.log.length - 1].m"), /à chacune de/);
    // la sélection donne le même menu
    t.run(`sel.add("${j}"); sel.add("${l}")`);
    t.rightClick(el(j));
    t.clickMenu("-1/-1 jusqu'à la fin du tour");
    await t.painted();
    assert.equal(el(j).querySelector(".ptb").textContent, "2/2");
  });

  test("découvrir : les cartes exilées sont montrées, la carte trouvée va en main", async () => {
    const { t } = await rules();
    const lib = () => t.run("me().zones.library");
    const before = lib();
    t.run("discover(6)");
    assert.match(t.$("#modal h2").textContent, /Découvrir 6/);
    const shown = t.$$("#modal .disc .cell").length;
    assert.ok(shown >= 1);
    const hitBtn = t.$("#dischand");
    if (hitBtn) hitBtn.click();
    else t.$("#discok").click();
    await new Promise((r) => setTimeout(r, 15));
    await t.painted();
    assert.match(t.run("S.log[S.log.length - 1].m"), /découvre 6/);
    assert.equal(lib().length, before.length - (hitBtn ? 1 : 0));
    if (hitBtn) assert.ok(t.run("me().zones.hand").includes(before[shown - 1]));
  });

  test("le cumul des PV remplace les petits nombres flottants, le journal n'a qu'une ligne", async () => {
    const { t, me } = await rules();
    const n = t.run("S.log.length");
    for (let i = 0; i < 4; i++) await t.act({ type: "life", pid: me, d: -1 });
    assert.equal(t.$$(".float").length, 0, "plus de « -1 » flottants");
    const b = t.$(`[data-lbuf="${me}"]`);
    assert.equal(b.textContent, "-4");
    // un éclat flottant au-dessus des PV, pas une case dans l'en-tête du joueur
    assert.ok(b.classList.contains("lfloat"));
    assert.equal(b.parentNode, t.$("body"));
    assert.equal(t.$(".bhead [data-lbuf]"), null);
    assert.equal(t.$$("[data-lbuf]").length, 1, "un seul éclat, mis à jour");
    assert.equal(t.run("S.log.length"), n + 1);
    assert.match(t.$("#log").lastChild.textContent, /: -4 PV \(36\)/);
    // il s'efface en fondu, puis disparaît
    t.run("lifeBuf[myId].t -= 3200; render()");
    await t.painted();
    assert.ok(t.$(`[data-lbuf="${me}"]`).classList.contains("fade"));
    t.run("lifeBuf[myId].t -= 1000; render()");
    await t.painted();
    assert.equal(t.$(`[data-lbuf="${me}"]`), null);
  });

  test("main : la carte soulevée suit la souris sans va-et-vient", async () => {
    const { t } = await rules();
    const hb = t.$("#handbar"),
      cards = t.$$("#handbar .card[data-cid]");
    assert.ok(cards.length >= 3);
    hb.getBoundingClientRect = () => ({
      left: 0,
      right: 1000,
      top: 500,
      bottom: 640,
      width: 1000,
      height: 140,
    });
    // cartes au repos de 100 px, qui se chevauchent de 40 px
    cards.forEach((el, i) => {
      Object.defineProperty(el, "offsetLeft", { value: 100 + i * 60 });
      Object.defineProperty(el, "offsetWidth", { value: 100 });
    });
    const lifted = () => t.$$("#handbar .card.lift").map((e) => e.dataset.cid);
    t.run("handHover(130, 600)");
    assert.deepEqual(lifted(), [cards[0].dataset.cid]);
    // zone de chevauchement : la carte de dessus (la suivante) l'emporte
    t.run("handHover(175, 600)");
    assert.deepEqual(lifted(), [cards[1].dataset.cid]);
    // au-dessus de la main (carte soulevée) : toujours la même carte
    t.run("handHover(180, 450)");
    assert.deepEqual(lifted(), [cards[1].dataset.cid]);
    // hors de la main : plus rien
    t.run("handHover(1200, 600)");
    assert.deepEqual(lifted(), []);
  });

  test("les PV perdus d'affilée sont cumulés à côté du total", async () => {
    const { t, me } = await rules();
    await t.act({ type: "life", pid: me, d: -3 });
    await t.act({ type: "life", pid: me, d: -4 });
    assert.equal(t.$(`[data-lbuf="${me}"]`).textContent, "-7");
    assert.ok(t.$(`[data-lbuf="${me}"]`).classList.contains("neg"));
    await t.act({ type: "life", pid: me, d: 2 });
    assert.equal(t.$(`[data-lbuf="${me}"]`).textContent, "-5");
    // plus tard, le cumul repart de zéro
    t.run("lifeBuf[myId].t -= 10000");
    await t.act({ type: "life", pid: me, d: 1 });
    assert.equal(t.$(`[data-lbuf="${me}"]`).textContent, "+1");
  });
});

describe("jetons", () => {
  test("les jetons et emblèmes du deck sont proposés, dont The Ring à deux faces", async () => {
    const t = await open({
      editor: editorDeck([
        { name: JUDITH, cmd: true },
        { name: "Call of the Ring" },
        { name: "Young Pyromancer" },
        { name: "Mountain", qty: 20 },
      ]),
    });
    await t.host();
    await t.pickEditorDeck("Rakdos");
    await t.play();
    assert.deepEqual(
      t.run("myTokens").map((x) => x.name),
      ["The Ring // The Ring Tempts You", "Elemental"],
    );
    t.$("#btoken").click();
    await waitFor(() => t.$$("#tkdeck .cell").length === 2, {
      msg: "jetons du deck",
    });
    assert.match(t.$("#modal").textContent, /Jetons et emblèmes de ton deck/);
    t.$$("#tkdeck .cell")[0].click();
    await new Promise((r) => setTimeout(r, 15));
    await t.painted();
    const ring = cardsNamed(t, "The Ring // The Ring Tempts You")[0];
    assert.ok(ring.token);
    assert.match(ring.img, /ring\.jpg/);
    assert.match(ring.img2, /ring-tempts/);
    assert.equal(ring.name2, "The Ring Tempts You");
    assert.match(
      t.run("S.log[S.log.length - 1].m"),
      /crée un jeton The Ring\./,
    );
    // un jeton double face se transforme comme une carte
    await t.act({ type: "transform", cid: ring.id });
    assert.match(
      t.run("S.log[S.log.length - 1].m"),
      /transforme The Ring en The Ring Tempts You/,
    );
  });

  test("la recherche couvre emblèmes, jetons double face et cartes d'aide (Monarque…)", async () => {
    const { t } = await seated();
    t.$("#btoken").click();
    assert.equal(t.$("#tkdeck"), null, "pas de section sans jeton connu");
    const pill = t
      .$$("#modal .pill")
      .find((b) => b.textContent === "The Monarch");
    pill.click();
    await waitFor(() => t.$$("#modal .grid .cell").length === 1, {
      msg: "résultat",
    });
    const url = t.fetchLog.filter((l) => l.path === "/cards/search").pop().url;
    assert.match(decodeURIComponent(url), /layout:double_faced_token/);
    assert.match(decodeURIComponent(url), /layout:emblem/);
    assert.match(t.$("#modal .grid .cell").textContent, /The Monarch/);
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

  test("un simple clic sur une carte de la main la met en jeu", async () => {
    const { t } = await seated();
    const id = myZone(t, "hand")[0];
    press(t, t.$(`#handbar .card[data-cid="${id}"]`));
    await t.painted();
    assert.equal(t.run(`S.cards["${id}"].zone`), "battlefield");
    assert.ok(t.$(`.board.me .bf .card[data-cid="${id}"]`));
    assert.equal(t.$(`#handbar .card[data-cid="${id}"]`), null);
    // un double-clic par habitude : le second clic ne doit pas engager la carte qui vient d'arriver
    press(t, t.$(`.board.me .bf .card[data-cid="${id}"]`));
    await t.painted();
    assert.equal(t.run(`S.cards["${id}"].tapped`), false);
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

  test("loupe : maintenir Z grossit la partie de la carte sous la souris", async () => {
    const { t } = await seated();
    const pv = t.$("#preview"),
      el = t.$(".pile.command .card");
    el.getBoundingClientRect = () => ({
      left: 300,
      right: 380,
      top: 200,
      bottom: 300,
      width: 80,
      height: 100,
    });
    t.run(
      "hover = document.querySelector('.pile.command .card'), showPreview(hover)",
    );
    const ev = (type, init) =>
      t.run(
        `document.dispatchEvent(new ${type === "mousemove" ? "MouseEvent" : "KeyboardEvent"}("${type}", ${JSON.stringify(init)}))`,
      );
    ev("mousemove", { clientX: 320, clientY: 220 });
    ev("keydown", { key: "z", bubbles: true });
    assert.ok(pv.classList.contains("loupe"), "loupe active");
    assert.equal(pv.style.getPropertyValue("--lx"), "25.0%");
    assert.equal(pv.style.getPropertyValue("--ly"), "20.0%");
    ev("mousemove", { clientX: 370, clientY: 290 });
    assert.equal(pv.style.getPropertyValue("--lx"), "87.5%");
    assert.equal(pv.style.getPropertyValue("--ly"), "90.0%");
    ev("keyup", { key: "z" });
    assert.ok(!pv.classList.contains("loupe"), "loupe relâchée");
  });

  test("zoom du plateau : boutons − / +, mémorisé, et cartes posées plus serrées", async () => {
    const { t } = await seated();
    const spots = () =>
      t.run(
        "(() => { const u = []; for (let i = 0; i < 15; i++) freeSpot(null, u); return u; })()",
      );
    assert.equal(t.$("#bzval").textContent, "100 %");
    assert.equal(
      spots().filter((p) => p.y === 5).length,
      11,
      "11 cartes par rangée à 100 %",
    );
    for (let i = 0; i < 5; i++) t.$("#bzout").click();
    assert.equal(t.$("#bzval").textContent, "50 %");
    assert.equal(
      t.run("document.documentElement.style.getPropertyValue('--bz')"),
      "0.5",
    );
    assert.equal(
      spots().filter((p) => p.y === 5).length,
      15,
      "une seule rangée à 50 %",
    );
    for (let i = 0; i < 3; i++) t.$("#bzout").click();
    assert.equal(t.$("#bzval").textContent, "40 %", "minimum");
    assert.ok(t.$("#bzout").disabled);
    assert.equal(t.run("localStorage.getItem('cmdtable-zoom')"), "0.4");
    t.$("#bzval").click();
    assert.equal(t.$("#bzval").textContent, "100 %");
    assert.equal(t.run("localStorage.getItem('cmdtable-zoom')"), null);

    const t2 = await open({ local: { "cmdtable-zoom": 0.7 } });
    assert.equal(
      t2.$("#bzval").textContent,
      "70 %",
      "zoom retrouvé au rechargement",
    );
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
      "pipe",
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
        createBiquadFilter: node, createGain: node, createDynamicsCompressor: node, createWaveShaper: node };
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

  test("easter egg : le tuyau métallique résonne à chaque action une fois activé dans l'aide", async () => {
    const { t } = await seated();
    t.run("window.played = []; sfx = (n) => played.push(n)");
    await t.act({ type: "draw", pid: t.run("myId"), n: 1 });
    assert.ok(!t.run("played").includes("pipe"), "désactivé par défaut");

    t.$("#bhelp").click();
    const box = t.$("#pipe");
    assert.ok(box, "case à cocher dans l'aide");
    assert.equal(box.checked, false);
    box.click();
    assert.equal(t.run("localStorage.getItem('cmdtable-pipe')"), "true");
    assert.deepEqual(
      t.run("played"),
      ["draw", "pipe"],
      "un clang pour l'essayer",
    );

    t.run("played.length = 0; pipeAt = 0");
    await t.act({ type: "draw", pid: t.run("myId"), n: 1 });
    assert.deepEqual(t.run("played"), ["pipe", "draw"]);
    // une rafale d'actions ne fait qu'un seul clang
    t.run("played.length = 0");
    await t.act({ type: "draw", pid: t.run("myId"), n: 1 });
    assert.deepEqual(t.run("played"), ["draw"]);

    // case cochée : les boutons « Écouter les sons » jouent aussi le tuyau
    t.$("#bhelp").click();
    t.run("played.length = 0");
    const pill = t.$$("#modal .pill").find((b) => b.textContent === "Pioche");
    pill.click();
    assert.deepEqual(t.run("played"), ["pipe"]);

    t.$("#pipe").click();
    assert.equal(t.run("localStorage.getItem('cmdtable-pipe')"), null);
    t.run("played.length = 0");
    pill.click();
    assert.deepEqual(t.run("played"), ["draw"]);
  });

  test("le tuyau est saturé : il passe par un waveshaper, hors du compresseur commun", async () => {
    const t = await open();
    const r = t.run(`(() => {
      let shapers = 0, toDest = 0;
      const dest = {};
      const node = () => ({ connect: (x) => { if (x === dest) toDest++; return x; }, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } });
      const a = { sampleRate: 8000, currentTime: 0, destination: dest,
        createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }),
        createBufferSource: () => Object.assign(node(), { start() {} }),
        createOscillator: () => Object.assign(node(), { start() {}, stop() {} }),
        createBiquadFilter: node, createGain: node, createDynamicsCompressor: node,
        createWaveShaper: () => { shapers++; return node(); } };
      SOUNDS.pipe(a, node(), 0);
      return { shapers, toDest };
    })()`);
    assert.ok(r.shapers >= 1, "saturation");
    assert.ok(
      r.toDest >= 1,
      "sortie directe, sans le compresseur qui l'étoufferait",
    );
  });

  test("le tuyau métallique varie d'un clang à l'autre", async () => {
    const t = await open();
    const freqs = t.run(`(() => {
      const out = [];
      for (let i = 0; i < 4; i++) {
        let first = null;
        const node = () => ({ connect: (x) => x, frequency: { value: 0, setValueAtTime(v) { if (first == null) first = v; }, exponentialRampToValueAtTime() {} }, Q: {}, gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } });
        const a = { sampleRate: 8000, currentTime: 0, destination: {},
          createBuffer: (c, len) => ({ getChannelData: () => new Float32Array(len) }),
          createBufferSource: () => Object.assign(node(), { start() {} }),
          createOscillator: () => { const o = Object.assign(node(), { start() {}, stop() {} }); const f = o.frequency; Object.defineProperty(f, "value", { set(v) { if (first == null) first = v; }, get() { return 0; } }); return o; },
          createBiquadFilter: () => Object.assign(node(), { frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} } }), createGain: node, createDynamicsCompressor: node, createWaveShaper: node };
        SOUNDS.pipe(a, node(), 0);
        out.push(first);
      }
      return out;
    })()`);
    assert.ok(new Set(freqs).size > 1, "hauteur différente : " + freqs);
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
      "+1/+1 ×1",
    );
  });

  test("force et endurance : pastille sur la carte, bonus et marqueurs répercutés", async () => {
    const { t } = await seated();
    const id = cardsNamed(t, "Judith, the Scourge Diva")[0].id;
    assert.equal(t.run(`S.cards["${id}"].pt`), "2/2");
    await t.act({
      type: "move",
      cid: id,
      to: { pid: t.run("myId"), zone: "battlefield" },
      x: 10,
      y: 10,
    });
    await t.painted();
    const card = () => t.$(`.bf .card[data-cid="${id}"]`);
    const badge = () => card().querySelector(".ptb");
    assert.equal(badge().textContent, "2/2");
    assert.equal(badge().className, "ptb");

    t.rightClick(card());
    for (const label of [
      "+1/+1 jusqu'à la fin du tour",
      "-1/-1 jusqu'à la fin du tour",
      "Autre bonus jusqu'à la fin du tour…",
      "+1/+1 permanent",
      "-1/-1 permanent",
      "Autre bonus permanent…",
    ])
      assert.ok(t.menu().includes(label), "menu : " + label);
    t.clickMenu("+1/+1 jusqu'à la fin du tour");
    await t.painted();
    assert.equal(badge().textContent, "3/3");
    assert.equal(badge().className, "ptb up");

    t.rightClick(card());
    t.clickMenu("+1/+1 permanent");
    await t.painted();
    assert.equal(badge().textContent, "4/4");

    // bonus personnalisé : une case force, une case endurance
    t.rightClick(card());
    t.clickMenu("Autre bonus permanent…");
    assert.match(t.$("#ask").textContent, /\//);
    assert.equal(t.$("#askp").value, "+1");
    assert.equal(t.$("#askt").value, "+1");
    t.$("#askp").value = "-4";
    t.$("#askt").value = "0";
    t.$("#askok").click();
    await t.painted();
    assert.equal(badge().textContent, "0/4");
    assert.equal(badge().className, "ptb mix");

    t.rightClick(card());
    t.clickMenu("-1/-1 : ajouter");
    await t.painted();
    t.rightClick(card());
    assert.ok(
      !t.menu().some((l) => /: retirer/.test(l)),
      "pas d'entrée « retirer » : +1/+1 et -1/-1 s'annulent",
    );
    t.clickMenu("+1/+1 : ajouter");
    await t.painted();
    assert.equal(card().querySelectorAll(".ctrs span").length, 0);
    assert.equal(badge().textContent, "0/4");

    t.rightClick(card());
    const reset = t.menu().find((l) => /^Retirer les bonus/.test(l));
    assert.equal(reset, "Retirer les bonus (-2/+2)");
    t.clickMenu(reset);
    await t.painted();
    assert.equal(badge().textContent, "2/2");
    assert.equal(badge().className, "ptb");
  });

  test("régression : une carte sans force ni endurance n'affiche ni pastille ni texte « null »", async () => {
    const { t } = await seated();
    const id = cardsNamed(t, "Sol Ring")[0].id;
    await t.act({
      type: "move",
      cid: id,
      to: { pid: t.run("myId"), zone: "battlefield" },
      x: 10,
      y: 10,
    });
    await t.painted();
    const el = t.$(`.bf .card[data-cid="${id}"]`);
    assert.equal(el.querySelector(".ptb"), null);
    assert.doesNotMatch(el.textContent, /null/);
    t.run(
      `0, showPreview(document.querySelector('.bf .card[data-cid="${id}"]'))`,
    );
    assert.doesNotMatch(t.$("#preview").textContent, /null/);
  });

  test("l'aperçu agrandi liste tous les modificateurs de la créature", async () => {
    const { t } = await seated();
    const id = cardsNamed(t, "Judith, the Scourge Diva")[0].id;
    await t.act({
      type: "move",
      cid: id,
      to: { pid: t.run("myId"), zone: "battlefield" },
      x: 10,
      y: 10,
    });
    await t.painted();
    const show = () =>
      t.run(
        `0, showPreview(document.querySelector('.bf .card[data-cid="${id}"]'))`,
      );
    show();
    assert.equal(
      t.$("#preview .pmods"),
      null,
      "rien à lister sans modificateur",
    );

    await t.act({ type: "counter", cid: id, k: "+1/+1", d: 2 });
    await t.act({ type: "counter", cid: id, k: "charge", d: 3 });
    await t.act({ type: "pt", cid: id, p: 3, t: -1 });
    await t.act({ type: "pt", cid: id, p: -1, t: -1, eot: true });
    await t.painted();
    show();
    const rows = t
      .$$("#preview .pmods li")
      .map((li) => li.textContent.replace(/\s+/g, " ").trim());
    assert.deepEqual(rows, [
      "Imprimée 2/2",
      "Marqueurs +1/+1 ×2 +2/+2",
      "Marqueurs charge ×3",
      "Bonus permanent +3/-1",
      "Jusqu'à la fin du tour -1/-1",
      "Total 6/2",
    ]);
    // les marqueurs ne sont plus répétés sous l'aperçu
    assert.equal(t.$("#preview .pinfo"), null);
  });

  test("la pastille suit la face visible d'une carte double face", async () => {
    const { t } = await seated();
    const v = cardsNamed(t, "Vincent Valentine // Galian Beast")[0];
    await t.act({
      type: "move",
      cid: v.id,
      to: { pid: t.run("myId"), zone: "battlefield" },
      x: 10,
      y: 10,
    });
    await t.painted();
    const badge = () => t.$(`.bf .card[data-cid="${v.id}"] .ptb`).textContent;
    assert.equal(badge(), "2/2");
    await t.act({ type: "transform", cid: v.id });
    await t.painted();
    assert.equal(badge(), "5/5");
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

  test("le lien ⌂ ramène à l'accueil du site après confirmation, et quitte la table", async () => {
    const hub = makeHub();
    const { t: host, code } = await seated({ hub });
    const guest = await guestOf(hub, code);
    await waitFor(() => host.run("S.order.length") === 2);
    assert.equal(guest.$("#bhome").getAttribute("href"), "index.html");
    assert.equal(guest.$("#lobby a.home").getAttribute("href"), "index.html");
    guest.run("nav = (u) => (window.went = u)");
    guest.$("#bhome").click();
    assert.match(guest.$("#ask").textContent, /Quitter la table/);
    guest.$("#askok").click();
    await waitFor(() => host.run("S.order.length") === 1, { msg: "départ" });
    await waitFor(() => guest.run("window.went") === "index.html", {
      msg: "navigation",
    });
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
    await guest.painted();
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
