// Sauvegarde rapide 💾 : File System Access API simulée.
const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { openApp, deckState, pressCtrl } = require("./helpers");

let app;
afterEach(() => app.close());

/** faux showSaveFilePicker : enregistre les appels et le contenu écrit */
function fakeFs(fileName = "deck.json") {
  const fs = { picks: 0, writes: [], perm: "granted", failWith: null };
  const handle = {
    name: fileName,
    queryPermission: async () => fs.perm,
    requestPermission: async () => fs.perm,
    createWritable: async () => {
      if (fs.failWith) {
        const e = new Error("x");
        e.name = fs.failWith;
        throw e;
      }
      let buf = "";
      return {
        write: async (s) => (buf += s),
        close: async () => fs.writes.push(buf),
      };
    },
  };
  fs.setup = (w) => {
    w.showSaveFilePicker = async (opts) => {
      fs.picks++;
      fs.lastOpts = opts;
      return handle;
    };
  };
  return fs;
}
const settle = () => new Promise((r) => setTimeout(r, 20));
const stored = () => deckState([{ name: "Sol Ring" }]);

test("premier 💾 : demande le fichier (JSON), les suivants réécrivent le même sans redemander", async () => {
  const fs = fakeFs();
  app = await openApp({ stored: stored(), setup: fs.setup });
  assert.ok(!app.$("#quickSaveBtn").classList.contains("linked"));

  app.$("#quickSaveBtn").click();
  await app.waitFor(() => fs.writes.length === 1, { msg: "1re écriture" });
  assert.equal(fs.picks, 1);
  assert.equal(fs.lastOpts.suggestedName, "Test.json");
  assert.equal(JSON.parse(fs.writes[0]).cards[0].name, "Sol Ring");
  assert.match(app.toast(), /Enregistré dans deck\.json/);
  await app.waitFor(() => app.$("#quickSaveBtn").classList.contains("linked"));
  assert.match(app.$("#quickSaveBtn").title, /deck\.json/);

  await app.run(`addCard("Lightning Bolt")`);
  app.$("#quickSaveBtn").click();
  await app.waitFor(() => fs.writes.length === 2, { msg: "2e écriture" });
  assert.equal(fs.picks, 1, "pas de nouvelle demande de fichier");
  assert.equal(JSON.parse(fs.writes[1]).cards.length, 2, "contenu à jour");
});

test("Ctrl+S déclenche la sauvegarde rapide", async () => {
  const fs = fakeFs();
  app = await openApp({ stored: stored(), setup: fs.setup });
  pressCtrl(app, "s");
  await app.waitFor(() => fs.writes.length === 1, { msg: "écriture Ctrl+S" });
});

test("« Enregistrer .txt sous… » : le fichier et le format deviennent ceux du 💾", async () => {
  const fs = fakeFs("deck.txt");
  app = await openApp({ stored: stored(), setup: fs.setup });
  app.$("#exportBtn").click();
  app.$("#fmtArchidekt").click();
  assert.match(app.$("#exDlTxt").textContent, /Enregistrer \.txt sous/);
  app.$("#exDlTxt").click();
  await app.waitFor(() => fs.writes.length === 1);
  assert.equal(fs.writes[0], "1x Sol Ring (CMM) 410 [Artifact]");

  app.$("#quickSaveBtn").click();
  await app.waitFor(() => fs.writes.length === 2);
  assert.equal(fs.picks, 1);
  assert.equal(fs.writes[1], fs.writes[0], "réécrit au format Archidekt");
});

test("un fichier par deck", async () => {
  const fs = fakeFs();
  const s = stored();
  s.decks.push({ id: "d2", name: "Deux", groups: [], cards: [] });
  app = await openApp({ stored: s, setup: fs.setup });
  app.$("#quickSaveBtn").click();
  await app.waitFor(() => fs.writes.length === 1);
  app.$("#deckSel").value = "d2";
  app.$("#deckSel").dispatchEvent(new app.window.Event("change"));
  await app.waitFor(() => app.run("activeId") === "d2");
  app.$("#quickSaveBtn").click();
  await app.waitFor(() => fs.writes.length === 2);
  assert.equal(fs.picks, 2, "le 2e deck demande son propre fichier");
});

test("fenêtre de choix annulée : rien n'est écrit, pas d'erreur", async () => {
  app = await openApp({
    stored: stored(),
    setup(w) {
      w.showSaveFilePicker = async () => {
        const e = new Error("abort");
        e.name = "AbortError";
        throw e;
      };
    },
  });
  app.$("#quickSaveBtn").click();
  await settle();
  assert.doesNotMatch(app.toast(), /Échec/);
});

test("accès refusé : message", async () => {
  const fs = fakeFs();
  fs.perm = "denied";
  app = await openApp({ stored: stored(), setup: fs.setup });
  app.$("#quickSaveBtn").click();
  await app.waitFor(() => /refusé/.test(app.toast()), { msg: "message refus" });
  assert.equal(fs.writes.length, 0);
});

test("fichier supprimé entre-temps : erreur, lien oublié, le prochain 💾 redemande", async () => {
  const fs = fakeFs();
  app = await openApp({ stored: stored(), setup: fs.setup });
  app.$("#quickSaveBtn").click();
  await app.waitFor(() => fs.writes.length === 1);
  fs.failWith = "NotFoundError";
  app.$("#quickSaveBtn").click();
  await app.waitFor(() => /Échec/.test(app.toast()), { msg: "message échec" });
  await app.waitFor(() => !app.$("#quickSaveBtn").classList.contains("linked"));
  fs.failWith = null;
  app.$("#quickSaveBtn").click();
  await app.waitFor(() => fs.writes.length === 2);
  assert.equal(fs.picks, 2);
});

test("navigateur sans l'API (Firefox) : simple téléchargement", async () => {
  app = await openApp({ stored: stored() });
  assert.match(app.$("#quickSaveBtn").title, /téléchargement/);
  assert.match(app.$("#exDlJson").textContent, /Télécharger/);
  app.$("#quickSaveBtn").click();
  await settle();
  assert.equal(app.window.downloads.length, 1);
});
