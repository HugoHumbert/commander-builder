// Charge table-de-jeu-commander.html dans jsdom. Le réseau pair-à-pair (PeerJS)
// est remplacé par un faux « hub » en mémoire : passer le même hub à plusieurs
// openTable() met ces fenêtres autour de la même table.
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const {
  fakeScryfall,
  fakeIndexedDB,
  waitFor,
  STORE_KEY,
} = require("./helpers");

const HTML = fs.readFileSync(
  path.join(__dirname, "..", "table-de-jeu-commander.html"),
  "utf8",
);

/** Le moteur de règles (script #core), chargé hors navigateur. */
function loadCore() {
  const src = HTML.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
  const m = { exports: {} };
  new Function("module", src)(m);
  return m.exports;
}

/** Faux serveur de rendez-vous + canaux de données, à la manière de PeerJS. */
function makeHub() {
  const peers = new Map();
  let anon = 0;
  const emitter = (o) => {
    o.h = {};
    o.on = (ev, fn) => (o.h[ev] = o.h[ev] || []).push(fn);
    o.emit = (ev, x) => (o.h[ev] || []).forEach((f) => f(x));
    return o;
  };
  function pair() {
    const mk = () => {
      const c = emitter({ open: false });
      c.send = (m) => {
        if (!c.open) throw new Error("connexion fermée");
        const copy = JSON.parse(JSON.stringify(m));
        setTimeout(() => c.other.open && c.other.emit("data", copy));
      };
      c.close = () => {
        if (!c.open) return;
        c.open = false;
        const o = c.other;
        setTimeout(() => {
          c.emit("close");
          if (o.open) {
            o.open = false;
            o.emit("close");
          }
        });
      };
      return c;
    };
    const a = mk(),
      b = mk();
    a.other = b;
    b.other = a;
    return [a, b];
  }
  return class Peer {
    constructor(id) {
      emitter(this);
      this.id = id || "anon" + ++anon;
      this.conns = [];
      setTimeout(() => {
        if (this.destroyed) return;
        if (peers.has(this.id))
          return this.emit("error", { type: "unavailable-id" });
        peers.set(this.id, this);
        this.emit("open", this.id);
      });
    }
    connect(id) {
      const [a, b] = pair();
      this.conns.push(a);
      setTimeout(() => {
        const target = peers.get(id);
        if (!target) return this.emit("error", { type: "peer-unavailable" });
        target.conns.push(b);
        a.open = b.open = true;
        target.emit("connection", b);
        setTimeout(() => {
          b.emit("open");
          a.emit("open");
        });
      });
      return a;
    }
    reconnect() {}
    destroy() {
      this.destroyed = true;
      if (peers.get(this.id) === this) peers.delete(this.id);
      this.conns.forEach((c) => c.close());
    }
  };
}

/**
 * Ouvre la table (écran d'accueil).
 * @param {object} o
 * @param {Function} [o.hub]  classe Peer renvoyée par makeHub() ; sans elle, mode solo
 * @param {object} [o.editor]  état de l'éditeur de decks à mettre dans localStorage
 * @param {object} [o.local]  autres entrées localStorage { clé: valeur JSON }
 * @param {Map} [o.idb]  contenu d'IndexedDB (dossiers de proxys de l'éditeur, images)
 * @param {(w: Window) => void} [o.setup]
 * @param {string} [o.query]  ex. "?deck=d1"
 */
