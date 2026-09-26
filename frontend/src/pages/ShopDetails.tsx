import { Link, useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";

interface Shop {
  id: string;
  name: string;
  description: string;
  distance: string;
  price: string;
  rating: string;
}

const services = [
  {
    icon: "🖨️",
    name: "Document Printing",
    description: "A4 and A3 printing in black & white or colour.",
    price: "Starting from ₹2",
    booking: true,
  },
  {
    icon: "📚",
    name: "Binding",
    description: "Spiral binding for reports, assignments and documents.",
    price: "Starting from ₹20",
    booking: false,
  },
  {
    icon: "📄",
    name: "Photocopy",
    description: "Quick photocopying for your documents.",
    price: "Starting from ₹2",
    booking: false,
  },
];

function ShopDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/shops/${id || 1}`)
      .then((res) => res.json())
      .then((data) => {
        setShop(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch shop:", err);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div className="app"><p>Loading shop details...</p></div>;
  }

  if (!shop) {
    return <div className="app"><p>Shop not found</p></div>;
  }

  return (
    <div className="app">
      <header className="navbar">
        <Link to="/" className="logo">
          Local<span>Pickup</span>
        </Link>
        <button className="login-button">Login</button>
      </header>

      <main>
        <section className="shop-details-header">
          <Link to="/shops" className="back-link">← Back to shops</Link>
          <div className="large-shop-icon">🖨️</div>
          <p className="eyebrow">PRINTING SHOP</p>
          <h1>{shop.name}</h1>
          <p className="shop-description">{shop.description}</p>
          <div className="shop-details-meta">
            <span>⭐ {shop.rating}</span>
            <span>📍 {shop.distance} away</span>
            <span>🕐 Open today</span>
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>Services</h2>
          </div>

          <div className="services-list">
            {services.map((service) => (
              <div className="service-card" key={service.name}>
                <div className="service-icon">{service.icon}</div>
                <div className="service-info">
                  <h3>{service.name}</h3>
                  <p>{service.description}</p>
                  <strong>{service.price}</strong>
                </div>

                {service.booking ? (
                  <button
                    className="shop-button"
                    onClick={() => navigate("/print", { state: { shopId: shop.id, shopName: shop.name } })}
                  >
                    Book Now
                  </button>
                ) : (
                  <button className="shop-button secondary-button" disabled>
                    Coming Soon
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default ShopDetails;