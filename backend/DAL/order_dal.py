from config import get_db_connection
from mysql.connector import Error

def get_all_orders():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    cursor.execute("""
        SELECT 
            o.*, 
            u.name AS user_name,
            pay.payment_method,
            pay.payment_status
        FROM `Order` o
        JOIN Users u ON o.user_id = u.id
        LEFT JOIN Payments pay ON o.order_id = pay.order_id
    """)
    orders = cursor.fetchall()
    cursor.close()
    connection.close()
    return orders

def get_order_by_id(order_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT * FROM `Order` WHERE id = %s OR order_id = %s LIMIT 1
        """, (order_id, order_id))
        order = cursor.fetchone()
        return order
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def approve_order(order_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor()
    try:
        # First try to update using the id column
        cursor.execute("""
            UPDATE `Order` SET status = %s WHERE id = %s AND status = 'pending'
        """, ('completed', order_id))
        
        # If no rows were updated, try with order_id instead
        if cursor.rowcount == 0:
            cursor.execute("""
                UPDATE `Order` SET status = %s WHERE order_id = %s AND status = 'pending'
            """, ('completed', order_id))
            
        connection.commit()
        return cursor.rowcount  
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def get_orders_by_user_id(user_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT 
                o.id,
                o.order_id,
                o.user_id,
                o.product_id,
                o.quantity,
                o.price,
                o.status,
                o.shipping_address,
                o.created_at,
                p.title,
                p.price AS product_price,
                p.image
            FROM `Order` o
            JOIN Products p ON o.product_id = p.product_id
            WHERE o.user_id = %s
            ORDER BY o.order_id DESC
        """, (user_id,))
        orders = cursor.fetchall()
        return orders
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()
        

def cancel_order(order_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor()
    try:
        # First try to update using the id column
        cursor.execute("""
            UPDATE `Order` SET status = %s WHERE id = %s
        """, ('cancelled', order_id))
        
        # If no rows were updated, try with order_id instead
        if cursor.rowcount == 0:
            cursor.execute("""
                UPDATE `Order` SET status = %s WHERE order_id = %s
            """, ('cancelled', order_id))
            
        connection.commit()
        return cursor.rowcount  
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def get_order_status_history(order_id):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT * FROM order_status_history WHERE order_id = %s ORDER BY created_at DESC
        """, (order_id,))
        history = cursor.fetchall()
        return history
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def update_order_status(order_id, next_status):
    connection = get_db_connection()
    if not connection:
        raise Exception("Database connection failed")
    cursor = connection.cursor(dictionary=True)
    try:
        # Find the order
        cursor.execute("SELECT order_id, user_id FROM `Order` WHERE id = %s OR order_id = %s LIMIT 1", (order_id, order_id))
        order = cursor.fetchone()
        if not order:
            return 0
        
        actual_order_id = order['order_id']
        user_id = order['user_id']
        
        # Update all items with this order_id
        cursor.execute("""
            UPDATE `Order` SET status = %s WHERE order_id = %s
        """, (next_status, actual_order_id))
        
        rowcount = cursor.rowcount
        
        # Insert history
        cursor.execute("""
            INSERT INTO order_status_history (order_id, user_id, status, note, changed_by)
            VALUES (%s, %s, %s, %s, %s)
        """, (actual_order_id, user_id, next_status, f'Order marked as {next_status}', 'Admin'))
            
        if next_status == 'completed':
            cursor.execute("""
                UPDATE Payments 
                SET payment_status = 'paid' 
                WHERE order_id = %s AND payment_method = 'pay_later'
            """, (actual_order_id,))

        connection.commit()
        return rowcount
    except Error as e:
        connection.rollback()
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()