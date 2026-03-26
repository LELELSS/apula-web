"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "@/app/dashboard/dispatch/dispatch.module.css";

import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  writeBatch,
  serverTimestamp,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { logActivity } from "@/lib/activityLog";

const normalizeStatus = (value: unknown) => String(value || "").trim().toLowerCase();

const timestampToMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const parseCoordinate = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const hasValidCoordinates = (lat: number | null, lng: number | null) => (
  lat !== null &&
  lng !== null &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180
);

const normalizeIncident = (id: string, data: any) => {
  const type =
    data?.type ||
    data?.alertType ||
    "Fire Alert";

  const userName =
    data?.userName ||
    data?.reportedBy ||
    data?.name ||
    "Unknown";

  const userContact =
    data?.userContact ||
    data?.contact ||
    data?.phone ||
    data?.mobile ||
    "";

  const userAddress =
    data?.userAddress ||
    data?.location ||
    data?.alertLocation ||
    data?.address ||
    "";

  const location =
    data?.location ||
    data?.alertLocation ||
    data?.userAddress ||
    data?.address ||
    userAddress;

  return {
    id,
    ...data,
    type,
    userName,
    userContact,
    userAddress,
    location,
    status: data?.status || "Pending",
    timestamp:
      data?.timestamp ||
      data?.createdAt ||
      data?.updatedAt ||
      null,
  };
};

const AlertDispatchModal = () => {
  const [showModal, setShowModal] = useState(false);
  const [activeIncidentTab, setActiveIncidentTab] = useState<"all" | "alerts" | "confirmation">("all");

  const [dispatchStep, setDispatchStep] = useState<1 | 2 | 3>(1);

  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);

  const [responders, setResponders] = useState<any[]>([]);
  const [selectedResponderIds, setSelectedResponderIds] = useState<Set<string>>(new Set());

  const [teams, setTeams] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);

  const [teamDistancesKm, setTeamDistancesKm] = useState<Record<string, number | null>>({});
  const [recommendedTeamName, setRecommendedTeamName] = useState<string | null>(null);
  const [alreadyDispatchedTeams, setAlreadyDispatchedTeams] = useState<Set<string>>(new Set());
  const [isCalculatingDistances, setIsCalculatingDistances] = useState(false);
  const stationCoordCacheRef = useRef<Record<string, { lat: number; lng: number } | null>>({});

  const [selectedDispatch, setSelectedDispatch] = useState<any>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [previewAlert, setPreviewAlert] = useState<any>(null);
  const [showAlertPreviewModal, setShowAlertPreviewModal] = useState(false);
  const [previewImageCandidates, setPreviewImageCandidates] = useState<string[]>([]);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [resolvedPreviewCoords, setResolvedPreviewCoords] = useState<{ lat: number; lng: number } | null>(null);


  const [showDispatchSuccessModal, setShowDispatchSuccessModal] = useState(false);
  const [dispatchSuccessMessage, setDispatchSuccessMessage] = useState("");
  const [showConfirmSuccessModal, setShowConfirmSuccessModal] = useState(false);
  const [confirmSuccessMessage, setConfirmSuccessMessage] = useState("");

  const extractGoogleDriveFileId = (url: string): string | null => {
    const filePathMatch = url.match(/\/file\/d\/([^/]+)/);
    if (filePathMatch?.[1]) return filePathMatch[1];

    const directPathMatch = url.match(/\/d\/([^/]+)/);
    if (directPathMatch?.[1]) return directPathMatch[1];

    const queryMatch = url.match(/[?&]id=([^&]+)/);
    if (queryMatch?.[1]) return queryMatch[1];

    return null;
  };

  const buildImageCandidates = (url: string): string[] => {
    if (!url) return [];

    if (!url.includes("drive.google.com")) {
      return [url];
    }

    const fileId = extractGoogleDriveFileId(url);
    if (!fileId) {
      return [url];
    }

    return [
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
      `https://lh3.googleusercontent.com/d/${fileId}=w1600`,
      url,
    ];
  };

  const normalizeBase64Snapshot = (value: unknown): string | null => {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("data:image")) {
      return trimmed;
    }

    const clean = trimmed.replace(/\s/g, "");
    if (!clean) return null;

    let mime = "image/jpeg";
    if (clean.startsWith("iVBOR")) mime = "image/png";
    if (clean.startsWith("R0lGOD")) mime = "image/gif";
    if (clean.startsWith("UklGR")) mime = "image/webp";

    return `data:${mime};base64,${clean}`;
  };

  const buildSnapshotCandidates = (alertData: any): string[] => {
    if (alertData?.snapshotUrl) {
      return buildImageCandidates(alertData.snapshotUrl);
    }

    const base64Data =
      normalizeBase64Snapshot(alertData?.snapshotBase64) ||
      normalizeBase64Snapshot(alertData?.snapshot);

    return base64Data ? [base64Data] : [];
  };

  useEffect(() => {
    let cancelled = false;

    const resolvePreviewCoordinates = async () => {
      if (!showAlertPreviewModal || !previewAlert) {
        setResolvedPreviewCoords(null);
        return;
      }

      const directLat =
        parseCoordinate(previewAlert?.latitude) ??
        parseCoordinate(previewAlert?.lat);

      const directLng =
        parseCoordinate(previewAlert?.longitude) ??
        parseCoordinate(previewAlert?.lng) ??
        parseCoordinate(previewAlert?.lon);

      if (hasValidCoordinates(directLat, directLng)) {
        if (!cancelled) {
          setResolvedPreviewCoords({ lat: directLat as number, lng: directLng as number });
        }
        return;
      }

      const address =
        String(
          previewAlert?.userAddress ||
          previewAlert?.location ||
          previewAlert?.alertLocation ||
          ""
        ).trim();

      if (!address) {
        if (!cancelled) setResolvedPreviewCoords(null);
        return;
      }

      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Geocode failed with status ${response.status}`);
        }

        const payload = await response.json();
        const first = Array.isArray(payload) ? payload[0] : null;

        const geocodedLat =
          parseCoordinate(first?.lat) ??
          parseCoordinate(first?.latitude);

        const geocodedLng =
          parseCoordinate(first?.lon) ??
          parseCoordinate(first?.lng) ??
          parseCoordinate(first?.longitude);

        if (!cancelled && hasValidCoordinates(geocodedLat, geocodedLng)) {
          setResolvedPreviewCoords({ lat: geocodedLat as number, lng: geocodedLng as number });
          return;
        }
      } catch (error) {
        console.error("Failed to geocode alert preview address:", error);
      }

      if (!cancelled) {
        setResolvedPreviewCoords(null);
      }
    };

    resolvePreviewCoordinates();

    return () => {
      cancelled = true;
    };
  }, [
    showAlertPreviewModal,
    previewAlert?.id,
    previewAlert?.latitude,
    previewAlert?.lat,
    previewAlert?.longitude,
    previewAlert?.lng,
    previewAlert?.lon,
    previewAlert?.userAddress,
    previewAlert?.location,
    previewAlert?.alertLocation,
  ]);


  const viewDispatchInfo = async (teamName: string) => {
  const snap = await getDocs(
    query(
      collection(db, "dispatches"),
      orderBy("timestamp", "desc")
    )
  );

  const latest = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .find((d: any) =>
      d.status === "Dispatched" &&
      d.responders?.some((r: any) => r.team === teamName || r.teamName === teamName)
    );

  if (!latest) {
    alert("No dispatch record found for this team.");
    return;
  }

  setSelectedDispatch(latest);
  setShowViewModal(true);
};



  // ------------------------------------------------------------
  // OPEN MODAL WHEN TRIGGERED FROM AlertBellButton
  // ------------------------------------------------------------
  useEffect(() => {
    const openModal = () => {
      loadAlerts();
      setDispatchStep(1);
      setActiveIncidentTab("all");
      setSelectedAlert(null);
      setSelectedResponderIds(new Set());
      setShowModal(true);
    };

    window.addEventListener("open-alert-dispatch", openModal);
    return () => window.removeEventListener("open-alert-dispatch", openModal);
  }, []);

  // ------------------------------------------------------------
  // LOAD PENDING ALERTS
  // ------------------------------------------------------------
  const loadAlerts = async () => {
    const alertSnap = await getDocs(
      query(collection(db, "alerts"), orderBy("timestamp", "desc"))
    );

    const nextAlerts = alertSnap.docs
      .map((d) => normalizeIncident(d.id, d.data()))
      .filter((item) => {
        const status = normalizeStatus(item.status);
        return status === "pending" || status === "dispatched" || status === "validated";
      })
      .sort((a, b) => timestampToMillis(b.timestamp) - timestampToMillis(a.timestamp));

    setAlerts(nextAlerts);
  };

  // ------------------------------------------------------------
  // REAL-TIME RESPONDERS
  // ------------------------------------------------------------
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "users"), where("role", "==", "responder")),
      (snap) => {
        setResponders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
    );
    return () => unsub();
  }, []);

  // ------------------------------------------------------------
  // LOAD TEAMS & VEHICLES
  // ------------------------------------------------------------
  useEffect(() => {
    getDocs(collection(db, "teams")).then((snap) => {
      setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    getDocs(collection(db, "vehicles")).then((snap) => {
      setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    getDocs(collection(db, "stations")).then((snap) => {
      setStations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const toNumberIfFinite = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  };

  const haversineDistanceKm = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadiusKm = 6371;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  };

  const getAlertCoordinates = async (alert: any) => {
    const directLat =
      toNumberIfFinite(alert?.latitude) ??
      toNumberIfFinite(alert?.lat) ??
      toNumberIfFinite(alert?.locationLat) ??
      toNumberIfFinite(alert?.userLat);

    const directLng =
      toNumberIfFinite(alert?.longitude) ??
      toNumberIfFinite(alert?.lng) ??
      toNumberIfFinite(alert?.lon) ??
      toNumberIfFinite(alert?.locationLng) ??
      toNumberIfFinite(alert?.userLng);

    if (directLat !== null && directLng !== null) {
      return { lat: directLat, lng: directLng };
    }

    const fallbackAddress =
      (alert?.userAddress as string | undefined) ||
      (alert?.alertLocation as string | undefined) ||
      (alert?.location as string | undefined) ||
      "";

    if (!fallbackAddress.trim()) return null;

    try {
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(fallbackAddress)}`
      );
      const result = await response.json().catch(() => null);

      if (!response.ok || !Array.isArray(result) || result.length === 0) {
        return null;
      }

      const first = result[0];
      const lat = toNumberIfFinite(first?.lat);
      const lng = toNumberIfFinite(first?.lon);

      if (lat === null || lng === null) return null;
      return { lat, lng };
    } catch {
      return null;
    }
  };

  const geocodeAddress = async (address: string) => {
    const trimmed = address.trim();
    if (!trimmed) return null;

    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(trimmed)}`);
      const result = await response.json().catch(() => null);

      if (!response.ok || !Array.isArray(result) || result.length === 0) {
        return null;
      }

      const first = result[0];
      const lat = toNumberIfFinite(first?.lat);
      const lng = toNumberIfFinite(first?.lon);

      if (lat === null || lng === null) return null;
      return { lat, lng };
    } catch {
      return null;
    }
  };

  const getStationCoordinates = async (station: any) => {
    if (!station) return null;

    const directLat =
      toNumberIfFinite(station?.latitude) ??
      toNumberIfFinite(station?.lat) ??
      toNumberIfFinite(station?.locationLat);

    const directLng =
      toNumberIfFinite(station?.longitude) ??
      toNumberIfFinite(station?.lng) ??
      toNumberIfFinite(station?.locationLng);

    if (directLat !== null && directLng !== null) {
      return { lat: directLat, lng: directLng };
    }

    const cacheKey =
      String(station?.id || station?.name || station?.address || "").trim() ||
      "unknown-station";

    if (cacheKey in stationCoordCacheRef.current) {
      return stationCoordCacheRef.current[cacheKey];
    }

    const fallbackAddress =
      String(station?.address || station?.addressNormalized || station?.name || "").trim();

    const geocoded = await geocodeAddress(fallbackAddress);
    stationCoordCacheRef.current[cacheKey] = geocoded;
    return geocoded;
  };

  useEffect(() => {
    const loadAlreadyDispatchedTeams = async () => {
      if (dispatchStep !== 2 || !selectedAlert) {
        setAlreadyDispatchedTeams(new Set());
        return;
      }

      const baseAlertId = String(selectedAlert.id || "").trim();
      if (!baseAlertId) {
        setAlreadyDispatchedTeams(new Set());
        return;
      }

      const snap = await getDocs(
        query(collection(db, "dispatches"), where("alertId", "==", baseAlertId))
      );

      const dispatchedTeams = new Set<string>();
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() as any;
        if (data?.status !== "Dispatched") {
          return;
        }

        (data.responders || []).forEach((responder: any) => {
          const teamName = responder?.team || responder?.teamName;
          if (teamName) {
            dispatchedTeams.add(String(teamName));
          }
        });
      });

      setAlreadyDispatchedTeams(dispatchedTeams);
    };

    loadAlreadyDispatchedTeams();
  }, [dispatchStep, selectedAlert]);

  useEffect(() => {
    const computeDistances = async () => {
      if (dispatchStep !== 2 || !selectedAlert || groupedList.length === 0) {
        setTeamDistancesKm({});
        setRecommendedTeamName(null);
        return;
      }

      setIsCalculatingDistances(true);

      const alertCoords = await getAlertCoordinates(selectedAlert);
      if (!alertCoords) {
        setTeamDistancesKm({});
        setRecommendedTeamName(null);
        setIsCalculatingDistances(false);
        return;
      }

      const distanceMap: Record<string, number | null> = {};

      for (const group of groupedList as any[]) {
        const team = teams.find((t) => t.teamName === group.team);
        const station = stations.find(
          (s) =>
            (team?.stationId && s.id === team.stationId) ||
            (team?.stationName && s.name === team.stationName)
        );

        const stationCoords = await getStationCoordinates(station);
        if (!stationCoords) {
          distanceMap[group.team] = null;
          continue;
        }

        distanceMap[group.team] = haversineDistanceKm(
          stationCoords.lat,
          stationCoords.lng,
          alertCoords.lat,
          alertCoords.lng
        );
      }

      const nearest = Object.entries(distanceMap)
        .filter(([, km]) => km !== null)
        .sort((a, b) => (a[1] as number) - (b[1] as number))[0];

      setTeamDistancesKm(distanceMap);
      setRecommendedTeamName(nearest ? nearest[0] : null);
      setIsCalculatingDistances(false);
    };

    computeDistances();
  }, [dispatchStep, selectedAlert, teams, stations, responders, vehicles]);

  // ------------------------------------------------------------
  // AUTO RESET LOGIC:
  // A. If TEAM LEADER becomes Available → reset team + vehicle
  // B. If ALL responders become Available → reset team + vehicle
  // ------------------------------------------------------------
  useEffect(() => {
    if (responders.length === 0 || teams.length === 0 || vehicles.length === 0)
      return;

    teams.forEach((team) => {
      const teamResponders = responders.filter((r) => r.teamId === team.id);
      if (teamResponders.length === 0) return;

      const teamName = team.teamName;

      // Find assigned vehicle
      const vehicle = vehicles.find((v) => v.assignedTeam === teamName);

      // Find team leader
      const leader = teamResponders.find((r) => r.id === team.leaderId);

      const leaderResolved = leader && leader.status === "Available";
      const allAvailable = teamResponders.every((r) => r.status === "Available");

      // If neither condition met → DO NOTHING
      if (!leaderResolved && !allAvailable) return;

      console.log(
        `RESET TRIGGERED → Team ${teamName}, leaderResolved=${leaderResolved}, allAvailable=${allAvailable}`
      );

      // Perform database reset
      const batch = writeBatch(db);

      // Reset responders
      teamResponders.forEach((res) => {
        batch.update(doc(db, "users", res.id), { status: "Available" });
      });

      // Reset team
      batch.update(doc(db, "teams", team.id), { status: "Available" });

      // Reset vehicle
      if (vehicle) {
        batch.update(doc(db, "vehicles", vehicle.id), { status: "Available" });
      }

      batch.commit();
    });
  }, [responders, teams, vehicles]);

  // ------------------------------------------------------------
  // GROUP USING teamName + vehicle.code
  // ------------------------------------------------------------
// ------------------------------------------------------------
// GROUP LOGIC EXACTLY LIKE DispatchPage
// ------------------------------------------------------------
const groupedList = teams
  .map((team) => {
    const members = responders.filter((r) => r.teamId === team.id);

    if (members.length === 0) return null;

    // ✅ CHECK STATION
    const hasStation =
      team.stationId ||
      team.stationName ||
      stations.some(
        (s) =>
          s.id === team.stationId ||
          s.name === team.stationName
      );

    if (!hasStation) return null; // 🚨 HIDE TEAM

    const vehicle =
      vehicles.find((v) => v.assignedTeamId === team.id)?.code ||
      vehicles.find((v) => v.assignedTeam === team.teamName)?.code ||
      "Unassigned";

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

const sortedGroupedList = [...groupedList].sort((a: any, b: any) => {
  const aDistance = teamDistancesKm[a.team];
  const bDistance = teamDistancesKm[b.team];

  if (aDistance !== null && aDistance !== undefined && (bDistance === null || bDistance === undefined)) {
    return -1;
  }

  if (bDistance !== null && bDistance !== undefined && (aDistance === null || aDistance === undefined)) {
    return 1;
  }

  if (aDistance !== null && aDistance !== undefined && bDistance !== null && bDistance !== undefined) {
    return aDistance - bDistance;
  }

  return String(a.team).localeCompare(String(b.team));
});

  const incidentCounts = {
    all: alerts.length,
    alerts: alerts.filter((item) => normalizeStatus(item.status) !== "validated").length,
    confirmation: alerts.filter((item) => normalizeStatus(item.status) === "validated").length,
  };

  const visibleIncidents = alerts.filter((item) => {
    const status = normalizeStatus(item.status);
    if (activeIncidentTab === "alerts") return status !== "validated";
    if (activeIncidentTab === "confirmation") return status === "validated";
    return true;
  });



  const confirmIncident = async (alertItem: any) => {
    try {
      const currentUser = auth.currentUser;
      let confirmerName = "Admin Panel";

      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            confirmerName =
              data.name || currentUser.displayName || currentUser.email || "Admin Panel";
          } else {
            confirmerName =
              currentUser.displayName || currentUser.email || "Admin Panel";
          }
        } catch {
          confirmerName = currentUser.displayName || currentUser.email || "Admin Panel";
        }
      }

      await updateDoc(doc(db, "alerts", alertItem.id), {
        status: "Confirmed",
        confirmationStatus: "Confirmed",
        confirmedAt: serverTimestamp(),
        confirmedBy: confirmerName,
      });

      const dispatchSnap = await getDocs(
        query(collection(db, "dispatches"), where("alertId", "==", alertItem.id))
      );

      if (!dispatchSnap.empty) {
        const batch = writeBatch(db);

        dispatchSnap.docs.forEach((dispatchDoc) => {
          batch.update(dispatchDoc.ref, {
            status: "Confirmed",
            confirmationStatus: "Confirmed",
            confirmedAt: serverTimestamp(),
            confirmedBy: confirmerName,
          });
        });

        await batch.commit();
      }

      await addDoc(collection(db, "notifications"), {
        type: "Incident Confirmation",
        status: "Confirmed",
        message: `Incident has been confirmed by ${confirmerName}.`,
        alertId: alertItem.id,
        location:
          alertItem.userAddress ||
          alertItem.alertLocation ||
          alertItem.location ||
          "",
        userName: alertItem.userName || "System",
        userAddress:
          alertItem.userAddress ||
          alertItem.alertLocation ||
          alertItem.location ||
          "",
        userContact: alertItem.userContact || "",
        userEmail: alertItem.userEmail || "",
        readBy: [],
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      if (currentUser) {
        await logActivity({
          actorUid: currentUser.uid,
          actorEmail: currentUser.email || "",
          actorName: confirmerName,
          actorRole: "admin",
          action: "confirm_incident",
          targetId: String(alertItem.id),
          targetType: "alert",
          details: "Confirmed validated incident.",
          path: "/dashboard/dispatch",
        });
      }

      await loadAlerts();
      setConfirmSuccessMessage(
        `Fire incident at ${
          alertItem.userAddress ||
          alertItem.alertLocation ||
          alertItem.location ||
          "the selected fire address"
        } has been confirmed successfully.`
      );
      setShowConfirmSuccessModal(true);

      setTimeout(() => {
        setShowConfirmSuccessModal(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to confirm incident:", error);
      alert("Failed to confirm incident.");
    }
  };

const getTeamStationName = (teamName: string) => {
  const team = teams.find((t) => t.teamName === teamName);
  if (!team) return "Unassigned";

  if (team.stationName) return team.stationName;

  const station = stations.find((s) => team.stationId && s.id === team.stationId);
  return station?.name || "Unassigned";
};


  // ------------------------------------------------------------
  // STEP 1 → SELECT ALERT
  // ------------------------------------------------------------
  const handleAlertSelect = (alert: any) => {
    setSelectedAlert(alert);
    setShowAlertPreviewModal(false);
    setPreviewAlert(null);
    setDispatchStep(2);
  };

  // ------------------------------------------------------------
  // STEP 2 → SELECT TEAM
  // ------------------------------------------------------------
  const handleDispatchTeam = (group: any) => {
    const available = group.responders.filter((r: any) => r.status === "Available");

    if (available.length === 0) {
      alert("No available responders in this team.");
      return;
    }

    setSelectedResponderIds(new Set(available.map((r: any) => r.id)));
    setDispatchStep(3);
  };

  // ------------------------------------------------------------
  // STEP 3 → DISPATCH NOW
  // ------------------------------------------------------------
  // --- SAME IMPORTS ABOVE ---

  const dispatchResponders = async () => {
    const selected = responders.filter((r) => selectedResponderIds.has(r.id));

    const getDispatcherName = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return "Admin Panel";

      try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          return data.name || currentUser.displayName || currentUser.email || "Admin Panel";
        }
      } catch (error) {
        console.error("Error reading dispatcher name:", error);
      }

      return currentUser.displayName || currentUser.email || "Admin Panel";
    };

    try {
      const baseAlertId = selectedAlert.id;
      const currentUser = auth.currentUser;
      const dispatchedByName = await getDispatcherName();

      // Multiple team dispatches allowed for same incident

      const batch = writeBatch(db);
      const ref = doc(collection(db, "dispatches"));

      batch.set(ref, {
        alertId: selectedAlert.id,
        alertType: selectedAlert.type,
        alertLocation: selectedAlert.location,
        snapshotUrl: selectedAlert.snapshotUrl || null,
        snapshotBase64: selectedAlert.snapshotBase64 || null,
        dispatchType: "Primary",
        isBackup: false,
        requestSource: "alerts",

        responders: selected.map((r) => {
          const teamName =
            teams.find((t) => t.id === r.teamId)?.teamName || "Unassigned";

          const vehicle = vehicles.find((v) => v.assignedTeam === teamName);
          const vehicleCode = vehicle?.code || "Unassigned";

          return {
            id: r.id,
            name: r.name,
            email: (r.email || "").toLowerCase(),
            contact: r.contact || "",
            team: teamName,
            vehicle: vehicleCode,
          };
        }),

        responderEmails: selected.map((r) => (r.email || "").toLowerCase()),

        userReported: selectedAlert.userName,
        userAddress: selectedAlert.userAddress,
        userContact: selectedAlert.userContact,
        userEmail: selectedAlert.userEmail,

        status: "Dispatched",
        dispatchedBy: dispatchedByName,
        timestamp: serverTimestamp(),
      });

      // Update responders → Dispatched
      selected.forEach((r) =>
        batch.update(doc(db, "users", r.id), { status: "Dispatched" })
      );

      // Update alert → Dispatched
      batch.update(doc(db, "alerts", selectedAlert.id), {
        status: "Dispatched",
        dispatchStatus: "Dispatched",
        respondedAt: serverTimestamp(),
      });

      // ------------------------------------------------------------
      // 🚒 UPDATE TEAM + VEHICLE STATUS ON DISPATCH
      // ------------------------------------------------------------
      if (selected.length > 0) {
        const firstResponder = selected[0];
        const team = teams.find((t) => t.id === firstResponder.teamId);

        if (team) {
          batch.update(doc(db, "teams", team.id), { status: "Dispatched" });
        }

        const teamName = team?.teamName;
        const vehicle = vehicles.find((v) => v.assignedTeam === teamName);

        if (vehicle) {
          batch.update(doc(db, "vehicles", vehicle.id), { status: "Dispatched" });
        }
      }
      // ------------------------------------------------------------

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

      const dispatchedTeamNames = Array.from(
        new Set(
          selected.map((r) => {
            const teamName =
              teams.find((t) => t.id === r.teamId)?.teamName || "Unassigned";
            return teamName;
          })
        )
      );

      setDispatchSuccessMessage(
        `Successfully dispatched ${dispatchedTeamNames.join(", ")} to ${
          selectedAlert.userAddress ||
          selectedAlert.alertLocation ||
          selectedAlert.location ||
          "the selected fire address"
        }.`
      );

      setShowModal(false);
      setDispatchStep(1);
      setSelectedAlert(null);
      setSelectedResponderIds(new Set());
      setShowDispatchSuccessModal(true);

setTimeout(() => {
  setShowDispatchSuccessModal(false);
}, 2000); // 2 seconds
    } catch (error) {
      console.error("Failed to dispatch responders:", error);
      alert("Failed to dispatch responders.");
    }
  };
  // ------------------------------------------------------------
  // UI (unchanged)
  // ------------------------------------------------------------
  
 if (!showModal && !showDispatchSuccessModal && !showAlertPreviewModal && !showViewModal) {
  return null;
}

  const formattedAlertTime = previewAlert?.timestamp?.seconds
    ? new Date(previewAlert.timestamp.seconds * 1000).toLocaleString()
    : "Unknown";

  const previewAddress =
    previewAlert?.userAddress ||
    previewAlert?.location ||
    previewAlert?.alertLocation ||
    "";

  const mapEmbedSrc = (() => {
    if (resolvedPreviewCoords) {
      const { lat, lng } = resolvedPreviewCoords;
      const delta = 0.002;
      const bbox = [
        lng - delta,
        lat - delta,
        lng + delta,
        lat + delta,
      ]
        .map((value) => value.toFixed(6))
        .join("%2C");

      return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
    }

    return previewAddress
      ? `https://maps.google.com/maps?q=${encodeURIComponent(previewAddress)}&z=15&output=embed`
      : "";
  })();

  const fireType =
    previewAlert?.type ||
    previewAlert?.alertType ||
    "Unknown";

  const triggerSource =
    previewAlert?.sourceOfFire ||
    previewAlert?.triggerSource ||
    previewAlert?.alertSource ||
    previewAlert?.fireSource ||
    previewAlert?.source ||
    previewAlert?.cause ||
    "Unknown";

  const fireDescription =
    previewAlert?.description ||
    previewAlert?.details ||
    previewAlert?.message ||
    "No description provided.";

  const previewImageSrc =
    previewImageCandidates[previewImageIndex] || "";

  const hasPreviewImage = Boolean(previewImageSrc);

  return (
    <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
      <div className={styles.modalWide} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.modalCloseIcon}
          aria-label="Close alert dispatch modal"
          onClick={() => setShowModal(false)}
        >
          ×
        </button>
        
        {/* STEP 1: ALERTS */}
        {dispatchStep === 1 && (
          <>
            <h3 className={styles.modalTitle}>Select Alert</h3>

            <div className={styles.modalTabs}>
              <button
                className={`${styles.modalTabBtn} ${activeIncidentTab === "all" ? styles.modalTabBtnActive : ""}`}
                onClick={() => setActiveIncidentTab("all")}
                type="button"
              >
                All ({incidentCounts.all})
              </button>
              <button
                className={`${styles.modalTabBtn} ${activeIncidentTab === "alerts" ? styles.modalTabBtnActive : ""}`}
                onClick={() => setActiveIncidentTab("alerts")}
                type="button"
              >
                Alerts ({incidentCounts.alerts})
              </button>
              <button
                className={`${styles.modalTabBtn} ${activeIncidentTab === "confirmation" ? styles.modalTabBtnActive : ""}`}
                onClick={() => setActiveIncidentTab("confirmation")}
                type="button"
              >
                Confirmation ({incidentCounts.confirmation})
              </button>
            </div>

            {visibleIncidents.length === 0 && (
              <p className={styles.distanceInfo}>No pending alerts or validated incidents found.</p>
            )}

            <div className={styles.tableScroll}>
              <table className={styles.alertTable}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Reporter</th>
                    <th>Contact</th>
                    <th>Address</th>
                    <th>Time</th> {/* NEW */}
                    <th>Select</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleIncidents.map((a) => (
                    <tr key={a.id}>
                      <td>{a.type}</td>
                      <td>{a.userName}</td>
                      <td>{a.userContact}</td>
                      <td>{a.userAddress}</td>
                      <td>
  {a.timestamp?.seconds
    ? new Date(a.timestamp.seconds * 1000).toLocaleString()
    : "Unknown"}
</td>
                      <td style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
  {normalizeStatus(a.status) === "pending" && (
    <button
      className={styles.dispatchBtn}
      onClick={() => handleAlertSelect(a)}
    >
      Dispatch
    </button>
  )}

  {normalizeStatus(a.status) === "validated" && (
    <button
      className={styles.dispatchBtn}
      onClick={() => confirmIncident(a)}
    >
      Confirm
    </button>
  )}

  <button
    className={styles.viewBtn}
    onClick={() => {
      setPreviewAlert(a);
      const candidates = buildSnapshotCandidates(a);
      setPreviewImageCandidates(candidates);
      setPreviewImageIndex(0);
      setPreviewImageFailed(false);
      setShowAlertPreviewModal(true);
    }}
  >
    View
  </button>
</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className={styles.closeBtn} onClick={() => setShowModal(false)}>
              Close
            </button>
          </>
        )}

        {/* STEP 2: TEAM LIST */}
        {dispatchStep === 2 && (
          <>
            <h3 className={styles.modalTitle}>Select Team to Dispatch</h3>

            {isCalculatingDistances && (
              <p className={styles.distanceInfo}>Calculating team proximity to selected alert...</p>
            )}

            <table className={styles.userTable}>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Station</th>
                  <th>Vehicle</th>
                  <th>Members</th>
                  <th>Distance</th>
                  <th>Status</th>
                  <th>Dispatch</th>
                </tr>
              </thead>

              <tbody>
                {sortedGroupedList.map((g: any, i) => (
                  <tr key={i}>
                    <td>
                      {g.team}
                      {recommendedTeamName === g.team && (
                        <span className={styles.recommendedBadge}>Recommended</span>
                      )}
                      {alreadyDispatchedTeams.has(g.team) && (
                        <span className={styles.alreadyDispatchedBadge}>Already Dispatched</span>
                      )}
                    </td>
                    <td>{getTeamStationName(g.team)}</td>
                    <td>{g.vehicle}</td>
                    <td>{g.responders.length}</td>
                    <td>
                      {teamDistancesKm[g.team] !== null && teamDistancesKm[g.team] !== undefined
                        ? `${(teamDistancesKm[g.team] as number).toFixed(2)} km`
                        : "N/A"}
                    </td>
                    <td>
                      <span
                        className={
                          g.status === "Available"
                            ? styles.statusAvailable
                            : g.status === "Dispatched"
                            ? styles.statusDispatched
                            : styles.statusUnavailable
                        }
                      >
                        {g.status}
                      </span>
                    </td>
                    <td>
  {g.status === "Available" && (
    <button
      className={styles.dispatchBtn}
      onClick={() => handleDispatchTeam(g)}
    >
      Dispatch Team
    </button>
  )}

  {g.status === "Dispatched" && (
    <button
      className={styles.viewBtn}
      onClick={() => viewDispatchInfo(g.team)}
    >
      View
    </button>
  )}
</td>

                  </tr>
                ))}
              </tbody>
            </table>

            <button className={styles.closeBtn} onClick={() => setShowModal(false)}>
              Cancel
            </button>
          </>
        )}

        {/* STEP 3: CONFIRM RESPONDERS */}
        {dispatchStep === 3 && (
          <>
            <h3 className={styles.modalTitle}>Confirm Responders</h3>

            <table className={styles.responderTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Team</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {responders
                  .filter((r) => selectedResponderIds.has(r.id))
                  .map((r) => {
                    const teamName =
                      teams.find((t) => t.id === r.teamId)?.teamName ||
                      "Unassigned";

                    const vehicle =
                      vehicles.find((v) => v.assignedTeam === teamName);

                    const vehicleCode = vehicle?.code || "Unassigned";

                    return (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{teamName}</td>
                        <td>{vehicleCode}</td>
                        <td>{r.status}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>

            <div className={styles.modalActions}>
              <button className={styles.dispatchBtn} onClick={dispatchResponders}>
                Dispatch Now
              </button>

              <button className={styles.closeBtn} onClick={() => setShowModal(false)}>
                Cancel
              </button>
            </div>
          </>
        )}

      </div>
      {showAlertPreviewModal && previewAlert && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowAlertPreviewModal(false)}
        >
          <div className={styles.modalWide} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.modalCloseIcon}
              aria-label="Close alert preview"
              onClick={() => setShowAlertPreviewModal(false)}
            >
              ×
            </button>
            <h3 className={styles.modalTitle}>Alert Snapshot</h3>

            <div className={styles.alertVisualGrid}>
              <div className={styles.alertPreviewImageWrap}>
                {hasPreviewImage ? (
                  <img
                    src={previewImageSrc}
                    alt="Alert snapshot"
                    className={styles.alertPreviewImage}
                    onLoad={() => setPreviewImageFailed(false)}
                    onError={() => {
                      if (previewImageIndex < previewImageCandidates.length - 1) {
                        setPreviewImageIndex((prev) => prev + 1);
                      } else {
                        setPreviewImageFailed(true);
                      }
                    }}
                  />
                ) : (
                  <p className={styles.alertMapEmpty}>No snapshot available for this alert.</p>
                )}
              </div>

              <div className={styles.alertMapWrap}>
                <h4 className={styles.alertMapTitle}>Alert Location Map</h4>
                {mapEmbedSrc ? (
                  <iframe
                    title="Alert location map"
                    className={styles.alertMapFrame}
                    src={mapEmbedSrc}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : (
                  <p className={styles.alertMapEmpty}>No address available for map preview.</p>
                )}
              </div>
            </div>

            {hasPreviewImage && previewImageFailed && (
              <p>
                Snapshot preview is blocked by file permissions. Set the Google Drive file to
                <strong> Anyone with the link</strong> and try again.
              </p>
            )}

            <div className={styles.alertPreviewInfo}>
              <p><strong>Fire Type:</strong> {fireType}</p>
              <p><strong>Alert Trigger Source:</strong> {triggerSource}</p>
              <p><strong>Description:</strong> {fireDescription}</p>
              <p><strong>Reporter:</strong> {previewAlert.userName || "Unknown"}</p>
              <p><strong>Contact:</strong> {previewAlert.userContact || "Unknown"}</p>
              <p><strong>Address:</strong> {previewAlert.userAddress || "Unknown"}</p>
            </div>

            <div className={styles.modalActions}>
              {normalizeStatus(previewAlert?.status) === "pending" && (
                <button
                  className={styles.dispatchBtn}
                  onClick={() => handleAlertSelect(previewAlert)}
                >
                  Dispatch
                </button>
              )}
              {normalizeStatus(previewAlert?.status) === "validated" && (
                <button
                  className={styles.dispatchBtn}
                  onClick={() => confirmIncident(previewAlert)}
                >
                  Confirm
                </button>
              )}
              <button
                className={styles.closeBtn}
                onClick={() => setShowAlertPreviewModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showViewModal && selectedDispatch && (
  <div className={styles.modalOverlay} onClick={() => setShowViewModal(false)}>
    <div className={styles.modalWide} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={styles.modalCloseIcon}
        aria-label="Close dispatch details"
        onClick={() => setShowViewModal(false)}
      >
        ×
      </button>
      <h3 className={styles.modalTitle}>Dispatch Details</h3>

      <p><strong>Alert Type:</strong> {selectedDispatch.alertType}</p>
      <p><strong>Location:</strong> {selectedDispatch.alertLocation}</p>
      <p><strong>Dispatched By:</strong> {selectedDispatch.dispatchedBy}</p>

      <p>
        <strong>Time:</strong>{" "}
        {selectedDispatch.timestamp
          ? new Date(
              selectedDispatch.timestamp.seconds * 1000
            ).toLocaleString()
          : "—"}
      </p>

      <hr className={styles.separator} />

      <h4>Reported By</h4>
      <p><strong>Name:</strong> {selectedDispatch.userReported}</p>
      <p><strong>Contact:</strong> {selectedDispatch.userContact}</p>
      <p><strong>Email:</strong> {selectedDispatch.userEmail}</p>
      <p><strong>Address:</strong> {selectedDispatch.userAddress}</p>

      <hr className={styles.separator} />

      <h4>Responders</h4>
      <ul>
        {selectedDispatch.responders?.map((r: any) => (
          <li key={r.id}>
            {r.name} — {r.team} ({r.vehicle})
          </li>
        ))}
      </ul>

      <button
        className={styles.closeBtn}
        onClick={() => setShowViewModal(false)}
      >
        Close
      </button>
    </div>
  </div>

  
)}

{showDispatchSuccessModal && (
  <div
    className={styles.modalOverlay}
    onClick={() => setShowDispatchSuccessModal(false)}
  >
    <div
      className={styles.modalWide}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "400px",
        maxWidth: "90%",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <h3 className={styles.modalTitle}>Dispatch Successful</h3>

      <p style={{ marginTop: "10px" }}>
        {dispatchSuccessMessage || "Responders have been dispatched successfully."}
      </p>

      <p style={{ fontSize: "12px", color: "#888", marginTop: "10px" }}>
        This will close automatically...
      </p>
    </div>
  </div>
)}

{showConfirmSuccessModal && (
  <div
    className={styles.modalOverlay}
    onClick={() => setShowConfirmSuccessModal(false)}
  >
    <div
      className={styles.modalWide}
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "400px",
        maxWidth: "90%",
        textAlign: "center",
        padding: "24px",
      }}
    >
      <h3 className={styles.modalTitle}>Confirmation Successful</h3>

      <p style={{ marginTop: "10px" }}>
        {confirmSuccessMessage || "Incident confirmed successfully."}
      </p>

      <p style={{ fontSize: "12px", color: "#888", marginTop: "10px" }}>
        This will close automatically...
      </p>
    </div>
  </div>
)}
    </div>
    
  );

  
  
};

export default AlertDispatchModal;
