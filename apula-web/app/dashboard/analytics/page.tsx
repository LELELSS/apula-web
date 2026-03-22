"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Lottie from "lottie-react";
import fireAnimation from "@/public/lottie/fire.json";
import AdminHeader from "@/components/shared/adminHeader";
import styles from "./analyticsStyles.module.css";

import AlertBellButton from "@/components/AlertDispatch/AlertBellButton";
import AlertDispatchModal from "@/components/AlertDispatch/AlertDispatchModal";

import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

type Period = "week" | "month" | "year";
type ChartType = "line" | "bar";

type ChartPoint = {
  label: string;
  alerts: number;
  fullDate?: string;
};

const monthNamesShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const formatDateInputValue = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatReadableDate = (date: Date) => {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

const AnalyticsPage = () => {
  const exportChartRef = useRef<HTMLDivElement | null>(null);

  const [selectedPeriod, setSelectedPeriod] = useState<Period>("month");
  const [selectedChartType, setSelectedChartType] = useState<ChartType>("line");
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [alertsDates, setAlertsDates] = useState<Date[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const [reportChartType, setReportChartType] = useState<ChartType>("line");
  const [reportPeriod, setReportPeriod] = useState<Period>("month");
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "alerts"), (snapshot) => {
      const parsedDates: Date[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (!data.timestamp) return;

        let d: Date | null = null;

        if (data.timestamp?.seconds) {
          d = new Date(data.timestamp.seconds * 1000);
        } else if (typeof data.timestamp === "string") {
          d = new Date(data.timestamp);
        } else if (data.timestamp instanceof Date) {
          d = data.timestamp;
        }

        if (!d || isNaN(d.getTime())) return;
        parsedDates.push(d);
      });

      setAlertsDates(parsedDates);

      const years = Array.from(
        new Set(parsedDates.map((d) => d.getFullYear()))
      ).sort((a, b) => a - b);

      const currentYear = new Date().getFullYear();
      const finalYears = years.length > 0 ? years : [currentYear];

      setAvailableYears(finalYears);

      if (!finalYears.includes(selectedYear)) {
        setSelectedYear(finalYears[finalYears.length - 1]);
      }

      if (!finalYears.includes(reportYear)) {
        setReportYear(finalYears[finalYears.length - 1]);
      }

      setLoading(false);
    });

    return () => unsub();
  }, [selectedYear, reportYear]);

  const getFilteredDatesByRange = (
    sourceDates: Date[],
    startDate: string,
    endDate: string
  ) => {
    if (!startDate && !endDate) return sourceDates;

    return sourceDates.filter((date) => {
      const current = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      ).getTime();

      let valid = true;

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        valid = valid && current >= start.getTime();
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        valid = valid && current <= end.getTime();
      }

      return valid;
    });
  };

  const buildDataForOptions = (
    sourceDates: Date[],
    period: Period,
    year: number,
    startDate = "",
    endDate = ""
  ): ChartPoint[] => {
    const filteredDates = getFilteredDatesByRange(sourceDates, startDate, endDate);

    if (period === "week") {
      const currentYear = new Date().getFullYear();

      let referenceDate: Date;

      if (year === currentYear) {
        referenceDate = new Date();
      } else {
        const datesInSelectedYear = filteredDates.filter(
          (d) => d.getFullYear() === year
        );

        referenceDate =
          datesInSelectedYear.length > 0
            ? new Date(Math.max(...datesInSelectedYear.map((d) => d.getTime())))
            : new Date(year, 11, 31);
      }

      const weekStart = new Date(referenceDate);
      const day = weekStart.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      weekStart.setDate(weekStart.getDate() + diffToMonday);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const buckets: ChartPoint[] = Array.from({ length: 7 }, (_, index) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + index);

        return {
          label: d.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          }),
          fullDate: d.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          }),
          alerts: 0,
        };
      });

      filteredDates.forEach((d) => {
        if (d < weekStart || d > weekEnd) return;

        const alertDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const startDay = new Date(
          weekStart.getFullYear(),
          weekStart.getMonth(),
          weekStart.getDate()
        );

        const diffDays = Math.floor(
          (alertDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays >= 0 && diffDays < 7) {
          buckets[diffDays].alerts += 1;
        }
      });

      return buckets;
    }

    if (period === "month") {
      const buckets: ChartPoint[] = monthNamesShort.map((month) => ({
        label: month,
        fullDate: `${month} ${year}`,
        alerts: 0,
      }));

      filteredDates.forEach((d) => {
        if (d.getFullYear() === year) {
          buckets[d.getMonth()].alerts += 1;
        }
      });

      return buckets;
    }

    const yearsToUse =
      availableYears.length > 0 ? availableYears : [new Date().getFullYear()];

    const yearlyBuckets = yearsToUse.map((y) => ({
      label: String(y),
      fullDate: String(y),
      alerts: 0,
    }));

    filteredDates.forEach((d) => {
      const index = yearsToUse.indexOf(d.getFullYear());
      if (index !== -1) {
        yearlyBuckets[index].alerts += 1;
      }
    });

    return yearlyBuckets;
  };

  useEffect(() => {
    setChartData(buildDataForOptions(alertsDates, selectedPeriod, selectedYear));
  }, [alertsDates, selectedPeriod, selectedYear, availableYears]);

  const exportChartData = useMemo(() => {
    return buildDataForOptions(
      alertsDates,
      reportPeriod,
      reportYear,
      reportStartDate,
      reportEndDate
    );
  }, [
    alertsDates,
    reportPeriod,
    reportYear,
    reportStartDate,
    reportEndDate,
    availableYears,
  ]);

  const tooltipLabelFormatter = (
    label: string | number,
    data: ChartPoint[]
  ) => {
    const point = data.find((entry) => entry.label === String(label));
    return point?.fullDate || String(label);
  };

  const generateAutomatedNarrative = (data: ChartPoint[]) => {
    const total = data.reduce((sum, item) => sum + item.alerts, 0);
    const nonZero = data.filter((item) => item.alerts > 0);
    const highest = data.reduce(
      (max, item) => (item.alerts > max.alerts ? item : max),
      data[0] || { label: "N/A", alerts: 0 }
    );
    const lowest = data.reduce(
      (min, item) => (item.alerts < min.alerts ? item : min),
      data[0] || { label: "N/A", alerts: 0 }
    );
    const average = data.length ? (total / data.length).toFixed(2) : "0.00";

    let periodText = "selected range";
    if (reportPeriod === "week") periodText = "weekly";
    if (reportPeriod === "month") periodText = "monthly";
    if (reportPeriod === "year") periodText = "yearly";

    let dateRangeText = "No custom date range applied.";
    if (reportStartDate || reportEndDate) {
      dateRangeText = `Custom date filter applied from ${
        reportStartDate ? reportStartDate : "the earliest available date"
      } to ${reportEndDate ? reportEndDate : "the latest available date"}.`;
    }

    return `
AUTOMATED FIRE INCIDENT REPORT

This report presents the ${periodText} fire incident data using a ${
      reportChartType === "line" ? "line" : "bar"
    } graph format.

A total of ${total} fire incident${total === 1 ? "" : "s"} were recorded in the selected dataset.
The highest recorded count was ${highest.alerts} in ${highest.label}.
The lowest recorded count was ${lowest.alerts} in ${lowest.label}.
The average number of incidents across all displayed data points is ${average}.

There ${
      nonZero.length > 0
        ? `were active incident counts in ${nonZero.length} out of ${data.length} data point${data.length === 1 ? "" : "s"}.`
        : "were no recorded incidents in the selected dataset."
    }

${dateRangeText}

Based on the available data, this report can help identify which periods experience higher incident activity and may support planning, responder readiness, and operational decision-making.
    `.trim();
  };

  const renderGraph = (
    data: ChartPoint[],
    chartType: ChartType,
    forExport = false
  ) => {
    const height = forExport ? 420 : 340;

    if (chartType === "line") {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={data}
            margin={{ top: 16, right: 20, left: 0, bottom: 12 }}
          >
            <CartesianGrid stroke="#eeeeee" strokeDasharray="3 3" />
            <XAxis dataKey="label" padding={{ left: 10, right: 10 }} />
            <YAxis allowDecimals={false} />
            <Tooltip
              labelFormatter={(label) => tooltipLabelFormatter(label, data)}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="alerts"
              stroke="#a30000"
              strokeWidth={3}
              dot={{ r: 4 }}
              name="Fire Incidents"
            />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          margin={{ top: 16, right: 20, left: 0, bottom: 12 }}
        >
          <CartesianGrid stroke="#eeeeee" strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis allowDecimals={false} />
          <Tooltip
            labelFormatter={(label) => tooltipLabelFormatter(label, data)}
          />
          <Legend />
          <Bar
            dataKey="alerts"
            fill="#a30000"
            radius={[8, 8, 0, 0]}
            name="Fire Incidents"
          />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  const downloadReport = async () => {
    const reportData = exportChartData;
    const narrative = generateAutomatedNarrative(reportData);

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const marginTop = 50;
    const marginRight = 50;
    const marginBottom = 50;
    const marginLeft = 50;

    const contentWidth = pageWidth - marginLeft - marginRight;
    const contentBottomLimit = pageHeight - marginBottom;

    let y = marginTop;

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = reject;
      });

    const ensurePageSpace = (needed = 40) => {
      if (y + needed > contentBottomLimit) {
        pdf.addPage();
        y = marginTop;
      }
    };

    const addSectionTitle = (title: string, currentY: number) => {
      ensurePageSpace(28);

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(163, 0, 0);
      pdf.text(title, marginLeft, currentY);

      pdf.setDrawColor(220, 220, 220);
      pdf.line(marginLeft, currentY + 6, pageWidth - marginRight, currentY + 6);

      pdf.setTextColor(0, 0, 0);
      return currentY + 22;
    };

    const addLabelValue = (
      label: string,
      value: string,
      x: number,
      currentY: number
    ) => {
      ensurePageSpace(24);

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

    const addParagraph = (text: string, currentY: number) => {
      ensurePageSpace(70);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(11);
      pdf.setTextColor(50, 50, 50);

      const wrapped = pdf.splitTextToSize(text, contentWidth);
      pdf.text(wrapped, marginLeft, currentY);

      return currentY + wrapped.length * 16;
    };

    const total = reportData.reduce((sum, item) => sum + item.alerts, 0);
    const highest =
      reportData.length > 0
        ? reportData.reduce((max, item) =>
            item.alerts > max.alerts ? item : max
          )
        : { label: "N/A", alerts: 0 };

    const lowest =
      reportData.length > 0
        ? reportData.reduce((min, item) =>
            item.alerts < min.alerts ? item : min
          )
        : { label: "N/A", alerts: 0 };

    const average = reportData.length
      ? (total / reportData.length).toFixed(2)
      : "0.00";

    let rangeText = "No custom date range applied.";
    if (reportStartDate || reportEndDate) {
      rangeText = `Custom date range: ${
        reportStartDate || "Earliest available date"
      } to ${reportEndDate || "Latest available date"}`;
    }

    try {
      const logo = await loadImage("/logo.png");
      pdf.addImage(logo, "PNG", marginLeft, y - 10, 90, 54);
    } catch (error) {
      console.error("Logo failed to load:", error);
    }

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);
    pdf.setTextColor(163, 0, 0);
    pdf.text("ANALYTICS REPORT", pageWidth - marginRight, y + 10, {
      align: "right",
    });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(90, 90, 90);
    pdf.text("APULA System", pageWidth - marginRight, y + 28, {
      align: "right",
    });

    pdf.text(new Date().toLocaleString(), pageWidth - marginRight, y + 42, {
      align: "right",
    });

    y += 65;

    pdf.setDrawColor(200, 200, 200);
    pdf.line(marginLeft, y, pageWidth - marginRight, y);
    y += 24;

    y = addSectionTitle("Analytics Graph", y);

    if (exportChartRef.current) {
      await new Promise((resolve) => setTimeout(resolve, 300));

      const canvas = await html2canvas(exportChartRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = contentWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      ensurePageSpace(imgHeight + 20);
      pdf.addImage(imgData, "PNG", marginLeft, y, imgWidth, imgHeight);
      y += imgHeight + 20;
    }

    y = addSectionTitle("Report Details", y);
    y = addLabelValue(
      "Graph Type:",
      reportChartType === "line" ? "Line Graph" : "Bar Graph",
      marginLeft,
      y
    );
    y = addLabelValue(
      "Period:",
      reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1),
      marginLeft,
      y
    );

    if (reportPeriod !== "year") {
      y = addLabelValue("Year:", String(reportYear), marginLeft, y);
    }

    y = addLabelValue("Date Filter:", rangeText, marginLeft, y);
    y = addLabelValue("Total Incidents:", String(total), marginLeft, y);
    y = addLabelValue(
      "Highest Count:",
      `${highest.label} (${highest.alerts})`,
      marginLeft,
      y
    );
    y = addLabelValue(
      "Lowest Count:",
      `${lowest.label} (${lowest.alerts})`,
      marginLeft,
      y
    );
    y = addLabelValue("Average:", average, marginLeft, y);

    y += 14;
    y = addSectionTitle("Automated Report Text", y);
    y = addParagraph(narrative, y);

    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(9);
    pdf.setTextColor(110, 110, 110);
    pdf.text(
      `Generated on ${new Date().toLocaleString()}`,
      marginLeft,
      pageHeight - 20
    );

    pdf.save(`analytics-report-${Date.now()}.pdf`);
    setShowDownloadModal(false);
  };

  return (
    <div>
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
            loop={true}
            autoplay={true}
            style={{
              width: 160,
              height: 160,
            }}
          />
        </div>
      ) : (
        <>
          <AdminHeader />

          <div style={{ position: "absolute", top: 20, right: 30, zIndex: 50 }}>
            <AlertBellButton />
          </div>

          <AlertDispatchModal />

          <div className={styles.container}>
            <div data-aos="fade-up" className={styles.contentSection}>
              <div className={styles.headerRow}>
                <h2 className={styles.pageTitle}>Fire Incidents Overview</h2>
              </div>

          <hr className={styles.separator} />

          <div className={styles.topControls}>
            <div className={styles.periodSwitcher}>
              {(["week", "month", "year"] as Period[]).map((period) => (
                <button
                  key={period}
                  className={`${styles.periodBtn} ${
                    selectedPeriod === period ? styles.periodBtnActive : ""
                  }`}
                  onClick={() => setSelectedPeriod(period)}
                >
                  <span>{period.charAt(0).toUpperCase() + period.slice(1)}</span>
                </button>
              ))}
            </div>

            <div className={styles.filterRow}>
              {selectedPeriod !== "year" && (
                <select
                  className={styles.yearSelect}
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              )}

              <select
                className={styles.chartTypeSelect}
                value={selectedChartType}
                onChange={(e) => setSelectedChartType(e.target.value as ChartType)}
              >
                <option value="line">Line Graph</option>
                <option value="bar">Bar Graph</option>
              </select>
            </div>
          </div>

          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <h4 className={styles.chartTitle}>
                {selectedChartType === "line" ? "Line Graph" : "Bar Graph"}
              </h4>
            </div>

            <div className={styles.chartWrapper}>
              {renderGraph(chartData, selectedChartType)}
            </div>
          </div>

          <button
            className={styles.downloadBtn}
            onClick={() => {
              setReportChartType(selectedChartType);
              setReportPeriod(selectedPeriod);
              setReportYear(selectedYear);

              if (!reportStartDate && alertsDates.length > 0) {
                const minDate = new Date(
                  Math.min(...alertsDates.map((d) => d.getTime()))
                );
                setReportStartDate(formatDateInputValue(minDate));
              }

              if (!reportEndDate && alertsDates.length > 0) {
                const maxDate = new Date(
                  Math.max(...alertsDates.map((d) => d.getTime()))
                );
                setReportEndDate(formatDateInputValue(maxDate));
              }

              setShowDownloadModal(true);
            }}
          >
            <span>Download</span>
          </button>
        </div>
      </div>

      {showDownloadModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalBox}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Download Analytics Report</h3>
            </div>

            <div className={styles.modalBodyScrollable}>
              <div className={styles.modalBody}>
                <div className={styles.modalField}>
                  <label className={styles.modalLabel}>Graph Type</label>
                  <select
                    className={styles.modalInput}
                    value={reportChartType}
                    onChange={(e) =>
                      setReportChartType(e.target.value as ChartType)
                    }
                  >
                    <option value="line">Line Graph</option>
                    <option value="bar">Bar Graph</option>
                  </select>
                </div>

                <div className={styles.modalField}>
                  <label className={styles.modalLabel}>Period</label>
                  <select
                    className={styles.modalInput}
                    value={reportPeriod}
                    onChange={(e) => setReportPeriod(e.target.value as Period)}
                  >
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </div>

                {reportPeriod !== "year" && (
                  <div className={styles.modalField}>
                    <label className={styles.modalLabel}>Year</label>
                    <select
                      className={styles.modalInput}
                      value={reportYear}
                      onChange={(e) => setReportYear(Number(e.target.value))}
                    >
                      {availableYears.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className={styles.dateGrid}>
                  <div className={styles.modalField}>
                    <label className={styles.modalLabel}>
                      Specific Date Start
                    </label>
                    <input
                      type="date"
                      className={styles.modalInput}
                      value={reportStartDate}
                      onChange={(e) => setReportStartDate(e.target.value)}
                    />
                  </div>

                  <div className={styles.modalField}>
                    <label className={styles.modalLabel}>
                      Specific Date End
                    </label>
                    <input
                      type="date"
                      className={styles.modalInput}
                      value={reportEndDate}
                      onChange={(e) => setReportEndDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.previewBox}>
                  <h4 className={styles.previewTitle}>
                    Automated Report Preview
                  </h4>
                  <p className={styles.previewText}>
                    {generateAutomatedNarrative(exportChartData)}
                  </p>
                </div>

                <div className={styles.rangeInfo}>
                  {reportStartDate && reportEndDate && (
                    <span>
                      Report range:{" "}
                      {formatReadableDate(new Date(reportStartDate))} to{" "}
                      {formatReadableDate(new Date(reportEndDate))}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.closeBtn}
                onClick={() => setShowDownloadModal(false)}
              >
                <span>Close</span>
              </button>

              <button className={styles.saveBtn} onClick={downloadReport}>
                <span>Download Report</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.exportCaptureWrap}>
        <div className={styles.exportChartCard} ref={exportChartRef}>
          <div className={styles.exportHeader}>
            <h3 className={styles.exportTitle}>Fire Incidents Overview</h3>
            <p className={styles.exportSubtitle}>
              {reportChartType === "line" ? "Line Graph" : "Bar Graph"} •{" "}
              {reportPeriod.charAt(0).toUpperCase() + reportPeriod.slice(1)}
              {reportPeriod !== "year" ? ` • ${reportYear}` : ""}
            </p>
          </div>

          <div className={styles.exportChartInner}>
            {renderGraph(exportChartData, reportChartType, true)}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};

export default AnalyticsPage;