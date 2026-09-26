import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import { useNavigate } from "react-router-dom";

interface Shop {
  id: string;
  name: string;
  ownerId: string;
  subscriptionStatus: "ACTIVE" | "SUSPENDED" | "TRIAL";
}

function Admin() {
  const navigate = useNavigate();
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      navigate("/login");
      return;
    }
    const user = JSON.parse(userStr);
    if (user.role !== "ADMIN") {
      navigate("/");
      return;
    }

    fetchShops();
  }, [navigate]);

  const fetchShops = () => {
    fetch("/api/admin/shops")
      .then(res => res.json())
      .then(data => {
        setShops(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  const toggleSubscription = async (shopId: string, currentStatus: string) => {
    const newStatus = currentStatus === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    try {
      await fetch(`/api/admin/shops/${shopId}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      fetchShops();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="app">
      <Navbar />
      <main>
        <section className="shops-header">
          <p className="eyebrow">ADMIN PORTAL</p>
          <h1>Shop Subscriptions</h1>
          <p className="hero-description">Manage access for shopkeepers.</p>
        </section>

        <section className="section">
          {loading ? (
            <p>Loading shops...</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '2rem', background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
              <thead style={{ background: '#f3f4f6', textAlign: 'left' }}>
                <tr>
                  <th style={{ padding: '1rem' }}>Shop Name</th>
                  <th style={{ padding: '1rem' }}>Owner ID</th>
                  <th style={{ padding: '1rem' }}>Status</th>
                  <th style={{ padding: '1rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {shops.map(shop => (
                  <tr key={shop.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '1rem', fontWeight: 'bold' }}>{shop.name}</td>
                    <td style={{ padding: '1rem', color: '#6b7280' }}>{shop.ownerId}</td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{
                        padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                        backgroundColor: shop.subscriptionStatus === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                        color: shop.subscriptionStatus === 'ACTIVE' ? '#166534' : '#991b1b'
                      }}>
                        {shop.subscriptionStatus}
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <button 
                        onClick={() => toggleSubscription(shop.id, shop.subscriptionStatus)}
                        style={{
                          padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
                          backgroundColor: shop.subscriptionStatus === 'ACTIVE' ? '#fee2e2' : '#dcfce7',
                          color: shop.subscriptionStatus === 'ACTIVE' ? '#991b1b' : '#166534'
                        }}
                      >
                        {shop.subscriptionStatus === 'ACTIVE' ? 'Suspend' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}

export default Admin;
