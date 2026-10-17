import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import { apiUrl } from "../utils/api";

interface Shop {
  id: string;
  name: string;
  description: string;
  distance: string;
  price: string;
  rating: string;
}

function Shops() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl("/api/shops"))
      .then((res) => res.json())
      .then((data) => {
        setShops(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch shops:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="app">
      <Navbar />

      <main>
        <section className="shops-header">
          <Link to="/" className="back-link">← Back to home</Link>
          <p className="eyebrow">DISCOVER</p>
          <h1>Find a shop</h1>
          <p className="hero-description">
            Choose a local shop, pre-book your order, and pick it up when it's ready.
          </p>
          <div className="search-box">
            <span>🔍</span>
            <input type="text" placeholder="Search shops or services..." />
          </div>
        </section>

        <section className="section">
          <div className="categories">
            <button className="category active">🖨️ Printing</button>
            <button className="category">📄 Documents</button>
            <button className="category">📚 Stationery</button>
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>Nearby shops</h2>
            <span className="shop-count">{shops.length} shops</span>
          </div>

          {loading ? (
            <p>Loading shops...</p>
          ) : (
            shops.map((shop) => (
              <div className="shop-card" key={shop.id}>
                <div className="shop-icon">🖨️</div>
                <div className="shop-info">
                  <h3>{shop.name}</h3>
                  <p>{shop.description}</p>
                  <div className="shop-meta">
                    <span>⭐ {shop.rating}</span>
                    <span>📍 {shop.distance}</span>
                    <span>{shop.price}</span>
                  </div>
                </div>
                <Link to={`/shops/${shop.id}`} className="shop-button">
                  View Shop
                </Link>
              </div>
            ))
          )}
        </section>
      </main>
    </div>
  );
}

export default Shops;