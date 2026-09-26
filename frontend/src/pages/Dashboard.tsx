import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";

interface Order {
  id: string;
  shopName: string;
  fileName: string;
  filePath: string;
  pickupTime: string;
  total: number;
  status: "Pending" | "Ready" | "Completed";
  createdAt: string;
  paper: string;
  colour: string;
  sides: string;
  copies: number;
  binding: boolean;
  lamination: boolean;
}

function Dashboard() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [shop, setShop] = useState<any>(null);

  const fetchOrders = () => {
    fetch("/api/orders")
      .then((res) => res.json())
      .then((data) => {
        const sorted = data.sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(sorted);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch orders:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) {
      navigate("/login");
      return;
    }

    // Quick hack for demo: we know shop-1 owns shops. In a real app, we'd query /api/my-shop
    fetch("/api/shops/1").then(res => res.json()).then(data => setShop(data));

    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [navigate]);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await fetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      fetchOrders();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  if (shop && shop.subscriptionStatus === "SUSPENDED") {
    return (
      <div className="app">
        <Navbar />
        <main style={{ textAlign: 'center', padding: '4rem 1rem' }}>
          <h1>Account Suspended</h1>
          <p>Your shop's subscription is currently suspended. Please contact the administrator.</p>
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
          <h1>Order Dashboard</h1>
        </section>

        <section className="section">
          {loading ? (
            <p>Loading orders...</p>
          ) : orders.length === 0 ? (
            <p>No orders yet.</p>
          ) : (
            <div className="services-list" style={{ gridTemplateColumns: '1fr' }}>
              {orders.map((order) => (
                <div className="service-card" key={order.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                    <div>
                      <h3>Order {order.id} - {order.shopName}</h3>
                      <p><strong>Time:</strong> {order.pickupTime}</p>
                      <p><strong>Total:</strong> ₹{order.total}</p>
                    </div>
                    <div>
                      <span className={`status-badge ${order.status.toLowerCase()}`} style={{
                        padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', display: 'inline-block', marginBottom: '1rem',
                        backgroundColor: order.status === 'Pending' ? '#fef3c7' : order.status === 'Ready' ? '#dcfce7' : '#f3f4f6',
                        color: order.status === 'Pending' ? '#92400e' : order.status === 'Ready' ? '#166534' : '#374151'
                      }}>
                        {order.status}
                      </span>
                    </div>
                  </div>

                  <div style={{ background: '#f9fafb', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>Print Details:</h4>
                    <p style={{ margin: '0.2rem 0' }}>📄 <a href={`http://localhost:5000${order.filePath}`} target="_blank" rel="noreferrer">{order.fileName}</a></p>
                    <p style={{ margin: '0.2rem 0' }}>• {order.paper} Size, {order.colour === 'colour' ? 'Colour' : 'Black & White'}</p>
                    <p style={{ margin: '0.2rem 0' }}>• {order.sides === 'double' ? 'Double-sided' : 'Single-sided'}</p>
                    <p style={{ margin: '0.2rem 0' }}>• {order.copies} Copies</p>
                    {(order.binding || order.lamination) && (
                      <p style={{ margin: '0.2rem 0' }}>• Extras: {[order.binding && 'Binding', order.lamination && 'Lamination'].filter(Boolean).join(', ')}</p>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', width: '100%' }}>
                    {order.status === 'Pending' && (
                      <button className="shop-button" onClick={() => updateStatus(order.id, 'Ready')}>
                        Mark as Ready
                      </button>
                    )}
                    {order.status === 'Ready' && (
                      <button className="shop-button" style={{ background: '#166534' }} onClick={() => updateStatus(order.id, 'Completed')}>
                        Mark as Completed
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
