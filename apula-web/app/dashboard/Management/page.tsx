"use client";

import { useEffect, useState } from "react";
import AdminHeader from "@/components/shared/adminHeader";
import styles from "./tnv.module.css";
import { FaUsers, FaTruck, FaInfoCircle } from "react-icons/fa";

import {
  collection,
  onSnapshot,
  query,
  where,
  doc,
  writeBatch,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";
import AdminTutorialChat from "@/components/Chatbot/AdminTutorialChat";

export default function TeamVehiclePage() {
  const [activeTab, setActiveTab] = useState<"teams" | "vehicles">("teams");

  const [teams, setTeams] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [responders, setResponders] = useState<any[]>([]);

  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);

  const [newTeamName, setNewTeamName] = useState("");
  const [selectedLeader, setSelectedLeader] = useState("");

  const [vehicleCode, setVehicleCode] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleTeam, setVehicleTeam] = useState("");

  const [editingTeam, setEditingTeam] = useState<any | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<{
    type: "team" | "vehicle";
    id: string;
  } | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewingTeam, setViewingTeam] = useState<any | null>(null);
  const getTeamTooltip = (team: any) => {
    const teamMembers = responders.filter((r) => r.teamId === team.id);
    const leaderName = team.leaderName || team.leader || "—";
    const others = teamMembers
      .filter((r) => r.id !== team.leaderId)
      .map((r) => r.name);

    return [
      `Leader: ${leaderName}`,
      others.length > 0 ? `Members: ${others.join(", ")}` : "Members: none",
    ].join("\n");
  };

  const openTeamView = (team: any) => {
    setViewingTeam({
      ...team,
      status: normalizeStatus(team.status || "Available"),
    });
  };

  const normalizeStatus = (raw: any) => {
    if (!raw) return "";
    const low = String(raw).toLowerCase();
    if (low === "active") return "Available";
    if (low === "available" || low === "dispatched" || low === "unavailable") {
      return raw;
    }
    return raw;
  };

  const getTableDescription = () => {
    if (activeTab === "teams") {
      return "This table displays all teams, including their assigned leader, number of members, and current status. Admins can manage team assignments, update status, or remove teams when necessary.";
    }

    return "This table displays all trucks and their assigned teams. It allows admins to monitor availability, update assignments, and manage vehicle deployment during operations.";
  };

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "teams"), (snap) => {
      setTeams(
        snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            ...data,
            status: normalizeStatus(data.status || "Available"),
          };
        }),
      );
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "vehicles"), (snap) => {
      setVehicles(
        snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            ...data,
            status: normalizeStatus(data.status || "Available"),
          };
        }),
      );
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "responder"));
    const unsub = onSnapshot(q, (snap) => {
      setResponders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const createTeam = async () => {
    if (!newTeamName.trim()) {
      setErrorMessage("Please enter team name.");
      return;
    }

    if (!selectedLeader) {
      setErrorMessage("Please select a leader.");
      return;
    }

    try {
      const leader = responders.find((r) => r.id === selectedLeader);
      if (!leader) {
        setErrorMessage("Selected leader not found.");
        return;
      }

      const existingLeaderTeam = teams.find((t) => t.leaderId === leader.id);

      if (existingLeaderTeam) {
        setErrorMessage(
          `${leader.name} is already assigned as leader of team ${existingLeaderTeam.teamName}.`,
        );
        return;
      }

      const batch = writeBatch(db);
      const teamRef = doc(collection(db, "teams"));

      batch.set(teamRef, {
        teamName: newTeamName.trim(),
        leaderId: leader.id,
        leaderName: leader.name,
        members: [
          {
            id: leader.id,
            name: leader.name,
            status: leader.status || "Available",
            teamName: newTeamName.trim(),
          },
        ],
        status: "Available",
        createdAt: serverTimestamp(),
      });

      batch.update(doc(db, "users", leader.id), {
        teamId: teamRef.id,
        teamName: newTeamName.trim(),
        vehicleId: "",
        vehicleCode: "",
        vehiclePlate: "",
        status: "Available",
      });

      await batch.commit();

      setNewTeamName("");
      setSelectedLeader("");
      setShowAddTeamModal(false);
      setSuccessMessage("Team created successfully.");
    } catch (err) {
      console.error(err);
      setErrorMessage("Error creating team.");
    }
  };

  const createVehicle = async () => {
    if (!vehicleCode.trim()) {
      setErrorMessage("Please enter vehicle code.");
      return;
    }

    if (!vehiclePlate.trim()) {
      setErrorMessage("Please enter plate number.");
      return;
    }

    if (!vehicleTeam.trim()) {
      setErrorMessage("Please select an assigned team.");
      return;
    }

    try {
      const batch = writeBatch(db);

      const teamDoc = teams.find((t) => t.id === vehicleTeam);
      const vehicleRef = doc(collection(db, "vehicles"));

      batch.set(vehicleRef, {
        code: vehicleCode.trim(),
        plate: vehiclePlate.trim(),
        assignedTeamId: vehicleTeam,
        assignedTeam: teamDoc ? teamDoc.teamName : "",
        status: "Available",
        createdAt: serverTimestamp(),
      });

      const usersQuery = query(
        collection(db, "users"),
        where("teamId", "==", vehicleTeam),
      );
      const usersSnap = await getDocs(usersQuery);

      usersSnap.docs.forEach((d) => {
        batch.update(doc(db, "users", d.id), {
          vehicleId: vehicleRef.id,
          vehicleCode: vehicleCode.trim(),
          vehiclePlate: vehiclePlate.trim(),
        });
      });

      await batch.commit();

      setVehicleCode("");
      setVehiclePlate("");
      setVehicleTeam("");
      setShowAddVehicleModal(false);
      setSuccessMessage("Vehicle added successfully.");
    } catch (err) {
      console.error(err);
      setErrorMessage("Error adding vehicle.");
    }
  };

  const openEditTeam = (team: any) => {
    setEditingTeam({
      ...team,
      status: normalizeStatus(team.status || "Available"),
    });
  };

  const saveEditTeam = async () => {
    if (!viewingTeam) return;

    try {
      const oldTeam = teams.find((t) => t.id === viewingTeam.id);
      const oldLeaderId = oldTeam?.leaderId || "";

      const teamRef = doc(db, "teams", viewingTeam.id);
      const batch = writeBatch(db);

      const newLeaderId = viewingTeam.leaderId;
      const newLeader = responders.find((r) => r.id === newLeaderId);

      if (!newLeaderId || !newLeader) {
        setErrorMessage("Please select a leader.");
        return;
      }

      // Build the new members array: same member list, just swap who's marked leader
      const currentTeamMembers = responders.filter(
        (r) => r.teamId === viewingTeam.id,
      );
      const updatedMembers = currentTeamMembers.map((m) => ({
        id: m.id,
        name: m.name,
        status:
          m.id === newLeaderId
            ? viewingTeam.status || "Available"
            : m.status || "Available",
        teamName: viewingTeam.teamName,
      }));

      batch.update(teamRef, {
        teamName: viewingTeam.teamName,
        leaderId: newLeaderId,
        leaderName: newLeader.name,
        members: updatedMembers,
        status: viewingTeam.status,
      });

      const respondersQuery = query(
        collection(db, "users"),
        where("teamId", "==", viewingTeam.id),
      );
      const respondersSnap = await getDocs(respondersQuery);

      respondersSnap.docs.forEach((userDoc) => {
        batch.update(doc(db, "users", userDoc.id), {
          teamName: viewingTeam.teamName,
          // only the new leader's status follows the team status change;
          // everyone else keeps their own current status
          ...(userDoc.id === newLeaderId ? { status: viewingTeam.status } : {}),
        });
      });

      const vehiclesQuery = query(
        collection(db, "vehicles"),
        where("assignedTeamId", "==", viewingTeam.id),
      );
      const vehiclesSnap = await getDocs(vehiclesQuery);

      vehiclesSnap.docs.forEach((vehicleDoc) => {
        batch.update(doc(db, "vehicles", vehicleDoc.id), {
          assignedTeam: viewingTeam.teamName,
          status: viewingTeam.status,
        });
      });

      await batch.commit();

      setViewingTeam(null);
      setSuccessMessage("Team updated successfully.");
    } catch (err) {
      console.error(err);
      setErrorMessage("Error updating team.");
    }
  };

  const deleteTeam = async (teamId: string) => {
    try {
      const usersQuery = query(
        collection(db, "users"),
        where("teamId", "==", teamId),
      );
      const usersSnap = await getDocs(usersQuery);

      const vehiclesQuery = query(
        collection(db, "vehicles"),
        where("assignedTeamId", "==", teamId),
      );
      const vehiclesSnap = await getDocs(vehiclesQuery);

      const batch = writeBatch(db);

      usersSnap.docs.forEach((d) => {
        batch.update(doc(db, "users", d.id), {
          teamId: "",
          teamName: "",
          vehicleId: "",
          vehicleCode: "",
          vehiclePlate: "",
          status: "Available",
        });
      });

      vehiclesSnap.docs.forEach((d) => {
        batch.update(doc(db, "vehicles", d.id), {
          assignedTeamId: "",
          assignedTeam: "",
          status: "Available",
        });
      });

      batch.delete(doc(db, "teams", teamId));

      await batch.commit();
    } catch (err) {
      console.error(err);
      setErrorMessage("Error deleting team.");
    }
  };

  const openEditVehicle = (v: any) => {
    setEditingVehicle({
      id: v.id,
      code: v.code || "",
      plate: v.plate || "",
      assignedTeamId: v.assignedTeamId || "",
      status: normalizeStatus(v.status || "Available"),
    });
    setShowAddVehicleModal(false);
  };

  const saveEditVehicle = async () => {
    if (!editingVehicle) return;

    try {
      const batch = writeBatch(db);
      const vehicleRef = doc(db, "vehicles", editingVehicle.id);

      const oldVehicle = vehicles.find((v) => v.id === editingVehicle.id);
      const oldAssignedTeamId = oldVehicle?.assignedTeamId || "";

      const newTeam = teams.find((t) => t.id === editingVehicle.assignedTeamId);

      batch.update(vehicleRef, {
        code: editingVehicle.code,
        plate: editingVehicle.plate,
        assignedTeamId: newTeam?.id || "",
        assignedTeam: newTeam?.teamName || "",
        status: editingVehicle.status || "Available",
      });

      if (
        oldAssignedTeamId &&
        oldAssignedTeamId !== editingVehicle.assignedTeamId
      ) {
        const oldUsersQuery = query(
          collection(db, "users"),
          where("teamId", "==", oldAssignedTeamId),
        );
        const oldUsersSnap = await getDocs(oldUsersQuery);

        oldUsersSnap.docs.forEach((d) => {
          batch.update(doc(db, "users", d.id), {
            vehicleId: "",
            vehicleCode: "",
            vehiclePlate: "",
          });
        });
      }

      if (newTeam) {
        const newUsersQuery = query(
          collection(db, "users"),
          where("teamId", "==", newTeam.id),
        );
        const newUsersSnap = await getDocs(newUsersQuery);

        newUsersSnap.docs.forEach((d) => {
          batch.update(doc(db, "users", d.id), {
            vehicleId: editingVehicle.id,
            vehicleCode: editingVehicle.code,
            vehiclePlate: editingVehicle.plate,
          });
        });
      }

      await batch.commit();
      setEditingVehicle(null);
      setSuccessMessage("Vehicle updated successfully.");
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to update vehicle.");
    }
  };

  const deleteVehicle = async (vehicleId: string) => {
    try {
      const q = query(
        collection(db, "users"),
        where("vehicleId", "==", vehicleId),
      );
      const snap = await getDocs(q);
      const batch = writeBatch(db);

      snap.docs.forEach((d) => {
        const uref = doc(db, "users", d.id);
        batch.update(uref, {
          vehicleId: "",
          vehicleCode: "",
          vehiclePlate: "",
        });
      });

      const vref = doc(db, "vehicles", vehicleId);
      batch.delete(vref);

      await batch.commit();
    } catch (err) {
      console.error(err);
      setErrorMessage("Error deleting vehicle.");
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;

    try {
      if (confirmDelete.type === "team") {
        await deleteTeam(confirmDelete.id);
        setSuccessMessage("Team deleted successfully.");
        if (viewingTeam?.id === confirmDelete.id) setViewingTeam(null);
      } else {
        await deleteVehicle(confirmDelete.id);
        setSuccessMessage("Vehicle deleted successfully.");
      }
    } catch (e) {
      setErrorMessage("Delete failed. Check connection.");
    }

    setConfirmDelete(null);
  };

  return (
    <div className={styles.pageWrapper}>
      <AdminHeader />

      <AlertBellButton />
      <AdminTutorialChat />

      <AlertDispatchModal />

      <div className={styles.container}>
        <div className={styles.contentSection}>
          <h2 className={styles.pageTitle}>Team & Truck Management</h2>
          <hr className={styles.separator} />

          <div
            className={styles.tabContainer}
            style={{ display: "flex", gap: 8 }}
          >
            <button
              className={`${styles.tabBtn} ${
                activeTab === "teams" ? styles.activeTab : ""
              }`}
              onClick={() => setActiveTab("teams")}
            >
              <FaUsers /> Teams
            </button>

            <button
              className={`${styles.tabBtn} ${
                activeTab === "vehicles" ? styles.activeTab : ""
              }`}
              onClick={() => setActiveTab("vehicles")}
            >
              <FaTruck /> Trucks
            </button>
          </div>

          {activeTab === "teams" && (
            <>
              <div className={styles.tableInfoBox}>
                <FaInfoCircle className={styles.infoIcon} />
                <p className={styles.tableInfoText}>{getTableDescription()}</p>
              </div>

              <div
                className={styles.headerRow}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h3 className={styles.subTitle}>Teams</h3>
                <div>
                  <button
                    className={styles.addBtn}
                    onClick={() => setShowAddTeamModal(true)}
                  >
                    + Add Team
                  </button>
                </div>
              </div>

              <table
                className={styles.dataTable}
                style={{ width: "100%", borderCollapse: "collapse" }}
              >
                <thead>
                  <tr>
                    <th>Team Name</th>
                    <th>Members</th>
                    <th>Leader</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {[...teams]
                    .sort((a, b) =>
                      (a.teamName ?? "").localeCompare(b.teamName ?? ""),
                    )
                    .map((team) => {
                      const memberCount = responders.filter(
                        (r) => r.teamId === team.id,
                      ).length;

                      return (
                        <tr
                          key={team.id}
                          onClick={() => openTeamView(team)}
                          style={{ cursor: "pointer" }}
                        >
                          <td data-label="Team Name">{team.teamName}</td>
                          <td data-label="Members" title={getTeamTooltip(team)}>
                            <span>
                              {memberCount}
                            </span>
                          </td>
                          <td data-label="Leader">
                            {team.leaderName || team.leader || "—"}
                          </td>
                          <td data-label="Status">
                            <span
                              className={
                                team.status === "Dispatched"
                                  ? styles.statusDispatched
                                  : team.status === "Unavailable"
                                    ? styles.statusUnavailable
                                    : styles.statusAvailable
                              }
                            >
                              {team.status}
                            </span>
                          </td>
                          <td data-label="Action">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openTeamView(team);
                              }}
                              className={styles.editBtn}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </>
          )}

          {activeTab === "vehicles" && (
            <>
              <div className={styles.tableInfoBox}>
                <FaInfoCircle className={styles.infoIcon} />
                <p className={styles.tableInfoText}>{getTableDescription()}</p>
              </div>

              <div
                className={styles.headerRow}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h3 className={styles.subTitle}>Vehicles</h3>
                <div>
                  <button
                    className={styles.addBtn}
                    onClick={() => {
                      setShowAddVehicleModal(true);
                      setEditingVehicle(null);
                    }}
                  >
                    + Add Truck
                  </button>
                </div>
              </div>

              <table
                className={styles.dataTable}
                style={{ width: "100%", borderCollapse: "collapse" }}
              >
                <thead>
                  <tr>
                    <th>Vehicle Code</th>
                    <th>Plate Number</th>
                    <th>Team Assigned</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {[...vehicles]
                    .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""))
                    .map((v) => (
                      <tr key={v.id}>
                        <td data-label="Vehicle Code">{v.code}</td>
                        <td data-label="Plate Number">{v.plate}</td>
                        <td data-label="Team Assigned">
                          {v.assignedTeam ||
                            teams.find((t) => t.id === v.assignedTeamId)
                              ?.teamName ||
                            "—"}
                        </td>

                        <td data-label="Status">
                          <span
                            className={
                              v.status === "Dispatched"
                                ? styles.statusDispatched
                                : v.status === "Unavailable"
                                  ? styles.statusUnavailable
                                  : styles.statusAvailable
                            }
                          >
                            {v.status}
                          </span>
                        </td>

                        <td data-label="Action">
                          <button
                            onClick={() => openEditVehicle(v)}
                            className={styles.editBtn}
                          >
                            Edit
                          </button>

                          <button
                            onClick={() =>
                              setConfirmDelete({ type: "vehicle", id: v.id })
                            }
                            className={styles.deleteBtn}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {viewingTeam && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Team Details</h3>

            <label className={styles.label}>Team Name</label>
            <input
              className={styles.input}
              type="text"
              value={viewingTeam.teamName}
              onChange={(e) =>
                setViewingTeam((s: any) => ({ ...s, teamName: e.target.value }))
              }
            />

            <label className={styles.label}>Team Leader</label>
            <select
              className={styles.input}
              value={viewingTeam.leaderId}
              onChange={(e) =>
                setViewingTeam((s: any) => ({ ...s, leaderId: e.target.value }))
              }
            >
              <option value="">Select Leader</option>
              {responders
                .filter((r) => r.teamId === viewingTeam.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>

            <label className={styles.label}>Status</label>
            <select
              className={styles.input}
              value={viewingTeam.status}
              onChange={(e) =>
                setViewingTeam((s: any) => ({ ...s, status: e.target.value }))
              }
            >
              <option value="Available">Available</option>
              <option value="Dispatched">Dispatched</option>
              <option value="Unavailable">Unavailable</option>
            </select>

            <p style={{ marginTop: 16, marginBottom: 8 }}>
              <b>Other Members:</b>
            </p>

            <ul style={{ marginBottom: 20, paddingLeft: 20 }}>
              {responders
                .filter(
                  (r) =>
                    r.teamId === viewingTeam.id &&
                    r.id !== viewingTeam.leaderId,
                )
                .map((r) => (
                  <li key={r.id}>
                    {r.name}
                    {r.status ? ` — ${r.status}` : ""}
                  </li>
                ))}

              {responders.filter(
                (r) =>
                  r.teamId === viewingTeam.id && r.id !== viewingTeam.leaderId,
              ).length === 0 && <li>No other members.</li>}
            </ul>

            <div className={styles.modalActions}>
              <button className={styles.saveBtn} onClick={saveEditTeam}>
                Save Changes
              </button>

              <button
                className={styles.deleteBtn}
                onClick={() =>
                  setConfirmDelete({ type: "team", id: viewingTeam.id })
                }
              >
                Delete Team
              </button>

              <button
                className={styles.closeBtn}
                onClick={() => setViewingTeam(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddTeamModal && !editingTeam && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Add Team</h3>

            <label className={styles.label}>Team Name</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Enter team name"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
            />

            <label className={styles.label}>Team Leader</label>
            <select
              className={styles.input}
              value={selectedLeader}
              onChange={(e) => setSelectedLeader(e.target.value)}
            >
              <option value="">Select Leader</option>
              {responders
                .filter((r) => !teams.some((t) => t.leaderId === r.id))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>

            <div className={styles.modalActions}>
              <button className={styles.saveBtn} onClick={createTeam}>
                Create Team
              </button>
              <button
                className={styles.closeBtn}
                onClick={() => setShowAddTeamModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editingTeam && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Edit Team</h3>

            <label className={styles.label}>Team Name</label>
            <input
              className={styles.input}
              type="text"
              value={editingTeam.teamName}
              onChange={(e) =>
                setEditingTeam((s: any) => ({
                  ...s,
                  teamName: e.target.value,
                }))
              }
            />

            <label className={styles.label}>Team Leader</label>
            <select
              className={styles.input}
              value={editingTeam.leaderId}
              onChange={(e) =>
                setEditingTeam((s: any) => ({
                  ...s,
                  leaderId: e.target.value,
                }))
              }
            >
              <option value="">Select Leader</option>
              {responders
                .filter(
                  (r) =>
                    !teams.some(
                      (t) => t.leaderId === r.id && t.id !== editingTeam.id,
                    ),
                )
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>

            <label className={styles.label}>Status</label>
            <select
              className={styles.input}
              value={editingTeam.status}
              onChange={(e) =>
                setEditingTeam((s: any) => ({
                  ...s,
                  status: e.target.value,
                }))
              }
            >
              <option value="Available">Available</option>
              <option value="Dispatched">Dispatched</option>
              <option value="Unavailable">Unavailable</option>
            </select>

            <div className={styles.modalActions}>
              <button className={styles.saveBtn} onClick={saveEditTeam}>
                Save Changes
              </button>
              <button
                className={styles.closeBtn}
                onClick={() => setEditingTeam(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddVehicleModal && !editingVehicle && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Add Vehicle</h3>

            <label className={styles.label}>Vehicle Code</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Enter vehicle code"
              value={vehicleCode}
              onChange={(e) => setVehicleCode(e.target.value)}
            />

            <label className={styles.label}>Plate Number</label>
            <input
              className={styles.input}
              type="text"
              placeholder="Enter plate number"
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value)}
            />

            <label className={styles.label}>Team Assigned</label>
            <select
              className={styles.input}
              value={vehicleTeam}
              onChange={(e) => setVehicleTeam(e.target.value)}
            >
              <option value="">Select Team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.teamName}
                </option>
              ))}
            </select>

            <div className={styles.modalActions}>
              <button className={styles.saveBtn} onClick={createVehicle}>
                Add Vehicle
              </button>
              <button
                className={styles.closeBtn}
                onClick={() => setShowAddVehicleModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editingVehicle && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Edit Vehicle</h3>

            <label className={styles.label}>Vehicle Code</label>
            <input
              className={styles.input}
              type="text"
              value={editingVehicle.code}
              onChange={(e) =>
                setEditingVehicle((s: any) => ({
                  ...s,
                  code: e.target.value,
                }))
              }
            />

            <label className={styles.label}>Plate Number</label>
            <input
              className={styles.input}
              type="text"
              value={editingVehicle.plate}
              onChange={(e) =>
                setEditingVehicle((s: any) => ({
                  ...s,
                  plate: e.target.value,
                }))
              }
            />

            <label className={styles.label}>Assign to Team</label>
            <select
              className={styles.input}
              value={editingVehicle.assignedTeamId}
              onChange={(e) =>
                setEditingVehicle((s: any) => ({
                  ...s,
                  assignedTeamId: e.target.value,
                }))
              }
            >
              <option value="">No team</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.teamName}
                </option>
              ))}
            </select>

            <label className={styles.label}>Status</label>
            <select
              className={styles.input}
              value={editingVehicle.status}
              onChange={(e) =>
                setEditingVehicle((s: any) => ({
                  ...s,
                  status: e.target.value,
                }))
              }
            >
              <option value="Available">Available</option>
              <option value="Dispatched">Dispatched</option>
              <option value="Unavailable">Unavailable</option>
            </select>

            <div className={styles.modalActions}>
              <button className={styles.saveBtn} onClick={saveEditVehicle}>
                Save Changes
              </button>
              <button
                className={styles.closeBtn}
                onClick={() => setEditingVehicle(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Confirm Delete</h3>

            <p
              style={{ marginBottom: 20, textAlign: "center", color: "black" }}
            >
              Are you sure you want to delete this{" "}
              <b>{confirmDelete.type === "team" ? "Team" : "Vehicle"}</b>? This
              action cannot be undone.
            </p>

            <div className={styles.modalActions}>
              <button
                className={styles.saveBtn}
                style={{ background: "#dc3545" }}
                onClick={handleConfirmDelete}
              >
                Yes, Delete
              </button>

              <button
                className={styles.closeBtn}
                onClick={() => setConfirmDelete(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Success</h3>

            <p
              style={{ marginBottom: 20, textAlign: "center", color: "black" }}
            >
              {successMessage}
            </p>

            <div className={styles.modalActions}>
              <div className={styles.okayBtnWrapper}>
                <button
                  className={styles.okayBtn}
                  onClick={() => setSuccessMessage(null)}
                >
                  <span>Okay</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>Error</h3>

            <p
              style={{ marginBottom: 20, textAlign: "center", color: "black" }}
            >
              {errorMessage}
            </p>

            <div className={styles.modalActions}>
              <button
                className={styles.closeBtn}
                onClick={() => setErrorMessage(null)}
              >
                Okay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
