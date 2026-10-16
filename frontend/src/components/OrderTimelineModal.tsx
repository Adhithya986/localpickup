import { useState, useEffect } from "react";
import { authFetch } from "../utils/api";

interface TimelineEvent {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedByName: string | null;
  note: string | null;
  createdAt: string;
}

interface OrderTimelineModalProps {
  orderId: string;
  currentStatus: string;
  onClose: () => void;
}

const CANONICAL_STEPS = ["Pending", "Accepted", "Preparing", "Ready", "Completed"];

export function OrderTimelineModal({ orderId, currentStatus, onClose }: OrderTimelineModalProps) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    authFetch(`/api/orders/${orderId}/timeline`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load timeline");
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setTimeline(data.timeline || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to load order history");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [orderId]);

  const isCancelled = currentStatus === "Cancelled" || currentStatus === "Rejected";
  const currentStepIndex = CANONICAL_STEPS.indexOf(currentStatus);

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.5)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "560px",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          animation: "scaleIn 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#f8fafc",
          }}
        >
          <div>
            <span
              style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#64748b",
                fontWeight: 700,
              }}
            >
              Order Tracking
            </span>
            <h3 style={{ margin: "2px 0 0", color: "#0f172a", fontSize: "1.15rem" }}>
              Lifecycle History: {orderId}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.25rem",
              color: "#94a3b8",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: "6px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Stepper Progress Bar (if not cancelled) */}
        {!isCancelled ? (
          <div
            style={{
              padding: "1.25rem 1.5rem",
              borderBottom: "1px solid #f1f5f9",
              backgroundColor: "#ffffff",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {CANONICAL_STEPS.map((step, idx) => {
                const isPassed = currentStepIndex >= idx;
                const isCurrent = currentStatus === step;

                return (
                  <div
                    key={step}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      position: "relative",
                      flex: 1,
                    }}
                  >
                    {/* Connecting line */}
                    {idx < CANONICAL_STEPS.length - 1 && (
                      <div
                        style={{
                          position: "absolute",
                          top: "12px",
                          left: "50%",
                          width: "100%",
                          height: "3px",
                          backgroundColor: currentStepIndex > idx ? "#16a34a" : "#e2e8f0",
                          zIndex: 1,
                        }}
                      />
                    )}

                    {/* Step circle */}
                    <div
                      style={{
                        width: "26px",
                        height: "26px",
                        borderRadius: "999px",
                        backgroundColor: isCurrent
                          ? "#4f46e5"
                          : isPassed
                          ? "#16a34a"
                          : "#f1f5f9",
                        color: isPassed || isCurrent ? "#ffffff" : "#94a3b8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        zIndex: 2,
                        boxShadow: isCurrent ? "0 0 0 3px #c7d2fe" : "none",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {isPassed && !isCurrent ? "✓" : idx + 1}
                    </div>

                    <span
                      style={{
                        fontSize: "0.7rem",
                        marginTop: "6px",
                        fontWeight: isCurrent ? 700 : 500,
                        color: isCurrent ? "#4f46e5" : isPassed ? "#16a34a" : "#94a3b8",
                        textAlign: "center",
                      }}
                    >
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: "1rem 1.5rem",
              backgroundColor: "#fef2f2",
              borderBottom: "1px solid #fee2e2",
              color: "#991b1b",
              fontWeight: 600,
              fontSize: "0.875rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>🛑</span>
            <span>This order was {currentStatus.toLowerCase()}. Any reserved inventory has been restored.</span>
          </div>
        )}

        {/* Timeline Log */}
        <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
              Loading order history...
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#ef4444" }}>
              {error}
            </div>
          ) : timeline.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>
              No timeline events recorded yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {timeline.map((evt, idx) => (
                <div
                  key={evt.id || idx}
                  style={{
                    display: "flex",
                    gap: "12px",
                    position: "relative",
                  }}
                >
                  {/* Vertical rule */}
                  {idx < timeline.length - 1 && (
                    <div
                      style={{
                        position: "absolute",
                        top: "24px",
                        left: "11px",
                        bottom: "-16px",
                        width: "2px",
                        backgroundColor: "#e2e8f0",
                      }}
                    />
                  )}

                  {/* Icon node */}
                  <div
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "999px",
                      backgroundColor:
                        evt.toStatus === "Completed"
                          ? "#dcfce7"
                          : evt.toStatus === "Ready"
                          ? "#ecfdf5"
                          : evt.toStatus === "Cancelled" || evt.toStatus === "Rejected"
                          ? "#fee2e2"
                          : "#ede9fe",
                      color:
                        evt.toStatus === "Completed"
                          ? "#16a34a"
                          : evt.toStatus === "Ready"
                          ? "#059669"
                          : evt.toStatus === "Cancelled" || evt.toStatus === "Rejected"
                          ? "#dc2626"
                          : "#7c3aed",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      flexShrink: 0,
                      zIndex: 2,
                    }}
                  >
                    •
                  </div>

                  {/* Event Details */}
                  <div
                    style={{
                      flex: 1,
                      backgroundColor: "#f8fafc",
                      borderRadius: "8px",
                      padding: "8px 12px",
                      border: "1px solid #f1f5f9",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        marginBottom: "4px",
                      }}
                    >
                      <strong style={{ fontSize: "0.875rem", color: "#0f172a" }}>
                        Status: {evt.toStatus}
                      </strong>
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {formatDateTime(evt.createdAt)}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.8rem", color: "#475569" }}>
                      {evt.note || `Transitioned to ${evt.toStatus}`}
                    </div>

                    {evt.changedByName && (
                      <div style={{ fontSize: "0.725rem", color: "#94a3b8", marginTop: "2px" }}>
                        Updated by: {evt.changedByName}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid #e2e8f0",
            backgroundColor: "#f8fafc",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 18px",
              backgroundColor: "#0f172a",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
