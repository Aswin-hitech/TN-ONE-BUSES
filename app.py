import os
import sys
from pathlib import Path

from flask import send_from_directory

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent
load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / "backend" / ".env")

BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("FLASK_ENV", "development")
os.environ.setdefault("DATABASE_URL", "sqlite:///tn_one_dev.db")
os.environ.setdefault("FRONTEND_ORIGIN", "http://localhost:5000")
os.environ.setdefault("GOOGLE_REDIRECT_URI", "http://localhost:5000/api/auth/callback")

from app import create_app
from app.extensions import db

app = create_app(os.environ.get("FLASK_ENV", "development"))
FRONTEND_DIR = ROOT_DIR / "frontend"


@app.route("/")
def index():
    return send_from_directory(str(FRONTEND_DIR), "index.html")


@app.route("/login.html")
def login_page():
    return send_from_directory(str(FRONTEND_DIR), "login.html")


@app.route("/register.html")
def register_page():
    return send_from_directory(str(FRONTEND_DIR), "register.html")


@app.route("/search.html")
def search_page():
    return send_from_directory(str(FRONTEND_DIR), "search.html")


@app.route("/report.html")
def report_page():
    return send_from_directory(str(FRONTEND_DIR), "report.html")


@app.route("/profile.html")
def profile_page():
    return send_from_directory(str(FRONTEND_DIR), "profile.html")


@app.route("/<path:filename>")
def frontend_files(filename):
    if filename.startswith("api/"):
        return {"success": False, "error": "Not found."}, 404

    full_path = (FRONTEND_DIR / filename).resolve()
    if FRONTEND_DIR.resolve() not in full_path.parents and full_path != FRONTEND_DIR.resolve():
        return {"success": False, "error": "Not found."}, 404

    if full_path.is_dir():
        return send_from_directory(str(FRONTEND_DIR), "index.html")

    if full_path.exists():
        return send_from_directory(str(FRONTEND_DIR), filename)

    return send_from_directory(str(FRONTEND_DIR), "index.html")


with app.app_context():
    try:
        db.create_all()
    except Exception as exc:
        app.logger.warning(
            f"Database connection or table initialization deferred: {exc}. "
            "App will continue serving and reconnect automatically on subsequent requests."
        )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
