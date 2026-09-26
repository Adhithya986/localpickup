import { useLocation, useNavigate, Link } from "react-router-dom";
import { useState } from "react";

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

  async function confirmBooking() {
    if (!selectedSlot || !order || isSubmitting) return;

    setIsSubmitting(true);
    
    try {
      const formData = new FormData();
      if (order.file) {
        formData.append("file", order.file);
      }
      formData.append("shopId", order.shopId || "1");
      formData.append("shopName", order.shopName || "ABC Digital Prints");
      formData.append("paper", order.paper);
      formData.append("colour", order.colour);
      formData.append("sides", order.sides);
      formData.append("copies", order.copies.toString());
      formData.append("binding", order.binding.toString());
      formData.append("lamination", order.lamination.toString());
      formData.append("total", order.total.toString());
      formData.append("pickupTime", selectedSlot);

      const response = await fetch("/api/orders", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to submit order");
      }

      const savedOrder = await response.json();

      navigate("/booking-success", {
        state: savedOrder,
      });
    } catch (error) {
      console.error("Booking error:", error);
      alert("Failed to confirm booking. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="app">
      <header className="navbar">
        <Link to="/" className="logo">
          Local<span>Pickup</span>
        </Link>

        <button className="login-button">
          Login
        </button>
      </header>

      <main>
        <section className="pickup-header">
          <Link to="/print" className="back-link">
            ← Back to printing
          </Link>

          <p className="eyebrow">
            PICKUP SCHEDULING
          </p>

          <h1>When would you like to pick it up?</h1>

          <p className="hero-description">
            Choose a convenient time and we'll have
            your order ready for you.
          </p>
        </section>

        <section className="pickup-layout">
          <div className="pickup-main">
            <div className="pickup-section">
              <div className="date-heading">
                <div>
                  <span className="date-label">
                    TODAY
                  </span>

                  <h2>Monday, September 21</h2>
                </div>
              </div>

              <div className="slot-grid">
                {pickupSlots.map((slot) => (
                  <button
                    key={slot}
                    className={`time-slot ${
                      selectedSlot === slot
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      setSelectedSlot(slot)
                    }
                  >
                    <strong>{slot}</strong>

                    <span>
                      {selectedSlot === slot
                        ? "Selected"
                        : "Available"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="pickup-note">
              <span>💡</span>

              <div>
                <strong>
                  We'll prepare your order before your slot
                </strong>

                <p>
                  Please arrive around your selected
                  pickup time. Your order will be
                  waiting for you.
                </p>
              </div>
            </div>
          </div>

          <aside className="price-summary">
            <h2>Booking summary</h2>

            <div className="summary-shop">
              <span>Shop</span>

              <strong>
                ABC Digital Prints
              </strong>
            </div>

            <div className="summary-line">
              <span>Document</span>

              <span>
                {order?.fileName || "Document"}
              </span>
            </div>

            <div className="summary-line">
              <span>Copies</span>

              <span>
                {order?.copies || 1}
              </span>
            </div>

            <div className="summary-line">
              <span>Pickup</span>

              <span>
                {selectedSlot || "Select a time"}
              </span>
            </div>

            <div className="summary-divider" />

            <div className="summary-total">
              <span>Total</span>

              <strong>
                ₹{order?.total || 0}
              </strong>
            </div>

            <button
              className="continue-button"
              disabled={!selectedSlot || isSubmitting}
              onClick={confirmBooking}
            >
              {isSubmitting ? "Confirming..." : "Confirm Booking →"}
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