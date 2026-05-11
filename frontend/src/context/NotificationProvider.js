import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from "react";
import socket from "../setup/socket";
import { UserContext } from "./UserProvider";
import {
	getNotificationsByUser,
	getUnreadNotificationsCount,
	markNotificationAsRead,
	markAllNotificationsAsRead,
	deleteNotification as deleteNotificationApi,
	clearAllNotifications as clearAllNotificationsApi
} from "../services/notificationService";
import { toast } from "react-toastify";

export const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
	const { user } = useContext(UserContext);
	const [notifications, setNotifications] = useState([]);
	const [unreadCount, setUnreadCount] = useState(0);
	const [loading, setLoading] = useState(false);

	const fetchNotifications = useCallback(async () => {
		if (user && user.isAuthenticated && user.account?.id) {
			try {
				setLoading(true);
				const response = await getNotificationsByUser(user.account.id);
				if (response && response.errCode === 0) {
					setNotifications(response.notifications || []);
				}
			} catch (error) {
				console.error("Error fetching notifications:", error);
			} finally {
				setLoading(false);
			}
		}
	}, [user]);

	const fetchUnreadCount = useCallback(async () => {
		if (user && user.isAuthenticated && user.account?.id) {
			try {
				const response = await getUnreadNotificationsCount(user.account.id);
				if (response && response.errCode === 0) {
					setUnreadCount(response.unread_count || 0);
				}
			} catch (error) {
				console.error("Error fetching unread count:", error);
			}
		}
	}, [user]);

	const handleMarkAsRead = useCallback(async (notificationId) => {
		if (user && user.isAuthenticated && user.account?.id) {
			// Optimistically update state for instant responsiveness
			setNotifications((prev) =>
				prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
			);
			setUnreadCount((prev) => Math.max(0, prev - 1));

			try {
				await markNotificationAsRead(notificationId, user.account.id);
			} catch (error) {
				console.error("Error marking notification as read:", error);
			}
		}
	}, [user]);

	const handleMarkAllAsRead = useCallback(async () => {
		if (user && user.isAuthenticated && user.account?.id) {
			try {
				const response = await markAllNotificationsAsRead(user.account.id);
				if (response && response.errCode === 0) {
					setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
					setUnreadCount(0);
					toast.success("All notifications marked as read");
				}
			} catch (error) {
				console.error("Error marking all notifications as read:", error);
			}
		}
	}, [user]);

	const handleDeleteNotification = useCallback(async (notificationId) => {
		if (user && user.isAuthenticated && user.account?.id) {
			try {
				const response = await deleteNotificationApi(notificationId, user.account.id);
				if (response && response.errCode === 0) {
					const deletedNotif = notifications.find((n) => n.id === notificationId);
					setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
					if (deletedNotif && !deletedNotif.is_read) {
						setUnreadCount((prev) => Math.max(0, prev - 1));
					}
					toast.success("Notification deleted");
				}
			} catch (error) {
				console.error("Error deleting notification:", error);
			}
		}
	}, [user, notifications]);

	const handleClearAllNotifications = useCallback(async () => {
		if (user && user.isAuthenticated && user.account?.id) {
			try {
				const response = await clearAllNotificationsApi(user.account.id);
				if (response && response.errCode === 0) {
					setNotifications([]);
					setUnreadCount(0);
					toast.success("All notifications cleared");
				}
			} catch (error) {
				console.error("Error clearing notifications:", error);
			}
		}
	}, [user]);

	useEffect(() => {
		if (user && user.isAuthenticated && user.account?.id) {
			fetchNotifications();
			fetchUnreadCount();

			// Connect socket
			socket.connect();

			// Join room
			socket.emit("join", { user_id: user.account.id });

			const onNewNotification = (data) => {
				const newNotif = {
					id: data.id || Date.now(),
					user_id: user.account.id,
					title: data.title,
					content: data.message || data.content,
					type: data.type,
					reference_id: data.reference_id,
					is_read: false,
					created_at: new Date().toISOString()
				};
				setNotifications((prev) => [newNotif, ...prev]);
				setUnreadCount((prev) => prev + 1);
				toast.info(`🔔 ${data.title}: ${data.message || data.content || ""}`);
			};

			socket.on("new_notification", onNewNotification);

			return () => {
				socket.off("new_notification", onNewNotification);
				socket.disconnect();
			};
		} else {
			setNotifications([]);
			setUnreadCount(0);
		}
	}, [user, fetchNotifications, fetchUnreadCount]);

	const value = useMemo(
		() => ({
			notifications,
			unreadCount,
			loading,
			fetchNotifications,
			fetchUnreadCount,
			markAsRead: handleMarkAsRead,
			markAllAsRead: handleMarkAllAsRead,
			deleteNotification: handleDeleteNotification,
			clearAllNotifications: handleClearAllNotifications,
		}),
		[
			notifications,
			unreadCount,
			loading,
			fetchNotifications,
			fetchUnreadCount,
			handleMarkAsRead,
			handleMarkAllAsRead,
			handleDeleteNotification,
			handleClearAllNotifications,
		]
	);

	return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};
