import axios from '../setup/axios';

const sendChatbotQuery = async (query, userId = null) => {
    try {
        const response = await axios.post('/chatbot/query', {
            query,
            user_id: userId
        });
        console.log('Chatbot response:', response.data);
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
export { sendChatbotQuery };