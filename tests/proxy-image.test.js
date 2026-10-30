// Image du proxy : fenêtre 🖼, glisser-déposer, dossiers de proxys 📁.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  openApp,
  deckState,
  dropEvent,
  fakeDir,
  fakeFile,
} = require("./helpers");

const opened = [];
const open = async (o) => {
  const a = await openApp(o);
  opened.push(a);
  return a;
};
afterEach(() => opened.splice(0).forEach((a) => a.close()));

const JUDITH = "Judith, the Scourge Diva";
const cardImg = (app, i = 0) => app.run("active()").cards[i].proxyImg;
const png = (name, size = 3) => ({ name, type: "image/png", size });
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/**
 * Chrome / Edge simulé : showDirectoryPicker / showOpenFilePicker renvoient
 * les handles mis dans w.pickDirs / w.pickFiles. dirs : { nom: arborescence }.
 */
function chrome(dirs = {}) {
  return (w) => {
    w.dirs = {};
    for (const [name, tree] of Object.entries(dirs))
      w.dirs[name] = fakeDir(w, name, tree);
    w.pickDirs = [];
    w.pickFiles = [];
    const abort = () =>
      Object.assign(new Error("abort"), { name: "AbortError" });
    w.showDirectoryPicker = async () => {
      if (!w.pickDirs.length) throw abort();
      return w.pickDirs.shift();
    };
    w.showOpenFilePicker = async () => {
      if (!w.pickFiles.length) throw abort();
      return [w.pickFiles.shift()];
    };
  };
}
/** ajoute un dossier via la fenêtre 📁 */
async function addFolder(app, name) {
  app.window.pickDirs.push(app.window.dirs[name]);
  if (!app.$("#libDlg").open) app.$("#libBtn").click();
  app.$("#libAdd").click();
  await app.waitFor(() => app.run(`!!lib.find(${JSON.stringify(name)})`), {
    msg: "dossier ajouté",
  });
  await tick(5);
}
const libRows = (app) =>
  app
    .$$("#libList .librow")
    .map((r) => [
      r.querySelector(".lname").textContent,
      r.querySelector(".lst").textContent,
    ]);
const dropOnRow = (app, name, opts) =>
  app.row(name).dispatchEvent(dropEvent(app.window, "drop", opts));
const openDlg = (app, name = "Judith") => {
  app.row(name).querySelector(".pimg").click();
  assert.ok(app.$("#imgDlg").open);
};
const TREE = { Rakdos: { "Judith.png": "jjj" }, "Sol Ring.png": "sss" };

describe("fenêtre image du proxy", () => {
  test("le titre affiche la variante et le nom de la carte de base", async () => {
    const app = await open({
      stored: deckState([{ name: JUDITH, variant: "Dame Papillon" }]),
    });
    openDlg(app);
    assert.equal(app.$("#imgCard .icard").textContent, "Dame Papillon");
    assert.equal(app.$("#imgCard .ibase").textContent, "↔ " + JUDITH);
  });

  test("sans variante : seulement le nom de base", async () => {
    const app = await open({ stored: deckState([{ name: JUDITH }]) });
    openDlg(app);
    assert.equal(app.$("#imgCard").textContent, JUDITH);
  });

  test("coller un chemin local puis Enregistrer : converti en file:///", async () => {
    const app = await open({ stored: deckState([{ name: JUDITH }]) });
    openDlg(app);
    app.$("#imgInp").value = "C:\\Proxys\\judith.png";
    app.$("#imgOk").click();
    assert.equal(cardImg(app), "file:///C:/Proxys/judith.png");
    assert.equal(
      app.stored().decks[0].cards[0].proxyImg,
      "file:///C:/Proxys/judith.png",
    );
    await app.waitFor(() =>
      app.row("Judith").querySelector(".pimg").classList.contains("on"),
    );
  });

  test("Annuler ne change rien", async () => {
    const app = await open({ stored: deckState([{ name: JUDITH }]) });
    openDlg(app);
    app.$("#imgInp").value = "https://ex.com/x.png";
    app.$("#imgCancel").click();
    assert.equal(cardImg(app), "");
  });

  test("Retirer l'image : visible seulement si une image est liée, et annulable", async () => {
    const app = await open({
      stored: deckState([{ name: JUDITH, proxyImg: "https://ex.com/x.png" }]),
    });
    openDlg(app);
    assert.equal(app.$("#imgRemove").style.visibility, "visible");
    app.$("#imgRemove").click();
    assert.equal(cardImg(app), "");
    await app.run("doUndo()");
    assert.equal(cardImg(app), "https://ex.com/x.png");
    openDlg(app);
    app.$("#imgRemove").click();
    openDlg(app);
    assert.equal(app.$("#imgRemove").style.visibility, "hidden");
  });

  test("image glissée depuis une page web : liée par son URL", async () => {
    const app = await open({ stored: deckState([{ name: JUDITH }]) });
    openDlg(app);
    app
      .$("#imgPrev")
      .dispatchEvent(
        dropEvent(app.window, "drop", { uri: "https://ex.com/web.png" }),
      );
    await app.waitFor(
      () => app.$("#imgInp").value === "https://ex.com/web.png",
    );
  });

  test("fichier qui n'est pas une image : refusé", async () => {
    const app = await open({ stored: deckState([{ name: JUDITH }]) });
    dropOnRow(app, "Judith", {
      files: [{ name: "a.pdf", type: "application/pdf" }],
    });
    await app.waitFor(() => /pas une image/.test(app.toast()));
    assert.equal(cardImg(app), "");
  });

  test("drag interne d'une ligne (groupes custom) : pas d'image liée", async () => {
    const app = await open({ stored: deckState([{ name: JUDITH }]) });
    app.$("#gbCustom").click();
    app.run("dragItem = active().cards[0]");
    dropOnRow(app, "Judith", { files: [png("j.png")] });
    app.run("dragItem = null");
    await tick(10);
    assert.equal(cardImg(app), "");
    assert.ok(!app.$("#libDlg").open);
  });
});

