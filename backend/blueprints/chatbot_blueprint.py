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
    dal_delete_conversation,
)

chatbot_blueprint = Blueprint('chatbot', __name__)

product_agent = create_pc_product_agent()


# =====================================================
# HELPERS
# =====================================================

def _extract_chatbot_payload(agent_response):
    """Extract message, product_groups, intent, and suggested_prompts from agent response.
    Returns (message, product_groups, intent, suggested_prompts)
    product_groups: list of {label, order, product_ids}
    suggested_prompts: list of strings
    """
    # Helper to flatten product_groups to a flat product_ids list
    def _groups_to_flat(groups):
        ids = []
        for g in (groups or []):
            ids.extend(g.get("product_ids") or [])
        return ids

    # Helper to convert old product_ids to product_groups
    def _ids_to_groups(product_ids):
        if not product_ids:
            return []
        return [{"label": "", "order": 1, "product_ids": list(product_ids)}]

    if isinstance(agent_response, dict):
        if 'message' in agent_response or 'product_groups' in agent_response or 'product_ids' in agent_response:
            message = str(agent_response.get('message') or agent_response.get('output') or '')
            product_groups = agent_response.get('product_groups')
            if product_groups is None:
                product_groups = _ids_to_groups(agent_response.get('product_ids') or [])
            intent = agent_response.get('intent') or None
            suggested_prompts = agent_response.get('suggested_prompts') or []
            print(suggested_prompts)
            return message, list(product_groups), intent, suggested_prompts

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
        return '', [], None, []

    normalized = raw_content
    if normalized.startswith('```'):
        normalized = re.sub(r'^```(?:json)?\s*', '', normalized, flags=re.IGNORECASE)
        normalized = re.sub(r'\s*```$', '', normalized)

    try:
        parsed = json.loads(normalized)
        if isinstance(parsed, dict):
            message = str(parsed.get('message') or parsed.get('output') or '')
            product_groups = parsed.get('product_groups')
            if product_groups is None:
                product_groups = _ids_to_groups(parsed.get('product_ids') or [])
            intent = parsed.get('intent') or None
            suggested_prompts = parsed.get('suggested_prompts') or []
            return message, list(product_groups), intent, suggested_prompts
    except Exception:
        pass

    product_ids = re.findall(r'/product-info/([^\)\s]+)', raw_content)
    product_ids = list(dict.fromkeys(product_ids))
    return raw_content, _ids_to_groups(product_ids), None, []


def _build_history_for_llm(db_messages, max_turns=6):
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


@chatbot_blueprint.route("/chatbot/conversations/<int:conversation_id>", methods=["DELETE"])
def delete_conversation(conversation_id):
    """Delete a conversation for a user."""
    user_id = request.args.get("user_id")
    if not user_id:
        return jsonify({'success': False, 'error': 'Missing user_id'}), 400

    result, status = dal_delete_conversation(conversation_id, user_id)
    if status != 200:
        return jsonify({'success': False, 'error': result.get('error', 'Unknown error')}), status

    return jsonify({'success': True})


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

        # Build product_groups with full product details
        msg_product_groups = []
        for g in (msg.get('product_groups') or []):
            group_products = [
                products_by_id[str(pid)]
                for pid in (g.get('product_ids') or [])
                if str(pid) in products_by_id
            ]
            msg_product_groups.append({
                'label': g.get('label') or '',
                'order': g.get('order') or 1,
                'products': group_products,
            })
        msg_product_groups.sort(key=lambda x: x.get('order', 1))

        messages.append({
            'id': msg['id'],
            'role': msg['role'],
            'content': msg['content'],
            'intent': msg.get('intent'),
            'product_ids': msg_product_ids,
            'products': msg_products,
            'product_groups': msg_product_groups,
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
        current_intent_context = None

        if conversation_id:
            msgs_result, msgs_status = dal_get_messages_by_conversation(conversation_id)
            if msgs_status == 200 and isinstance(msgs_result, list):
                history_messages = _build_history_for_llm(msgs_result, max_turns=6)

            state_result, state_status = dal_get_conversation_state(conversation_id)
            if state_status == 200 and isinstance(state_result, dict):
                current_products_context = state_result.get("current_products") or []
                current_intent_context = state_result.get("intent")

        # --- Step 3: Save user message ---
        user_msg_id = None
        if conversation_id and user_id:
            uid, _ = dal_save_message(conversation_id, "user", user_message)
            if isinstance(uid, int):
                user_msg_id = uid

        # --- Step 4: Build input for LLM (history + optional context injection) ---
        llm_messages = list(history_messages)

        # Inject context (products + intent) if available
        context_parts = []
        if current_products_context:
            product_titles = []
            product_result = dal_get_products_by_ids_for_chatbot(current_products_context)
            if isinstance(product_result, tuple) and len(product_result) == 2:
                fetched, status_code = product_result
                if status_code == 200 and isinstance(fetched, list):
                    product_titles = [p.get('title') for p in fetched if p.get('title')]
            
            # Fallback to ID numbers if we cannot fetch titles
            if not product_titles:
                product_titles = [str(p) for p in current_products_context]

            context_parts.append(
                "Các sản phẩm đang được thảo luận: "
                + ", ".join(product_titles)
            )
        if current_intent_context:
            context_parts.append(f"Ý định (intent) hiện tại của người dùng là: {current_intent_context}")

        if context_parts:
            context_text = "Ngữ cảnh cuộc trò chuyện: " + " | ".join(context_parts)
            # Prepend as system-level context at beginning of current turn
            llm_messages.append(("user", f"{context_text}"))

        # Add current user message
        llm_messages.append(("user", user_message))

        # --- Step 5: Invoke agent ---
        agent_response = product_agent.invoke({"messages": llm_messages})

        response_content, product_groups, intent, suggested_prompts = _extract_chatbot_payload(agent_response)

        # Flatten product_groups to get all product_ids
        all_product_ids = []
        for g in product_groups:
            all_product_ids.extend(g.get("product_ids") or [])
        all_product_ids = list(dict.fromkeys(all_product_ids))  # dedup

        # --- Step 6: Fetch product details ---
        products_by_id = {}
        if all_product_ids:
            product_result = dal_get_products_by_ids_for_chatbot(all_product_ids)
            if isinstance(product_result, tuple) and len(product_result) == 2:
                fetched, status_code = product_result
                if status_code == 200 and isinstance(fetched, list):
                    for p in fetched:
                        products_by_id[str(p.get('product_id', ''))] = p

        # Build response product_groups with full product details
        response_product_groups = []
        for g in product_groups:
            group_products = [
                products_by_id[str(pid)]
                for pid in (g.get("product_ids") or [])
                if str(pid) in products_by_id
            ]
            response_product_groups.append({
                "label": g.get("label") or "",
                "order": g.get("order") or 1,
                "products": group_products,
            })
        # Sort by order
        response_product_groups.sort(key=lambda x: x.get("order", 1))

        # Flat list for backward compat
        all_products = [products_by_id[str(pid)] for pid in all_product_ids if str(pid) in products_by_id]

        # --- Step 7: Save bot message + link products ---
        bot_msg_id = None
        if conversation_id and user_id:
            bid, _ = dal_save_message(conversation_id, "bot", response_content, intent=intent)
            if isinstance(bid, int):
                bot_msg_id = bid
                if product_groups:
                    dal_save_message_products(bot_msg_id, product_groups)

            # --- Step 8: Update conversation state ---
            dal_upsert_conversation_state(
                conversation_id,
                current_products=all_product_ids if all_product_ids else current_products_context,
                filters=None,
                intent=intent if intent else None,
            )

        return jsonify({
            'success': True,
            'conversation_id': conversation_id,
            'response': {
                'message': response_content,
                'output': response_content,
                'product_ids': all_product_ids,
                'products': all_products,
                'product_groups': response_product_groups,
                'intent': intent,
                'suggested_prompts': suggested_prompts,
                'type': 'markdown',
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Đã xảy ra lỗi khi xử lý yêu cầu. Vui lòng thử lại.',
            'detail': str(e) if __debug__ else None,
        }), 500