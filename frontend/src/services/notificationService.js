import axios from "../setup/axios";

const getNotificationsByUser = (userId, limit = 50, offset = 0) => {
	return axios.get(`/notifications/${userId}`, {
		params: { limit, offset }
	});
};

const getUnreadNotificationsCount = (userId) => {
	return axios.get(`/notifications/unread-count/${userId}`);
};

const createNotification = (data) => {
	return axios.post("/notifications/create", data);
};

const markNotificationAsRead = (notificationId, userId) => {
	return axios.post(`/notifications/mark-read/${notificationId}`, { user_id: userId });
};

const markAllNotificationsAsRead = (userId) => {
	return axios.post(`/notifications/mark-all-read/${userId}`);
};

const deleteNotification = (notificationId, userId) => {
	return axios.delete(`/notifications/delete/${notificationId}`, {
		data: { user_id: userId }
	});
};

const clearAllNotifications = (userId) => {
	return axios.delete(`/notifications/clear-all/${userId}`);
};

export {
	getNotificationsByUser,
	getUnreadNotificationsCount,
	createNotification,
	markNotificationAsRead,
	markAllNotificationsAsRead,
	deleteNotification,
	clearAllNotifications
};
