"use client";

import React, { useState, useEffect, useRef } from "react";
import { FiSearch, FiChevronDown } from "react-icons/fi";
import {
  FaUser,
  FaEnvelope,
  FaPhone,
  FaMapMarkerAlt,
  FaImage,
  FaInfoCircle,
  FaClock,
  FaCheckCircle,
  FaTruck,
  FaSearch,
  FaExclamationTriangle,
  FaCamera,
  FaClipboardList,
} from "react-icons/fa";
import AdminHeader from "@/components/shared/adminHeader";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";
import AdminTutorialChat from "@/components/Chatbot/AdminTutorialChat";
import styles from "./reportStyles.module.css";
import DownloadMenu from "@/components/DownloadMenu/DownloadMenu";

import {
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ── Types ─────────────────────────────────────────────────────────────────────

type ValidationReport = {
  actualFireImageBase64?: string;
  fireTypes?: string[];
  injuredOrTrapped?: boolean;
  remarks?: string;
  resourcesNeeded?: string[];
  skippedBecauseRadioed?: boolean;
  sourceOfFire?: string;
  submittedAt?: { seconds: number };
  validatedBy?: string;
  validatedByEmail?: string;
  validatedById?: string;
};

type ReportItem = {
  id: string;
  userName?: string;
  userContact?: string;
  userEmail?: string;
  userAddress?: string;
  status?: string;
  timestamp?: { seconds: number };
  confirmedAt?: { seconds: number };
  monitoringStatus?: string;
  monitoringMessage?: string;
  monitoringUpdatedAt?: { seconds: number };
  monitoredBy?: string;
  confirmationStatus?: string;
  confirmedBy?: string;
  imageUrls?: string[];
  snapshotUrl?: string;
  snapshotBase64?: string;
  snapshot?: string;
  validationImageUrls?: string[];
  validationSnapshotUrl?: string;
  validationSnapshotBase64?: string;
  type?: string;
  source?: string;
  sourceLabel?: string;
  validatedAt?: { seconds: number };
  latestValidationSubmittedAt?: { seconds: number };
  latestValidationDispatchId?: string;
  latestValidationReport?: ValidationReport;
};

type ResponderItem = {
  name?: string;
  contact?: string;
  email?: string;
  team?: string;
  teamId?: string;
  vehicle?: string;
};

type DispatchInfo = {
  id?: string;
  timestamp?: { seconds: number };
  responders?: ResponderItem[];
  status?: string;
  confirmedAt?: { seconds: number };
  confirmedBy?: string;
  leaderName?: string;
  vehicle?: string;
  snapshotUrl?: string;
  snapshotBase64?: string;
};

type TeamItem = {
  id: string;
  teamName?: string;
  leaderId?: string;
  leaderName?: string;
  members?: Array<{
    id?: string;
    name?: string;
    status?: string;
    teamName?: string;
  }>;
};

// ── Image helpers ─────────────────────────────────────────────────────────────

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
  if (!url.includes("drive.google.com")) return [url];
  const fileId = extractGoogleDriveFileId(url);
  if (!fileId) return [url];
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
  if (trimmed.startsWith("data:image")) return trimmed;
  const clean = trimmed.replace(/\s/g, "");
  if (!clean) return null;
  let mime = "image/jpeg";
  if (clean.startsWith("iVBOR")) mime = "image/png";
  if (clean.startsWith("R0lGOD")) mime = "image/gif";
  if (clean.startsWith("UklGR")) mime = "image/webp";
  return `data:${mime};base64,${clean}`;
};

const buildSnapshotCandidates = (reportData: ReportItem): string[] => {
  if (reportData?.snapshotUrl) return buildImageCandidates(reportData.snapshotUrl);
  const b = normalizeBase64Snapshot(reportData?.snapshotBase64) ||
            normalizeBase64Snapshot(reportData?.snapshot);
  return b ? [b] : [];
};

const buildValidationSnapshotCandidates = (reportData: ReportItem): string[] => {
  if (reportData?.validationSnapshotUrl) return buildImageCandidates(reportData.validationSnapshotUrl);
  const b = normalizeBase64Snapshot(reportData?.validationSnapshotBase64);
  return b ? [b] : [];
};

