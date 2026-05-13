from config import get_db_connection
from mysql.connector import Error

def dal_add_to_cart(user_id, product_id, quantity):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("""
            SELECT quantity FROM cart 
            WHERE user_id = %s AND product_id = %s
        """, (user_id, product_id))
        row = cursor.fetchone()

        if row:
            new_quantity = row[0] + quantity
            cursor.execute("""
                UPDATE cart
                SET quantity = %s
                WHERE user_id = %s AND product_id = %s
            """, (new_quantity, user_id, product_id))
        else:
            cursor.execute("""
                INSERT INTO cart (user_id, product_id, quantity)
                VALUES (%s, %s, %s)
            """, (user_id, product_id, quantity))

        connection.commit()
        return True
    except Exception as e:
        connection.rollback()
        raise Exception(str(e))
    finally:
        cursor.close()
        connection.close()

def dal_get_cart(user_id):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT 
                c.cart_id,
                c.product_id,
                c.quantity,
                p.title,
                p.price,
                p.image
            FROM cart c
            JOIN products p ON c.product_id = p.product_id
            WHERE c.user_id = %s
        """, (user_id,))
        rows = cursor.fetchall()

        cart_items = []
        for row in rows:
            cart_items.append({
                'cart_id': row['cart_id'],
                'product_id': row['product_id'],
                'title': row['title'],
                'price': row['price'],
                'quantity': row['quantity'],
                'image': row['image'],
            })
        return cart_items
    except Exception as e:
        raise Exception(str(e))
    finally:
        cursor.close()
        connection.close()

def delete_cart(cart_id):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("SELECT * FROM cart WHERE cart_id = %s", (cart_id,))
        cart = cursor.fetchone()
        if not cart:
            return False
        cursor.execute("DELETE FROM cart WHERE cart_id = %s", (cart_id,))
        connection.commit()
        return True
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()

def checkOutStock(items):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    out_of_stock = []
    try:
        for item in items:
            cursor.execute("SELECT title, stock FROM products WHERE product_id = %s", (item['product_id'],))
            product = cursor.fetchone()
            if not product or product['stock'] < item['quantity']:
                out_of_stock.append({
                    'product_id': item['product_id'],
                    'title': product['title'] if product else 'Unknown product',
                    'available_stock': product['stock'] if product else 0,
                    'requested_quantity': item['quantity'],
                })
        return out_of_stock
    except Error as e:
        raise Exception(f"Database error: {str(e)}")
    finally:
        cursor.close()
        connection.close()