async function openTable({ hub, editor, local, idb, setup, query = "" } = {}) {
  const fetchLog = [];
  const dom = new JSDOM(HTML, {
    url: "https://commander.test/table-de-jeu-commander.html" + query,
    runScripts: "dangerously",
    pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = fakeScryfall(fetchLog);
      if (hub) w.Peer = hub;
      if (editor) w.localStorage.setItem(STORE_KEY, JSON.stringify(editor));
      for (const [k, v] of Object.entries(local || {}))
        w.localStorage.setItem(k, JSON.stringify(v));
      if (idb) w.indexedDB = fakeIndexedDB(idb);
      w.clipboardText = null;
      Object.defineProperty(w.navigator, "clipboard", {
        value: { writeText: async (s) => (w.clipboardText = s) },
      });
      let blobN = 0;
      w.URL.createObjectURL = (b) =>
        `blob:test/${(b && b.name) || "blob"}#${++blobN}`;
      w.URL.revokeObjectURL = () => {};
      if (setup) setup(w);
    },
  });
  const w = dom.window;
  // jsdom ne charge pas les images : la réduction d'une image locale est simulée
  w.shrink = async (f) => "data:image/jpeg;base64," + f.name;
  const $ = (s) => w.document.querySelector(s);
  const $$ = (s) => [...w.document.querySelectorAll(s)];
  const t = {
    dom,
    window: w,
    document: w.document,
    fetchLog,
    $,
    $$,
    waitFor,
    run: (expr) => {
      const v = w.eval(expr);
      const isObj = v !== null && typeof v === "object";
      if (!isObj || typeof v.then === "function" || v instanceof w.Node)
        return v;
      return JSON.parse(JSON.stringify(v));
    },
    toast: () => $("#toast").textContent,
    // coupe d'abord les écouteurs réseau : le hub survit à la fenêtre
    close: () => {
      w.eval(
        "left = true; if (peer) { peer.h = {}; peer.conns.forEach((c) => (c.h = {})); }",
      );
      w.close();
    },
    /** crée une table depuis l'accueil */
    async host(name = "Alice") {
      $("#lname").value = name;
      $("#lhost").click();
      await waitFor(() => !$("#app").hidden, { msg: "table ouverte" });
      return w.eval("code");
    },
    /** rejoint une table et attend la connexion à l'hôte */
    async join(code, name = "Bob") {
      $("#lname").value = name;
      $("#lcode").value = code;
      $("#ljoin").click();
      await waitFor(() => $("#status").textContent === "Connecté", {
        msg: "connexion à l'hôte",
      });
    },
    /** choisit un deck de l'éditeur dans « Charger un deck » et attend l'analyse */
    async pickEditorDeck(name) {
      await waitFor(() => $(`[data-ed="${name}"]`), {
        msg: "deck de l'éditeur",
      });
      $(`[data-ed="${name}"]`).click();
      await waitFor(() => !$("#dgo").disabled, { msg: "analyse du deck" });
    },
    /** entre en jeu avec le deck analysé */
    async play() {
      $("#dgo").click();
      await waitFor(() => w.eval("!!me()"), { msg: "joueur installé" });
      await t.painted();
    },
    /** attend le prochain rendu */
    painted: () =>
      new Promise((r) => w.requestAnimationFrame(() => setTimeout(r, 0))),
    /** envoie une action comme le ferait l'interface, puis attend le rendu */
    async act(a) {
      w.eval("act(" + JSON.stringify(a) + ")");
      await new Promise((r) => setTimeout(r, 15));
      await t.painted();
    },
    menu: () => $$("#menu button").map((b) => b.firstChild.textContent),
    clickMenu(label) {
      const b = $$("#menu button").find((x) =>
        x.firstChild.textContent.startsWith(label),
      );
      if (!b) throw new Error("entrée de menu absente : " + label);
      b.click();
    },
    rightClick(el) {
      el.dispatchEvent(
        new w.MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 10,
          clientY: 10,
        }),
      );
    },
  };
  return t;
}

/** État de l'éditeur avec un seul deck ; cards est complété par les valeurs par défaut. */
function editorDeck(cards, name = "Rakdos") {
  return {
    activeId: "d1",
    lang: "fr",
    decks: [
      {
        id: "d1",
        name,
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
      },
    ],
  };
}

module.exports = { openTable, makeHub, loadCore, editorDeck, waitFor };
