import re

# Common suffix words that get stripped/normalized so "Gandhipuram" and
# "Gandhipuram Bus Stand" resolve to the same logical stop when searching.
_NOISE_WORDS = {
    "bus", "stand", "junction", "jn", "signal", "stop", "busstand",
    "railway", "station", "circle", "toll", "gate",
}


def normalize_stop_name(raw_name: str) -> str:
    """
    Produce a normalized, search/dedupe-friendly representation of a stop name.
    Lowercases, strips punctuation, collapses whitespace, and removes common
    noise words (e.g. "Bus Stand") so near-duplicate names converge.
    """
    if not raw_name:
        return ""
    value = raw_name.strip().lower()
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    tokens = [t for t in value.split() if t and t not in _NOISE_WORDS]
    if not tokens:
        # Fall back to the un-filtered tokens if everything was "noise"
        tokens = [t for t in value.split() if t]
    return " ".join(tokens)
