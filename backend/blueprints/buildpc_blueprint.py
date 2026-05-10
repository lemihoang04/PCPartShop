from flask import Blueprint, request, jsonify, session
from DAL.buildpc_dal import (
    dal_save_pc_build,
    dal_get_user_builds,
    dal_get_build_by_slug,
    dal_delete_build,
    dal_get_shared_builds,
    dal_get_build_comments,
    dal_add_build_comment
)

buildpc_blueprint = Blueprint("buildpc", __name__)


# ---------------------------------------------------------------------------
# GET /build/shared
# Returns all public user-created builds
# ---------------------------------------------------------------------------
@buildpc_blueprint.route("/build/shared", methods=["GET"])
def get_shared_builds():
    result, status = dal_get_shared_builds()
    return jsonify(result), status



# ---------------------------------------------------------------------------
# POST /build/save
# Body: { build_name, description, is_public, items: [{product_id, category_id, quantity}] }
# ---------------------------------------------------------------------------
@buildpc_blueprint.route("/build/save", methods=["POST"])
def save_build():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON body"}), 400

    # User can be authenticated or guest (user_id = None)
    user_id = session.get("user_id") or data.get("user_id") or None

    build_name = data.get("build_name", "").strip()
    description = data.get("description", "")
    is_public = bool(data.get("is_public", True))
    items = data.get("items", [])

    if not build_name:
        return jsonify({"error": "Build name is required"}), 400

    if not items:
        return jsonify({"error": "No components provided"}), 400

    # Validate item structure
    for item in items:
        if "product_id" not in item or "category_id" not in item:
            return jsonify({"error": "Each item must have product_id and category_id"}), 400

    result, status = dal_save_pc_build(user_id, build_name, description, is_public, items)
    return jsonify(result), status


# ---------------------------------------------------------------------------
# GET /build/history
# Returns builds for the currently logged-in user
# ---------------------------------------------------------------------------
@buildpc_blueprint.route("/build/history", methods=["GET"])
def get_build_history():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Authentication required"}), 401

    result, status = dal_get_user_builds(user_id)
    return jsonify(result), status


# ---------------------------------------------------------------------------
# GET /build/<slug>
# Returns a single build with its items (public or owned)
# ---------------------------------------------------------------------------
@buildpc_blueprint.route("/build/<string:slug>", methods=["GET"])
def get_build(slug):
    result, status = dal_get_build_by_slug(slug)
    if status != 200:
        return jsonify(result), status

    build = result
    # If build is not public, only the owner can view it
    if not build.get("is_public"):
        user_id = session.get("user_id")
        if not user_id or user_id != build.get("user_id"):
            return jsonify({"error": "Access denied"}), 403

    return jsonify(build), 200


# ---------------------------------------------------------------------------
# DELETE /build/<int:build_id>
# Deletes a build owned by the current user
# ---------------------------------------------------------------------------
@buildpc_blueprint.route("/build/<int:build_id>", methods=["DELETE"])
def delete_build(build_id):
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Authentication required"}), 401

    result, status = dal_delete_build(build_id, user_id)
    return jsonify(result), status

# ---------------------------------------------------------------------------
# GET /build/<int:build_id>/comments
# Returns comments for a build
# ---------------------------------------------------------------------------
@buildpc_blueprint.route("/build/<int:build_id>/comments", methods=["GET"])
def get_build_comments(build_id):
    result, status = dal_get_build_comments(build_id)
    return jsonify(result), status

# ---------------------------------------------------------------------------
# POST /build/<int:build_id>/comments
# Adds a comment to a build
# ---------------------------------------------------------------------------
@buildpc_blueprint.route("/build/<int:build_id>/comments", methods=["POST"])
def add_build_comment(build_id):
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Authentication required"}), 401
    
    data = request.get_json()
    content = data.get("content", "").strip()
    parent_comment_id = data.get("parent_comment_id")

    if not content:
        return jsonify({"error": "Comment content cannot be empty"}), 400

    result, status = dal_add_build_comment(build_id, user_id, content, parent_comment_id)
    return jsonify(result), status

