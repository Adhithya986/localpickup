import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";

interface Order {
  id: string;
  shopName: string;
  fileName: string;
  pickupTime: string;
  total: number;
  status: "Pending" | "Ready" | "Completed";
  createdAt: string;
}

function Bookings() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders")
      .then((res) => res.json())
      .then((data) => {
        // Sort by newest first
        const sorted = data.sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(sorted);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch orders:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="app">
      <Navbar />

      <main>
        <section className="shops-header">
          <Link to="/" className="back-link">← Back to home</Link>
          <p className="eyebrow">YOUR ORDERS</p>
          <h1>My Bookings</h1>
        </section>

        <section className="section">
          {loading ? (
            <p>Loading your bookings...</p>
          ) : orders.length === 0 ? (
            <p>You have no bookings yet.</p>
          ) : (
            <div className="services-list">
              {orders.map((order) => (
                <div className="service-card" key={order.id} style={{ display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div className="service-icon">🖨️</div>
                    <span className={`status-badge ${order.status.toLowerCase()}`} style={{
                      padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                      backgroundColor: order.status === 'Pending' ? '#fef3c7' : order.status === 'Ready' ? '#dcfce7' : '#f3f4f6',
                      color: order.status === 'Pending' ? '#92400e' : order.status === 'Ready' ? '#166534' : '#374151'
                    }}>
                      {order.status}
                    </span>
                  </div>
                  
                  <div className="service-info" style={{ width: '100%' }}>
                    <h3>{order.shopName}</h3>
                    <p><strong>Order ID:</strong> {order.id}</p>
                    <p><strong>Document:</strong> {order.fileName}</p>
                    <p><strong>Pickup Time:</strong> {order.pickupTime}</p>
                    <strong style={{ marginTop: '0.5rem', display: 'block' }}>₹{order.total}</strong>
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

export default Bookings;
