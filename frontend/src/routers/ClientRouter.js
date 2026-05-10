import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AppContextProvider from "../services/AppContext";
import UserLayout from "../layouts/UserLayout";
import UserRouter from "./UserRouter";
import AdminRouter from "./AdminRouter";
import Home from "../pages/Home/Home";
import ProductInfo from "../pages/ProductInfo/ProductInfo";
import Cart from "../pages/Cart/Cart";
import Login from "../pages/Login/Login";
import Register from "../pages/Register/Register";
import Admin from "../pages/Admin/Admin";
import NotFound from "../components/NotFound";
import Build from "../pages/Build/Build";
import Checkout from "../pages/Checkout/Checkout";
import Profile from "../pages/UserInfo/Profile";
import ChangePassword from "../pages/ChangePass/ChangePass";
import LaptopSearch from "../pages/laptop/LaptopSearch"
import ComponentSearch from "../pages/Component/ComponentSearch"
import Orders from "../pages/Order/Orders";
import SharedBuild from "../pages/SharedBuild/SharedBuild";
import SharedBuildDetail from "../pages/SharedBuild/SharedBuildDetail";
import CheckPayment from "../pages/Private/CheckPayment/CheckPayment";


import FailPayment from "../pages/Private/failPayment/failPayment";
import ForgetPassword from "../pages/ForgetPassword/ForgetPassword";
import ScrollToTop from "../components/ScrollToTop";
import LoginAdmin from "../pages/Admin/Login/AdminLogin";
import AddProduct from "../pages/Admin/AddProduct";
const AppRoutes = () => {
    return (
        <AppContextProvider>
            <Router>
                <ScrollToTop />
                <Routes>
                    {/* Các route của User */}
                    <Route element={<UserLayout />}>
                        <Route path="/home" element={<Home />} />
                        <Route path="/" element={<Home />} />
                        <Route
                            path="/cart"
                            element={
                                <UserRouter>
                                    <Cart />
                                </UserRouter>
                            }
                        />
                        <Route path="/product-info/:productId" element={<ProductInfo />} />
                        <Route path="/login" element={<Login />} />
                        <Route path="/register" element={<Register />} />
                        <Route
                            path="/profile"
                            element={
                                <UserRouter>
                                    <Profile />
                                </UserRouter>
                            }
                        />
                        <Route
                            path="/change-password"
                            element={
                                <UserRouter>
                                    <ChangePassword />
                                </UserRouter>
                            }
                        />
                        <Route
                            path="/orders"
                            element={
                                <UserRouter>
                                    <Orders />
                                </UserRouter>
                            }
                        />
                        <Route path="/laptops" element={<LaptopSearch />} />
                        <Route path="/shared-builds" element={<SharedBuild />} />
                        <Route path="/shared-build/:slug" element={<SharedBuildDetail />} />
                        <Route path="/build" element={<Build />} />


                        <Route path="/build/:slug" element={<Build />} />
                        <Route
                            path="/checkout"
                            element={
                                <UserRouter>
                                    <Checkout />
                                </UserRouter>
                            }
                        />
                        <Route path="/components/:type" element={<ComponentSearch />} />
                        <Route path="/checkPayment" element={<CheckPayment />} />
                        <Route path="/failPayment" element={<FailPayment />} />
                        <Route path="/forgot-password" element={<ForgetPassword />} /> {/* Added route for ForgetPassword */}
                    </Route>


                    {/* Route Admin */}
                    <Route
                        path="/admin"
                        element={
                            <AdminRouter>
                                <Admin />
                            </AdminRouter>
                        }
                    />
                    <Route path="/admin/login" element={<LoginAdmin />} />
                    <Route path="/admin/add-product" element={<AddProduct />} />
                    {/* Route 404 */}
                    <Route path="*" element={<NotFound />} />
                </Routes>
            </Router>
        </AppContextProvider>
    );
};

export default AppRoutes;
