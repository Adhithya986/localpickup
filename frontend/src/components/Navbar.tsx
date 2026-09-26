import { Link, useNavigate } from "react-router-dom";

function Navbar() {
  const navigate = useNavigate();
  const userStr = localStorage.getItem("user");
  const user = userStr ? JSON.parse(userStr) : null;

  const handleLogout = () => {
    localStorage.removeItem("user");
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
              Hi, {user.name} ({user.role})
            </span>
            {user.role === "ADMIN" && (
              <Link to="/admin" style={{ textDecoration: 'none', color: '#166534', fontWeight: 'bold' }}>Admin Panel</Link>
            )}
            {user.role === "SHOPKEEPER" && (
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
