"use client";

import React, { useEffect, useState } from "react";
import AdminHeader from "@/components/shared/adminHeader";
import styles from "./dispatch.module.css";
import { FaSearch, FaTruck } from "react-icons/fa";

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
} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";

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

const normalizeIncident = (id: string, data: any, source: "alerts" | "backup_requests") => ({
  id,
  ...data,
  __source: source,
  __isBackupRequest: source === "backup_requests",
  __baseAlertId: source === "backup_requests" ? String(data?.alertId || "") : id,
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
    "Unknown",
  userContact:
    data?.userContact ||
    data?.contact ||
    data?.phone ||
    data?.requestedByEmail ||
    "",
  userAddress:
    data?.userAddress ||
    data?.address ||
    data?.location ||
    data?.alertLocation ||
    data?.stationName ||
    "",
  timestamp:
    data?.timestamp ||
    data?.createdAt ||
    data?.requestedAt ||
    null,
});

/**
 * DispatchPage
 *
 * Option A: annotated / commented version — includes:
 *  - dispatchResponders updates (responders, alert, dispatch record)
 *  - team + vehicle status updates on dispatch
 *  - auto-reset logic:
 *      A) if team leader becomes Available -> reset team + vehicle + team members
 *      B) if ALL responders in a team are Available -> reset team + vehicle + team members
 *
 * Notes about assumptions:
 *  - responders documents may contain either `teamId` or `teamName` (we handle both).
 *  - teams documents contain at least { id, teamName, leaderId }.
 *  - vehicles documents contain at least { id, code, assignedTeam, assignedTeamId }.
 *  - "status" string values used: "Available", "Dispatched", "Unavailable"
 */

const DispatchPage: React.FC = () => {
  // UI states
  const [searchTerm, setSearchTerm] = useState("");
  const [responders, setResponders] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]); // <-- added teams realtime
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // dispatch flow states
  const [pendingDispatchIds, setPendingDispatchIds] = useState<Set<string> | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [showResponderModal, setShowResponderModal] = useState(false);
  const [selectedResponderIds, setSelectedResponderIds] = useState<Set<string>>(new Set());
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [selectedDispatch, setSelectedDispatch] = useState<any>(null);
const [showDispatchInfoModal, setShowDispatchInfoModal] = useState(false);


