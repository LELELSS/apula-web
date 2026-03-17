"use client";

import React, { useState, useEffect } from "react";
import { FiSearch } from "react-icons/fi";
import { FaUser, FaEnvelope, FaPhone, FaMapMarkerAlt } from "react-icons/fa";
import AdminHeader from "@/components/shared/adminHeader";
import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";
import styles from "./reportStyles.module.css";
import jsPDF from "jspdf";

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

type ReportItem = {
  id: string;
  userName?: string;
  userContact?: string;
  userEmail?: string;
  userAddress?: string;
  status?: string;
  timestamp?: { seconds: number };
  monitoringStatus?: string;
  monitoringMessage?: string;
  monitoringUpdatedAt?: { seconds: number };
  monitoredBy?: string;
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
  dispatchType?: string;
  isBackup?: boolean;
  timestamp?: { seconds: number };
  responders?: ResponderItem[];
};

const ReportPage = () => {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [filteredReports, setFilteredReports] = useState<ReportItem[]>([]);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");

  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedStatus, setEditedStatus] = useState("");

  const [dispatches, setDispatches] = useState<DispatchInfo[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  useEffect(() => {
    const q = query(collection(db, "alerts"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as ReportItem[];

      setReports(data);
      setFilteredReports(data);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    let result = [...reports];

    if (filterStatus !== "All") {
      result = result.filter((r) => r.status === filterStatus);
    }

    result = result.filter(
      (r) =>
        r.userName?.toLowerCase().includes(search.toLowerCase()) ||
        r.userAddress?.toLowerCase().includes(search.toLowerCase())
    );

    setFilteredReports(result);
  }, [reports, search, filterStatus]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus]);

  useEffect(() => {
    if (!selectedReport) return;

    const loadDispatches = async () => {
      try {
        const q = query(
          collection(db, "dispatches"),
          where("alertId", "==", selectedReport.id)
        );

        const snap = await getDocs(q);

        if (!snap.empty) {
          const allDispatches = snap.docs.map((docSnap) => ({
            id: docSnap.id,
            ...docSnap.data(),
          })) as DispatchInfo[];

          allDispatches.sort((a, b) => {
            const aPrimary = a.dispatchType === "Primary" || a.isBackup === false ? 0 : 1;
            const bPrimary = b.dispatchType === "Primary" || b.isBackup === false ? 0 : 1;

            if (aPrimary !== bPrimary) return aPrimary - bPrimary;

            const aTime = a.timestamp?.seconds ?? 0;
            const bTime = b.timestamp?.seconds ?? 0;
            return aTime - bTime;
          });

          setDispatches(allDispatches);
        } else {
          setDispatches([]);
        }
      } catch (error) {
        console.error("Error loading dispatches:", error);
        setDispatches([]);
      }
    };

    loadDispatches();
  }, [selectedReport]);

  const openReport = (report: ReportItem) => setSelectedReport(report);

  const closeModal = () => {
    setSelectedReport(null);
    setEditMode(false);
    setDispatches([]);
  };

  const handleEdit = () => {
    if (!selectedReport) return;
    setEditMode(true);
    setEditedStatus(selectedReport.status || "");
  };

  const handleSave = async () => {
    if (!selectedReport) return;
    const ref = doc(db, "alerts", selectedReport.id);
    await updateDoc(ref, { status: editedStatus });
    setEditMode(false);
  };

  const getTeamName = (dispatch: DispatchInfo) =>
    dispatch.responders?.[0]?.team ||
    dispatch.responders?.[0]?.teamId ||
    "N/A";

  const downloadSingleReportPDF = async (report: ReportItem) => {
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 72;
    const contentWidth = pageWidth - margin * 2;

    let y = margin;

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = reject;
      });

    const ensurePageSpace = (needed = 40) => {
      if (y > pageHeight - margin - needed) {
        pdf.addPage();
        y = margin;
      }
    };

    const addLabelValue = (
      label: string,
      value: string,
      x: number,
      currentY: number
    ) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(label, x, currentY);

      pdf.setFont("helvetica", "normal");
      const labelWidth = pdf.getTextWidth(label);
      const wrapped = pdf.splitTextToSize(
        value || "N/A",
        contentWidth - labelWidth - 10
      );
      pdf.text(wrapped, x + labelWidth + 6, currentY);

      return currentY + wrapped.length * 14;
    };

    const addSectionTitle = (title: string, currentY: number) => {
      ensurePageSpace(30);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(163, 0, 0);
      pdf.text(title, margin, currentY);

      pdf.setDrawColor(220, 220, 220);
      pdf.line(margin, currentY + 6, pageWidth - margin, currentY + 6);

      pdf.setTextColor(0, 0, 0);
      return currentY + 22;
    };

    try {
      const logo = await loadImage("/logo.png");
      const logoWidth = 150;
      const logoHeight = 90;
      pdf.addImage(logo, "PNG", margin, y - 20, logoWidth, logoHeight);
    } catch (error) {
      console.error("Logo failed to load:", error);
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);
    pdf.setTextColor(163, 0, 0);
    pdf.text("FIRE REPORT", pageWidth - margin, y + 22, {
      align: "right",
    });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(90, 90, 90);
    pdf.text("APULA System", pageWidth - margin, y + 40, {
      align: "right",
    });

    y += 70;

    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 24;

    const receivedAt = report.timestamp
      ? new Date(report.timestamp.seconds * 1000).toLocaleString()
      : "Unknown";

    y = addSectionTitle("Incident Information", y);
    y = addLabelValue("Report ID:", report.id || "N/A", margin, y);
    y = addLabelValue("Status:", report.status || "N/A", margin, y);
    y = addLabelValue("Alert Received At:", receivedAt, margin, y);

    if (dispatches.length > 0 && dispatches[0].timestamp) {
      const dispatchedAt = new Date(
        dispatches[0].timestamp!.seconds * 1000
      ).toLocaleString();

      y = addLabelValue("Primary Dispatch Time:", dispatchedAt, margin, y);
    }

    y += 14;

    y = addSectionTitle("Reporter Information", y);
    y = addLabelValue("Name:", report.userName || "N/A", margin, y);
    y = addLabelValue("Contact:", report.userContact || "N/A", margin, y);
    y = addLabelValue("Email:", report.userEmail || "N/A", margin, y);
    y = addLabelValue("Address:", report.userAddress || "N/A", margin, y);

    if (dispatches.length > 0) {
      const primaryDispatch = dispatches[0];
      const backupDispatches = dispatches.slice(1);

      y += 14;
      y = addSectionTitle("Primary Responders", y);

      y = addLabelValue("Team Name:", getTeamName(primaryDispatch), margin, y);

      if (primaryDispatch.responders && primaryDispatch.responders.length > 0) {
        primaryDispatch.responders.forEach((r, index) => {
          ensurePageSpace(70);

          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          pdf.text(`Responder ${index + 1}`, margin + 12, y);
          y += 16;

          y = addLabelValue("Name:", r.name || "N/A", margin + 24, y);
          y = addLabelValue("Contact:", r.contact || "N/A", margin + 24, y);
          y = addLabelValue("Email:", r.email || "N/A", margin + 24, y);
          y = addLabelValue("Vehicle:", r.vehicle || "N/A", margin + 24, y);
          y += 10;
        });
      }

      if (backupDispatches.length > 0) {
        y += 14;
        y = addSectionTitle("Backup Responders", y);

        backupDispatches.forEach((dispatch, teamIndex) => {
          ensurePageSpace(80);

          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(11);
          pdf.text(
            `Backup Team ${teamIndex + 1}: ${getTeamName(dispatch)}`,
            margin,
            y
          );
          y += 18;

          if (dispatch.timestamp) {
            const backupTime = new Date(
              dispatch.timestamp.seconds * 1000
            ).toLocaleString();

            y = addLabelValue("Dispatch Time:", backupTime, margin + 12, y);
          }

          if (dispatch.responders && dispatch.responders.length > 0) {
            dispatch.responders.forEach((r, responderIndex) => {
              ensurePageSpace(70);

              pdf.setFont("helvetica", "bold");
              pdf.setFontSize(11);
              pdf.text(`Responder ${responderIndex + 1}`, margin + 12, y);
              y += 16;

              y = addLabelValue("Name:", r.name || "N/A", margin + 24, y);
              y = addLabelValue("Contact:", r.contact || "N/A", margin + 24, y);
              y = addLabelValue("Email:", r.email || "N/A", margin + 24, y);
              y = addLabelValue("Vehicle:", r.vehicle || "N/A", margin + 24, y);
              y += 10;
            });
          }

          y += 6;
        });
      }
    }

    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(9);
    pdf.setTextColor(110, 110, 110);
    pdf.text(
      `Generated on ${new Date().toLocaleString()}`,
      margin,
      pageHeight - margin / 2
    );

    pdf.save(`fire_report_${report.id}.pdf`);
  };

  const totalPages = Math.ceil(filteredReports.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedReports = filteredReports.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  return (
    <div>
      <AdminHeader />

      <div style={{ position: "absolute", top: 20, right: 30, zIndex: 50 }}>
        <AlertBellButton />
      </div>

      <AlertDispatchModal />

      <div className={styles.container}>
        <div className={styles.contentSection}>
          <h2 className={styles.pageTitle}>Incident Reports</h2>
          <hr className={styles.separator} />

          <div className={styles.filtersRow}>
            <div className={styles.searchWrapper}>
              <input
                type="text"
                placeholder="Search reports..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <FiSearch />
            </div>

            <div className={styles.statusFilters}>
              {["All", "Pending", "Dispatched", "Resolved"].map((s) => (
                <button
                  key={s}
                  className={`${styles.filterBtn} ${
                    styles[`${s.toLowerCase()}Btn`]
                  } ${filterStatus === s ? styles.activeFilter : ""}`}
                  onClick={() => setFilterStatus(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.reportTable}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Status</th>
                  <th>Received At</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {paginatedReports.length > 0 ? (
                  paginatedReports.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Name">{r.userName || "Unknown"}</td>
                      <td data-label="Address">{r.userAddress || "Unknown"}</td>
                      <td data-label="Status">
                        <span
                          className={`${styles.statusBadge} ${
                            styles[
                              r.status?.toLowerCase() as keyof typeof styles
                            ] || ""
                          }`}
                        >
                          {r.status || "Unknown"}
                        </span>
                      </td>
                      <td data-label="Received At">
                        {r.timestamp
                          ? new Date(r.timestamp.seconds * 1000).toLocaleString()
                          : "Unknown"}
                      </td>
                      <td data-label="Actions">
                        <button
                          className={styles.viewBtn}
                          onClick={() => openReport(r)}
                        >
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className={styles.noResults}>
                      No reports found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {filteredReports.length > 0 && (
            <div className={styles.pagination}>
              <button
                className={styles.pageBtn}
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Prev
              </button>

              <span className={styles.pageInfo}>
                Page {currentPage} of {totalPages || 1}
              </span>

              <button
                className={styles.pageBtn}
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages || totalPages === 0}
              >
                Next
              </button>
            </div>
          )}
        </div>

        {selectedReport && (
          <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
              <h3 className={styles.modalTitle}>Report Details</h3>

              <div className={styles.modalBody}>
                <div className={`${styles.modalDetails} ${styles.modalSection}`}>
                  <p className={styles.iconRow}>
                    <FaUser />
                    {selectedReport.userName || "N/A"}
                  </p>

                  <p className={styles.iconRow}>
                    <FaPhone />
                    {selectedReport.userContact || "N/A"}
                  </p>

                  <p className={styles.iconRow}>
                    <FaEnvelope />
                    {selectedReport.userEmail || "N/A"}
                  </p>

                  <p className={styles.iconRow}>
                    <FaMapMarkerAlt />
                    {selectedReport.userAddress || "N/A"}
                  </p>

                  <p>
                    <strong>Alert Received At:</strong>{" "}
                    {selectedReport.timestamp
                      ? new Date(
                          selectedReport.timestamp.seconds * 1000
                        ).toLocaleString()
                      : "Unknown"}
                  </p>

                  {dispatches.length > 0 && dispatches[0].timestamp && (
                    <p>
                      <strong>Primary Dispatch Time:</strong>{" "}
                      {new Date(
                        dispatches[0].timestamp.seconds * 1000
                      ).toLocaleString()}
                    </p>
                  )}

                  {selectedReport.monitoringStatus && (
                    <p>
                      <strong>Monitoring Status:</strong> {selectedReport.monitoringStatus}
                    </p>
                  )}

                  {selectedReport.monitoringMessage && (
                    <p>
                      <strong>Monitoring Note:</strong> {selectedReport.monitoringMessage}
                    </p>
                  )}

                  {selectedReport.monitoredBy && (
                    <p>
                      <strong>Monitored By:</strong> {selectedReport.monitoredBy}
                    </p>
                  )}

                  {selectedReport.monitoringUpdatedAt?.seconds && (
                    <p>
                      <strong>Monitoring Updated At:</strong>{" "}
                      {new Date(selectedReport.monitoringUpdatedAt.seconds * 1000).toLocaleString()}
                    </p>
                  )}
                </div>

                {dispatches.length > 0 && (
                  <div className={styles.responderSection}>
                    <div className={styles.responderTitle}>
                      Primary Responders
                    </div>

                    <div className={styles.responderItem}>
                      <strong>Team:</strong> {getTeamName(dispatches[0])}
                    </div>

                    {dispatches[0].responders?.map((r, i) => (
                      <div key={i} className={styles.responderItem}>
                        {r.name || "N/A"} • {r.contact || "N/A"} •{" "}
                        {r.email || "N/A"}
                      </div>
                    ))}

                    {dispatches.slice(1).length > 0 && (
                      <>
                        <div
                          className={styles.responderTitle}
                          style={{ marginTop: "14px" }}
                        >
                          Backup Responders
                        </div>

                        {dispatches.slice(1).map((dispatch, teamIndex) => (
                          <div
                            key={dispatch.id || teamIndex}
                            style={{ marginBottom: "12px" }}
                          >
                            <div className={styles.responderItem}>
                              <strong>Team:</strong> {getTeamName(dispatch)}
                            </div>

                            {dispatch.responders?.map((r, i) => (
                              <div key={i} className={styles.responderItem}>
                                {r.name || "N/A"} • {r.contact || "N/A"} •{" "}
                                {r.email || "N/A"}
                              </div>
                            ))}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className={styles.modalActions}>
                <button
                  className={styles.saveBtn}
                  onClick={() => downloadSingleReportPDF(selectedReport)}
                >
                  <span>Download PDF</span>
                </button>

                <button className={styles.closeBtn} onClick={closeModal}>
                  <span>Close</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportPage;