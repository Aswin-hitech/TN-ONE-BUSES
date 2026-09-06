# THE TN ONE

**Your Community-Powered Bus Information Network**

## Problem

In Tamil Nadu (and many cities), people waiting at a bus stop often have no
reliable way to know which buses stop there, where they're headed, when they
last passed, or when the next one might arrive. Official schedules rarely
match reality, and there's no live tracking. Riders are left guessing.

## Solution

THE TN ONE is a crowdsourced bus information platform. Any rider who boards
or observes a bus can report it — bus name/number, boarding stop,
destination, and boarding time — in under a minute. Other riders can then
search their destination and immediately see which buses have recently been
reported heading there, including the most likely **next bus** based on real
boarding times.

No live GPS. No ML predictions. Just fast, honest, community-reported data —
clearly labeled with how fresh it is — built on an architecture ready to grow
into those things later.

## Features (MVP)

- Google OAuth 2.0 sign-in (search works without an account; reporting requires one)
- Report a bus: bus name/number, operator, boarding stop, boarding time, destination, optional route stops, optional notes
- Destination-only search (`?destination=Ukkadam`) and From → To search (`?from=Gandhipuram&to=Ukkadam`)
- Directional route matching — a route is only considered a match for From→To if it actually travels in that direction
- Stop autocomplete with name normalization (`"Gandhipuram"` and `"Gandhipuram Bus Stand"` resolve to the same stop)
- "Next reported bus" ranking that correctly handles future/past times, midnight rollovers, missing timing info, and stale reports
- Data-freshness indicators (🟢 fresh → 🔴 very stale) shown on every result
- Duplicate-submission protection and rate limiting on report creation
- User profile with personal report history
- Mobile-first responsive UI (vanilla HTML/CSS/JS, no frontend framework)
- Vercel-ready Flask deployment, Supabase/Neon Postgres support, Alembic migrations, automated tests

## Architecture

```
backend/                  Flask application
  app/
    __init__.py            App factory, extension wiring, error handlers
    config.py               Environment-driven configuration
    extensions.py            Shared Flask extension instances
    models/                   SQLAlchemy models (users, buses, stops, routes, route_stops, bus_reports)
    schemas/                   Pydantic request-validation schemas
    blueprints/                 Route handlers (thin — no business logic here)
    services/                    Business logic (auth, bus/stop resolution, routes, reports, search+ranking)
    utils/                        Sanitization, time handling, response envelopes, auth guards
  migrations/                Alembic migration scripts (Flask-Migrate)
  tests/                      Pytest suite (sqlite in-memory)

frontend/                  Static, mobile-first HTML/CSS/vanilla JS
  index.html / search.html / login.html / report.html / profile.html
  css/  (style.css, responsive.css)
  js/   (api.js, auth.js, search.js, report.js, profile.js)

api/index.py               Vercel serverless entry point
vercel.json                Vercel routing for Flask API and static frontend
```

Route handlers stay thin — all real logic (stop normalization, duplicate
detection, next-bus ranking, direction-aware route matching) lives in
`services/`, so it's independently testable and reusable if a future admin
dashboard or mobile client needs the same logic.

## Tech Stack

- **Backend:** Python 3.12 + Flask 3
- **Frontend:** HTML, CSS, vanilla JavaScript (no framework)
- **Database:** PostgreSQL (Neon), SQLite for local tests
- **ORM:** SQLAlchemy (via Flask-SQLAlchemy)
- **Migrations:** Alembic (via Flask-Migrate)
- **Validation:** Pydantic v2
- **Auth:** Google OAuth 2.0 / OpenID Connect (Authlib) + Flask-Login sessions
- **Rate limiting:** Flask-Limiter
- **Deployment:** Vercel (Flask serverless API + static frontend)

## Local Setup

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd tn-one
```

### 2. Create your `.env`
```bash
cp backend/.env.example backend/.env
```

### 3. Add your Neon `DATABASE_URL`
Create a free project at [neon.tech](https://neon.tech), copy its connection
string (it looks like
`postgresql://user:password@ep-xxxx.aws.neon.tech/dbname?sslmode=require`),
and paste it into `backend/.env` as `DATABASE_URL`.

