# Ablo — Contexte projet

Application Windows desktop pour art-thérapeutes : dictée vocale post-séance → transcription locale → anonymisation → rapport structuré exportable. **100% offline, local-first, privacy-first.**

## Mission

Réduire le temps administratif de rédaction des bilans de séance sans compromis sur :

- la **qualité clinique** du rapport
- la **confidentialité** des données patient
- le **contrôle** du thérapeute sur la sortie finale
- la **cohérence structurelle** entre bilans (mêmes sections, même format)

## Domaine : art-thérapie

L'art-thérapie est une pratique clinique utilisant la création artistique comme support thérapeutique. Le **thérapeute** rédige après chaque **séance** (ou cycle de séances) un **bilan de prise en charge** structuré selon un **template** propre à sa pratique.

### Glossaire

| Terme | Définition |
|-------|-----------|
| **Séance** | Rencontre clinique thérapeute / patient. |
| **Bilan** | Rapport structuré rédigé après une séance ou série de séances. Sortie finale du produit. |
| **Template** | Structure type d'un bilan (sections, placeholders, contraintes). Source de vérité de la génération. Externe au code. |
| **Placeholder** | Marqueur substituable dans un template : `[PATIENT]`, `[DATE]`, `[LIEU]`. |
| **Patient** | Personne suivie en thérapie. Toute donnée la concernant est sensible (RGPD + secret professionnel). Souvent mineur. |
| **Anonymisation** | Substitution des données identifiantes par des marqueurs neutres avant transmission au LLM. |
| **Autoévaluation** | Évaluation produite par le patient lui-même. Ne doit **jamais** être inventée par l'IA. |
| **Transcription brute** | Sortie texte du STT, non corrigée, non anonymisée. |
| **Validation déterministe** | Vérification non-IA qu'une sortie respecte la structure du template (sections présentes, placeholders résolus, marqueurs d'anonymisation absents). |

## Contraintes structurantes (non négociables)

- **Offline absolu** : zéro appel réseau, zéro API cloud, zéro télémétrie. La machine du thérapeute est l'unique périmètre de confiance.
- **Local-first** : audio, transcriptions, bilans et templates restent sur le poste.
- **Windows desktop** : public cible majoritairement sur Windows.
- **Utilisateur non technique** : aucune compétence informatique requise. L'application masque le STT, le LLM, les modèles et leurs paramètres.
- **Résistance aux hallucinations** : aucune sortie IA n'est restituée sans validation déterministe.
- **Sensibilité maximale** : santé mentale, mineurs possibles. Toute fonctionnalité est évaluée à l'aune du risque pour le patient en cas de fuite ou d'erreur.

## Architecture conceptuelle

### Pipeline de traitement

```
[Audio]
  ↓ STT local
[Transcription brute]
  ↓ Anonymisation locale (rule-based + dictionnaire utilisateur)
[Transcription anonymisée]  ←  Validation utilisateur (revue manuelle)
  ↓ LLM local + template
[Rapport structuré candidat]
  ↓ Validation déterministe (parseur de template)
[Rapport validé]  ←  Édition humaine
  ↓ Rendu
[Export Word / PDF]
```

### Principes d'architecture

- **Déterministe par défaut, IA en assistance.** Le template impose la structure ; l'IA remplit les champs ; un parseur vérifie le résultat.
- **Tout est éditable.** Chaque étape produit un artefact que le thérapeute peut corriger avant la suivante. Aucune étape n'est cachée.
- **Modularité.** STT, anonymisation, LLM, parseur, rendu et export sont des briques indépendantes et remplaçables. Aucune n'a d'accès direct aux autres ; tout passe par des artefacts intermédiaires sérialisables.
- **Réversibilité.** Le thérapeute peut revenir à n'importe quelle étape sans perdre les modifications des autres.

## Système de templates

Les templates **ne sont pas codés en dur**. Ils vivent comme fichiers externes (Markdown ou format dédié) chargés dynamiquement.

Un template définit :

- les **sections** (obligatoires / facultatives, ordre)
- les **placeholders** (`[PATIENT]`, `[DATE]`, `[LIEU]`, autres définis par le thérapeute)
- les **contraintes** sémantiques par section (« ne pas inventer de données », « lister sans paraphraser », etc.)

Le thérapeute peut créer, modifier et dupliquer ses templates sans toucher au code. Le template est la **source de vérité** pour la génération et la validation.

## Stratégie de fiabilité IA

L'IA peut halluciner. Trois lignes de défense :

1. **En amont du LLM** : prompts contraints au template, température basse, contexte minimal mais suffisant, instructions de refus en cas d'information manquante.
2. **En aval du LLM (déterministe)** : un parseur vérifie que toutes les sections du template sont présentes, qu'aucun marqueur d'anonymisation n'a été restitué en clair, qu'aucune autoévaluation n'a été fabriquée, qu'aucun placeholder n'est resté non résolu.
3. **Côté humain** : revue obligatoire avant export. Diff visible entre transcription anonymisée et bilan généré. Un bilan ne peut pas être exporté sans validation explicite.

Si la validation déterministe échoue : message clair au thérapeute, pas de masquage de l'erreur, possibilité de regénérer ou de remplir manuellement les sections fautives.

## Privacy & sécurité

- Aucune donnée ne quitte la machine, jamais.
- Audio brut effaçable en un clic après transcription.
- Stockage chiffré au repos (à arrêter en ADR : mécanisme exact selon contraintes Windows).
- Logs sans contenu patient (uniquement événements techniques).
- Pas de mécanisme de mise à jour automatique côté données utilisateur ; les modèles IA se mettent à jour explicitement, jamais en arrière-plan.

## Frontières

**Dans le périmètre :** un bilan = un poste, un thérapeute, une session de travail.

**Hors périmètre actuel :** synchronisation multi-poste, partage de bilans, multi-utilisateurs, statistiques agrégées, gestion de dossier patient longitudinal.

## Décisions ouvertes

À arbitrer (futurs ADRs dans `docs/adr/`) :

- modèle STT local (Whisper variants, performance vs CPU disponible)
- modèle LLM local (taille vs qualité vs RAM du poste typique)
- format de packaging Windows (MSI, MSIX, installeur classique)
- format précis des templates (Markdown étendu vs YAML vs format dédié)
- mécanisme de chiffrement au repos
- stratégie de mise à jour des modèles (manuelle vs assistée)
