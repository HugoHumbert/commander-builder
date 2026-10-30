// Édition du deck depuis l'interface : ajout, quantités, statut, foil, groupes, annulation.
const { describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, deckState, answerPrompt, pressCtrl } = require("./helpers");

let app;
afterEach(() => app.close());
const cards = () => app.run("active()").cards;
const input = (el, v) => {
  el.value = v;
  el.dispatchEvent(new app.window.Event("input", { bubbles: true }));
};

describe("ajout de cartes", () => {
  beforeEach(async () => {
    app = await openApp();
  });

  test("addCard ajoute une carte avec les valeurs par défaut", async () => {
    await app.run(`addCard("Sol Ring")`);
    assert.deepEqual(cards(), [
      {
        name: "Sol Ring",
        qty: 1,
        variant: "",
        group: "",
        cmd: false,
        status: "todo",
        foil: false,
        proxyImg: "",
      },
    ]);
    assert.equal(app.rows().length, 1);
    assert.equal(app.$("#count").textContent, "1 / 100");
  });

  test("ajouter une carte déjà présente augmente sa quantité", async () => {
    await app.run(`addCard("Sol Ring")`);
    await app.run(`addCard("Sol Ring")`);
    assert.equal(cards().length, 1);
    assert.equal(cards()[0].qty, 2);
  });

  test("Entrée dans la recherche ajoute la carte trouvée (nom approximatif)", async () => {
    const add = app.$("#add");
    add.value = "sol ring";
    add.dispatchEvent(
      new app.window.KeyboardEvent("keydown", { key: "Enter" }),
    );
    await app.waitFor(() => cards().length === 1, { msg: "carte ajoutée" });
    assert.equal(cards()[0].name, "Sol Ring");
    assert.equal(add.value, "", "le champ est vidé");
  });

  test("carte introuvable : message, rien n'est ajouté", async () => {
    await app.run(`pickText("zzz introuvable")`);
    assert.equal(cards().length, 0);
    assert.match(app.toast(), /Introuvable/);
  });
});

describe("lignes de cartes", () => {
  beforeEach(async () => {
    app = await openApp({
      stored: deckState([
        { name: "Judith, the Scourge Diva" },
        { name: "Sol Ring" },
        { name: "Lightning Bolt", qty: 2 },
      ]),
    });
  });

  test("+ / − changent la quantité ; à 0 la carte est retirée", () => {
    const [minus, plus] = app.row("Sol Ring").querySelectorAll(".qty button");
    plus.click();
    assert.equal(cards()[1].qty, 2);
    assert.equal(app.row("Sol Ring").querySelector(".n").textContent, "2");
    minus.click();
    minus.click();
    assert.ok(!cards().some((c) => c.name === "Sol Ring"));
    assert.equal(app.$("#count").textContent, "3 / 100");
  });

  test("✕ retire la carte", () => {
    app.row("Lightning Bolt").querySelector(".rm").click();
    assert.deepEqual(
      cards().map((c) => c.name),
      ["Judith, the Scourge Diva", "Sol Ring"],
    );
  });

  test("la couronne désigne le commandant (groupe Commandant en tête)", () => {
    app.row("Judith").querySelector(".crown").click();
    assert.equal(cards()[0].cmd, true);
    assert.equal(app.groupNames()[0], "Commandant");
  });

  test("le nom de variante est enregistré à la saisie", () => {
    input(app.row("Judith").querySelector(".vwrap input"), "Dame Papillon");
    assert.equal(cards()[0].variant, "Dame Papillon");
    assert.equal(app.stored().decks[0].cards[0].variant, "Dame Papillon");
  });

  test("statut de proxy : à faire → en cours → fait → à faire, compteur mis à jour", () => {
    const st = () => app.row("Sol Ring").querySelector(".stbox");
    st().click();
    assert.equal(cards()[1].status, "wip");
    st().click();
    assert.equal(cards()[1].status, "done");
    assert.equal(app.$("#doneN").textContent, "1");
    st().click();
    assert.equal(cards()[1].status, "todo");
  });

  test("statut en masse : met tout à « fait » si mixte, sinon fait tourner", () => {
    app.row("Sol Ring").querySelector(".stbox").click(); // mixte
    app.$("#bulkStatus").click();
    assert.ok(cards().every((c) => c.status === "done"));
    assert.equal(app.$("#doneN").textContent, "4");
    app.$("#bulkStatus").click();
    assert.ok(cards().every((c) => c.status === "todo"));
  });

  test("foil : case par carte et bascule en masse", () => {
    const cb = app.row("Lightning Bolt").querySelector(".foil input");
    cb.checked = true;
    cb.dispatchEvent(new app.window.Event("change"));
    assert.equal(cards()[2].foil, true);
    assert.equal(app.$("#foilN").textContent, "2", "compte les exemplaires");
    app.$("#bulkFoil").click();
    assert.ok(cards().every((c) => c.foil));
    app.$("#bulkFoil").click();
    assert.ok(cards().every((c) => !c.foil));
  });

  test("filtre : par nom ou par variante", () => {
    app.run(`active().cards[0].variant = "Dame Papillon"`);
    input(app.$("#filter"), "papillon");
    assert.equal(app.rows().length, 1);
    input(app.$("#filter"), "bolt");
    assert.equal(app.rows().length, 1);
    app.$("#filterClr").click();
    assert.equal(app.rows().length, 3);
  });

  test("groupement par type / coût / couleur", () => {
    assert.deepEqual(app.groupNames(), ["Créatures", "Éphémères", "Artefacts"]);
    app.$("#gbCost").click();
    assert.equal(app.groupNames().length, 2, "coût 1 et coût 3");
    app.$("#gbColor").click();
    assert.deepEqual(app.groupNames(), ["Rouge", "Multicolore", "Incolore"]);
  });

  test("répartition des couleurs", () => {
    const pct = app.$$("#pips .pip b").map((b) => b.textContent);
    // Judith {B}{R} + 2× Bolt {R} : R = 3, B = 1
    assert.deepEqual(pct, ["25%", "75%"]);
  });
});

