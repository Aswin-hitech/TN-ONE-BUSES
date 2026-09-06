import re
import difflib

def normalize_place_name(name: str) -> str:
    if not name:
        return ""
    n = name.lower()
    # Remove punctuation
    n = re.sub(r'[^a-z0-9\s]', '', n)
    # Phonetic simplifications
    n = n.replace('ph', 'p').replace('dh', 'd').replace('th', 't')
    n = n.replace('bh', 'b').replace('gh', 'g').replace('kh', 'k').replace('sh', 's')
    # Reduce double characters
    n = re.sub(r'([a-z])\1+', r'\1', n)
    return n.strip()

def fuzzy_match(query: str, target: str) -> bool:
    if not query or not target:
        return False
    
    q_norm = normalize_place_name(query).replace(" ", "")
    t_norm = normalize_place_name(target).replace(" ", "")
    
    if q_norm in t_norm or t_norm in q_norm:
        return True
        
    if difflib.SequenceMatcher(None, q_norm, t_norm).ratio() > 0.85:
        return True
        
    # Word by word similarity
    q_words = normalize_place_name(query).split()
    t_words = normalize_place_name(target).split()
    
    if not q_words or not t_words:
        return False
        
    match_count = 0
    for qw in q_words:
        if len(qw) < 3:
            if qw in t_words:
                match_count += 1
            continue
            
        best_ratio = 0
        for tw in t_words:
            ratio = difflib.SequenceMatcher(None, qw, tw).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
        if best_ratio > 0.82:
            match_count += 1
            
    if match_count > 0 and match_count >= len(q_words):
        return True
        
    return False

tests = [
    ("Pappampatti Pirivu", "Papampatti Pirivu"),
    ("Gandhipuram", "Gandhi Puram"),
    ("Ukkadam", "Ukkadom"),
    ("Ukkadom", "Ukkadam Bus Stand"),
    ("Gandhipuram", "Ganthi puram bus stand"),
    ("Chennai", "Madurai")
]

for q, t in tests:
    print(f"'{q}' vs '{t}' -> {fuzzy_match(q, t)}")
