# Domain docs

Comment les engineering skills doivent consommer la documentation domaine de ce dépôt lors de l'exploration du code.

## Avant d'explorer, lire

- **`CONTEXT.md`** à la racine du dépôt
- **`docs/adr/`** — lire les ADRs qui touchent au sujet en cours

Si l'un de ces fichiers n'existe pas, **continuer silencieusement**. Ne pas signaler son absence ; ne pas suggérer de le créer en amont. Le skill producteur (`/grill-with-docs`) les crée paresseusement quand un terme ou une décision est réellement résolu.

## Structure de fichiers (single-context)

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-titre-court.md
│   └── 0002-titre-court.md
└── src/
```

## Utiliser le vocabulaire du glossaire

Quand une sortie nomme un concept domaine (titre d'issue, proposition de refactor, hypothèse, nom de test), utiliser le terme défini dans `CONTEXT.md`. Ne pas dériver vers des synonymes que le glossaire évite explicitement.

Si le concept n'est pas encore dans le glossaire, c'est un signal — soit on invente du langage que le projet n'utilise pas (à reconsidérer), soit il y a une vraie lacune (à noter pour `/grill-with-docs`).

## Signaler les conflits avec un ADR

Si une sortie contredit un ADR existant, le mentionner explicitement plutôt que de le contourner silencieusement :

> _Contredit ADR-0007 (titre) — mais il vaut la peine de rouvrir parce que…_
