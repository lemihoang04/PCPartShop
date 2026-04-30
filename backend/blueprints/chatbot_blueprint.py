import json
import re

from flask import Blueprint, jsonify, request

from context.chatbot_agent import create_pc_product_agent
from DAL.product_dal import dal_get_products_by_ids_for_chatbot

chatbot_blueprint = Blueprint('chatbot', __name__)

product_agent = create_pc_product_agent()


def _extract_chatbot_payload(agent_response):
    if isinstance(agent_response, dict):
        if 'message' in agent_response or 'product_ids' in agent_response:
            message = str(agent_response.get('message') or agent_response.get('output') or '')
            product_ids = agent_response.get('product_ids') or []
            return message, list(product_ids)

    if isinstance(agent_response, str):
        raw_content = agent_response.strip()
    else:
        last_message = None
        if isinstance(agent_response, dict) and 'messages' in agent_response:
            messages = agent_response.get('messages') or []
            last_message = messages[-1] if messages else None
        else:
            last_message = agent_response

        raw_content = getattr(last_message, 'content', str(last_message) if last_message is not None else '').strip()

    if not raw_content:
        return '', []

    normalized = raw_content
    if normalized.startswith('```'):
        normalized = re.sub(r'^```(?:json)?\s*', '', normalized, flags=re.IGNORECASE)
        normalized = re.sub(r'\s*```$', '', normalized)

    try:
        parsed = json.loads(normalized)
        if isinstance(parsed, dict):
            message = str(parsed.get('message') or parsed.get('output') or '')
            product_ids = parsed.get('product_ids') or []
            return message, list(product_ids)
    except Exception:
        pass

    product_ids = re.findall(r'/product-info/([^\)\s]+)', raw_content)
    product_ids = list(dict.fromkeys(product_ids))
    return raw_content, product_ids


@chatbot_blueprint.route("/chatbot/query", methods=["POST"])
def chatbot_langchain_query():
    data = request.get_json(silent=True) or {}
    user_message = (data.get("query") or "").strip()

    if not user_message:
        return jsonify({
            'success': False,
            'error': 'Missing or empty "query" field in request body',
        }), 400

    try:
        agent_response = product_agent.invoke({"messages": [("user", user_message)]})

        response_content, product_ids = _extract_chatbot_payload(agent_response)

        products = []
        if product_ids:
            product_result = dal_get_products_by_ids_for_chatbot(product_ids)
            if isinstance(product_result, tuple) and len(product_result) == 2:
                products, status_code = product_result
                if status_code != 200:
                    products = []

        return jsonify({
            'success': True,
            'response': {
                'message': response_content,
                'output': response_content,
                'product_ids': product_ids,
                'products': products,
                'type': 'markdown',
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại.',
            'detail': str(e) if __debug__ else None,
        }), 500