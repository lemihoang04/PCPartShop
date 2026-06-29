from config import get_db_connection
from mysql.connector import Error


def create_return_request(order_item_id, user_id, request_type, reason, images=None):
    """
    Tạo yêu cầu trả hàng / đổi hàng cho một order item.

    Params:
        order_item_id : INT  – orders.id
        user_id       : INT  – user đang đăng nhập
        request_type  : str  – 'REFUND' | 'EXCHANGE'
        reason        : str
        images        : str | None – URLs ngăn cách bởi ';'

    Kiểm tra:
        1. order item tồn tại và thuộc user hiện tại
        2. đơn hàng đã được giao (status = 'completed' | 'delivered')
        3. chưa có yêu cầu return nào đang hoạt động cho order item này

    Trả về dict chứa request_id nếu thành công.
    """
    request_type = request_type.upper()
    if request_type not in ('REFUND', 'EXCHANGE'):
        raise ValueError("request_type must be 'REFUND' or 'EXCHANGE'")

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
            raise PermissionError("You do not have permission to request a return for this order")

        # 2. Kiểm tra đã giao hàng chưa
        allowed_statuses = ('completed', 'delivered')
        if order_item['status'] not in allowed_statuses:
            raise ValueError(
                f"Return is only allowed for delivered orders. Current status: {order_item['status']}"
            )

        # 3. Kiểm tra chưa có return request nào đang hoạt động cho order item này
        cursor.execute("""
            SELECT request_id FROM return_requests
            WHERE order_item_id = %s
              AND status NOT IN ('REJECTED', 'FAILED')
            LIMIT 1
        """, (order_item_id,))
        existing = cursor.fetchone()

        if existing:
            raise ValueError("A return request already exists for this order item")

        # 4. Tìm payment_id theo order_id (NULL nếu COD)
        cursor.execute("""
            SELECT payment_id FROM Payments
            WHERE order_id = %s
            LIMIT 1
        """, (order_item['order_id'],))
        payment_row = cursor.fetchone()
        payment_id = payment_row['payment_id'] if payment_row else None

        # 5. Tính refund_amount chỉ khi là REFUND; EXCHANGE để NULL
        refund_amount = None
        if request_type == 'REFUND':
            refund_amount = float(order_item['price']) * int(order_item['quantity'])

        # 6. Insert vào bảng return_requests
        cursor.execute("""
            INSERT INTO return_requests
                (order_item_id, payment_id, request_type, refund_amount, reason, images, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'PENDING')
        """, (
            order_item_id,
            payment_id,
            request_type,
            refund_amount,
            reason,
            images
        ))

        request_id = cursor.lastrowid
        connection.commit()

        return {
            'request_id': request_id,
            'order_item_id': order_item_id,
            'payment_id': payment_id,
            'request_type': request_type,
            'refund_amount': refund_amount,
            'status': 'PENDING'
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


def get_return_requests_by_user(user_id):
    """Lấy danh sách return requests của user."""
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT
                rr.*,
                o.order_id,
                o.product_id,
                o.quantity,
                p.title  AS product_name,
                p.image  AS product_image
            FROM return_requests rr
            JOIN `Order` o ON rr.order_item_id = o.id
            JOIN Products p ON o.product_id = p.product_id
            WHERE o.user_id = %s
            ORDER BY rr.created_at DESC
        """, (user_id,))
        return cursor.fetchall()
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


def get_return_request_by_id(request_id):
    """Lấy chi tiết một return request."""
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT
                rr.*,
                o.order_id,
                o.product_id,
                o.quantity,
                o.user_id,
                p.title  AS product_name,
                p.image  AS product_image
            FROM return_requests rr
            JOIN `Order` o ON rr.order_item_id = o.id
            JOIN Products p ON o.product_id = p.product_id
            WHERE rr.request_id = %s
        """, (request_id,))
        return cursor.fetchone()
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


def cancel_return_request(request_id):
    """Huỷ return request — chỉ cho phép khi status = 'PENDING'."""
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor()
    try:
        cursor.execute("""
            UPDATE return_requests
            SET status = 'REJECTED'
            WHERE request_id = %s AND status = 'PENDING'
        """, (request_id,))
        connection.commit()
        return cursor.rowcount   # 1 nếu cancel thành công, 0 nếu không phải PENDING
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


