import { useLocation, useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import Navbar from "../components/Navbar";
import { authFetch } from "../utils/api";
import { clearCart } from "../utils/cart";

const pickupSlots = [
  "8:00 PM",
  "8:30 PM",
  "9:00 PM",
  "9:30 PM",
  "10:00 PM",
];

function Pickup() {
  const location = useLocation();
  const navigate = useNavigate();
  const order = location.state;
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  if (!order || (!order.file && (!order.items || order.items.length === 0))) {
    return (
      <div className="app">
        <Navbar />
        <main style={{ textAlign: "center", padding: "4rem 1rem" }}>
          <h2>No items selected for pickup</h2>
          <p style={{ color: "#64748b", margin: "1rem 0 1.5rem" }}>
            Please select stationery items or configure document printing from a shop first.
          </p>
          <Link
            to="/shops"
            style={{
              background: "#4f46e5",
              color: "#fff",
              padding: "0.75rem 1.5rem",
              borderRadius: "8px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Browse Local Shops
          </Link>
        </main>
      </div>
    );
  }

  async function confirmBooking() {
    if (!selectedSlot || !order || isSubmitting) return;

    setIsSubmitting(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("shopId", order.shopId || "1");
      formData.append("shopName", order.shopName || "ABC Digital Prints");
      formData.append("pickupTime", selectedSlot);

      // Append stationery items if present
      if (order.items && order.items.length > 0) {
        formData.append(
          "items",
          JSON.stringify(
            order.items.map((it: any) => ({
              productId: it.productId,
              quantity: it.quantity,
            }))
          )
        );
      }

      // Append printing document and options if present
      if (order.file) {
        formData.append("file", order.file);
      }
      if (order.paper) formData.append("paper", order.paper);
      if (order.colour) formData.append("colour", order.colour);
      if (order.sides) formData.append("sides", order.sides);
      if (order.copies) formData.append("copies", order.copies.toString());
      if (order.binding !== undefined) formData.append("binding", order.binding.toString());
      if (order.lamination !== undefined) formData.append("lamination", order.lamination.toString());

      const response = await authFetch("/api/orders", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit order");
      }

      // Clear client-side cart on successful checkout
      clearCart();

      navigate("/booking-success", {
        state: data,
      });
    } catch (err: any) {
      console.error("Booking error:", err);
      setError(err.message || "Failed to confirm booking. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="app">
      <Navbar />

      <main>
        <section className="pickup-header">
          <Link to={`/shops/${order?.shopId || "1"}`} className="back-link">
            ← Back to shop
          </Link>

          <p className="eyebrow">PICKUP SCHEDULING</p>
          <h1>When would you like to pick it up?</h1>
          <p className="hero-description">
            Choose a convenient time slot. Your order will be prepared and waiting at the counter.
          </p>
        </section>

        <section className="pickup-layout">
          <div className="pickup-main">
            <div className="pickup-section">
              <div className="date-heading">
                <div>
                  <span className="date-label">TODAY</span>
                  <h2>Self-Pickup Time Slots</h2>
                </div>
              </div>

              <div className="slot-grid">
                {pickupSlots.map((slot) => (
                  <button
                    key={slot}
                    className={`time-slot ${selectedSlot === slot ? "selected" : ""}`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    <strong>{slot}</strong>
                    <span>{selectedSlot === slot ? "Selected" : "Available"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pickup-note">
              <span>💡</span>
              <div>
                <strong>Self-Pickup Verification at Counter</strong>
                <p>
                  LocalPickup is strictly self-pickup. Once your order is ready, you will present your secure pickup QR code or token to collect your items.
                </p>
              </div>
            </div>
          </div>

          <aside className="price-summary">
            <h2>Booking summary</h2>

            <div className="summary-shop">
              <span>Shop</span>
              <strong>{order?.shopName || "ABC Digital Prints"}</strong>
            </div>

            {/* Document print summary if included */}
            {order?.fileName && (
              <div className="summary-line">
                <span>Document</span>
                <span>{order.fileName}</span>
              </div>
            )}
            {order?.copies && (
              <div className="summary-line">
                <span>Print copies</span>
                <span>{order.copies}</span>
              </div>
            )}

            {/* Stationery items summary if included */}
            {order?.items && order.items.length > 0 && (
              <div style={{ margin: "8px 0" }}>
                <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>Stationery Items:</span>
                {order.items.map((it: any) => (
                  <div key={it.productId} className="summary-line" style={{ paddingLeft: "8px", fontSize: "0.85rem" }}>
                    <span>{it.title || "Product"} × {it.quantity}</span>
                    {it.price && <span>₹{it.price * it.quantity}</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="summary-line">
              <span>Pickup Slot</span>
              <span style={{ fontWeight: selectedSlot ? 600 : 400, color: selectedSlot ? "#4f46e5" : "#64748b" }}>
                {selectedSlot || "Select a time"}
              </span>
            </div>

            <div className="summary-divider" />

            <div className="summary-total">
              <span>Total for Pickup</span>
              <strong>₹{order?.total || 0}</strong>
            </div>

            {error && (
              <div style={{ color: "#dc2626", background: "#fee2e2", padding: "0.6rem", borderRadius: "6px", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                ⚠️ {error}
              </div>
            )}

            <button
              className="continue-button"
              disabled={!selectedSlot || isSubmitting}
              onClick={confirmBooking}
            >
              {isSubmitting ? "Confirming Order..." : "Confirm Booking →"}
            </button>

            {!selectedSlot && (
              <p className="helper-text">
                Select a pickup time to continue.
              </p>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}

export default Pickup;