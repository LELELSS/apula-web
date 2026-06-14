/* eslint-disable @typescript-eslint/ban-ts-comment */
"use client";

/**
 * DownloadMenu.tsx
 *
 * Supports PDF (with logo header), Excel (.xlsx), and CSV.
 * New: optional `description` paragraph + `chartRef` for graph capture.
 * When chartRef is provided, user can choose "Table Data" or "Graph Data"
 * before exporting (PDF / Excel only).
 */

import React, { useRef, useState, useEffect } from "react";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
type CellValue = string | number;
type DataType = "table" | "graph";

interface DownloadMenuProps {
  title: string;
  subtitle?: string;
  description?: string; // NEW — narrative summary
  columns: string[];
  rows: CellValue[][];
  filename?: string;
  chartRef?: React.RefObject<HTMLDivElement>; // NEW — for graph snapshot
}

/* ─────────────────────────────────────────────
   Logo Helper
───────────────────────────────────────────── */
function loadLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = "/logo.png";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
}

/* ─────────────────────────────────────────────
   Chart snapshot helper (html2canvas)
   Loads via <script> tag so window.html2canvas
   is available as a global (UMD build).
───────────────────────────────────────────── */
function loadHtml2Canvas(): Promise<
  ((el: HTMLElement, opts?: object) => Promise<HTMLCanvasElement>) | null
