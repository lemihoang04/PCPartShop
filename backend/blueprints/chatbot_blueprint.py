import json
import re

from flask import Blueprint, jsonify, request

from context.chatbot_agent import create_pc_product_agent
from DAL.product_dal import dal_get_products_by_ids_for_chatbot
from DAL.chatbot_dal import (
    dal_create_conversation,
    dal_get_conversations_by_user,
    dal_save_message,
    dal_get_messages_by_conversation,
    dal_save_message_products,
    dal_get_conversation_state,
    dal_upsert_conversation_state,
)

chatbot_blueprint = Blueprint('chatbot', __name__)

product_agent = create_pc_product_agent()


# =====================================================
# HELPERS
# =====================================================

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


def _build_history_for_llm(db_messages, max_turns=10):
    """Convert DB messages to (role, content) tuples for LangGraph."""
    history = []
    # Take last max_turns messages
    recent = db_messages[-max_turns:] if len(db_messages) > max_turns else db_messages
    for msg in recent:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "bot" or role == "assistant":
            role = "assistant"
        history.append((role, content))
    return history


# =====================================================
# CONVERSATION ENDPOINTS
# =====================================================

@chatbot_blueprint.route("/chatbot/conversations", methods=["GET"])
def get_conversations():
    """Get all conversations for a user."""
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({'success': False, 'error': 'Missing user_id'}), 400

    result, status = dal_get_conversations_by_user(user_id)
    if status != 200:
        return jsonify({'success': False, 'error': result.get('error', 'Unknown error')}), status

    # Serialize datetime fields
    conversations = []
    for conv in result:
        conversations.append({
            'id': conv['id'],
            'user_id': conv['user_id'],
            'created_at': conv['created_at'].isoformat() if conv.get('created_at') else None,
            'first_message': conv.get('first_message') or '',
        })

    return jsonify({'success': True, 'conversations': conversations})


@chatbot_blueprint.route("/chatbot/conversations", methods=["POST"])
def create_conversation():
    """Create a new conversation for a user."""
    data = request.get_json(silent=True) or {}
    user_id = data.get("user_id")
    if not user_id:
        return jsonify({'success': False, 'error': 'Missing user_id'}), 400

    result, status = dal_create_conversation(user_id)
    if status != 201:
        return jsonify({'success': False, 'error': str(result)}), status

    return jsonify({'success': True, 'conversation_id': result}), 201


@chatbot_blueprint.route("/chatbot/conversations/<int:conversation_id>/messages", methods=["GET"])
def get_conversation_messages(conversation_id):
    """Get all messages in a conversation, including full product details."""
    result, status = dal_get_messages_by_conversation(conversation_id)
    if status != 200:
        return jsonify({'success': False, 'error': result.get('error', 'Unknown error')}), status

    # Collect all product_ids from all messages, then batch-fetch in one query
    all_product_ids = []
    for msg in result:
        all_product_ids.extend(msg.get('product_ids') or [])

    # Deduplicate, preserving order
    seen = set()
    unique_ids = []
    for pid in all_product_ids:
        if pid not in seen:
            seen.add(pid)
            unique_ids.append(pid)

    products_by_id = {}
    if unique_ids:
        product_result = dal_get_products_by_ids_for_chatbot(unique_ids)
        if isinstance(product_result, tuple) and len(product_result) == 2:
            fetched, fetch_status = product_result
            if fetch_status == 200 and isinstance(fetched, list):
                for p in fetched:
                    products_by_id[str(p.get('product_id', ''))] = p

    # Build final message list with product details attached
    messages = []
    for msg in result:
        msg_product_ids = msg.get('product_ids') or []
        msg_products = [
            products_by_id[str(pid)]
            for pid in msg_product_ids
            if str(pid) in products_by_id
        ]
        messages.append({
            'id': msg['id'],
            'role': msg['role'],
            'content': msg['content'],
            'intent': msg.get('intent'),
            'product_ids': msg_product_ids,
            'products': msg_products,
            'created_at': msg['created_at'].isoformat() if msg.get('created_at') else None,
        })

    return jsonify({'success': True, 'messages': messages})


# =====================================================
# MAIN QUERY ENDPOINT (with memory)
# =====================================================

@chatbot_blueprint.route("/chatbot/query", methods=["POST"])
def chatbot_langchain_query():
    data = request.get_json(silent=True) or {}
    user_message = (data.get("query") or "").strip()
    user_id = data.get("user_id") or None
    conversation_id = data.get("conversation_id") or None

    if not user_message:
        return jsonify({
            'success': False,
            'error': 'Missing or empty "query" field in request body',
        }), 400

    try:
        # --- Step 1: Ensure conversation exists (create if needed) ---
        if user_id and not conversation_id:
            conv_id, status = dal_create_conversation(user_id)
            if status == 201:
                conversation_id = conv_id

        # --- Step 2: Load conversation history from DB ---
        history_messages = []
        current_products_context = []

        if conversation_id:
            msgs_result, msgs_status = dal_get_messages_by_conversation(conversation_id)
            if msgs_status == 200 and isinstance(msgs_result, list):
                history_messages = _build_history_for_llm(msgs_result)

            state_result, state_status = dal_get_conversation_state(conversation_id)
            if state_status == 200 and isinstance(state_result, dict):
                current_products_context = state_result.get("current_products") or []

        # --- Step 3: Save user message ---
        user_msg_id = None
        if conversation_id and user_id:
            uid, _ = dal_save_message(conversation_id, "user", user_message)
            if isinstance(uid, int):
                user_msg_id = uid

        # --- Step 4: Build input for LLM (history + optional context injection) ---
        llm_messages = list(history_messages)

        # Inject current_products context if available
        if current_products_context:
            context_text = (
                "Ngữ cảnh cuộc trò chuyện: Các sản phẩm đang được thảo luận: "
                + ", ".join(str(p) for p in current_products_context)
            )
            # Prepend as system-level context at beginning of current turn
            llm_messages.append(("user", f"[CONTEXT] {context_text}"))

        # Add current user message
        llm_messages.append(("user", user_message))

        # --- Step 5: Invoke agent ---
        agent_response = product_agent.invoke({"messages": llm_messages})

        response_content, product_ids = _extract_chatbot_payload(agent_response)

        # --- Step 6: Fetch product details ---
        products = []
        if product_ids:
            product_result = dal_get_products_by_ids_for_chatbot(product_ids)
            if isinstance(product_result, tuple) and len(product_result) == 2:
                products, status_code = product_result
                if status_code != 200:
                    products = []

        # --- Step 7: Save bot message + link products ---
        bot_msg_id = None
        if conversation_id and user_id:
            bid, _ = dal_save_message(conversation_id, "bot", response_content)
            if isinstance(bid, int):
                bot_msg_id = bid
                if product_ids:
                    dal_save_message_products(bot_msg_id, product_ids)

            # --- Step 8: Update conversation state ---
            dal_upsert_conversation_state(
                conversation_id,
                current_products=product_ids if product_ids else current_products_context,
                filters=None,
                intent=None,
            )

        return jsonify({
            'success': True,
            'conversation_id': conversation_id,
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