const viewDispatchInfo = async (teamName: string) => {
  type DispatchRecord = {
    id: string;
    status?: string;
    responders?: Array<{ teamName?: string }>;
    [key: string]: unknown;
  };

  const snap = await getDocs(
  query(
    collection(db, "dispatches"),
    orderBy("timestamp", "desc")
  )
);

const latest = snap.docs
  .map((d) => ({ id: d.id, ...(d.data() as Omit<DispatchRecord, "id">) }) as DispatchRecord)
  .find(d =>
    d.status === "Dispatched" &&
    d.responders?.some((r: any) => r.teamName === teamName || r.team === teamName)
  );


  if (!latest) {
    alert("No dispatch record found for this team.");
    return;
  }

  setSelectedDispatch(latest);
  setShowDispatchInfoModal(true);
};



  
  

  // ---------------------------
  // Load responders (real-time)
  // ---------------------------
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "users"), where("role", "==", "responder")),
      (snap) => {
        setResponders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // ---------------------------
  // Load vehicles (real-time)
  // ---------------------------
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "vehicles"), (snap) => {
      setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // ---------------------------
  // Load teams (real-time)
  // ---------------------------
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "teams"), (snap) => {
      setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // ---------------------------
  // Filtering (search by team or vehicle or status)
  // ---------------------------
  const filteredResponders = responders.filter((r) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;

    // r.teamName is used in many places in your code — fallback to empty string
    const rTeamName = (r.teamName || "").toLowerCase();

    return (
      rTeamName.includes(term) ||
      vehicles.some(
        (v) =>
          (v.assignedTeam || "").toLowerCase() === rTeamName &&
          (v.code || "").toLowerCase().includes(term)
      ) ||
      (r.status || "").toLowerCase().includes(term)
    );
  });

  // ---------------------------
  // Group responders by teamName + vehicle assigned to team
  // ---------------------------
 const groupedList = teams
  .map(team => {
    // ✅ take only responders that belong to THIS team
    const members = filteredResponders.filter(r => r.teamId === team.id);

    // ❌ skip teams with NO members
    if (members.length === 0) return null;

    // ✅ find vehicle assigned to this team
    const vehicle =
      vehicles.find(v => v.assignedTeamId === team.id)?.code || "Unassigned";

    const statuses = members.map(m => m.status);

    let status = "Unavailable";
    if (statuses.some(s => s === "Available")) status = "Available";
    if (statuses.every(s => s === "Dispatched")) status = "Dispatched";

    return {
      team: team.teamName,
      vehicle,
      responders: members,
      status
    };
  })
  .filter(Boolean); // ✅ removes nulls


  // ---------------------------
  // Open alert modal (fetch pending alerts)
  // ---------------------------
  const openAlertModal = async () => {
    const [alertsSnap, backupSnap] = await Promise.all([
      getDocs(
        query(collection(db, "alerts"), where("status", "==", "Pending"), orderBy("timestamp", "desc"))
      ),
      getDocs(collection(db, "backup_requests")),
    ]);

    const pending = [
      ...alertsSnap.docs.map((d) => normalizeIncident(d.id, d.data(), "alerts")),
      ...backupSnap.docs
        .map((d) => normalizeIncident(d.id, d.data(), "backup_requests"))
        .filter((item) => isOpenBackupRequest(item)),
    ].sort((a, b) => timestampToMillis(b.timestamp) - timestampToMillis(a.timestamp));

    if (pending.length === 0) {
      window.alert("No pending alerts found.");
      return;
    }

    setAlerts(pending);
  };

  // Select alert for dispatch
  const selectAlertForDispatch = (alert: any) => {
    setSelectedAlert(alert);

    if (pendingDispatchIds) {
      setSelectedResponderIds(new Set(pendingDispatchIds));
      setPendingDispatchIds(null);
    }

    setShowResponderModal(true);
    setAlerts([]);
  };

  // Toggle responder checkbox inside confirmation modal
  const toggleResponder = (id: string) => {
    setSelectedResponderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // ---------------------------
  // Dispatch responders
  // - updates:
  //    * create a dispatch record
  //    * set selected users status -> "Dispatched"
  //    * set alert status -> "Dispatched"
  //    * set team.status and vehicle.status -> "Dispatched" for affected teams/vehicles
  // ---------------------------
  const dispatchResponders = async () => {
    if (!selectedAlert) return alert("Select an alert first.");

    if (selectedResponderIds.size === 0) return alert("Please select at least one responder.");

    // Only dispatch responders who are still Available
    const respondersList = responders.filter(
      (r) => selectedResponderIds.has(r.id) && r.status === "Available"
    );
    if (respondersList.length === 0) return alert("No available responders selected.");

    try {
      const batch = writeBatch(db);
      const currentUser = auth.currentUser;

      let dispatchedByName = "Admin Panel";
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            dispatchedByName =
              data.name || currentUser.displayName || currentUser.email || "Admin Panel";
          } else {
            dispatchedByName = currentUser.displayName || currentUser.email || "Admin Panel";
          }
        } catch (error) {
          console.error("Error reading dispatcher name:", error);
          dispatchedByName = currentUser.displayName || currentUser.email || "Admin Panel";
        }
      }

      const responderEmails = respondersList.map((r) => (r.email || "").toLowerCase());

      // create dispatch document
      const dispatchRef = doc(collection(db, "dispatches"));

      batch.set(dispatchRef, {
        alertId: selectedAlert.__baseAlertId || selectedAlert.alertId || selectedAlert.id,
        backupRequestId: selectedAlert.__isBackupRequest ? selectedAlert.id : "",
        alertType: selectedAlert.type,
        alertLocation: selectedAlert.location,
        snapshotUrl: selectedAlert.snapshotUrl || null,
        dispatchType: selectedAlert.__isBackupRequest ? "Backup" : "Primary",
        isBackup: Boolean(selectedAlert.__isBackupRequest),
        requestSource: selectedAlert.__source || "alerts",
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

      // update each responder doc -> Dispatched
      respondersList.forEach((r) => {
        batch.update(doc(db, "users", r.id), { status: "Dispatched" });
      });

      // update alert doc -> Dispatched
      batch.update(
        doc(
          db,
          selectedAlert.__source === "backup_requests" ? "backup_requests" : "alerts",
          selectedAlert.id
        ),
        { status: "Dispatched", dispatchStatus: "Dispatched" }
      );

      // update teams & vehicles to Dispatched
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
            (v.assignedTeamId && teams.find((tt) => tt.id === v.assignedTeamId && tt.teamName === tname))
          ) {
            batch.update(doc(db, "vehicles", v.id), { status: "Dispatched" });
          }
        });
      });

      await batch.commit();

      setShowResponderModal(false);
      setSelectedResponderIds(new Set());
      setSelectedAlert(null);
      setShowSuccessModal(true);

      setTimeout(() => setShowSuccessModal(false), 2500);
    } catch (err) {
      console.error("Dispatch error:", err);
      alert("Error dispatching responders.");
    }
  };

  // ---------------------------
  // Click dispatch button in main table (collect available responders in group)
  // ---------------------------
  const handleDispatchTeam = (group: any) => {
    const availableIds = group.responders.filter((r: any) => r.status === "Available").map((r: any) => r.id);

    if (availableIds.length === 0) {
      return alert("No available responders to dispatch.");
    }

    setPendingDispatchIds(new Set(availableIds));
    openAlertModal();
  };

  // ---------------------------
  // AUTO-RESET LOGIC (runs whenever responders, teams or vehicles change)
  //
  // Conditions:
  //  A) If the team leader becomes Available -> reset all team members, the team doc, and its assigned vehicle to "Available"
  //  B) If ALL responders in a team are Available -> same reset
  //
  // Important: this uses a batch and will update all affected docs atomically for each team.
  // ---------------------------
  useEffect(() => {
    // need data to be loaded first
    if (responders.length === 0 || teams.length === 0 || vehicles.length === 0) return;

    // Iterate teams and decide whether to reset
    teams.forEach((team) => {
      // team may have fields: id, teamName, leaderId
      const teamId = team.id;
      const teamName = team.teamName || "";

      // gather members (match by teamId OR teamName)
      const teamMembers = responders.filter((r) => {
        if (r.teamId && teamId) return r.teamId === teamId;
        return (r.teamName || "") === teamName;
      });

      if (teamMembers.length === 0) return;

      // find leader (by leaderId)
      const leaderId = team.leaderId;
      const leader = leaderId ? teamMembers.find((m) => m.id === leaderId) : undefined;

      const leaderResolved = leader && leader.status === "Available";
      const allAvailable = teamMembers.every((m) => m.status === "Available");

      // if neither condition true => skip
      if (!leaderResolved && !allAvailable) return;

      // else perform reset for this team
      const batch = writeBatch(db);

      // Reset all team members to Available (only if they aren't already)
      teamMembers.forEach((m) => {
        if (m.status !== "Available") {
          batch.update(doc(db, "users", m.id), { status: "Available" });
        }
      });

      // Reset team doc status
      batch.update(doc(db, "teams", teamId), { status: "Available" });

      // Reset associated vehicle (find by assignedTeam OR assignedTeamId)
      const vehicle = vehicles.find(
        (v) =>
          (v.assignedTeam && v.assignedTeam === teamName) ||
          (v.assignedTeamId && v.assignedTeamId === teamId)
      );

      if (vehicle) {
        batch.update(doc(db, "vehicles", vehicle.id), { status: "Available" });
      }

      // commit the reset for this team
      batch.commit().catch((err) => console.error("Auto-reset commit failed:", err));
      // console log for debugging
      console.log(`Auto-reset applied for team ${teamName} (leaderResolved=${!!leaderResolved}, allAvailable=${allAvailable})`);
    });
  }, [responders, teams, vehicles]);

  // ---------------------------
  // UI
  // ---------------------------
  return (
    <div className={styles.pageWrapper}>
      <AdminHeader />

      <div style={{ position: "absolute", top: 20, right: 30 }}>
        <AlertBellButton />
      </div>

      {/* Note: you already have an AlertDispatchModal component in your project.
          Keeping it here but the page's own logic also supports team/vehicle updates. */}
      <AlertDispatchModal />

      <div className={styles.container}>
        <div className={styles.contentSection}>
          <h2 className={styles.pageTitle}>Team & Truck Dispatch</h2>
          <hr className={styles.separator} />

          {/* SEARCH */}
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

          {/* GROUP TABLE */}
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
                  <td colSpan={5} style={{ textAlign: "center", padding: 20 }}>
                    Loading...
                  </td>
                </tr>
              ) : groupedList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 20 }}>
                    No groups found.
                  </td>
                </tr>
              ) : (
                groupedList.map((group: any, idx: number) => (
                  <tr key={idx}>
                    <td>{group.team}</td>
                    <td>{group.vehicle}</td>
                    <td>{group.responders.length}</td>
                    <td>
                      <span
                        className={
                          group.status === "Available"
                            ? styles.statusAvailable
                            : group.status === "Dispatched"
                            ? styles.statusDispatched
                            : styles.statusUnavailable
                        }
                      >
                        {group.status}
                      </span>
                    </td>
                    <td>
                      {group.status === "Available" && (
                        <button
                          className={styles.dispatchBtn}
                          onClick={() => handleDispatchTeam(group)}
                        >
                          <FaTruck /> Dispatch Team
                        </button>
                      )}

                      {group.status === "Dispatched" && (
                        <button
                          className={styles.viewBtn}
                          onClick={() => viewDispatchInfo(group.team)}
                        >
                          View Alert
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

      {/* MODALS + SUCCESS */}
      {alerts.length > 0 && !showResponderModal && selectedAlert === null && (
        <div className={styles.modalOverlay} onClick={() => setAlerts([])}>
          <div className={styles.modalWide} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Select Alert</h3>

            <div className={styles.tableScroll}>
              <table className={styles.alertTable}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Reporter</th>
                    <th>Contact</th>
                    <th>Address</th>
                    <th>Select</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.__isBackupRequest ? "Backup Request" : a.type}</td>
                      <td>{a.userName}</td>
                      <td>{a.userContact}</td>
                      <td>{a.userAddress}</td>
                      <td>
                        <button className={styles.assignBtn} onClick={() => selectAlertForDispatch(a)}>
                          Select
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className={styles.closeBtn} onClick={() => setAlerts([])}>
              Close
            </button>
          </div>
        </div>
      )}

      {showResponderModal && (
        <div className={styles.modalOverlay} onClick={() => setShowResponderModal(false)}>
          <div className={styles.modalWide} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Confirm Responders</h3>

            <p>
              <strong>Alert:</strong> {selectedAlert?.type || "Manual"} — {selectedAlert?.location}
            </p>

            <div className={styles.tableScroll}>
              <table className={styles.responderTable}>
                <thead>
                  <tr>
                    <th>Select</th>
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
                        <td>
                          <input type="checkbox" checked={selectedResponderIds.has(r.id)} onChange={() => toggleResponder(r.id)} />
                        </td>
                        <td>{r.name}</td>
                        <td>{r.contact || "—"}</td>
                        <td>{r.teamName || r.team || "Unassigned"}</td>

                        <td>
                          <span
                            className={
                              r.status === "Available"
                                ? styles.statusAvailable
                                : r.status === "Dispatched"
                                ? styles.statusDispatched
                                : styles.statusUnavailable
                            }
                          >
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <button className={styles.assignBtn} onClick={dispatchResponders}>
              Dispatch Selected
            </button>
            <button className={styles.closeBtn} onClick={() => setShowResponderModal(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.successModal}>
            <div className={styles.successIcon}>✔</div>
            <h3>Dispatch Successful!</h3>
          </div>
        </div>
      )}
      {showDispatchInfoModal && selectedDispatch && (
  <div className={styles.modalOverlay} onClick={() => setShowDispatchInfoModal(false)}>
    <div className={styles.modalWide} onClick={(e) => e.stopPropagation()}>
     <h3 className={styles.modalTitle}>Dispatch Details</h3>

<div className={styles.section}>
  <p><strong>Alert Type:</strong> {selectedDispatch.alertType}</p>
  <p><strong>Location:</strong> {selectedDispatch.alertLocation}</p>
  <p><strong>Dispatched By:</strong> {selectedDispatch.dispatchedBy}</p>
  <p>
    <strong>Time:</strong>{" "}
    {selectedDispatch.timestamp
      ? new Date(selectedDispatch.timestamp.seconds * 1000).toLocaleString()
      : "—"}
  </p>
</div>

<hr className={styles.divider} />

<div className={styles.section}>
  <h4>Reported By:</h4>
  <p><strong>Name:</strong> {selectedDispatch.userReported}</p>
  <p><strong>Contact:</strong> {selectedDispatch.userContact}</p>
  <p><strong>Email:</strong> {selectedDispatch.userEmail}</p>
  <p><strong>Address:</strong> {selectedDispatch.userAddress}</p>
</div>

<hr className={styles.divider} />

<div className={styles.section}>
  <h4>Responders:</h4>
  <ul className={styles.responderList}>
    {selectedDispatch.responders?.map((r: any) => (
      <li key={r.id}>
        <strong>{r.name}</strong> — {r.teamName}  
        <br />
        <small>{r.contact} | {r.email}</small>
      </li>
    ))}
  </ul>
</div>


      <button className={styles.closeBtn} onClick={() => setShowDispatchInfoModal(false)}>
        Close
      </button>
    </div>
  </div>
)}

    </div>
    
  );
  
};



export default DispatchPage;
