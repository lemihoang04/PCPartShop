from config import get_db_connection
from mysql.connector import Error


def create_refund_request(order_item_id, user_id, reason, images=None):
    """
    Tạo yêu cầu trả hàng cho một order item.

    Kiểm tra:
    - order item tồn tại và thuộc user hiện tại
    - đơn hàng đã được giao (status = 'completed' hoặc 'delivered')
    - chưa có yêu cầu refund nào cho order item này

    Trả về dict chứa refund_id nếu thành công.
    """
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        # 1. Lấy thông tin order item, kiểm tra tồn tại & thuộc user
        cursor.execute("""
            SELECT o.id, o.order_id, o.user_id, o.price, o.quantity, o.status
            FROM `Order` o
            WHERE o.id = %s
        """, (order_item_id,))
        order_item = cursor.fetchone()

        if not order_item:
            raise ValueError("Order item not found")

        if order_item['user_id'] != user_id:
            raise PermissionError("You do not have permission to request a refund for this order")

        # 2. Kiểm tra đã giao hàng chưa (status phải là 'completed' hoặc 'delivered')
        allowed_statuses = ('completed', 'delivered')
        if order_item['status'] not in allowed_statuses:
            raise ValueError(
                f"Refund is only allowed for delivered orders. Current status: {order_item['status']}"
            )

        # 3. Kiểm tra chưa có refund nào cho order item này
        cursor.execute("""
            SELECT refund_id FROM refunds
            WHERE order_item_id = %s
              AND refund_status NOT IN ('Rejected', 'Failed')
            LIMIT 1
        """, (order_item_id,))
        existing_refund = cursor.fetchone()

        if existing_refund:
            raise ValueError("A refund request already exists for this order item")

        # 4. Tìm payment_id theo order_id
        cursor.execute("""
            SELECT payment_id FROM Payments
            WHERE order_id = %s
            LIMIT 1
        """, (order_item['order_id'],))
        payment_row = cursor.fetchone()
        payment_id = payment_row['payment_id'] if payment_row else None

        # 5. Tính refund_amount = price * quantity (giá sản phẩm)
        refund_amount = float(order_item['price']) * int(order_item['quantity'])

        # 6. Insert vào bảng refunds
        cursor.execute("""
            INSERT INTO refunds
                (order_item_id, payment_id, refund_amount, reason, images, refund_status)
            VALUES (%s, %s, %s, %s, %s, 'Pending')
        """, (
            order_item_id,
            payment_id,
            refund_amount,
            reason,
            images
        ))

        refund_id = cursor.lastrowid
        connection.commit()

        return {
            'refund_id': refund_id,
            'order_item_id': order_item_id,
            'payment_id': payment_id,
            'refund_amount': refund_amount,
            'refund_status': 'Pending'
        }

    except (ValueError, PermissionError):
        connection.rollback()
        raise
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


def get_refunds_by_user_id(user_id):
    """Lấy danh sách yêu cầu refund của user."""
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT
                r.*,
                o.order_id,
                o.product_id,
                o.quantity,
                p.title AS product_name,
                p.image AS product_image
            FROM refunds r
            JOIN `Order` o ON r.order_item_id = o.id
            JOIN Products p ON o.product_id = p.product_id
            WHERE o.user_id = %s
            ORDER BY r.created_at DESC
        """, (user_id,))
        return cursor.fetchall()
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


def get_refund_by_id(refund_id):
    """Lấy chi tiết một yêu cầu refund."""
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT
                r.*,
                o.order_id,
                o.product_id,
                o.quantity,
                o.user_id,
                p.title AS product_name,
                p.image AS product_image
            FROM refunds r
            JOIN `Order` o ON r.order_item_id = o.id
            JOIN Products p ON o.product_id = p.product_id
            WHERE r.refund_id = %s
        """, (refund_id,))
        return cursor.fetchone()
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()
