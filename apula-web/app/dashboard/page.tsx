"use client";

import React, { useState, useEffect } from "react";
import Lottie from "lottie-react";
import fireAnimation from "@/public/lottie/fire.json";
import AdminHeader from "@/components/shared/adminHeader";
import styles from "./adminDashboardStyles.module.css";

import {
  FaFire,
  FaUsers,
  FaTruck,
  FaUserCheck,
  FaUserClock,
  FaCheckCircle,
} from "react-icons/fa";

import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

type Period = "week" | "month" | "year";

type ChartPoint = {
  label: string;
  alerts: number;
  fullDate?: string;
};

const AdminDashboard = () => {
  /* ================= LOADING STATE ================= */
  const [loading, setLoading] = useState(true);
  const [dataLoadCount, setDataLoadCount] = useState(0);

  /* ================= COUNTERS ================= */
  const [activeAlertCount, setActiveAlertCount] = useState(0);
  const [availableResponders, setAvailableResponders] = useState(0);
  const [dispatchedResponders, setDispatchedResponders] = useState(0);
  const [availableTrucks, setAvailableTrucks] = useState(0);
  const [availableTeams, setAvailableTeams] = useState(0);
  const [resolvedTodayCount, setResolvedTodayCount] = useState(0);

  /* ================= ANALYTICS ================= */
  const [selectedPeriod, setSelectedPeriod] = useState<Period>("month");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [alertsDates, setAlertsDates] = useState<Date[]>([]);

  const periodLabelMap: Record<Period, string> = {
    week: "Week",
    month: "Month",
    year: "Year",
  };

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  /* ================= ACTIVE FIRE ALERTS ================= */
  useEffect(() => {
    const q = query(
      collection(db, "alerts"),
      where("status", "!=", "Resolved")
    );

    const unsub = onSnapshot(q, (snap) => {
      setActiveAlertCount(snap.size);
      setDataLoadCount(prev => prev + 1);
    });

    return () => unsub();
  }, []);

  /* ================= RESPONDERS ================= */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      let available = 0;
      let dispatched = 0;

      snap.forEach((doc) => {
        const d = doc.data();

        if (d.role === "responder") {
          if (d.status === "Available") available++;
          if (d.status === "Dispatched") dispatched++;
        }
      });

      setAvailableResponders(available);
      setDispatchedResponders(dispatched);
      setDataLoadCount(prev => prev + 1);
    });

    return () => unsub();
  }, []);

  /* ================= AVAILABLE TEAMS ================= */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "teams"), (snap) => {
      let teams = 0;

      snap.forEach((doc) => {
        const d = doc.data();
        if (d.status === "Available") teams++;
      });

      setAvailableTeams(teams);
      setDataLoadCount(prev => prev + 1);
    });

    return () => unsub();
  }, []);

  /* ================= AVAILABLE TRUCKS ================= */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "vehicles"), (snap) => {
      let trucks = 0;

      snap.forEach((doc) => {
        const d = doc.data();
        if (d.status === "Available") trucks++;
      });

      setAvailableTrucks(trucks);
      setDataLoadCount(prev => prev + 1);
    });

    return () => unsub();
  }, []);

  /* ================= INCIDENT TIMESTAMPS ================= */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "alerts"), (snapshot) => {
      const parsedDates: Date[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.timestamp) return;

        let d: Date | null = null;

        if (data.timestamp?.seconds) {
          d = new Date(data.timestamp.seconds * 1000);
        } else if (typeof data.timestamp === "string") {
          d = new Date(data.timestamp);
        }

        if (!d || isNaN(d.getTime())) return;

        parsedDates.push(d);
      });

      setAlertsDates(parsedDates);

      const years = Array.from(new Set(parsedDates.map((d) => d.getFullYear()))).sort(
        (a, b) => b - a
      );
      setAvailableYears(years);
      if (years.length > 0 && !years.includes(selectedYear)) {
        setSelectedYear(years[0]);
      }
      setDataLoadCount(prev => prev + 1);
    });

    return () => unsub();
  }, [selectedYear]);

  /* ================= RESOLVED TODAY ================= */
  useEffect(() => {
    const resolvedQuery = query(
      collection(db, "alerts"),
      where("status", "==", "Resolved")
    );

    const unsub = onSnapshot(resolvedQuery, (snapshot) => {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

      let count = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        const rawDate = data.resolvedAt || data.updatedAt || data.timestamp;
        if (!rawDate) return;

        let resolvedDate: Date | null = null;
        if (rawDate?.seconds) {
          resolvedDate = new Date(rawDate.seconds * 1000);
        } else if (typeof rawDate === "string") {
          resolvedDate = new Date(rawDate);
        } else if (rawDate instanceof Date) {
          resolvedDate = rawDate;
        }

        if (!resolvedDate || isNaN(resolvedDate.getTime())) return;

        if (resolvedDate >= startOfDay && resolvedDate < endOfDay) {
          count += 1;
        }
      });

      setResolvedTodayCount(count);
      setDataLoadCount(prev => prev + 1);
    });

    return () => unsub();
  }, []);

  /* ================= CHECK LOADING ================= */
  useEffect(() => {
    if (dataLoadCount >= 6) {
      setLoading(false);
    }
  }, [dataLoadCount]);

  /* ================= PERIOD AGGREGATION ================= */
  useEffect(() => {
    const now = new Date();
    const referenceDate = new Date(selectedYear, now.getMonth(), now.getDate());

    if (selectedPeriod === "week") {
      const weekStart = new Date(referenceDate);
      const weekEnd = new Date(referenceDate);
      weekStart.setDate(referenceDate.getDate() - 6);
      weekStart.setHours(0, 0, 0, 0);
      weekEnd.setHours(23, 59, 59, 999);

      const buckets: ChartPoint[] = Array.from({ length: 7 }, (_, index) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + index);
        return {
          label: `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()}`,
          alerts: 0,
        };
      });

      alertsDates.forEach((d) => {
        if (d < weekStart || d > weekEnd) return;
        const dayIndex = Math.floor(
          (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - weekStart.getTime()) /
            (1000 * 60 * 60 * 24)
        );

        if (dayIndex >= 0 && dayIndex < 7) {
          buckets[dayIndex].alerts += 1;
        }
      });

      setChartData(buckets);
      return;
    }

    if (selectedPeriod === "month") {
      const monthly = Array(12).fill(0);

      alertsDates.forEach((d) => {
        if (d.getFullYear() === selectedYear) {
          monthly[d.getMonth()] += 1;
        }
      });

      setChartData(
        monthly.map((count, index) => ({
          label: monthNames[index],
          alerts: count,
          fullDate: `${monthNames[index]} ${selectedYear}`,
        }))
      );
      return;
    }

    const yearsForChart =
      availableYears.length > 0
        ? [...availableYears].sort((a, b) => a - b)
        : [selectedYear];

    const yearlyBuckets: Record<number, number> = {};
    yearsForChart.forEach((year) => {
      yearlyBuckets[year] = 0;
    });

    alertsDates.forEach((d) => {
      const year = d.getFullYear();
      if (yearlyBuckets[year] !== undefined) {
        yearlyBuckets[year] += 1;
      }
    });

    setChartData(
      yearsForChart.map((year) => ({
        label: String(year),
        alerts: yearlyBuckets[year] ?? 0,
      }))
    );
  }, [alertsDates, selectedPeriod, selectedYear, availableYears]);

  const tooltipLabelFormatter = (label: string | number) => {
    if (selectedPeriod !== "month") return String(label);
    const point = chartData.find((entry) => entry.label === String(label));
    return point?.fullDate || String(label);
  };

  const downloadChartData = () => {
    const csvRows = [
      ["Period", "Year", "Label", "Alerts"],
      ...chartData.map((point) => [
        periodLabelMap[selectedPeriod],
        selectedPeriod === "year" ? "All Years" : String(selectedYear),
        point.fullDate || point.label,
        String(point.alerts),
      ]),
    ];

    const csvContent = csvRows
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fire-incidents-${selectedPeriod}-${selectedYear}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      {loading ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#ffffff",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 99999,
          }}
        >
          <Lottie
            animationData={fireAnimation}
            loop={true}
            autoplay={true}
            style={{
              width: 160,
              height: 160,
            }}
          />
        </div>
      ) : (
        <>
          <AdminHeader />

          <div style={{ position: "absolute", top: 20, right: 30, zIndex: 50 }}>
            <AlertBellButton />
          </div>

          <AlertDispatchModal />

          <div className={styles.container}>
            <div className={styles.contentSection}>
              <h2 className={styles.pageTitle}>Fire Command Center</h2>
              <hr className={styles.separator} />

              {/* ROW 1 */}
              <div className={styles.row}>
                <div className={styles.cardCritical}>
                  <div className={styles.cardTop}>
                    <FaFire className={styles.cardIcon} />
                    <p className={styles.bigNumber}>{activeAlertCount}</p>
                  </div>
                  <span className={styles.cardLabel}>Active Fire Incidents</span>
                </div>

                <div className={styles.cardSuccess}>
                  <div className={styles.cardTop}>
                    <FaUsers className={styles.cardIcon} />
                    <p className={styles.bigNumber}>{availableTeams}</p>
                  </div>
                  <span className={styles.cardLabel}>Available Teams</span>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardTop}>
                    <FaTruck className={styles.cardIcon} />
                    <p className={styles.bigNumber}>{availableTrucks}</p>
                  </div>
                  <span className={styles.cardLabel}>Available Trucks</span>
                </div>
              </div>

              {/* ROW 2 */}
              <div className={styles.row}>
                <div className={styles.cardSuccess}>
                  <div className={styles.cardTop}>
                    <FaUserCheck className={styles.cardIcon} />
                    <p className={styles.bigNumber}>{availableResponders}</p>
                  </div>
                  <span className={styles.cardLabel}>Responders Available</span>
                </div>

                <div className={styles.cardInfo}>
                  <div className={styles.cardTop}>
                    <FaUserClock className={styles.cardIcon} />
                    <p className={styles.bigNumber}>{dispatchedResponders}</p>
                  </div>
                  <span className={styles.cardLabel}>Dispatched Responders</span>
                </div>

            <div className={styles.cardSuccess}>
              <div className={styles.cardTop}>
                <FaCheckCircle className={styles.cardIcon} />
                <p className={styles.bigNumber}>{resolvedTodayCount}</p>
              </div>
              <span className={styles.cardLabel}>Resolved Fire Incidents (Today)</span>
            </div>
          </div>

          <div className={styles.analyticsSection}>
            <div className={styles.analyticsHeader}>
              <h2 className={styles.analyticsTitle}>
                Fire Incidents Overview
                {selectedPeriod === "year"
                  ? ` (${periodLabelMap[selectedPeriod]})`
                  : ` (${periodLabelMap[selectedPeriod]} ${selectedYear})`}
              </h2>

              {selectedPeriod !== "year" && (
                <select
                  className={styles.yearSelect}
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className={styles.periodSwitcher}>
              {(["week", "month", "year"] as Period[]).map((period) => (
                <button
                  key={period}
                  className={`${styles.periodBtn} ${
                    selectedPeriod === period ? styles.periodBtnActive : ""
                  }`}
                  onClick={() => setSelectedPeriod(period)}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>

            <div className={styles.chartsGrid}>
              <div className={styles.chartContainer}>
                <h4 className={styles.chartTitle}>Line Trend</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 16, right: 18, left: 8, bottom: 12 }}
                  >
                    <CartesianGrid stroke="#eeeeee" strokeDasharray="3 3" />
                    <XAxis dataKey="label" padding={{ left: 10, right: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip labelFormatter={tooltipLabelFormatter} />
                    <Line
                      type="monotone"
                      dataKey="alerts"
                      stroke="#a30000"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.chartContainer}>
                <h4 className={styles.chartTitle}>Bar Trend</h4>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 16, right: 18, left: 8, bottom: 12 }}
                  >
                    <CartesianGrid stroke="#eeeeee" strokeDasharray="3 3" />
                    <XAxis dataKey="label" padding={{ left: 10, right: 10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip labelFormatter={tooltipLabelFormatter} />
                    <Bar dataKey="alerts" fill="#2563eb" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={styles.analyticsActions}>
              <button className={styles.downloadBtn} onClick={downloadChartData}>
                Download Data
              </button>
            </div>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;