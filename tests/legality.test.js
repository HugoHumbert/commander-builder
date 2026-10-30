const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, deckState } = require("./helpers");

let app;
afterEach(() => app && app.close());
const issues = () => app.run("legalityIssues()");

test("deck incomplet sans commandant : deux problèmes signalés", async () => {
  app = await openApp({ stored: deckState([{ name: "Sol Ring" }]) });
  const iss = issues();
  assert.equal(iss.length, 2);
  assert.match(iss[0], /1 cartes \(attendu : 100\)/);
  assert.match(iss[1], /Aucun commandant/);
  assert.equal(app.$("#legtxt").textContent, "2 problèmes");
});

test("deck de 100 cartes avec commandant : légal", async () => {
  app = await openApp({
    stored: deckState([
      { name: "Judith, the Scourge Diva", cmd: true },
      { name: "Sol Ring" },
      { name: "Mountain", qty: 98 },
    ]),
  });
  assert.deepEqual(issues(), []);
  assert.equal(app.$("#legtxt").textContent, "Légal");
  assert.equal(app.$("#count").className, "count");
});

test("doublons : signalés sauf terrains de base, « any number » et « up to N »", async () => {
  app = await openApp({
    stored: deckState([
      { name: "Judith, the Scourge Diva", cmd: true },
      { name: "Sol Ring", qty: 2 },
      { name: "Mountain", qty: 30 },
      { name: "Relentless Rats", qty: 20 },
      { name: "Nazgûl", qty: 9 },
    ]),
  });
  const dup = issues().filter((m) => /exemplaires/.test(m));
  assert.deepEqual(dup, ["« Sol Ring » : 2 exemplaires (max 1)."]);
});

test("Nazgûl : plus de 9 exemplaires signalé", async () => {
  app = await openApp({
    stored: deckState([
      { name: "Judith, the Scourge Diva", cmd: true },
      { name: "Nazgûl", qty: 10 },
    ]),
  });
  assert.ok(issues().includes("« Nazgûl » : 10 exemplaires (max 9)."));
});

test("identité de couleur : carte hors identité signalée et marquée en rouge", async () => {
  app = await openApp({
    stored: deckState([
      { name: "Judith, the Scourge Diva", cmd: true },
      { name: "Counterspell" },
      { name: "Lightning Bolt" },
    ]),
  });
  const col = issues().filter((m) => /identité/.test(m));
  assert.deepEqual(col, [
    "« Counterspell » : hors de l'identité de couleur du commandant.",
  ]);
  assert.ok(
    app.row("Counterspell").querySelector(".nm").classList.contains("bad"),
  );
  assert.ok(
    !app.row("Lightning Bolt").querySelector(".nm").classList.contains("bad"),
  );
});

test("la pastille de légalité ouvre la liste des problèmes", async () => {
  app = await openApp({ stored: deckState([{ name: "Sol Ring" }]) });
  app.$("#legchip").click();
  assert.ok(app.$("#legDlg").open);
  assert.equal(app.$$("#leglist li").length, 2);
});