def get_all_return_requests():
    """Admin: lấy toàn bộ return requests kèm thông tin sản phẩm, user, payment."""
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT
                rr.*,
                o.order_id,
                o.product_id,
                o.quantity,
                o.user_id,
                u.name  AS user_name,
                p.title AS product_name,
                p.image AS product_image,
                pay.payment_method,
                pay.payment_intent
            FROM return_requests rr
            JOIN `Order` o   ON rr.order_item_id = o.id
            JOIN Users u     ON o.user_id = u.id
            JOIN Products p  ON o.product_id = p.product_id
            LEFT JOIN Payments pay ON rr.payment_id = pay.payment_id
            ORDER BY rr.created_at DESC
        """)
        return cursor.fetchall()
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()


# Valid next-status transitions
EXCHANGE_FLOW = {
    'PENDING':   'APPROVED',
    'APPROVED':  'RECEIVED',
    'RECEIVED':  'SHIPPING',
    'SHIPPING':  'COMPLETED',
}
REFUND_FLOW = {
    'PENDING':   'APPROVED',
    'APPROVED':  'RECEIVED',
    'RECEIVED':  'COMPLETED',
}


def update_return_request_status(request_id, new_status, admin_note=None,
                                  stripe_client=None):
    """
    Admin: cập nhật trạng thái return request.
    Nếu new_status = COMPLETED và request_type = REFUND và payment_method = online_payment:
      → gọi Stripe refund trước khi commit.
    stripe_client: instance stripe.StripeClient (truyền từ blueprint).
    """
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        # Lấy thông tin request hiện tại
        cursor.execute("""
            SELECT rr.*, pay.payment_method, pay.payment_intent
            FROM return_requests rr
            LEFT JOIN Payments pay ON rr.payment_id = pay.payment_id
            WHERE rr.request_id = %s
        """, (request_id,))
        rr = cursor.fetchone()

        if not rr:
            raise ValueError("Return request not found")

        current_status = rr['status']
        req_type = rr['request_type']   # 'REFUND' | 'EXCHANGE'

        # Validate flow
        if new_status == 'REJECTED':
            if current_status != 'PENDING':
                raise ValueError("Can only reject a PENDING request")
        else:
            flow = REFUND_FLOW if req_type == 'REFUND' else EXCHANGE_FLOW
            expected_next = flow.get(current_status)
            if expected_next != new_status:
                raise ValueError(
                    f"Invalid transition for {req_type}: {current_status} → {new_status}. "
                    f"Expected next: {expected_next}"
                )

        stripe_refund_id = None

        # Stripe refund nếu REFUND + online_payment + COMPLETED
        if (new_status == 'COMPLETED'
                and req_type == 'REFUND'
                and rr.get('payment_method') == 'online_payment'):

            payment_intent = rr.get('payment_intent')
            if not payment_intent:
                raise ValueError("Cannot refund: payment_intent not found in payment record")

            if stripe_client is None:
                raise ValueError("Stripe client not provided")

            try:
                # Lấy PaymentIntent từ Stripe để biết số tiền thực tế đã charge (đơn vị: cents)
                pi = stripe_client.v1.payment_intents.retrieve(payment_intent)
                charge_amount_cents = pi.amount_received

                # Tính số tiền refund (round để tránh sai số khi nhân float với 100)
                refund_amount_cents = int(round(float(rr['refund_amount']) * 100))

                # Đảm bảo số tiền refund không vượt quá số tiền đã charge thực tế
                # (để xử lý các order cũ bị làm tròn số tiền charge)
                final_refund_cents = min(refund_amount_cents, charge_amount_cents)

                refund_obj = stripe_client.v1.refunds.create(params={
                    "payment_intent": payment_intent,
                    "amount": final_refund_cents,
                })
                stripe_refund_id = refund_obj.id
            except Exception as e:
                raise Exception(f"Stripe refund failed: {str(e)}")

        # Update DB
        cursor.execute("""
            UPDATE return_requests
            SET status = %s,
                admin_note = COALESCE(%s, admin_note),
                stripe_refund_id = COALESCE(%s, stripe_refund_id)
            WHERE request_id = %s
        """, (new_status, admin_note, stripe_refund_id, request_id))

        connection.commit()
        return cursor.rowcount

    except (ValueError, Exception):
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()
