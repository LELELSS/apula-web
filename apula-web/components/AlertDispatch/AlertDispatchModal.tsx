"use client";

import React, { useEffect, useRef, useState } from "react";
import styles from "./alertDispatchModal.module.css";

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

const normalizeStatus = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

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

const hasValidCoordinates = (lat: number | null, lng: number | null) =>
  lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const normalizeIncident = (id: string, data: any) => {
  const type = data?.type || data?.alertType || "Fire Alert";

  const userName =
    data?.userName || data?.reportedBy || data?.name || "Unknown";

  const userContact =
    data?.userContact || data?.contact || data?.phone || data?.mobile || "";

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
    timestamp: data?.timestamp || data?.createdAt || data?.updatedAt || null,
  };
};

const AlertDispatchModal = () => {
  const [showModal, setShowModal] = useState(false);
  const [activeIncidentTab, setActiveIncidentTab] = useState<
    "all" | "alerts" | "confirmation"
  >("all");

  const [dispatchStep, setDispatchStep] = useState<1 | 2 | 3>(1);

  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);

  const [responders, setResponders] = useState<any[]>([]);
  const [selectedResponderIds, setSelectedResponderIds] = useState<Set<string>>(
    new Set(),
  );

  const [teams, setTeams] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);

  const [teamDistancesKm, setTeamDistancesKm] = useState<
    Record<string, number | null>
  >({});
  const [recommendedTeamName, setRecommendedTeamName] = useState<string | null>(
    null,
  );
  const [alreadyDispatchedTeams, setAlreadyDispatchedTeams] = useState<
    Set<string>
  >(new Set());
  const [isCalculatingDistances, setIsCalculatingDistances] = useState(false);
  const stationCoordCacheRef = useRef<
    Record<string, { lat: number; lng: number } | null>
  >({});

  const [selectedDispatch, setSelectedDispatch] = useState<any>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [previewAlert, setPreviewAlert] = useState<any>(null);
  const [showAlertPreviewModal, setShowAlertPreviewModal] = useState(false);
  const [previewImageCandidates, setPreviewImageCandidates] = useState<
    string[]
  >([]);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [resolvedPreviewCoords, setResolvedPreviewCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [showDispatchSuccessModal, setShowDispatchSuccessModal] =
    useState(false);
  const [dispatchSuccessMessage, setDispatchSuccessMessage] = useState("");
  const [showConfirmSuccessModal, setShowConfirmSuccessModal] = useState(false);
  const [confirmSuccessMessage, setConfirmSuccessMessage] = useState("");

  const [alertDispatchedTeams, setAlertDispatchedTeams] = useState<
    Record<string, string[]>
  >({});

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
          setResolvedPreviewCoords({
            lat: directLat as number,
            lng: directLng as number,
          });
        }
        return;
      }

      const address = String(
        previewAlert?.userAddress ||
          previewAlert?.location ||
          previewAlert?.alertLocation ||
          "",
      ).trim();

      if (!address) {
        if (!cancelled) setResolvedPreviewCoords(null);
        return;
      }

      try {
        const response = await fetch(
          `/api/geocode?q=${encodeURIComponent(address)}`,
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(`Geocode failed with status ${response.status}`);
        }

        const payload = await response.json();
        const first = Array.isArray(payload) ? payload[0] : null;

        const geocodedLat =
          parseCoordinate(first?.lat) ?? parseCoordinate(first?.latitude);

        const geocodedLng =
          parseCoordinate(first?.lon) ??
          parseCoordinate(first?.lng) ??
          parseCoordinate(first?.longitude);

        if (!cancelled && hasValidCoordinates(geocodedLat, geocodedLng)) {
          setResolvedPreviewCoords({
            lat: geocodedLat as number,
            lng: geocodedLng as number,
          });
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
      query(collection(db, "dispatches"), orderBy("timestamp", "desc")),
    );

    const latest = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .find(
        (d: any) =>
          d.status === "Dispatched" &&
          d.responders?.some(
            (r: any) => r.team === teamName || r.teamName === teamName,
          ),
      );

    if (!latest) {
      alert("No dispatch record found for this team.");
      return;
    }

    setSelectedDispatch(latest);
    setShowViewModal(true);
  };

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

  const loadAlerts = async () => {
    const alertSnap = await getDocs(
      query(collection(db, "alerts"), orderBy("timestamp", "desc")),
    );

    const nextAlerts = alertSnap.docs
      .map((d) => normalizeIncident(d.id, d.data()))
      .filter((item) => {
        const status = normalizeStatus(item.status);
        return (
          status === "pending" ||
          status === "dispatched" ||
          status === "validated"
        );
      })
      .sort(
        (a, b) =>
          timestampToMillis(b.timestamp) - timestampToMillis(a.timestamp),
      );

    setAlerts(nextAlerts);

    const dispatchSnap = await getDocs(collection(db, "dispatches"));
    const dispatchedMap: Record<string, string[]> = {};

    dispatchSnap.docs.forEach((docSnap) => {
      const data = docSnap.data() as any;

      if (normalizeStatus(data?.status) !== "dispatched") return;

      const alertId = String(data?.alertId || "").trim();
      if (!alertId) return;

      const teamNames = Array.from(
        new Set(
          (data?.responders || [])
            .map((r: any) => r?.team || r?.teamName)
            .filter(Boolean)
            .map((name: string) => String(name)),
        ),
      );

      if (!dispatchedMap[alertId]) {
        dispatchedMap[alertId] = [];
      }

      dispatchedMap[alertId] = Array.from(
        new Set([...dispatchedMap[alertId], ...teamNames]),
      );
    });

    setAlertDispatchedTeams(dispatchedMap);
  };

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "users"), where("role", "==", "responder")),
      (snap) => {
        setResponders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
    );
    return () => unsub();
  }, []);

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
    lon2: number,
  ) => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadiusKm = 6371;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

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
        `/api/geocode?q=${encodeURIComponent(fallbackAddress)}`,
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
      const response = await fetch(
        `/api/geocode?q=${encodeURIComponent(trimmed)}`,
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

    const fallbackAddress = String(
      station?.address || station?.addressNormalized || station?.name || "",
    ).trim();

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
        query(
          collection(db, "dispatches"),
          where("alertId", "==", baseAlertId),
        ),
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

  const groupedList = teams
    .map((team) => {
      const members = responders.filter((r) => r.teamId === team.id);

      if (members.length === 0) return null;

      const hasStation =
        team.stationId ||
        team.stationName ||
        stations.some(
          (s) => s.id === team.stationId || s.name === team.stationName,
        );

      if (!hasStation) return null;

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
            (team?.stationName && s.name === team.stationName),
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
          alertCoords.lng,
        );
      }

      const availableTeams = (groupedList as any[]).filter(
        (g) => g.status === "Available",
      );

      const nearestAvailable = availableTeams
        .map((g) => ({
          team: g.team,
          distance: distanceMap[g.team],
        }))
        .filter((item) => item.distance !== null && item.distance !== undefined)
        .sort((a, b) => (a.distance as number) - (b.distance as number))[0];

      setTeamDistancesKm(distanceMap);
      setRecommendedTeamName(nearestAvailable ? nearestAvailable.team : null);
      setIsCalculatingDistances(false);
    };

    computeDistances();
  }, [dispatchStep, selectedAlert, teams, stations, responders, vehicles]);

  useEffect(() => {
    if (responders.length === 0 || teams.length === 0 || vehicles.length === 0)
      return;

    teams.forEach((team) => {
      const teamResponders = responders.filter((r) => r.teamId === team.id);
      if (teamResponders.length === 0) return;

      const teamName = team.teamName;
      const vehicle = vehicles.find((v) => v.assignedTeam === teamName);
      const leader = teamResponders.find((r) => r.id === team.leaderId);

      const leaderResolved = leader && leader.status === "Available";
      const allAvailable = teamResponders.every(
        (r) => r.status === "Available",
      );

      if (!leaderResolved && !allAvailable) return;

      const batch = writeBatch(db);

      teamResponders.forEach((res) => {
        batch.update(doc(db, "users", res.id), { status: "Available" });
      });

      batch.update(doc(db, "teams", team.id), { status: "Available" });

      if (vehicle) {
        batch.update(doc(db, "vehicles", vehicle.id), { status: "Available" });
      }

      batch.commit();
    });
  }, [responders, teams, vehicles]);

  const sortedGroupedList = [...groupedList].sort((a: any, b: any) => {
    const aIsRecommended = recommendedTeamName === a.team;
    const bIsRecommended = recommendedTeamName === b.team;

    if (aIsRecommended && !bIsRecommended) return -1;
    if (!aIsRecommended && bIsRecommended) return 1;

    const getPriority = (group: any) => {
      if (group.status === "Available") return 1;
      if (group.status === "Dispatched") return 2;
      return 3;
    };

    const aPriority = getPriority(a);
    const bPriority = getPriority(b);

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    const aDistance = teamDistancesKm[a.team];
    const bDistance = teamDistancesKm[b.team];

    const aHasDistance = aDistance !== null && aDistance !== undefined;
    const bHasDistance = bDistance !== null && bDistance !== undefined;

    if (aHasDistance && !bHasDistance) return -1;
    if (!aHasDistance && bHasDistance) return 1;

    if (aHasDistance && bHasDistance) {
      return (aDistance as number) - (bDistance as number);
    }

    return String(a.team).localeCompare(String(b.team));
  });

  const incidentCounts = {
    all: alerts.length,
    alerts: alerts.filter(
      (item) => normalizeStatus(item.status) !== "validated",
    ).length,
    confirmation: alerts.filter(
      (item) => normalizeStatus(item.status) === "validated",
    ).length,
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
              data.name ||
              currentUser.displayName ||
              currentUser.email ||
              "Admin Panel";
          } else {
            confirmerName =
              currentUser.displayName || currentUser.email || "Admin Panel";
          }
        } catch {
          confirmerName =
            currentUser.displayName || currentUser.email || "Admin Panel";
        }
      }

      await updateDoc(doc(db, "alerts", alertItem.id), {
        status: "Confirmed",
        confirmationStatus: "Confirmed",
        confirmedAt: serverTimestamp(),
        confirmedBy: confirmerName,
      });

      const dispatchSnap = await getDocs(
        query(
          collection(db, "dispatches"),
          where("alertId", "==", alertItem.id),
        ),
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
        } has been confirmed successfully.`,
      );
      setShowConfirmSuccessModal(true);

      setTimeout(() => {
        setShowConfirmSuccessModal(false);
      }, 5000);
    } catch (error) {
      console.error("Failed to confirm incident:", error);
      alert("Failed to confirm incident.");
    }
  };

  const getTeamStationName = (teamName: string) => {
    const team = teams.find((t) => t.teamName === teamName);
    if (!team) return "Unassigned";

    if (team.stationName) return team.stationName;

    const station = stations.find(
      (s) => team.stationId && s.id === team.stationId,
    );
    return station?.name || "Unassigned";
  };

  const handleAlertSelect = (alert: any) => {
    setSelectedAlert(alert);
    setShowAlertPreviewModal(false);
    setPreviewAlert(null);
    setDispatchStep(2);
  };

  const handleDispatchTeam = (group: any) => {
    const available = group.responders.filter(
      (r: any) => r.status === "Available",
    );

    if (available.length === 0) {
      alert("No available responders in this team.");
      return;
    }

    setSelectedResponderIds(new Set(available.map((r: any) => r.id)));
    setDispatchStep(3);
  };

  const dispatchResponders = async () => {
    const selected = responders.filter((r) => selectedResponderIds.has(r.id));

    const getDispatcherName = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) return "Admin Panel";

      try {
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          return (
            data.name ||
            currentUser.displayName ||
            currentUser.email ||
            "Admin Panel"
          );
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

      selected.forEach((r) =>
        batch.update(doc(db, "users", r.id), { status: "Dispatched" }),
      );

      batch.update(doc(db, "alerts", selectedAlert.id), {
        status: "Dispatched",
        dispatchStatus: "Dispatched",
        respondedAt: serverTimestamp(),
      });

      if (selected.length > 0) {
        const firstResponder = selected[0];
        const team = teams.find((t) => t.id === firstResponder.teamId);

        if (team) {
          batch.update(doc(db, "teams", team.id), { status: "Dispatched" });
        }

        const teamName = team?.teamName;
        const vehicle = vehicles.find((v) => v.assignedTeam === teamName);

        if (vehicle) {
          batch.update(doc(db, "vehicles", vehicle.id), {
            status: "Dispatched",
          });
        }
      }

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
          }),
        ),
      );

      setDispatchSuccessMessage(
        `Successfully dispatched ${dispatchedTeamNames.join(", ")} to ${
          selectedAlert.userAddress ||
          selectedAlert.alertLocation ||
          selectedAlert.location ||
          "the selected fire address"
        }.`,
      );

      setAlertDispatchedTeams((prev) => ({
        ...prev,
        [baseAlertId]: Array.from(
          new Set([...(prev[baseAlertId] || []), ...dispatchedTeamNames]),
        ),
      }));

      setShowModal(false);
      setDispatchStep(1);
      setSelectedAlert(null);
      setSelectedResponderIds(new Set());
      setShowDispatchSuccessModal(true);

      setTimeout(() => {
        setShowDispatchSuccessModal(false);
      }, 5000);
    } catch (error) {
      console.error("Failed to dispatch responders:", error);
      alert("Failed to dispatch responders.");
    }
  };

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
      const bbox = [lng - delta, lat - delta, lng + delta, lat + delta]
        .map((value) => value.toFixed(6))
        .join("%2C");

      return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lng.toFixed(6)}`;
    }

    return previewAddress
      ? `https://maps.google.com/maps?q=${encodeURIComponent(previewAddress)}&z=15&output=embed`
      : "";
  })();

  const fireType = previewAlert?.type || previewAlert?.alertType || "Unknown";

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

  const previewImageSrc = previewImageCandidates[previewImageIndex] || "";
  const hasPreviewImage = Boolean(previewImageSrc) && !previewImageFailed;

  return (
    <>
      {showModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowModal(false)}
        >
          <div
            className={styles.modalWide}
            onClick={(e) => e.stopPropagation()}
          >
            {dispatchStep === 1 && (
              <>
                <div className={styles.modalHeader}>
                  <h3 className={styles.modalTitle}>Select Alert</h3>

                  <div className={styles.modalTabs}>
                    <button
                      className={`${styles.modalTabBtn} ${
                        activeIncidentTab === "all"
                          ? styles.modalTabBtnActive
                          : ""
                      }`}
                      onClick={() => setActiveIncidentTab("all")}
                      type="button"
                    >
                      <span>All</span>
                      <span
                        className={`${styles.modalTabBadge} ${
                          activeIncidentTab === "all"
                            ? styles.modalTabBadgeActive
                            : ""
                        }`}
                      >
                        {incidentCounts.all}
                      </span>
                    </button>

                    <button
                      className={`${styles.modalTabBtn} ${
                        activeIncidentTab === "alerts"
                          ? styles.modalTabBtnActive
                          : ""
                      }`}
                      onClick={() => setActiveIncidentTab("alerts")}
                      type="button"
                    >
                      <span>Alerts</span>
                      <span
                        className={`${styles.modalTabBadge} ${
                          activeIncidentTab === "alerts"
                            ? styles.modalTabBadgeActive
                            : ""
                        }`}
                      >
                        {incidentCounts.alerts}
                      </span>
                    </button>

                    <button
                      className={`${styles.modalTabBtn} ${
                        activeIncidentTab === "confirmation"
                          ? styles.modalTabBtnActive
                          : ""
                      }`}
                      onClick={() => setActiveIncidentTab("confirmation")}
                      type="button"
                    >
                      <span>Confirmation</span>
                      <span
                        className={`${styles.modalTabBadge} ${
                          activeIncidentTab === "confirmation"
                            ? styles.modalTabBadgeActive
                            : ""
                        }`}
                      >
                        {incidentCounts.confirmation}
                      </span>
                    </button>
                  </div>
                </div>

                <div className={styles.modalBody}>
                  {visibleIncidents.length === 0 && (
                    <p className={styles.distanceInfo}>
                      No pending alerts or validated incidents found.
                    </p>
                  )}

                  <div className={styles.tableScroll}>
                    <table className={styles.alertTable}>
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Reporter</th>
                          <th>Contact</th>
                          <th>Address</th>
                          <th>Time</th>
                          <th>Action</th>
                        </tr>
                      </thead>

                      <tbody>
                        {visibleIncidents.map((a) => (
                          <tr
                            key={a.id}
                            className={styles.clickableRow}
                            onClick={() => {
                              setPreviewAlert(a);
                              const candidates = buildSnapshotCandidates(a);
                              setPreviewImageCandidates(candidates);
                              setPreviewImageIndex(0);
                              setPreviewImageFailed(false);
                              setShowAlertPreviewModal(true);
                            }}
                          >
                            <td data-label="Type">{a.type}</td>
                            <td data-label="Reporter">{a.userName}</td>
                            <td data-label="Contact">{a.userContact}</td>
                            <td data-label="Address">{a.userAddress}</td>
                            <td data-label="Time">
                              {a.timestamp?.seconds
                                ? new Date(
                                    a.timestamp.seconds * 1000,
                                  ).toLocaleString()
                                : "Unknown"}
                            </td>
                            <td
                              data-label="Action"
                              style={{
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: "8px",
                                flexWrap: "wrap",
                                minHeight: "100%",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
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
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className={styles.modalFooter}>
                  <button
                    className={styles.closeBtn}
                    onClick={() => setShowModal(false)}
                  >
                    Close
                  </button>
                </div>
              </>
            )}

            {dispatchStep === 2 && (
              <>
                <div className={styles.modalHeader}>
                  <h3 className={styles.modalTitle}>Select Team to Dispatch</h3>
                </div>

                <div className={styles.modalBody}>
                  {isCalculatingDistances && (
                    <p className={styles.distanceInfo}>
                      Calculating team proximity to selected alert...
                    </p>
                  )}

                  <div className={styles.tableScroll}>
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
                          <tr
                            key={i}
                            className={
                              g.status === "Dispatched"
                                ? styles.clickableRow
                                : ""
                            }
                            onClick={() => {
                              if (g.status === "Dispatched") {
                                viewDispatchInfo(g.team);
                              }
                            }}
                          >
                            <td data-label="Team">
                              {g.team}
                              {recommendedTeamName === g.team && (
                                <span className={styles.recommendedBadge}>
                                  Recommended
                                </span>
                              )}
                              {alreadyDispatchedTeams.has(g.team) && (
                                <span className={styles.alreadyDispatchedBadge}>
                                  Already Dispatched
                                </span>
                              )}
                            </td>
                            <td data-label="Station">
                              {getTeamStationName(g.team)}
                            </td>
                            <td data-label="Vehicle">{g.vehicle}</td>
                            <td data-label="Members">{g.responders.length}</td>
                            <td data-label="Distance">
                              {teamDistancesKm[g.team] !== null &&
                              teamDistancesKm[g.team] !== undefined
                                ? `${(teamDistancesKm[g.team] as number).toFixed(2)} km`
                                : "N/A"}
                            </td>
                            <td data-label="Status">
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
                            <td
                              data-label="Dispatch"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {g.status === "Available" && (
                                <button
                                  className={styles.dispatchBtn}
                                  onClick={() => handleDispatchTeam(g)}
                                >
                                  Dispatch Team
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className={styles.modalFooter}>
                  <button
                    className={styles.closeBtn}
                    onClick={() => setDispatchStep(1)}
                  >
                    Back
                  </button>
                </div>
              </>
            )}

            {dispatchStep === 3 && (
              <>
                <div className={styles.modalHeader}>
                  <h3 className={styles.modalTitle}>Confirm Responders</h3>
                </div>

                <div className={styles.modalBody}>
                  <div className={styles.tableScroll}>
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

                            const vehicleCode =
                              vehicles.find((v) => v.assignedTeam === teamName)
                                ?.code ||
                              vehicles.find(
                                (v) => v.assignedTeamId === r.teamId,
                              )?.code ||
                              "Unassigned";

                            return (
                              <tr key={r.id}>
                                <td data-label="Name">{r.name}</td>
                                <td data-label="Team">{teamName}</td>
                                <td data-label="Vehicle">{vehicleCode}</td>
                                <td data-label="Status">
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
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className={styles.modalFooter}>
                  <button
                    className={styles.closeBtn}
                    onClick={() => setDispatchStep(2)}
                  >
                    Back
                  </button>
                  <button
                    className={styles.dispatchBtn}
                    onClick={dispatchResponders}
                  >
                    Dispatch Now
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showAlertPreviewModal && previewAlert && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowAlertPreviewModal(false)}
        >
          <div
            className={styles.modalWide}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Alert Snapshot</h3>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.snapshotTopGrid}>
                <div className={styles.alertPreviewImageWrap}>
                  {hasPreviewImage ? (
                    <img
                      src={previewImageSrc}
                      alt="Alert snapshot"
                      className={styles.alertPreviewImage}
                      onLoad={() => setPreviewImageFailed(false)}
                      onError={() => {
                        if (
                          previewImageIndex <
                          previewImageCandidates.length - 1
                        ) {
                          setPreviewImageIndex((prev) => prev + 1);
                        } else {
                          setPreviewImageFailed(true);
                        }
                      }}
                    />
                  ) : (
                    <div className={styles.noImageBox}>
                      {previewImageFailed
                        ? "Unable to load image."
                        : "No snapshot available."}
                    </div>
                  )}
                </div>

                <div className={styles.alertMapWrap}>
                  <h4 className={styles.alertMapTitle}>Location</h4>
                  {mapEmbedSrc ? (
                    <iframe
                      title="Alert location map"
                      src={mapEmbedSrc}
                      className={styles.alertMapFrame}
                      loading="lazy"
                    />
                  ) : (
                    <p className={styles.alertMapEmpty}>
                      No location map available.
                    </p>
                  )}
                </div>
              </div>

              <div className={styles.alertPreviewInfo}>
                <p>
                  <strong>Type:</strong> {fireType}
                </p>
                <p>
                  <strong>Reporter:</strong>{" "}
                  {previewAlert?.userName || "Unknown"}
                </p>
                <p>
                  <strong>Contact:</strong> {previewAlert?.userContact || "N/A"}
                </p>
                <p>
                  <strong>Address:</strong> {previewAddress || "N/A"}
                </p>
                <p>
                  <strong>Time:</strong> {formattedAlertTime}
                </p>
                <p>
                  <strong>Trigger Source:</strong> {triggerSource}
                </p>
                <p>
                  <strong>Description:</strong> {fireDescription}
                </p>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                className={styles.closeBtn}
                onClick={() => setShowAlertPreviewModal(false)}
              >
                Close
              </button>

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
            </div>
          </div>
        </div>
      )}

      {showViewModal && selectedDispatch && (
        <div
          className={styles.modalViewOverlay}
          onClick={() => setShowViewModal(false)}
        >
          <div
            className={styles.modalViewContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalViewTitle}>Dispatch Details</div>

            <div className={styles.modalViewBody}>
              <div className={styles.modalDetails}>
                <p>
                  <strong>Alert Type:</strong>{" "}
                  {selectedDispatch.alertType || "Fire Alert"}
                </p>
                <p>
                  <strong>Address:</strong>{" "}
                  {selectedDispatch.userAddress ||
                    selectedDispatch.alertLocation ||
                    "N/A"}
                </p>
                <p>
                  <strong>Reported By:</strong>{" "}
                  {selectedDispatch.userReported || "Unknown"}
                </p>
                <p>
                  <strong>Contact:</strong>{" "}
                  {selectedDispatch.userContact || "N/A"}
                </p>
                <p>
                  <strong>Status:</strong> {selectedDispatch.status || "N/A"}
                </p>
                <p>
                  <strong>Dispatched By:</strong>{" "}
                  {selectedDispatch.dispatchedBy || "N/A"}
                </p>
                <p>
                  <strong>Timestamp:</strong>{" "}
                  {selectedDispatch.timestamp?.seconds
                    ? new Date(
                        selectedDispatch.timestamp.seconds * 1000,
                      ).toLocaleString()
                    : "Unknown"}
                </p>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.responderTable}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Team</th>
                      <th>Vehicle</th>
                      <th>Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedDispatch.responders || []).map(
                      (responder: any, index: number) => (
                        <tr key={responder.id || index}>
                          <td data-label="Name">{responder.name || "N/A"}</td>
                          <td data-label="Team">
                            {responder.team || responder.teamName || "N/A"}
                          </td>
                          <td data-label="Vehicle">
                            {responder.vehicle || "N/A"}
                          </td>
                          <td data-label="Contact">
                            {responder.contact || "N/A"}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.modalViewActions}>
              <button
                className={styles.closeBtn}
                onClick={() => setShowViewModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showDispatchSuccessModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowDispatchSuccessModal(false)}
        >
          <div
            className={styles.successModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.successTitle}>Success</h3>
            <p className={styles.successMessage}>{dispatchSuccessMessage}</p>
            <button
              className={styles.successCloseBtn}
              onClick={() => setShowDispatchSuccessModal(false)}
            >
              Okay
            </button>
          </div>
        </div>
      )}

      {showConfirmSuccessModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowConfirmSuccessModal(false)}
        >
          <div
            className={styles.successModal}
            onClick={(e) => e.stopPropagation()}
          >
           
            <h3 className={styles.successTitle}>Confirmed</h3>
            <p className={styles.successMessage}>{confirmSuccessMessage}</p>
          </div>
        </div>
      )}
    </>
  );
};

export default AlertDispatchModal;