# CLAUDE.md

Éditeur de decks MTG Commander orienté **proxys / reskins**, en un seul fichier HTML autonome. Le README décrit les fonctionnalités côté utilisateur.

## Structure

- `editeur-deck-commander.html` : toute l'application (CSS + HTML + JS vanilla, sans build ni dépendance). Le script est découpé en sections `/* ===== nom ===== */` : i18n, state, Scryfall, helpers, rendu, aperçu, autocomplétion, filtre, groupes, légalité, import/export, sauvegarde rapide, image du proxy, prompt, init.
- `tests/` : tests de non-régression (Node `node:test` + jsdom). Ils chargent le vrai fichier HTML.
  - `helpers.js` : `openApp({ stored, setup, idb })` ouvre l'app avec un faux Scryfall et un état localStorage initial. `idb` est une `Map` qui sert de faux IndexedDB : passer la même `Map` à deux `openApp` simule un rechargement de la page. Contient aussi `deckState()`, `dropEvent()`, `answerPrompt()`, `pressCtrl()`, ainsi que `fakeDir()` et `fakeFile()` qui simulent les handles de fichiers de Chrome.
  - `fixtures/cards.js` : cartes au format Scryfall utilisées par le faux Scryfall.
- `README.md` : doc utilisateur, en français. À mettre à jour quand une fonctionnalité ou le format JSON change.

## Commandes

```sh
npm install          # une fois : jsdom + prettier
npm test             # toute la batterie (~15 s)
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
- Persistance : `window.storage` s'il existe (environnement artefact Claude), sinon `localStorage` (clé `mtg-cmdr-decks`). Les handles de fichier de la sauvegarde rapide sont dans IndexedDB (`mtg-cmdr` / `handles`), un par deck.
- Scryfall :
  - `/cards/collection` **ne trouve pas** les cartes double face par leur nom complet `A // B`. On cherche par la face avant, puis chaque `not_found` est recherché via `/cards/named`.
  - `normName()` (face avant, en minuscules) est la clé du cache `cache[]`.

## Tests

- Chaque bug corrigé reçoit un test `régression : …` qui échoue sur l'ancienne version.
- `app.run("expr")` évalue dans la page et renvoie une **copie** des objets. Pour modifier l'état, faire la mutation dans l'expression : `app.run('active().cards[0].variant = "x"')`.
- Le faux Scryfall (`fakeScryfall` dans `helpers.js`) doit reproduire les particularités réelles de l'API dont dépend le code, par exemple le piège des cartes double face.
- APIs absentes de jsdom, simulées dans `openApp` ou par test : `showModal`/`close` des `<dialog>`, `DataTransfer` (via `dropEvent`), `showSaveFilePicker`, `showDirectoryPicker`, `showOpenFilePicker`, IndexedDB, presse-papier, `URL.createObjectURL` (qui renvoie `blob:test/<nom du fichier>#n`).
- jsdom rejette les `url(...)` CSS contenant des espaces non encodés, et ne charge jamais les images (`onload` ne se déclenche pas).

## Workflow git

- Avant chaque push : **`npm run format` puis `npm test`**. Les deux doivent passer.
- On commit et on pousse **directement sur `main`**, seulement quand l'utilisateur le demande.
- Messages de commit : en anglais, courts, en minuscules (`add …`, `fix …`), avec un corps en puces si utile.
- Sous Windows PowerShell 5.1, un message de commit contenant des `"` est mal transmis à git (erreur `The empty string is not a valid path`). Écrire le message dans un fichier et utiliser `git commit -F fichier`.
