import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUser, clearAuth } from "../utils/api";
import { useCart } from "../utils/cart";
import { CartDrawer } from "./CartDrawer";
import { NotificationBell } from "./NotificationBell";

function Navbar() {
  const navigate = useNavigate();
  const user = getUser();
  const { summary } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);

  const handleLogout = () => {
    clearAuth();
    navigate("/");
  };

  return (
    <>
      <header className="navbar">
        <Link to="/" className="logo">
          Local<span>Pickup</span>
        </Link>

        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          {/* Cart Icon Button */}
          <button
            onClick={() => setIsCartOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              backgroundColor: summary.itemCount > 0 ? "#e0e7ff" : "#ffffff",
              color: summary.itemCount > 0 ? "#4338ca" : "#475569",
              fontWeight: 600,
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            <span>🛒</span>
            <span>Cart</span>
            {summary.itemCount > 0 && (
              <span
                style={{
                  backgroundColor: "#4f46e5",
                  color: "#ffffff",
                  fontSize: "0.75rem",
                  borderRadius: "999px",
                  padding: "1px 6px",
                  fontWeight: 700,
                }}
              >
                {summary.itemCount}
              </span>
            )}
          </button>

          {/* In-App Notifications */}
          <NotificationBell />

          {user ? (
            <>
              <span style={{ fontSize: "0.9rem", color: "#666" }}>
                Hi, {user.name} ({user.role === "SHOP_OWNER" ? "Shop Owner" : user.role === "SHOPKEEPER" ? "Shopkeeper" : user.role === "ADMIN" ? "Admin" : "Customer"})
              </span>
              {(user.role === "ADMIN" || user.role === "PLATFORM_ADMIN") && (
                <Link to="/admin" style={{ textDecoration: 'none', color: '#166534', fontWeight: 'bold' }}>Admin Panel</Link>
              )}
              {(user.role === "SHOPKEEPER" || user.role === "SHOP_OWNER") && (
                <Link to="/dashboard" style={{ textDecoration: 'none', color: '#166534', fontWeight: 'bold' }}>Dashboard</Link>
              )}
              {user.role === "CUSTOMER" && (
                <Link to="/bookings" style={{ textDecoration: 'none', color: '#166534', fontWeight: 'bold' }}>My Bookings</Link>
              )}
              <button className="login-button" onClick={handleLogout} style={{ background: '#dc2626' }}>
                Logout
              </button>
            </>
          ) : (
            <Link to="/login" className="login-button" style={{ textDecoration: 'none' }}>
              Login / Register
            </Link>
          )}
        </div>
      </header>

      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}

export default Navbar;
