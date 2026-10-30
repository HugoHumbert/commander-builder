const { describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, deckState } = require("./helpers");

let app;
beforeEach(async () => {
  app = await openApp();
});
afterEach(() => app.close());
const importText = (txt) => app.run(`doImport(${JSON.stringify(txt)})`);
const activeDeck = () => app.run("active()");

describe("import", () => {
  test("texte simple avec sections Commander / Deck", async () => {
    await importText(
      "Commander\n1 Judith, the Scourge Diva\n\nDeck\n1 Sol Ring\n10 Mountain\n// commentaire\n",
    );
    const d = activeDeck();
    assert.equal(app.run("decks.length"), 2, "un nouveau deck est créé");
    assert.deepEqual(
      d.cards.map((c) => [c.name, c.qty, c.cmd]),
      [
        ["Judith, the Scourge Diva", 1, true],
        ["Sol Ring", 1, false],
        ["Mountain", 10, false],
      ],
    );
    assert.equal(app.$("#count").textContent, "12 / 100");
  });

  test("format Archidekt : catégorie [Commander], (SET) numéro, *F*, ^Have^", async () => {
    await importText(
      [
        "1x Judith, the Scourge Diva (RNA) 185 [Commander]",
        "1x Sol Ring (CMM) 410 *F* [Ramp] ^Have,#37d67a^",
        "1x Lightning Bolt (M10) 146 [Removal]",
      ].join("\n"),
    );
    const cards = activeDeck().cards;
    assert.deepEqual(
      cards.map((c) => [c.name, c.cmd, c.foil]),
      [
        ["Judith, the Scourge Diva", true, false],
        ["Sol Ring", false, true],
        ["Lightning Bolt", false, false],
      ],
    );
  });

  test("format MTGA : 1 Nom (SET) 123", async () => {
    await importText("1 Lightning Bolt (M10) 146");
    assert.equal(activeDeck().cards[0].name, "Lightning Bolt");
  });

  test("texte + variantes : « 1 Nom  //  Variante »", async () => {
    await importText("1 Judith, the Scourge Diva  //  Dame Papillon");
    const c = activeDeck().cards[0];
    assert.equal(c.name, "Judith, the Scourge Diva");
    assert.equal(c.variant, "Dame Papillon");
  });

  test("nom approximatif résolu vers le nom canonique", async () => {
    await importText("1 sol ring");
    assert.equal(activeDeck().cards[0].name, "Sol Ring");
  });

  test("carte double face importée par son nom complet", async () => {
    await importText("1 Vincent Valentine // Galian Beast");
    assert.equal(
      activeDeck().cards[0].name,
      "Vincent Valentine // Galian Beast",
    );
    assert.ok(app.run(`cardOf("Vincent Valentine // Galian Beast")`));
  });

  test("JSON : conserve variantes, groupes, statut, foil, image", async () => {
    const src = {
      name: "Mon deck",
      groups: ["Rampe"],
      cards: [
        {
          name: "Judith, the Scourge Diva",
          qty: 1,
          variant: "Dame Papillon",
          group: "",
          cmd: true,
          status: "done",
          foil: true,
          proxyImg: "file:///C:/Proxys/judith.png",
        },
        { name: "Sol Ring", qty: 1, group: "Rampe", status: "wip" },
      ],
    };
    await importText(JSON.stringify(src));
    const d = activeDeck();
    assert.equal(d.name, "Mon deck");
    assert.deepEqual(d.groups, ["Rampe"]);
    assert.deepEqual(d.cards[0], { ...src.cards[0] });
    assert.equal(
      d.cards[1].variant,
      "",
      "valeurs par défaut pour les champs absents",
    );
    assert.equal(d.cards[1].foil, false);
    assert.equal(d.cards[1].proxyImg, "");
  });

  test("JSON invalide : message d'erreur et aucun deck créé", async () => {
    await importText("{ pas du json");
    assert.equal(app.run("decks.length"), 1);
    assert.match(app.toast(), /JSON invalide/);
  });

  test("texte vide : rien n'est importé", async () => {
    await importText("   ");
    assert.equal(app.run("decks.length"), 1);
  });
});

describe("export", () => {
  beforeEach(async () => {
    app.close();
    app = await openApp({
      stored: deckState(
        [
          {
            name: "Judith, the Scourge Diva",
            cmd: true,
            variant: "Dame Papillon",
          },
          { name: "Sol Ring", foil: true, group: "Rampe" },
          { name: "Mountain", qty: 3 },
        ],
        { groups: ["Rampe"] },
      ),
    });
  });

  test("texte : section Commander puis Deck", () => {
    assert.equal(
      app.run("exportPlain()"),
      "Commander\n1 Judith, the Scourge Diva\n\nDeck\n1 Sol Ring\n3 Mountain",
    );
  });

  test("texte + variantes", () => {
    assert.equal(
      app.run("exportVariant()"),
      "1 Judith, the Scourge Diva  //  Dame Papillon\n1 Sol Ring\n3 Mountain",
    );
  });

  test("Archidekt : set, numéro, foil, catégorie", () => {
    assert.equal(
      app.run("exportArchidekt()"),
      [
        "1x Judith, the Scourge Diva (RNA) 185 [Commander]",
        "1x Sol Ring (CMM) 410 *F* [Artifact]",
        "3x Mountain (FDN) 279 [Land]",
      ].join("\n"),
    );
  });

  test("JSON : contient tous les champs des cartes", () => {
    const j = JSON.parse(app.run("exportJSON()"));
    assert.equal(j.name, "Test");
    assert.deepEqual(j.groups, ["Rampe"]);
    assert.equal(j.cards.length, 3);
    assert.equal(j.cards[0].variant, "Dame Papillon");
  });

  test("aller-retour JSON : export puis import redonne le même deck", async () => {
    const before = JSON.parse(app.run("exportJSON()"));
    await importText(app.run("exportJSON()"));
    const after = JSON.parse(app.run("exportJSON()"));
    assert.deepEqual(after, before);
  });

  test("aller-retour Archidekt : commandant et foil conservés", async () => {
    await importText(app.run("exportArchidekt()"));
    assert.deepEqual(
      activeDeck().cards.map((c) => [c.name, c.qty, c.cmd, c.foil]),
      [
        ["Judith, the Scourge Diva", 1, true, false],
        ["Sol Ring", 1, false, true],
        ["Mountain", 3, false, false],
      ],
    );
  });

  test("la fenêtre d'export affiche le format choisi et copie dans le presse-papier", async () => {
    app.$("#exportBtn").click();
    assert.ok(app.$("#exportDlg").open);
    assert.equal(app.$("#exportText").value, app.run("exportPlain()"));
    app.$("#fmtArchidekt").click();
    assert.equal(app.$("#exportText").value, app.run("exportArchidekt()"));
    app.$("#exCopy").click();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(app.window.clipboardText, app.run("exportArchidekt()"));
  });
});
