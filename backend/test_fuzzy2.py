import re
import difflib

def normalize_place_name(name: str) -> str:
    if not name:
        return ""
    n = name.lower()
    n = re.sub(r'[^a-z0-9]', '', n) # No spaces
    n = n.replace('ph', 'p').replace('dh', 'd').replace('th', 't')
    n = n.replace('bh', 'b').replace('gh', 'g').replace('kh', 'k').replace('sh', 's')
    n = re.sub(r'([a-z])\1+', r'\1', n)
    return n

def partial_ratio(s1: str, s2: str) -> float:
    if not s1 or not s2:
        return 0.0
    if len(s1) > len(s2):
        s1, s2 = s2, s1
    
    best_ratio = 0.0
    # Sliding window of len(s1) over s2
    for i in range(len(s2) - len(s1) + 1):
        sub = s2[i:i+len(s1)]
        ratio = difflib.SequenceMatcher(None, s1, sub).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            
    # Also check slightly longer/shorter windows for insertions/deletions
    for i in range(len(s2) - len(s1) + 1):
        sub = s2[i:i+len(s1)+1]
        ratio = difflib.SequenceMatcher(None, s1, sub).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            
    return best_ratio

def fuzzy_match(query: str, target: str) -> bool:
    if not query or not target:
        return False
        
    q_norm = normalize_place_name(query)
    t_norm = normalize_place_name(target)
    
    if q_norm in t_norm or t_norm in q_norm:
        return True
        
    if partial_ratio(q_norm, t_norm) > 0.85:
        return True
        
    return False

tests = [
    ("Pappampatti Pirivu", "Papampatti Pirivu"),
    ("Gandhipuram", "Gandhi Puram"),
    ("Ukkadam", "Ukkadom"),
    ("Ukkadom", "Ukkadam Bus Stand"),
    ("Gandhipuram", "Ganthi puram bus stand"),
    ("Chennai", "Madurai"),
    ("Channai", "Chennai CMBT")
]

for q, t in tests:
    print(f"'{q}' vs '{t}' -> {fuzzy_match(q, t)}")
