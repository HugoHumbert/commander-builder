# Commander Builder

Un éditeur de decks **Magic: The Gathering — Commander** léger, autonome et bilingue (FR/EN), pensé notamment pour les projets de **decks à reskin / proxys** : chaque carte peut recevoir un _nom de variante_ et un _statut de proxy_.

Le tout tient dans **un seul fichier HTML** — aucune installation, aucun build, aucun serveur. Ouvre-le dans un navigateur et c'est parti.

---

## ✨ Fonctionnalités

- **Multi-decks** : créer, renommer, dupliquer, supprimer des decks. Sélecteur de deck actif.
- **Recherche de cartes** via l'API [Scryfall](https://scryfall.com/) avec **autocomplétion FR + EN** (tape « contresort » → trouve _Counterspell_).
- **Symboles de mana visuels** (vrais SVG Scryfall) et **aperçu de la vraie carte au survol** (tap sur mobile).
- **Nom de variante éditable** par carte (ex. `Judith, the Scourge Diva` → « Dame Papillon »).
- **Statut de proxy** par carte : pastille cliquable **gris (à faire) → jaune (en cours) → vert (fait)**.
- **Image du proxy** par carte : bouton 🖼, ou **glisser-déposer** une image directement sur la ligne de la carte. Les images de ton ordinateur sont lues dans tes **dossiers de proxys 📁**, sans être envoyées nulle part (voir plus bas). On peut aussi coller un lien web. Miniature + aperçu au survol.
- **Commandant** : désigne une carte comme commandant (couronne ♛) ; groupe dédié en tête de liste.
- **Groupement** par **Type**, **Coût** (avec une catégorie _Coût X_ à part), **Couleur**, ou **Custom**.
- **Groupes personnalisés** : créer / renommer / réordonner / supprimer des groupes, et y **déplacer les cartes** en **glisser-déposer** (ou via un menu par carte).
- **Groupes repliables** (clic sur l'en-tête) + bouton _tout replier / déplier_.
- **Filtre** de recherche dans la liste du deck.
- **Contrôle de légalité Commander** : total ≠ 100, commandant manquant, **doublons** (avec exceptions : terrains de base, cartes « any number », et « up to N » comme les _Nazgûl_ jusqu'à 9), et **cartes hors identité de couleur** du commandant.
- **Répartition des couleurs** en direct + compteur `X / 100`.
- **Langue FR / EN** (par défaut FR) qui pilote : le texte de l'interface, l'**aperçu de la carte**, et la langue affichée dans l'autocomplétion (la recherche reste bilingue dans les deux cas).
- **Sauvegarde automatique** locale (aucune donnée envoyée à un serveur tiers hormis les requêtes à Scryfall).

---

## 🚀 Utilisation

1. Télécharge `editeur-deck-commander.html`.
2. **Ouvre-le dans ton navigateur** (double-clic).

> ⚠️ **Important** : les visuels, symboles de mana, la recherche et l'autocomplétion nécessitent un accès réseau à Scryfall. Ouvre bien le fichier dans un vrai navigateur (certains aperçus intégrés bloquent les requêtes externes). L'outil affiche un message si Scryfall est injoignable.

### Ajouter des cartes

Tape un nom (FR ou EN) dans le champ de recherche, choisis dans l'autocomplétion (flèches ↑/↓ + Entrée, ou clic).

### Groupes personnalisés

Passe le groupement sur **Custom** → une barre apparaît avec **☷ Gérer les groupes**. Crée tes groupes, puis **glisse-dépose** les cartes entre eux (ou utilise le petit menu déroulant de chaque carte). Le commandant suit son groupe s'il en a un assigné.

---

## 📥 Import / 📤 Export

**Import** (bouton ↑) — crée un **nouveau deck** à partir d'un texte collé ou d'un fichier téléversé. Formats reconnus :

- **Texte** : `1 Nom de carte` par ligne (sections `Commander` / `Deck` optionnelles).
- **Format Archidekt** : `1x Nom (SET) 123 [Catégorie]` — les catégories, marqueurs `^Have^` et `*Foil*` sont gérés, et la catégorie `[Commander]` désigne le commandant.
- **MTGA** : `1 Nom (SET) 123`.
- **JSON** : format natif de l'outil (voir ci-dessous).

**Export** (bouton ↓) — au choix :

- **Texte** (`1 Nom`, universel).
- **Texte + variantes** (`1 Nom  //  Variante`).
- **Archidekt** (`1x Nom (SET) 123 [Catégorie]`).
- **JSON** (conserve **tout** : noms de variantes, groupes et ordre des groupes, statut de proxy, commandant).

Copie dans le presse-papier ou enregistre un fichier `.txt` / `.json`.

### 💾 Sauvegarde rapide

Le bouton **💾** (ou **Ctrl+S**) réécrit directement le fichier du dernier export du deck, sans redemander où l'enregistrer. La première fois, il demande où créer le fichier (JSON par défaut). Un export via _Enregistrer sous…_ devient le nouveau fichier de sauvegarde rapide du deck, dans son format. Une pastille verte sur 💾 indique qu'un fichier est lié. Ce lien est retenu par deck, même après un rechargement de la page.

> Nécessite **Chrome** ou **Edge** (API d'accès aux fichiers). Sur les autres navigateurs, la sauvegarde rapide se contente de télécharger le fichier.

### Format JSON

```json
{
  "name": "Mon deck",
  "groups": ["Rampe", "Removal", "Wincons"],
  "cards": [
    {
      "name": "Marchesa, the Black Rose",
      "qty": 1,
      "variant": "Genichiro",
      "group": "",
      "cmd": true,
      "status": "done",
      "proxyImg": "lib:Proxys/Marchesa/genichiro.png"
    },
    {
      "name": "Sol Ring",
      "qty": 1,
      "variant": "",
      "group": "Rampe",
      "cmd": false,
      "status": "wip"
    }
  ]
}
```

Champs par carte : `name` (nom anglais canonique), `qty`, `variant` (nom de reskin), `group` (groupe custom), `cmd` (commandant), `status` (`todo` / `wip` / `done`), `foil`, `proxyImg` (image du proxy : `lib:<dossier>/<chemin>` pour un fichier d'un dossier de proxys, sinon une URL `https://…`, ou un ancien lien `file:///…`), et pour une carte double face `proxyImg2` (image du verso, même format).

---

## 📁 Dossiers de proxys (images locales)

Les images de tes proxys restent **sur ton ordinateur** : la page les lit directement dans les dossiers que tu autorises, rien n'est envoyé sur un serveur. Ça fonctionne aussi quand l'outil est hébergé en ligne.

- Bouton **📁** : ajoute un ou plusieurs dossiers. Les **sous-dossiers sont inclus** : autoriser `Proxys` couvre `Proxys/Rakdos/…`, `Proxys/Communs/…`, etc. La liste est commune à tous les decks.
- Glisse une image depuis l'explorateur sur la ligne d'une carte : le dossier et le chemin exact sont retrouvés automatiquement. Si l'image n'est dans aucun dossier autorisé, la page propose d'en ajouter un, puis la lie toute seule.
- Une image est enregistrée sous la forme _dossier + chemin_ (`lib:Proxys/Rakdos/Judith.png`), pas sous la forme d'un chemin absolu. Si tu déplaces le dossier ou changes d'ordinateur, il suffit de ré-autoriser un dossier du même nom.
- Après un rechargement, Chrome redemande une confirmation : la pastille dorée sur 📁 le signale, et un clic sur **Autoriser** suffit pour tout le dossier.
- Les anciens liens `file:///…` sont convertis automatiquement dès qu'un dossier autorisé contient le fichier.

> **Chrome / Edge** retiennent l'accès aux dossiers. Sur **Firefox**, il faut resélectionner les dossiers à chaque session, et les images y sont retrouvées par nom et taille de fichier.

---

## 🎲 Table de jeu multijoueur

`table-de-jeu-commander.html` est une table de jeu en ligne pour jouer tes decks **avec leurs images de proxy**, à la manière de playgroup.gg : chacun voit le plateau de tout le monde, et personne n'applique les règles à ta place (comme autour d'une vraie table).

**En ligne** : [hugohumbert.github.io/commander-builder](https://hugohumbert.github.io/commander-builder/) (éditeur et table sur le même site, publiés depuis `main` par GitHub Pages).

**Lancer une partie**

1. Dans l'éditeur, clique sur **▶** : la table s'ouvre sur le deck actif. Tu peux aussi ouvrir `table-de-jeu-commander.html` directement.
2. **Créer une table**, puis clique sur le code (en haut à gauche) pour le copier et l'envoyer aux autres joueurs.
3. Les autres ouvrent la même page, saisissent le code, cliquent sur **Rejoindre** et chargent leur deck.

La connexion est directe entre les joueurs (pair-à-pair, via PeerJS) : il n'y a pas de serveur de jeu. Celui qui crée la table doit rester connecté ; s'il recharge la page, il peut **reprendre sa table** avec le même code. Chaque joueur a besoin de la page : le plus simple est de l'héberger (GitHub Pages par exemple), sinon chacun ouvre sa copie du fichier.

**Decks et images de proxy**

- La fenêtre **Charger un deck** liste directement les **decks de l'éditeur** (même navigateur, les deux fichiers ouverts depuis le même dossier ou le même site). Sinon, importe l'export JSON ou une liste texte.
- Les **images de proxy** du deck sont reprises : liens web tels quels, et fichiers des **dossiers de proxys 📁** de l'éditeur. Si Chrome redemande l'accès à un dossier, un bouton **Réautoriser le dossier** apparaît ; si le dossier est inconnu de ce navigateur, **Choisir le dossier** l'ajoute (il est alors aussi connu de l'éditeur).
- Une image locale est réduite puis **envoyée aux autres joueurs** de la table, pour qu'ils voient tes proxys. Une carte sans proxy affiche l'image Scryfall, avec le nom de variante en étiquette.

**Le plateau**

- Chaque joueur a son **champ de bataille** et ses piles : **zone de commandement**, **bibliothèque** (face cachée), **cimetière** et **exil**. Ta **main** est en bas.
- **Glisser-déposer** entre toutes les zones (et vers le champ de bataille d'un adversaire pour lui donner le contrôle). Les terrains joués se rangent en bas, le reste en haut.
- **Clic** sur un permanent : engager / dégager. **Clic** sur la bibliothèque : piocher. **Clic** sur une carte en main : la jouer (glisser-déposer pour choisir où la poser).
- **Clic droit** partout : carte (marqueurs, face cachée, transformer, copie en jeton, déplacements, donner le contrôle…), bibliothèque (piocher X, mélanger, **chercher une carte / un terrain / un terrain de base**, regarder ou révéler le dessus, meuler, exiler), cimetière et exil, main, joueur, champ de bataille (jetons via Scryfall).
- **Sélection au lasso** sur le champ de bataille pour déplacer ou engager plusieurs cartes.
- **Survol** d'une carte : aperçu agrandi juste à côté d'elle. **Maintenir Z** : loupe sur la partie de la carte sous la souris, pour lire les petits textes.
- **Ambiance** : table de taverne (bois, cuir, liserés dorés), icônes sur les boutons, main en éventail dont la carte survolée se soulève, cartes qui s'écrasent sur le champ de bataille avec une onde, dégâts qui éclatent, bannière de tour, bouton « Tour suivant » qui pulse quand c'est à toi. Les animations se coupent si ton système demande de réduire les mouvements.
- **Jetons** (bouton Jeton) : en haut, les **jetons et emblèmes de ton deck**, trouvés automatiquement grâce aux liens de Scryfall (ex. **The Ring** pour Call of the Ring ou Aragorn, Orc Army pour Orcish Bowmasters). La recherche couvre aussi les emblèmes, les jetons double face (The Ring ↔ The Ring Tempts You, Incubator // Phyrexian, Day // Night : touche R pour les retourner), les donjons et cartes d'aide (The Monarch, Undercity // The Initiative).
- **Équipements et auras** : glisse un équipement (ou une aura) sur une créature, ou clic droit → « Équiper une créature… » puis clic sur la créature. Il se range derrière elle, la suit quand elle bouge, et son bonus fixe (« Equipped creature gets +2/+0 ») s'ajoute à la force / endurance. L'éloigner, ou la mort de la créature, le détache.
- **Vaisseaux et véhicules** : un vaisseau n'est une créature qu'à partir de son seuil de marqueurs charge (pastille grisée avant) ; clic droit → « Stationner avec une créature… » engage la créature choisie et ajoute sa force en marqueurs charge. Un véhicule devient créature quand on le pilote (clic droit), jusqu'à la fin du tour.
- **Force / endurance \*** : clic droit → « Valeur de \* » pour fixer la valeur (la phrase de la carte qui l'explique est rappelée) ; marqueurs et bonus s'y ajoutent.
- **Toutes les créatures d'un coup** : clic droit sur le champ de bataille → « Modifier toutes mes créatures » ou « toutes les créatures de la table » (marqueurs, bonus temporaires ou permanents). Le menu d'une sélection fait de même pour les cartes sélectionnées.
- **Découvrir X** : menu de la bibliothèque. Les cartes exilées jusqu'à un non-terrain de valeur de mana ≤ X sont montrées ; on lance la carte trouvée ou on la met en main, le reste part dessous dans un ordre aléatoire.
- **Points de vie** : les PV perdus ou gagnés d'affilée sont cumulés dans un éclat au-dessus du total (« -7 »), qui se met à jour et disparaît après quelques secondes sans changement ; le journal n'en garde qu'une ligne.
- **Foil** : les cartes cochées foil dans l'éditeur (ou marquées `*F*` dans une liste Archidekt) ont un reflet irisé sur la table.
- **Cartes double face** : **R** (ou clic droit → Transformer) fait passer la carte survolée sur son autre face ; le journal, la force / endurance et l'aperçu suivent la face visible. Depuis la main, clic droit → « Jouer l'autre face » pour poser directement le verso (cartes modales comme les Pathway). Dans l'éditeur, la fenêtre 🖼 d'une carte double face a deux onglets **Recto / Verso** pour donner une image de proxy à chaque face ; sans image de verso, la table montre le verso Scryfall. Une carte qui quitte le champ de bataille revient sur sa face avant.
- **Force / endurance** : pastille en bas à droite de chaque créature, à jour des marqueurs et des bonus (verte si renforcée, rouge si affaiblie, bleue si les deux). Les marqueurs +1/+1 et -1/-1 s'annulent. Clic droit : +1/+1 ou -1/-1, jusqu'à la fin du tour ou permanent, ou bonus personnalisé (une case force, une case endurance), et retrait des bonus. Les bonus « jusqu'à la fin du tour » disparaissent au tour suivant. Au survol, un encadré « Modificateurs » à côté de l'aperçu détaille tout : valeur imprimée, chaque marqueur, bonus permanents et temporaires, contrôle pris, et le total.
- **Zoom du plateau** (− 100 % + en haut, ou Ctrl + molette) : cartes plus petites pour faire de la place, réglage propre à chaque joueur et mémorisé.
- **Proxys découpés** (bouton à côté du zoom) : les images proxy préparées pour l'impression ont des fonds perdus (63 × 88 mm + 3 mm par côté). Ce réglage les rogne pour montrer la carte telle qu'elle sera une fois découpée. Les images Scryfall ne sont pas touchées. Le réglage est propre à chaque joueur et mémorisé.
- **⌂** en haut à gauche (ou « ← Accueil ») : retour à la page d'accueil du site.
- **Main de départ et mulligan de Londres** (règle 103.5) : au début de la partie, une barre **Garder / Mulligan** apparaît au-dessus de ta main. Chaque mulligan remélange ta main et te fait repiocher **7 cartes**. Quand tu gardes, tu choisis autant de cartes à mettre **sous ta bibliothèque** que de mulligans pris, **le premier étant gratuit** (règle 103.5c du multijoueur, que le comité Commander conseille aussi en duel).
- **Blessures de commandant** : sur chaque joueur, une pastille par commandant adverse (partenaires compris) affiche les blessures reçues de lui. **Clic** : +1, **clic droit** : −1, **Maj** : ×5 ; le joueur blessé et le propriétaire du commandant peuvent tenir le compte. Chaque blessure retire aussi 1 point de vie. Le détail est dans la fenêtre ⚔, et le clic droit sur ton commandant permet aussi d'infliger des blessures. La **taxe de commandant** s'affiche sur la zone de commandement.
- **Défaite** : un joueur à 0 point de vie, à 10 marqueurs poison ou à **21 blessures d'un même commandant** est annoncé à toute la table et marqué ☠ ; il peut alors se déclarer éliminé (le tour suivant le saute).
- Points de vie, poison, compteurs libres (énergie, expérience…), tours, dés, pile ou face, journal et discussion.
- **Finir la partie** désigne le vainqueur chez tous les joueurs, qui peuvent relancer une partie avec les mêmes decks. **Quitter** retire ton plateau de la table ; un joueur déconnecté est compté « hors ligne ».
- Animations des cartes et **sons de cartes** (pioche, carte posée, engagée, retournée, mélange à l'américaine, dé) synthétisés dans la page, sans fichier ; bouton 🔊 pour les couper, et « Écouter les sons » dans l'aide **?**. Easter egg, dans la même aide : le **mode tuyau métallique** 🔩 fait retentir un énorme « CLANG » saturé, jamais tout à fait le même, à chaque action de la table (pour toi seulement) ; case cochée, les boutons « Écouter les sons » jouent aussi le tuyau. Le bouton **?** liste les raccourcis clavier (D piocher, U dégager tout, S mélanger, N tour suivant, T engager, G / E / H / B déplacer la carte survolée…).

> Les informations cachées (mains, bibliothèques) ne sont pas affichées aux autres joueurs, mais la table repose sur la confiance : c'est un outil pour jouer entre amis.

---

## 🛠️ Technique

- **Vanilla JS** (aucune dépendance, aucun build), un seul fichier HTML.
- **API Scryfall** : `/cards/collection`, `/cards/named`, `/cards/search`, `/cards/autocomplete`, symboles SVG et images (dont version française des cartes quand disponible).
- Persistance locale via le stockage du navigateur (clé `mtg-cmdr-decks`). Aucune donnée personnelle collectée.

### Structure du dépôt

```txt
editeur-deck-commander.html   # l'éditeur de decks (tout-en-un)
index.html                    # page d'accueil (GitHub Pages)
table-de-jeu-commander.html   # la table de jeu multijoueur (tout-en-un, PeerJS chargé depuis un CDN)
exemple-import.txt            # exemple d'import au format texte
exemple-import.json           # exemple d'import au format JSON (avec variantes)
tests/                        # tests de non-régression (Node + jsdom, hors ligne)
README.md
```

### Tests

```sh
npm install   # une fois
npm test
```

Les tests chargent le vrai fichier HTML dans jsdom. Les réponses de Scryfall y sont simulées par des données de test, donc aucun accès réseau n'est nécessaire. Ils couvrent l'import et l'export, la légalité, la sauvegarde et le rechargement, l'édition du deck, les images de proxy et la sauvegarde rapide, ainsi que la table de jeu (règles, plateau, menus, multijoueur avec un réseau simulé).

---

## 🙏 Crédits

- Données et images de cartes : **[Scryfall](https://scryfall.com/)** (voir leur [politique d'utilisation de l'API](https://scryfall.com/docs/api)).
- _Magic: The Gathering_ est une marque de Wizards of the Coast. Ce projet est un outil non officiel, sans affiliation.

## 📄 Licence

À définir (ex. MIT). Ajoute un fichier `LICENSE` selon ton choix.
