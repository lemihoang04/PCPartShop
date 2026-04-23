import React, { createContext, useState, useEffect, useCallback, useMemo } from "react";
import { getUserAccount } from "../services/userService";
export const UserContext = createContext();

const USER_DEFAULT = {
	isLoading: true,
	isAuthenticated: false,
	account: {},
};

const USER_LOGGED_OUT = {
	...USER_DEFAULT,
	isLoading: false,
};

const parseSessionData = (key, fallback) => {
	const data = sessionStorage.getItem(key);
	if (!data) {
		return fallback;
	}

	try {
		return JSON.parse(data);
	} catch (error) {
		console.error(`Error parsing ${key} data:`, error);
		return fallback;
	}
};

const UserProvider = ({ children }) => {
	const [user, setUser] = useState(USER_DEFAULT);
	const [admin, setAdmin] = useState(USER_DEFAULT);

	useEffect(() => {
		setUser(parseSessionData("user", USER_DEFAULT));
		setAdmin(parseSessionData("admin", USER_DEFAULT));
	}, []);

	// const loginUser = (userData) => {
	// 	setUser(userData);
	// 	fetchUser();
	// 	// sessionStorage.setItem("user", JSON.stringify(userData));
	// };
	const fetchUser = useCallback(async () => {
		try {
			const response = await getUserAccount();
			if (response && response.errCode === 0) {
				const nextUser = {
					isAuthenticated: true,
					account: { ...response.user, cart_items_count: response.cart_items_count },
					isLoading: false,
				};

				setUser(nextUser);
				sessionStorage.setItem("user", JSON.stringify(nextUser));
			} else {
				setUser(USER_LOGGED_OUT);
				sessionStorage.removeItem("user");
			}
		} catch (error) {
			console.error("Error fetching user:", error);
			setUser(USER_LOGGED_OUT);
			sessionStorage.removeItem("user");
		}
	}, []);

	const loginUser = useCallback(async () => {
		await fetchUser(); // chỉ gọi 1 lần
	}, [fetchUser]);


	const updateUser = useCallback((userData) => {
		setUser((prev) => {
			const nextUser = {
				...prev,
				account: { ...prev.account, ...userData },
			};

			sessionStorage.setItem("user", JSON.stringify(nextUser));
			return nextUser;
		});
	}, []);

	const loginAdmin = useCallback((adminData) => {
		setAdmin(adminData);
		sessionStorage.setItem("admin", JSON.stringify(adminData));
	}, []);


	const logoutUser = useCallback(() => {
		setUser(USER_LOGGED_OUT);
		sessionStorage.removeItem("user");
		sessionStorage.removeItem("chatMessages");
	}, []);

	const logoutAdmin = useCallback(() => {
		setAdmin(USER_DEFAULT);
		sessionStorage.removeItem("admin");
	}, []);
	// useEffect(() => {
	// 	if (
	// 		window.location.pathname !== "/login" &&
	// 		window.location.pathname !== "/register"
	// 	) {
	// 		fetchUser();
	// 	} else {
	// 		setUser({ ...user, isLoading: false });
	// 	}
	// }, []);
	const contextValue = useMemo(
		() => ({ user, loginUser, updateUser, logoutUser, fetchUser, loginAdmin, logoutAdmin, admin }),
		[user, loginUser, updateUser, logoutUser, fetchUser, loginAdmin, logoutAdmin, admin]
	);

	return (
		<UserContext.Provider value={contextValue}>
			{children}
		</UserContext.Provider>
	);
};

export default UserProvider;