const buildAllImageUrls = (report: ReportItem): string[] => {
  const snap = buildSnapshotCandidates(report);
  const snapUrl = snap[0] ?? null;
  const all: string[] = [];
  if (snapUrl) all.push(snapUrl);
  (report.imageUrls || []).forEach((u) => { if (u && u !== snapUrl) all.push(u); });
  return all;
};

const buildValidationImageUrls = (report: ReportItem): string[] => {
  const snap = buildValidationSnapshotCandidates(report);
  const snapUrl = snap[0] ?? null;
  const all: string[] = [];
  if (snapUrl) all.push(snapUrl);
  (report.validationImageUrls || []).forEach((u) => {
    if (u && u !== snapUrl) all.push(u);
  });
  return all;
};

// ── Barangay list ─────────────────────────────────────────────────────────────

const BACOOR_BARANGAYS = [
  "All Barangays","Alima","Aniban I","Aniban II","Aniban III","Aniban IV","Aniban V",
  "Bayanan","Buhay na Tubig","Bukid","Camposanto","Carbonero","Caridad Hills","Casile",
  "Coast Barrio","Decaibo","Digman","Dulong Bayan","Durungao","Field","Habay I","Habay II",
  "Kaingin","Ligas I","Ligas II","Ligas III","Mabolo I","Mabolo II","Mabolo III",
  "Maliksi I","Maliksi II","Maliksi III","Mambog I","Mambog II","Mambog III","Mambog IV",
  "Mambog V","Mangubat","Molino I","Molino II","Molino III","Molino IV","Molino V",
  "Molino VI","Molino VII","Niog I","Niog II","Niog III","P.F. Espiritu I","P.F. Espiritu II",
  "P.F. Espiritu III","P.F. Espiritu IV","P.F. Espiritu V","P.F. Espiritu VI",
  "P.F. Espiritu VII","P.F. Espiritu VIII","Pasong Buaya I","Pasong Buaya II",
  "Queensrow Central","Queensrow East","Queensrow West","Real I","Real II","Salinas I",
  "Salinas II","Salinas III","Salinas IV","San Nicolas I","San Nicolas II","San Nicolas III",
  "Sineguelasan","Tabing Dagat","Talaba I","Talaba II","Talaba III","Talaba IV","Talaba V",
  "Talaba VI","Talaba VII","Zapote I","Zapote II","Zapote III","Zapote IV","Zapote V",
];

// ── IncidentImage component ───────────────────────────────────────────────────

