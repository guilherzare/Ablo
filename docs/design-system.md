# Ablo — Design System

Référence des tokens visuels, composants et patterns UI utilisés dans l'application.

---

## Couleurs

### Primaire — Indigo

Utilisé pour les actions principales, liens actifs, focus states.

| Token | Valeur | Usage |
|-------|--------|-------|
| `primary-900` | `#312e81` | Texte sur fond clair (rare) |
| `primary-700` | `#4338ca` | Hover bouton primaire |
| `primary-600` | `#4f46e5` | Bouton primaire, accent principal |
| `primary-400` | `#818cf8` | Focus ring dark mode |
| `primary-300` | `#a5b4fc` | Bordure bouton secondaire |
| `primary-200` | `#c7d2fe` | Bordure default, badge |
| `primary-100` | `#e0e7ff` | Fond badge actif |
| `primary-50`  | `#ede9fe` | Hover bouton secondaire |

### Neutres

| Token | Valeur | Usage |
|-------|--------|-------|
| `gray-900` | `#111827` | Texte dark mode |
| `gray-800` | `#1f2937` | Fond carte dark mode |
| `gray-700` | `#374151` | Bordure dark mode, texte secondaire |
| `gray-600` | `#4b5563` | — |
| `gray-500` | `#6b7280` | Texte secondaire, labels |
| `gray-400` | `#9ca3af` | Placeholder, icônes inactives |
| `gray-300` | `#d1d5db` | Bordures légères |
| `gray-200` | `#e5e7eb` | Bordures inputs |
| `gray-100` | `#f3f4f6` | Fond badges, hover |
| `gray-50`  | `#f9fafb` | Fond inputs |
| `white`    | `#ffffff` | Fond cartes, modales |

### Couleur de fond app

| Token | Valeur | Usage |
|-------|--------|-------|
| `surface` | `#f8f9fc` | Fond principal de l'app |
| `ink` | `#1a1a2e` | Texte principal (proche noir, légèrement bleu) |

### Destructif — Rouge

| Token | Valeur | Usage |
|-------|--------|-------|
| `danger-700` | `#b91c1c` | Hover bouton destructif |
| `danger-600` | `#dc2626` | Bouton supprimer, erreur texte |
| `danger-400` | `#f87171` | Texte danger dark mode |

### Succès — Vert

| Token | Valeur | Usage |
|-------|--------|-------|
| `success-600` | `#16a34a` | Score autoéval max |
| `success-100` | `#dcfce7` | Fond état succès |

---

## Typographie

Police système héritée (`font-family: inherit` partout) — pas de font custom.

| Rôle | Taille | Poids | Usage |
|------|--------|-------|-------|
| Titre page | `1.5rem` | 700 | `home-title`, `patient-name` |
| Titre section | `1.15rem` | 700 | Titres modales |
| Corps | `0.9–0.95rem` | 400 | Texte courant |
| Label | `0.78–0.8rem` | 600 | Labels uppercase, section titles |
| Micro | `0.7rem` | 600 | Eyebrow tags (`SÉANCE 3`) |
| Badge | `0.75rem` | 600 | Compteurs, statuts |

---

## Espacements

Basés sur une grille de `4px`.

| Token | Valeur | Usage |
|-------|--------|-------|
| `space-1` | `4px` | Espacement micro |
| `space-2` | `8px` | Gap entre éléments proches |
| `space-3` | `12px` | Padding interne compact |
| `space-4` | `16px` | Padding standard |
| `space-5` | `20px` | Gap sections |
| `space-6` | `24px` | Padding modales, cartes |
| `space-7` | `28px` | Padding modal large |

---

## Rayons de bordure

| Token | Valeur | Usage |
|-------|--------|-------|
| `radius-sm` | `6px` | Boutons icon, tags |
| `radius-md` | `8px` | Inputs, boutons |
| `radius-lg` | `12px` | Cartes |
| `radius-xl` | `14px` | Modales |
| `radius-full` | `99px` | Pills, badges |
| `radius-circle` | `50%` | Badges numériques circulaires |

---

## Ombres

| Token | Valeur | Usage |
|-------|--------|-------|
| `shadow-card` | `0 1px 4px rgba(0,0,0,0.06)` | Cartes liste (repos) |
| `shadow-card-hover` | `0 2px 8px rgba(79,70,229,0.08)` | Cartes liste (hover) — teinte indigo intentionnelle |
| `shadow-modal` | `0 20px 60px rgba(0,0,0,0.20)` | Modales, popovers |
| `shadow-dropdown` | `0 4px 16px rgba(0,0,0,0.10)` | Dropdowns, menus contextuels |
| `shadow-focus` | `0 0 0 3px rgba(79,70,229,0.10)` | Focus ring inputs et boutons |
| `shadow-panel` | `-4px 0 24px rgba(0,0,0,0.12)` | Panneau latéral (SettingsPanel) — directionnel |

