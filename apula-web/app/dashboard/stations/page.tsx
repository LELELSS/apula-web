"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import AdminHeader from "@/components/shared/adminHeader";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";
import styles from "./stations.module.css";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type StationRecord = {
  id: string;
  name: string;
  address?: string;
  addressNormalized?: string;
  latitude?: number;
  longitude?: number;
  teamIds?: string[];
  teamNames?: string[];
  vehicleIds?: string[];
  vehicleCodes?: string[];
};

type LatLngValue = {
  lat: number;
  lng: number;
};

const StationMapPicker = dynamic(() => import("./StationMapPicker"), {
  ssr: false,
});

export default function StationsPage() {
  const [stations, setStations] = useState<StationRecord[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);

  const [showAddStationModal, setShowAddStationModal] = useState(false);
  const [stationName, setStationName] = useState("");
  const [stationAddress, setStationAddress] = useState("");
  const [stationCoordinates, setStationCoordinates] = useState<LatLngValue | null>(null);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);

  const [editingStation, setEditingStation] = useState<StationRecord | null>(null);
  const [editStationName, setEditStationName] = useState("");
  const [editStationAddress, setEditStationAddress] = useState("");

  const [selectedStationId, setSelectedStationId] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubStations = onSnapshot(collection(db, "stations"), (snap) => {
      setStations(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StationRecord, "id">) }))
      );
    });

    const unsubTeams = onSnapshot(collection(db, "teams"), (snap) => {
      setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubVehicles = onSnapshot(collection(db, "vehicles"), (snap) => {
      setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubStations();
      unsubTeams();
      unsubVehicles();
    };
  }, []);

  const sortedStations = useMemo(
    () => [...stations].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [stations]
  );

  const availableVehicles = useMemo(
    () => vehicles.filter((vehicle) => !String(vehicle.stationId || "").trim()),
    [vehicles]
  );

  const editingStationVehicleIds = useMemo(() => {
    if (!editingStation) {
      return [] as string[];
    }
    return editingStation.vehicleIds || [];
  }, [editingStation]);

  useEffect(() => {
    if (!selectedVehicleId) {
      return;
    }

    const stillAvailable = availableVehicles.some((vehicle) => vehicle.id === selectedVehicleId);
    if (!stillAvailable) {
      setSelectedVehicleId("");
    }
  }, [availableVehicles, selectedVehicleId]);

  const reverseGeocode = async (coords: LatLngValue) => {
    try {
      const response = await fetch(
        `/api/reverse-geocode?lat=${coords.lat}&lng=${coords.lng}`
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(
          result?.error || "Map pin saved. Please enter or confirm the address manually."
        );
        return;
      }

      if (result?.display_name) {
        setStationAddress(result.display_name);
        setSuccessMessage("Map pin saved and address updated.");
      } else {
        setSuccessMessage("Map pin saved. Please confirm the address manually.");
      }
    } catch {
      setSuccessMessage("Map pin saved. Please enter or confirm the address manually.");
    }
  };

  const searchAddressOnMap = async () => {
    if (!stationAddress.trim()) {
      setErrorMessage("Please enter an address first.");
      return;
    }

    setIsResolvingAddress(true);

    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(stationAddress.trim())}`
      );

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        setErrorMessage(result?.error || "Failed to search address on map.");
        return;
      }

      if (!Array.isArray(result) || result.length === 0) {
        setErrorMessage("Address not found on map. Try a more specific address.");
        return;
      }

      const first = result[0];
      setStationCoordinates({ lat: Number(first.lat), lng: Number(first.lon) });
      if (first.display_name) {
        setStationAddress(first.display_name);
      }
      setSuccessMessage("Address found and pinned on the map.");
    } catch {
      setErrorMessage("Failed to search address on map.");
    } finally {
      setIsResolvingAddress(false);
    }
  };

  const handleMapPick = async (coords: LatLngValue) => {
    setStationCoordinates(coords);
    await reverseGeocode(coords);
  };

  const deleteStation = async (station: StationRecord) => {
    try {
      const batch = writeBatch(db);

      const teamsSnap = await getDocs(
        query(collection(db, "teams"), where("stationId", "==", station.id))
      );
      teamsSnap.docs.forEach((teamDoc) => {
        batch.update(doc(db, "teams", teamDoc.id), {
          stationId: "",
          stationName: "",
        });
      });

      const vehiclesSnap = await getDocs(
        query(collection(db, "vehicles"), where("stationId", "==", station.id))
      );
      vehiclesSnap.docs.forEach((vehicleDoc) => {
        batch.update(doc(db, "vehicles", vehicleDoc.id), {
          stationId: "",
          stationName: "",
        });
      });

      const usersSnap = await getDocs(
        query(collection(db, "users"), where("stationId", "==", station.id))
      );
      usersSnap.docs.forEach((userDoc) => {
        batch.update(doc(db, "users", userDoc.id), {
          stationId: "",
          stationName: "",
        });
      });

      batch.delete(doc(db, "stations", station.id));
      await batch.commit();
      setSuccessMessage("Station deleted successfully.");
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to delete station.");
    }
  };

  const createStation = async () => {
    if (!stationName.trim()) {
      setErrorMessage("Please enter station name.");
      return;
    }

    if (!stationAddress.trim()) {
      setErrorMessage("Please enter a complete station address.");
      return;
    }

    if (!stationCoordinates) {
      setErrorMessage("Please pin the station on the map or search the address.");
      return;
    }

    try {
      await addDoc(collection(db, "stations"), {
        name: stationName.trim(),
        address: stationAddress.trim(),
        addressNormalized: stationAddress.trim().toLowerCase(),
        latitude: stationCoordinates.lat,
        longitude: stationCoordinates.lng,
        teamIds: [],
        teamNames: [],
        vehicleIds: [],
        vehicleCodes: [],
        createdAt: serverTimestamp(),
      });

      setStationName("");
      setStationAddress("");
      setStationCoordinates(null);
      setShowAddStationModal(false);
      setSuccessMessage("Station created successfully.");
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to create station.");
    }
  };

  const openEditStation = (station: StationRecord) => {
    setEditingStation(station);
    setEditStationName(station.name || "");
    setEditStationAddress(station.address || "");
  };

  const closeEditStation = () => {
    setEditingStation(null);
    setEditStationName("");
    setEditStationAddress("");
  };

  const saveEditedStation = async () => {
    if (!editingStation) {
      return;
    }

    if (!editStationName.trim()) {
      setErrorMessage("Please enter station name.");
      return;
    }

    if (!editStationAddress.trim()) {
      setErrorMessage("Please enter station address.");
      return;
    }

    try {
      const batch = writeBatch(db);
      const nextName = editStationName.trim();
      const prevName = editingStation.name || "";

      batch.update(doc(db, "stations", editingStation.id), {
        name: nextName,
        address: editStationAddress.trim(),
        addressNormalized: editStationAddress.trim().toLowerCase(),
      });

      if (nextName !== prevName) {
        const [teamsSnap, vehiclesSnap, usersSnap] = await Promise.all([
          getDocs(query(collection(db, "teams"), where("stationId", "==", editingStation.id))),
          getDocs(query(collection(db, "vehicles"), where("stationId", "==", editingStation.id))),
          getDocs(query(collection(db, "users"), where("stationId", "==", editingStation.id))),
        ]);

        teamsSnap.docs.forEach((teamDoc) => {
          batch.update(doc(db, "teams", teamDoc.id), {
            stationName: nextName,
          });
        });

        vehiclesSnap.docs.forEach((vehicleDoc) => {
          batch.update(doc(db, "vehicles", vehicleDoc.id), {
            stationName: nextName,
          });
        });

        usersSnap.docs.forEach((userDoc) => {
          batch.update(doc(db, "users", userDoc.id), {
            stationName: nextName,
          });
        });
      }

      await batch.commit();
      closeEditStation();
      setSuccessMessage("Station updated successfully.");
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to update station.");
    }
  };

  const removeVehicleFromStation = async (vehicleId: string) => {
    if (!editingStation) {
      return;
    }

    const station = stations.find((item) => item.id === editingStation.id);
    const vehicle = vehicles.find((item) => item.id === vehicleId);

    if (!station || !vehicle) {
      setErrorMessage("Station or vehicle not found.");
      return;
    }

    const targetTeamById = vehicle.assignedTeamId
      ? teams.find((item) => item.id === vehicle.assignedTeamId)
      : null;

    const targetTeamByName = !targetTeamById && vehicle.assignedTeam
      ? teams.find((item) => item.teamName === vehicle.assignedTeam)
      : null;

    const targetTeam = targetTeamById || targetTeamByName;

    try {
      const nextVehicleIds = (station.vehicleIds || []).filter((id) => id !== vehicleId);
      const nextVehicleCodes = (station.vehicleCodes || []).filter(
        (code) => code !== vehicle.code
      );
      const nextTeamIds = targetTeam
        ? (station.teamIds || []).filter((id) => id !== targetTeam.id)
        : station.teamIds || [];
      const nextTeamNames = targetTeam
        ? (station.teamNames || []).filter((name) => name !== targetTeam.teamName)
        : station.teamNames || [];

      const batch = writeBatch(db);

      batch.update(doc(db, "stations", station.id), {
        teamIds: nextTeamIds,
        teamNames: nextTeamNames,
        vehicleIds: nextVehicleIds,
        vehicleCodes: nextVehicleCodes,
      });

      batch.update(doc(db, "vehicles", vehicle.id), {
        stationId: "",
        stationName: "",
      });

      if (targetTeam) {
        batch.update(doc(db, "teams", targetTeam.id), {
          stationId: "",
          stationName: "",
        });
      }

      const usersSnap = await getDocs(
        query(collection(db, "users"), where("stationId", "==", station.id))
      );

      usersSnap.docs.forEach((userDoc) => {
        const userData = userDoc.data() as Record<string, unknown>;
        const sameVehicle = userData.vehicleId === vehicle.id;
        const sameTeam = targetTeam
          ? userData.teamId === targetTeam.id || userData.teamName === targetTeam.teamName
          : false;

        if (sameVehicle || sameTeam) {
          batch.update(doc(db, "users", userDoc.id), {
            stationId: "",
            stationName: "",
            vehicleId: "",
            vehicleCode: "",
            vehiclePlate: "",
          });
        }
      });

      await batch.commit();

      setEditingStation((prev) => {
        if (!prev || prev.id !== station.id) {
          return prev;
        }

        return {
          ...prev,
          teamIds: nextTeamIds,
          teamNames: nextTeamNames,
          vehicleIds: nextVehicleIds,
          vehicleCodes: nextVehicleCodes,
        };
      });

      setSuccessMessage("Vehicle, linked team, and responders were removed from this station.");
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to remove vehicle assignment from station.");
    }
  };

  const assignVehicleToStation = async () => {
    if (!selectedStationId || !selectedVehicleId) {
      setErrorMessage("Please select station and vehicle.");
      return;
    }

    const targetStation = stations.find((s) => s.id === selectedStationId);
    const targetVehicle = vehicles.find((v) => v.id === selectedVehicleId);

    const targetTeamById = targetVehicle?.assignedTeamId
      ? teams.find((t) => t.id === targetVehicle.assignedTeamId)
      : null;

    const targetTeamByName = !targetTeamById && targetVehicle?.assignedTeam
      ? teams.find((t) => t.teamName === targetVehicle.assignedTeam)
      : null;

    const targetTeam = targetTeamById || targetTeamByName;

    if (!targetStation || !targetVehicle) {
      setErrorMessage("Invalid station or vehicle selection.");
      return;
    }

    if (!targetTeam) {
      setErrorMessage(
        "The selected vehicle has no linked responder team. Please assign a team to this vehicle in Truck and Team first."
      );
      return;
    }

    try {
      const batch = writeBatch(db);

      stations.forEach((station) => {
        const nextTeamIds = (station.teamIds || []).filter((id) => id !== targetTeam.id);
        const nextTeamNames = (station.teamNames || []).filter(
          (name) => name !== targetTeam.teamName
        );
        const nextVehicleIds = (station.vehicleIds || []).filter((id) => id !== targetVehicle.id);
        const nextVehicleCodes = (station.vehicleCodes || []).filter(
          (code) => code !== targetVehicle.code
        );

        if (station.id === targetStation.id) {
          if (!nextTeamIds.includes(targetTeam.id)) nextTeamIds.push(targetTeam.id);
          if (!nextTeamNames.includes(targetTeam.teamName)) nextTeamNames.push(targetTeam.teamName);
          if (!nextVehicleIds.includes(targetVehicle.id)) nextVehicleIds.push(targetVehicle.id);
          if (!nextVehicleCodes.includes(targetVehicle.code)) nextVehicleCodes.push(targetVehicle.code);
        }

        batch.update(doc(db, "stations", station.id), {
          teamIds: nextTeamIds,
          teamNames: nextTeamNames,
          vehicleIds: nextVehicleIds,
          vehicleCodes: nextVehicleCodes,
        });
      });

      batch.update(doc(db, "teams", targetTeam.id), {
        stationId: targetStation.id,
        stationName: targetStation.name,
      });

      batch.update(doc(db, "vehicles", targetVehicle.id), {
        stationId: targetStation.id,
        stationName: targetStation.name,
      });

      const responderDocsById = targetTeam.id
        ? await getDocs(query(collection(db, "users"), where("teamId", "==", targetTeam.id)))
        : null;

      const responderDocsByName = targetTeam.teamName
        ? await getDocs(
            query(collection(db, "users"), where("teamName", "==", targetTeam.teamName))
          )
        : null;

      const uniqueResponderIds = new Set<string>();

      responderDocsById?.docs.forEach((userDoc) => uniqueResponderIds.add(userDoc.id));
      responderDocsByName?.docs.forEach((userDoc) => uniqueResponderIds.add(userDoc.id));

      uniqueResponderIds.forEach((userId) => {
        batch.update(doc(db, "users", userId), {
          stationId: targetStation.id,
          stationName: targetStation.name,
          vehicleId: targetVehicle.id,
          vehicleCode: targetVehicle.code || "",
          vehiclePlate: targetVehicle.plate || "",
        });
      });

      await batch.commit();
      setSuccessMessage("Vehicle and linked team assigned to station successfully.");
    } catch (err) {
      console.error(err);
      setErrorMessage("Failed to assign vehicle to station.");
    }
  };

  return (
    <div className={styles.pageWrapper}>
      <AdminHeader />

      <div style={{ position: "absolute", top: 20, right: 30, zIndex: 50 }}>
        <AlertBellButton />
      </div>

      <AlertDispatchModal />

      <div className={styles.container}>
        <div className={styles.contentSection}>
          <div className={styles.headerRow}>
            <h2 className={styles.pageTitle}>Stations</h2>
            <button className={styles.addBtn} onClick={() => setShowAddStationModal(true)}>
              Add Station
            </button>
          </div>

          <hr className={styles.separator} />

          <div className={styles.assignCard}>
            <h3 className={styles.assignTitle}>Assign Vehicle to Station</h3>
            <div className={styles.assignGrid}>
              <select
                className={styles.input}
                value={selectedStationId}
                onChange={(e) => setSelectedStationId(e.target.value)}
              >
                <option value="">Select station</option>
                {sortedStations.map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
              </select>

              <select
                className={styles.input}
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <option value="">Select vehicle</option>
                {availableVehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.code} {vehicle.plate ? `(${vehicle.plate})` : ""}
                    {vehicle.assignedTeam ? ` - ${vehicle.assignedTeam}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {availableVehicles.length === 0 && (
              <p className={styles.helpText}>
                All vehicles are currently assigned to stations. Edit a station to remove
                assignments before adding another.
              </p>
            )}

            <p className={styles.helpText}>
              Team assignment is inferred from the selected vehicle. Make sure the vehicle has
              an assigned team in Truck and Team.
            </p>

            <button className={styles.assignBtn} onClick={assignVehicleToStation}>
              Save Assignment
            </button>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Station</th>
                  <th>Address</th>
                  <th>Teams</th>
                  <th>Vehicles</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedStations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyRow}>
                      No stations yet.
                    </td>
                  </tr>
                ) : (
                  sortedStations.map((station) => (
                    <tr key={station.id}>
                      <td>{station.name}</td>
                      <td>{station.address || "-"}</td>
                      <td>{(station.teamNames || []).length ? station.teamNames?.join(", ") : "-"}</td>
                      <td>
                        {(station.vehicleCodes || []).length
                          ? station.vehicleCodes?.join(", ")
                          : "-"}
                      </td>
                      <td>
                        <div className={styles.actionRow}>
                          <button
                            className={styles.editBtn}
                            onClick={() => openEditStation(station)}
                          >
                            Edit
                          </button>
                          <button
                            className={styles.deleteBtn}
                            onClick={() => deleteStation(station)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showAddStationModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAddStationModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Add Station</h3>
            <label className={styles.label}>Station Name</label>
            <input
              className={styles.input}
              value={stationName}
              onChange={(e) => setStationName(e.target.value)}
              placeholder="Station Alpha"
            />

            <label className={styles.label}>Complete Station Address</label>
            <div className={styles.addressRow}>
              <input
                className={styles.input}
                value={stationAddress}
                onChange={(e) => setStationAddress(e.target.value)}
                placeholder="House No., Street, Barangay, City, Province"
              />
              <button
                className={styles.mapSearchBtn}
                type="button"
                onClick={searchAddressOnMap}
                disabled={isResolvingAddress}
              >
                {isResolvingAddress ? "Searching..." : "Find on Map"}
              </button>
            </div>

            <label className={styles.label}>Pin Station on Map</label>
            <div className={styles.mapWrap}>
              <StationMapPicker value={stationCoordinates} onPick={handleMapPick} />
            </div>

            <p className={styles.helpText}>
              Click the map to pin the station. If address lookup does not fill automatically,
              keep the pin and type or edit the address manually.
            </p>

            {stationCoordinates && (
              <p className={styles.coordinateText}>
                Selected coordinates: {stationCoordinates.lat.toFixed(6)}, {" "}
                {stationCoordinates.lng.toFixed(6)}
              </p>
            )}

            <div className={styles.modalActions}>
              <button className={styles.closeBtn} onClick={() => setShowAddStationModal(false)}>
                Close
              </button>
              <button className={styles.saveBtn} onClick={createStation}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingStation && (
        <div className={styles.modalOverlay} onClick={closeEditStation}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Edit Station</h3>
            <label className={styles.label}>Station Name</label>
            <input
              className={styles.input}
              value={editStationName}
              onChange={(e) => setEditStationName(e.target.value)}
              placeholder="Station Alpha"
            />

            <label className={styles.label}>Complete Station Address</label>
            <input
              className={styles.input}
              value={editStationAddress}
              onChange={(e) => setEditStationAddress(e.target.value)}
              placeholder="House No., Street, Barangay, City, Province"
            />

            <label className={styles.label}>Assigned Vehicles</label>
            <div className={styles.assignedList}>
              {editingStationVehicleIds.length === 0 ? (
                <p className={styles.helpText}>No assigned vehicles in this station.</p>
              ) : (
                editingStationVehicleIds.map((vehicleId) => {
                  const vehicle = vehicles.find((item) => item.id === vehicleId);
                  const label = vehicle
                    ? `${vehicle.code} ${vehicle.plate ? `(${vehicle.plate})` : ""}`
                    : vehicleId;

                  return (
                    <div key={vehicleId} className={styles.assignedItem}>
                      <span>{label}</span>
                      <button
                        className={styles.removeBtn}
                        type="button"
                        onClick={() => removeVehicleFromStation(vehicleId)}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <p className={styles.helpText}>
              Removing a vehicle also removes its linked team and responders from this station.
            </p>

            <div className={styles.modalActions}>
              <button className={styles.closeBtn} onClick={closeEditStation}>
                Close
              </button>
              <button className={styles.saveBtn} onClick={saveEditedStation}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className={styles.feedbackSuccess} onAnimationEnd={() => setSuccessMessage(null)}>
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className={styles.feedbackError} onAnimationEnd={() => setErrorMessage(null)}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}
