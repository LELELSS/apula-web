"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  const [loading, setLoading] = useState(true);

  const [isAssignMode, setIsAssignMode] = useState(false);
  const [teamAssignments, setTeamAssignments] = useState<
    Record<string, string>
  >({});

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(
        collection(db, "users"),
        where("role", "==", "responder"),
        where("approved", "==", true),
      ),
      (snap) => {
        setResponders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
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

  const filteredResponders = useMemo(() => {
    const filtered = responders.filter((r) =>
      (r.name || "").toLowerCase().includes(searchTerm.toLowerCase()),
    );

    return [...filtered].sort((a, b) => {
      const aLeader = teamList.some((t) => t.leaderId === a.id);
      const bLeader = teamList.some((t) => t.leaderId === b.id);

      const aUnassigned =
        !String(a.teamId || "").trim() || !String(a.teamName || "").trim();
      const bUnassigned =
        !String(b.teamId || "").trim() || !String(b.teamName || "").trim();

      // 1. Unassigned first
      if (aUnassigned && !bUnassigned) return -1;
      if (!aUnassigned && bUnassigned) return 1;

      // 2. Leaders below unassigned
      if (!aUnassigned && !bUnassigned) {
        if (aLeader && !bLeader) return -1;
        if (!aLeader && bLeader) return 1;
      }

      // 3. Normal alphabetical order
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [responders, searchTerm, teamList]);

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

  const handleToggleAssignMode = () => {
    if (isAssignMode) {
      setIsAssignMode(false);
      setTeamAssignments({});
      return;
    }

    const initialAssignments: Record<string, string> = {};
    responders.forEach((r) => {
      const assignedTeam = getAssignedTeam(r);
      initialAssignments[r.id] = assignedTeam?.id || r.teamId || "";
    });

    setTeamAssignments(initialAssignments);
    setIsAssignMode(true);
  };

  const handleTeamChange = (responderId: string, teamId: string) => {
    setTeamAssignments((prev) => ({
      ...prev,
      [responderId]: teamId,
    }));
  };

  const hasChanges = useMemo(() => {
    return filteredResponders.some((r) => {
      if (isLeader(r.id)) return false;
      const currentTeamId = getAssignedTeam(r)?.id || r.teamId || "";
      const nextTeamId = teamAssignments[r.id] ?? currentTeamId;
      return currentTeamId !== nextTeamId;
    });
  }, [filteredResponders, teamAssignments, teamList, vehicleList]);

  const saveAssignments = async () => {
    const changedResponders = filteredResponders.filter((r) => {
      if (isLeader(r.id)) return false;
      const currentTeamId = getAssignedTeam(r)?.id || r.teamId || "";
      const nextTeamId = teamAssignments[r.id] ?? currentTeamId;
      return currentTeamId !== nextTeamId;
    });

    if (changedResponders.length === 0) {
      setErrorMessage("No changes were made.");
      return;
    }

    const teamMembersMap: Record<string, any[]> = {};
    teamList.forEach((t) => {
      teamMembersMap[t.id] = (t.members || []).map((m: any) => ({ ...m }));
    });

    try {
      const batch = writeBatch(db);

      for (const responder of changedResponders) {
        const oldTeamId =
          getAssignedTeam(responder)?.id || responder.teamId || "";
        const newTeamId = teamAssignments[responder.id] || "";

        const newTeam = newTeamId
          ? teamList.find((t) => t.id === newTeamId)
          : null;

        if (oldTeamId && teamMembersMap[oldTeamId]) {
          teamMembersMap[oldTeamId] = teamMembersMap[oldTeamId].filter(
            (m) => m.id !== responder.id,
          );
        }

        if (newTeam) {
          const list = teamMembersMap[newTeam.id] || [];
          if (!list.some((m: any) => m.id === responder.id)) {
            list.push({
              id: responder.id,
              name: responder.name,
              status: responder.status || "Available",
              teamName: newTeam.teamName,
            });
          }
          teamMembersMap[newTeam.id] = list;
        }

        const vehicle = newTeam
          ? vehicleList.find((v) => v.assignedTeamId === newTeam.id)
          : null;

        batch.update(doc(db, "users", responder.id), {
          teamId: newTeam?.id || "",
          teamName: newTeam?.teamName || "",
          vehicleId: vehicle?.id || "",
          vehicleCode: vehicle?.code || "",
          vehiclePlate: vehicle?.plate || "",
        });
      }

      Object.entries(teamMembersMap).forEach(([teamId, members]) => {
        batch.update(doc(db, "teams", teamId), { members });
      });

      await batch.commit();

      setIsAssignMode(false);
      setTeamAssignments({});
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Error saving assignments:", error);
      setErrorMessage("Failed to save assignments.");
    }
  };

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
            loop
            autoplay
            style={{ width: 160, height: 160 }}
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

              <hr className={styles.separator} />

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

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    className={styles.assignBtn}
                    onClick={handleToggleAssignMode}
                  >
                    <span>{isAssignMode ? "Cancel" : "Assign Member"}</span>
                  </button>

                  {isAssignMode && (
                    <button
                      className={styles.saveBtn}
                      onClick={saveAssignments}
                    >
                      <span>Save</span>
                    </button>
                  )}
                </div>
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
                    const selectedTeamId =
                      teamAssignments[r.id] ??
                      assignedTeam?.id ??
                      r.teamId ??
                      "";

                    const isUnassigned =
                      !String(r.teamId || "").trim() ||
                      !String(r.teamName || "").trim();

                    return (
                      <tr
                        key={r.id}
                        className={isUnassigned ? styles.unassignedRow : ""}
                      >
                        <td data-label="Name">
                          {r.name}
                          {leaderTeam && (
                            <span style={{ color: "#c0392b", marginLeft: 8 }}>
                              (Leader)
                            </span>
                          )}
                          {isUnassigned && (
                            <span className={styles.unassignedTag}>
                              Unassigned
                            </span>
                          )}
                        </td>

                        <td data-label="Team">
                          {isAssignMode && !isLeader(r.id) ? (
                            <select
                              className={styles.inlineSelect}
                              value={selectedTeamId}
                              onChange={(e) =>
                                handleTeamChange(r.id, e.target.value)
                              }
                            >
                              <option value="">Unassigned</option>
                              {teamList.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.teamName}
                                </option>
                              ))}
                            </select>
                          ) : (
                            assignedTeam?.teamName || "Unassigned"
                          )}
                        </td>

                        <td data-label="Truck">
                          {assignedVehicle?.code || "Unassigned"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {isAssignMode && !hasChanges && (
                <p
                  style={{
                    marginTop: "12px",
                    color: "#666",
                    fontSize: "14px",
                  }}
                >
                  Change a team assignment, then click Save.
                </p>
              )}
            </div>
          </div>

          {showSuccessModal && (
            <div className={styles.modalOverlay}>
              <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                  <h3 className={styles.modalTitle}>Success</h3>
                </div>

                <div className={styles.modalTextBody}>
                  <p style={{ margin: 0 }}>Member assigned successfully.</p>
                </div>

                <div className={styles.modalFooter}>
                  <button
                    className={styles.closeBtn}
                    onClick={() => setShowSuccessModal(false)}
                  >
                    <span>Okay</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className={styles.modalOverlay}>
              <div className={styles.modalContent}>
                <div className={styles.modalHeader}>
                  <h3 className={styles.modalTitle}>Notice</h3>
                </div>

                <div className={styles.modalTextBody}>
                  <p style={{ margin: 0 }}>{errorMessage}</p>
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
