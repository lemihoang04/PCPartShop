import React, { useEffect, useState } from "react";
import "./Dashboard.css";
import { getDashboardStats } from "../../../services/adminService";
import {
  FaShoppingCart,
  FaDollarSign,
  FaUsers,
  FaBox,
  FaExclamationTriangle,
  FaCalendarAlt,
} from "react-icons/fa";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const CHART_COLORS = {
  blue: "#1a73e8",
  teal: "#0d9488",
  orange: "#ea580c",
  red: "#dc2626",
  purple: "#7c3aed",
  blueBg: "rgba(26,115,232,0.12)",
  tealBg: "rgba(13,148,136,0.12)",
};

const formatCurrency = (value) => {
  if (value == null) return "$0";
  return "$" + Number(value).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatDateLabel = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const Dashboard = ({ setActiveMenu }) => {
  const getLocalYYYYMMDD = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayDate = new Date();
  const date30DaysAgo = new Date();
  date30DaysAgo.setDate(todayDate.getDate() - 30);

  const [endDate, setEndDate] = useState(getLocalYYYYMMDD(todayDate));
  const [startDate, setStartDate] = useState(getLocalYYYYMMDD(date30DaysAgo));
  const [dateError, setDateError] = useState("");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = async (start, end) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardStats(start, end);
      setStats(data.stats);
    } catch (err) {
      console.error("Failed to fetch dashboard stats:", err);
      setError(err?.message || "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    const today = new Date();
    const todayStr = getLocalYYYYMMDD(today);

    if (!startDate || !endDate) {
      setDateError("Please select both start and end dates.");
      return;
    }

    if (endDate > todayStr) {
      setDateError("End date cannot exceed current date.");
      return;
    }

    if (startDate > endDate) {
      setDateError("Start date cannot be after end date.");
      return;
    }

    const diffTime = Math.abs(eDate - sDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 30) {
      setDateError("Date range cannot exceed 30 days.");
      return;
    }

    setDateError("");
    fetchStats(startDate, endDate);
  }, [startDate, endDate]);

  // ── Chart configs ──
  const baseBarOptions = (titleText, isCurrency = false) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: "#1a1a2e",
        titleFont: { size: 12, weight: "600" },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 2,
        callbacks: isCurrency
          ? { label: (ctx) => formatCurrency(ctx.parsed.y || ctx.parsed.x) }
          : {},
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "#f3f4f6", drawBorder: false },
        ticks: {
          font: { size: 11 },
          color: "#9ca3af",
          ...(isCurrency ? { callback: (v) => "$" + v.toLocaleString() } : {}),
        },
        border: { display: false },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#9ca3af" },
        border: { display: false },
      },
    },
  });

  const horizontalBarOptions = (titleText, isCurrency = false) => ({
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: "#1a1a2e",
        titleFont: { size: 12, weight: "600" },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 2,
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: "#f3f4f6", drawBorder: false },
        ticks: {
          font: { size: 11 },
          color: "#9ca3af",
          ...(isCurrency ? { callback: (v) => "$" + v.toLocaleString() } : {}),
        },
        border: { display: false },
      },
      y: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#374151" },
        border: { display: false },
      },
    },
  });

  // Revenue by day — Bar
  const revenueChartData = stats ? {
    labels: (stats.dailyRevenue?.labels || []).map(formatDateLabel),
    datasets: [
      {
        label: "Revenue",
        data: stats.dailyRevenue?.values || [],
        backgroundColor: CHART_COLORS.blue,
        borderColor: CHART_COLORS.blue,
        borderWidth: 0,
        borderRadius: 1,
        barPercentage: 0.6,
        categoryPercentage: 0.7,
      },
    ],
  } : null;

  // Orders by day — Line
  const ordersChartData = stats ? {
    labels: (stats.dailyOrders?.labels || []).map(formatDateLabel),
    datasets: [
      {
        label: "Orders",
        data: stats.dailyOrders?.values || [],
        borderColor: CHART_COLORS.teal,
        backgroundColor: CHART_COLORS.tealBg,
        borderWidth: 2,
        pointRadius: 3,
        pointBackgroundColor: CHART_COLORS.teal,
        pointBorderColor: "#fff",
        pointBorderWidth: 1.5,
        tension: 0.3,
        fill: true,
      },
    ],
  } : null;

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#1a1a2e",
        titleFont: { size: 12, weight: "600" },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 2,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: "#f3f4f6", drawBorder: false },
        ticks: { font: { size: 11 }, color: "#9ca3af", stepSize: 1 },
        border: { display: false },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 11 }, color: "#9ca3af" },
        border: { display: false },
      },
    },
  };

  // Top categories — Horizontal Bar
  const topCategoriesData = stats ? {
    labels: stats.topCategories?.labels || [],
    datasets: [
      {
        label: "Sold",
        data: stats.topCategories?.values || [],
        backgroundColor: CHART_COLORS.orange,
        borderWidth: 0,
        borderRadius: 1,
        barPercentage: 0.5,
        categoryPercentage: 0.7,
      },
    ],
  } : null;

  // Top products — Horizontal Bar
  const topProductsData = stats ? {
    labels: (stats.topProducts?.labels || []).map((name) =>
      name.length > 35 ? name.substring(0, 35) + "…" : name
    ),
    datasets: [
      {
        label: "Sold",
        data: stats.topProducts?.values || [],
        backgroundColor: CHART_COLORS.purple,
        borderWidth: 0,
        borderRadius: 1,
        barPercentage: 0.5,
        categoryPercentage: 0.7,
      },
    ],
  } : null;

  const statCards = stats ? [
    {
      label: "Total Revenue",
      value: formatCurrency(stats.totalRevenue),
      icon: <FaDollarSign />,
      iconClass: "revenue",
    },
    {
      label: "Orders Today",
      value: stats.todayOrders,
      icon: <FaShoppingCart />,
      iconClass: "orders",
    },
    {
      label: "Total Customers",
      value: stats.totalCustomers,
      icon: <FaUsers />,
      iconClass: "customers",
    },
    {
      label: "Active Products",
      value: stats.activeProducts,
      icon: <FaBox />,
      iconClass: "products",
    },
    {
      label: "Low Stock",
      value: stats.lowStockProducts,
      icon: <FaExclamationTriangle />,
      iconClass: "lowstock",
    },
  ] : [];

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <div className="dashboard-header-row">
          <div>
            <h2 className="dashboard-title">Dashboard</h2>
            <p className="dashboard-subtitle">
              Overview of your store performance and key metrics.
            </p>
          </div>
          <div className="dashboard-filters-container">
            <div className="dashboard-date-filters">
              <div className="filter-group">
                <label htmlFor="startDate">From</label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  max={endDate || getLocalYYYYMMDD(new Date())}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <label htmlFor="endDate">To</label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  max={getLocalYYYYMMDD(new Date())}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            {dateError && <span className="date-filter-error">{dateError}</span>}
          </div>
        </div>
      </div>

      {loading && !stats ? (
        <div className="dashboard-loading">
          <div className="spinner" />
          <span>Loading dashboard...</span>
        </div>
      ) : error ? (
        <div className="dashboard-error">
          <FaExclamationTriangle size={28} />
          <p>{error}</p>
          <button onClick={() => fetchStats(startDate, endDate)}>Retry</button>
        </div>
      ) : stats ? (
        <div className={`dashboard-body ${loading ? "dashboard-body-updating" : ""}`}>
          {/* Stat Cards */}
          <div className="stats-row">
            {statCards.map((card, i) => (
              <div key={i} className="stat-card">
                <div className="stat-card-info">
                  <span className="stat-card-label">{card.label}</span>
                  <span className="stat-card-value">{card.value}</span>
                </div>
                <div className={`stat-card-icon ${card.iconClass}`}>
                  {card.icon}
                </div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="charts-grid">
            {/* Revenue by day */}
            <div className="chart-card">
              <div className="chart-card-header">
                <h3 className="chart-card-title">
                  Revenue by Day ({startDate ? formatDateLabel(startDate) : ""} - {endDate ? formatDateLabel(endDate) : ""})
                </h3>
              </div>
              <div className="chart-card-body" style={{ height: 300 }}>
                <Bar
                  data={revenueChartData}
                  options={baseBarOptions("Revenue", true)}
                />
              </div>
            </div>

            {/* Orders over time */}
            <div className="chart-card">
              <div className="chart-card-header">
                <h3 className="chart-card-title">
                  Orders Over Time ({startDate ? formatDateLabel(startDate) : ""} - {endDate ? formatDateLabel(endDate) : ""})
                </h3>
              </div>
              <div className="chart-card-body" style={{ height: 300 }}>
                <Line data={ordersChartData} options={lineOptions} />
              </div>
            </div>

            {/* Top categories */}
            <div className="chart-card">
              <div className="chart-card-header">
                <h3 className="chart-card-title">Top Categories by Sales</h3>
              </div>
              <div className="chart-card-body" style={{ height: 300 }}>
                <Bar
                  data={topCategoriesData}
                  options={horizontalBarOptions("Top Categories")}
                />
              </div>
            </div>

            {/* Top products */}
            <div className="chart-card">
              <div className="chart-card-header">
                <h3 className="chart-card-title">Top Products by Sales</h3>
              </div>
              <div className="chart-card-body" style={{ height: 300 }}>
                <Bar
                  data={topProductsData}
                  options={horizontalBarOptions("Top Products")}
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Dashboard;
