import json
import difflib
from config import get_db_connection


# =====================================================
# CONVERSATIONS
# =====================================================

def dal_create_conversation(user_id):
    """Create a new conversation for a user. Returns conversation_id."""
    db = get_db_connection()
    if not db:
        return None, 500
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "INSERT INTO conversations (user_id) VALUES (%s)",
            (user_id,)
        )
        db.commit()
        conversation_id = cursor.lastrowid
        return conversation_id, 201
    except Exception as e:
        db.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_get_conversations_by_user(user_id):
    """Get all conversations for a user, ordered by newest first."""
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT c.id, c.user_id, c.created_at,
                   (SELECT m.content FROM messages m
                    WHERE m.conversation_id = c.id
                    ORDER BY m.created_at ASC LIMIT 1) AS first_message
            FROM conversations c
            WHERE c.user_id = %s
            ORDER BY c.created_at DESC
            """,
            (user_id,)
        )
        rows = cursor.fetchall()
        return rows, 200
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()

def dal_delete_conversation(conversation_id, user_id):
    """Delete a conversation and its related data."""
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor()
    try:
        # Check if conversation belongs to user
        cursor.execute("SELECT id FROM conversations WHERE id = %s AND user_id = %s", (conversation_id, user_id))
        if not cursor.fetchone():
            return {"error": "Conversation not found or unauthorized"}, 404
            
        # Delete related conversation state
        cursor.execute("DELETE FROM conversation_state WHERE conversation_id = %s", (conversation_id,))
        
        # Delete message products via JOIN
        cursor.execute("""
            DELETE mp FROM message_products mp
            INNER JOIN messages m ON mp.message_id = m.id
            WHERE m.conversation_id = %s
        """, (conversation_id,))
        
        # Delete messages
        cursor.execute("DELETE FROM messages WHERE conversation_id = %s", (conversation_id,))
        
        # Delete the conversation itself
        cursor.execute("DELETE FROM conversations WHERE id = %s", (conversation_id,))
        
        db.commit()
        return True, 200
    except Exception as e:
        db.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


# =====================================================
# MESSAGES
# =====================================================

def dal_save_message(conversation_id, role, content, intent=None):
    """Save a single message. Returns message_id."""
    db = get_db_connection()
    if not db:
        return None, 500
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            INSERT INTO messages (conversation_id, role, content, intent)
            VALUES (%s, %s, %s, %s)
            """,
            (conversation_id, role, content, intent)
        )
        db.commit()
        message_id = cursor.lastrowid
        return message_id, 201
    except Exception as e:
        db.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_get_messages_by_conversation(conversation_id, limit=50):
    """Get messages for a conversation ordered by created_at ASC.
    Returns product_groups: list of {label, order, product_ids} per message.
    """
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor(dictionary=True)
    try:
        # Fetch messages
        cursor.execute(
            """
            SELECT m.id, m.conversation_id, m.role, m.content, m.intent, m.created_at
            FROM messages m
            WHERE m.conversation_id = %s
            ORDER BY m.created_at ASC
            LIMIT %s
            """,
            (conversation_id, limit)
        )
        rows = cursor.fetchall()
        msg_ids = [r["id"] for r in rows]

        # Fetch all message_products for these messages in one query
        products_map = {}  # message_id -> list of {product_id, group_label, group_order}
        if msg_ids:
            placeholders = ",".join(["%s"] * len(msg_ids))
            cursor.execute(
                f"""
                SELECT message_id, product_id, group_label, group_order
                FROM message_products
                WHERE message_id IN ({placeholders})
                ORDER BY group_order ASC, id ASC
                """,
                tuple(msg_ids)
            )
            for mp in cursor.fetchall():
                mid = mp["message_id"]
                if mid not in products_map:
                    products_map[mid] = []
                products_map[mid].append(mp)

        # Build product_groups for each message
        for row in rows:
            mp_rows = products_map.get(row["id"], [])
            # Group by (group_label, group_order)
            groups_dict = {}  # (label, order) -> [product_ids]
            flat_ids = []
            for mp in mp_rows:
                label = mp.get("group_label") or ""
                order = mp.get("group_order") or 1
                key = (label, order)
                if key not in groups_dict:
                    groups_dict[key] = []
                groups_dict[key].append(str(mp["product_id"]))
                flat_ids.append(str(mp["product_id"]))

            if groups_dict:
                product_groups = [
                    {"label": k[0], "order": k[1], "product_ids": v}
                    for k, v in sorted(groups_dict.items(), key=lambda x: x[0][1])
                ]
            else:
                product_groups = []

            row["product_groups"] = product_groups
            row["product_ids"] = flat_ids  # backward compat

        return rows, 200
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


# =====================================================
# MESSAGE_PRODUCTS
# =====================================================

