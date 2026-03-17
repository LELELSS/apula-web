"use client";

import { useEffect, useState } from "react";
import AdminHeader from "@/components/shared/adminHeader";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";
import styles from "./activity.module.css";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query, where } from "firebase/firestore";

type ActivityLog = {
  id: string;
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  action?: string;
  targetId?: string;
  targetType?: string;
  details?: string;
  path?: string;
  createdAt?: { seconds?: number };
};

export default function AdminActivityPage() {
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [actionFilter, setActionFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [dateFilter, setDateFilter] = useState("all");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user: any) => {
      if (!user) {
        setRole("");
        setLoading(false);
        return;
      }

      try {
        const userSnap = await getDocs(query(collection(db, "users"), where("email", "==", user.email)));
        const first = userSnap.docs[0];
        const nextRole = String(first?.data()?.role || "");
        setRole(nextRole);

        if (nextRole !== "superadmin") {
          setLoading(false);
          return;
        }

        const logsSnap = await getDocs(
          query(collection(db, "admin_activity_logs"), orderBy("createdAt", "desc"))
        );

        setLogs(logsSnap.docs.map((docSnap: any) => ({ id: docSnap.id, ...docSnap.data() } as ActivityLog)));
      } catch (error) {
        console.error("Error loading activity logs:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const formatTime = (ts?: { seconds?: number }) => {
    if (!ts?.seconds) return "N/A";
    return new Date(ts.seconds * 1000).toLocaleString();
  };

  const getActionCategory = (action?: string) => {
    const value = String(action || "").toLowerCase();

    if (value.includes("page_visit")) return "page";
    if (value.includes("dispatch")) return "dispatch";

    if (
      value.includes("user") ||
      value.includes("account") ||
      value.includes("approve") ||
      value.includes("decline") ||
      value.includes("role") ||
      value.includes("status") ||
      value.includes("request")
    ) {
      return "userActions";
    }

    return "other";
  };

  const formatPath = (path?: string) => {
    const value = String(path || "").trim();
    if (!value || value === "N/A") return "General";

    const map: Record<string, string> = {
      "/dashboard": "Dashboard",
      "/dashboard/notifications": "Notifications",
      "/dashboard/users": "Users",
      "/dashboard/dispatch": "Dispatch",
      "/dashboard/ResponderRequest": "Account Requests",
      "/dashboard/admin-activity": "Admin Activity",
      "/dashboard/reports": "Reports",
      "/dashboard/stations": "Stations",
      "/dashboard/settings": "Settings",
    };

    if (map[value]) return map[value];

    const cleaned = value
      .replace(/^\/dashboard\/?/i, "")
      .replace(/[\-_]/g, " ")
      .trim();

    if (!cleaned) return "Dashboard";
    return cleaned.replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const formatAction = (action?: string) => {
    const value = String(action || "").trim();
    if (!value) return "Activity Recorded";

    const map: Record<string, string> = {
      page_visit: "Opened a Page",
      edit_user_account: "Updated a User Account",
      dispatch_event_monitored: "Dispatched Responders",
      dispatch_blocked_already_monitored: "Dispatch Attempt Blocked",
      approve_account_request: "Approved an Account Request",
      decline_account_request: "Declined an Account Request",
      create_account_request: "Submitted an Account Request",
    };

    if (map[value]) return map[value];
    return value.replace(/[\-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const formatTarget = (targetType?: string, targetId?: string) => {
    const base = String(targetType || "").trim().toLowerCase();
    if (!base) return "General System";

    if (base === "route") return "Page";
    if (base === "alert") return "Incident Alert";
    if (base === "responder") return "Responder Account";
    if (base === "admin") return "Admin Account";
    if (base === "user") return "User Account";

    return base.replace(/[\-_]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const formatDetails = (details?: string, path?: string, action?: string) => {
    const actionValue = String(action || "").toLowerCase();

    if (actionValue === "page_visit") {
      return `Visited ${formatPath(path)}`;
    }

    const value = String(details || "").trim();
    if (!value) return "No additional details.";

    return value
      .replace(/^visited\s+/i, "Visited ")
      .replace(/\/dashboard\/ResponderRequest/gi, "Account Requests")
      .replace(/\/dashboard\/notifications/gi, "Notifications")
      .replace(/\/dashboard\/users/gi, "Users")
      .replace(/\/dashboard\/dispatch/gi, "Dispatch")
      .replace(/\/dashboard/gi, "Dashboard");
  };

  const filteredLogs = logs.filter((log: ActivityLog) => {
    const createdMs = (log.createdAt?.seconds || 0) * 1000;
    const now = new Date();

    if (dateFilter !== "all") {
      if (!createdMs) return false;

      const createdDate = new Date(createdMs);

      if (dateFilter === "today") {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        if (createdMs < startOfDay) return false;
      }

      if (dateFilter === "last7") {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (createdMs < sevenDaysAgo.getTime()) return false;
      }

      if (dateFilter === "month") {
        if (
          createdDate.getMonth() !== now.getMonth() ||
          createdDate.getFullYear() !== now.getFullYear()
        ) {
          return false;
        }
      }
    }

    if (actionFilter !== "all" && getActionCategory(log.action) !== actionFilter) {
      return false;
    }

    const query = searchText.trim().toLowerCase();
    if (!query) return true;

    const searchBlob = [
      formatTime(log.createdAt),
      log.actorName || "",
      log.actorEmail || "",
      log.actorRole || "",
      formatAction(log.action),
      log.action || "",
      formatTarget(log.targetType, log.targetId),
      log.targetType || "",
      log.targetId || "",
      formatDetails(log.details, log.path, log.action),
      log.details || "",
      formatPath(log.path),
      log.path || "",
    ]
      .join(" ")
      .toLowerCase();

    return searchBlob.includes(query);
  });

  return (
    <div className={styles.pageWrap}>
      <AdminHeader />

      <div style={{ position: "absolute", top: 20, right: 30, zIndex: 50 }}>
        <AlertBellButton />
      </div>

      <AlertDispatchModal />

      <div className={styles.container}>
        <div className={styles.contentSection}>
          <h2 className={styles.pageTitle}>Admin Activity Logs</h2>
          <hr className={styles.separator} />

          {loading ? (
            <p className={styles.note}>Loading activity logs...</p>
          ) : role !== "superadmin" ? (
            <p className={styles.note}>Only super admin can access this page.</p>
          ) : logs.length === 0 ? (
            <p className={styles.note}>No activity logs found.</p>
          ) : (
            <div>
              <div className={styles.searchRow}>
                <input
                  type="text"
                  value={searchText}
                  onChange={(e: any) => setSearchText(e.target.value)}
                  placeholder="Search by name, event, date, details, or page"
                  className={styles.searchInput}
                />
                {searchText.trim() && (
                  <button
                    type="button"
                    className={styles.clearBtn}
                    onClick={() => setSearchText("")}
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className={styles.dateFilterRow}>
                {[
                  { key: "all", label: "All Dates" },
                  { key: "today", label: "Today" },
                  { key: "last7", label: "Last 7 Days" },
                  { key: "month", label: "This Month" },
                ].map((item) => (
                  <button
                    key={item.key}
                    className={`${styles.dateFilterBtn} ${
                      dateFilter === item.key ? styles.dateFilterBtnActive : ""
                    }`}
                    onClick={() => setDateFilter(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className={styles.filterRow}>
                {[
                  { key: "all", label: "All Actions" },
                  { key: "userActions", label: "User Actions" },
                  { key: "dispatch", label: "Dispatch" },
                  { key: "page", label: "Page Visits" },
                  { key: "other", label: "Other" },
                ].map((item) => (
                  <button
                    key={item.key}
                    className={`${styles.filterBtn} ${
                      actionFilter === item.key ? styles.filterBtnActive : ""
                    }`}
                    onClick={() => setActionFilter(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {filteredLogs.length === 0 ? (
                <p className={styles.note}>No logs match your filter or search.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Actor</th>
                        <th>Role</th>
                        <th>Action</th>
                        <th>Target</th>
                        <th>Details</th>
                        <th>Path</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log: ActivityLog) => (
                        <tr key={log.id}>
                          <td>{formatTime(log.createdAt)}</td>
                          <td>{log.actorName || log.actorEmail || "N/A"}</td>
                          <td>{log.actorRole || "N/A"}</td>
                          <td>{formatAction(log.action)}</td>
                          <td>{formatTarget(log.targetType, log.targetId)}</td>
                          <td>{formatDetails(log.details, log.path, log.action)}</td>
                          <td>{formatPath(log.path)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
