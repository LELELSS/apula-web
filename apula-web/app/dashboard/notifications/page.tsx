"use client";

import React, { useEffect, useMemo, useState } from "react";
import AdminHeader from "@/components/shared/adminHeader";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";
import AdminTutorialChat from "@/components/Chatbot/AdminTutorialChat";
import styles from "./notificationStyles.module.css";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
  getDoc,
  arrayUnion,
} from "firebase/firestore";

import {
  Flame,
  UserPlus,
  Users,
  ShieldCheck,
  BadgeCheck,
  Bell,
} from "lucide-react";

const normalizeStatus = (value: unknown) =>
  String(value || "").trim().toLowerCase();

const timestampToMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
};

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const prettyStatus = (value: string) => {
  const clean = String(value || "Pending").trim();
  return toTitleCase(clean);
};

const normalizeNotification = (
  id: string,
  data: any,
  source: "alerts" | "backup_requests" | "notifications"
) => ({
  id,
  ...data,
  __source: source,
  __isBackupRequest: source === "backup_requests",
  type:
    data?.type ||
    data?.alertType ||
    data?.requestType ||
    data?.notificationType ||
    (source === "backup_requests"
      ? "backup_request"
      : source === "notifications"
      ? "system_notice"
      : "fire_alert"),
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
    data?.responderName ||
    data?.adminName ||
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
  userEmail: data?.userEmail || data?.requestedByEmail || "N/A",
  description:
    data?.description || data?.reason || data?.details || data?.message || "",
  timestamp: data?.timestamp || data?.createdAt || data?.requestedAt || null,
  status:
    data?.status ||
    data?.requestStatus ||
    data?.backupStatus ||
    data?.dispatchStatus ||
    "Pending",
  teamName: data?.teamName || data?.assignedTeam || "No Team",
  adminName: data?.adminName || "Admin",
});

const isReadByUser = (notif: any, uid: string) => {
  const readers = Array.isArray(notif?.readBy) ? notif.readBy : [];
  return readers.includes(uid);
};

const isFireRelatedNotification = (notif: any) => {
  const rawType = String(notif?.type || "").trim().toLowerCase();
  const rawSource = String(notif?.__source || "").trim().toLowerCase();

  return (
    rawSource === "alerts" ||
    rawSource === "backup_requests" ||
    rawType.includes("fire") ||
    rawType.includes("validation") ||
    rawType.includes("backup")
  );
};

const getNotificationVisuals = (notif: any) => {
  const rawType = String(notif?.type || "").trim().toLowerCase();

  if (
    rawType.includes("account") ||
    rawType.includes("account_request") ||
    rawType.includes("request_account")
  ) {
    return {
      icon: <UserPlus size={22} />,
      iconClass: styles.iconAccount,
      title: "Account Request",
      description:
        notif.description ||
        `${notif.userName} has submitted a request to create an account.`,
      tag: "Account",
    };
  }

  if (
    rawType.includes("validation_confirmed") ||
    rawType.includes("confirmed_validation")
  ) {
    return {
      icon: <BadgeCheck size={22} />,
      iconClass: styles.iconConfirmed,
      title: "Validation Confirmed",
      description:
        notif.description ||
        `${notif.adminName} confirmed the fire validation from ${notif.teamName}.`,
      tag: "Confirmed",
    };
  }

  if (rawType.includes("fire_validation") || rawType.includes("validation")) {
    return {
      icon: <ShieldCheck size={22} />,
      iconClass: styles.iconValidation,
      title: "Fire Validation",
      description:
        notif.description ||
        `${notif.userName} of ${notif.teamName} validated a fire incident.`,
      tag: "Validation",
    };
  }

  if (
    rawType.includes("assign_team") ||
    rawType.includes("team_assignment") ||
    rawType.includes("assign responder")
  ) {
    return {
      icon: <Users size={22} />,
      iconClass: styles.iconTeam,
      title: "Assign Responder to a Team",
      description:
        notif.description ||
        `${notif.userName} is currently not assigned to any responder team.`,
      tag: "Team",
    };
  }

  if (
    rawType.includes("fire_alert") ||
    rawType.includes("fire") ||
    rawType.includes("backup") ||
    notif.__source === "alerts" ||
    notif.__source === "backup_requests"
  ) {
    return {
      icon: <Flame size={22} />,
      iconClass: styles.iconFire,
      title:
        notif.__source === "backup_requests" ? "Backup Request" : "Fire Alert",
      description:
        notif.description ||
        `Fire confirmed by user at ${notif.location || "the reported location"}.`,
      tag: notif.__source === "backup_requests" ? "Backup" : "Fire",
    };
  }

  return {
    icon: <Bell size={22} />,
    iconClass: styles.iconSystem,
    title: "System Notification",
    description:
      notif.description ||
      "There is a new system activity that requires attention.",
    tag: "System",
  };
};