### 4. Add Google OAuth credentials
Create an OAuth 2.0 Client ID in the
[Google Cloud Console](https://console.cloud.google.com/apis/credentials),
with an authorized redirect URI of `http://localhost:5000/api/auth/callback`.
Put the client ID/secret into `backend/.env`.

### 5. Run locally with Python
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
export FLASK_ENV=development
flask db upgrade
flask run
```
Run `python app.py`; the Flask app serves the frontend and API on `http://localhost:5000`.

### 6. Deploy to Vercel

Import this repository into Vercel, set the project root to the repository root,
and add the variables from `backend/.env.example`. Use your Supabase database
connection string as `DATABASE_URL`. Vercel uses `api/index.py` automatically.

## API Documentation

This MVP uses Flask (not FastAPI), so automatic Swagger UI isn't generated
out of the box. The full REST surface is documented below and mirrors the
original API design one-for-one:

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/auth/login` | – | Redirects to Google OAuth consent screen |
| GET | `/api/auth/callback` | – | OAuth callback; creates/updates user, starts session |
| POST | `/api/auth/logout` | – | Ends the session |
| GET | `/api/auth/status` | – | Current auth state |
| GET | `/api/users/me` | ✅ | Current user's profile |
| GET | `/api/users/me/reports` | ✅ | Current user's report history |
| GET | `/api/buses` | – | List buses |
| GET | `/api/buses/{id}` | – | Get a bus |
| POST | `/api/buses` | ✅ | Create a bus |
| GET | `/api/stops/search?q=` | – | Stop autocomplete |
| POST | `/api/stops` | ✅ | Create a stop |
| GET | `/api/routes/{id}` | – | Get a route (with ordered stops) |
| POST | `/api/routes` | ✅ | Create a route with ordered stops |
| POST | `/api/reports` | ✅ | Submit a bus report |
| GET | `/api/reports/recent` | – | Recent active reports |
| GET | `/api/search?destination=` | – | Destination-only search |
| GET | `/api/search?from=&to=` | – | From → To directional search |

If you'd like generated interactive API docs, this project can be extended
with `flask-smorest` or `apiflask` (both wrap Flask + Marshmallow/OpenAPI)
without changing the underlying route/service structure.

## Database

- **users** — Google-authenticated accounts (`google_id`, `email` unique)
- **buses** — bus identity (`bus_name`, `bus_number`, `operator`, `bus_type`)
- **stops** — physical stops, deduplicated via `normalized_name`
- **routes** / **route_stops** — ordered stop sequences per bus
- **bus_reports** — the crowdsourced core: who reported what bus, at which
  boarding stop, heading to which destination, at what `boarding_time`, and
  when the report itself was submitted (`reported_at`) — these two
  timestamps are intentionally distinct.

All foreign keys, uniqueness constraints, and the indexes called out in the
original spec (on `google_id`, `email`, `normalized_name`, `bus_number`,
`bus_name`, `route_stops.route_id/stop_id`, and every `bus_reports` lookup
column) are created in the initial Alembic migration
(`backend/migrations/versions/0001_initial.py`).

## Vercel Deployment Notes

- Vercel runs the Flask API through `api/index.py` and serves `frontend/` as
  static files using `vercel.json`.
- Use Supabase or Neon Postgres for `DATABASE_URL`; the existing SQLAlchemy
  models and Alembic migrations remain compatible.
- Set all values from `backend/.env.example` in Vercel Project Settings.
- Run `flask db upgrade` once against the hosted database before first use.

## Running Tests

```bash
cd backend
pip install -r requirements-dev.txt
pytest -v
```

The suite (32 tests) covers: user/bus/stop/route creation, route-stop
ordering and directionality, valid and invalid report submission, duplicate-
report rejection, destination and from→to search, and dedicated edge-case
coverage for the "next bus" algorithm — upcoming vs. already-passed buses,
buses far outside the lookahead window, missing `boarding_time`, midnight/
date-rollover transitions, and stale reports.

## Future Roadmap

- **Live GPS bus tracking** — riders opt in to share location while aboard; `latitude/longitude/timestamp/speed/heading` feed a `bus_locations` table designed to slot in without restructuring existing models
- **Real-time updates** via WebSockets or Server-Sent Events
- **ETA prediction** — an ML service consuming historical `bus_reports` (boarding time, day of week, route, stop) to estimate arrival windows
- **Bus reliability scores** ("12A usually arrives within ±5 minutes") built from historical report variance
- **Community verification** — 👍 Confirm / ⚠️ Report incorrect, using the `confirm_count`/`flag_count` columns already present on `bus_reports`
- **Admin dashboard** — manage buses/stops/routes, review flagged reports, view usage statistics (service-layer functions are already separated from route handlers to support this cleanly)
- **Analytics** on route coverage and reporting activity by area