describe("groupes personnalisés", () => {
  beforeEach(async () => {
    app = await openApp({
      stored: deckState([{ name: "Sol Ring" }, { name: "Lightning Bolt" }]),
    });
    app.$("#gbCustom").click();
  });

  test("créer un groupe et y ranger une carte via le menu", () => {
    app.$("#groupsBtn").click();
    app.$("#newGroupInp").value = "Rampe";
    app.$("#addGroupBtn").click();
    assert.deepEqual(app.run("active()").groups, ["Rampe"]);
    const sel = app.row("Sol Ring").querySelector(".grpsel");
    sel.value = "Rampe";
    sel.dispatchEvent(new app.window.Event("change"));
    assert.equal(cards()[0].group, "Rampe");
    assert.equal(app.groupNames()[0], "Rampe");
  });

  test("renommer un groupe renomme aussi celui des cartes", () => {
    app.run(
      `active().groups = ["Rampe"]; active().cards[0].group = "Rampe"; render()`,
    );
    app.$("#groupsBtn").click();
    const inp = app.$("#glist input");
    inp.value = "Ramp";
    inp.dispatchEvent(new app.window.Event("change"));
    assert.equal(cards()[0].group, "Ramp");
  });
});

describe("decks et annulation", () => {
  beforeEach(async () => {
    app = await openApp({ stored: deckState([{ name: "Sol Ring" }]) });
  });

  test("Ctrl+Z annule la suppression d'une carte", async () => {
    app.row("Sol Ring").querySelector(".rm").click();
    assert.equal(cards().length, 0);
    pressCtrl(app, "z");
    await app.waitFor(() => cards().length === 1, { msg: "annulation" });
    assert.equal(cards()[0].name, "Sol Ring");
  });

  test("annuler sans historique : message", async () => {
    await app.run("doUndo()");
    assert.match(app.toast(), /Rien à annuler/);
  });

  test("nouveau deck, dupliquer, supprimer (avec confirmation)", async () => {
    app.$("#newDeck").click();
    await answerPrompt(app, "Deuxième");
    assert.equal(app.run("decks.length"), 2);
    assert.equal(app.run("active()").name, "Deuxième");

    app.$("#deckSel").value = "d1";
    app.$("#deckSel").dispatchEvent(new app.window.Event("change"));
    await app.waitFor(() => app.run("activeId") === "d1");
    app.$("#dupDeck").click();
    assert.equal(app.run("decks.length"), 3);
    assert.equal(app.run("active()").cards[0].name, "Sol Ring");
    assert.ok(
      app.run("active().cards[0] !== decks[0].cards[0]"),
      "copie, pas référence",
    );

    app.$("#delDeck").click();
    await answerPrompt(app, "non");
    assert.equal(app.run("decks.length"), 3, "mauvais mot : rien supprimé");
    app.$("#delDeck").click();
    await answerPrompt(app, "SUPPRIMER");
    assert.equal(app.run("decks.length"), 2);
  });

  test("impossible de supprimer le dernier deck", () => {
    app.$("#delDeck").click();
    assert.equal(app.run("decks.length"), 1);
    assert.match(app.toast(), /dernier deck/);
  });

  test("changement de langue FR / EN", () => {
    app.$('#langseg [data-l="en"]').click();
    assert.equal(app.groupNames()[0], "Artifacts");
    assert.equal(app.stored().lang, "en");
  });
});
