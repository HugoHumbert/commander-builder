// Charge editeur-deck-commander.html dans jsdom, avec un faux Scryfall
// (fixtures/cards.js) : les tests tournent hors ligne et de façon déterministe.
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { CARDS } = require("./fixtures/cards");

const HTML = fs.readFileSync(
  path.join(__dirname, "..", "editeur-deck-commander.html"),
  "utf8",
);
const STORE_KEY = "mtg-cmdr-decks";

const lc = (s) => String(s).toLowerCase();
const front = (name) => name.split(" // ")[0];
// nom exact ou face avant (comme /cards/named)
const byName = (n) =>
  CARDS.find((c) => lc(c.name) === lc(n) || lc(front(c.name)) === lc(n));

// Reproduit le comportement de Scryfall utile aux tests, y compris le piège
// des cartes double face : /cards/collection ne trouve PAS « A // B ».
function fakeScryfall(log) {
  return async (url, opts = {}) => {
    const u = new URL(url);
    log.push({ path: u.pathname, url, body: opts.body });
    const res = (body, status = 200) => ({
      ok: status < 300,
      status,
      json: async () => JSON.parse(JSON.stringify(body)),
    });
    if (u.pathname === "/cards/collection") {
      const data = [],
        not_found = [];
      for (const id of JSON.parse(opts.body).identifiers) {
        const c = CARDS.find((c) => lc(front(c.name)) === lc(id.name));
        c ? data.push(c) : not_found.push(id);
      }
      return res({ object: "list", data, not_found });
    }
    if (u.pathname === "/cards/named") {
      const q = u.searchParams.get("exact") || u.searchParams.get("fuzzy");
      let c = byName(q);
      if (!c && u.searchParams.has("fuzzy"))
        c = CARDS.find((x) => lc(x.name).includes(lc(q)));
      return c ? res(c) : res({ object: "error" }, 404);
    }
    if (u.pathname === "/cards/search") {
      const q = lc(u.searchParams.get("q") || "");
      const data = CARDS.filter((c) => lc(c.name).includes(q));
      return data.length ? res({ data }) : res({ object: "error" }, 404);
    }
    if (u.pathname === "/cards/autocomplete") {
      const q = lc(u.searchParams.get("q") || "");
      return res({
        data: CARDS.map((c) => c.name).filter((n) => lc(n).includes(q)),
      });
    }
    return res({ object: "error" }, 404); // versions FR, etc.
  };
}

async function waitFor(fn, { timeout = 8000, msg = "condition" } = {}) {
  const t0 = Date.now();
  for (;;) {
    let v;
    try {
      v = fn();
    } catch (e) {
      v = false;
    }
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error("Timeout: " + msg);
    await new Promise((r) => setTimeout(r, 10));
  }
}

/**
 * IndexedDB minimal (jsdom n'en a pas) adossé à une Map : passer la même Map
 * à deux openApp() simule un rechargement de la page.
 */
function fakeIndexedDB(store) {
  const req = (fn) => {
    const r = {};
    setTimeout(() => {
      try {
        r.result = fn();
        r.onsuccess && r.onsuccess();
      } catch (e) {
        r.error = e;
        r.onerror && r.onerror();
      }
    });
    return r;
  };
  const db = {
    createObjectStore() {},
    transaction: () => ({
      objectStore: () => ({
        get: (k) => req(() => store.get(k)),
        put: (v, k) => req(() => (store.set(k, v), k)),
      }),
    }),
  };
  return { open: () => req(() => db) };
}

/* ---- File System Access API simulée (dossiers de proxys) ---- */
function notFound() {
  const e = new Error("not found");
  e.name = "NotFoundError";
  return e;
}
/** Handle de fichier ; path = chemin complet, ex. ["Proxys", "Rakdos", "j.png"]. */
function fakeFile(w, path, content = "img") {
  const name = path[path.length - 1];
  return {
    kind: "file",
    name,
    _path: path,
    getFile: async () => new w.File([content], name, { type: "image/png" }),
  };
}
/**
 * Handle de dossier sur une arborescence { "sous": { "x.png": "contenu" } }.
 * perm.state : "granted" | "prompt" | "denied" ; perm.onRequest : réponse à requestPermission.
 */
function fakeDir(
  w,
  name,
  tree,
  perm = { state: "granted", onRequest: "granted" },
  path = [name],
) {
  return {
    kind: "directory",
    name,
    _path: path,
    perm,
    queryPermission: async () => perm.state,
    requestPermission: async () => (perm.state = perm.onRequest),
    async getDirectoryHandle(n) {
      if (!tree[n] || typeof tree[n] !== "object") throw notFound();
      return fakeDir(w, n, tree[n], perm, [...path, n]);
    },
    async getFileHandle(n) {
      if (typeof tree[n] !== "string") throw notFound();
      return fakeFile(w, [...path, n], tree[n]);
    },
    async resolve(h) {
      const p = h._path;
      if (!p || p.length <= path.length) return null;
      return path.every((s, i) => p[i] === s) ? p.slice(path.length) : null;
    },
  };
}

