"use client";

import React, { useState } from "react";
import { doc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { FaBroadcastTower, FaUserCheck, FaClock } from "react-icons/fa";

const FIRE_STATUS_OPTIONS = [
  "Fire Active",
  "Fire Spreading",
  "Fire Under Control",
  "Fire Out",
  "No Fire Found (False Alarm)",
];

const FIRE_SEVERITY_OPTIONS = ["Low", "Moderate", "High", "Critical"];

const FIRE_TYPE_OPTIONS = [
  "Unknown",
  "Residential Fire",
  "Commercial Fire",
  "Industrial Fire",
  "Vehicular Fire",
  "Grassland / Open Area Fire",
  "Electrical Fire",
  "Structural Fire",
  "Trash / Waste Fire",
  "Others",
];

const RESOURCES_OPTIONS = [
  "No Additional Resources Needed",
  "Additional Fire Truck",
  "Ambulance",
  "Police",
];

interface Props {
  previewAlert: any;
  getValidationReport: (alert: any) => any;
  hasDisplayValue: (value: unknown) => boolean;
  formatValidationTime: (value: any) => string;
  getValidationTimeValue: (alertData: any) => any;
  styles: Record<string, string>;
  onUpdated: (updatedAlert: any) => void;
}

const AlreadyRadioedForm = ({
  previewAlert,
  getValidationReport,
  hasDisplayValue,
  formatValidationTime,
  getValidationTimeValue,
  styles,
  onUpdated,
}: Props) => {
  const report = getValidationReport(previewAlert);

  const [fireStatus, setFireStatus] = useState("");
  const [fireSeverity, setFireSeverity] = useState("");
  const [fireTypes, setFireTypes] = useState<string[]>([]);
  const [othersText, setOthersText] = useState("");
  const [resources, setResources] = useState<string[]>([]);
  const [remarks, setRemarks] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Review modal
  const [showReviewModal, setShowReviewModal] = useState(false);

  const isFalseAlarm = fireStatus === "No Fire Found (False Alarm)";
  const isUnknownFireType = fireTypes.includes("Unknown");
  const isNoAdditionalResources = resources.includes(
    "No Additional Resources Needed",
  );

  const toggleFireType = (type: string) => {
    if (type === "Unknown") {
      // If Unknown is already selected, uncheck it; otherwise, select it exclusively
      setFireTypes((prev) => (prev.includes("Unknown") ? [] : ["Unknown"]));
      return;
    }
    setFireTypes((prev) => {
      const filtered = prev.filter((t) => t !== "Unknown");
      return filtered.includes(type)
        ? filtered.filter((t) => t !== type)
        : [...filtered, type];
    });
  };

  const toggleResource = (resource: string) => {
    if (resource === "No Additional Resources Needed") {
      // If already selected, uncheck it; otherwise, select it exclusively
      setResources((prev) =>
        prev.includes("No Additional Resources Needed")
          ? []
          : ["No Additional Resources Needed"],
      );
      return;
    }
    setResources((prev) => {
      const filtered = prev.filter(
        (r) => r !== "No Additional Resources Needed",
      );
      return filtered.includes(resource)
        ? filtered.filter((r) => r !== resource)
        : [...filtered, resource];
    });
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!fireStatus) newErrors.fireStatus = "Please select a fire status.";

    if (!isFalseAlarm) {
      if (!fireSeverity)
        newErrors.fireSeverity = "Please select a fire severity.";
      if (fireTypes.length === 0)
        newErrors.fireTypes = "Please select at least one fire type.";
      if (fireTypes.includes("Others") && !othersText.trim())
        newErrors.othersText = "Please specify the other fire type.";
    }

    if (resources.length === 0)
      newErrors.resources = "Please select at least one resource option.";

    if (!remarks.trim()) newErrors.remarks = "Remarks are required.";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleReview = () => {
    if (!validate()) return;
    setShowReviewModal(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const finalFireTypes = isFalseAlarm
        ? []
        : fireTypes.includes("Others")
          ? [
              ...fireTypes.filter((t) => t !== "Others"),
              `Others: ${othersText.trim()}`,
            ]
          : fireTypes;

      const updatedReport = {
        ...report,
        skippedBecauseRadioed: false,
        fireStatusUponArrival: fireStatus,
        fireSeverity: isFalseAlarm ? "" : fireSeverity,
        fireTypes: finalFireTypes,
        resourcesNeeded: resources,
        remarks: remarks.trim(),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "alerts", previewAlert.id), {
        latestValidationReport: updatedReport,
      });

      // Re-fetch updated alert
      const freshSnap = await getDoc(doc(db, "alerts", previewAlert.id));
      if (freshSnap.exists()) {
        onUpdated({ id: freshSnap.id, ...freshSnap.data() });
      }

      setShowReviewModal(false);
    } catch (err) {
      console.error("Failed to update validation report:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const resolvedFireTypes = isFalseAlarm
    ? []
    : fireTypes.includes("Others")
      ? [
          ...fireTypes.filter((t) => t !== "Others"),
          `Others: ${othersText.trim()}`,
        ]
      : fireTypes;

  return (
    <>
      {/* ── Read-only top fields ── */}
      <div className={`${styles.fieldCard} ${styles.fieldCardDanger}`}>
        <div className={`${styles.fieldIcon} ${styles.fieldIconDanger}`}>
          <FaBroadcastTower aria-hidden="true" />
        </div>
        <div className={styles.fieldContent}>
          <span
            className={`${styles.fieldLabel} ${styles.fieldLabelDanger}`}
          ></span>
          <span className={styles.fieldValue}>Already Radioed</span>
        </div>
      </div>

      {hasDisplayValue(report?.validatedBy) && (
        <div className={styles.fieldCard}>
          <div className={`${styles.fieldIcon} ${styles.fieldIconInfo}`}>
            <FaUserCheck aria-hidden="true" />
          </div>
          <div className={styles.fieldContent}>
            <span className={styles.fieldLabel}>Validated By</span>
            <span className={styles.fieldValue}>{report?.validatedBy}</span>
          </div>
        </div>
      )}

      {hasDisplayValue(getValidationTimeValue(previewAlert)) && (
        <div className={styles.fieldCard}>
          <div className={`${styles.fieldIcon} ${styles.fieldIconInfo}`}>
            <FaClock aria-hidden="true" />
          </div>
          <div className={styles.fieldContent}>
            <span className={styles.fieldLabel}>Validation Time</span>
            <span className={styles.fieldValue}>
              {formatValidationTime(getValidationTimeValue(previewAlert))}
            </span>
          </div>
        </div>
      )}

      {/* ── Divider ── */}
      <div className={styles.formDivider} />

      {/* ── Fire Status Upon Arrival ── */}
      <div className={styles.formGroup}>
        <span className={styles.formLabel}>
          Fire Status Upon Arrival <span className={styles.required}>*</span>
        </span>
        <div className={styles.radioGroup}>
          {FIRE_STATUS_OPTIONS.map((option) => (
            <label key={option} className={styles.radioLabel}>
              <input
                type="radio"
                name="fireStatus"
                value={option}
                checked={fireStatus === option}
                onChange={() => {
                  setFireStatus(option);
                  if (errors.fireStatus)
                    setErrors((e) => ({ ...e, fireStatus: "" }));
                }}
                className={styles.radioInput}
              />
              <span className={styles.radioText}>{option}</span>
            </label>
          ))}
        </div>
        {errors.fireStatus && (
          <span className={styles.fieldError}>{errors.fireStatus}</span>
        )}
      </div>

      {/* ── Fire Severity (hidden if false alarm) ── */}
      {!isFalseAlarm && (
        <div className={styles.formGroup}>
          <span className={styles.formLabel}>
            Fire Severity <span className={styles.required}>*</span>
          </span>
          <div className={styles.radioGroup}>
            {FIRE_SEVERITY_OPTIONS.map((option) => (
              <label key={option} className={styles.radioLabel}>
                <input
                  type="radio"
                  name="fireSeverity"
                  value={option}
                  checked={fireSeverity === option}
                  onChange={() => {
                    setFireSeverity(option);
                    if (errors.fireSeverity)
                      setErrors((e) => ({ ...e, fireSeverity: "" }));
                  }}
                  className={styles.radioInput}
                />
                <span className={styles.radioText}>{option}</span>
              </label>
            ))}
          </div>
          {errors.fireSeverity && (
            <span className={styles.fieldError}>{errors.fireSeverity}</span>
          )}
        </div>
      )}

      {/* ── Fire Type (hidden if false alarm) ── */}
      {!isFalseAlarm && (
        <div className={styles.formGroup}>
          <span className={styles.formLabel}>
            Fire Type <span className={styles.required}>*</span>
          </span>
          <div className={styles.checkboxGroup}>
            {FIRE_TYPE_OPTIONS.map((option) => {
              if (isUnknownFireType && option !== "Unknown") return null;
              return (
                <label key={option} className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={fireTypes.includes(option)}
                    onChange={() => {
                      toggleFireType(option);
                      if (errors.fireTypes)
                        setErrors((e) => ({ ...e, fireTypes: "" }));
                    }}
                    className={styles.checkboxInput}
                  />
                  <span className={styles.checkboxText}>{option}</span>
                </label>
              );
            })}
            {fireTypes.includes("Others") && !isUnknownFireType && (
              <input
                type="text"
                placeholder="Please specify..."
                value={othersText}
                onChange={(e) => {
                  setOthersText(e.target.value);
                  if (errors.othersText)
                    setErrors((e2) => ({ ...e2, othersText: "" }));
                }}
                className={styles.othersInput}
              />
            )}
          </div>
          {errors.fireTypes && (
            <span className={styles.fieldError}>{errors.fireTypes}</span>
          )}
          {errors.othersText && (
            <span className={styles.fieldError}>{errors.othersText}</span>
          )}
        </div>
      )}

      {/* ── Resources Needed ── */}
      <div className={styles.formGroup}>
        <span className={styles.formLabel}>
          Resources Needed <span className={styles.required}>*</span>
        </span>
        <div className={styles.checkboxGroup}>
          {RESOURCES_OPTIONS.map((option) => {
            if (
              isNoAdditionalResources &&
              option !== "No Additional Resources Needed"
            )
              return null;
            return (
              <label key={option} className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={resources.includes(option)}
                  onChange={() => {
                    toggleResource(option);
                    if (errors.resources)
                      setErrors((e) => ({ ...e, resources: "" }));
                  }}
                  className={styles.checkboxInput}
                />
                <span className={styles.checkboxText}>{option}</span>
              </label>
            );
          })}
        </div>
        {errors.resources && (
          <span className={styles.fieldError}>{errors.resources}</span>
        )}
      </div>

      {/* ── Remarks ── */}
      <div className={styles.formGroup}>
        <span className={styles.formLabel}>
          Remarks <span className={styles.required}>*</span>
        </span>
        <textarea
          placeholder="Enter remarks..."
          value={remarks}
          rows={3}
          onChange={(e) => {
            setRemarks(e.target.value);
            if (errors.remarks) setErrors((er) => ({ ...er, remarks: "" }));
          }}
          className={styles.remarksTextarea}
        />
        {errors.remarks && (
          <span className={styles.fieldError}>{errors.remarks}</span>
        )}
      </div>

      {/* ── Review Button ── */}
      <button
        type="button"
        className={styles.reviewBtn}
        onClick={handleReview}
        disabled={submitting}
      >
        Review & Update
      </button>

      {/* ── Review Modal ── */}
      {showReviewModal && (
        <div
          className={styles.reviewModalOverlay}
          onClick={() => setShowReviewModal(false)}
        >
          <div
            className={styles.reviewModalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className={styles.reviewModalTitle}>
              Review Validation Report
            </h4>
            <p className={styles.reviewModalSubtitle}>
              Please confirm the details before submitting.
            </p>

            <div className={styles.reviewFields}>
              <div className={styles.reviewRow}>
                <span className={styles.reviewRowLabel}>
                  Fire Status Upon Arrival
                </span>
                <span className={styles.reviewRowValue}>{fireStatus}</span>
              </div>

              {!isFalseAlarm && (
                <>
                  <div className={styles.reviewRow}>
                    <span className={styles.reviewRowLabel}>Fire Severity</span>
                    <span className={styles.reviewRowValue}>
                      {fireSeverity}
                    </span>
                  </div>

                  <div className={styles.reviewRow}>
                    <span className={styles.reviewRowLabel}>Fire Type</span>
                    <span className={styles.reviewRowValue}>
                      {resolvedFireTypes.join(", ") || "—"}
                    </span>
                  </div>
                </>
              )}

              <div className={styles.reviewRow}>
                <span className={styles.reviewRowLabel}>Resources Needed</span>
                <span className={styles.reviewRowValue}>
                  {resources.join(", ") || "—"}
                </span>
              </div>

              <div className={styles.reviewRow}>
                <span className={styles.reviewRowLabel}>Remarks</span>
                <span className={styles.reviewRowValue}>{remarks}</span>
              </div>
            </div>

            <div className={styles.reviewModalActions}>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setShowReviewModal(false)}
                disabled={submitting}
              >
                Back
              </button>
              <button
                type="button"
                className={styles.dispatchBtn}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Updating..." : "Confirm & Update"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AlreadyRadioedForm;
