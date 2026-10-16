import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import { authFetch, getToken } from "../utils/api";
import { OrderTimelineModal } from "../components/OrderTimelineModal";

interface OrderItem {
  id: string;
  productId?: string;
  itemType: "PRODUCT" | "PRINT_JOB";
  title: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface Order {
  id: string;
  shopName: string;
  fileName?: string;
  filePath?: string;
  pickupTime: string;
  total: number;
  pickupToken?: string;
  status: "Pending" | "Accepted" | "Preparing" | "Ready" | "Completed" | "Rejected" | "Cancelled";
  createdAt: string;
  items?: OrderItem[];
  verifiedAt?: string;
}

function Bookings() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineOrderId, setTimelineOrderId] = useState<string | null>(null);
  const [timelineOrderStatus, setTimelineOrderStatus] = useState<string>("");
  const [actionError, setActionError] = useState<string>("");
  const [actionSuccess, setActionSuccess] = useState<string>("");

  const fetchOrders = () => {
    if (!getToken()) {
      navigate("/login");
      return;
    }

    authFetch("/api/orders")
      .then((res) => {
        if (res.status === 401) {
          navigate("/login");
          return [];
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          const sorted = data.sort(
            (a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setOrders(sorted);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch orders:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [navigate]);

  const handleCancelOrder = async (orderId: string) => {
    if (!window.confirm("Are you sure you want to cancel this booking?")) return;
    setActionError("");
    setActionSuccess("");

    try {
      const res = await authFetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Customer cancelled booking" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || "Failed to cancel order");
        return;
      }
      setActionSuccess(`Order ${orderId} cancelled successfully.`);
      fetchOrders();
    } catch (err: any) {
      setActionError(err.message || "Network error while cancelling order");
    }
  };

  const getStatusBadgeStyle = (status: Order["status"]) => {
    switch (status) {
      case "Pending":
        return { bg: "#fef3c7", text: "#92400e", label: "Pending Confirmation" };
      case "Accepted":
        return { bg: "#fef9c3", text: "#854d0e", label: "Accepted by Shop" };
      case "Preparing":
        return { bg: "#ede9fe", text: "#6d28d9", label: "Preparing / Printing" };
      case "Ready":
        return { bg: "#dcfce7", text: "#166534", label: "Ready for Pickup!" };
      case "Completed":
        return { bg: "#f1f5f9", text: "#334155", label: "Completed & Collected" };
      case "Cancelled":
      case "Rejected":
        return { bg: "#fee2e2", text: "#991b1b", label: status };
      default:
        return { bg: "#f1f5f9", text: "#374151", label: status };
    }
  };

  return (
    <div className="app">
      <Navbar />

      <main>
        <section className="shops-header">
          <Link to="/" className="back-link">
            ← Back to home
          </Link>
          <p className="eyebrow">YOUR ORDERS</p>
          <h1>My Bookings</h1>
          <p className="hero-description">
            Track real-time preparation progress, view status timelines, and access your counter pickup codes.
          </p>

          {actionSuccess && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem 1rem",
                background: "#dcfce7",
                color: "#166534",
                borderRadius: "8px",
                border: "1px solid #bbf7d0",
                fontWeight: 600,
              }}
            >
              ✓ {actionSuccess}
            </div>
          )}

          {actionError && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem 1rem",
                background: "#fee2e2",
                color: "#991b1b",
                borderRadius: "8px",
                border: "1px solid #fecaca",
                fontWeight: 600,
              }}
            >
              ⚠ {actionError}
            </div>
          )}
        </section>

        <section className="section">
          {loading ? (
            <p>Loading your bookings...</p>
          ) : orders.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🛍️</div>
              <h3 style={{ color: "#0f172a" }}>You have no bookings yet</h3>
              <p style={{ margin: "0.5rem 0 1.5rem" }}>Explore local print & stationery shops and place your first pre-order.</p>
              <Link to="/" className="shop-button" style={{ display: "inline-block", textDecoration: "none" }}>
                Browse Local Shops
              </Link>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "800px", margin: "0 auto" }}>
              {orders.map((order) => {
                const badge = getStatusBadgeStyle(order.status);
                const canCancel = order.status === "Pending" || order.status === "Accepted";
                const isReady = order.status === "Ready";

                return (
                  <div
                    key={order.id}
                    style={{
                      backgroundColor: "#ffffff",
                      borderRadius: "12px",
                      border: "1px solid #e2e8f0",
                      padding: "1.5rem",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem",
                    }}
                  >
                    {/* Header Row */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                      <div>
                        <span style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600 }}>ORDER #{order.id}</span>
                        <h3 style={{ margin: "2px 0 0", fontSize: "1.25rem", color: "#0f172a" }}>{order.shopName}</h3>
                        <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                          Placed on {new Date(order.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                      </div>

                      <span
                        style={{
                          padding: "6px 12px",
                          borderRadius: "999px",
                          fontSize: "0.825rem",
                          fontWeight: 700,
                          backgroundColor: badge.bg,
                          color: badge.text,
                        }}
                      >
                        {badge.label}
                      </span>
                    </div>

                    {/* Pickup Code Alert Banner (Important when ready or pending) */}
                    <div
                      style={{
                        backgroundColor: isReady ? "#ecfdf5" : "#f8fafc",
                        border: isReady ? "1.5px solid #10b981" : "1px solid #e2e8f0",
                        borderRadius: "8px",
                        padding: "0.85rem 1.25rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "0.75rem", textTransform: "uppercase", fontWeight: 700, color: isReady ? "#059669" : "#64748b" }}>
                          Pickup Verification Code
                        </div>
                        <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "#0f172a", letterSpacing: "2px" }}>
                          {order.pickupToken || order.id}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: isReady ? "#047857" : "#64748b" }}>
                          {isReady ? "👉 Present this code to the shopkeeper now for self-pickup" : "Show this code at the counter when order is ready"}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Scheduled Pickup Time</div>
                        <div style={{ fontSize: "1rem", fontWeight: 700, color: "#4f46e5" }}>{order.pickupTime}</div>
                      </div>
                    </div>

                    {/* Order Items Breakdown */}
                    <div style={{ backgroundColor: "#fafafa", borderRadius: "8px", padding: "1rem", fontSize: "0.9rem" }}>
                      {order.items && order.items.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {order.items.map((it, idx) => (
                            <div key={idx} style={{ display: "flex", justifyContent: "space-between", color: "#334155" }}>
                              <span>
                                {it.itemType === "PRINT_JOB" ? "📄 " : "📦 "}
                                <strong>{it.title}</strong> × {it.quantity}
                              </span>
                              <span style={{ fontWeight: 600 }}>₹{it.subtotal}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: "#475569" }}>
                          {order.fileName ? `📄 Document Print: ${order.fileName}` : "Stationery Products Order"}
                        </div>
                      )}

                      <div
                        style={{
                          borderTop: "1px solid #e2e8f0",
                          marginTop: "8px",
                          paddingTop: "8px",
                          display: "flex",
                          justifyContent: "space-between",
                          fontWeight: 700,
                          fontSize: "1rem",
                          color: "#0f172a",
                        }}
                      >
                        <span>Total (Pay on Pickup)</span>
                        <span>₹{order.total}</span>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: "10px",
                        borderTop: "1px solid #f1f5f9",
                        paddingTop: "0.75rem",
                      }}
                    >
                      <button
                        onClick={() => {
                          setTimelineOrderId(order.id);
                          setTimelineOrderStatus(order.status);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          backgroundColor: "#f1f5f9",
                          color: "#334155",
                          border: "1px solid #cbd5e1",
                          borderRadius: "6px",
                          padding: "6px 14px",
                          fontWeight: 600,
                          fontSize: "0.85rem",
                          cursor: "pointer",
                        }}
                      >
                        <span>🕒</span>
                        <span>View Status Timeline</span>
                      </button>

                      {canCancel && (
                        <button
                          onClick={() => handleCancelOrder(order.id)}
                          style={{
                            backgroundColor: "#fee2e2",
                            color: "#991b1b",
                            border: "1px solid #fecaca",
                            borderRadius: "6px",
                            padding: "6px 14px",
                            fontWeight: 600,
                            fontSize: "0.85rem",
                            cursor: "pointer",
                          }}
                        >
                          Cancel Booking
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Timeline Modal */}
      {timelineOrderId && (
        <OrderTimelineModal
          orderId={timelineOrderId}
          currentStatus={timelineOrderStatus}
          onClose={() => setTimelineOrderId(null)}
        />
      )}
    </div>
  );
}

export default Bookings;
