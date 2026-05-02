import json
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
    """Get messages for a conversation ordered by created_at ASC."""
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT m.id, m.conversation_id, m.role, m.content, m.intent, m.created_at,
                   GROUP_CONCAT(mp.product_id) AS product_ids
            FROM messages m
            LEFT JOIN message_products mp ON mp.message_id = m.id
            WHERE m.conversation_id = %s
            GROUP BY m.id
            ORDER BY m.created_at ASC
            LIMIT %s
            """,
            (conversation_id, limit)
        )
        rows = cursor.fetchall()
        # Parse product_ids string → list
        for row in rows:
            if row.get("product_ids"):
                row["product_ids"] = [p for p in row["product_ids"].split(",") if p]
            else:
                row["product_ids"] = []
        return rows, 200
    except Exception as e:
        return {"error": str(e)}, 500
    finally:
        cursor.close()
        db.close()


# =====================================================
# MESSAGE_PRODUCTS
# =====================================================

def dal_save_message_products(message_id, product_ids):
    """Link product IDs to a message."""
    if not product_ids:
        return True, 200
    db = get_db_connection()
    if not db:
        return {"error": "Database connection failed"}, 500
    cursor = db.cursor()
    try:
        rows = [(message_id, pid) for pid in product_ids]
        cursor.executemany(
            "INSERT IGNORE INTO message_products (message_id, product_id) VALUES (%s, %s)",
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