> {
  return new Promise((resolve) => {
    // Already loaded
    if ((window as any).html2canvas) {
      resolve((window as any).html2canvas);
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    script.onload = () => resolve((window as any).html2canvas ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

async function captureChart(el: HTMLElement): Promise<string | null> {
  try {
    const h2c = await loadHtml2Canvas();
    if (!h2c) return null;
    const canvas = await h2c(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────
   PDF Export
───────────────────────────────────────────── */
async function exportPDF(
  title: string,
  subtitle: string,
  description: string,
  columns: string[],
  rows: CellValue[][],
  filename: string,
  dataType: DataType,
  chartRef?: React.RefObject<HTMLDivElement>,
) {
  // REPLACE WITH:
const jsPDF = await new Promise<any>((resolve) => {
  if ((window as any).jspdf?.jsPDF) {
    resolve((window as any).jspdf.jsPDF);
    return;
  }
  const script = document.createElement("script");
  script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  script.onload = () => resolve((window as any).jspdf?.jsPDF ?? null);
  script.onerror = () => resolve(null);
  document.head.appendChild(script);
});

if (!jsPDF) {
  exportPDFFallback(title, subtitle, description, columns, rows, filename, dataType, chartRef);
  return;
}

  // Capture chart snapshot if needed
  let chartDataUrl: string | null = null;
  if (dataType === "graph" && chartRef?.current) {
    chartDataUrl = await captureChart(chartRef.current);
  }

  const logoImg = await loadLogo();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;

  /* ── Header banner ── */
  doc.setFillColor(163, 0, 0);
  doc.rect(0, 0, pageW, 32, "F");

  if (logoImg) {
    const aspect =
      logoImg.naturalWidth && logoImg.naturalHeight
        ? logoImg.naturalWidth / logoImg.naturalHeight
        : 3.25;
    const logoH = 20;
    const logoW = Math.min(55, logoH * aspect);
    doc.addImage(logoImg, "PNG", margin, (32 - logoH) / 2, logoW, logoH);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("APULA", margin, 19);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(title.toUpperCase(), pageW - margin, 15, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(255, 210, 210);
  doc.text("APULA Fire Incident System", pageW - margin, 23, {
    align: "right",
  });

  doc.setFillColor(255, 100, 0);
  doc.rect(0, 32, pageW, 2.5, "F");

  /* ── Report Info ── */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(163, 0, 0);
  doc.text("Report Information", margin, 46);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(50, 50, 50);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 53);

  let infoY = 53; // ← fixed: continue from where "Generated:" was placed
  if (subtitle) {
  infoY += 7;

  const subtitleLines = doc.splitTextToSize(
    `Filter: ${subtitle}`,
    pageW - margin * 2
  );

  doc.text(subtitleLines, margin, infoY);

  // Move Y based on actual wrapped height
  infoY += subtitleLines.length * 4.5;
}

infoY += 7;

  /* ── Description paragraph ── */
  if (description) {
    infoY += 9;
    doc.setFont("helvetica", "bolditalic");
    doc.setFontSize(9);
    doc.setTextColor(100, 0, 0);
    doc.text("Summary", margin, infoY);
    infoY += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    const lines = doc.splitTextToSize(
      description,
      pageW - margin * 2,
    ) as string[];
    doc.text(lines, margin, infoY);
    infoY += lines.length * 4.5;
  }

  infoY += 4;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.line(margin, infoY, pageW - margin, infoY);

  let y = infoY + 8;



  /* ── Graph mode ── */
if (dataType === "graph") {
  if (chartDataUrl) {
    const imgW = pageW - margin * 2;
    const imgH = imgW * 0.55;

    doc.addImage(chartDataUrl, "PNG", margin, y, imgW, imgH);

    y += imgH + 10;
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(160, 160, 160);
    doc.text(
      "Graph capture unavailable. Showing table data as fallback.",
      margin,
      y
    );
    y += 10;
  }

  // Start table on a new page
  doc.addPage();
  y = 20;
}
  /* ── Table mode ── */

renderPDFTable(doc, columns, rows, margin, y, pageW, pageH);
finalizePDFFooter(doc, pageH, margin);
doc.save(`${filename}.pdf`);
}

 // Add this helper right above renderPDFTable:
function truncateText(doc: any, text: string, maxWidth: number): string {
  const ellipsis = "...";
  if (doc.getTextWidth(text) <= maxWidth) return text;
  while (text.length > 0 && doc.getTextWidth(text + ellipsis) > maxWidth) {
    text = text.slice(0, -1);
  }
  return text + ellipsis;
}

function renderPDFTable(
  doc: any,
  columns: string[],
  rows: CellValue[][],
  margin: number,
  startY: number,
  pageW: number,
  pageH: number,
) {
  let y = startY;

  const cellPadding = 3;
  const colWidth = (pageW - margin * 2) / columns.length;
  const maxTextWidth = colWidth - 6;

  const drawHeader = () => {
    let headerHeight = 8;

    const wrappedHeaders = columns.map((col) => {
      const lines = doc.splitTextToSize(String(col), maxTextWidth);
      headerHeight = Math.max(headerHeight, lines.length * 4 + 4);
      return lines;
    });

    doc.setFillColor(163, 0, 0);
    doc.rect(
      margin,
      y,
      pageW - margin * 2,
      headerHeight,
      "F"
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);

    wrappedHeaders.forEach((lines, i) => {
      doc.text(
        lines,
        margin + i * colWidth + cellPadding,
        y + 4
      );

      doc.setDrawColor(255, 255, 255);
      doc.rect(
        margin + i * colWidth,
        y,
        colWidth,
        headerHeight
      );
    });

    y += headerHeight;
  };

  drawHeader();

  rows.forEach((row, ri) => {
    let rowHeight = 7;

    const wrappedCells = row.map((cell) => {
      const lines = doc.splitTextToSize(
        String(cell ?? ""),
        maxTextWidth
      );

      rowHeight = Math.max(
        rowHeight,
        lines.length * 4 + 4
      );

      return lines;
    });

    const footerHeight = 12;
    const bottomMargin = 30;

    if (y + rowHeight > pageH - footerHeight - bottomMargin) {
      doc.addPage();
      y = 20;
      drawHeader();
    }

    if (ri % 2 === 0) {
      doc.setFillColor(255, 240, 240);
      doc.rect(
        margin,
        y,
        pageW - margin * 2,
        rowHeight,
        "F"
      );
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(40, 40, 40);

    wrappedCells.forEach((lines, i) => {
      doc.text(
        lines,
        margin + i * colWidth + cellPadding,
        y + 4
      );
    });

    row.forEach((_, i) => {
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.2);

      doc.rect(
        margin + i * colWidth,
        y,
        colWidth,
        rowHeight
      );
    });

    y += rowHeight;
  });
}
function finalizePDFFooter(doc: any, pageH: number, margin: number) {
  const pageW = doc.internal.pageSize.getWidth();
  const totalPages = (doc.internal as any).getNumberOfPages?.() ?? 1;
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(245, 245, 245);
    doc.rect(0, pageH - 12, pageW, 12, "F");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`Generated on ${new Date().toLocaleString()}`, margin, pageH - 4);
    doc.text(`Page ${p} of ${totalPages}`, pageW - margin, pageH - 4, {
      align: "right",
    });
  }
}

/** HTML-print fallback */
async function exportPDFFallback(
  title: string,
  subtitle: string,
  description: string,
  columns: string[],
  rows: CellValue[][],
  _filename: string,
  dataType: DataType,
  chartRef?: React.RefObject<HTMLDivElement>,
) {
  let chartImgTag = "";
  if (dataType === "graph" && chartRef?.current) {
    const url = await captureChart(chartRef.current);
    if (url)
      chartImgTag = `<img src="${url}" style="width:100%;border-radius:8px;margin:15px 0" />`;
  }

  const tableRows = rows
    .map(
      (r) =>
        `<tr>${r.map((c) => `<td style="padding:6px 10px;border:1px solid #e0e0e0;font-size:13px">${c ?? ""}</td>`).join("")}</tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><head><title>${title}</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;color:#222}
  .banner{background:#a30000;padding:10px 32px;display:flex;justify-content:space-between;align-items:center;min-height:56px}
  .banner img{height:100px;max-width:160px;object-fit:contain}
  .banner-title h1{font-size:18px;color:#fff;margin:0}
  .banner-title p{font-size:11px;color:#ffd2d2;margin:3px 0 0;text-align:right}
  .accent{height:4px;background:#ff6400}
  .body{padding:24px 32px}
  .section-title{font-size:13px;font-weight:700;color:#a30000;margin:18px 0 6px;border-bottom:1px solid #eee;padding-bottom:4px}
  .description{background:#fff8f8;border-left:3px solid #a30000;padding:10px 14px;font-size:12px;color:#444;margin:10px 0;border-radius:4px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#a30000;color:#fff;padding:7px 10px;font-size:12px;text-align:left}
  tr:nth-child(even) td{background:#fff0f0}
  .footer{margin-top:40px;font-size:11px;color:#aaa;font-style:italic}
</style></head>
<body>
<div class="banner">
  <img src="/logo.png" alt="APULA Logo" />
  <div class="banner-title"><h1>${title}</h1><p>APULA Fire Incident System</p></div>
</div>
<div class="accent"></div>
<div class="body">
  <div class="section-title">Report Information</div>
  <p style="font-size:13px;margin:4px 0"><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
  ${subtitle ? `<p style="font-size:13px;margin:4px 0"><strong>Filter:</strong> ${subtitle}</p>` : ""}
  <p style="font-size:13px;margin:4px 0"><strong>Export Type:</strong> ${dataType === "graph" ? "Graph / Chart" : "Table Data"}</p>
  <p style="font-size:13px;margin:4px 0"><strong>Total Records:</strong> ${rows.length}</p>
  ${description ? `<div class="description"><strong>Summary:</strong> ${description}</div>` : ""}
  ${
    dataType === "graph" && chartImgTag
      ? `<div class="section-title">Chart</div>${chartImgTag}`
      : `
  <div class="section-title">Data</div>
  <table>
    <thead><tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
    <tbody>${tableRows}</tbody>
  </table>`
  }
  <div class="footer">Generated on ${new Date().toLocaleString()}</div>
</div></body></html>`;

 // REPLACE WITH:
const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = `${_filename}.html`;
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────
   Excel Export
───────────────────────────────────────────── */
async function exportExcel(
  title: string,
  subtitle: string,
  description: string,
  columns: string[],
  rows: CellValue[][],
  filename: string,
  dataType: DataType,
) {
  const XLSX = await import("xlsx").catch(() => null);
  if (!XLSX) {
    alert("Excel export unavailable. Please try CSV instead.");
    return;
  }

  const hasSubtitle = !!subtitle;
  const hasDesc = !!description;

  // Build meta rows dynamically
  const metaRows: (string | number)[][] = [
    [title.toUpperCase()],
    ["APULA Fire Incident System"],
    [`Generated: ${new Date().toLocaleString()}`],
    ...(hasSubtitle ? [[`Filter: ${subtitle}`]] : []),
    [`Export Type: ${dataType === "graph" ? "Graph / Chart" : "Table Data"}`],
    [`Total Records: ${rows.length}`],
    ...(hasDesc ? [[`Summary: ${description}`]] : []),
    [],
    columns,
    ...rows.map((r) => r.map((v) => v ?? "")),
  ];

  // Calculate row indices
  let idx = 2; // 0=title, 1=system
  if (hasSubtitle) idx++;
  idx++; // export type
  idx++; // total records
  if (hasDesc) idx++;
  idx++; // spacer
  const headerRowIndex = idx;
  const dataStartIndex = headerRowIndex + 1;

  const ws = XLSX.utils.aoa_to_sheet(metaRows);
  ws["!cols"] = columns.map(() => ({ wch: 26 }));

  const getCell = (r: number, c: number) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (!ws[addr]) ws[addr] = { v: "", t: "s" };
    return ws[addr];
  };

  const numCols = Math.max(columns.length, 3);
  const metaStyle = { font: { color: { rgb: "888888" }, italic: true, sz: 9 } };

  // Title row
  for (let c = 0; c < numCols; c++) {
    getCell(0, c).s = {
      fill: { fgColor: { rgb: "A30000" } },
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 14 },
      alignment: {
        horizontal: c === 0 ? "left" : "center",
        vertical: "center",
      },
    };
  }
  getCell(1, 0).s = {
    font: { color: { rgb: "A30000" }, sz: 10, italic: true },
  };

  // Meta rows styling
  for (let r = 2; r < headerRowIndex; r++) {
    const val = String(metaRows[r]?.[0] ?? "");
    if (val.startsWith("Summary:")) {
      // Description row — highlighted
      getCell(r, 0).s = {
        fill: { fgColor: { rgb: "FFF8F8" } },
        font: { color: { rgb: "660000" }, italic: true, sz: 9 },
        border: { left: { style: "medium", color: { rgb: "A30000" } } },
      };
    } else {
      getCell(r, 0).s = metaStyle;
    }
  }

  // Column header row
  for (let c = 0; c < columns.length; c++) {
    getCell(headerRowIndex, c).s = {
      fill: { fgColor: { rgb: "A30000" } },
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10 },
      alignment: { horizontal: "left", vertical: "center" },
      border: { bottom: { style: "thin", color: { rgb: "FF6400" } } },
    };
  }

  // Data rows
  rows.forEach((row, ri) => {
    const isEven = ri % 2 === 0;
    for (let c = 0; c < columns.length; c++) {
      getCell(dataStartIndex + ri, c).s = {
        fill: { fgColor: { rgb: isEven ? "FFF0F0" : "FFFFFF" } },
        font: { sz: 10, color: { rgb: "222222" } },
        border: {
          bottom: { style: "thin", color: { rgb: "E0E0E0" } },
          right: { style: "thin", color: { rgb: "E0E0E0" } },
        },
        alignment: { vertical: "center" },
      };
    }
  });

  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }];

  const rowHeights: { hpt: number }[] = [
    { hpt: 32 },
    { hpt: 16 },
    { hpt: 14 },
    ...(hasSubtitle ? [{ hpt: 14 }] : []),
    { hpt: 14 },
    { hpt: 14 },
    ...(hasDesc ? [{ hpt: 20 }] : []),
    { hpt: 6 },
    { hpt: 22 },
    ...rows.map(() => ({ hpt: 18 })),
  ];
  ws["!rows"] = rowHeights;

  // Graph-mode note in Excel (can't embed actual image in free SheetJS)
  if (dataType === "graph") {
    const noteRow = metaRows.length;
    getCell(noteRow, 0).v =
      "ℹ️ Graph image is available in PDF export. Excel shows the underlying data only.";
    getCell(noteRow, 0).s = {
      font: { italic: true, color: { rgb: "9CA3AF" }, sz: 9 },
    };
  }

  XLSX.utils.book_append_sheet(XLSX.utils.book_new(), ws, "Report");
  // Re-create wb properly
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/* ─────────────────────────────────────────────
   CSV Export
───────────────────────────────────────────── */
function exportCSV(columns: string[], rows: CellValue[][], filename: string) {
  const escape = (v: CellValue) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csvContent = [columns, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
const DownloadMenu: React.FC<DownloadMenuProps> = ({
  title,
  subtitle = "",
  description = "",
  columns,
  rows,
  filename = "apula-report",
  chartRef,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [dataType, setDataType] = useState<DataType>("table");
  const ref = useRef<HTMLDivElement>(null);

  const hasChart = !!chartRef;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handle = async (type: "pdf" | "excel" | "csv") => {
    setLoading(type);
    setOpen(false);
    try {
      if (type === "pdf") {
        await exportPDF(
          title,
          subtitle,
          description,
          columns,
          rows,
          filename,
          dataType,
          chartRef,
        );
      } else if (type === "excel") {
        await exportExcel(
          title,
          subtitle,
          description,
          columns,
          rows,
          filename,
          dataType,
        );
      } else {
        exportCSV(columns, rows, filename);
      }
    } catch (err) {
      console.error("Export error:", err);
      exportCSV(columns, rows, filename);
    }
    setLoading(null);
  };

  const btnBase: React.CSSProperties = {
    border: "1px solid #a30000",
    background: "#a30000",
    color: "#ffffff",
    padding: "10px 16px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 6,
    transition: "background 0.2s",
    whiteSpace: "nowrap",
  };

  const menuItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "9px 14px",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    textAlign: "left",
    borderRadius: 8,
    transition: "background 0.15s",
  };

  const segmentBase: React.CSSProperties = {
    flex: 1,
    padding: "5px 0",
    border: "1px solid #e5e7eb",
    background: "transparent",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
    color: "#6b7280",
    transition: "all 0.15s",
    borderRadius: 6,
  };

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        display: "inline-block",
        margin: "12px 0",
      }}
    >
      <button
        style={btnBase}
        onClick={() => setOpen((v) => !v)}
        disabled={!!loading}
      >
        {loading ? (
          <>⏳ Exporting {loading.toUpperCase()}…</>
        ) : (
          <>
            ⬇ Download Data
            <span style={{ fontSize: 10, opacity: 0.8 }}>
              {open ? "▲" : "▼"}
            </span>
          </>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,0.14)",
            minWidth: 230,
            zIndex: 500,
            overflow: "hidden",
            padding: "6px 0",
          }}
        >
          {/* ── Data type toggle (PDF/Excel only; hidden for CSV) ── */}
          {hasChart && (
            <div
              style={{
                padding: "10px 14px 8px",
                borderBottom: "1px solid #f0f0f0",
              }}
            >
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#9ca3af",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  margin: "0 0 6px",
                }}
              >
                Include in Export
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  style={{
                    ...segmentBase,
                    background:
                      dataType === "table" ? "#a30000" : "transparent",
                    color: dataType === "table" ? "#fff" : "#6b7280",
                    border: `1px solid ${dataType === "table" ? "#a30000" : "#e5e7eb"}`,
                  }}
                  onClick={() => setDataType("table")}
                >
                  📋 Table
                </button>
                <button
                  style={{
                    ...segmentBase,
                    background:
                      dataType === "graph" ? "#a30000" : "transparent",
                    color: dataType === "graph" ? "#fff" : "#6b7280",
                    border: `1px solid ${dataType === "graph" ? "#a30000" : "#e5e7eb"}`,
                  }}
                  onClick={() => setDataType("graph")}
                >
                  📈 Graph
                </button>
              </div>
              {dataType === "graph" && (
                <p
                  style={{
                    fontSize: 10,
                    color: "#9ca3af",
                    margin: "5px 0 0",
                    fontStyle: "italic",
                  }}
                >
                  Graph image only available in PDF. Excel will include table
                  data.
                </p>
              )}
            </div>
          )}

          <div
            style={{
              padding: "6px 14px 4px",
              borderBottom: "1px solid #f0f0f0",
              fontSize: 11,
              fontWeight: 700,
              color: "#9ca3af",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            Export Format
          </div>

          {/* PDF */}
          <button
            style={menuItemStyle}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "#fff0f0")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "transparent")
            }
            onClick={() => handle("pdf")}
          >
            <span style={{ fontSize: 18 }}>📄</span>
            <div>
              <div>PDF Report</div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>
                Branded layout with logo
              </div>
            </div>
          </button>

          {/* Excel */}
          <button
            style={menuItemStyle}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "#f0fff4")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "transparent")
            }
            onClick={() => handle("excel")}
          >
            <span style={{ fontSize: 18 }}>📊</span>
            <div>
              <div>Excel Spreadsheet</div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>
                Styled header + colored rows
              </div>
            </div>
          </button>

          {/* CSV */}
          <button
            style={{ ...menuItemStyle, borderTop: "1px solid #f0f0f0" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "#f0f9ff")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "transparent")
            }
            onClick={() => handle("csv")}
          >
            <span style={{ fontSize: 18 }}>🗒️</span>
            <div>
              <div>CSV File</div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400 }}>
                Raw comma-separated data
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default DownloadMenu;
