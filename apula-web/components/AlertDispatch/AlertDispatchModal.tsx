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
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

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
    status === "dispatched" ||
    status === "accepted" ||
    status === "declined" ||
    status === "cancelled" ||
    status === "canceled"
  ) {
    return false;
  }

  if (
    status === "pending" ||
    status === "active" ||
    status === "open" ||
    status === "requested" ||
    status === "waiting" ||
    status === "new"
  ) {
    return true;
  }

  if (typeof data.resolved === "boolean") return !data.resolved;
  if (typeof data.isResolved === "boolean") return !data.isResolved;
  if (typeof data.completed === "boolean") return !data.completed;
  if (typeof data.isCompleted === "boolean") return !data.isCompleted;

  return true;
};

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

const normalizeIncident = (id: string, data: any, source: "alerts" | "backup_requests") => {
  const type =
    data?.type ||
    data?.alertType ||
    data?.requestType ||
    data?.backupType ||
    (source === "backup_requests" ? "Backup Request" : "Fire Alert");

  const userName =
    data?.userName ||
    data?.requestedByName ||
    data?.reportedBy ||
    data?.requestedBy ||
    data?.requesterName ||
    data?.name ||
    "Unknown";

  const userContact =
    data?.userContact ||
    data?.requestedByEmail ||
    data?.contact ||
    data?.phone ||
    data?.mobile ||
    data?.requesterContact ||
    "";

  const userAddress =
    data?.userAddress ||
    data?.location ||
    data?.alertLocation ||
    data?.address ||
    data?.requestAddress ||
    data?.stationAddress ||
    data?.stationName ||
    "";

  const location =
    data?.location ||
    data?.alertLocation ||
    data?.userAddress ||
    data?.address ||
    data?.requestAddress ||
    userAddress;

  return {
    id,
    ...data,
    __source: source,
    __isBackupRequest: source === "backup_requests",
    __baseAlertId: source === "backup_requests" ? String(data?.alertId || "") : id,
    type,
    userName,
    userContact,
    userAddress,
    location,
    status:
      data?.status ||
      data?.requestStatus ||
      data?.backupStatus ||
      data?.dispatchStatus ||
      (source === "backup_requests" ? "Pending" : data?.status),
    timestamp:
      data?.timestamp ||
      data?.requestedAt ||
      data?.createdAt ||
      data?.updatedAt ||
      null,
  };
};

