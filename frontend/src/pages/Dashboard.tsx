import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import { authFetch, getToken, getUser } from "../utils/api";

interface Order {
  id: string;
  shopName: string;
  fileName: string;
  filePath: string;
  pickupTime: string;
  total: number;
  pickupToken?: string;
  status: "Pending" | "Accepted" | "Preparing" | "Ready" | "Completed" | "Rejected" | "Cancelled";
  createdAt: string;
  paper: string;
  colour: string;
  sides: string;
  copies: number;
  binding: boolean;
  lamination: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
}

function Dashboard() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<any>(null);
  const [verifyCodeMap, setVerifyCodeMap] = useState<Record<string, string>>({});
  const [verifyErrorMap, setVerifyErrorMap] = useState<Record<string, string>>({});
  const [actionSuccess, setActionSuccess] = useState<string>("");

  const token = getToken();

  const fetchOrders = () => {
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
          const sorted = data.sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
    const user = getUser();
    if (!user || (user.role !== "SHOPKEEPER" && user.role !== "SHOP_OWNER" && user.role !== "ADMIN")) {
      navigate("/login");
      return;
    }

    // Load authenticated shopkeeper's shop
    authFetch("/api/shops/mine")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) setShop(data);
      })
      .catch(() => {});

    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [navigate]);

  const updateStatus = async (id: string, newStatus: string) => {
    setActionSuccess("");
    try {
      const res = await authFetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to update status");
        return;
      }
      setActionSuccess(`Order ${id} marked as ${newStatus}`);
      fetchOrders();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const verifyPickup = async (orderId: string) => {
    const code = verifyCodeMap[orderId] || "";
    if (!code.trim()) {
      setVerifyErrorMap((prev) => ({ ...prev, [orderId]: "Please enter pickup code" }));
      return;
    }

    try {
      const res = await authFetch(`/api/orders/${orderId}/verify-pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyErrorMap((prev) => ({ ...prev, [orderId]: data.error || "Verification failed" }));
        return;
      }

      setVerifyErrorMap((prev) => ({ ...prev, [orderId]: "" }));
      setActionSuccess(`Order ${orderId} verified and completed!`);
      fetchOrders();
    } catch (err) {
      setVerifyErrorMap((prev) => ({ ...prev, [orderId]: "Network error verifying pickup" }));
    }
  };

  if (shop && shop.subscriptionStatus === "SUSPENDED") {
    return (
      <div className="app">
        <Navbar />
        <main style={{ textAlign: "center", padding: "4rem 1rem" }}>
          <h1>Account Suspended</h1>
          <p>Your shop's subscription is currently suspended. Please contact the platform administrator.</p>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Navbar />

      <main>
        <section className="shops-header">
          <p className="eyebrow">SHOPKEEPER PORTAL</p>
          <h1>{shop ? shop.name : "Order Dashboard"}</h1>
          <p className="hero-description">Manage print jobs, update preparation status, and verify customer pickups.</p>
          {actionSuccess && (
            <div style={{ padding: "0.75rem", background: "#dcfce7", color: "#166534", borderRadius: "6px", marginTop: "1rem", fontWeight: "bold" }}>
              ✓ {actionSuccess}
            </div>
          )}
        </section>

        <section className="section">
          {loading ? (
            <p>Loading orders...</p>
          ) : orders.length === 0 ? (
            <p>No orders yet for this shop.</p>
          ) : (
            <div className="services-list" style={{ gridTemplateColumns: "1fr" }}>
              {orders.map((order) => {
                const docUrl = `/api/documents/${order.id}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
                return (
                  <div className="service-card" key={order.id} style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", width: "100%" }}>
                      <div>
                        <h3>Order {order.id}</h3>
                        <p><strong>Pickup Time:</strong> {order.pickupTime}</p>
                        <p><strong>Total:</strong> ₹{order.total}</p>
                        {order.verifiedAt && (
                          <p style={{ fontSize: "0.85rem", color: "#166534" }}>
                            <strong>Collected:</strong> Verified on {new Date(order.verifiedAt).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                      <div>
                        <span
                          className={`status-badge ${order.status.toLowerCase()}`}
                          style={{
                            padding: "6px 14px",
                            borderRadius: "6px",
                            fontWeight: "bold",
                            display: "inline-block",
                            marginBottom: "1rem",
                            backgroundColor:
                              order.status === "Pending" ? "#fef3c7" :
                              order.status === "Ready" ? "#dcfce7" :
                              order.status === "Completed" ? "#f3f4f6" : "#e0e7ff",
                            color:
                              order.status === "Pending" ? "#92400e" :
                              order.status === "Ready" ? "#166534" :
                              order.status === "Completed" ? "#374151" : "#3730a3",
                          }}
                        >
                          {order.status === "Ready" ? "Ready for Pickup" : order.status}
                        </span>
                      </div>
                    </div>

                    <div style={{ background: "#f9fafb", padding: "1rem", borderRadius: "8px", margin: "1rem 0" }}>
                      <h4 style={{ margin: "0 0 0.5rem 0" }}>Print Details:</h4>
                      <p style={{ margin: "0.2rem 0" }}>
                        📄{" "}
                        <a href={docUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb", fontWeight: "bold", textDecoration: "underline" }}>
                          {order.fileName} (Download / View Securely)
                        </a>
                      </p>
                      <p style={{ margin: "0.2rem 0" }}>• {order.paper} Size, {order.colour === "colour" ? "Colour" : "Black & White"}</p>
                      <p style={{ margin: "0.2rem 0" }}>• {order.sides === "double" ? "Double-sided" : "Single-sided"}</p>
                      <p style={{ margin: "0.2rem 0" }}>• {order.copies} Copies</p>
                      {(order.binding || order.lamination) && (
                        <p style={{ margin: "0.2rem 0" }}>• Extras: {[order.binding && "Binding", order.lamination && "Lamination"].filter(Boolean).join(", ")}</p>
                      )}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "flex-end", alignItems: "center", width: "100%" }}>
                      {order.status === "Pending" && (
                        <button className="shop-button" onClick={() => updateStatus(order.id, "Ready")}>
                          Mark Ready for Pickup
                        </button>
                      )}

                      {order.status === "Ready" && (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <input
                            type="text"
                            placeholder="Enter Customer Pickup Code"
                            value={verifyCodeMap[order.id] || ""}
                            onChange={(e) => setVerifyCodeMap({ ...verifyCodeMap, [order.id]: e.target.value })}
                            style={{ padding: "0.5rem 0.75rem", borderRadius: "4px", border: "1px solid #d1d5db", fontSize: "0.9rem" }}
                          />
                          <button
                            className="shop-button"
                            style={{ background: "#166534" }}
                            onClick={() => verifyPickup(order.id)}
                          >
                            Verify & Complete
                          </button>
                          {verifyErrorMap[order.id] && (
                            <span style={{ color: "#dc2626", fontSize: "0.85rem", marginLeft: "0.5rem" }}>
                              {verifyErrorMap[order.id]}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