### Inconsistances connues à aligner

| Fichier | Valeur actuelle | Token cible |
|---------|----------------|-------------|
| `App.css` l.227 | `0 8px 24px rgba(0,0,0,0.12)` | `shadow-dropdown` |
| `HomePage.css` l.470 | `0 8px 24px rgba(0,0,0,0.10)` | `shadow-dropdown` |
| `FirstRun.css` l.17 | `0 4px 24px rgba(0,0,0,0.07)` | `shadow-dropdown` |

---

## Composants

### Bouton primaire — `.btn-new-patient`, `.btn-edit-save`

```
Fond : primary-600 (#4f46e5)
Texte : blanc
Hover : primary-700 (#4338ca)
Disabled : primary-200 (#c7d2fe)
Padding : 8px 20px
Border-radius : 8px
Font-size : 0.875rem, font-weight 600
```

### Bouton secondaire — `.btn-edit-cancel`, `.btn-modal-cancel`

```
Fond : transparent
Bordure : gray-300 (#d1d5db)
Texte : gray-500 (#6b7280)
Hover fond : gray-100 (#f3f4f6)
Padding : 8px 18px
Border-radius : 8px
```

### Bouton accent outline — `.btn-view-summary`

```
Fond : transparent
Bordure : primary-200 (#c7d2fe)
Texte : primary-600 (#4f46e5)
Hover fond : primary-50 (#ede9fe)
Hover bordure : primary-300 (#a5b4fc)
Padding : 8px 14px
Font-size : 0.8rem, font-weight 600
```

### Bouton destructif — `.btn-modal-delete`

```
Fond : danger-600 (#dc2626)
Texte : blanc
Hover : danger-700 (#b91c1c)
Padding : 8px 18px
Border-radius : 8px
```

### Bouton icône — `.btn-session-menu`

```
Fond : transparent
Bordure : primary-200 (#c7d2fe)
Texte : gray-400 (#9ca3af)
Hover/Active fond : primary-50 (#ede9fe)
Hover/Active texte : primary-600 (#4f46e5)
Padding : 8px 10px (hauteur alignée au bouton voisin)
Border-radius : 8px
```

### Input texte — `.home-search`, `.session-edit-date`

```
Fond : blanc
Bordure : gray-200 (#e5e7eb)
Focus bordure : primary-600 (#4f46e5)
Focus ring : 0 0 0 3px rgba(79,70,229,0.1)
Padding : 9px 12px
Border-radius : 8px
Font-size : 0.875rem
```

### Textarea — `.session-edit-textarea`

```
Fond : gray-50 (#f9fafb)
Bordure : gray-200 (#e5e7eb)
Focus : même que input
Resize : vertical
Line-height : 1.6
Border-radius : 8px
```

### Carte séance — `.session-card`

```
Fond : blanc
Bordure : gray-200 (#e5e7eb)
Border-radius : 12px
Padding : 14px 16px
Hover : légère ombre + bordure primary-200
Layout : flex row, space-between
```

### Badge numérique — `.sessions-count`

```
Fond : gray-100 (#f3f4f6)
Texte : gray-500 (#6b7280)
Forme : cercle 22px × 22px (border-radius 50%)
Font-size : 0.75rem, font-weight 600
Display : inline-flex, centré
```

### Badge statut patient — `.patient-label`

Couleurs générées dynamiquement par `getLabelColor(label)` — palette de 8 teintes pastel avec texte foncé assorti.

### Modale — `.session-details-modal`, `.session-edit-modal`

```
Fond : blanc
Border-radius : 14px
Padding : 24–28px
Max-width : 680px
Max-height : 92vh
Overflow-y : auto
Box-shadow : shadow-modal
```

### Backdrop modale

```
Background : rgba(15,15,30,0.4)
Backdrop-filter : blur(6px)
```

---

## Animations

| Nom | Définition | Usage |
|-----|-----------|-------|
| `shimmer` | Gradient linéaire animé gauche→droite | Résumé en cours de génération |
| Transitions | `0.15–0.2s ease` | Hover états, couleurs |

---

## Dark mode

Le dark mode est géré via `@media (prefers-color-scheme: dark)` dans chaque fichier CSS. Principales substitutions :

| Light | Dark |
|-------|------|
| `#ffffff` (fond carte) | `#1f2937` |
| `#f8f9fc` (fond app) | `#111827` |
| `#1a1a2e` (texte) | `#f9fafb` |
| `#e5e7eb` (bordure) | `#374151` |
| `#f9fafb` (fond input) | `#374151` |

---

## Layout global

```
App (100vh, flex column)
├── Header fixe (48px)
│   ├── Breadcrumbs / titre patient
│   └── Actions contextuelles
└── Main (flex: 1, overflow-y: auto)
    └── Vue active (home / patient / workflow)
```

La navigation est une machine d'état dans `App.tsx` — pas de routeur. Les vues sont montées/démontées selon l'état courant.
