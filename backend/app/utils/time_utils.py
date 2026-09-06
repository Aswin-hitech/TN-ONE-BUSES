"""
All time handling for the "next bus" and "freshness" logic lives here.
Everything is normalized to timezone-aware UTC datetimes so comparisons
are correct regardless of server timezone, and midnight/date-rollover
transitions are handled correctly.
"""
from datetime import datetime, timezone, timedelta


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime) -> datetime:
    """Coerce a naive datetime (assumed UTC) into a timezone-aware UTC datetime."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def minutes_until(target: datetime, now: datetime = None) -> float:
    """
    Minutes from `now` until `target`. Positive = in the future,
    negative = already passed. Handles date/midnight transitions
    naturally because both are full datetimes, not just clock times.
    """
    now = now or utcnow()
    target = ensure_utc(target)
    now = ensure_utc(now)
    delta = target - now
    return delta.total_seconds() / 60.0


def humanize_freshness(reported_at: datetime, now: datetime = None) -> dict:
    """
    Returns a freshness descriptor for a report timestamp:
      - a human label ("Reported 3 minutes ago")
      - a coarse level used for UI color-coding (green/yellow/orange/red)
    """
    now = now or utcnow()
    reported_at = ensure_utc(reported_at)
    now = ensure_utc(now)
    delta_seconds = (now - reported_at).total_seconds()

    if delta_seconds < 0:
        # Clock skew guard — treat as "just now" rather than negative.
        delta_seconds = 0

    minutes = delta_seconds / 60.0

    if minutes < 1:
        label = "Reported just now"
        level = "fresh"
    elif minutes < 10:
        label = f"Reported {int(minutes)} minute{'s' if int(minutes) != 1 else ''} ago"
        level = "fresh"
    elif minutes < 45:
        label = f"Reported {int(minutes)} minutes ago"
        level = "moderate"
    elif minutes < 120:
        hours = int(minutes // 60) or 1
        rem_minutes = int(minutes % 60)
        if minutes < 60:
            label = f"Reported {int(minutes)} minutes ago"
        else:
            label = f"Reported {hours} hour{'s' if hours != 1 else ''} ago"
        level = "stale"
    else:
        # Beyond ~2 hours: show relative days if applicable
        days = int(minutes // 1440)
        if days >= 1:
            if reported_at.date() == (now - timedelta(days=1)).date():
                label = "Reported yesterday"
            else:
                label = f"Reported {days} day{'s' if days != 1 else ''} ago"
        else:
            hours = int(minutes // 60)
            label = f"Reported {hours} hours ago"
        level = "very_stale"

    return {
        "label": label,
        "level": level,  # fresh | moderate | stale | very_stale
        "minutes_ago": round(minutes, 1),
    }


# A report's boarding_time is only meaningful as "upcoming" information for
# a bounded window. Past this, we still show it (transparently, as history)
# but it will never be selected as the "next" bus.
NEXT_BUS_LOOKAHEAD_MINUTES = 180  # don't treat something 3+ hours out as "next"
NEXT_BUS_GRACE_PERIOD_MINUTES = 5  # a bus that "just" passed can still count briefly
STALE_REPORT_MAX_AGE_MINUTES = 24 * 60  # reports older than this are considered stale/history only
