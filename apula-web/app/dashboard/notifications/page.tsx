"use client";

import React, { useEffect, useState } from "react";
import AdminHeader from "@/components/shared/adminHeader";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";
import styles from "./notificationStyles.module.css";
import { db } from "@/lib/firebase";

import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
} from "firebase/firestore";

const normalizeStatus = (value: unknown) => String(value || "").trim().toLowerCase();

const isOpenBackupRequest = (data: Record<string, unknown>) => {
  const status =
    normalizeStatus(data.status) ||
    normalizeStatus(data.requestStatus) ||
    normalizeStatus(data.backupStatus) ||
    normalizeStatus(data.dispatchStatus);

  if (
    status === "resolved" ||
    status === "closed" ||
    status === "completed" ||
    status === "done" ||
    status === "approved" ||
    status === "declined" ||
    status === "cancelled" ||
    status === "canceled"
  ) {
    return false;
  }

  return true;
};

const timestampToMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
};

const normalizeNotification = (id: string, data: any, source: "alerts" | "backup_requests") => ({
  id,
  ...data,
  __source: source,
  __isBackupRequest: source === "backup_requests",
  type:
    data?.type ||
    data?.alertType ||
    data?.requestType ||
    (source === "backup_requests" ? "Backup Request" : "Fire Alert"),
  location:
    data?.location ||
    data?.alertLocation ||
    data?.userAddress ||
    data?.address ||
    data?.stationName ||
    "Unknown Location",
  userName:
    data?.userName ||
    data?.requestedByName ||
    data?.reportedBy ||
    "Unknown User",
  userAddress:
    data?.userAddress ||
    data?.address ||
    data?.location ||
    data?.alertLocation ||
    data?.stationName ||
    "N/A",
  userContact:
    data?.userContact ||
    data?.contact ||
    data?.phone ||
    data?.requestedByEmail ||
    "N/A",
  userEmail:
    data?.userEmail ||
    data?.requestedByEmail ||
    "N/A",
  description:
    data?.description ||
    data?.reason ||
    data?.message ||
    "",
  timestamp:
    data?.timestamp ||
    data?.createdAt ||
    data?.requestedAt ||
    null,
  status:
    data?.status ||
    data?.requestStatus ||
    data?.backupStatus ||
    data?.dispatchStatus ||
    "Pending",
});

