from flask import Blueprint, request, jsonify
from context.ai_agent import create_pc_product_agent

chatbot_blueprint = Blueprint('chatbot', __name__)

# ====================== KHỞI TẠO AGENT ======================
# Khởi tạo agent một lần khi ứng dụng chạy (tốt cho performance)
product_agent = create_pc_product_agent()

# Nếu bạn muốn mỗi user có lịch sử chat riêng → dùng thread_id động
# Hiện tại dùng "user_123" để test, sau này sẽ thay bằng user_id thực tế

@chatbot_blueprint.route("/chatbot/query", methods=["POST"])
def chatbot_langchain_query():
    try:
        data = request.get_json()
        if not data or 'query' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing "query" field in request body'
            }), 400

        user_message = data['query'].strip()
        if not user_message:
            return jsonify({
                'success': False,
                'error': 'Query cannot be empty'
            }), 400

        user_id = data.get('user_id')
        thread_id = f"user_{user_id}" if user_id else "default_user"
        config = {"configurable": {"thread_id": thread_id}}

        agent_response = product_agent.invoke(
            {"messages": [("user", user_message)]},
            config=config
        )

        if isinstance(agent_response, dict) and "messages" in agent_response:
            last_message = agent_response["messages"][-1]
            response_content = last_message.content
        else:
            response_content = str(agent_response)

        return jsonify({
            'success': True,
            'thread_id': thread_id,
            'response': {
                'output': response_content,
                'type': 'text'
            }
        })

    except Exception as e:
        print(f"❌ Chatbot Error: {str(e)}")  # Log lỗi để debug
        return jsonify({
            'success': False,
            'error': 'Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại.',
            'detail': str(e) if __debug__ else None
        }), 500