def dal_save_message_products(message_id, product_groups):
    """Link product IDs to a message, organized by groups.
    product_groups: list of {label, order, product_ids}
    """
    if not product_groups:
        return True, 200
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor()
    try:
        rows = []
        for group in product_groups:
            label = group.get("label") or None
            order = group.get("order") or None
            for pid in (group.get("product_ids") or []):
                rows.append((message_id, pid, label, order))
        if not rows:
            return True, 200
        cursor.executemany(
            "INSERT IGNORE INTO message_products (message_id, product_id, group_label, group_order) VALUES (%s, %s, %s, %s)",
            rows
        )
        db.commit()
        return True, 200
    except Exception as e:
        db.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


# =====================================================
# CONVERSATION_STATE
# =====================================================

def dal_get_conversation_state(conversation_id):
    """Get the latest state for a conversation."""
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM conversation_state WHERE conversation_id = %s",
            (conversation_id,)
        )
        row = cursor.fetchone()
        if row:
            # Parse JSON fields
            if isinstance(row.get("current_products"), str):
                try:
                    row["current_products"] = json.loads(row["current_products"])
                except Exception:
                    row["current_products"] = []
            if isinstance(row.get("filters"), str):
                try:
                    row["filters"] = json.loads(row["filters"])
                except Exception:
                    row["filters"] = {}
        return row, 200
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_upsert_conversation_state(conversation_id, current_products=None, filters=None, intent=None):
    """Insert or update conversation state."""
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor()
    try:
        current_products_json = json.dumps(current_products or [], ensure_ascii=False)
        filters_json = json.dumps(filters or {}, ensure_ascii=False)
        cursor.execute(
            """
            INSERT INTO conversation_state (conversation_id, current_products, filters, intent)
            VALUES (%s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                current_products = VALUES(current_products),
                filters = VALUES(filters),
                intent = VALUES(intent),
                updated_at = CURRENT_TIMESTAMP
            """,
            (conversation_id, current_products_json, filters_json, intent)
        )
        db.commit()
        return True, 200
    except Exception as e:
        db.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


# =====================================================
# LEGACY (kept for compatibility)
# =====================================================

def log_chatbot_interaction(user_id, query, response):
    """Log chatbot interactions for future training and analysis"""
    pass


# =====================================================
# SHOP FAQ
# =====================================================

def dal_get_faq_by_id(faq_id):
    """Retrieve answer from shop_faq table in MySQL by faq_id."""
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT faq_id, question, answer, category FROM shop_faq WHERE faq_id = %s",
            (faq_id,)
        )
        row = cursor.fetchone()
        if row:
            return row, 200
        else:
            return {"error": "FAQ not found"}, 404
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_get_all_faqs():
    """Retrieve all FAQs from shop_faq table."""
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT faq_id, question, answer, category FROM shop_faq ORDER BY faq_id ASC")
        rows = cursor.fetchall()
        return rows, 200
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_create_faq(question, answer, category=None):
    """Insert a new FAQ into shop_faq table. Returns new faq_id."""
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor()
    try:
        cursor.execute(
            "INSERT INTO shop_faq (question, answer, category) VALUES (%s, %s, %s)",
            (question, answer, category)
        )
        db.commit()
        return cursor.lastrowid, 201
    except Exception as e:
        db.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_update_faq(faq_id, question, answer, category=None):
    """Update an existing FAQ."""
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor()
    try:
        cursor.execute(
            "UPDATE shop_faq SET question = %s, answer = %s, category = %s WHERE faq_id = %s",
            (question, answer, category, faq_id)
        )
        db.commit()
        if cursor.rowcount == 0:
            return {"error": "FAQ not found"}, 404
        return True, 200
    except Exception as e:
        db.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_delete_faq(faq_id):
    """Delete an FAQ by faq_id."""
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor()
    try:
        cursor.execute("DELETE FROM shop_faq WHERE faq_id = %s", (faq_id,))
        db.commit()
        if cursor.rowcount == 0:
            return {"error": "FAQ not found"}, 404
        return True, 200
    except Exception as e:
        db.rollback()
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


# =====================================================
# GAME PROFILES & TIERS
# =====================================================

