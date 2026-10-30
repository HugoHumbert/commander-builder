// Fonctions pures de l'éditeur, appelées directement dans la page.
const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, deckState } = require("./helpers");

let app;
before(async () => {
  app = await openApp({
    stored: deckState([
      { name: "Sol Ring" },
      { name: "Vincent Valentine // Galian Beast" },
      { name: "Fireball" },
      { name: "Mountain" },
      { name: "Relentless Rats" },
      { name: "Nazgûl" },
    ]),
  });
});
after(() => app.close());
const card = (n) => app.run(`cardOf(${JSON.stringify(n)})`);

describe("noms", () => {
  test("normName ignore la face arrière et la casse", () => {
    assert.equal(
      app.run(`normName("Vincent Valentine // Galian Beast")`),
      "vincent valentine",
    );
    assert.equal(app.run(`normName("  Sol Ring ")`), "sol ring");
  });
  test("cardOf retrouve une carte double face par son nom complet ou sa face avant", () => {
    assert.ok(card("Vincent Valentine // Galian Beast"));
    assert.ok(card("Vincent Valentine"));
  });
});

describe("caractéristiques de carte", () => {
  test("manaOf / typeOf / enImg lisent la face avant d'une carte double face", () => {
    const v = "cardOf('Vincent Valentine')";
    assert.equal(app.run(`manaOf(${v})`), "{2}{B}{R}");
    assert.equal(
      app.run(`typeOf(${v})`).trim(),
      "Legendary Creature — Human Assassin",
    );
    assert.equal(app.run(`enImg(${v})`), "https://img.test/vincent.jpg");
  });
  test("primType", () => {
    assert.equal(app.run(`primType(cardOf("Sol Ring"))`), "Artifact");
    assert.equal(app.run(`primType(cardOf("Fireball"))`), "Sorcery");
    assert.equal(app.run(`primType(cardOf("Mountain"))`), "Land");
    assert.equal(app.run(`primType(cardOf("Vincent Valentine"))`), "Creature");
  });
  test("colorCat", () => {
    assert.equal(app.run(`colorCat(cardOf("Sol Ring"))`), "Colorless");
    assert.equal(app.run(`colorCat(cardOf("Fireball"))`), "Red");
    assert.equal(
      app.run(`colorCat(cardOf("Vincent Valentine"))`),
      "Multicolor",
    );
    assert.equal(app.run(`colorCat(cardOf("Mountain"))`), "Lands");
  });
  test("hasX", () => {
    assert.equal(app.run(`hasX(cardOf("Fireball"))`), true);
    assert.equal(app.run(`hasX(cardOf("Sol Ring"))`), false);
  });
  test("maxCopies : 1 par défaut, illimité pour terrains de base / « any number », N pour « up to N »", () => {
    assert.equal(app.run(`maxCopies(cardOf("Sol Ring"))`), 1);
    assert.equal(app.run(`maxCopies(cardOf("Mountain"))`), Infinity);
    assert.equal(app.run(`maxCopies(cardOf("Relentless Rats"))`), Infinity);
    assert.equal(app.run(`maxCopies(cardOf("Nazgûl"))`), 9);
  });
});

describe("chemins d'image de proxy", () => {
  const url = (v) => app.run(`toImgUrl(${JSON.stringify(v)})`);
  test("chemin Windows -> file:///, espaces et # encodés", () => {
    assert.equal(
      url("C:\\Users\\moi\\Proxys\\Mon deck\\Sol Ring #1.png"),
      "file:///C:/Users/moi/Proxys/Mon%20deck/Sol%20Ring%20%231.png",
    );
  });
  test("guillemets de « Copier en tant que chemin » retirés", () => {
    assert.equal(url('"C:\\a\\b.png"'), "file:///C:/a/b.png");
  });
  test("chemin Unix -> file://", () => {
    assert.equal(url("/home/moi/x.jpg"), "file:///home/moi/x.jpg");
  });
  test("URL web inchangée", () => {
    assert.equal(url(" https://ex.com/a.png "), "https://ex.com/a.png");
  });
  test("références de dossier de proxys : lib:Dossier/chemin", () => {
    assert.equal(app.run(`isLibRef("lib:Proxys/a.png")`), true);
    assert.equal(app.run(`isLibRef("https://x/a.png")`), false);
    assert.deepEqual(app.run(`parseLibRef("lib:Proxys/Rakdos/Judith.png")`), {
      root: "Proxys",
      path: "Rakdos/Judith.png",
    });
    assert.equal(app.run(`parseLibRef("lib:sans-chemin")`), null);
  });
});

describe("échappement HTML", () => {
  test("esc / escAttr", () => {
    assert.equal(app.run(`esc("<b>&")`), "&lt;b&gt;&amp;");
    assert.equal(app.run(`escAttr('a"<')`), "a&quot;&lt;");
  });
});
