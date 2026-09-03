import os
from flask import Flask
from flask_cors import CORS
from .config import config_map
from .extensions import db_init
from .api.auth import auth_bp
from .api.ipos import ipos_bp
from .api.live import live_bp


def create_app(env: str = None) -> Flask:
    """Flask application factory."""
    env = env or os.environ.get("FLASK_ENV", "production")
    cfg = config_map.get(env, config_map["production"])

    app = Flask(
        __name__,
        static_folder=os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "static"),
        static_url_path="/static",
        template_folder=os.path.join(os.path.dirname(__file__), "..", "..", "frontend"),
    )
    app.config.from_object(cfg)

    # Allow React dev server (port 3000) to call the API
    CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000", "http://127.0.0.1:3000"]}})

    # Initialise DB (creates tables if missing)
    db_init(app)

    # Register Blueprints
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(ipos_bp, url_prefix="/api")
    app.register_blueprint(live_bp, url_prefix="/api")

    # Page routes — serve frontend HTML files
    @app.route("/")
    def index():
        from flask import send_from_directory
        return send_from_directory(app.template_folder, "index.html")

    @app.route("/login")
    def login_page():
        from flask import send_from_directory
        return send_from_directory(app.template_folder, "login.html")

    @app.route("/register")
    def register_page():
        from flask import send_from_directory
        return send_from_directory(app.template_folder, "register.html")

    @app.route("/tracker")
    def tracker_page():
        from flask import send_from_directory
        return send_from_directory(app.template_folder, "tracker.html")

    # Security headers
    @app.after_request
    def set_security_headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["X-XSS-Protection"] = "1; mode=block"
        resp.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if not app.debug:
            resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return resp

    return app
