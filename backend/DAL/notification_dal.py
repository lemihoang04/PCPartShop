from config import get_db_connection
from mysql.connector import Error

def create_notification(user_id, title, content, type=None, reference_id=None):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor()
    try:
        cursor.execute("""
            INSERT INTO notifications (user_id, title, content, type, reference_id)
            VALUES (%s, %s, %s, %s, %s)
        """, (user_id, title, content, type, reference_id))
        connection.commit()
        return cursor.lastrowid
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def get_notification_by_id(notification_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM notifications WHERE id = %s", (notification_id,))
        notification = cursor.fetchone()
        return notification
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def get_notifications_by_user(user_id, limit=50, offset=0):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT * FROM notifications
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """, (user_id, limit, offset))
        notifications = cursor.fetchall()
        return notifications
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def get_unread_notifications_count(user_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT COUNT(*) AS unread_count FROM notifications 
            WHERE user_id = %s AND is_read = FALSE
        """, (user_id,))
        result = cursor.fetchone()
        return result['unread_count'] if result else 0
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def mark_notification_as_read(notification_id, user_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor()
    try:
        cursor.execute("""
            UPDATE notifications SET is_read = TRUE 
            WHERE id = %s AND user_id = %s
        """, (notification_id, user_id))
        connection.commit()
        return cursor.rowcount > 0
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def mark_all_notifications_as_read(user_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor()
    try:
        cursor.execute("""
            UPDATE notifications SET is_read = TRUE 
            WHERE user_id = %s AND is_read = FALSE
        """, (user_id,))
        connection.commit()
        return cursor.rowcount
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def delete_notification(notification_id, user_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor()
    try:
        cursor.execute("""
            DELETE FROM notifications WHERE id = %s AND user_id = %s
        """, (notification_id, user_id))
        connection.commit()
        return cursor.rowcount > 0
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def clear_all_notifications(user_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor()
    try:
        cursor.execute("""
            DELETE FROM notifications WHERE user_id = %s
        """, (user_id,))
        connection.commit()
        return cursor.rowcount
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()
