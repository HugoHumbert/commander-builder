// Sauvegarde et rechargement de la page (F5).
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, deckState } = require("./helpers");

const opened = [];
const open = async (o) => {
  const a = await openApp(o);
  opened.push(a);
  return a;
};
afterEach(() => opened.splice(0).forEach((a) => a.close()));

/** simule un F5 : rouvre l'app avec ce qu'elle a sauvegardé */
const reload = (app) => open({ stored: app.stored() });

test("régression : le deck survit à un rechargement (localStorage sans window.storage)", async () => {
  const app = await open();
  await app.run(`addCard("Sol Ring")`);
  await app.run(`addCard("Judith, the Scourge Diva")`);
  app.row("Sol Ring").querySelector(".vwrap input").value = "Anneau";
  app
    .row("Sol Ring")
    .querySelector(".vwrap input")
    .dispatchEvent(new app.window.Event("input"));

  assert.ok(app.stored(), "quelque chose est enregistré dans localStorage");
  const again = await reload(app);
  assert.deepEqual(
    again.run("active()").cards.map((c) => [c.name, c.variant]),
    [
      ["Sol Ring", "Anneau"],
      ["Judith, the Scourge Diva", ""],
    ],
  );
});

test("régression : une carte double face se recharge (pas de groupe « chargement… »)", async () => {
  const app = await open({
    stored: deckState([
      {
        name: "Vincent Valentine // Galian Beast",
        cmd: true,
        variant: "Sculpteur",
      },
    ]),
  });
  assert.ok(
    app.run(`cardOf("Vincent Valentine // Galian Beast")`),
    "carte résolue",
  );
  assert.ok(!app.groupNames().some((g) => /chargement/.test(g)));
  assert.equal(app.groupNames()[0], "Commandant");
  assert.equal(
    app.row("Vincent Valentine").querySelectorAll(".mana img").length,
    3,
  ); // {2}{B}{R}
});

test("la langue et le deck actif sont restaurés", async () => {
  const stored = deckState([{ name: "Sol Ring" }]);
  stored.decks.push({ id: "d2", name: "Deux", groups: [], cards: [] });
  stored.activeId = "d2";
  stored.lang = "en";
  const app = await open({ stored });
  assert.equal(app.run("activeId"), "d2");
  assert.equal(app.run("lang"), "en");
  assert.equal(app.$("#add").placeholder, "Add a card — name (en or fr)…");
});

test("anciens decks sans les nouveaux champs : valeurs par défaut", async () => {
  const app = await open({
    stored: {
      activeId: "d1",
      decks: [
        {
          id: "d1",
          name: "Vieux",
          cards: [{ name: "Sol Ring", qty: 1, variant: "" }],
        },
      ],
    },
  });
  const c = app.run("active()").cards[0];
  assert.equal(c.cmd, false);
  assert.equal(c.group, "");
  assert.equal(c.status, "todo");
  assert.equal(c.foil, false);
  assert.equal(c.proxyImg, "");
  assert.deepEqual(app.run("active()").groups, []);
});

test("sans sauvegarde : un deck vide par défaut", async () => {
  const app = await open();
  assert.equal(app.run("decks.length"), 1);
  assert.equal(app.run("active()").name, "Deck 1");
  assert.ok(app.$(".empty-state"));
});

test("window.storage est utilisé en priorité quand il existe (environnement artefact)", async () => {
  const mem = {};
  const app = await open({
    setup(w) {
      w.storage = {
        get: async (k) => (k in mem ? { value: mem[k] } : null),
        set: async (k, v) => {
          mem[k] = v;
        },
      };
    },
  });
  await app.run(`addCard("Sol Ring")`);
  assert.ok(mem["mtg-cmdr-decks"], "écrit dans window.storage");
  assert.equal(app.stored(), null, "localStorage non utilisé");
});
