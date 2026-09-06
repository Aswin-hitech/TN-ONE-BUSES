import re
from datetime import datetime, timezone, timedelta
from app.extensions import db


class BusType:
    GOVERNMENT = "Government"
    PRIVATE = "Private"
    DELUXE = "Deluxe"
    FAST = "Fast"

    ALL = [GOVERNMENT, PRIVATE, DELUXE, FAST]


# Average commercial bus speeds in Tamil Nadu (km/h) for arrival prediction
BUS_SPEED_KMH = {
    "Fast": 45.0,
    "Deluxe": 40.0,
    "Private": 32.0,
    "Government": 30.0,
}


def format_time_ampm(time_str: str) -> str:
    """Converts a time string (e.g. '06:20', '14:15') to 12-hour AM/PM format."""
    if not time_str:
        return ""
    s = str(time_str).strip()
    if not s:
        return ""
    if re.search(r"[ap]\.?m\.?", s, re.I):
        return s
    m = re.match(r"^(\d{1,2}):(\d{2})(?::\d{2})?$", s)
    if not m:
        return s
    h = int(m.group(1))
    mins = m.group(2)
    period = "AM" if h < 12 else "PM"
    h12 = h % 12
    if h12 == 0:
        h12 = 12
    return f"{h12:02d}:{mins} {period}"


def parse_time_to_minutes(time_str: str) -> int:
    """Converts '06:20 PM' or '18:20' to minutes from midnight."""
    if not time_str:
        return 0
    match = re.search(r"(\d{1,2}):(\d{2})", str(time_str))
    if not match:
        return 0
    h = int(match.group(1))
    m = int(match.group(2))
    if "pm" in str(time_str).lower() and h < 12:
        h += 12
    elif "am" in str(time_str).lower() and h == 12:
        h = 0
    return h * 60 + m


def predict_reaching_time(timing_str: str, distance_km: float = None, bus_type: str = "Government") -> str:

    """
    Predict reaching time based on departure timing, distance in KM, and bus type.
    Example:
      timing_str = "06:20", distance_km = 14.5, bus_type = "Deluxe" (40 km/h)
      travel_time = (14.5 / 40.0) * 60 = 22 mins + dwell = 26 mins
      reaching_time = "06:46 AM"
    """
    if not timing_str:
        return None
    if not distance_km or distance_km <= 0:
        return None

    speed = BUS_SPEED_KMH.get(bus_type, 32.0)
    # Travel time in minutes + stop-dwell time
    dwell_mins = max(2, round((distance_km / 5.0) * 1.5))
    travel_minutes = round((distance_km / speed) * 60) + dwell_mins

    # Parse departure time (HH:MM)
    time_match = re.search(r"(\d{1,2}):(\d{2})", timing_str)
    if not time_match:
        return None

    hours = int(time_match.group(1))
    minutes = int(time_match.group(2))

    # Check for AM/PM in string
    is_pm = "pm" in timing_str.lower() and hours < 12
    is_am = "am" in timing_str.lower() and hours == 12
    if is_pm:
        hours += 12
    elif is_am:
        hours = 0

    total_departure_mins = hours * 60 + minutes
    total_arrival_mins = (total_departure_mins + travel_minutes) % (24 * 60)

    arr_hour = total_arrival_mins // 60
    arr_minute = total_arrival_mins % 60

    period = "AM" if arr_hour < 12 else "PM"
    display_hour = arr_hour % 12
    if display_hour == 0:
        display_hour = 12

    return f"{display_hour:02d}:{arr_minute:02d} {period}"