/**
 * Ouvre l'application.
 * @param {object} o
 * @param {object} [o.stored]  état sauvegardé ({decks, activeId, lang}) à mettre dans localStorage
 * @param {(w: Window) => void} [o.setup]  hook appelé avant l'exécution du script
 * @param {Map} [o.idb]  contenu d'IndexedDB (partagé entre ouvertures = rechargement)
 */
async function openApp({ stored, setup, idb } = {}) {
  const fetchLog = [];
  const dom = new JSDOM(HTML, {
    url: "https://commander.test/editeur-deck-commander.html",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = fakeScryfall(fetchLog);
      if (stored) w.localStorage.setItem(STORE_KEY, JSON.stringify(stored));
      const D = (w.HTMLDialogElement || w.HTMLElement).prototype;
      D.showModal = function () {
        this.open = true;
      };
      D.close = function () {
        this.open = false;
      };
      w.matchMedia = () => ({ matches: true, addEventListener() {} });
      w.clipboardText = null;
      Object.defineProperty(w.navigator, "clipboard", {
        value: { writeText: async (s) => (w.clipboardText = s) },
      });
      let blobN = 0;
      w.URL.createObjectURL = (b) =>
        `blob:test/${(b && b.name) || "blob"}#${++blobN}`;
      w.URL.revokeObjectURL = () => {};
      w.downloads = []; // noms des fichiers « téléchargés » via <a download>
      w.HTMLAnchorElement.prototype.click = function () {
        w.downloads.push(this.download);
      };
      if (idb) w.indexedDB = fakeIndexedDB(idb);
      if (setup) setup(w);
    },
  });
  const w = dom.window;
  const app = {
    dom,
    window: w,
    document: w.document,
    fetchLog,
    /**
     * Évalue une expression dans la portée globale du script de l'app.
     * Objets et tableaux sont renvoyés en COPIE (côté Node) pour que
     * assert.deepStrictEqual fonctionne : pour modifier l'état de l'app,
     * faire la mutation dans l'expression elle-même.
     */
    run: (expr) => {
      const v = w.eval(expr);
      const isObj = v !== null && typeof v === "object";
      if (!isObj || typeof v.then === "function" || v instanceof w.Node)
        return v;
      return structuredClone(v);
    },
    $: (s) => w.document.querySelector(s),
    $$: (s) => [...w.document.querySelectorAll(s)],
    waitFor,
    stored: () => JSON.parse(w.localStorage.getItem(STORE_KEY) || "null"),
    toast: () => w.document.querySelector("#toast").textContent,
    rows: () => [...w.document.querySelectorAll("#list .row")],
    /** ligne d'une carte, par nom affiché */
    row: (name) =>
      [...w.document.querySelectorAll("#list .row")].find((r) =>
        r.querySelector(".nm").textContent.startsWith(name),
      ),
    groupNames: () =>
      [...w.document.querySelectorAll("#list .gname")].map(
        (g) => g.textContent,
      ),
    close: () => w.close(),
  };
  // prêt quand init() a fini (hydrateActive -> render remplit #list)
  await waitFor(() => w.document.querySelector("#list").children.length > 0, {
    msg: "app init",
  });
  return app;
}

/** Ouvre l'app avec un seul deck. cards: liste partielle, complétée par défaut. */
function deckState(cards, extra = {}) {
  return {
    activeId: "d1",
    lang: "fr",
    decks: [
      {
        id: "d1",
        name: "Test",
        groups: [],
        cards: cards.map((c) => ({
          qty: 1,
          variant: "",
          group: "",
          cmd: false,
          status: "todo",
          foil: false,
          proxyImg: "",
          ...c,
        })),
        ...extra,
      },
    ],
  };
}

/**
 * Fabrique un événement de drag & drop (jsdom n'a pas DataTransfer).
 * handle : handle de fichier renvoyé par getAsFileSystemHandle (Chrome / Edge).
 */
function dropEvent(w, type, { files = [], uri = "", handle = null } = {}) {
  const ev = new w.Event(type, { bubbles: true, cancelable: true });
  ev.dataTransfer = {
    items: handle
      ? [{ kind: "file", getAsFileSystemHandle: async () => handle }]
      : [],
    types: [
      ...(files.length ? ["Files"] : []),
      ...(uri ? ["text/uri-list"] : []),
    ],
    files,
    dropEffect: "none",
    getData: (k) => (k === "text/uri-list" ? uri : ""),
  };
  return ev;
}

/** Raccourci clavier (Ctrl+touche) tapé dans la page. */
function pressCtrl(app, key) {
  app.document.body.dispatchEvent(
    new app.window.KeyboardEvent("keydown", {
      key,
      ctrlKey: true,
      bubbles: true,
    }),
  );
}

/** Répond à la boîte askPrompt de l'app. */
async function answerPrompt(app, value) {
  await waitFor(() => app.$("#prompt").open, { msg: "prompt ouvert" });
  app.$("#pInput").value = value;
  app.$("#pOk").click();
}

module.exports = {
  openApp,
  fakeDir,
  fakeFile,
  deckState,
  dropEvent,
  answerPrompt,
  pressCtrl,
  waitFor,
  STORE_KEY,
};
