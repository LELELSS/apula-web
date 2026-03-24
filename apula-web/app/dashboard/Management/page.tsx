"use client";

import { useEffect, useState } from "react";
import AdminHeader from "@/components/shared/adminHeader";
import styles from "./tnv.module.css";
import { FaUsers, FaTruck } from "react-icons/fa";

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

export default function TeamVehiclePage() {
  const [activeTab, setActiveTab] = useState<"teams" | "vehicles">("teams");

  const [teams, setTeams] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [responders, setResponders] = useState<any[]>([]);

  // Add modals
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);

  // Add inputs
  const [newTeamName, setNewTeamName] = useState("");
  const [selectedLeader, setSelectedLeader] = useState("");

  const [vehicleCode, setVehicleCode] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleTeam, setVehicleTeam] = useState("");

  // Edit modals
  const [editingTeam, setEditingTeam] = useState<any | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);

  // DELETE CONFIRM MODAL STATE
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "team" | "vehicle";
    id: string;
  } | null>(null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ------------------------------------------
  // Helpers
  // ------------------------------------------
  const normalizeStatus = (raw: any) => {
    if (!raw) return "";
    const low = String(raw).toLowerCase();
    if (low === "active") return "Available";
    if (low === "available" || low === "dispatched" || low === "unavailable") {
      return raw;
    }
    return raw;
  };

  // ------------------------------------------
  // Load Teams
  // ------------------------------------------
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

  // ------------------------------------------
  // Load Vehicles
  // ------------------------------------------
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

  // ------------------------------------------
  // Load Responders
  // ------------------------------------------
  useEffect(() => {
    const q = query(collection(db, "users"), where("role", "==", "responder"));
    const unsub = onSnapshot(q, (snap) => {
      setResponders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // ------------------------------------------
  // Create team
  // ------------------------------------------
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

      // ✅ prevent assigning a responder who is already a leader
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

  // ------------------------------------------
  // Create vehicle
  // ------------------------------------------
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

  // ------------------------------------------
  // Open Edit Team modal
  // ------------------------------------------
  const openEditTeam = (team: any) => {
    setEditingTeam({
      ...team,
      status: normalizeStatus(team.status || "Available"),
    });
  };

  // ------------------------------------------
  // Save edited team
  // ------------------------------------------
  const saveEditTeam = async () => {
    if (!editingTeam) return;

    try {
      const oldTeam = teams.find((t) => t.id === editingTeam.id);
      const oldLeaderId = oldTeam?.leaderId || "";

      const teamRef = doc(db, "teams", editingTeam.id);
      const batch = writeBatch(db);

      const newLeaderId = editingTeam.leaderId;
      const newLeader = responders.find((r) => r.id === newLeaderId);

      if (!newLeaderId) {
        setErrorMessage("Please select a leader.");
        return;
      }

      if (!newLeader) {
        setErrorMessage("Selected leader not found.");
        return;
      }

      // ✅ prevent assigning a responder who is already a leader of another team
      const existingLeaderTeam = teams.find(
        (t) => t.leaderId === newLeaderId && t.id !== editingTeam.id,
      );

      if (existingLeaderTeam) {
        setErrorMessage(
          `${newLeader.name} is already assigned as leader of team ${existingLeaderTeam.teamName}.`,
        );
        return;
      }

      const updatedMembers = [
        {
          id: newLeader.id,
          name: newLeader.name,
          status: editingTeam.status || "Available",
          teamName: editingTeam.teamName,
        },
      ];

      batch.update(teamRef, {
        teamName: editingTeam.teamName,
        leaderId: newLeaderId,
        leaderName: newLeader.name,
        members: updatedMembers,
        status: editingTeam.status,
      });

      const respondersQuery = query(
        collection(db, "users"),
        where("teamId", "==", editingTeam.id),
      );
      const respondersSnap = await getDocs(respondersQuery);

      respondersSnap.docs.forEach((userDoc) => {
        batch.update(doc(db, "users", userDoc.id), {
          teamName: editingTeam.teamName,
          status: editingTeam.status,
        });
      });

      if (oldLeaderId && oldLeaderId !== newLeaderId) {
        batch.update(doc(db, "users", oldLeaderId), {
          teamId: "",
          teamName: "",
          vehicleId: "",
          vehicleCode: "",
          vehiclePlate: "",
          status: "Available",
        });
      }

      batch.update(doc(db, "users", newLeader.id), {
        teamId: editingTeam.id,
        teamName: editingTeam.teamName,
        status: editingTeam.status,
      });

      const vehiclesQuery = query(
        collection(db, "vehicles"),
        where("assignedTeamId", "==", editingTeam.id),
      );
      const vehiclesSnap = await getDocs(vehiclesQuery);

      vehiclesSnap.docs.forEach((vehicleDoc) => {
        batch.update(doc(db, "vehicles", vehicleDoc.id), {
          assignedTeam: editingTeam.teamName,
          status: editingTeam.status,
        });
      });

      await batch.commit();

      setEditingTeam(null);
      setSuccessMessage("Team updated successfully.");
    } catch (err) {
      console.error(err);
      setErrorMessage("Error updating team.");
    }
  };

  // ------------------------------------------
  // Delete team
  // ------------------------------------------
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

  // ------------------------------------------
  // Open Edit Vehicle modal
  // ------------------------------------------
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

  // ------------------------------------------
  // Save edited vehicle
  // ------------------------------------------
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

  // ------------------------------------------
  // Delete vehicle
  // ------------------------------------------
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
                    onClick={() => {
                      setShowAddTeamModal(true);
                      setEditingTeam(null);
                    }}
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
                  {teams.map((team) => {
                    const memberCount = responders.filter(
                      (r) => r.teamId === team.id,
                    ).length;

                    return (
                      <tr key={team.id}>
                        <td>{team.teamName}</td>
                        <td>{memberCount}</td>
                        <td>{team.leaderName || team.leader || "—"}</td>
                        <td>
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

                        <td>
                          <button
                            onClick={() => openEditTeam(team)}
                            style={{
                              marginRight: 8,
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "none",
                              background: "#f0ad4e",
                              color: "#fff",
                              cursor: "pointer",
                            }}
                          >
                            Edit
                          </button>

                          <button
                            onClick={() =>
                              setConfirmDelete({ type: "team", id: team.id })
                            }
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "none",
                              background: "#dc3545",
                              color: "#fff",
                              cursor: "pointer",
                            }}
                          >
                            Delete
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
                  {vehicles.map((v) => (
                    <tr key={v.id}>
                      <td>{v.code}</td>
                      <td>{v.plate}</td>
                      <td>
                        {v.assignedTeam ||
                          teams.find((t) => t.id === v.assignedTeamId)
                            ?.teamName ||
                          "—"}
                      </td>

                      <td>
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

                      <td>
                        <button
                          onClick={() => openEditVehicle(v)}
                          style={{
                            marginRight: 8,
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "none",
                            background: "#f0ad4e",
                            color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          Edit
                        </button>

                        <button
                          onClick={() =>
                            setConfirmDelete({ type: "vehicle", id: v.id })
                          }
                          style={{
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "none",
                            background: "#dc3545",
                            color: "#fff",
                            cursor: "pointer",
                          }}
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

      {/* ADD TEAM MODAL */}
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

      {/* EDIT TEAM MODAL */}
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

      {/* ADD VEHICLE MODAL */}
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

      {/* EDIT VEHICLE MODAL */}
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

      {/* CONFIRM DELETE MODAL */}
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

      {/* SUCCESS MODAL */}
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

      {/* ERROR MODAL */}
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
