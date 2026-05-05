from config import get_db_connection
from mysql.connector import Error
from datetime import datetime


# ─── CRUD ────────────────────────────────────────────────────────────────────

def get_all_coupons():
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM coupons ORDER BY created_at DESC" if _has_created_at() else "SELECT * FROM coupons")
        return cursor.fetchall()
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


def _has_created_at():
    """Helper – silently checks if the coupons table has a created_at column."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SHOW COLUMNS FROM coupons LIKE 'created_at'")
        result = cur.fetchone()
        cur.close()
        conn.close()
        return result is not None
    except Exception:
        return False


def get_coupon_by_id(coupon_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM coupons WHERE id = %s", (coupon_id,))
        return cursor.fetchone()
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


def create_coupon(data):
    """
    data keys: code, discount_type ('percent'|'fixed'), discount_value,
               max_discount (nullable), min_order_value, usage_limit,
               start_date, end_date, is_active (default 1)
    """
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            INSERT INTO coupons
                (code, discount_type, discount_value, max_discount,
                 min_order_value, usage_limit, used_count, start_date, end_date, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, 0, %s, %s, %s)
        """, (
            data['code'].upper(),
            data['discount_type'],
            data['discount_value'],
            data.get('max_discount'),
            data.get('min_order_value', 0),
            data.get('usage_limit'),
            data.get('start_date'),
            data.get('end_date'),
            data.get('is_active', 1),
        ))
        connection.commit()
        return cursor.lastrowid
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


def update_coupon(coupon_id, data):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            UPDATE coupons SET
                code           = %s,
                discount_type  = %s,
                discount_value = %s,
                max_discount   = %s,
                min_order_value= %s,
                usage_limit    = %s,
                start_date     = %s,
                end_date       = %s,
                is_active      = %s
            WHERE id = %s
        """, (
            data['code'].upper(),
            data['discount_type'],
            data['discount_value'],
            data.get('max_discount'),
            data.get('min_order_value', 0),
            data.get('usage_limit'),
            data.get('start_date'),
            data.get('end_date'),
            data.get('is_active', 1),
            coupon_id,
        ))
        connection.commit()
        return cursor.rowcount
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


def delete_coupon(coupon_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor()
    try:
        cursor.execute("DELETE FROM coupons WHERE id = %s", (coupon_id,))
        connection.commit()
        return cursor.rowcount
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


# ─── VALIDATE ────────────────────────────────────────────────────────────────

def validate_coupon(code, user_id, order_amount):
    """
    Validates a coupon for a given user and order amount.
    Does NOT record usage – that happens only after successful payment.

    Returns dict:
        { valid: bool, message: str, coupon: {...}, discount_amount: float }
    """
    # Ensure order_amount is float – it may arrive as str from JSON
    order_amount = float(order_amount)

    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM coupons WHERE code = %s", (code.upper(),))
        coupon = cursor.fetchone()

        if not coupon:
            return {"valid": False, "message": "Mã giảm giá không tồn tại"}

        if not coupon['is_active']:
            return {"valid": False, "message": "Mã giảm giá đã bị vô hiệu hóa"}

        now = datetime.now()
        if coupon.get('start_date') and now < coupon['start_date']:
            return {"valid": False, "message": "Mã giảm giá chưa có hiệu lực"}

        if coupon.get('end_date') and now > coupon['end_date']:
            return {"valid": False, "message": "Mã giảm giá đã hết hạn"}

        if coupon.get('usage_limit') is not None and int(coupon['used_count']) >= int(coupon['usage_limit']):
            return {"valid": False, "message": "Mã giảm giá đã hết lượt sử dụng"}

        # Cast Decimal DB value to float before comparison
        min_order_value = float(coupon['min_order_value']) if coupon.get('min_order_value') else 0.0
        if min_order_value > 0 and order_amount < min_order_value:
            return {
                "valid": False,
                "message": f"Đơn hàng tối thiểu ${min_order_value:.2f} để áp dụng mã này"
            }

        # Check if user already used this coupon for a completed order
        cursor.execute("""
            SELECT id FROM coupon_usages
            WHERE coupon_id = %s AND user_id = %s
        """, (coupon['id'], user_id))
        existing_usage = cursor.fetchone()
        if existing_usage:
            return {"valid": False, "message": "Bạn đã sử dụng mã giảm giá này rồi"}

        # Calculate discount amount
        discount_amount = _calc_discount(coupon, order_amount)

        return {
            "valid": True,
            "message": "Áp dụng mã giảm giá thành công",
            "coupon": {
                "id": coupon['id'],
                "code": coupon['code'],
                "discount_type": coupon['discount_type'],
                "discount_value": float(coupon['discount_value']),
                "max_discount": float(coupon['max_discount']) if coupon.get('max_discount') else None,
            },
            "discount_amount": discount_amount,
        }
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


def _calc_discount(coupon, order_amount):
    """Compute the actual discount amount from a coupon row and order total."""
    if coupon['discount_type'] == 'percent':
        amount = float(order_amount) * float(coupon['discount_value']) / 100
        if coupon.get('max_discount'):
            amount = min(amount, float(coupon['max_discount']))
    else:  # fixed
        amount = float(coupon['discount_value'])

    # Never discount more than the order itself
    return min(amount, float(order_amount))


# ─── RECORD USAGE (called only after successful payment) ─────────────────────

def record_coupon_usage(coupon_id, user_id, order_id, cursor=None, connection=None):
    """
    Insert a coupon_usages row and increment used_count.
    If an external cursor/connection is provided (e.g. inside checkout transaction),
    it uses that; otherwise opens its own connection.
    """
    own_conn = cursor is None
    if own_conn:
        connection = get_db_connection()
        if not connection:
            raise Exception("Database connection failed")
        cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            INSERT INTO coupon_usages (coupon_id, user_id, order_id, used_at)
            VALUES (%s, %s, %s, %s)
        """, (coupon_id, user_id, order_id, datetime.now()))

        cursor.execute("""
            UPDATE coupons SET used_count = used_count + 1 WHERE id = %s
        """, (coupon_id,))

        if own_conn:
            connection.commit()
    except Error as e:
        if own_conn:
            connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        if own_conn:
            cursor.close()
            connection.close()
