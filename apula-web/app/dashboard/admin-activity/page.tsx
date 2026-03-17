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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
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

        setLogs(logsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ActivityLog)));
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
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatTime(log.createdAt)}</td>
                      <td>{log.actorName || log.actorEmail || "N/A"}</td>
                      <td>{log.actorRole || "N/A"}</td>
                      <td>{log.action || "N/A"}</td>
                      <td>{log.targetType || "N/A"} {log.targetId ? `(${log.targetId})` : ""}</td>
                      <td>{log.details || "N/A"}</td>
                      <td>{log.path || "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