describe("dossiers de proxys (Chrome / Edge)", () => {
  test("ajouter un dossier depuis la fenêtre 📁", async () => {
    const app = await open({ setup: chrome({ Proxys: TREE }) });
    app.$("#libBtn").click();
    assert.ok(app.$("#libDlg").open);
    assert.match(app.$("#libList").textContent, /Aucun dossier/);
    await addFolder(app, "Proxys");
    assert.deepEqual(libRows(app), [["📁 Proxys", "✓ accessible"]]);
  });

  test("fichier glissé depuis un sous-dossier : chemin exact retrouvé, image affichée", async () => {
    const app = await open({
      stored: deckState([{ name: JUDITH }]),
      setup: chrome({ Proxys: TREE }),
    });
    await addFolder(app, "Proxys");
    app.$("#libClose").click();
    const h = fakeFile(app.window, ["Proxys", "Rakdos", "Judith.png"]);
    dropOnRow(app, "Judith", { files: [png("Judith.png")], handle: h });
    await app.waitFor(() => cardImg(app), { msg: "image liée" });
    assert.equal(cardImg(app), "lib:Proxys/Rakdos/Judith.png");
    await app.waitFor(() =>
      /blob:test\/Judith\.png/.test(
        app.row("Judith").querySelector(".pimg").style.backgroundImage,
      ),
    );
    assert.match(app.toast(), /Image liée/);
  });

  test("plusieurs dossiers : le bon est trouvé", async () => {
    const app = await open({
      stored: deckState([{ name: JUDITH }]),
      setup: chrome({ Proxys: TREE, Scans: { "Judith.png": "autre" } }),
    });
    await addFolder(app, "Proxys");
    await addFolder(app, "Scans");
    assert.equal(libRows(app).length, 2);
    app.$("#libClose").click();
    const h = fakeFile(app.window, ["Scans", "Judith.png"]);
    dropOnRow(app, "Judith", { files: [png("Judith.png")], handle: h });
    await app.waitFor(() => cardImg(app) === "lib:Scans/Judith.png");
  });

  test("fichier hors des dossiers : la fenêtre 📁 s'ouvre, l'image est liée dès que le dossier est ajouté", async () => {
    const app = await open({
      stored: deckState([{ name: JUDITH }]),
      setup: chrome({ Proxys: TREE }),
    });
    const h = fakeFile(app.window, ["Proxys", "Rakdos", "Judith.png"]);
    dropOnRow(app, "Judith", { files: [png("Judith.png")], handle: h });
    await app.waitFor(() => app.$("#libDlg").open, { msg: "fenêtre 📁" });
    assert.match(app.$("#libNote").textContent, /« Judith\.png »/);
    assert.equal(cardImg(app), "");
    await addFolder(app, "Proxys");
    await app.waitFor(() => cardImg(app) === "lib:Proxys/Rakdos/Judith.png");
    assert.ok(!app.$("#libDlg").open, "fenêtre refermée");
  });

  test("dans la fenêtre 🖼 : dépôt, statut avec le chemin, Enregistrer", async () => {
    const app = await open({
      stored: deckState([{ name: JUDITH }]),
      setup: chrome({ Proxys: TREE }),
    });
    await addFolder(app, "Proxys");
    app.$("#libClose").click();
    openDlg(app);
    assert.equal(app.$("#imgLibTxt").textContent, "📁 Proxys");
    const h = fakeFile(app.window, ["Proxys", "Rakdos", "Judith.png"]);
    app.$("#imgPrev").dispatchEvent(
      dropEvent(app.window, "drop", {
        files: [png("Judith.png")],
        handle: h,
      }),
    );
    await app.waitFor(() => app.$("#imgStatus").classList.contains("ok"));
    assert.equal(
      app.$("#imgStatus").textContent,
      "✓ 📁 Proxys › Rakdos/Judith.png",
    );
    assert.equal(app.$("#imgInp").value, "", "pas de lien affiché");
    app.$("#imgOk").click();
    assert.equal(cardImg(app), "lib:Proxys/Rakdos/Judith.png");
  });

  test("dans la fenêtre 🖼 : clic pour choisir un fichier", async () => {
    const app = await open({
      stored: deckState([{ name: JUDITH }]),
      setup: chrome({ Proxys: TREE }),
    });
    await addFolder(app, "Proxys");
    app.$("#libClose").click();
    openDlg(app);
    app.window.pickFiles.push(fakeFile(app.window, ["Proxys", "Sol Ring.png"]));
    app.$("#imgPrev").click();
    await app.waitFor(() => app.$("#imgStatus").classList.contains("ok"));
    app.$("#imgOk").click();
    assert.equal(cardImg(app), "lib:Proxys/Sol Ring.png");
  });

  test("sans dossier : la fenêtre 🖼 le signale", async () => {
    const app = await open({
      stored: deckState([{ name: JUDITH }]),
      setup: chrome(),
    });
    openDlg(app);
    assert.equal(app.$("#imgLibTxt").textContent, "📁 Aucun dossier de proxys");
    assert.ok(app.$("#imgLib").classList.contains("need"));
    app.$("#imgLibBtn").click();
    assert.ok(app.$("#libDlg").open);
  });

  test("après rechargement : dossiers retenus, ré-autorisation en un clic", async () => {
    const idb = new Map();
    const stored = deckState([
      { name: JUDITH, proxyImg: "lib:Proxys/Rakdos/Judith.png" },
    ]);
    const first = await open({ stored, idb, setup: chrome({ Proxys: TREE }) });
    await addFolder(first, "Proxys");
    first.window.dirs.Proxys.perm.state = "prompt"; // Chrome redemande après un rechargement

    const app = await open({ stored, idb, setup: chrome() });
    assert.ok(app.$("#libBtn").classList.contains("warn"), "pastille 📁");
    const btn = app.row("Judith").querySelector(".pimg");
    await app.waitFor(() => btn.classList.contains("miss"));
    assert.match(btn.title, /doit être ré-autorisé/);

    app.$("#libBtn").click();
    assert.deepEqual(libRows(app), [["📁 Proxys", "⚠ à ré-autoriser"]]);
    app.$("#libList .lauth").click();
    await app.waitFor(() => !app.$("#libBtn").classList.contains("warn"));
    const btn2 = app.row("Judith").querySelector(".pimg");
    await app.waitFor(() => /Judith\.png/.test(btn2.style.backgroundImage));
    assert.ok(!btn2.classList.contains("miss"));
  });

  test("autorisation refusée : reste à ré-autoriser", async () => {
    const idb = new Map();
    const first = await open({ idb, setup: chrome({ Proxys: TREE }) });
    await addFolder(first, "Proxys");
    const perm = first.window.dirs.Proxys.perm;
    perm.state = "prompt";
    perm.onRequest = "denied";
    const app = await open({ idb, setup: chrome() });
    app.$("#libBtn").click();
    app.$("#libList .lauth").click();
    await tick(20);
    assert.ok(app.$("#libBtn").classList.contains("warn"));
  });

  test("retirer un dossier : ses images sont signalées", async () => {
    const app = await open({
      stored: deckState([
        { name: JUDITH, proxyImg: "lib:Proxys/Rakdos/Judith.png" },
      ]),
      setup: chrome({ Proxys: TREE }),
    });
    await addFolder(app, "Proxys");
    app.$("#libList .rm").click();
    await app.waitFor(() => !app.run(`lib.find("Proxys")`));
    await app.waitFor(() =>
      app.row("Judith").querySelector(".pimg").classList.contains("miss"),
    );
    assert.match(
      app.row("Judith").querySelector(".pimg").title,
      /ne fait pas partie/,
    );
  });

  test("fichier absent du dossier : signalé", async () => {
    const app = await open({
      stored: deckState([{ name: JUDITH, proxyImg: "lib:Proxys/absent.png" }]),
      setup: chrome({ Proxys: TREE }),
    });
    await addFolder(app, "Proxys");
    await app.waitFor(() =>
      app.row("Judith").querySelector(".pimg").classList.contains("miss"),
    );
    assert.match(
      app.row("Judith").querySelector(".pimg").title,
      /introuvable dans « Proxys »/,
    );
  });

  test("anciens liens file:/// convertis quand un dossier les contient", async () => {
    const app = await open({
      stored: deckState([
        {
          name: JUDITH,
          proxyImg: "file:///C:/Users/moi/Proxys/Rakdos/Judith.png",
        },
        { name: "Sol Ring", proxyImg: "file:///D:/Ailleurs/sol.png" },
      ]),
      setup: chrome({ Proxys: TREE }),
    });
    await addFolder(app, "Proxys");
    assert.equal(cardImg(app, 0), "lib:Proxys/Rakdos/Judith.png");
    assert.equal(cardImg(app, 1), "file:///D:/Ailleurs/sol.png", "inchangé");
    assert.match(app.toast(), /1 image reliée/);
    assert.equal(
      app.stored().decks[0].cards[0].proxyImg,
      "lib:Proxys/Rakdos/Judith.png",
    );
  });

  test("les dossiers sont communs à tous les decks", async () => {
    const stored = deckState([{ name: JUDITH }]);
    stored.decks.push({
      id: "d2",
      name: "Deux",
      groups: [],
      cards: [
        {
          name: "Sol Ring",
          qty: 1,
          variant: "",
          group: "",
          cmd: false,
          status: "todo",
          foil: false,
          proxyImg: "lib:Proxys/Sol Ring.png",
        },
      ],
    });
    const app = await open({ stored, setup: chrome({ Proxys: TREE }) });
    await addFolder(app, "Proxys");
    app.$("#libClose").click();
    app.$("#deckSel").value = "d2";
    app.$("#deckSel").dispatchEvent(new app.window.Event("change"));
    await app.waitFor(() => app.row("Sol Ring"));
    await app.waitFor(() =>
      /Sol%20Ring\.png/.test(
        app.row("Sol Ring").querySelector(".pimg").style.backgroundImage,
      ),
    );
  });

  test("l'export JSON garde la référence portable (dossier + chemin)", async () => {
    const app = await open({
      stored: deckState([
        { name: JUDITH, proxyImg: "lib:Proxys/Rakdos/Judith.png" },
      ]),
    });
    const j = JSON.parse(app.run("exportJSON()"));
    assert.equal(j.cards[0].proxyImg, "lib:Proxys/Rakdos/Judith.png");
  });
});

