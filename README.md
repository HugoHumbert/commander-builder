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

Copie dans le presse-papier ou télécharge un fichier `.txt` / `.json`.

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
      "status": "done"
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

Champs par carte : `name` (nom anglais canonique), `qty`, `variant` (nom de reskin), `group` (groupe custom), `cmd` (commandant), `status` (`todo` / `wip` / `done`).

---

## 🛠️ Technique

- **Vanilla JS** (aucune dépendance, aucun build), un seul fichier HTML.
- **API Scryfall** : `/cards/collection`, `/cards/named`, `/cards/search`, `/cards/autocomplete`, symboles SVG et images (dont version française des cartes quand disponible).
- Persistance locale via le stockage du navigateur (clé `mtg-cmdr-decks`). Aucune donnée personnelle collectée.

### Structure du dépôt

```txt
editeur-deck-commander.html   # l'application (tout-en-un)
exemple-import.txt            # exemple d'import au format texte
exemple-import.json           # exemple d'import au format JSON (avec variantes)
README.md
```

---

## 🙏 Crédits

- Données et images de cartes : **[Scryfall](https://scryfall.com/)** (voir leur [politique d'utilisation de l'API](https://scryfall.com/docs/api)).
- _Magic: The Gathering_ est une marque de Wizards of the Coast. Ce projet est un outil non officiel, sans affiliation.

## 📄 Licence

À définir (ex. MIT). Ajoute un fichier `LICENSE` selon ton choix.
