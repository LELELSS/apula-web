"use client";

import React, { useEffect, useState } from "react";
import AdminHeader from "@/components/shared/adminHeader";
import styles from "./dispatch.module.css";
import { FaSearch, FaTruck, FaInfoCircle } from "react-icons/fa";

import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  addDoc,
  updateDoc,
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";
import AdminTutorialChat from "@/components/Chatbot/AdminTutorialChat";
import { logActivity } from "@/lib/activityLog";

const normalizeStatus = (value: unknown) =>
  String(value || "").trim().toLowerCase();

const timestampToMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
};

const normalizeIncident = (id: string, data: any) => ({
  id,
  ...data,
  __source: "alerts",
  __baseAlertId: id,
  type: data?.type || data?.alertType || "Fire Alert",
  location:
    data?.location ||
    data?.alertLocation ||
    data?.userAddress ||
    data?.address ||
    "Unknown Location",
  userName: data?.userName || data?.reportedBy || "Unknown",
  userContact: data?.userContact || data?.contact || data?.phone || "",
  userAddress:
    data?.userAddress ||
    data?.address ||
    data?.location ||
    data?.alertLocation ||
    "",
  timestamp: data?.timestamp || data?.createdAt || null,
  status: data?.status || "Pending",
});

const getBaseType = (alert: any) => {
  const typeRaw = (alert?.type || alert?.alertType || "").toLowerCase();

  if (typeRaw.includes("panic")) return "Manual Alert";
  return "Fire Alert";
};

const getTypeBadge = (alert: any) => {
  const typeRaw = (alert?.type || alert?.alertType || "").toLowerCase();

  if (typeRaw.includes("panic")) return "Manual alert";
  if (typeRaw.includes("confirmed")) return "Confirmed by user";
  if (typeRaw.includes("no user response") || typeRaw.includes("unverified")) {
    return "No user response";
  }

  return null;
};

const DispatchPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [responders, setResponders] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [pendingDispatchIds, setPendingDispatchIds] = useState<Set<string> | null>(
    null,
  );
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [showResponderModal, setShowResponderModal] = useState(false);
  const [selectedResponderIds, setSelectedResponderIds] = useState<Set<string>>(
    new Set(),
  );
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [selectedDispatch, setSelectedDispatch] = useState<any>(null);
  const [showDispatchInfoModal, setShowDispatchInfoModal] = useState(false);

  const getPageDescription = () => {
    if (showResponderModal && selectedAlert) {
      return "This page is used to dispatch available responder teams. Select a fire alert, review the selected team members, then proceed with dispatch.";
    }

    return "This page displays all responder teams together with their assigned truck and current dispatch status. Use this page to dispatch available teams to active fire alerts.";
  };

  const getStatusClass = (status: string) => {
    if (status === "Available") return styles.statusAvailable;
    if (status === "Dispatched") return styles.statusDispatched;
    return styles.statusUnavailable;
  };

  const closeResponderModal = () => {
    setShowResponderModal(false);
    setSelectedAlert(null);
    setSelectedResponderIds(new Set());
    setPendingDispatchIds(null);
  };

  const closeAlertModal = () => {
    setAlerts([]);
    setPendingDispatchIds(null);
    setSelectedAlert(null);
  };

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "users"), where("role", "==", "responder")),
      (snap) => {
        setResponders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "vehicles"), (snap) => {
      setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "teams"), (snap) => {
      setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const filteredResponders = responders.filter((r) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;

    const rTeamName = (r.teamName || "").toLowerCase();

    return (
      rTeamName.includes(term) ||
      vehicles.some(
        (v) =>
          (v.assignedTeam || "").toLowerCase() === rTeamName &&
          (v.code || "").toLowerCase().includes(term),
      ) ||
      (r.status || "").toLowerCase().includes(term)
    );
  });

  const groupedList = teams
    .map((team) => {
      const members = filteredResponders.filter((r) => r.teamId === team.id);
      if (members.length === 0) return null;

      const vehicle =
        vehicles.find((v) => v.assignedTeamId === team.id)?.code || "Unassigned";

      const statuses = members.map((m) => m.status);

      let status = "Unavailable";
      if (statuses.some((s) => s === "Available")) status = "Available";
      if (statuses.every((s) => s === "Dispatched")) status = "Dispatched";

      return {
        team: team.teamName,
        vehicle,
        responders: members,
        status,
      };
    })
    .filter(Boolean);

  const openAlertModal = async () => {
    const alertsSnap = await getDocs(
      query(collection(db, "alerts"), orderBy("timestamp", "desc")),
    );

    const pending = alertsSnap.docs
      .map((d) => normalizeIncident(d.id, d.data()))
      .filter((item) => normalizeStatus(item.status) === "pending")
      .sort(
        (a, b) => timestampToMillis(b.timestamp) - timestampToMillis(a.timestamp),
      );

    if (pending.length === 0) {
      window.alert("No pending alerts found.");
      return;
    }

    setAlerts(pending);
  };

  const selectAlertForDispatch = (alert: any) => {
    setSelectedAlert(alert);

    if (pendingDispatchIds) {
      setSelectedResponderIds(new Set(pendingDispatchIds));
      setPendingDispatchIds(null);
    }

    setShowResponderModal(true);
    setAlerts([]);
  };

  const viewDispatchInfo = async (teamName: string) => {
    type DispatchRecord = {
      id: string;
      status?: string;
      responders?: Array<{ teamName?: string; team?: string }>;
      [key: string]: unknown;
    };

    const snap = await getDocs(
      query(collection(db, "dispatches"), orderBy("timestamp", "desc")),
    );

    const latest = snap.docs
      .map(
        (d) =>
          ({ id: d.id, ...(d.data() as Omit<DispatchRecord, "id">) }) as DispatchRecord,
      )
      .find(
        (d) =>
          d.status === "Dispatched" &&
          d.responders?.some(
            (r: any) => r.teamName === teamName || r.team === teamName,
          ),
      );

    if (!latest) {
      alert("No dispatch record found for this team.");
      return;
    }

    setSelectedDispatch(latest);
    setShowDispatchInfoModal(true);
  };

  const dispatchResponders = async () => {
    if (!selectedAlert) return alert("Select an alert first.");
    if (selectedResponderIds.size === 0) {
      return alert("No team members selected for dispatch.");
    }

    const respondersList = responders.filter(
      (r) => selectedResponderIds.has(r.id) && r.status === "Available",
    );
    if (respondersList.length === 0) {
      return alert("No available responders selected.");
    }

    try {
      const baseAlertId = selectedAlert.id;
      const batch = writeBatch(db);
      const currentUser = auth.currentUser;

      let dispatchedByName = "Admin Panel";
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            dispatchedByName =
              data.name ||
              currentUser.displayName ||
              currentUser.email ||
              "Admin Panel";
          } else {
            dispatchedByName =
              currentUser.displayName || currentUser.email || "Admin Panel";
          }
        } catch (error) {
          console.error("Error reading dispatcher name:", error);
          dispatchedByName =
            currentUser.displayName || currentUser.email || "Admin Panel";
        }
      }

      const responderEmails = respondersList.map((r) =>
        (r.email || "").toLowerCase(),
      );

      const dispatchRef = doc(collection(db, "dispatches"));

      batch.set(dispatchRef, {
        alertId: baseAlertId,
        alertType: selectedAlert.type,
        alertLocation: selectedAlert.location,
        snapshotUrl: selectedAlert.snapshotUrl || null,
        snapshotBase64: selectedAlert.snapshotBase64 || null,
        dispatchType: "Primary",
        isBackup: false,
        requestSource: "alerts",
        responders: respondersList.map((r) => ({
          id: r.id,
          name: r.name,
          email: (r.email || "").toLowerCase(),
          contact: r.contact || "",
          teamName: r.teamName || r.team || "Unassigned",
        })),
        responderEmails,
        userReported: selectedAlert.userName,
        userAddress: selectedAlert.userAddress,
        userContact: selectedAlert.userContact,
        userEmail: selectedAlert.userEmail,
        status: "Dispatched",
        timestamp: serverTimestamp(),
        dispatchedBy: dispatchedByName,
      });

      respondersList.forEach((r) => {
        batch.update(doc(db, "users", r.id), { status: "Dispatched" });
      });

      batch.update(doc(db, "alerts", selectedAlert.id), {
        status: "Dispatched",
        dispatchStatus: "Dispatched",
      });

      const affectedTeamIds = new Set<string>();
      const affectedTeamNames = new Set<string>();

      respondersList.forEach((r) => {
        if (r.teamId) affectedTeamIds.add(r.teamId);
        if (r.teamName) affectedTeamNames.add(r.teamName);
        if (!r.teamName && r.team) affectedTeamNames.add(r.team);
      });

      affectedTeamIds.forEach((tid) => {
        const t = teams.find((x) => x.id === tid);
        if (t) batch.update(doc(db, "teams", t.id), { status: "Dispatched" });
      });

      affectedTeamNames.forEach((tname) => {
        const t = teams.find((x) => (x.teamName || "") === tname);
        if (t) batch.update(doc(db, "teams", t.id), { status: "Dispatched" });
      });

      affectedTeamNames.forEach((tname) => {
        vehicles.forEach((v) => {
          if (
            (v.assignedTeam || "") === tname ||
            (v.assignedTeamId &&
              teams.find(
                (tt) => tt.id === v.assignedTeamId && tt.teamName === tname,
              ))
          ) {
            batch.update(doc(db, "vehicles", v.id), {
              status: "Dispatched",
            });
          }
        });
      });

      await batch.commit();

      await addDoc(collection(db, "notifications"), {
        type: "Monitoring Notice",
        status: "Monitored",
        message: `Fire event is now being monitored by ${dispatchedByName}.`,
        alertId: baseAlertId,
        location: selectedAlert.location || selectedAlert.userAddress || "",
        userName: selectedAlert.userName || "System",
        userAddress: selectedAlert.userAddress || selectedAlert.location || "",
        userContact: selectedAlert.userContact || "",
        userEmail: selectedAlert.userEmail || "",
        readBy: [],
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      try {
        await updateDoc(doc(db, "alerts", baseAlertId), {
          monitoringStatus: "Monitored",
          monitoringMessage: `Fire event is being monitored by ${dispatchedByName}.`,
          monitoringUpdatedAt: serverTimestamp(),
          monitoredBy: dispatchedByName,
        });
      } catch {}

      if (currentUser) {
        await logActivity({
          actorUid: currentUser.uid,
          actorEmail: currentUser.email || "",
          actorName: dispatchedByName,
          actorRole: "admin",
          action: "dispatch_event_monitored",
          targetId: String(baseAlertId),
          targetType: "alert",
          details: "Dispatched responders and marked event as monitored.",
          path: "/dashboard/dispatch",
        });
      }

      closeResponderModal();
      setShowSuccessModal(true);

      setTimeout(() => setShowSuccessModal(false), 2500);
    } catch (err) {
      console.error("Dispatch error:", err);
      alert("Error dispatching responders.");
    }
  };

  const handleDispatchTeam = (group: any) => {
    const availableIds = group.responders
      .filter((r: any) => r.status === "Available")
      .map((r: any) => r.id);

    if (availableIds.length === 0) {
      return alert("No available responders to dispatch.");
    }

    setPendingDispatchIds(new Set(availableIds));
    openAlertModal();
  };

  useEffect(() => {
    if (responders.length === 0 || teams.length === 0 || vehicles.length === 0) {
      return;
    }

    teams.forEach((team) => {
      const teamId = team.id;
      const teamName = team.teamName || "";

      const teamMembers = responders.filter((r) => {
        if (r.teamId && teamId) return r.teamId === teamId;
        return (r.teamName || "") === teamName;
      });

      if (teamMembers.length === 0) return;

      const leaderId = team.leaderId;
      const leader = leaderId
        ? teamMembers.find((m) => m.id === leaderId)
        : undefined;

      const leaderResolved = leader && leader.status === "Available";
      const allAvailable = teamMembers.every((m) => m.status === "Available");

      if (!leaderResolved && !allAvailable) return;

      const batch = writeBatch(db);

      teamMembers.forEach((m) => {
        if (m.status !== "Available") {
          batch.update(doc(db, "users", m.id), { status: "Available" });
        }
      });

      batch.update(doc(db, "teams", teamId), { status: "Available" });

      const vehicle = vehicles.find(
        (v) =>
          (v.assignedTeam && v.assignedTeam === teamName) ||
          (v.assignedTeamId && v.assignedTeamId === teamId),
      );

      if (vehicle) {
        batch.update(doc(db, "vehicles", vehicle.id), {
          status: "Available",
        });
      }

      batch
        .commit()
        .catch((err) => console.error("Auto-reset commit failed:", err));
    });
  }, [responders, teams, vehicles]);

  return (
    <div className={styles.pageWrapper}>
      <AdminHeader />

      <AlertBellButton />
      <AdminTutorialChat />

      <AlertDispatchModal />

      <div className={styles.container}>
        <div className={styles.contentSection}>
          <h2 className={styles.pageTitle}>Team & Truck Dispatch</h2>
          <hr className={styles.separator} />

          <div className={styles.infoBox}>
            <FaInfoCircle className={styles.infoIcon} />
            <p className={styles.infoText}>{getPageDescription()}</p>
          </div>

          <div className={styles.searchWrapper}>
            <FaSearch className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search team or vehicle..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.userTable}>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Truck</th>
                  <th>Members</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyTableMessage}>
                      Loading...
                    </td>
                  </tr>
                ) : groupedList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyTableMessage}>
                      No groups found.
                    </td>
                  </tr>
                ) : (
                  groupedList.map((group: any, idx: number) => (
                    <tr
                      key={idx}
                      className={
                        group.status === "Dispatched" ? styles.clickableRow : ""
                      }
                    >
                      <td data-label="Team">{group.team}</td>
                      <td data-label="Truck">{group.vehicle}</td>
                      <td data-label="Members">{group.responders.length}</td>
                      <td data-label="Status">
                        <span className={getStatusClass(group.status)}>
                          {group.status}
                        </span>
                      </td>
                      <td data-label="Action">
                        {group.status === "Available" && (
                          <button
                            className={styles.dispatchBtn}
                            onClick={() => handleDispatchTeam(group)}
                          >
                            <span>
                              <FaTruck /> Dispatch Team
                            </span>
                          </button>
                        )}

                        {group.status === "Dispatched" && (
                          <button
                            className={styles.viewBtn}
                            onClick={() => viewDispatchInfo(group.team)}
                          >
                            <span>View Alert</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {alerts.length > 0 && !showResponderModal && selectedAlert === null && (
        <div className={styles.modalOverlay} onClick={closeAlertModal}>
          <div className={styles.modalWide} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Select Alert</h3>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.tableScroll}>
                <table className={styles.alertTable}>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Reporter</th>
                      <th>Contact</th>
                      <th>Address</th>
                      <th>Time</th>
                      <th>Select</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((a) => (
                      <tr key={a.id}>
                        <td data-label="Type">
                          <div className={styles.typeWrapper}>
                            <span className={styles.typeText}>
                              {getBaseType(a)}
                            </span>
                            {getTypeBadge(a) && (
                              <span className={styles.typeBadgeAlt}>
                                {getTypeBadge(a)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td data-label="Reporter">{a.userName}</td>
                        <td data-label="Contact">{a.userContact}</td>
                        <td
                          data-label="Address"
                          className={styles.addressCell}
                          title={a.userAddress}
                        >
                          {a.userAddress && a.userAddress.length > 40
                            ? a.userAddress.substring(0, 40) + "..."
                            : a.userAddress}
                        </td>
                        <td data-label="Time">
                          {a.timestamp?.seconds
                            ? new Date(a.timestamp.seconds * 1000).toLocaleString()
                            : "Unknown"}
                        </td>
                        <td data-label="Select">
                          <button
                            className={styles.assignBtn}
                            onClick={() => selectAlertForDispatch(a)}
                          >
                            <span>Select</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.closeBtn} onClick={closeAlertModal}>
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showResponderModal && (
        <div className={styles.modalOverlay} onClick={closeResponderModal}>
          <div className={styles.modalWide} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Dispatch Team Members</h3>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.tableScroll}>
                <table className={styles.responderTable}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Contact</th>
                      <th>Team</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {responders
                      .filter((r) => selectedResponderIds.has(r.id))
                      .map((r) => (
                        <tr key={r.id}>
                          <td data-label="Name">{r.name}</td>
                          <td data-label="Contact">{r.contact || "—"}</td>
                          <td data-label="Team">
                            {r.teamName || r.team || "Unassigned"}
                          </td>
                          <td data-label="Status">
                            <span className={getStatusClass(r.status)}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.assignBtn} onClick={dispatchResponders}>
                <span>Dispatch Selected</span>
              </button>
              <button className={styles.closeBtn} onClick={closeResponderModal}>
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.successModal}>
            <div className={styles.successIcon}>✔</div>
            <h3 className={styles.successTitle}>Dispatch Successful!</h3>
            <p className={styles.successMessage}>
              The selected responders have been dispatched successfully.
            </p>
          </div>
        </div>
      )}

      {showDispatchInfoModal && selectedDispatch && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowDispatchInfoModal(false)}
        >
          <div className={styles.modalWide} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Dispatch Details</h3>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.alertPreviewInfo}>
                <p>
                  <strong>Alert Type:</strong> {selectedDispatch.alertType}
                </p>
                <p>
                  <strong>Location:</strong> {selectedDispatch.alertLocation}
                </p>
                <p>
                  <strong>Dispatched By:</strong> {selectedDispatch.dispatchedBy}
                </p>
                <p>
                  <strong>Time:</strong>{" "}
                  {selectedDispatch.timestamp
                    ? new Date(
                        selectedDispatch.timestamp.seconds * 1000,
                      ).toLocaleString()
                    : "—"}
                </p>
              </div>

              <div className={styles.alertPreviewInfo}>
                <p>
                  <strong>Reported By:</strong> {selectedDispatch.userReported}
                </p>
                <p>
                  <strong>Contact:</strong> {selectedDispatch.userContact}
                </p>
                <p>
                  <strong>Email:</strong> {selectedDispatch.userEmail}
                </p>
                <p>
                  <strong>Address:</strong> {selectedDispatch.userAddress}
                </p>
              </div>

              <div className={styles.alertPreviewInfo}>
                <p>
                  <strong>Responders:</strong>
                </p>
                <ul className={styles.responderList}>
                  {selectedDispatch.responders?.map((r: any) => (
                    <li key={r.id}>
                      <strong>{r.name}</strong> — {r.teamName}
                      <br />
                      <small>
                        {r.contact} | {r.email}
                      </small>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.closeBtn}
                onClick={() => setShowDispatchInfoModal(false)}
              >
                <span>Close</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DispatchPage;