const AlertDispatchModal = () => {
  const [showModal, setShowModal] = useState(false);
  const [activeIncidentTab, setActiveIncidentTab] = useState<"all" | "alerts" | "backup">("all");

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
    const [alertSnap, backupSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, "alerts"),
          where("status", "==", "Pending"),
          orderBy("timestamp", "desc")
        )
      ),
      getDocs(collection(db, "backup_requests")),
    ]);

    const alertMap = new Map<string, any>();
    alertSnap.docs.forEach((docSnap) => {
      alertMap.set(docSnap.id, docSnap.data());
    });

    const dispatchIds = new Set<string>();
    backupSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as any;
      if (typeof data?.sourceDispatchId === "string" && data.sourceDispatchId.trim()) {
        dispatchIds.add(data.sourceDispatchId.trim());
      }
      if (typeof data?.approvedDispatchId === "string" && data.approvedDispatchId.trim()) {
        dispatchIds.add(data.approvedDispatchId.trim());
      }
    });

    const dispatchDocs = await Promise.all(
      Array.from(dispatchIds).map(async (dispatchId) => {
        const docSnap = await getDoc(doc(db, "dispatches", dispatchId));
        return docSnap.exists() ? [dispatchId, docSnap.data()] : null;
      })
    );

    const dispatchMap = new Map<string, any>();
    dispatchDocs.forEach((entry) => {
      if (entry) {
        dispatchMap.set(entry[0], entry[1]);
      }
    });

    const pendingAlerts = alertSnap.docs.map((d) =>
      normalizeIncident(d.id, d.data(), "alerts")
    );

    const pendingBackupRequests = backupSnap.docs
      .map((d) => {
        const backupData = d.data() as any;
        const linkedAlert = backupData?.alertId ? alertMap.get(String(backupData.alertId)) || {} : {};
        const linkedDispatch =
          dispatchMap.get(String(backupData?.sourceDispatchId || "")) ||
          dispatchMap.get(String(backupData?.approvedDispatchId || "")) ||
          {};

        return normalizeIncident(
          d.id,
          {
            ...linkedDispatch,
            ...linkedAlert,
            ...backupData,
            userName: backupData?.requestedByName || linkedAlert?.userName || linkedDispatch?.userReported,
            userContact:
              backupData?.requestedByEmail ||
              linkedAlert?.userContact ||
              linkedDispatch?.userContact ||
              linkedAlert?.userEmail ||
              linkedDispatch?.userEmail ||
              "",
            userEmail:
              backupData?.requestedByEmail ||
              linkedAlert?.userEmail ||
              linkedDispatch?.userEmail ||
              "",
            userAddress:
              linkedAlert?.userAddress ||
              linkedDispatch?.userAddress ||
              linkedAlert?.location ||
              linkedDispatch?.alertLocation ||
              backupData?.stationName ||
              backupData?.address ||
              "",
            location:
              linkedAlert?.location ||
              linkedDispatch?.alertLocation ||
              linkedAlert?.userAddress ||
              linkedDispatch?.userAddress ||
              backupData?.stationName ||
              "",
            latitude:
              linkedAlert?.latitude ??
              linkedAlert?.lat ??
              linkedDispatch?.latitude ??
              linkedDispatch?.lat,
            longitude:
              linkedAlert?.longitude ??
              linkedAlert?.lng ??
              linkedAlert?.lon ??
              linkedDispatch?.longitude ??
              linkedDispatch?.lng ??
              linkedDispatch?.lon,
          },
          "backup_requests"
        );
      })
      .filter((item) => isOpenBackupRequest(item as Record<string, unknown>));

    const nextAlerts = [...pendingBackupRequests, ...pendingAlerts].sort(
      (a, b) => timestampToMillis(b.timestamp) - timestampToMillis(a.timestamp)
    );

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

      const baseAlertId = String(selectedAlert.__baseAlertId || selectedAlert.alertId || selectedAlert.id || "").trim();
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
    alerts: alerts.filter((item) => !item.__isBackupRequest).length,
    backup: alerts.filter((item) => item.__isBackupRequest).length,
  };

  const visibleIncidents = alerts.filter((item) => {
    if (activeIncidentTab === "alerts") return !item.__isBackupRequest;
    if (activeIncidentTab === "backup") return item.__isBackupRequest;
    return true;
  });

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
      const batch = writeBatch(db);
      const ref = doc(collection(db, "dispatches"));
      const dispatchedByName = await getDispatcherName();

      batch.set(ref, {
        alertId: selectedAlert.__baseAlertId || selectedAlert.alertId || selectedAlert.id,
        backupRequestId: selectedAlert.__isBackupRequest ? selectedAlert.id : "",
        alertType: selectedAlert.type,
        alertLocation: selectedAlert.location,
        snapshotUrl: selectedAlert.snapshotUrl || null,
        snapshotBase64: selectedAlert.snapshotBase64 || null,
        dispatchType: selectedAlert.__isBackupRequest ? "Backup" : "Primary",
        isBackup: Boolean(selectedAlert.__isBackupRequest),
        requestSource: selectedAlert.__source || "alerts",

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
      batch.update(
        doc(
          db,
          selectedAlert.__source === "backup_requests" ? "backup_requests" : "alerts",
          selectedAlert.id
        ),
        {
        status: "Dispatched",
        dispatchStatus: "Dispatched",
        respondedAt: serverTimestamp(),
        }
      );

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

      setShowModal(false);
      setDispatchStep(1);
    } catch (err) {
      console.error(err);
      alert("Dispatch failed.");
    }
  };



  // ------------------------------------------------------------
  // UI (unchanged)
  // ------------------------------------------------------------
  
  if (!showModal) return null;

  const formattedAlertTime = previewAlert?.timestamp?.seconds
    ? new Date(previewAlert.timestamp.seconds * 1000).toLocaleString()
    : "Unknown";

  const previewAddress =
    previewAlert?.userAddress ||
    previewAlert?.location ||
    previewAlert?.alertLocation ||
    "";

  const mapEmbedSrc = previewAddress
    ? `https://maps.google.com/maps?q=${encodeURIComponent(previewAddress)}&z=15&output=embed`
    : "";

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
    <div className={styles.modalOverlay}>
      <div className={styles.modalWide}>
        
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
                className={`${styles.modalTabBtn} ${activeIncidentTab === "backup" ? styles.modalTabBtnActive : ""}`}
                onClick={() => setActiveIncidentTab("backup")}
                type="button"
              >
                Backup Requests ({incidentCounts.backup})
              </button>
            </div>

            {visibleIncidents.length === 0 && (
              <p className={styles.distanceInfo}>No pending alerts or backup requests found.</p>
            )}

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
                  {visibleIncidents.map((a) => (
                    <tr key={a.id}>
                      <td>{a.__isBackupRequest ? "Backup Request" : a.type}</td>
                      <td>{a.userName}</td>
                      <td>{a.userContact}</td>
                      <td>{a.userAddress}</td>
                      <td style={{ display: "flex", gap: "8px" }}>
  <button
    className={styles.dispatchBtn}
    onClick={() => handleAlertSelect(a)}
  >
    Dispatch
  </button>

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
              <button
                className={styles.dispatchBtn}
                onClick={() => handleAlertSelect(previewAlert)}
              >
                Dispatch
              </button>
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

    </div>
  );
};

export default AlertDispatchModal;