describe("dossiers de proxys (Firefox : sélection à chaque session)", () => {
  /** simule la sélection d'un dossier via <input webkitdirectory> */
  function pickFolder(app, files) {
    const w = app.window;
    const list = files.map(([rel, content]) => {
      const f = new w.File([content], rel.split("/").pop(), {
        type: "image/png",
      });
      Object.defineProperty(f, "webkitRelativePath", { value: rel });
      return f;
    });
    const inp = app.$("#libDirInp");
    Object.defineProperty(inp, "files", { value: list, configurable: true });
    inp.dispatchEvent(new w.Event("change"));
  }

  test("dossier sélectionné, fichier retrouvé par nom et taille", async () => {
    const app = await open({ stored: deckState([{ name: JUDITH }]) });
    app.$("#libBtn").click();
    assert.match(app.$("#libHelp").textContent, /resélectionner/);
    pickFolder(app, [
      ["Proxys/Rakdos/Judith.png", "jjj"],
      ["Proxys/Sol Ring.png", "sss"],
    ]);
    await app.waitFor(() => libRows(app).length === 1);
    assert.deepEqual(libRows(app), [["📁 Proxys", "✓ accessible"]]);
    app.$("#libClose").click();
    dropOnRow(app, "Judith", { files: [png("Judith.png", 3)] });
    await app.waitFor(() => cardImg(app) === "lib:Proxys/Rakdos/Judith.png");
    await app.waitFor(() =>
      /Judith\.png/.test(
        app.row("Judith").querySelector(".pimg").style.backgroundImage,
      ),
    );
  });

  test("après rechargement : dossier à resélectionner", async () => {
    const idb = new Map();
    const first = await open({ idb });
    first.$("#libBtn").click();
    pickFolder(first, [["Proxys/a.png", "a"]]);
    await first.waitFor(() => libRows(first).length === 1);

    const app = await open({ idb });
    assert.ok(app.$("#libBtn").classList.contains("warn"));
    app.$("#libBtn").click();
    assert.deepEqual(libRows(app), [["📁 Proxys", "⚠ à resélectionner"]]);
  });
});
