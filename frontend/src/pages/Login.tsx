import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";

function Login() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  
  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("CUSTOMER");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";
    const body = isLogin ? { email, password } : { email, password, name, role };
    
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        setError(data.error || "Authentication failed");
        return;
      }
      
      localStorage.setItem("user", JSON.stringify(data));
      
      // Redirect based on role
      if (data.role === "ADMIN") navigate("/admin");
      else if (data.role === "SHOPKEEPER") navigate("/dashboard");
      else navigate("/");
    } catch (err) {
      setError("Network error occurred");
    }
  };

  return (
    <div className="app">
      <Navbar />
      <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem 1rem' }}>
        <div className="booking-card" style={{ maxWidth: '400px', width: '100%' }}>
          <h2>{isLogin ? "Welcome Back" : "Create Account"}</h2>
          {error && <div style={{ color: 'red', marginBottom: '1rem', padding: '0.5rem', background: '#fee2e2', borderRadius: '4px' }}>{error}</div>}
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {!isLogin && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Name</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #d1d5db' }} />
              </div>
            )}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #d1d5db' }} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #d1d5db' }} />
            </div>
            {!isLogin && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Role</label>
                <select value={role} onChange={e => setRole(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid #d1d5db' }}>
                  <option value="CUSTOMER">Customer</option>
                  <option value="SHOPKEEPER">Shopkeeper</option>
                </select>
              </div>
            )}
            
            <button type="submit" className="continue-button" style={{ marginTop: '1rem' }}>
              {isLogin ? "Login" : "Register"}
            </button>
            
            <p style={{ textAlign: 'center', marginTop: '1rem' }}>
              {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
              <button type="button" onClick={() => setIsLogin(!isLogin)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}>
                {isLogin ? "Register" : "Login"}
              </button>
            </p>
          </form>
          
          {isLogin && (
            <div style={{ marginTop: '2rem', padding: '1rem', background: '#f3f4f6', borderRadius: '4px', fontSize: '0.8rem' }}>
              <strong>Demo Accounts:</strong><br/>
              Admin: admin@localpickup.com / password123<br/>
              Shop: shop1@abc.com / password123<br/>
              Cust: customer@gmail.com / password123
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default Login;