def dal_fuzzy_search_game_profile(game_name: str):
    """Fuzzy search game_profiles table by game_name.
    Returns (row_dict, status_code). row_dict has: id, game_name, tier, ram_gb, storage_gb.
    """
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, game_name, tier, ram_gb, storage_gb FROM game_profiles")
        rows = cursor.fetchall()
        if not rows:
            return {"error": "No game profiles found"}, 404

        query_lower = game_name.strip().lower()

        # 1. Exact match first
        for row in rows:
            if row["game_name"].strip().lower() == query_lower:
                return row, 200

        # 2. Fuzzy match using SequenceMatcher
        best_row = None
        best_score = 0.0
        for row in rows:
            name_lower = row["game_name"].strip().lower()
            score = difflib.SequenceMatcher(None, query_lower, name_lower).ratio()
            # Also check if query is a substring
            if query_lower in name_lower or name_lower in query_lower:
                score = max(score, 0.75)
            if score > best_score:
                best_score = score
                best_row = row

        if best_row and best_score >= 0.45:
            print(f"[game_profile] Fuzzy matched '{game_name}' -> '{best_row['game_name']}' (score={best_score:.2f})")
            return best_row, 200
        else:
            return {"error": f"Game '{game_name}' not found (best score={best_score:.2f})"}, 404
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_get_game_tier_requirements(tier: int, resolution: str, target_setting: str, target_fps: int):
    """Lookup min_cpu_score and min_gpu_score from game_tiers table.
    Falls back to nearest target_fps (<= requested) if exact match not found.
    Returns (row_dict, status_code). row_dict has: min_cpu_score, min_gpu_score.
    """
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor(dictionary=True)
    try:
        # Exact match
        cursor.execute(
            """
            SELECT min_cpu_score, min_gpu_score
            FROM game_tiers
            WHERE tier = %s AND resolution = %s AND target_setting = %s AND target_fps = %s
            LIMIT 1
            """,
            (tier, resolution, target_setting, target_fps)
        )
        row = cursor.fetchone()
        if row:
            return row, 200

        # Fallback: nearest fps <= requested
        cursor.execute(
            """
            SELECT min_cpu_score, min_gpu_score, target_fps
            FROM game_tiers
            WHERE tier = %s AND resolution = %s AND target_setting = %s AND target_fps <= %s
            ORDER BY target_fps DESC
            LIMIT 1
            """,
            (tier, resolution, target_setting, target_fps)
        )
        row = cursor.fetchone()
        if row:
            print(f"[game_tiers] Fallback fps: requested {target_fps}, found {row['target_fps']}")
            return row, 200

        # Fallback: same tier + resolution, any setting/fps
        cursor.execute(
            """
            SELECT min_cpu_score, min_gpu_score
            FROM game_tiers
            WHERE tier = %s AND resolution = %s
            ORDER BY target_fps DESC
            LIMIT 1
            """,
            (tier, resolution)
        )
        row = cursor.fetchone()
        if row:
            print(f"[game_tiers] Broad fallback for tier={tier}, resolution={resolution}")
            return row, 200

        return {"error": f"No tier requirements found for tier={tier}, resolution={resolution}, setting={target_setting}, fps={target_fps}"}, 404
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


# =====================================================
# SOFTWARE PROFILES & TIERS
# =====================================================

def dal_fuzzy_search_software_profile(software_name: str):
    """Fuzzy search software_profiles table by software_name.
    Returns (row_dict, status_code). row_dict has: id, software_name, tier, ram_gb, storage_gb.
    """
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, software_name, tier, ram_gb, storage_gb FROM software_profiles")
        rows = cursor.fetchall()
        if not rows:
            return {"error": "No software profiles found"}, 404

        query_lower = software_name.strip().lower()

        # 1. Exact match first
        for row in rows:
            if row["software_name"].strip().lower() == query_lower:
                return row, 200

        # 2. Fuzzy match using SequenceMatcher
        best_row = None
        best_score = 0.0
        for row in rows:
            name_lower = row["software_name"].strip().lower()
            score = difflib.SequenceMatcher(None, query_lower, name_lower).ratio()
            # Also check if query is a substring
            if query_lower in name_lower or name_lower in query_lower:
                score = max(score, 0.75)
            if score > best_score:
                best_score = score
                best_row = row

        if best_row and best_score >= 0.45:
            print(f"[software_profile] Fuzzy matched '{software_name}' -> '{best_row['software_name']}' (score={best_score:.2f})")
            return best_row, 200
        else:
            return {"error": f"Software '{software_name}' not found (best score={best_score:.2f})"}, 404
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


def dal_get_software_tier_requirements(tier: int, workload_scale: str):
    """Lookup min_cpu and min_gpu from software_tiers table.
    Returns (row_dict, status_code). row_dict has: min_cpu, min_gpu.
    """
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor(dictionary=True)
    try:
        # Exact match
        cursor.execute(
            """
            SELECT min_cpu, min_gpu
            FROM software_tiers
            WHERE tier = %s AND workload_scale = %s
            LIMIT 1
            """,
            (tier, workload_scale)
        )
        row = cursor.fetchone()
        if row:
            return row, 200

        # Fallback: same tier, any workload scale (usually Intermediate)
        cursor.execute(
            """
            SELECT min_cpu, min_gpu
            FROM software_tiers
            WHERE tier = %s
            ORDER BY FIELD(workload_scale, 'Intermediate', 'Professional', 'Basic')
            LIMIT 1
            """,
            (tier,)
        )
        row = cursor.fetchone()
        if row:
            print(f"[software_tiers] Fallback workload_scale for tier={tier}")
            return row, 200

        return {"error": f"No tier requirements found for tier={tier}, workload_scale={workload_scale}"}, 404
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()