const NotificationPage: React.FC = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState("all");

  /* 🔊 SOUND STATES */
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  /* PAGINATION */
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  /* SOUND INITIALIZE */
  useEffect(() => {
    const audioElement = new Audio("/sounds/fire_alarm.mp3");
    audioElement.loop = true;
    setAudio(audioElement);
  }, []);

  /* REALTIME ALERT LISTENER */
  useEffect(() => {
    let latestAlerts: any[] = [];
    let latestBackupRequests: any[] = [];

    const syncNotifications = () => {
      const merged = [...latestAlerts, ...latestBackupRequests].sort(
        (a, b) => timestampToMillis(b.timestamp) - timestampToMillis(a.timestamp)
      );
      setNotifications(merged);
    };

    const unsubscribeAlerts = onSnapshot(
      collection(db, "alerts"),
      (snapshot) => {
        latestAlerts = snapshot.docs.map((d) => normalizeNotification(d.id, d.data(), "alerts"));
        syncNotifications();
      },
      (err) => console.error("alerts onSnapshot error:", err)
    );

    const unsubscribeBackupRequests = onSnapshot(
      collection(db, "backup_requests"),
      (snapshot) => {
        latestBackupRequests = snapshot.docs.map((d) =>
          normalizeNotification(d.id, d.data(), "backup_requests")
        );
        syncNotifications();
      },
      (err) => console.error("backup_requests onSnapshot error:", err)
    );

    return () => {
      unsubscribeAlerts();
      unsubscribeBackupRequests();
    };
  }, []);

  /* SOUND LOGIC */
  useEffect(() => {
    if (!audio) return;

    const hasUnread = notifications.some((n) => !n.read);

    if (hasUnread && !isPlaying) {
      audio.play().catch(() => {});
      setIsPlaying(true);
    }

    if (!hasUnread && isPlaying) {
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
    }
  }, [notifications, audio]);

  /* RESET PAGE WHEN FILTER CHANGES */
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  /* OPEN MODAL */
  const handleOpenModal = async (notif: any) => {
    setSelectedNotif(notif);
    setShowModal(true);

    try {
      await updateDoc(doc(db, notif.__source || "alerts", notif.id), { read: true });
    } catch (error) {
      console.error("Failed to mark alert as read:", error);
    }
  };

  const handleCloseModal = () => setShowModal(false);

  /* FILTER LOGIC */
  const filteredNotifications = notifications.filter((n) => {
    if (filter === "read") return n.read;
    if (filter === "unread") return !n.read;
    return true;
  });

  /* PAGINATION LOGIC */
  const totalPages = Math.ceil(filteredNotifications.length / itemsPerPage);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;

  const paginatedNotifications = filteredNotifications.slice(
    startIndex,
    endIndex
  );

  return (
    <div>
      <AdminHeader />

      {/* Bell */}
      <div style={{ position: "absolute", top: 20, right: 30, zIndex: 50 }}>
        <AlertBellButton />
      </div>

      <AlertDispatchModal />

      <div className={styles.container}>
        <div className={styles.contentSection}>
          {/* HEADER */}
          <div className={styles.headerRow}>
            <h2 className={styles.pageTitle}>Notifications</h2>

            <div className={styles.filterContainer}>
              {["all", "unread", "read"].map((btn) => (
                <button
                  key={btn}
                  className={`${styles.filterBtn} ${
                    filter === btn ? styles.activeFilter : ""
                  }`}
                  onClick={() => setFilter(btn)}
                >
                  {btn.charAt(0).toUpperCase() + btn.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <hr className={styles.separator} />

          {/* NOTIFICATION LIST */}
          <div className={styles.notificationList}>
            {filteredNotifications.length === 0 ? (
              <p className={styles.noNotif}>No notifications found.</p>
            ) : (
              paginatedNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleOpenModal(notif)}
                  className={`${styles.notificationCard} ${
                    notif.read ? styles.read : styles.unread
                  }`}
                >
                  <div className={styles.notifInfo}>
                    <h4>
                      {notif.__isBackupRequest ? "Backup Request" : notif.type}
                      {!notif.read && (
                        <span className={styles.unreadDot}></span>
                      )}
                    </h4>

                    <p>
                      <strong>Location:</strong>{" "}
                      {notif.location || "Unknown Location"}
                    </p>

                    <p>
                      <strong>Reported by:</strong>{" "}
                      {notif.userName || "Unknown User"}
                    </p>

                    <p>
                      <strong>Status:</strong> {notif.status}
                    </p>

                    <p>
                      <strong>Date:</strong>{" "}
                      {notif.timestamp?.seconds
                        ? new Date(
                            notif.timestamp.seconds * 1000
                          ).toLocaleString()
                        : "Pending..."}
                    </p>
                  </div>

                  <span
                    className={`${styles.statusBadge} ${
                      notif.status === "Pending" || notif.status === "Active" || notif.status === "Open"
                        ? styles.statusPending
                        : styles.statusResolved
                    }`}
                  >
                    {notif.status}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* PAGINATION */}
          {filteredNotifications.length > 0 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                onClick={() =>
                  setCurrentPage((prev) => Math.max(prev - 1, 1))
                }
                disabled={currentPage === 1}
              >
                Prev
              </button>

              <span className={styles.pageInfo}>
                Page {currentPage} of {totalPages || 1}
              </span>

              <button
                className={styles.pageBtn}
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages || totalPages === 0}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {/* MODAL */}
      {showModal && selectedNotif && (
        <div className={styles.modalOverlay} onClick={handleCloseModal}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>{selectedNotif.__isBackupRequest ? "Backup Request Details" : "Fire Alert Details"}</h3>

            <p>
              <strong>Location:</strong> {selectedNotif.location || "N/A"}
            </p>

            <p>
              <strong>Status:</strong> {selectedNotif.status || "N/A"}
            </p>

            <p>
              <strong>Date:</strong>{" "}
              {selectedNotif.timestamp?.seconds
                ? new Date(
                    selectedNotif.timestamp.seconds * 1000
                  ).toLocaleString()
                : "Pending..."}
            </p>

            <hr />

            <h4><strong>User Information</strong></h4>

            <p>
              <strong>Name:</strong> {selectedNotif.userName || "N/A"}
            </p>

            <p>
              <strong>Address:</strong> {selectedNotif.userAddress || "N/A"}
            </p>

            <p>
              <strong>Contact:</strong> {selectedNotif.userContact || "N/A"}
            </p>

            <p>
              <strong>Email:</strong> {selectedNotif.userEmail || "N/A"}
            </p>

            <p className={styles.desc}>
              {selectedNotif.description ||
                "Fire detected in this area."}
            </p>

            <button className={styles.closeBtn} onClick={handleCloseModal}>
              <span>Close</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationPage;