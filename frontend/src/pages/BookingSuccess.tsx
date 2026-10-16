import { Link, useLocation } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import Navbar from "../components/Navbar";

function BookingSuccess() {
  const location = useLocation();
  const order = location.state;
  const bookingId = order?.id || "LP-000000";
  const pickupToken = order?.pickupToken || bookingId;

  return (
    <div className="app">
      <Navbar />

      <main>
        <section className="success-page">
          <div className="success-icon">✓</div>
          <p className="eyebrow">BOOKING CONFIRMED</p>
          <h1>Your order is booked!</h1>
          <p className="hero-description">
            Your print order has been sent to {order?.shopName || "the shop"}.
          </p>

          <div className="booking-card">
            <div className="booking-shop">
              <div className="shop-icon">🖨️</div>
              <div>
                <strong>{order?.shopName || "Shop"}</strong>
                <p>Printing & Document Services</p>
              </div>
            </div>

            <div className="booking-id" style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <span>ORDER ID</span>
                <strong>{bookingId}</strong>
              </div>
              <div>
                <span>PICKUP CODE</span>
                <strong style={{ color: "#166534", letterSpacing: "1px" }}>{pickupToken}</strong>
              </div>
            </div>

            <div className="booking-details">
              {order?.fileName ? (
                <>
                  <div>
                    <span>Document</span>
                    <strong>{order.fileName}</strong>
                  </div>
                  <div>
                    <span>Copies</span>
                    <strong>{order.copies || 1}</strong>
                  </div>
                </>
              ) : (
                <div>
                  <span>Order Type</span>
                  <strong>Stationery Products</strong>
                </div>
              )}
              <div>
                <span>Pickup Time</span>
                <strong>{order?.pickupTime || "Selected slot"}</strong>
              </div>
              <div>
                <span>Total Amount</span>
                <strong>₹{order?.total || 0}</strong>
              </div>
            </div>

            {order?.items && order.items.length > 0 && (
              <div style={{ margin: "1rem 0", padding: "0.75rem", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", color: "#334155" }}>Ordered Items:</h4>
                <ul style={{ margin: 0, paddingLeft: "1.25rem", fontSize: "0.85rem", color: "#475569" }}>
                  {order.items.map((it: any, idx: number) => (
                    <li key={idx} style={{ marginBottom: "4px" }}>
                      <strong>{it.title || "Item"}</strong> × {it.quantity} (₹{it.subtotal || it.unitPrice * it.quantity})
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="qr-section">
              <div className="qr-wrapper">
                <QRCodeSVG value={pickupToken} size={180} level="M" />
              </div>
              <h3>Your pickup QR code</h3>
              <p>Show this QR code or pickup code (<strong>{pickupToken}</strong>) at the shop counter to collect your order.</p>
            </div>

            <div className="success-actions">
              <Link to="/bookings" className="continue-button">
                View My Bookings
              </Link>
              <Link to="/" className="home-button">
                Back to Home
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default BookingSuccess;