from config import get_db_connection
import re
import uuid


def _generate_unique_slug(cursor, base_name: str) -> str:
    """Generate a URL-safe, unique slug from a build name."""
    # Lowercase, replace spaces/special chars with hyphens
    slug = re.sub(r'[^a-z0-9]+', '-', base_name.lower()).strip('-')
    slug = slug[:80]  # Limit base slug length

    candidate = slug
    suffix = 1
    while True:
        cursor.execute("SELECT id FROM pc_builds WHERE slug = %s", (candidate,))
        if not cursor.fetchone():
            return candidate
        candidate = f"{slug}-{suffix}"
        suffix += 1


def dal_save_pc_build(user_id, build_name: str, description: str, is_public: bool, items: list):
    """
    Save a PC build to the database.

    Args:
        user_id (int | None): Authenticated user's ID. None for guest builds.
        build_name (str): Human-readable name for the build.
        description (str): Optional description.
        is_public (bool): Whether the build is publicly visible.
        items (list): List of dicts with keys: product_id, category_id, quantity.

    Returns:
        tuple: (result_dict, status_code)
    """
    if not build_name or not build_name.strip():
        return {"error": "Build name is required"}, 400

    if not items:
        return {"error": "Build must contain at least one component"}, 400

    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500

    cursor = db.cursor(dictionary=True)
    try:
        # Validate all product IDs exist
        product_ids = [item["product_id"] for item in items]
        placeholders = ", ".join(["%s"] * len(product_ids))
        cursor.execute(
            f"SELECT product_id FROM products WHERE product_id IN ({placeholders})",
            product_ids,
        )
        found_ids = {row["product_id"] for row in cursor.fetchall()}
        missing = set(product_ids) - found_ids
        if missing:
            return {"error": f"Products not found: {missing}"}, 400

        # Generate unique slug
        slug = _generate_unique_slug(cursor, build_name)

        # Insert build header
        cursor.execute(
            """
            INSERT INTO pc_builds (user_id, slug, build_name, description, is_preset, is_public)
            VALUES (%s, %s, %s, %s, FALSE, %s)
            """,
            (user_id, slug, build_name.strip(), description or None, is_public),
        )
        build_id = cursor.lastrowid

        # Insert build items
        for item in items:
            cursor.execute(
                """
                INSERT INTO pc_build_items (build_id, product_id, category_id, quantity)
                VALUES (%s, %s, %s, %s)
                """,
                (build_id, item["product_id"], item["category_id"], item.get("quantity", 1)),
            )

        db.commit()
        return {
            "message": "Build saved successfully",
            "build_id": build_id,
            "slug": slug,
        }, 200

    except Exception as e:
        db.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_get_user_builds(user_id):
    """
    Fetch all builds belonging to a user, ordered by most recent first.

    Returns:
        tuple: (list_of_builds, status_code)
    """
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500

    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT
                b.id,
                b.slug,
                b.build_name,
                b.description,
                b.is_public,
                b.created_at,
                b.updated_at,
                COUNT(i.id) AS component_count
            FROM pc_builds b
            LEFT JOIN pc_build_items i ON b.id = i.build_id
            WHERE b.user_id = %s AND b.is_preset = FALSE
            GROUP BY b.id
            ORDER BY b.created_at DESC
            """,
            (user_id,),
        )
        builds = cursor.fetchall()

        # Convert datetime to string for JSON serialization
        for build in builds:
            if build.get("created_at"):
                build["created_at"] = build["created_at"].isoformat()
            if build.get("updated_at"):
                build["updated_at"] = build["updated_at"].isoformat()

        return builds, 200

    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_get_build_by_slug(slug: str):
    """
    Fetch a single build with all its items by slug.

    Returns:
        tuple: (build_dict, status_code)
    """
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500

    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT
                b.id,
                b.slug,
                b.build_name,
                b.description,
                b.is_public,
                b.user_id,
                b.created_at,
                b.updated_at,
                u.name AS creator_name
            FROM pc_builds b
            LEFT JOIN users u ON b.user_id = u.id
            WHERE b.slug = %s
            """,
            (slug,),
        )
        build = cursor.fetchone()
        if not build:
            return {"error": "Build not found"}, 404

        # Fetch items with product details
        cursor.execute(
            """
            SELECT
                i.id AS item_id,
                i.product_id,
                i.category_id,
                i.quantity,
                p.title,
                p.stock,
                p.price,
                p.image,
                c.category_name
            FROM pc_build_items i
            JOIN products p ON i.product_id = p.product_id
            JOIN categories c ON i.category_id = c.category_id
            WHERE i.build_id = %s
            """,
            (build["id"],),
        )
        items = cursor.fetchall()

        if items:
            product_ids = [item["product_id"] for item in items]
            placeholders = ", ".join(["%s"] * len(product_ids))
            cursor.execute(
                f"""
                SELECT product_id, attribute_name, attribute_value
                FROM product_attributes
                WHERE product_id IN ({placeholders})
                """,
                product_ids,
            )
            attrs = cursor.fetchall()
            
            # Map product_id -> {attr_name: attr_val}
            attr_map = {}
            for attr in attrs:
                pid = attr["product_id"]
                if pid not in attr_map:
                    attr_map[pid] = {}
                attr_map[pid][attr["attribute_name"]] = attr["attribute_value"]
                
            for item in items:
                item["attributes"] = attr_map.get(item["product_id"], {})

        if build.get("created_at"):
            build["created_at"] = build["created_at"].isoformat()
        if build.get("updated_at"):
            build["updated_at"] = build["updated_at"].isoformat()

        build["items"] = items
        return build, 200

    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_delete_build(build_id: int, user_id: int):
    """
    Delete a build owned by the given user.

    Returns:
        tuple: (result_dict, status_code)
    """
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500

    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id FROM pc_builds WHERE id = %s AND user_id = %s",
            (build_id, user_id),
        )
        if not cursor.fetchone():
            return {"error": "Build not found or access denied"}, 404

        cursor.execute("DELETE FROM pc_builds WHERE id = %s", (build_id,))
        db.commit()
        return {"message": "Build deleted successfully"}, 200

    except Exception as e:
        db.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_get_shared_builds():
    """
    Fetch all shared (public & non-preset) builds with all their items and attributes.

    Returns:
        tuple: (list_of_builds, status_code)
    """
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500

    cursor = db.cursor(dictionary=True)
    try:
        # 1. Fetch build headers
        cursor.execute(
            """
            SELECT
                b.id,
                b.slug,
                b.build_name,
                b.description,
                b.is_public,
                b.user_id,
                u.name AS creator_name,
                b.created_at,
                b.updated_at
            FROM pc_builds b
            LEFT JOIN users u ON b.user_id = u.id
            WHERE b.is_public = TRUE AND b.is_preset = FALSE
            ORDER BY b.created_at DESC
            """
        )
        builds = cursor.fetchall()
        if not builds:
            return [], 200

        # Create maps for fast lookups
        build_ids = [b["id"] for b in builds]
        builds_map = {b["id"]: b for b in builds}
        for b in builds:
            b["items"] = []
            if b.get("created_at"):
                b["created_at"] = b["created_at"].isoformat()
            if b.get("updated_at"):
                b["updated_at"] = b["updated_at"].isoformat()

        # 2. Fetch all items for these builds
        placeholders = ", ".join(["%s"] * len(build_ids))
        cursor.execute(
            f"""
            SELECT
                i.build_id,
                i.id AS item_id,
                i.product_id,
                i.category_id,
                i.quantity,
                p.title,
                p.price,
                p.image,
                c.category_name
            FROM pc_build_items i
            JOIN products p ON i.product_id = p.product_id
            JOIN categories c ON i.category_id = c.category_id
            WHERE i.build_id IN ({placeholders})
            """,
            build_ids,
        )
        items = cursor.fetchall()

        if items:
            product_ids = list({item["product_id"] for item in items})
            product_placeholders = ", ".join(["%s"] * len(product_ids))
            
            # 3. Fetch attributes for these products
            cursor.execute(
                f"""
                SELECT product_id, attribute_name, attribute_value
                FROM product_attributes
                WHERE product_id IN ({product_placeholders})
                """,
                product_ids,
            )
            attrs = cursor.fetchall()

            # Map product_id -> {attr_name: attr_val}
            attr_map = {}
            for attr in attrs:
                pid = attr["product_id"]
                if pid not in attr_map:
                    attr_map[pid] = {}
                attr_map[pid][attr["attribute_name"]] = attr["attribute_value"]

            # Attach attributes to items, and items to builds
            for item in items:
                item["attributes"] = attr_map.get(item["product_id"], {})
                bid = item["build_id"]
                if bid in builds_map:
                    builds_map[bid]["items"].append(item)

        return builds, 200

    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()

def dal_get_build_comments(build_id):
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500

    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT c.id, c.build_id, c.user_id, c.parent_comment_id, c.content, c.created_at, u.name as user_name
            FROM pc_build_comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.build_id = %s
            ORDER BY c.created_at ASC
            """,
            (build_id,)
        )
        comments = cursor.fetchall()
        return comments, 200
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()

def dal_add_build_comment(build_id, user_id, content, parent_comment_id=None):
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500

    cursor = db.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO pc_build_comments (build_id, user_id, content, parent_comment_id)
            VALUES (%s, %s, %s, %s)
            """,
            (build_id, user_id, content, parent_comment_id)
        )
        db.commit()
        return {"message": "Comment added successfully", "comment_id": cursor.lastrowid}, 201
    except Exception as e:
        db.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()
