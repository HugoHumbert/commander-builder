# CLAUDE.md

Éditeur de decks MTG Commander orienté **proxys / reskins**, en un seul fichier HTML autonome. Le README décrit les fonctionnalités côté utilisateur.

## Structure

- `editeur-deck-commander.html` : toute l'application (CSS + HTML + JS vanilla, sans build ni dépendance). Le script est découpé en sections `/* ===== nom ===== */` : i18n, state, Scryfall, helpers, rendu, aperçu, autocomplétion, filtre, groupes, légalité, import/export, sauvegarde rapide, image du proxy, prompt, init.
- `tests/` : tests de non-régression (Node `node:test` + jsdom). Ils chargent le vrai fichier HTML.
  - `helpers.js` : `openApp({ stored, setup, idb })` ouvre l'app avec un faux Scryfall et un état localStorage initial. `idb` est une `Map` qui sert de faux IndexedDB : passer la même `Map` à deux `openApp` simule un rechargement de la page. Contient aussi `deckState()`, `dropEvent()`, `answerPrompt()`, `pressCtrl()`, ainsi que `fakeDir()` et `fakeFile()` qui simulent les handles de fichiers de Chrome.
  - `fixtures/cards.js` : cartes au format Scryfall utilisées par le faux Scryfall.
- `table-de-jeu-commander.html` : table de jeu multijoueur (voir « Table de jeu » plus bas), elle aussi en un seul fichier. Seule dépendance : PeerJS, chargé depuis un CDN.
  - `tests/table-helpers.js` : `openTable({ hub, editor, idb, local, setup, query })` ouvre la table ; `makeHub()` renvoie un faux `Peer` en mémoire (le même hub passé à plusieurs `openTable` = même table) ; `loadCore()` charge le moteur de règles seul.
  - `tests/table-core.test.js` (règles, sans DOM) et `tests/table-ui.test.js` (plateau, menus, decks de l'éditeur, multijoueur).
- `index.html` : page d'accueil du site GitHub Pages (https://hugohumbert.github.io/commander-builder/), publié automatiquement depuis `main` ; `.nojekyll` désactive le traitement Jekyll. Pousser sur `main` met donc le site en ligne à jour.
- `README.md` : doc utilisateur, en français. À mettre à jour quand une fonctionnalité ou le format JSON change.

## Commandes

```sh
npm install          # une fois : jsdom + prettier
npm test             # toute la batterie (~30 s, éditeur + table de jeu)
node --test tests/proxy-image.test.js   # un seul fichier
npm run format       # prettier sur tout le projet
```

Pour vérifier la syntaxe du script inline sans lancer les tests, `npm test` suffit : une erreur de syntaxe fait échouer tous les tests.

## Conventions du code

- Interface **bilingue** : chaque texte visible passe par `t("clé")`. Toute nouvelle clé doit être ajoutée dans **`T.fr` et `T.en`**. Les textes statiques du HTML sont posés dans `applyStaticI18n()`.
- Les commentaires du code sont en **français**, et rares.
- État : `decks[]`, `activeId`, `lang`. Un deck a la forme `{ id, name, groups[], cards[] }`. Une carte a la forme `{ name, qty, variant, group, cmd, status: todo|wip|done, foil, proxyImg }`.
- `proxyImg` peut prendre trois formes :
  - `lib:<dossier>/<chemin relatif>` : fichier d'un dossier de proxys ;
  - `https://…` : image web ;
  - `file:///…` : ancien lien local. Il est converti en `lib:` dès qu'un dossier autorisé contient le fichier (`convertLegacy`).
- Pour afficher une image, toujours passer par `imgUrl(ref)` (asynchrone, renvoie une URL `blob:` pour `lib:`) et `paintImgBtn()`. Ne jamais utiliser `proxyImg` directement comme `src`.
- Dossiers de proxys : objet `lib`, avec une liste commune à tous les decks.
  - Chrome/Edge : handles de dossier dans IndexedDB (clés `roots` et `root:<nom>`) ; un fichier déposé est retrouvé via `getAsFileSystemHandle()` puis `dir.resolve()`.
  - Autres navigateurs : `<input webkitdirectory>`, valable pour la session seulement ; les fichiers sont retrouvés par nom et taille.
  - Un fichier hors des dossiers déclenche `libPending` : la fenêtre 📁 s'ouvre, et l'image est liée dès que le dossier est ajouté.
  - Pour **ajouter un champ de carte**, il faut le gérer à quatre endroits : valeur par défaut dans `addCard`, import JSON **et** texte dans `doImport`, migration des anciens decks dans `init()`. L'export JSON prend la carte entière.
- Après une mutation : `pushUndo()` **avant** de modifier si l'action doit pouvoir s'annuler, puis `saveAll()`, puis `render()` (ou une mise à jour locale de la ligne + `updateStats()`).
- `updateStats()` est le seul endroit qui rafraîchit les valeurs **dérivées** affichées hors de la ligne modifiée : total `X / 100`, répartition des couleurs, légalité, et compteur de chaque groupe (`.gcount`, recalculé à partir de `section._items`). Une mise à jour locale (ex. boutons + / −) doit donc toujours se terminer par `updateStats()`, et **tout nouveau compteur affiché doit y être recalculé** : sinon il ne suit que les rendus complets (bug déjà rencontré avec les compteurs de catégorie).
- Persistance : `window.storage` s'il existe (environnement artefact Claude), sinon `localStorage` (clé `mtg-cmdr-decks`). Les handles de fichier de la sauvegarde rapide sont dans IndexedDB (`mtg-cmdr` / `handles`), un par deck.
- Scryfall :
  - `/cards/collection` **ne trouve pas** les cartes double face par leur nom complet `A // B`. On cherche par la face avant, puis chaque `not_found` est recherché via `/cards/named`.
  - `normName()` (face avant, en minuscules) est la clé du cache `cache[]`.

## Table de jeu

- Deux scripts dans le fichier : `#core` (objet `Core`, règles pures et déterministes : `Core.apply(state, action)`) et `#ui` (réseau, rendu, interactions). Interface en français seulement, sans `t()`.
- **Toute modification de la partie passe par `act({ type, … })`**. L'hôte applique l'action puis la diffuse ; les invités l'envoient à l'hôte et ne l'appliquent qu'à son retour. `Core` ne tire donc jamais d'aléa : l'ordre d'un mélange ou le résultat d'un dé est calculé par l'auteur de l'action et transmis dedans.
- État `S` : `players{}` (`zones` = listes d'ids par zone, `life`, `poison`, `cmd{ idDuCommandant: blessures }`, `ctr{}`, `out`, `online`), `order[]`, `cards{}`, `turn`, `turnNo`, `over`, `log[]`. Le dessus de la bibliothèque est l'indice 0 ; le dessus du cimetière et de l'exil est le dernier élément.
- Images : `card.img` est une URL, ou une clé `p:<empreinte>` pour une image locale. Les données (`IMG`, JPEG en data URL) voyagent à part de l'état, par messages `img` / `need`. Toujours afficher via `paintImg(el, ref)`.
- Lien avec l'éditeur : la table lit `localStorage["mtg-cmdr-decks"]` et la base IndexedDB `mtg-cmdr` / `handles` (clés `roots`, `root:<nom>`) via `plib`. Si ces formats changent dans l'éditeur, adapter `editorDecks()`, `entriesOf()` et `plib`.
- Mulligan de Londres : `p.kept === false` tant que le joueur choisit sa main (barre `#mullbar`), `p.mull` compte les mulligans, `Core.mullBottom(p)` = cartes à remettre dessous (premier mulligan gratuit). L'action `keep` est refusée si le nombre de cartes n'est pas exact. `resetPlayer` remet `mull` et `kept` à zéro.
- Blessures de commandant : `p.cmd[idDuCommandant]`, une pastille `[data-ctile="joueur|commandant"]` par commandant adverse (`opposingCommanders`), modifiable par le joueur blessé ou le propriétaire du commandant (`canEditCmd`). `Core.lethal(S, p)` donne la raison d'une défaite (0 PV, 10 poison, 21 blessures) ; la table l'annonce mais n'élimine personne d'office (action `concede`).
- Force / endurance : `card.pt` (et `pt2` pour l'autre face), `card.mod` (bonus permanent `{p, t}`) et `card.eot` (jusqu'à la fin du tour, effacé par l'action `turn`), modifiés par l'action `pt`. `Core.ptOf(c)` calcule la valeur affichée (imprimée + marqueurs + bonus) ; `ptBadge(c)` la dessine et `modsEl(c)` en détaille le calcul dans l'encadré `.pmods` de l'aperçu. `clean()` efface les bonus hors du champ de bataille. Les marqueurs +1/+1 et -1/-1 s'annulent dans l'action `counter`.
- Zoom du plateau : variable CSS `--bz` (multiplie `--cw` du champ de bataille), `setZoom()`, mémorisée dans `cmdtable-zoom` ; `freeSpot()` resserre sa grille selon `bz`. Loupe : touche Z maintenue, classe `#preview.loupe` + variables `--lx` / `--ly`.
- `el.append(x)` d'une valeur `null` insère le texte « null » : vérifier avant d'ajouter un élément facultatif (`h()` filtre déjà les enfants vides).
- Easter egg « tuyau métallique » : `SOUNDS.pipe` (partiels inharmoniques d'une barre, hauteur et rebonds tirés au hasard), saturé par un waveshaper (`pipeCurve`) et envoyé directement vers `a.destination`, sans le compresseur commun ; activé par la case `#pipe` de l'aide (`setPipe`, clé `cmdtable-pipe`), qui fait aussi jouer le tuyau aux boutons « Écouter les sons » ; `fx()` le joue avant chaque action, au plus une fois par 250 ms.
- Sons : `SOUNDS[nom](contexte, sortie, instant)`, bruit filtré sans fichier audio. `renderSfx(nom)` les rend hors ligne (OfflineAudioContext) pour les écouter ou les mesurer dans un vrai Chromium.
- Rendu : `render()` (différé) reconstruit tout dans `paint()`. Les animations comparent les positions avant / après (`snapshot()` → `animate()`), les effets ponctuels (sons, bannière, secousse de la bibliothèque) partent de `fx(action)`.
- Vérification visuelle : jsdom ne calcule pas la mise en page. Pour un changement de CSS ou de glisser-déposer, piloter un vrai Chromium (puppeteer-core hors dépôt) ; PeerJS et Scryfall réels y fonctionnent.

## Tests

- Chaque bug corrigé reçoit un test `régression : …` qui échoue sur l'ancienne version : l'écrire **avant** le correctif et vérifier qu'il échoue.
- Pour une action de l'interface, vérifier ce que l'utilisateur voit (texte du DOM : ligne, en-tête de groupe, total), pas seulement l'état `active()` : un état juste avec un affichage périmé est un bug.
- `app.run("expr")` évalue dans la page et renvoie une **copie** des objets. Pour modifier l'état, faire la mutation dans l'expression : `app.run('active().cards[0].variant = "x"')`.
- Le faux Scryfall (`fakeScryfall` dans `helpers.js`) doit reproduire les particularités réelles de l'API dont dépend le code, par exemple le piège des cartes double face.
- APIs absentes de jsdom, simulées dans `openApp` ou par test : `showModal`/`close` des `<dialog>`, `DataTransfer` (via `dropEvent`), `showSaveFilePicker`, `showDirectoryPicker`, `showOpenFilePicker`, IndexedDB, presse-papier, `URL.createObjectURL` (qui renvoie `blob:test/<nom du fichier>#n`).
- jsdom rejette les `url(...)` CSS contenant des espaces non encodés, et ne charge jamais les images (`onload` ne se déclenche pas).

## Workflow git

- Avant chaque push : **`npm run format` puis `npm test`**. Les deux doivent passer.
- On commit et on pousse **directement sur `main`**, seulement quand l'utilisateur le demande.
- Messages de commit : en anglais, courts, en minuscules (`add …`, `fix …`), avec un corps en puces si utile.
- Sous Windows PowerShell 5.1, un message de commit contenant des `"` est mal transmis à git (erreur `The empty string is not a valid path`). Écrire le message dans un fichier et utiliser `git commit -F fichier`.