class Bus(db.Model):
    """
    Single unified table for all bus routes, timings, stops, and fares.
    Designed for effortless manual SQL insertion and querying.
    """
    __tablename__ = "buses"

    id = db.Column(db.Integer, primary_key=True)
    bus_name = db.Column(db.String(255), nullable=False, index=True)
    bus_number = db.Column(db.String(64), nullable=True, index=True)
    bus_type = db.Column(db.String(64), nullable=False, default="Government", index=True)
    operator = db.Column(db.String(255), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Route stops
    start_stop = db.Column(db.String(255), nullable=False, index=True)
    destination_stop = db.Column(db.String(255), nullable=False, index=True)
    boarded_stops = db.Column(db.Text, nullable=True)  # Comma-separated intermediate stops

    # Timings & Fares
    bus_timings = db.Column(db.Text, nullable=True)  # Comma-separated: "06:20, 08:30, 14:15"
    bus_fare = db.Column(db.Float, nullable=False, default=20.0)
    distance_km = db.Column(db.Float, nullable=True)
    reaching_time = db.Column(db.String(64), nullable=True)
    stop_timings = db.Column(db.Text, nullable=True)  # JSON or formatted string of spots with their timings

    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def get_stop_timings_list(self) -> list[dict]:
        """
        Returns structured list of spots with their respective timings:
        [{"stop": "Gandhipuram", "time": "06:00 AM"}, ...]
        """
        import json
        if self.stop_timings:
            try:
                data = json.loads(self.stop_timings)
                if isinstance(data, list):
                    res = []
                    for item in data:
                        if isinstance(item, dict):
                            s_name = (item.get("stop") or item.get("stop_name") or item.get("name") or "").strip()
                            s_time = item.get("time") or item.get("timing") or item.get("departure_time") or ""
                            if s_name:
                                res.append({"stop": s_name, "time": format_time_ampm(s_time)})
                        elif isinstance(item, str) and item.strip():
                            res.append({"stop": item.strip(), "time": ""})
                    if res:
                        return res
            except Exception:
                res = []
                for part in self.stop_timings.split(","):
                    p = part.strip()
                    if not p:
                        continue
                    m = re.search(r"^(.*?)(?:[@:\-(]|\bat\b)\s*(\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?)\)?$", p, re.I)
                    if m:
                        res.append({"stop": m.group(1).strip(), "time": format_time_ampm(m.group(2).strip())})
                    else:
                        res.append({"stop": p, "time": ""})
                if res:
                    return res

        # Fallback to synthesizing from start_stop, boarded_stops, destination_stop
        timings = self.get_ampm_timings_list()
        res = [{"stop": self.start_stop, "time": timings[0] if timings else ""}]
        if self.boarded_stops:
            for s in self.boarded_stops.split(","):
                cl = s.strip()
                if cl and cl.lower() not in [x["stop"].lower() for x in res]:
                    res.append({"stop": cl, "time": ""})
        dest_time = format_time_ampm(self.reaching_time or self.calculate_reaching_time())
        if self.destination_stop and self.destination_stop.lower() not in [x["stop"].lower() for x in res]:
            res.append({"stop": self.destination_stop, "time": dest_time or ""})
        return res

    def get_stops_list(self) -> list[str]:
        """Returns clean list of all stops along this route [start, ...boarded_stops, destination]."""
        stops = [self.start_stop]
        if self.stop_timings:
            for item in self.get_stop_timings_list():
                s = item["stop"].strip()
                if s and s.lower() not in [x.lower() for x in stops]:
                    stops.append(s)
        if self.boarded_stops:
            for s in self.boarded_stops.split(","):
                cleaned = s.strip()
                if cleaned and cleaned.lower() not in [x.lower() for x in stops]:
                    stops.append(cleaned)
        if self.destination_stop.lower() not in [x.lower() for x in stops]:
            stops.append(self.destination_stop)
        return stops

    def get_timings_list(self) -> list[str]:
        """Returns list of formatted bus timings."""
        if not self.bus_timings:
            return []
        return [t.strip() for t in self.bus_timings.split(",") if t.strip()]

    def calculate_reaching_time(self, default_timing: str = None) -> str:
        """Predicts reaching time using distance_km and bus_type if not manually set."""
        if self.reaching_time:
            return self.reaching_time
        timings = self.get_timings_list()
        base_time = default_timing or (timings[0] if timings else None)
        if base_time and self.distance_km:
            return predict_reaching_time(base_time, self.distance_km, self.bus_type)
        return None

    def get_ampm_timings_list(self) -> list[str]:
        return [format_time_ampm(t) for t in self.get_timings_list()]

    def to_dict(self):
        timings = self.get_timings_list()
        timings_ampm = [format_time_ampm(t) for t in timings]
        stops = self.get_stops_list()
        reaching = self.reaching_time or self.calculate_reaching_time()
        spots = self.get_stop_timings_list()

        is_owner = False
        try:
            from flask_login import current_user
            if current_user and current_user.is_authenticated and self.user_id == current_user.id:
                is_owner = True
        except Exception:
            pass

        return {
            "id": self.id,
            "bus_name": self.bus_name,
            "bus_number": self.bus_number,
            "bus_type": self.bus_type,
            "operator": self.operator or self.bus_type,
            "user_id": self.user_id,
            "is_owner": is_owner,
            "start_stop": self.start_stop,
            "destination_stop": self.destination_stop,
            "boarded_stops": self.boarded_stops,
            "stops": stops,
            "stop_timings": spots,
            "spots": spots,
            "bus_timings": self.bus_timings,
            "timings": timings,
            "timings_ampm": timings_ampm,
            "bus_fare": self.bus_fare,
            "fare": self.bus_fare,
            "distance_km": self.distance_km,
            "reaching_time": reaching,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<Bus {self.bus_name} ({self.start_stop} -> {self.destination_stop})>"

