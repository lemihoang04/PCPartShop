import React, { useContext, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { UserContext } from "../context/UserProvider";

const UserRouter = ({ children }) => {
    const { user } = useContext(UserContext);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsReady(true);
        }, 50);
        return () => clearTimeout(timer);
    }, []);

    if (!isReady) {
        return (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        );      
    }

    if (!user.isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

export default UserRouter;