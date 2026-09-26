import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

function Home() {
  return (
    <div className="app">
      <Navbar />
      <main>
        <section className="hero">
          <p className="eyebrow">LOCAL PICKUP</p>

          <h1>
            Book before you go.
            <br />
            Pick up when you arrive.
          </h1>

          <p className="hero-description">
            Pre-book printing and local services, skip the queue,
            and collect your order when it's ready.
          </p>

          <div className="search-box">
            <span>🔍</span>

            <input
              type="text"
              placeholder="Search shops or services..."
            />
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>Quick actions</h2>
          </div>

          <div className="quick-actions">
            <Link to="/shops" className="action-card">
              <div className="action-icon">🖨️</div>

              <div>
                <h3>Print a Document</h3>
                <p>Find a printing shop and pre-book</p>
              </div>
            </Link>

            <Link to="/shops" className="action-card">
              <div className="action-icon">🏪</div>

              <div>
                <h3>Browse Shops</h3>
                <p>Find local shops near you</p>
              </div>
            </Link>
          </div>
        </section>

        <section className="section">
          <div className="section-header">
            <h2>Nearby shops</h2>

            <Link to="/shops" className="view-all">
              View all
            </Link>
          </div>

          <div className="shop-card">
            <div className="shop-icon">🖨️</div>

            <div className="shop-info">
              <h3>ABC Digital Prints</h3>

              <p>
                Printing • Documents • Photocopy
              </p>

              <div className="shop-meta">
                <span>📍 0.8 km</span>
                <span>From ₹2</span>
              </div>
            </div>

            <Link to="/shops" className="shop-button">
              View Shop
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

export default Home;