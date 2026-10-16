import { Link, useNavigate } from "react-router-dom";
import { getUser, clearAuth } from "../utils/api";

function Navbar() {
  const navigate = useNavigate();
  const user = getUser();

  const handleLogout = () => {
    clearAuth();
    navigate("/");
  };

  return (
    <header className="navbar">
      <Link to="/" className="logo">
        Local<span>Pickup</span>
      </Link>

      <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
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
  );
}

export default Navbar;