const NotificationPage: React.FC = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [selectedNotif, setSelectedNotif] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState("all");
  const [bulkActionTarget, setBulkActionTarget] = useState<
    "selected_read" | "selected_unread" | "all" | null
  >(null);
  const [currentUid, setCurrentUid] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const itemsPerPage = 5;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || "");
    });

    return () => unsub();
  }, []);

  const normalizeBackupRequestWithAlert = async (id: string, data: any) => {
    let alertLocation =
      data?.location || data?.alertLocation || "Unknown Location";
    let alertAddress = data?.userAddress || data?.address || "N/A";
    let alertDescription =
      data?.description || data?.reason || data?.details || "";

    if (data?.alertId) {
      try {
        const alertRef = doc(db, "alerts", data.alertId);
        const alertSnap = await getDoc(alertRef);

        if (alertSnap.exists()) {
          const alertData = alertSnap.data();

          alertLocation =
            alertData?.location ||
            alertData?.alertLocation ||
            alertData?.userAddress ||
            alertData?.address ||
            data?.location ||
            "Unknown Location";

          alertAddress =
            alertData?.userAddress ||
            alertData?.address ||
            alertData?.location ||
            data?.userAddress ||
            "N/A";

          alertDescription =
            data?.reason ||
            alertData?.description ||
            alertData?.details ||
            alertData?.message ||
            "";
        }
      } catch (error) {
        console.error(
          "Failed to fetch linked alert for backup request:",
          error
        );
      }
    }

    return {
      ...normalizeNotification(id, data, "backup_requests"),
      location: alertLocation,
      userAddress: alertAddress,
      description: alertDescription,
    };
  };

  useEffect(() => {
    let latestAlerts: any[] = [];
    let latestBackupRequests: any[] = [];
    let latestSystemNotifs: any[] = [];
    let isMounted = true;
    let backupRequestRun = 0;

    const syncNotifications = () => {
      if (!isMounted) return;

      const merged = [
        ...latestAlerts,
        ...latestBackupRequests,
        ...latestSystemNotifs,
      ].sort(
        (a, b) => timestampToMillis(b.timestamp) - timestampToMillis(a.timestamp)
      );

      setNotifications(merged);
    };

    const unsubscribeAlerts = onSnapshot(
      collection(db, "alerts"),
      (snapshot) => {
        if (!isMounted) return;

        latestAlerts = snapshot.docs.map((d) =>
          normalizeNotification(d.id, d.data(), "alerts")
        );
        syncNotifications();
      },
      (err) => console.error("alerts onSnapshot error:", err)
    );

    const unsubscribeBackupRequests = onSnapshot(
      collection(db, "backup_requests"),
      async (snapshot) => {
        if (!isMounted) return;

        const runId = ++backupRequestRun;

        const normalized = await Promise.all(
          snapshot.docs.map((d) =>
            normalizeBackupRequestWithAlert(d.id, d.data())
          )
        );

        if (!isMounted || runId !== backupRequestRun) return;

        latestBackupRequests = normalized;
        syncNotifications();
      },
      (err) => console.error("backup_requests onSnapshot error:", err)
    );

    const unsubscribeSystemNotifs = onSnapshot(
      collection(db, "notifications"),
      (snapshot) => {
        if (!isMounted) return;

        latestSystemNotifs = snapshot.docs.map((d) =>
          normalizeNotification(d.id, d.data(), "notifications")
        );
        syncNotifications();
      },
      (err) => console.error("notifications onSnapshot error:", err)
    );

    return () => {
      isMounted = false;
      unsubscribeAlerts();
      unsubscribeBackupRequests();
      unsubscribeSystemNotifs();
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds([]);
    setIsSelectMode(false);
  }, [filter]);

  const handleOpenModal = async (notif: any) => {
    if (isSelectMode) return;

    setSelectedNotif(notif);
    setShowModal(true);

    try {
      if (currentUid) {
        await updateDoc(doc(db, notif.__source || "alerts", notif.id), {
          readBy: arrayUnion(currentUid),
        });
      }
    } catch (error) {
      console.error("Failed to mark alert as read:", error);
    }
  };

  const handleCloseModal = () => setShowModal(false);

  const filteredNotifications = notifications.filter((n) => {
    const isRead = currentUid ? isReadByUser(n, currentUid) : false;

    if (filter === "read") return isRead;
    if (filter === "unread") return !isRead;

    return true;
  });

  const unreadAllNotifications = currentUid
    ? notifications.filter((n) => !isReadByUser(n, currentUid))
    : [];

  const totalPages = Math.ceil(filteredNotifications.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedNotifications = filteredNotifications.slice(
    startIndex,
    endIndex
  );

  const visibleSelectableNotifications = paginatedNotifications;

  const allVisibleSelected =
    visibleSelectableNotifications.length > 0 &&
    visibleSelectableNotifications.every((n) => selectedIds.includes(n.id));

  const toggleSelectNotification = (notifId: string) => {
    setSelectedIds((prev) =>
      prev.includes(notifId)
        ? prev.filter((id) => id !== notifId)
        : [...prev, notifId]
    );
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) =>
        prev.filter(
          (id) =>
            !visibleSelectableNotifications.some((notif) => notif.id === id)
        )
      );
      return;
    }

    const visibleIds = visibleSelectableNotifications.map((notif) => notif.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
  };

  const handleEnableSelectMode = () => {
    setIsSelectMode(true);
  };

  const handleCancelSelectMode = () => {
    setIsSelectMode(false);
    setSelectedIds([]);
  };

  const selectedVisibleCount = selectedIds.length;

  const selectedNotifications = useMemo(
    () => notifications.filter((notif) => selectedIds.includes(notif.id)),
    [notifications, selectedIds]
  );

  const markNotificationsAsRead = async (items: any[]) => {
    if (!currentUid || items.length === 0) return;

    setBulkActionTarget("selected_read");
    try {
      await Promise.all(
        items.map((notif) =>
          updateDoc(doc(db, notif.__source || "alerts", notif.id), {
            readBy: arrayUnion(currentUid),
          })
        )
      );

      setSelectedIds([]);
      setIsSelectMode(false);
    } catch (error) {
      console.error("Failed to mark notifications as read:", error);
    } finally {
      setBulkActionTarget(null);
    }
  };

  const markNotificationsAsUnread = async (items: any[]) => {
    if (!currentUid || items.length === 0) return;

    setBulkActionTarget("selected_unread");
    try {
      await Promise.all(
        items.map(async (notif) => {
          const currentReadBy = Array.isArray(notif?.readBy)
            ? notif.readBy
            : [];
          const updatedReadBy = currentReadBy.filter(
            (id: string) => id !== currentUid
          );

          await updateDoc(doc(db, notif.__source || "alerts", notif.id), {
            readBy: updatedReadBy,
          });
        })
      );

      setSelectedIds([]);
      setIsSelectMode(false);
    } catch (error) {
      console.error("Failed to mark notifications as unread:", error);
    } finally {
      setBulkActionTarget(null);
    }
  };

  const markAllAsRead = async (items: any[]) => {
    if (!currentUid || items.length === 0) return;

    setBulkActionTarget("all");
    try {
      await Promise.all(
        items.map((notif) =>
          updateDoc(doc(db, notif.__source || "alerts", notif.id), {
            readBy: arrayUnion(currentUid),
          })
        )
      );
    } catch (error) {
      console.error("Failed to mark notifications as read:", error);
    } finally {
      setBulkActionTarget(null);
    }
  };

  return (
    <div>
      <AdminHeader />

      <AlertBellButton />
      <AdminTutorialChat />

      <AlertDispatchModal />

      <div className={styles.container}>
        <div className={styles.contentSection}>
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

          <div className={styles.bulkActionsRow}>
            {!isSelectMode ? (
              <>
                <button
                  className={styles.bulkActionBtn}
                  onClick={handleEnableSelectMode}
                  disabled={!currentUid || paginatedNotifications.length === 0}
                >
                  Select
                </button>

                <button
                  className={`${styles.bulkActionBtn} ${styles.bulkActionBtnSecondary}`}
                  onClick={() => markAllAsRead(unreadAllNotifications)}
                  disabled={
                    !currentUid ||
                    unreadAllNotifications.length === 0 ||
                    bulkActionTarget !== null
                  }
                >
                  {bulkActionTarget === "all"
                    ? "Marking all..."
                    : `Mark All as Read (${unreadAllNotifications.length})`}
                </button>
              </>
            ) : (
              <>
                <label className={styles.selectAllWrap}>
                  <input
                    type="checkbox"
                    className={styles.bulkCheckbox}
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    disabled={
                      !currentUid || visibleSelectableNotifications.length === 0
                    }
                  />
                  <span>
                    Select All Visible
                    {selectedVisibleCount > 0
                      ? ` (${selectedVisibleCount} selected)`
                      : ""}
                  </span>
                </label>

                {selectedVisibleCount > 0 && (
                  <>
                    <button
                      className={styles.bulkActionBtn}
                      onClick={() =>
                        markNotificationsAsRead(selectedNotifications)
                      }
                      disabled={!currentUid || bulkActionTarget !== null}
                    >
                      {bulkActionTarget === "selected_read"
                        ? "Updating..."
                        : "Mark as Read"}
                    </button>

                    <button
                      className={`${styles.bulkActionBtn} ${styles.bulkActionBtnSecondary}`}
                      onClick={() =>
                        markNotificationsAsUnread(selectedNotifications)
                      }
                      disabled={!currentUid || bulkActionTarget !== null}
                    >
                      {bulkActionTarget === "selected_unread"
                        ? "Updating..."
                        : "Mark as Unread"}
                    </button>
                  </>
                )}

                <button
                  className={`${styles.bulkActionBtn} ${styles.bulkActionBtnSecondary}`}
                  onClick={handleCancelSelectMode}
                  disabled={bulkActionTarget !== null}
                >
                  Cancel
                </button>
              </>
            )}
          </div>

          <hr className={styles.separator} />

          <div className={styles.notificationList}>
            {filteredNotifications.length === 0 ? (
              <p className={styles.noNotif}>No notifications found.</p>
            ) : (
              paginatedNotifications.map((notif) => {
                const visual = getNotificationVisuals(notif);
                const isRead = currentUid
                  ? isReadByUser(notif, currentUid)
                  : false;
                const isFireRelated = isFireRelatedNotification(notif);
                const isChecked = selectedIds.includes(notif.id);

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleOpenModal(notif)}
                    className={`${styles.notificationCard} ${
                      isRead
                        ? styles.read
                        : isFireRelated
                        ? styles.unreadFire
                        : styles.unreadSystem
                    }`}
                  >
                    {isSelectMode && (
                      <div
                        className={styles.checkboxArea}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className={styles.notificationCheckbox}
                          checked={isChecked}
                          onChange={() => toggleSelectNotification(notif.id)}
                          aria-label={`Select notification ${visual.title}`}
                        />
                      </div>
                    )}

                    <div className={styles.notificationMain}>
                      <div
                        className={`${styles.notifIconWrap} ${visual.iconClass}`}
                      >
                        {visual.icon}
                      </div>

                      <div className={styles.notifContent}>
                        <div className={styles.notifTopRow}>
                          <h4 className={styles.notifTitle}>
                            {visual.title}
                            {!isRead && (
                              <span className={styles.unreadDot}></span>
                            )}
                          </h4>

                          <span
                            className={`${styles.statusBadge} ${
                              normalizeStatus(notif.status) === "pending" ||
                              normalizeStatus(notif.status) === "active" ||
                              normalizeStatus(notif.status) === "open"
                                ? isFireRelated
                                  ? styles.statusPending
                                  : styles.statusActive
                                : styles.statusResolved
                            }`}
                          >
                            {prettyStatus(notif.status)}
                          </span>
                        </div>

                        <p className={styles.notifDescription}>
                          {visual.description}
                        </p>

                        <div className={styles.notifMeta}>
                          <span>{visual.tag}</span>
                          <span>•</span>
                          <span>
                            {notif.timestamp?.seconds
                              ? new Date(
                                  notif.timestamp.seconds * 1000
                                ).toLocaleString()
                              : "Pending..."}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {filteredNotifications.length > 0 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
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

      {showModal && selectedNotif && (
        <div className={styles.modalOverlay} onClick={handleCloseModal}>
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const modalVisual = getNotificationVisuals(selectedNotif);
              const rawType = String(selectedNotif?.type || "").toLowerCase();
              const isFire = isFireRelatedNotification(selectedNotif);

              const status = normalizeStatus(selectedNotif.status || "Pending");

              const fireType =
                selectedNotif.type ||
                selectedNotif.alertType ||
                (selectedNotif.__source === "backup_requests"
                  ? "Backup Request"
                  : "Fire Alert");

              const teamDispatched =
                selectedNotif.teamName ||
                selectedNotif.assignedTeam ||
                selectedNotif.dispatchedTeam ||
                "N/A";

              const incidentDateValue =
                selectedNotif.incidentDate ||
                selectedNotif.fireIncidentDate ||
                selectedNotif.fireDate ||
                selectedNotif.timestamp ||
                null;

              const displayDateValue =
                status === "confirmed"
                  ? selectedNotif.confirmedAt ||
                    selectedNotif.confirmationDate ||
                    selectedNotif.timestamp
                  : status === "validated"
                  ? selectedNotif.validatedAt ||
                    selectedNotif.validationDate ||
                    selectedNotif.timestamp
                  : status === "dispatched"
                  ? selectedNotif.dispatchedAt ||
                    selectedNotif.dispatchDate ||
                    selectedNotif.timestamp
                  : selectedNotif.timestamp;

              const displayDateLabel =
                status === "confirmed"
                  ? "Confirmed Date"
                  : status === "validated"
                  ? "Validated Date"
                  : status === "dispatched"
                  ? "Dispatched Date"
                  : "Received Date";

              const formatDateTime = (value: any) => {
                if (!value) return "N/A";

                if (value?.seconds) {
                  return new Date(value.seconds * 1000).toLocaleString();
                }

                if (typeof value?.toDate === "function") {
                  return value.toDate().toLocaleString();
                }

                const parsed = new Date(value);
                return isNaN(parsed.getTime()) ? "N/A" : parsed.toLocaleString();
              };

              return (
                <>
                  <div className={styles.modalHeader}>
                    <div className={styles.modalHeaderIconBox}>
                      <div
                        className={`${styles.modalHeaderIcon} ${modalVisual.iconClass}`}
                      >
                        {modalVisual.icon}
                      </div>
                    </div>

                    <div className={styles.modalHeaderTitleBox}>
                      <h3 className={styles.modalTitle}>{modalVisual.title}</h3>
                      <p className={styles.modalSubtitle}>
                        {modalVisual.tag} Notification
                      </p>
                    </div>
                  </div>

                  <div className={styles.modalDivider}></div>

                  <div className={styles.modalDetails}>
                    <h4 className={styles.modalSectionTitle}>Details</h4>

                    <div className={styles.modalInfoGrid}>
                      <div className={styles.modalInfoRow}>
                        <span className={styles.modalLabel}>Status</span>
                        <span
                          className={`${styles.statusBadge} ${
                            normalizeStatus(selectedNotif.status) === "pending" ||
                            normalizeStatus(selectedNotif.status) === "active" ||
                            normalizeStatus(selectedNotif.status) === "open"
                              ? isFire
                                ? styles.statusPending
                                : styles.statusActive
                              : styles.statusResolved
                          }`}
                        >
                          {prettyStatus(selectedNotif.status || "Pending")}
                        </span>
                      </div>

                      {isFire && (
                        <>
                          <div className={styles.modalInfoRow}>
                            <span className={styles.modalLabel}>Fire Type</span>
                            <span className={styles.modalValue}>{fireType}</span>
                          </div>

                          <div className={styles.modalInfoRow}>
                            <span className={styles.modalLabel}>
                              {displayDateLabel}
                            </span>
                            <span className={styles.modalValue}>
                              {formatDateTime(displayDateValue)}
                            </span>
                          </div>

                          <div className={styles.modalInfoRow}>
                            <span className={styles.modalLabel}>Incident Date</span>
                            <span className={styles.modalValue}>
                              {formatDateTime(incidentDateValue)}
                            </span>
                          </div>

                          <div className={styles.modalInfoRow}>
                            <span className={styles.modalLabel}>Address</span>
                            <span className={styles.modalValue}>
                              {selectedNotif.userAddress ||
                                selectedNotif.address ||
                                selectedNotif.location ||
                                "N/A"}
                            </span>
                          </div>

                        </>
                      )}

                      {rawType.includes("validation") && (
                        <>
                          <div className={styles.modalInfoRow}>
                            <span className={styles.modalLabel}>Responder</span>
                            <span className={styles.modalValue}>
                              {selectedNotif.userName || "N/A"}
                            </span>
                          </div>

                          <div className={styles.modalInfoRow}>
                            <span className={styles.modalLabel}>Team</span>
                            <span className={styles.modalValue}>
                              {selectedNotif.teamName || "N/A"}
                            </span>
                          </div>
                        </>
                      )}

                      {rawType.includes("account") && (
                        <>
                          <div className={styles.modalInfoRow}>
                            <span className={styles.modalLabel}>Name</span>
                            <span className={styles.modalValue}>
                              {selectedNotif.userName || "N/A"}
                            </span>
                          </div>

                          <div className={styles.modalInfoRow}>
                            <span className={styles.modalLabel}>Email</span>
                            <span className={styles.modalValue}>
                              {selectedNotif.userEmail || "N/A"}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {modalVisual.description && (
                      <div className={styles.modalDescriptionBox}>
                        <span className={styles.modalLabel}>Description</span>
                        <p className={styles.desc}>{modalVisual.description}</p>
                      </div>
                    )}
                  </div>

                  <button className={styles.closeBtn} onClick={handleCloseModal}>
                    <span>Close</span>
                  </button>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationPage;