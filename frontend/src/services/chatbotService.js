import axios from '../setup/axios';

// =====================================================
// SEND QUERY (with conversation memory)
// =====================================================

/**
 * Send a chat message, optionally tied to a conversation.
 * @param {string} query
 * @param {number|null} userId
 * @param {number|null} conversationId - existing conversation ID, or null to create new
 */
const sendChatbotQuery = async (query, userId = null, conversationId = null) => {
    try {
        const response = await axios.post('/chatbot/query', {
            query,
            user_id: userId,
            conversation_id: conversationId,
        });
        return response;
    } catch (error) {
        console.error('Error sending chatbot query:', error);
        return {
            success: false,
            error: true,
            message: 'Failed to get response from chatbot'
        };
    }
};

// =====================================================
// CONVERSATIONS
// =====================================================

/**
 * Fetch all conversations for a logged-in user.
 * @param {number} userId
 */
const getConversations = async (userId) => {
    try {
        const response = await axios.get('/chatbot/conversations', {
            params: { user_id: userId },
        });
        return response;
    } catch (error) {
        console.error('Error fetching conversations:', error);
        return { success: false, conversations: [] };
    }
};

/**
 * Create a new conversation for a user.
 * @param {number} userId
 */
const createConversation = async (userId) => {
    try {
        const response = await axios.post('/chatbot/conversations', {
            user_id: userId,
        });
        return response;
    } catch (error) {
        console.error('Error creating conversation:', error);
        return { success: false };
    }
};

// =====================================================
// MESSAGES
// =====================================================

/**
 * Load messages for a specific conversation.
 * @param {number} conversationId
 */
const getConversationMessages = async (conversationId) => {
    try {
        const response = await axios.get(`/chatbot/conversations/${conversationId}/messages`);
        return response;
    } catch (error) {
        console.error('Error fetching conversation messages:', error);
        return { success: false, messages: [] };
    }
};

/**
 * Delete a conversation.
 * @param {number} conversationId
 * @param {number} userId
 */
const deleteConversation = async (conversationId, userId) => {
    try {
        const response = await axios.delete(`/chatbot/conversations/${conversationId}`, {
            params: { user_id: userId }
        });
        return response;
    } catch (error) {
        console.error('Error deleting conversation:', error);
        return { success: false };
    }
};

export {
    sendChatbotQuery,
    getConversations,
    createConversation,
    getConversationMessages,
    deleteConversation,
};