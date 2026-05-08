"""
Détection et masquage d'informations personnelles dans un texte français.
Approche : regex + listes de prénoms/villes FR courants.
Aucune donnée n'est écrite sur disque.
"""
import re
from typing import List, Dict, Tuple

# Prénoms français courants (minuscules pour comparaison)
_PRENOMS = set(map(str.lower, [
    # Féminins
    "Marie", "Camille", "Lea", "Lucie", "Jade", "Alice", "Manon", "Emma",
    "Pauline", "Charlotte", "Sophie", "Claire", "Julie", "Laura", "Mathilde",
    "Oceane", "Victoria", "Margot", "Chloe", "Zoe", "Lou", "Eva", "Sarah",
    "Marine", "Amelie", "Elodie", "Audrey", "Celine", "Nathalie", "Isabelle",
    "Christine", "Sylvie", "Helene", "Michele", "Monique", "Jacqueline",
    "Genevieve", "Colette", "Yvette", "Denise", "Suzanne", "Madeleine",
    "Simone", "Henriette", "Marguerite", "Odette", "Fatima", "Nadia",
    "Leila", "Sonia", "Amina", "Kenza", "Yasmine", "Ines", "Adele",
    "Beatrice", "Brigitte", "Corinne", "Daniele", "Laurence", "Martine",
    "Mireille", "Nadine", "Nicole", "Veronique", "Florence", "Dominique",
    "Valerie", "Sandrine", "Stephanie", "Virginie", "Laetitia", "Aurelie",
    "Melanie", "Vanessa", "Jessica", "Stephanie", "Emilie", "Anais",
    # Masculins
    "Jean", "Pierre", "Paul", "Thomas", "Nicolas", "Julien", "Alexandre",
    "Gabriel", "Lucas", "Hugo", "Arthur", "Nathan", "Theo", "Baptiste",
    "Maxime", "Antoine", "Romain", "Valentin", "Clement", "Florian",
    "Quentin", "Alexis", "Ethan", "Louis", "Adam", "Raphael", "Liam",
    "Noah", "Tom", "Axel", "Mael", "Noa", "Francois", "Bernard", "Jacques",
    "Andre", "Rene", "Georges", "Henri", "Marcel", "Philippe", "Patrick",
    "Daniel", "Michel", "Robert", "Alain", "Gilles", "Laurent", "Christophe",
    "Stephane", "David", "Olivier", "Eric", "Pascal", "Herve", "Marc",
    "Yves", "Thierry", "Christian", "Emmanuel", "Guillaume", "Vincent",
    "Ahmed", "Mohamed", "Karim", "Rachid", "Mehdi", "Kevin", "Sebastien",
    "Frederic", "Benoit", "Cedric", "Damien", "Franck", "Gregory", "Jerome",
    "Jonathan", "Laurent", "Mickael", "Olivier", "Regis", "Sebastien",
]))

# Villes françaises majeures (minuscules)
_VILLES = set(map(str.lower, [
    "Paris", "Lyon", "Marseille", "Toulouse", "Bordeaux", "Lille", "Strasbourg",
    "Nantes", "Rennes", "Grenoble", "Nice", "Toulon", "Montpellier", "Dijon",
    "Angers", "Nimes", "Limoges", "Reims", "Tours", "Metz", "Besancon",
    "Amiens", "Caen", "Orleans", "Rouen", "Mulhouse", "Brest", "Perpignan",
    "Nancy", "Avignon", "Poitiers", "Pau", "Versailles", "Antibes", "Cannes",
    "Aix", "Valenciennes", "Roubaix", "Tourcoing", "Dunkerque", "Calais",
    "Lorient", "Quimper", "Vannes", "Saint-Nazaire", "Annecy", "Chambery",
    "Valence", "Bayonne", "Biarritz", "Perigueux", "Agen", "Angouleme",
    "Poitiers", "La Rochelle", "Niort", "Cherbourg", "Caen", "Laval",
    "Le Mans", "Tours", "Chartres", "Troyes", "Chalons", "Colmar",
    "Thionville", "Forbach", "Belfort", "Montbeliard", "Auxerre",
]))

_MOIS_FR = (
    r'(?:janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|'
    r'septembre|octobre|novembre|d[eé]cembre)'
)


def _find_all(text: str) -> List[Tuple[int, int, str]]:
    """Retourne (start, end, catégorie) triés, sans chevauchements."""
    candidates: List[Tuple[int, int, str]] = []

    # Email
    for m in re.finditer(
        r'\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b', text
    ):
        candidates.append((m.start(), m.end(), "email"))

    # Téléphone FR (mobile 06/07, fixe 01-05, +33)
    for m in re.finditer(
        r'\b(?:\+33|0033|0)[1-9](?:[\s.\-]?\d{2}){4}\b', text
    ):
        candidates.append((m.start(), m.end(), "téléphone"))

    # Date de naissance (DD/MM/YYYY, DD-MM-YYYY, DD mois YYYY)
    for m in re.finditer(
        rf'\b\d{{1,2}}[\/\-\.]\d{{1,2}}[\/\-\.]\d{{2,4}}\b'
        rf'|\b\d{{1,2}}\s+{_MOIS_FR}\s+\d{{4}}\b',
        text, re.IGNORECASE
    ):
        candidates.append((m.start(), m.end(), "date_naissance"))

    # Villes (mot capitalisé figurant dans la liste)
    for m in re.finditer(r'\b[A-ZÀ-Ÿ][a-zà-ÿ]{2,}(?:-[A-ZÀ-Ÿa-zà-ÿ]+)*\b', text):
        if m.group().lower() in _VILLES:
            candidates.append((m.start(), m.end(), "ville"))

    # Prénoms (mot capitalisé figurant dans la liste)
    for m in re.finditer(r'\b[A-ZÀ-Ÿ][a-zà-ÿ]{2,}\b', text):
        if m.group().lower() in _PRENOMS:
            candidates.append((m.start(), m.end(), "prénom"))

    # Trier par position, résoudre chevauchements (le plus long gagne)
    candidates.sort(key=lambda c: (c[0], -(c[1] - c[0])))
    result: List[Tuple[int, int, str]] = []
    last_end = -1
    for start, end, cat in candidates:
        if start >= last_end:
            result.append((start, end, cat))
            last_end = end

    return result


_CAT_LABEL: Dict[str, str] = {
    "email": "EMAIL",
    "téléphone": "TEL",
    "date_naissance": "DATE",
    "ville": "VILLE",
    "prénom": "NOM",
}


def anonymize(text: str) -> dict:
    """
    Détecte les informations personnelles et retourne :
    - anonymized_text : texte avec les marqueurs substitués
    - spans : liste des occurrences détectées (avec position dans le texte original)
    - substitution_map : marqueur → valeur réelle (à garder en mémoire uniquement)
    """
    raw_spans = _find_all(text)
    counters: Dict[str, int] = {}
    spans = []
    substitution_map: Dict[str, str] = {}

    for start, end, category in raw_spans:
        label = _CAT_LABEL.get(category, category.upper())
        counters[label] = counters.get(label, 0) + 1
        placeholder = f"[{label}_{counters[label]}]"
        original = text[start:end]
        substitution_map[placeholder] = original
        spans.append({
            "start": start,
            "end": end,
            "placeholder": placeholder,
            "original": original,
            "category": category,
        })

    parts = []
    prev = 0
    for s in spans:
        parts.append(text[prev:s["start"]])
        parts.append(s["placeholder"])
        prev = s["end"]
    parts.append(text[prev:])

    return {
        "anonymized_text": "".join(parts),
        "spans": spans,
        "substitution_map": substitution_map,
    }
