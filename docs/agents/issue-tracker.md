# Issue tracker : GitHub

Les issues et PRDs vivent dans GitHub Issues du dépôt `guilherzare/Ablo`. Utiliser la CLI `gh` pour toutes les opérations.

## Conventions

- **Créer une issue** : `gh issue create --title "..." --body "..."`. Utiliser un heredoc pour les corps multi-lignes.
- **Lire une issue** : `gh issue view <number> --comments`, en filtrant les commentaires avec `jq` et en récupérant aussi les labels.
- **Lister les issues** : `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` avec les filtres `--label` et `--state` appropriés.
- **Commenter** : `gh issue comment <number> --body "..."`
- **Appliquer / retirer un label** : `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Fermer** : `gh issue close <number> --comment "..."`

`gh` infère automatiquement le dépôt depuis `git remote -v` lorsqu'il est exécuté dans un clone.

## Quand un skill dit « publier sur le tracker »

Créer une issue GitHub.

## Quand un skill dit « récupérer le ticket pertinent »

Exécuter `gh issue view <number> --comments`.
