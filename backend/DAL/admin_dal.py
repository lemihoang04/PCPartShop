from config import get_db_connection
from mysql.connector import Error
from datetime import datetime, timedelta

def admin_to_json(admin_data):
    return {
        "id": admin_data['id'],
        "username": admin_data['username'],
        "created_at": admin_data['created_at'].isoformat(),
    }

def get_dashboard_stats(start_date=None, end_date=None):
    # Default to last 30 days if not provided
    if not start_date or not end_date:
        end_dt = datetime.now()
        start_dt = end_dt - timedelta(days=30)
        start_date = start_dt.strftime('%Y-%m-%d')
        end_date = end_dt.strftime('%Y-%m-%d')

    start_datetime = f"{start_date} 00:00:00"
    end_datetime = f"{end_date} 23:59:59"

    connection = get_db_connection()
    if not connection:
        return None
    cursor = connection.cursor(dictionary=True)
    try:
        # 1. Total revenue (exclude cancelled orders in date range)
        cursor.execute("""
            SELECT COALESCE(SUM(price * quantity), 0) AS total_revenue
            FROM `Order`
            WHERE status != 'cancelled'
              AND created_at >= %s AND created_at <= %s
        """, (start_datetime, end_datetime))
        total_revenue = cursor.fetchone()['total_revenue']

        # 2. Today's orders (distinct order_id)
        cursor.execute("""
            SELECT COUNT(DISTINCT order_id) AS today_orders
            FROM `Order`
            WHERE DATE(created_at) = CURDATE()
        """)
        today_orders = cursor.fetchone()['today_orders']

        # 3. Total customers
        cursor.execute("SELECT COUNT(*) AS total_customers FROM Users")
        total_customers = cursor.fetchone()['total_customers']

        # 4. Active products (in stock)
        cursor.execute("SELECT COUNT(*) AS active_products FROM Products WHERE stock > 0")
        active_products = cursor.fetchone()['active_products']

        # 5. Low stock products (stock between 1 and 5)
        cursor.execute("SELECT COUNT(*) AS low_stock FROM Products WHERE stock > 0 AND stock <= 5")
        low_stock = cursor.fetchone()['low_stock']

        # Generate complete list of dates in the range
        start_dt_obj = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_dt_obj = datetime.strptime(end_date, '%Y-%m-%d').date()
        delta = end_dt_obj - start_dt_obj
        all_dates = [(start_dt_obj + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(delta.days + 1)]

        # 6. Daily revenue for date range
        cursor.execute("""
            SELECT DATE(created_at) AS date, COALESCE(SUM(price * quantity), 0) AS revenue
            FROM `Order`
            WHERE status != 'cancelled'
              AND created_at >= %s AND created_at <= %s
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """, (start_datetime, end_datetime))
        daily_revenue_rows = cursor.fetchall()
        
        revenue_by_date = {}
        for row in daily_revenue_rows:
            d_str = row['date'].strftime('%Y-%m-%d') if hasattr(row['date'], 'strftime') else str(row['date'])
            revenue_by_date[d_str] = float(row['revenue'])
            
        daily_revenue = {
            "labels": all_dates,
            "values": [revenue_by_date.get(d, 0.0) for d in all_dates]
        }

        # 7. Daily orders for date range
        cursor.execute("""
            SELECT DATE(created_at) AS date, COUNT(DISTINCT order_id) AS order_count
            FROM `Order`
            WHERE created_at >= %s AND created_at <= %s
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """, (start_datetime, end_datetime))
        daily_orders_rows = cursor.fetchall()
        
        orders_by_date = {}
        for row in daily_orders_rows:
            d_str = row['date'].strftime('%Y-%m-%d') if hasattr(row['date'], 'strftime') else str(row['date'])
            orders_by_date[d_str] = int(row['order_count'])
            
        daily_orders = {
            "labels": all_dates,
            "values": [orders_by_date.get(d, 0) for d in all_dates]
        }

        # 8. Top 5 categories by quantity sold in date range
        cursor.execute("""
            SELECT c.category_name, COALESCE(SUM(o.quantity), 0) AS total_sold
            FROM `Order` o
            JOIN Products p ON o.product_id = p.product_id
            JOIN Categories c ON p.category_id = c.category_id
            WHERE o.status != 'cancelled'
              AND o.created_at >= %s AND o.created_at <= %s
            GROUP BY c.category_id, c.category_name
            ORDER BY total_sold DESC
            LIMIT 5
        """, (start_datetime, end_datetime))
        top_categories_rows = cursor.fetchall()
        top_categories = {
            "labels": [row['category_name'] for row in top_categories_rows],
            "values": [int(row['total_sold']) for row in top_categories_rows]
        }

        # 9. Top 10 products by quantity sold in date range
        cursor.execute("""
            SELECT p.title, COALESCE(SUM(o.quantity), 0) AS total_sold
            FROM `Order` o
            JOIN Products p ON o.product_id = p.product_id
            WHERE o.status != 'cancelled'
              AND o.created_at >= %s AND o.created_at <= %s
            GROUP BY p.product_id, p.title
            ORDER BY total_sold DESC
            LIMIT 10
        """, (start_datetime, end_datetime))
        top_products_rows = cursor.fetchall()
        top_products = {
            "labels": [row['title'] for row in top_products_rows],
            "values": [int(row['total_sold']) for row in top_products_rows]
        }

        return {
            "totalRevenue": float(total_revenue),
            "todayOrders": int(today_orders),
            "totalCustomers": int(total_customers),
            "activeProducts": int(active_products),
            "lowStockProducts": int(low_stock),
            "dailyRevenue": daily_revenue,
            "dailyOrders": daily_orders,
            "topCategories": top_categories,
            "topProducts": top_products
        }
    except Error as e:
        print(f"Error fetching dashboard stats: {e}")
        return None
    finally:
        cursor.close()
        connection.close()

def get_admin_users():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    
    cursor.execute("SELECT * FROM users")
    users = cursor.fetchall()
    
    cursor.close()
    connection.close()
    
    return users

def login_admin(username, password):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT * FROM admin WHERE username = %s AND password = %s", (username, password))
    admin = cursor.fetchone()
    cursor.close()
    connection.close()
    return admin_to_json(admin) if admin else None

def verify_admin_credentials(username, password):
    # In a real application, you would check against a database
    # This is just a simple example
    admin_users = {
        "admin": "admin123",
        "superadmin": "super123"
    }
    
    return username in admin_users and admin_users[username] == password