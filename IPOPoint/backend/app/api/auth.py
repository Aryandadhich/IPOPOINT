"""Auth Blueprint — /api/auth/*"""
from flask import Blueprint, request, jsonify
from ..models.user import User
from ..utils.auth_helpers import (
    hash_password, check_password,
    make_token, require_auth,
    validate_email, validate_password,
)

auth_bp = Blueprint("auth", __name__)

_JWT_MAX_AGE = 24 * 7 * 3600  # 7 days in seconds


@auth_bp.route("/register", methods=["POST"])
def register():
    data  = request.json or {}
    name  = (data.get("name")  or "").strip()
    email = (data.get("email") or "").strip().lower()
    pwd   = data.get("password") or ""

    errors = {}
    if not name or len(name) < 2:
        errors["name"] = "Name must be at least 2 characters"
    if not validate_email(email):
        errors["email"] = "Enter a valid email address"
    pwd_errors = validate_password(pwd)
    if pwd_errors:
        errors["password"] = pwd_errors[0]
    if errors:
        return jsonify({"errors": errors}), 422

    if User.email_exists(email):
        return jsonify({"errors": {"email": "An account with this email already exists"}}), 409

    user  = User.create(name, email, hash_password(pwd))
    token = make_token(user.id, user.email)

    resp = jsonify({
        "message": "Account created successfully",
        "token":   token,
        "user":    user.to_dict(),
    })
    resp.set_cookie("auth_token", token, httponly=True, samesite="Lax", max_age=_JWT_MAX_AGE)
    return resp, 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data  = request.json or {}
    email = (data.get("email") or "").strip().lower()
    pwd   = data.get("password") or ""

    errors = {}
    if not validate_email(email):
        errors["email"] = "Enter a valid email address"
    if not pwd:
        errors["password"] = "Password is required"
    if errors:
        return jsonify({"errors": errors}), 422

    user = User.find_by_email(email)
    if not user or not check_password(pwd, user.password):
        return jsonify({"errors": {"general": "Invalid email or password"}}), 401

    token = make_token(user.id, user.email)
    resp  = jsonify({
        "message": "Logged in successfully",
        "token":   token,
        "user":    user.to_dict(),
    })
    resp.set_cookie("auth_token", token, httponly=True, samesite="Lax", max_age=_JWT_MAX_AGE)
    return resp


@auth_bp.route("/logout", methods=["POST"])
def logout():
    resp = jsonify({"message": "Logged out"})
    resp.delete_cookie("auth_token")
    return resp


@auth_bp.route("/me", methods=["GET"])
@require_auth
def me():
    user = User.find_by_id(request.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify(user.to_dict())