const IncidentImage: React.FC<{ candidates: string[]; alt: string; onClick: () => void }> = ({
  candidates, alt, onClick,
}) => {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const src = candidates[index] || "";
  if (!src || failed) {
    return (
      <div style={{
        borderRadius: 8, border: "2px dashed #e5e7eb", aspectRatio: "1",
        background: "#f3f4f6", display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 11, color: "#9ca3af",
      }}>No image</div>
    );
  }
  return (
    <div onClick={onClick} style={{
      borderRadius: 8, overflow: "hidden", cursor: "pointer",
      border: "2px solid #e5e7eb", aspectRatio: "1", background: "#f3f4f6",
      transition: "border-color 0.2s",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#a30000")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        onLoad={() => setFailed(false)}
        onError={() => {
          if (index < candidates.length - 1) setIndex((p) => p + 1);
          else setFailed(true);
        }}
      />
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const ReportPage = () => {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [filteredReports, setFilteredReports] = useState<ReportItem[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterBarangay, setFilterBarangay] = useState("All Barangays");
  const [barangayOpen, setBarangayOpen] = useState(false);
  const barangayRef = useRef<HTMLDivElement>(null);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [dispatches, setDispatches] = useState<DispatchInfo[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (barangayRef.current && !barangayRef.current.contains(e.target as Node))
        setBarangayOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const q = query(collection(db, "alerts"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as ReportItem[];
      setReports(data);
      setFilteredReports(data);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    getDocs(collection(db, "teams"))
      .then((snap) => setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as TeamItem[]))
      .catch(() => setTeams([]));
  }, []);

  useEffect(() => {
    let result = [...reports].filter(
      (r) => String(r.status || "").toLowerCase() !== "resolved"
    );
    if (filterStatus === "All") {
      result = result.filter((r) =>
        ["Pending", "Dispatched", "Validated", "Confirmed"].includes(r.status || "")
      );
    } else {
      result = result.filter((r) => r.status === filterStatus);
    }
    if (filterBarangay !== "All Barangays") {
      result = result.filter((r) =>
        r.userAddress?.toLowerCase().includes(filterBarangay.toLowerCase())
      );
    }
    if (filterDateFrom) {
      const from = new Date(filterDateFrom); from.setHours(0, 0, 0, 0);
      result = result.filter((r) => r.timestamp && new Date(r.timestamp.seconds * 1000) >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo); to.setHours(23, 59, 59, 999);
      result = result.filter((r) => r.timestamp && new Date(r.timestamp.seconds * 1000) <= to);
    }
    result = result.filter(
      (r) =>
        r.userName?.toLowerCase().includes(search.toLowerCase()) ||
        r.userAddress?.toLowerCase().includes(search.toLowerCase())
    );
    setFilteredReports(result);
  }, [reports, search, filterStatus, filterBarangay, filterDateFrom, filterDateTo]);

  useEffect(() => { setCurrentPage(1); }, [search, filterStatus, filterBarangay, filterDateFrom, filterDateTo]);

  useEffect(() => {
    if (!selectedReport) return;
    const q = query(collection(db, "dispatches"), where("alertId", "==", selectedReport.id));
    getDocs(q)
      .then((snap) => {
        if (snap.empty) { setDispatches([]); return; }
        const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as DispatchInfo[];
        all.sort((a, b) => (a.timestamp?.seconds ?? 0) - (b.timestamp?.seconds ?? 0));
        setDispatches(all);
      })
      .catch(() => setDispatches([]));
  }, [selectedReport]);

  const closeModal = () => {
    setSelectedReport(null);
    setDispatches([]);
    setLightboxSrc(null);
  };

  const getTeamName = (d: DispatchInfo) =>
    d.responders?.[0]?.team || d.responders?.[0]?.teamId || "N/A";

  const getTeamDetails = (d: DispatchInfo) => {
    const name = getTeamName(d);
    return (
      teams.find((t) => t.teamName === name) ||
      teams.find((t) => t.members?.some((m) => m.teamName === name || m.id === d.responders?.[0]?.teamId)) ||
      null
    );
  };

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
  const paginatedReports = filteredReports.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // ── Modal render ────────────────────────────────────────────────────────────

  const renderModal = () => {
    if (!selectedReport) return null;

    // DEBUG: log all fields so we can identify exact Firestore field names
    console.log("[ReportModal] selectedReport fields:", JSON.stringify(selectedReport, null, 2));

    const allImages = buildAllImageUrls(selectedReport);
    const validationImages = buildValidationImageUrls(selectedReport);
    const hasImages = allImages.length > 0;
    const hasValidationImages = validationImages.length > 0;
    const status = selectedReport.status || "Pending";

    const alertTimestamp = selectedReport.timestamp?.seconds;
    const dispatchTimestamp = dispatches[0]?.timestamp?.seconds;

    const confirmedTimestamp =
      selectedReport.confirmedAt?.seconds ??
      dispatches[0]?.confirmedAt?.seconds ??
      null;

    // ── Pull validation fields from every possible location ────────────────
    const sr = selectedReport as any;
    const vr: ValidationReport | undefined = selectedReport.latestValidationReport;

    // validatedBy: check nested report first, then every known root-level field
    const validatedBy =
      vr?.validatedBy ||
      vr?.validatedByEmail ||
      sr.validatedBy ||
      sr.validatedByEmail ||
      sr.validatedByName ||
      selectedReport.monitoredBy ||
      sr.monitoringBy ||
      null;

    // validatedAt: handle both Firestore Timestamp objects and raw number seconds
    const validatedAt =
      selectedReport.validatedAt?.seconds ||
      vr?.submittedAt?.seconds ||
      selectedReport.latestValidationSubmittedAt?.seconds ||
      (typeof sr.latestValidationSubmittedAt === "number" ? sr.latestValidationSubmittedAt : null) ||
      (typeof sr.validatedAt === "number" ? sr.validatedAt : null) ||
      sr.validationSubmittedAt?.seconds ||
      null;

    // monitoring: check all possible field names
    const monitoringMessage =
      selectedReport.monitoringMessage ||
      sr.monitoringNote ||
      sr.monitoringUpdate ||
      sr.monitoringStatus ||
      null;

    const monitoredBy =
      selectedReport.monitoredBy ||
      sr.monitoringBy ||
      null;

    // ── Primitive sub-components ────────────────────────────────────────────

    const TimelineDot = ({ color }: { color: string }) => (
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 4 }} />
    );

    const TimelineItem = ({ label, ts, by, color, last }: {
      label: string; ts?: number | null; by?: string | null; color: string; last?: boolean;
    }) => (
      <div style={{ display: "flex", gap: 10, paddingBottom: last ? 0 : 12 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 18 }}>
          <TimelineDot color={color} />
          {!last && <div style={{ flex: 1, width: 2, background: "#e5e7eb", marginTop: 3 }} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", marginTop: 1 }}>
            {ts ? new Date(ts * 1000).toLocaleString() : "—"}
          </div>
          {by && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>{by}</div>}
        </div>
      </div>
    );

    const SectionCard = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <div style={{
          padding: "9px 16px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb",
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          {icon}&nbsp;{title}
        </div>
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {children}
        </div>
      </div>
    );

    const InfoRow = ({ label, value }: { label: string; value?: string | null }) => (
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 6, fontSize: 13.5, alignItems: "baseline" }}>
        <span style={{ color: "#6b7280", fontWeight: 500 }}>{label}</span>
        <span style={{ color: "#111827", fontWeight: 500, wordBreak: "break-word" }}>{value || "N/A"}</span>
      </div>
    );

    const MetaCard = ({ label, value }: { label: string; value: string }) => (
      <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#111827" }}>{value}</div>
      </div>
    );

    const Divider = () => <div style={{ height: 1, background: "#e5e7eb", margin: "2px 0" }} />;

    const NoticeBanner = ({ icon, text, colors }: {
      icon: React.ReactNode; text: string;
      colors: { bg: string; text: string; border: string };
    }) => (
      <div style={{
        padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 500,
        display: "flex", alignItems: "center", gap: 10,
        background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
      }}>
        <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>
        {text}
      </div>
    );

    const StatusBadge = () => (
      <span className={`${styles.statusBadge} ${styles[selectedReport.status?.toLowerCase() as keyof typeof styles] || ""}`}>
        {selectedReport.status || "Unknown"}
      </span>
    );

    // ── Reusable blocks ─────────────────────────────────────────────────────

    const PhotosGrid = ({ images, isValidation = false }: { images: string[]; isValidation?: boolean }) => {
      if (!images.length) return null;
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 8 }}>
          {images.map((url, i) => {
            const snapCandidates = isValidation
              ? buildValidationSnapshotCandidates(selectedReport)
              : buildSnapshotCandidates(selectedReport);
            const isSnap = i === 0 && snapCandidates.length > 0 && url === snapCandidates[0];
            return (
              <IncidentImage
                key={i}
                candidates={isSnap ? snapCandidates : [url]}
                alt={`${isValidation ? "Validation" : "Incident"} Photo ${i + 1}`}
                onClick={() => setLightboxSrc(url)}
              />
            );
          })}
        </div>
      );
    };

    const IncidentPhotosBlock = () =>
      hasImages ? (
        <SectionCard icon={<FaImage style={{ color: "#6b7280" }} />} title={`Incident Photos (${allImages.length})`}>
          <PhotosGrid images={allImages} isValidation={false} />
        </SectionCard>
      ) : null;

    const ValidationPhotosBlock = () =>
      hasValidationImages ? (
        <SectionCard icon={<FaCamera style={{ color: "#6b7280" }} />} title={`Validation Photos (${validationImages.length})`}>
          <PhotosGrid images={validationImages} isValidation={true} />
        </SectionCard>
      ) : null;

    const TeamBlock = ({ showMembers = true }: { showMembers?: boolean }) => {
      const d = dispatches[0] ?? null;
      const matched = d ? getTeamDetails(d) : null;
      const teamName = d ? getTeamName(d) : "—";
      const leaderName = matched?.leaderName || d?.leaderName || d?.responders?.[0]?.name || "—";
      const vehicleName = d?.vehicle || d?.responders?.find((r) => r?.vehicle)?.vehicle || "—";

      return (
        <SectionCard icon={<FaTruck style={{ color: "#6b7280" }} />} title="Response Team">
          {!d ? (
            <div style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>
              Dispatch information is still loading or unavailable.
            </div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <MetaCard label="Team" value={teamName} />
                <MetaCard label="Team Leader" value={leaderName} />
                <MetaCard label="Vehicle" value={vehicleName} />
              </div>
              {showMembers && d.responders && d.responders.length > 0 && (
                <>
                  <Divider />
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>Members</div>
                  {d.responders.map((r, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 6, fontSize: 13, alignItems: "baseline" }}>
                      <span style={{ fontWeight: 600, color: "#111827" }}>{r.name || "N/A"}</span>
                      <span style={{ color: "#6b7280" }}>{[r.contact, r.email].filter(Boolean).join(" · ") || "N/A"}</span>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </SectionCard>
      );
    };

    // ── ValidationReportBlock ───────────────────────────────────────────────
    const ValidationReportBlock = () => {
      const v: ValidationReport | null = selectedReport.latestValidationReport ?? null;

      const validatedByStr = [
        v?.validatedBy,
        v?.validatedByEmail,
        validatedBy,
      ].filter(Boolean).filter((val, idx, arr) => arr.indexOf(val) === idx).join(" · ");

      const submittedAtSec =
        v?.submittedAt?.seconds ??
        validatedAt ??
        null;

      const actualImg = normalizeBase64Snapshot(v?.actualFireImageBase64 ?? null);
      const fireTypes = Array.isArray(v?.fireTypes) ? v!.fireTypes! : [];
      const resources = Array.isArray(v?.resourcesNeeded) ? v!.resourcesNeeded! : [];

      const hasAnyData = v || validatedBy || submittedAtSec || (status === "Validated" || status === "Confirmed");

      return (
        <SectionCard icon={<FaClipboardList style={{ color: "#6b7280" }} />} title="Validation Report">
          <>
            {v?.sourceOfFire && <InfoRow label="Source of Fire" value={v.sourceOfFire} />}
            {v?.remarks && <InfoRow label="Remarks" value={v.remarks} />}
            {fireTypes.length > 0 && <InfoRow label="Fire Types" value={fireTypes.join(", ")} />}
            {resources.length > 0 && <InfoRow label="Resources Needed" value={resources.join(", ")} />}
            <InfoRow label="Validated By" value={validatedByStr || "N/A"} />
            <InfoRow
              label="Submitted At"
              value={submittedAtSec ? new Date((submittedAtSec as number) * 1000).toLocaleString() : "N/A"}
            />
            {actualImg && (
              <>
                <Divider />
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Actual Fire Image
                </div>
                <div
                  style={{ width: 140, height: 140, borderRadius: 8, overflow: "hidden", border: "2px solid #e5e7eb", cursor: "pointer", transition: "border-color 0.2s" }}
                  onClick={() => setLightboxSrc(actualImg)}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#a30000")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
                >
                  <img src={actualImg} alt="Actual fire" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              </>
            )}
            {!v && !validatedBy && !submittedAtSec && (
              <div style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>
                No additional validation details recorded.
              </div>
            )}
          </>
        </SectionCard>
      );
    };

    // ── MonitoringBlock ─────────────────────────────────────────────────────
    const MonitoringBlock = () => {
      const hasData = monitoringMessage || monitoredBy || selectedReport.monitoringUpdatedAt;
      return (
        <SectionCard icon={<FaClipboardList style={{ color: "#6b7280" }} />} title="Monitoring Update">
          {!hasData ? (
            <div style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>
              No monitoring update has been recorded yet.
            </div>
          ) : (
            <>
              {monitoringMessage && <InfoRow label="Status Note" value={monitoringMessage} />}
              {monitoredBy && <InfoRow label="Monitored By" value={monitoredBy} />}
              {selectedReport.monitoringUpdatedAt && (
                <InfoRow label="Updated At" value={new Date(selectedReport.monitoringUpdatedAt.seconds * 1000).toLocaleString()} />
              )}
            </>
          )}
        </SectionCard>
      );
    };

    const ReporterCardCompact = () => (
      <SectionCard icon={<FaUser style={{ color: "#6b7280" }} />} title="Reporter">
        <InfoRow label="Name" value={selectedReport.userName} />
        <InfoRow label="Contact" value={selectedReport.userContact} />
        <InfoRow label="Address" value={selectedReport.userAddress} />
        <Divider />
        <InfoRow label="Received" value={alertTimestamp ? new Date(alertTimestamp * 1000).toLocaleString() : null} />
      </SectionCard>
    );

    const noticeConfig: Record<string, { bg: string; text: string; border: string; icon: React.ReactNode; msg: string }> = {
      Pending:    { bg: "#fff1f2", text: "#a30000", border: "#fecdd3", icon: <FaExclamationTriangle />, msg: "No team has been dispatched yet. This incident is awaiting response." },
      Dispatched: { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe", icon: <FaTruck />, msg: "A response team has been dispatched and is en route to the incident site." },
      Validated:  { bg: "#fef9ec", text: "#92400e", border: "#fde68a", icon: <FaSearch />, msg: "The incident has been validated by a field responder and is currently being monitored." },
      Confirmed:  { bg: "#ecfdf5", text: "#166534", border: "#bbf7d0", icon: <FaCheckCircle />, msg: "This incident has been officially confirmed and resolved by the assigned response team." },
    };
    const notice = noticeConfig[status] ?? noticeConfig.Pending;

    // ── Download data ───────────────────────────────────────────────────────
    const d0 = dispatches[0];
    const teamName = d0 ? getTeamName(d0) : null;
    const matched0 = d0 ? getTeamDetails(d0) : null;
    const leaderName = matched0?.leaderName || d0?.leaderName || d0?.responders?.[0]?.name || "N/A";
    const vehicleName = d0?.vehicle || d0?.responders?.find((r) => r?.vehicle)?.vehicle || "N/A";

    const reportRows: (string | number)[][] = [
      ["Report ID", selectedReport.id],
      ["Status", selectedReport.status || "N/A"],
      ["Reporter Name", selectedReport.userName || "N/A"],
      ["Contact", selectedReport.userContact || "N/A"],
      ["Email", selectedReport.userEmail || "N/A"],
      ["Address", selectedReport.userAddress || "N/A"],
      ["Alert Type", selectedReport.type || "N/A"],
      ["Source", selectedReport.sourceLabel || selectedReport.source || "N/A"],
      ["Alert Received At", alertTimestamp ? new Date(alertTimestamp * 1000).toLocaleString() : "N/A"],
      ["Dispatch Time", dispatchTimestamp ? new Date(dispatchTimestamp * 1000).toLocaleString() : "N/A"],
      ["Team", teamName || "N/A"],
      ["Team Leader", leaderName],
      ["Vehicle", vehicleName],
      ["Validated By", validatedBy || "N/A"],
      ["Validated At", validatedAt ? new Date(validatedAt * 1000).toLocaleString() : "N/A"],
      ["Source of Fire", vr?.sourceOfFire || "N/A"],
      ["Remarks", vr?.remarks || "N/A"],
      ["Fire Types", vr?.fireTypes?.join(", ") || "N/A"],
      ["Resources Needed", vr?.resourcesNeeded?.join(", ") || "N/A"],
      ["Confirmed By", selectedReport.confirmedBy || d0?.confirmedBy || "N/A"],
      ["Confirmed At", confirmedTimestamp ? new Date(confirmedTimestamp * 1000).toLocaleString() : "N/A"],
      ["Incident Photos", allImages.length > 0 ? `${allImages.length} image(s)` : "None"],
      ["Validation Photos", validationImages.length > 0 ? `${validationImages.length} image(s)` : "None"],
    ];
    if (d0?.responders) {
      d0.responders.forEach((r, i) => {
        reportRows.push([`Member ${i + 1}`, [r.name, r.contact, r.email].filter(Boolean).join(" · ") || "N/A"]);
      });
    }

    const subtitleParts = [`Status: ${status}`];
    if (selectedReport.userAddress) subtitleParts.push(`Address: ${selectedReport.userAddress}`);
    if (alertTimestamp) subtitleParts.push(`Received: ${new Date(alertTimestamp * 1000).toLocaleString()}`);

    // ── JSX ─────────────────────────────────────────────────────────────────
    return (
      <div className={styles.modalOverlay}>
        <div className={styles.modalContent}>

          {/* Header */}
          <div className={styles.modalHeader}>
            <h3 className={styles.modalTitle}>Incident Report</h3>
            <StatusBadge />
          </div>

          {/* Body */}
          <div className={styles.modalBody}>
            <NoticeBanner icon={notice.icon} text={notice.msg} colors={notice} />

            {/* ── PENDING ── */}
            {status === "Pending" && (
              <>
                <SectionCard icon={<FaUser style={{ color: "#6b7280" }} />} title="Reporter">
                  <InfoRow label="Name" value={selectedReport.userName} />
                  <InfoRow label="Contact" value={selectedReport.userContact} />
                  <InfoRow label="Email" value={selectedReport.userEmail} />
                  <InfoRow label="Address" value={selectedReport.userAddress} />
                  <Divider />
                  <InfoRow label="Alert Received" value={alertTimestamp ? new Date(alertTimestamp * 1000).toLocaleString() : null} />
                </SectionCard>
                <IncidentPhotosBlock />
              </>
            )}

            {/* ── DISPATCHED ── */}
            {status === "Dispatched" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <ReporterCardCompact />
                  <SectionCard icon={<FaClock style={{ color: "#6b7280" }} />} title="Dispatch Timeline">
                    <TimelineItem label="Alert Received" ts={alertTimestamp} color="#f59e0b" />
                    <TimelineItem label="Dispatched" ts={dispatchTimestamp} by={d0 ? getTeamName(d0) : null} color="#3b82f6" last />
                  </SectionCard>
                </div>
                <TeamBlock />
                <IncidentPhotosBlock />
              </>
            )}

            {/* ── VALIDATED ── */}
            {status === "Validated" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <ReporterCardCompact />
                  <SectionCard icon={<FaClock style={{ color: "#6b7280" }} />} title="Incident Timeline">
                    <TimelineItem label="Alert Received" ts={alertTimestamp} color="#f59e0b" />
                    {dispatchTimestamp && (
                      <TimelineItem label="Dispatched" ts={dispatchTimestamp} by={d0 ? getTeamName(d0) : null} color="#3b82f6" />
                    )}
                    <TimelineItem label="Validated" ts={validatedAt} by={validatedBy} color="#d97706" last />
                  </SectionCard>
                </div>
                <ValidationReportBlock />
                <MonitoringBlock />
                <TeamBlock showMembers={false} />
                <IncidentPhotosBlock />
                <ValidationPhotosBlock />
              </>
            )}

            {/* ── CONFIRMED ── */}
            {status === "Confirmed" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <SectionCard icon={<FaUser style={{ color: "#6b7280" }} />} title="Reporter">
                    <InfoRow label="Name" value={selectedReport.userName} />
                    <InfoRow label="Contact" value={selectedReport.userContact} />
                    <InfoRow label="Email" value={selectedReport.userEmail} />
                    <InfoRow label="Address" value={selectedReport.userAddress} />
                    <Divider />
                    <InfoRow label="Alert Type" value={selectedReport.type} />
                    <InfoRow label="Source" value={selectedReport.sourceLabel || selectedReport.source} />
                  </SectionCard>
                  <SectionCard icon={<FaClock style={{ color: "#6b7280" }} />} title="Full Incident Timeline">
                    <TimelineItem label="Alert Received" ts={alertTimestamp} color="#f59e0b" />
                    {dispatchTimestamp && (
                      <TimelineItem label="Dispatched" ts={dispatchTimestamp} by={d0 ? getTeamName(d0) : null} color="#3b82f6" />
                    )}
                    {validatedAt && (
                      <TimelineItem label="Validated" ts={validatedAt} by={validatedBy} color="#d97706" />
                    )}
                    <TimelineItem label="Confirmed" ts={confirmedTimestamp} by={selectedReport.confirmedBy || d0?.confirmedBy} color="#16a34a" last />
                  </SectionCard>
                </div>
                <ValidationReportBlock />
                <MonitoringBlock />
                <SectionCard icon={<FaCheckCircle style={{ color: "#16a34a" }} />} title="Confirmation Details">
                  <InfoRow label="Confirmed By" value={selectedReport.confirmedBy || d0?.confirmedBy} />
                  <InfoRow label="Confirmed At" value={confirmedTimestamp ? new Date(confirmedTimestamp * 1000).toLocaleString() : null} />
                  <InfoRow label="Confirmation Status" value={selectedReport.confirmationStatus} />
                </SectionCard>
                <TeamBlock showMembers />
                <IncidentPhotosBlock />
                <ValidationPhotosBlock />
              </>
            )}
          </div>

          {/* Footer */}
          <div className={styles.modalActions}>
            <DownloadMenu
              title="Fire Incident Report"
              subtitle={subtitleParts.join(" · ")}
              description={`Incident reported by ${selectedReport.userName || "unknown"} at ${selectedReport.userAddress || "unknown address"}.`}
              columns={["Field", "Value"]}
              rows={reportRows}
              filename={`fire-report-${selectedReport.id}`}
            />
            <button className={styles.closeBtn} onClick={closeModal}><span>Close</span></button>
          </div>
        </div>
      </div>
    );
  };

  // ── Page render ─────────────────────────────────────────────────────────────

  return (
    <div>
      <AdminHeader />
      <AlertBellButton />
      <AdminTutorialChat />
      <AlertDispatchModal />

      <div className={styles.container}>
        <div className={styles.contentSection}>
          <h2 className={styles.pageTitle}>Incident Reports</h2>
          <hr className={styles.separator} />

          <div className={styles.infoBox}>
            <FaInfoCircle className={styles.infoIcon} />
            <p className={styles.infoText}>
              This page displays all recorded fire incident reports, including reporter details,
              address, status, and dispatch activity. Use the search bar and status filters to
              quickly find and review specific incident records.
            </p>
          </div>

          <div className={styles.filtersRow}>
            <div className={styles.searchWrapper}>
              <input type="text" placeholder="Search reports..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <FiSearch />
            </div>

            <div className={styles.statusFilters}>
              <div ref={barangayRef} className={styles.barangayWrapper}>
                <button
                  onClick={() => setBarangayOpen((o) => !o)}
                  className={`${styles.filterBtn} ${filterBarangay !== "All Barangays" ? styles.activeBarangayFilter : ""}`}
                >
                  <FaMapMarkerAlt className={styles.pinIcon} />
                  {filterBarangay === "All Barangays" ? "All Barangay" : filterBarangay}
                  <FiChevronDown className={`${styles.chevronIcon} ${barangayOpen ? styles.chevronOpen : ""}`} />
                </button>
                {barangayOpen && (
                  <div className={styles.barangayDropdown}>
                    {BACOOR_BARANGAYS.map((b) => (
                      <button key={b}
                        onClick={() => { setFilterBarangay(b); setBarangayOpen(false); }}
                        className={`${styles.barangayOption} ${filterBarangay === b ? styles.selectedBarangay : ""}`}
                      >{b}</button>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.dateRangeWrapper}>
                <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className={styles.dateInput} title="From date" />
                <span className={styles.dateSeparator}>–</span>
                <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className={styles.dateInput} title="To date" />
                {(filterDateFrom || filterDateTo) && (
                  <button className={styles.dateClearBtn} onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }} title="Clear dates">×</button>
                )}
              </div>

              {["All", "Pending", "Dispatched", "Validated", "Confirmed"].map((s) => (
                <button key={s}
                  className={`${styles.filterBtn} ${styles[`${s.toLowerCase()}Btn` as keyof typeof styles]} ${filterStatus === s ? styles.activeFilter : ""}`}
                  onClick={() => setFilterStatus(s)}
                >{s}</button>
              ))}
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.reportTable}>
              <thead>
                <tr>
                  <th>Name</th><th>Address</th><th>Status</th><th>Received At</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedReports.length > 0 ? paginatedReports.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Name">{r.userName || "Unknown"}</td>
                    <td data-label="Address">{r.userAddress || "Unknown"}</td>
                    <td data-label="Status">
                      <span className={`${styles.statusBadge} ${styles[r.status?.toLowerCase() as keyof typeof styles] || ""}`}>
                        {r.status || "Unknown"}
                      </span>
                    </td>
                    <td data-label="Received At">{r.timestamp ? new Date(r.timestamp.seconds * 1000).toLocaleString() : "Unknown"}</td>
                    <td data-label="Actions">
                      <button className={styles.viewBtn} onClick={() => setSelectedReport(r)}><span>View</span></button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={5} className={styles.noResults}>No reports found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredReports.length > 0 && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn} onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1}>Prev</button>
              <span className={styles.pageInfo}>Page {currentPage} of {totalPages || 1}</span>
              <button className={styles.pageBtn} onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages || totalPages === 0}>Next</button>
            </div>
          )}
        </div>

        {renderModal()}

        {lightboxSrc && (
          <div onClick={() => setLightboxSrc(null)} style={{
            position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.85)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out", padding: 24,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxSrc} alt="Full-size preview"
              style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.5)" }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportPage;
