"use client";

import React, { useState, useEffect, useRef } from "react";
import Lottie from "lottie-react";
import fireAnimation from "@/public/lottie/fire.json";
import AdminHeader from "@/components/shared/adminHeader";
import styles from "./adminDashboardStyles.module.css";
import DownloadMenu from "@/components/DownloadMenu/DownloadMenu";

import {
  FaFire,
  FaUsers,
  FaTruck,
  FaUserCheck,
  FaUserClock,
  FaCheckCircle,
  FaInfoCircle,
} from "react-icons/fa";

import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";
import AdminTutorialChat from "@/components/Chatbot/AdminTutorialChat";

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
  const [topN, setTopN] = useState(10);
  const [selectedDateFrom, setSelectedDateFrom] = useState("");
  const [selectedDateTo, setSelectedDateTo] = useState("");
  const [selectedChartBarangays, setSelectedChartBarangays] = useState<
    string[]
  >([]);
  const [chartBarangayDropdownOpen, setChartBarangayDropdownOpen] =
    useState(false);
  const chartsGridRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;
  const getChartDownloadDescription = (): string => {
    const periodLabel =
      selectedPeriod === "week"
        ? "the current week"
        : selectedPeriod === "month"
          ? `the year ${selectedYear}`
          : "all available years";
    const barangayLabel =
      selectedChartBarangays.length > 0
        ? `${selectedChartBarangays.length} selected barangay(s)`
        : "all barangays in Bacoor City";
    const rangeLabel =
      selectedDateFrom && selectedDateTo
        ? ` between ${selectedDateFrom} and ${selectedDateTo}`
        : selectedDateFrom
          ? ` from ${selectedDateFrom} onwards`
          : selectedDateTo
            ? ` up to ${selectedDateTo}`
            : "";
    return `This report covers fire incident trends recorded during ${periodLabel}${rangeLabel}, covering ${barangayLabel}. Each data point represents the total number of incidents logged within that period. Use this data to identify seasonal patterns, monitor incident frequency, and support resource planning decisions.`;
  };

  const getBarangayDownloadDescription = (): string => {
    const periodLabel = getBarangayPeriodLabel().toLowerCase();
    const topLabel =
      topN >= 9999
        ? "all barangays"
        : `the top ${Math.min(topN, barangayData.length)} barangays`;
    const barangayLabel =
      selectedBarangays.length > 0
        ? `${selectedBarangays.length} manually selected barangay(s)`
        : "all barangays in Bacoor City";
    const total = barangayData
      .slice(0, topN >= 9999 ? undefined : topN)
      .reduce((s, d) => s + d.alerts, 0);
    return `This report presents a ranked breakdown of fire incidents by barangay for ${periodLabel}, showing ${topLabel} out of ${barangayLabel}. A total of ${total} incident(s) were recorded in this period. Barangays are sorted from highest to lowest incident count to help identify high-risk areas and guide fire prevention deployment.`;
  };

  /* ================= BARANGAY OVERVIEW ================= */
  const [barangayData, setBarangayData] = useState<
    { label: string; alerts: number }[]
  >([]);
  const [selectedBarangays, setSelectedBarangays] = useState<string[]>([]);
  const [barangayDropdownOpen, setBarangayDropdownOpen] = useState(false);

  /* ================= BARANGAY PERIOD FILTERS ================= */
  const [barangayPeriod, setBarangayPeriod] = useState<Period>("month");
  const [barangaySelectedYear, setBarangaySelectedYear] = useState(
    new Date().getFullYear(),
  );
  const [barangayDateFrom, setBarangayDateFrom] = useState("");
  const [barangayDateTo, setBarangayDateTo] = useState("");

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

  const BACOOR_BARANGAYS = [
    "Molino VII",
    "Molino VI",
    "Molino V",
    "Molino IV",
    "Molino III",
    "Molino II",
    "Molino I",
    "Talaba VII",
    "Talaba VI",
    "Talaba V",
    "Talaba IV",
    "Talaba III",
    "Talaba II",
    "Talaba I",
    "Niog III",
    "Niog II",
    "Niog I",
    "Aniban V",
    "Aniban IV",
    "Aniban III",
    "Aniban II",
    "Aniban I",
    "Ligas III",
    "Ligas II",
    "Ligas I",
    "Mabolo III",
    "Mabolo II",
    "Mabolo I",
    "Maliksi III",
    "Maliksi II",
    "Maliksi I",
    "Mambog V",
    "Mambog IV",
    "Mambog III",
    "Mambog II",
    "Mambog I",
    "P.F. Espiritu VIII",
    "P.F. Espiritu VII",
    "P.F. Espiritu VI",
    "P.F. Espiritu V",
    "P.F. Espiritu IV",
    "P.F. Espiritu III",
    "P.F. Espiritu II",
    "P.F. Espiritu I (Panapaan)",
    "Queens Row Central",
    "Queens Row East",
    "Queens Row West",
    "Salinas IV",
    "Salinas III",
    "Salinas II",
    "Salinas I",
    "San Nicolas III",
    "San Nicolas II",
    "San Nicolas I",
    "Zapote V",
    "Zapote IV",
    "Zapote III",
    "Zapote II",
    "Zapote I",
    "Alima",
    "Banalo",
    "Bayanan",
    "Campo Santo",
    "Daang Bukid",
    "Digman",
    "Dulong Bayan",
    "Habay II",
    "Habay I",
    "Kaingin (Poblacion)",
    "Real II",
    "Real I",
    "Sineguelasan",
    "Tabing Dagat",
  ];

  /* ================= ACTIVE FIRE ALERTS ================= */
  useEffect(() => {
    const q = query(
      collection(db, "alerts"),
      where("status", "not-in", ["Resolved", "Confirmed"]),
    );
    const unsub = onSnapshot(q, (snap) => {
      setActiveAlertCount(snap.size);
      setDataLoadCount((prev) => prev + 1);
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
      setDataLoadCount((prev) => prev + 1);
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
      setDataLoadCount((prev) => prev + 1);
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
      setDataLoadCount((prev) => prev + 1);
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
      const years = Array.from(
        new Set(parsedDates.map((d) => d.getFullYear())),
      ).sort((a, b) => b - a);
      setAvailableYears(years);
      if (years.length > 0 && !years.includes(selectedYear)) {
        setSelectedYear(years[0]);
      }
      setDataLoadCount((prev) => prev + 1);
    });
    return () => unsub();
  }, [selectedYear]);

  /* ================= RESOLVED TODAY ================= */
  useEffect(() => {
    const resolvedQuery = query(
      collection(db, "alerts"),
      where("status", "==", "Resolved"),
    );
    const unsub = onSnapshot(resolvedQuery, (snapshot) => {
      const now = new Date();
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const endOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
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
        if (resolvedDate >= startOfDay && resolvedDate < endOfDay) count += 1;
      });
      setResolvedTodayCount(count);
      setDataLoadCount((prev) => prev + 1);
    });
    return () => unsub();
  }, []);

  /* ================= CHECK LOADING ================= */
  useEffect(() => {
    if (dataLoadCount >= 6) setLoading(false);
  }, [dataLoadCount]);

  /* ================= PERIOD AGGREGATION ================= */
  useEffect(() => {
    const now = new Date();
    const referenceDate = new Date(selectedYear, now.getMonth(), now.getDate());
    const fromDate = selectedDateFrom
      ? new Date(selectedDateFrom + "T00:00:00")
      : null;
    const toDate = selectedDateTo
      ? new Date(selectedDateTo + "T23:59:59")
      : null;

    const unsub = onSnapshot(collection(db, "alerts"), (snapshot) => {
      const filteredDates: Date[] = [];
      snapshot.forEach((doc) => {
        const d = doc.data();
        if (!d.timestamp) return;
        let date: Date | null = null;
        if (d.timestamp?.seconds) date = new Date(d.timestamp.seconds * 1000);
        else if (typeof d.timestamp === "string") date = new Date(d.timestamp);
        if (!date || isNaN(date.getTime())) return;
        if (fromDate && date < fromDate) return;
        if (toDate && date > toDate) return;
        if (selectedChartBarangays.length > 0) {
          let brgy = d.barangay || d.location?.barangay || "";
          if (!brgy && typeof d.location === "string") {
            const matched = BACOOR_BARANGAYS.find((b) =>
              d.location.toLowerCase().includes(b.toLowerCase()),
            );
            if (matched) brgy = matched;
          }
          if (!brgy && typeof d.userAddress === "string") {
            const matched = BACOOR_BARANGAYS.find((b) =>
              d.userAddress.toLowerCase().includes(b.toLowerCase()),
            );
            if (matched) brgy = matched;
          }
          if (!selectedChartBarangays.includes(brgy)) return;
        }
        filteredDates.push(date);
      });

      if (selectedPeriod === "week") {
        const weekStart = new Date(referenceDate);
        const weekEnd = new Date(referenceDate);
        weekStart.setDate(referenceDate.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);
        weekEnd.setHours(23, 59, 59, 999);
        const buckets: ChartPoint[] = Array.from({ length: 7 }, (_, index) => {
          const dd = new Date(weekStart);
          dd.setDate(weekStart.getDate() + index);
          return {
            label: `${dd.toLocaleDateString("en-US", { weekday: "short" })} ${dd.getDate()}`,
            alerts: 0,
          };
        });
        filteredDates.forEach((d) => {
          if (d < weekStart || d > weekEnd) return;
          const dayIndex = Math.floor(
            (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
              weekStart.getTime()) /
              (1000 * 60 * 60 * 24),
          );
          if (dayIndex >= 0 && dayIndex < 7) buckets[dayIndex].alerts += 1;
        });
        setChartData(buckets);
        return;
      }

      if (selectedPeriod === "month") {
        const monthly = Array(12).fill(0);
        filteredDates.forEach((d) => {
          if (d.getFullYear() === selectedYear) monthly[d.getMonth()] += 1;
        });
        setChartData(
          monthly.map((count, index) => ({
            label: monthNames[index],
            alerts: count,
            fullDate: `${monthNames[index]} ${selectedYear}`,
          })),
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
      filteredDates.forEach((d) => {
        const year = d.getFullYear();
        if (yearlyBuckets[year] !== undefined) yearlyBuckets[year] += 1;
      });
      setChartData(
        yearsForChart.map((year) => ({
          label: String(year),
          alerts: yearlyBuckets[year] ?? 0,
        })),
      );
    });

    return () => unsub();
  }, [
    alertsDates,
    selectedPeriod,
    selectedYear,
    availableYears,
    selectedDateFrom,
    selectedDateTo,
    selectedChartBarangays,
  ]);

  /* ================= BARANGAY AGGREGATION ================= */
  useEffect(() => {
    const targets =
      selectedBarangays.length > 0 ? selectedBarangays : BACOOR_BARANGAYS;

    const unsub = onSnapshot(collection(db, "alerts"), (snap) => {
      const now = new Date();
      const fresh: Record<string, number> = {};
      targets.forEach((b) => {
        fresh[b] = 0;
      });

      let windowStart: Date | null = null;
      let windowEnd: Date | null = null;

      if (barangayDateFrom)
        windowStart = new Date(barangayDateFrom + "T00:00:00");
      if (barangayDateTo) windowEnd = new Date(barangayDateTo + "T23:59:59");

      if (!barangayDateFrom && !barangayDateTo) {
        if (barangayPeriod === "week") {
          windowStart = new Date(now);
          windowStart.setDate(now.getDate() - 6);
          windowStart.setHours(0, 0, 0, 0);
          windowEnd = new Date(now);
          windowEnd.setHours(23, 59, 59, 999);
        } else if (barangayPeriod === "month") {
          windowStart = new Date(barangaySelectedYear, 0, 1, 0, 0, 0, 0);
          windowEnd = new Date(barangaySelectedYear, 11, 31, 23, 59, 59, 999);
        }
      }

      snap.forEach((doc) => {
        const d = doc.data();
        let date: Date | null = null;
        if (d.timestamp?.seconds) date = new Date(d.timestamp.seconds * 1000);
        else if (typeof d.timestamp === "string") date = new Date(d.timestamp);
        if (date && isNaN(date.getTime())) date = null;

        if (windowStart && date && date < windowStart) return;
        if (windowEnd && date && date > windowEnd) return;

        let brgy: string = d.barangay || d.location?.barangay || "";
        if (!brgy && typeof d.location === "string") {
          const matched = BACOOR_BARANGAYS.find((b) =>
            d.location.toLowerCase().includes(b.toLowerCase()),
          );
          if (matched) brgy = matched;
        }
        if (!brgy && typeof d.userAddress === "string") {
          const matched = BACOOR_BARANGAYS.find((b) =>
            d.userAddress.toLowerCase().includes(b.toLowerCase()),
          );
          if (matched) brgy = matched;
        }

        if (brgy && fresh[brgy] !== undefined) fresh[brgy] += 1;
      });

      const sorted = targets
        .map((b) => ({ label: b, alerts: fresh[b] }))
        .sort((a, b) => b.alerts - a.alerts);

      setBarangayData(sorted);
    });

    return () => unsub();
  }, [
    selectedBarangays,
    alertsDates,
    barangayPeriod,
    barangaySelectedYear,
    barangayDateFrom,
    barangayDateTo,
  ]);

  const tooltipLabelFormatter = (label: string | number) => {
    if (selectedPeriod !== "month") return String(label);
    const point = chartData.find((entry) => entry.label === String(label));
    return point?.fullDate || String(label);
  };

  /* ─────────────────────────────────────────────
     SUBTITLE BUILDERS — these drive what appears
     in the Filter row of every exported file.
  ───────────────────────────────────────────── */

  /**
   * Builds a human-readable subtitle for the Fire Incidents chart export.
   * Reflects: period, year, custom date range, and active barangay filters.
   */
  const getChartDownloadSubtitle = (): string => {
    const parts: string[] = [];

    // Period
    if (selectedPeriod === "week") {
      parts.push("Period: Current Week");
    } else if (selectedPeriod === "month") {
      parts.push(`Period: Monthly · Year: ${selectedYear}`);
    } else {
      parts.push("Period: All Years");
    }

    // Custom date range
    if (selectedDateFrom || selectedDateTo) {
      const rangeParts: string[] = [];
      if (selectedDateFrom) rangeParts.push(`From ${selectedDateFrom}`);
      if (selectedDateTo) rangeParts.push(`To ${selectedDateTo}`);
      parts.push(`Date Range: ${rangeParts.join(" – ")}`);
    }

    // Barangay filter
    if (selectedChartBarangays.length > 0) {
      parts.push(
        selectedChartBarangays.length <= 3
          ? `Barangays: ${selectedChartBarangays.join(", ")}`
          : `Barangays: ${selectedChartBarangays.length} selected`,
      );
    } else {
      parts.push("Barangays: All");
    }

    return parts.join(" · ");
  };

  /**
   * Builds a human-readable subtitle for the Barangay Overview export.
   * Reflects: period, year/date range, and barangay selection.
   */
  const getBarangayDownloadSubtitle = (): string => {
    const parts: string[] = [];

    // Period / date range
    if (barangayDateFrom || barangayDateTo) {
      const rangeParts: string[] = [];
      if (barangayDateFrom) rangeParts.push(`From ${barangayDateFrom}`);
      if (barangayDateTo) rangeParts.push(`To ${barangayDateTo}`);
      parts.push(`Date Range: ${rangeParts.join(" – ")}`);
    } else if (barangayPeriod === "week") {
      parts.push("Period: Current Week");
    } else if (barangayPeriod === "month") {
      parts.push(`Period: Monthly · Year: ${barangaySelectedYear}`);
    } else {
      parts.push("Period: All Time");
    }

    // Barangay selection
    if (selectedBarangays.length > 0) {
      parts.push(
        selectedBarangays.length <= 3
          ? `Barangays: ${selectedBarangays.join(", ")}`
          : `Barangays: ${selectedBarangays.length} selected`,
      );
    } else {
      parts.push("Barangays: All");
    }

    // Top-N cap
    if (topN < 9999) {
      parts.push(`Showing: Top ${Math.min(topN, barangayData.length)}`);
    }

    return parts.join(" · ");
  };

  const getBarangayPeriodLabel = () => {
    if (barangayDateFrom || barangayDateTo) {
      const parts = [];
      if (barangayDateFrom) parts.push(`From ${barangayDateFrom}`);
      if (barangayDateTo) parts.push(`To ${barangayDateTo}`);
      return parts.join(" · ");
    }
    if (barangayPeriod === "week") return "Current Week";
    if (barangayPeriod === "month") return `Year ${barangaySelectedYear}`;
    return "All Time";
  };

  const getLineChartDescription = () => {
    if (selectedPeriod === "week")
      return "Shows the daily trend of fire incidents recorded within the current week.";
    if (selectedPeriod === "month")
      return "Shows the monthly trend of fire incidents recorded throughout the selected year.";
    return "Shows the yearly trend of fire incidents recorded across all available years.";
  };

  const getBarChartDescription = () => {
    if (selectedPeriod === "week")
      return "Displays the total number of fire incidents recorded for each day of the current week.";
    if (selectedPeriod === "month")
      return "Displays the total number of fire incidents recorded for each month of the selected year.";
    return "Displays the total number of fire incidents recorded for each available year.";
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
            style={{ width: 160, height: 160 }}
          />
        </div>
      ) : (
        <>
          <AdminHeader />
          <AlertBellButton />
          <AdminTutorialChat />
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
                  <span className={styles.cardLabel}>
                    Active Fire Incidents
                  </span>
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
                  <span className={styles.cardLabel}>
                    Dispatched Responders
                  </span>
                </div>
                <div className={styles.cardSuccess}>
                  <div className={styles.cardTop}>
                    <FaCheckCircle className={styles.cardIcon} />
                    <p className={styles.bigNumber}>{resolvedTodayCount}</p>
                  </div>
                  <span className={styles.cardLabel}>
                    Confirmed Fire Incidents (Today)
                  </span>
                </div>
              </div>

              {/* ===== ANALYTICS ===== */}
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
                      className={`${styles.periodBtn} ${selectedPeriod === period ? styles.periodBtnActive : ""}`}
                      onClick={() => setSelectedPeriod(period)}
                    >
                      {period.charAt(0).toUpperCase() + period.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Filter bar */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "10px",
                    marginTop: "12px",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "13px",
                        color: "#6b7280",
                        fontWeight: 600,
                      }}
                    >
                      From:
                    </label>
                    <input
                      type="date"
                      className={styles.yearSelect}
                      value={selectedDateFrom}
                      onChange={(e) => {
                        setSelectedDateFrom(e.target.value);
                        if (selectedDateTo && e.target.value > selectedDateTo)
                          setSelectedDateTo("");
                      }}
                    />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <label
                      style={{
                        fontSize: "13px",
                        color: "#6b7280",
                        fontWeight: 600,
                      }}
                    >
                      To:
                    </label>
                    <input
                      type="date"
                      className={styles.yearSelect}
                      value={selectedDateTo}
                      min={selectedDateFrom || undefined}
                      onChange={(e) => {
                        if (
                          selectedDateFrom &&
                          e.target.value < selectedDateFrom
                        )
                          return;
                        setSelectedDateTo(e.target.value);
                      }}
                    />
                  </div>
                  <div className={styles.barangayFilterWrapper}>
                    <button
                      className={styles.barangayFilterBtn}
                      onClick={() => setChartBarangayDropdownOpen((v) => !v)}
                    >
                      {selectedChartBarangays.length === 0
                        ? "All Barangays"
                        : `${selectedChartBarangays.length} barangay${selectedChartBarangays.length > 1 ? "s" : ""}`}
                      <span className={styles.chevron}>
                        {chartBarangayDropdownOpen ? "▲" : "▼"}
                      </span>
                    </button>
                    {chartBarangayDropdownOpen && (
                      <div className={styles.barangayDropdown}>
                        <div className={styles.barangayDropdownInner}>
                          <button
                            className={styles.clearFilterBtn}
                            onClick={() => setSelectedChartBarangays([])}
                          >
                            Clear (Show All)
                          </button>
                          {BACOOR_BARANGAYS.map((b) => (
                            <label
                              key={b}
                              className={styles.barangayCheckLabel}
                            >
                              <input
                                type="checkbox"
                                checked={selectedChartBarangays.includes(b)}
                                onChange={() =>
                                  setSelectedChartBarangays((prev) =>
                                    prev.includes(b)
                                      ? prev.filter((x) => x !== b)
                                      : [...prev, b],
                                  )
                                }
                              />
                              {b}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {(selectedDateFrom ||
                    selectedDateTo ||
                    selectedChartBarangays.length > 0) && (
                    <button
                      className={styles.periodBtn}
                      onClick={() => {
                        setSelectedDateFrom("");
                        setSelectedDateTo("");
                        setSelectedChartBarangays([]);
                      }}
                    >
                      ✕ Clear filters
                    </button>
                  )}
                </div>

                <div className={styles.chartsGrid} ref={chartsGridRef}>
                  <div className={styles.chartContainer}>
                    <h4 className={styles.chartTitle}>Line Trend</h4>
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart
                        data={chartData}
                        margin={{ top: 16, right: 18, left: 8, bottom: 12 }}
                      >
                        <CartesianGrid stroke="#eeeeee" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          padding={{ left: 10, right: 10 }}
                        />
                        <YAxis allowDecimals={false} />
                       
                        <Line
                          type="monotone"
                          dataKey="alerts"
                          stroke="#a30000"
                          strokeWidth={3}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    <div className={styles.chartInfoBox}>
                      <FaInfoCircle className={styles.infoIcon} />
                      <p className={styles.chartInfoText}>
                        {getLineChartDescription()}
                      </p>
                    </div>
                  </div>
                  <div className={styles.chartContainer}>
                    <h4 className={styles.chartTitle}>Bar Trend</h4>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart
                        data={chartData}
                        margin={{ top: 16, right: 18, left: 8, bottom: 12 }}
                      >
                        <CartesianGrid stroke="#eeeeee" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          padding={{ left: 10, right: 10 }}
                        />
                        <YAxis allowDecimals={false} />
                       
                        <Bar
                          dataKey="alerts"
                          fill="#2563eb"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className={styles.chartInfoBox}>
                      <FaInfoCircle className={styles.infoIcon} />
                      <p className={styles.chartInfoText}>
                        {getBarChartDescription()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className={styles.analyticsActions}>
                  {/*
                    subtitle       → getChartDownloadSubtitle() — full filter summary
                    rows           → chartData already reflects all active filters
                    filename       → includes period + year for uniqueness
                  */}
                  <DownloadMenu
                    title="Fire Incidents Overview"
                    subtitle={getChartDownloadSubtitle()}
                    description={getChartDownloadDescription()} // ← add
                    chartRef={chartsGridRef} // ← add
                    columns={["Period", "Label", "Alerts"]}
                    rows={chartData.map((p) => [
                      periodLabelMap[selectedPeriod],
                      p.fullDate || p.label,
                      p.alerts,
                    ])}
                    filename={`fire-incidents-${selectedPeriod}-${selectedYear}`}
                  />
                </div>
              </div>

              {/* ===== BARANGAY OVERVIEW ===== */}
              <div className={styles.barangaySection}>
                <div className={styles.analyticsHeader}>
                  <div>
                    <h2 className={styles.analyticsTitle}>
                      Barangay Incident Overview
                    </h2>
                    <p className={styles.barangayPeriodBadge}>
                      {getBarangayPeriodLabel()}
                    </p>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                    }}
                  >
                    <select
                      className={styles.yearSelect}
                      value={topN}
                      onChange={(e) => setTopN(Number(e.target.value))}
                    >
                      {([5, 10, 15, 20] as number[]).map((n) => (
                        <option key={n} value={n}>
                          Top {n}
                        </option>
                      ))}
                      <option value={9999}>All barangays</option>
                    </select>

                    <div className={styles.barangayFilterWrapper}>
                      <button
                        className={styles.barangayFilterBtn}
                        onClick={() => setBarangayDropdownOpen((v) => !v)}
                      >
                        {selectedBarangays.length === 0
                          ? "All Barangays"
                          : `${selectedBarangays.length} selected`}
                        <span className={styles.chevron}>
                          {barangayDropdownOpen ? "▲" : "▼"}
                        </span>
                      </button>
                      {barangayDropdownOpen && (
                        <div className={styles.barangayDropdown}>
                          <div className={styles.barangayDropdownInner}>
                            <button
                              className={styles.clearFilterBtn}
                              onClick={() => setSelectedBarangays([])}
                            >
                              Clear (Show All)
                            </button>
                            {BACOOR_BARANGAYS.map((b) => (
                              <label
                                key={b}
                                className={styles.barangayCheckLabel}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedBarangays.includes(b)}
                                  onChange={() =>
                                    setSelectedBarangays((prev) =>
                                      prev.includes(b)
                                        ? prev.filter((x) => x !== b)
                                        : [...prev, b],
                                    )
                                  }
                                />
                                {b}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Barangay Period Filters */}
                <div className={styles.barangayFilterBar}>
                  <div
                    className={styles.periodSwitcher}
                    style={{ marginTop: 0 }}
                  >
                    {(["week", "month", "year"] as Period[]).map((period) => (
                      <button
                        key={period}
                        className={`${styles.periodBtn} ${barangayPeriod === period ? styles.periodBtnActive : ""}`}
                        onClick={() => {
                          setBarangayPeriod(period);
                          setBarangayDateFrom("");
                          setBarangayDateTo("");
                        }}
                      >
                        {period.charAt(0).toUpperCase() + period.slice(1)}
                      </button>
                    ))}
                  </div>

                  {barangayPeriod === "month" &&
                    !barangayDateFrom &&
                    !barangayDateTo && (
                      <select
                        className={styles.yearSelect}
                        value={barangaySelectedYear}
                        onChange={(e) =>
                          setBarangaySelectedYear(Number(e.target.value))
                        }
                      >
                        {(availableYears.length > 0
                          ? availableYears
                          : [new Date().getFullYear()]
                        ).map((year) => (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        ))}
                      </select>
                    )}

                  <div className={styles.barangayDateRange}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <label className={styles.barangayDateLabel}>From:</label>
                      <input
                        type="date"
                        className={styles.yearSelect}
                        value={barangayDateFrom}
                        onChange={(e) => {
                          setBarangayDateFrom(e.target.value);
                          if (barangayDateTo && e.target.value > barangayDateTo)
                            setBarangayDateTo("");
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <label className={styles.barangayDateLabel}>To:</label>
                      <input
                        type="date"
                        className={styles.yearSelect}
                        value={barangayDateTo}
                        onChange={(e) => setBarangayDateTo(e.target.value)}
                      />
                    </div>
                    {(barangayDateFrom || barangayDateTo) && (
                      <button
                        className={styles.periodBtn}
                        onClick={() => {
                          setBarangayDateFrom("");
                          setBarangayDateTo("");
                        }}
                      >
                        ✕ Clear dates
                      </button>
                    )}
                  </div>
                </div>

                <p className={styles.barangaySubtitle}>
                  {topN >= 9999
                    ? "All barangays"
                    : `Top ${Math.min(topN, barangayData.length)}`}{" "}
                  ranked by total recorded incidents.
                  {selectedBarangays.length > 0 &&
                    ` Filtered to ${selectedBarangays.length} barangays.`}
                </p>

                {/* ===== BARANGAY INFO PANEL ===== */}
                {(() => {
                  const sliced = barangayData.slice(
                    0,
                    topN >= 9999 ? undefined : topN,
                  );
                  const total = sliced.reduce((sum, d) => sum + d.alerts, 0);
                  const avg =
                    sliced.length > 0
                      ? (total / sliced.length).toFixed(1)
                      : "0";
                  const top = sliced[0] ?? null;
                  const zeroes = sliced.filter((d) => d.alerts === 0).length;
                  const hotspots = sliced.filter(
                    (d) => top && d.alerts >= top.alerts * 0.75 && d.alerts > 0,
                  );

                  const periodLabel = (() => {
                    if (barangayDateFrom || barangayDateTo) {
                      const parts = [];
                      if (barangayDateFrom) parts.push(barangayDateFrom);
                      if (barangayDateTo) parts.push(barangayDateTo);
                      return parts.join(" → ");
                    }
                    if (barangayPeriod === "week") return "the current week";
                    if (barangayPeriod === "month")
                      return `year ${barangaySelectedYear}`;
                    return "all time";
                  })();

                  if (sliced.length === 0) return null;

                  return (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(160px, 1fr))",
                        gap: "10px",
                        margin: "14px 0 18px",
                      }}
                    >
                      {/* Total */}
                      <div
                        style={{
                          background: "var(--color-background-secondary)",
                          borderRadius: "var(--border-radius-md)",
                          padding: "12px 14px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--color-text-secondary)",
                            fontWeight: 500,
                          }}
                        >
                          Total incidents
                        </span>
                        <span
                          style={{
                            fontSize: "22px",
                            fontWeight: 500,
                            color: "var(--color-text-primary)",
                          }}
                        >
                          {total}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          across {sliced.length} barangay
                          {sliced.length !== 1 ? "s" : ""} · {periodLabel}
                        </span>
                      </div>

                      {/* Top barangay */}
                      {top && (
                        <div
                          style={{
                            background: "var(--color-background-secondary)",
                            borderRadius: "var(--border-radius-md)",
                            padding: "12px 14px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "4px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--color-text-secondary)",
                              fontWeight: 500,
                            }}
                          >
                            Highest barangay
                          </span>
                          <span
                            style={{
                              fontSize: "15px",
                              fontWeight: 500,
                              color: "#a30000",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={top.label}
                          >
                            {top.label}
                          </span>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--color-text-secondary)",
                            }}
                          >
                            {top.alerts} incident{top.alerts !== 1 ? "s" : ""} ·{" "}
                            {total > 0
                              ? Math.round((top.alerts / total) * 100)
                              : 0}
                            % of total
                          </span>
                        </div>
                      )}

                      {/* Average */}
                      <div
                        style={{
                          background: "var(--color-background-secondary)",
                          borderRadius: "var(--border-radius-md)",
                          padding: "12px 14px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--color-text-secondary)",
                            fontWeight: 500,
                          }}
                        >
                          Avg per barangay
                        </span>
                        <span
                          style={{
                            fontSize: "22px",
                            fontWeight: 500,
                            color: "var(--color-text-primary)",
                          }}
                        >
                          {avg}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          {zeroes > 0
                            ? `${zeroes} with no incidents`
                            : "all barangays have incidents"}
                        </span>
                      </div>

                      {/* Hotspot cluster */}
                      <div
                        style={{
                          background: "var(--color-background-secondary)",
                          borderRadius: "var(--border-radius-md)",
                          padding: "12px 14px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            color: "var(--color-text-secondary)",
                            fontWeight: 500,
                          }}
                        >
                          High-risk cluster
                        </span>
                        <span
                          style={{
                            fontSize: "22px",
                            fontWeight: 500,
                            color: "var(--color-text-primary)",
                          }}
                        >
                          {hotspots.length}
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "var(--color-text-secondary)",
                          }}
                        >
                          barangay{hotspots.length !== 1 ? "s" : ""} at ≥75% of
                          peak incidents
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div
                  className={styles.chartContainer}
                  style={{ minHeight: "unset" }}
                >
                  {(() => {
                    const BAR_COLORS = [
                      "#a30000",
                      "#b52020",
                      "#c43535",
                      "#d04848",
                      "#da5c5c",
                      "#e37070",
                      "#e98585",
                      "#ee9898",
                      "#f2aaaa",
                      "#f5bbbb",
                      "#f8cccc",
                      "#fadddd",
                      "#fceded",
                      "#fff0f0",
                      "#fff5f5",
                    ];
                    const sliced = barangayData.slice(
                      0,
                      topN >= 9999 ? undefined : topN,
                    );
                    const max = Math.max(...sliced.map((d) => d.alerts), 1);

                    return sliced.length === 0 ? (
                      <p className={styles.barangayEmpty}>
                        No incident data available.
                      </p>
                    ) : (
                      <div className={styles.barangayChartArea}>
                        {sliced.map((d, i) => {
                          const pct = Math.round((d.alerts / max) * 100);
                          const color =
                            BAR_COLORS[Math.min(i, BAR_COLORS.length - 1)];
                          const isTop3 = i < 3;
                          return (
                            <div
                              key={d.label}
                              className={styles.barangayBarRow}
                            >
                              <span
                                className={styles.rankBadge}
                                style={{
                                  background: isTop3
                                    ? "#a30000"
                                    : "var(--color-background-secondary, #f1f5f9)",
                                  color: isTop3 ? "#fff" : "#6b7280",
                                }}
                              >
                                {i + 1}
                              </span>
                              <span
                                className={styles.barangayBarLabel}
                                title={d.label}
                              >
                                {d.label}
                              </span>
                              <div className={styles.barangayBarTrack}>
                                <div
                                  className={styles.barangayBarFill}
                                  style={{
                                    width: `${pct}%`,
                                    background: color,
                                    minWidth: d.alerts > 0 ? "32px" : "0",
                                  }}
                                >
                                  {d.alerts > 0 && (
                                    <span
                                      className={styles.barangayBarInlineCount}
                                    >
                                      {d.alerts}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                <div className={styles.chartInfoBox}>
                      <FaInfoCircle className={styles.infoIcon} />
                      <p className={styles.chartInfoText}>
                        Shows barangay overview for {getBarangayPeriodLabel()}
                      </p>
                    </div>

                <div className={styles.analyticsActions}>
                  {/*
                    subtitle       → getBarangayDownloadSubtitle() — full filter summary
                    rows           → sliced barangayData (top N, respects all filters)
                    filename       → static "barangay-incidents"
                  */}
                  <DownloadMenu
                    title="Barangay Incident Overview"
                    subtitle={getBarangayDownloadSubtitle()}
                    description={getBarangayDownloadDescription()} // ← add
                    columns={["Barangay", "Total Incidents"]}
                    rows={barangayData
                      .slice(0, topN >= 9999 ? undefined : topN)
                      .map((r) => [r.label, r.alerts])}
                    filename="barangay-incidents"
                  />
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
