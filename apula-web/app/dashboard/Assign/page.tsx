"use client";

import React, { useEffect, useState } from "react";
import Lottie from "lottie-react";
import fireAnimation from "@/public/lottie/fire.json";
import AdminHeader from "@/components/shared/adminHeader";
import styles from "./tv.module.css";
import { FaSearch } from "react-icons/fa";

import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  writeBatch,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";

export default function AssignPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [responders, setResponders] = useState<any[]>([]);
  const [teamList, setTeamList] = useState<any[]>([]);
  const [vehicleList, setVehicleList] = useState<any[]>([]);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedResponderIds, setSelectedResponderIds] = useState<Set<string>>(
    new Set()
  );
  const [selectAll, setSelectAll] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [teamAssignments, setTeamAssignments] = useState<Record<string, string>>(
    {}
  );

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ---------------- LOAD DATA ----------------
  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(collection(db, "users"), where("role", "==", "responder")),
      (snap) => {
        setResponders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      }
    );

    const unsubTeams = onSnapshot(collection(db, "teams"), (snap) => {
      setTeamList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    const unsubVehicles = onSnapshot(collection(db, "vehicles"), (snap) => {
      setVehicleList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubTeams();
      unsubVehicles();
    };
  }, []);

  // ---------------- HELPERS ----------------
  const filteredResponders = responders.filter((r) =>
    (r.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getLeaderTeam = (responderId: string) =>
    teamList.find((t) => t.leaderId === responderId);

  const getLeaderVehicle = (teamId?: string) =>
    vehicleList.find((v) => v.assignedTeamId === teamId);

  const isLeader = (id: string) => teamList.some((t) => t.leaderId === id);

  const getAssignedTeam = (responder: any) => {
    const leaderTeam = getLeaderTeam(responder.id);

    return (
      leaderTeam ||
      teamList.find((t) => t.id === responder.teamId) ||
      teamList.find((t) => t.teamName === responder.teamName) ||
      null
    );
  };

  const getAssignedVehicle = (responder: any, team: any) => {
    const leaderTeam = getLeaderTeam(responder.id);

    return (
      getLeaderVehicle(leaderTeam?.id) ||
      vehicleList.find((v) => v.assignedTeamId === team?.id) ||
      vehicleList.find((v) => v.code === responder.vehicleCode) ||
      null
    );
  };

  const toggleResponder = (id: string) => {
    if (isLeader(id)) return;

    setSelectedResponderIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!selectAll) {
      const nonLeaders = responders
        .filter((r) => !isLeader(r.id))
        .map((r) => r.id);

      setSelectedResponderIds(new Set(nonLeaders));
      setSelectAll(true);
    } else {
      setSelectedResponderIds(new Set());
      setSelectAll(false);
    }
  };

  const updateTeam = (responderId: string, teamId: string) => {
    if (isLeader(responderId)) return;
    setTeamAssignments((prev) => ({ ...prev, [responderId]: teamId }));
  };

  const closeAssignModal = () => {
    setShowAssignModal(false);
  };

  // ---------------- SAVE ASSIGNMENTS ----------------
  const saveAssignments = async () => {
    if (selectedResponderIds.size === 0) {
      setErrorMessage("Please select at least one responder.");
      return;
    }

    const selected = responders.filter(
      (r) => selectedResponderIds.has(r.id) && !isLeader(r.id)
    );

    if (selected.length === 0) {
      setErrorMessage("No valid responders selected.");
      return;
    }

    const teamMembersMap: Record<string, any[]> = {};
    const changedTeamIds = new Set<string>();

    teamList.forEach((t) => {
      teamMembersMap[t.id] = (t.members || []).map((m: any) => ({ ...m }));
    });

    const userUpdates: Record<string, any> = {};

    selected.forEach((r) => {
      const oldTeamId: string = r.teamId || "";
      const newTeamId: string = teamAssignments[r.id] ?? r.teamId ?? "";

      const oldTeam = oldTeamId
        ? teamList.find((t) => t.id === oldTeamId)
        : null;

      const newTeam = newTeamId
        ? teamList.find((t) => t.id === newTeamId)
        : null;

      if (oldTeam && teamMembersMap[oldTeam.id]) {
        teamMembersMap[oldTeam.id] = teamMembersMap[oldTeam.id].filter(
          (m) => m.id !== r.id
        );
        changedTeamIds.add(oldTeam.id);
      }

      if (newTeam) {
        const list = teamMembersMap[newTeam.id] || [];
        if (!list.some((m: any) => m.id === r.id)) {
          list.push({
            id: r.id,
            name: r.name,
            status: r.status || "Available",
            teamName: newTeam.teamName,
          });
        }
        teamMembersMap[newTeam.id] = list;
        changedTeamIds.add(newTeam.id);
      }

      const vehicle = newTeam
        ? vehicleList.find((v) => v.assignedTeamId === newTeam.id)
        : null;

      userUpdates[r.id] = {
        teamId: newTeam?.id || "",
        teamName: newTeam?.teamName || "",
        vehicleId: vehicle?.id || "",
        vehicleCode: vehicle?.code || "",
        vehiclePlate: vehicle?.plate || "",
      };
    });

    try {
      const batch = writeBatch(db);

      changedTeamIds.forEach((teamId) => {
        const members = teamMembersMap[teamId] || [];
        batch.update(doc(db, "teams", teamId), { members });
      });

      Object.entries(userUpdates).forEach(([userId, fields]) => {
        batch.update(doc(db, "users", userId), fields);
      });

      await batch.commit();

      setShowAssignModal(false);
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 2000);
    } catch (error) {
      console.error("Error saving assignments:", error);
      setErrorMessage("Failed to save assignments.");
    }
  };

  // ---------------- UI ----------------
  return (
    <div className={styles.pageWrapper}>
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
        <div>
          <AdminHeader />

          <div style={{ position: "absolute", top: 20, right: 30 }}>
            <AlertBellButton />
          </div>

          <AlertDispatchModal />

          <div className={styles.container}>
            <div className={styles.contentSection}>
              <h2 className={styles.pageTitle}>Assign Member</h2>

          <div className={styles.searchWrapper}>
            <div className={styles.searchBox}>
              <FaSearch className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                placeholder="Search responders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <button
              className={styles.assignBtn}
              onClick={() => setShowAssignModal(true)}
            >
              <span>Assign Member</span>
            </button>
          </div>

          <table className={styles.userTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Team</th>
                <th>Truck</th>
              </tr>
            </thead>
            <tbody>
              {filteredResponders.map((r) => {
                const leaderTeam = getLeaderTeam(r.id);
                const assignedTeam = getAssignedTeam(r);
                const assignedVehicle = getAssignedVehicle(r, assignedTeam);

                return (
                  <tr key={r.id}>
                    <td>
                      {r.name}
                      {leaderTeam && (
                        <span style={{ color: "#c0392b", marginLeft: 8 }}>
                          (Leader)
                        </span>
                      )}
                    </td>
                    <td>{assignedTeam?.teamName || "Unassigned"}</td>
                    <td>{assignedVehicle?.code || "Unassigned"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ASSIGN MODAL */}
      {showAssignModal && (
        <div className={styles.modalOverlay} onClick={closeAssignModal}>
          <div
            className={styles.modalWide}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Assign Team</h3>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.selectAllRow}>
                <label>
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={toggleSelectAll}
                  />{" "}
                  Select All
                </label>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.responderTable}>
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Name</th>
                      <th>Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {responders.map((r) => {
                      const leader = isLeader(r.id);
                      return (
                        <tr key={r.id} style={{ opacity: leader ? 0.5 : 1 }}>
                          <td>
                            <input
                              type="checkbox"
                              disabled={leader}
                              checked={selectedResponderIds.has(r.id)}
                              onChange={() => toggleResponder(r.id)}
                            />
                          </td>
                          <td>
                            {r.name} {leader && "(Leader)"}
                          </td>
                          <td>
                            <select
                              disabled={leader}
                              value={teamAssignments[r.id] ?? r.teamId ?? ""}
                              onChange={(e) => updateTeam(r.id, e.target.value)}
                            >
                              <option value="">Unassigned</option>
                              {teamList.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.teamName}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.closeBtn} onClick={closeAssignModal}>
                <span>Close</span>
              </button>
              <button className={styles.assignBtn} onClick={saveAssignments}>
                <span>Save</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS MODAL */}
      {showSuccessModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.successModal}>
            <div className={styles.successIcon}>✔</div>
            <h3 className={styles.successTitle}>Member Assigned Successfully!</h3>
          </div>
        </div>
      )}

      {/* NOTICE MODAL */}
      {errorMessage && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Notice</h3>
            </div>

            <div className={styles.modalBody}>
              <p style={{ margin: 0, textAlign: "center", color: "black" }}>
                {errorMessage}
              </p>
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.closeBtn}
                onClick={() => setErrorMessage(null)}
              >
                <span>Okay</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )}
</div>
  );
}