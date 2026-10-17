import { Link, useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import { useCart, addToCart, updateQuantity } from "../utils/cart";
import { apiUrl } from "../utils/api";

interface Shop {
  id: string;
  name: string;
  description: string;
  distance: string;
  price: string;
  rating: string;
}

interface Category {
  id: string;
  shop_id: string;
  name: string;
  slug: string;
}

interface Product {
  id: string;
  shop_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  is_available: number;
  image_url: string | null;
}

function getProductIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("pen") || lower.includes("pencil") || lower.includes("marker") || lower.includes("highlighter")) return "🖊️";
  if (lower.includes("book") || lower.includes("notebook") || lower.includes("pad") || lower.includes("paper") || lower.includes("sheet")) return "📓";
  if (lower.includes("calculator")) return "🖩";
  if (lower.includes("scale") || lower.includes("ruler") || lower.includes("compass")) return "📐";
  if (lower.includes("folder") || lower.includes("file") || lower.includes("binder")) return "📁";
  if (lower.includes("scissors") || lower.includes("cutter") || lower.includes("tape") || lower.includes("glue")) return "✂️";
  return "📦";
}

function ShopDetails() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [shop, setShop] = useState<Shop | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string>("");

  const { cart } = useCart();

  useEffect(() => {
    const shopId = id || "1";

    Promise.all([
      fetch(apiUrl(`/api/shops/${shopId}`)).then((res) => res.json()),
      fetch(apiUrl(`/api/shops/${shopId}/categories`)).then((res) => res.json()).catch(() => []),
      fetch(apiUrl(`/api/shops/${shopId}/products?availableOnly=true`)).then((res) => res.json()).catch(() => []),
    ])
      .then(([shopData, catData, prodData]) => {
        setShop(shopData);
        if (Array.isArray(catData)) setCategories(catData);
        if (Array.isArray(prodData)) setProducts(prodData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch shop details:", err);
        setLoading(false);
      });
  }, [id]);

  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((curr) => (curr === msg ? "" : curr));
    }, 2800);
  };

  const handleAddToCart = (product: Product) => {
    if (!shop) return;
    const res = addToCart(
      shop.id,
      shop.name,
      {
        productId: product.id,
        title: product.name,
        price: product.price,
        maxStock: product.stock_quantity,
      },
      1
    );

    if (res.success) {
      showToast(`Added "${product.name}" to cart`);
    } else if (res.error) {
      alert(res.error);
    }
  };

  const filteredProducts = selectedCategory === "all"
    ? products
    : products.filter((p) => p.category_id === selectedCategory);

  if (loading) {
    return (
      <div className="app">
        <Navbar />
        <main style={{ textAlign: "center", padding: "4rem 1rem" }}>
          <p style={{ color: "#64748b", fontSize: "1.1rem" }}>Loading shop details & product catalogue...</p>
        </main>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="app">
        <Navbar />
        <main style={{ textAlign: "center", padding: "4rem 1rem" }}>
          <h2>Shop Not Found</h2>
          <p style={{ color: "#64748b" }}>We couldn't find the shop you are looking for.</p>
          <Link to="/shops" style={{ color: "#4f46e5", fontWeight: 600 }}>← Back to all shops</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Navbar />

      <main>
        {/* Toast Notification */}
        {notification && (
          <div
            style={{
              position: "fixed",
              bottom: "24px",
              right: "24px",
              backgroundColor: "#0f172a",
              color: "#ffffff",
              padding: "12px 20px",
              borderRadius: "8px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              gap: "10px",
              fontSize: "0.95rem",
              fontWeight: 500,
              animation: "fadeIn 0.2s ease-out",
            }}
          >
            <span>🛍️</span>
            <span>{notification}</span>
          </div>
        )}

        {/* Shop Header */}
        <section className="shop-details-header">
          <Link to="/shops" className="back-link">← Back to shops</Link>
          <div className="large-shop-icon">🏬</div>
          <p className="eyebrow">PRINTING & STATIONERY STORE</p>
          <h1>{shop.name}</h1>
          <p className="shop-description">{shop.description}</p>
          <div className="shop-details-meta">
            <span>⭐ {shop.rating} rating</span>
            <span>📍 {shop.distance} away</span>
            <span>🕒 Open today for self-pickup</span>
          </div>
        </section>

        {/* Printing Service Banner */}
        <section style={{ marginBottom: "2.5rem" }}>
          <div
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e0e7ff",
              borderRadius: "16px",
              padding: "1.5rem 2rem",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1.5rem",
              boxShadow: "0 4px 12px rgba(79, 70, 229, 0.05)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", maxWidth: "600px" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "12px",
                  backgroundColor: "#eef2ff",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "28px",
                  flexShrink: 0,
                }}
              >
                🖨️
              </div>
              <div>
                <h3 style={{ margin: "0 0 4px", fontSize: "1.2rem", color: "#0f172a" }}>
                  Document Printing & Binding
                </h3>
                <p style={{ margin: 0, fontSize: "0.95rem", color: "#64748b", lineHeight: 1.5 }}>
                  Fast laser printing (B&W or Full Colour, A4/A3, Single/Double sided) with optional spiral binding.
                </p>
              </div>
            </div>

            <button
              onClick={() => navigate("/print", { state: { shopId: shop.id, shopName: shop.name } })}
              style={{
                backgroundColor: "#4f46e5",
                color: "#ffffff",
                border: "none",
                padding: "0.75rem 1.5rem",
                borderRadius: "10px",
                fontWeight: 600,
                fontSize: "0.95rem",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Configure & Book Print →
            </button>
          </div>
        </section>

        {/* Product Catalogue Section */}
        <section className="section">
          <div className="section-header" style={{ marginBottom: "1.25rem" }}>
            <div>
              <h2 style={{ fontSize: "1.5rem", color: "#0f172a", margin: "0 0 4px" }}>Stationery & Supplies</h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
                Add items to your cart and collect them alongside your prints.
              </p>
            </div>
            <span style={{ fontSize: "0.9rem", color: "#64748b" }}>
              {filteredProducts.length} {filteredProducts.length === 1 ? "product" : "products"} available
            </span>
          </div>

          {/* Category Tabs */}
          <div
            style={{
              display: "flex",
              gap: "8px",
              overflowX: "auto",
              paddingBottom: "12px",
              marginBottom: "1.5rem",
            }}
          >
            <button
              onClick={() => setSelectedCategory("all")}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: selectedCategory === "all" ? "1px solid #4f46e5" : "1px solid #e2e8f0",
                backgroundColor: selectedCategory === "all" ? "#4f46e5" : "#ffffff",
                color: selectedCategory === "all" ? "#ffffff" : "#475569",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: selectedCategory === cat.id ? "1px solid #4f46e5" : "1px solid #e2e8f0",
                  backgroundColor: selectedCategory === cat.id ? "#4f46e5" : "#ffffff",
                  color: selectedCategory === cat.id ? "#ffffff" : "#475569",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          {filteredProducts.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "3rem 1rem",
                backgroundColor: "#ffffff",
                borderRadius: "12px",
                border: "1px dashed #cbd5e1",
                color: "#64748b",
              }}
            >
              <p style={{ margin: "0 0 0.5rem", fontSize: "1.1rem", fontWeight: 600, color: "#334155" }}>
                No stationery items in this category
              </p>
              <p style={{ margin: 0, fontSize: "0.9rem" }}>
                Select another category or book document printing above.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: "1.25rem",
              }}
            >
              {filteredProducts.map((product) => {
                const cartItem = cart.items.find((it) => it.productId === product.id);
                const quantityInCart = cartItem ? cartItem.quantity : 0;
                const isOutOfStock = product.stock_quantity <= 0;
                const isLowStock = product.stock_quantity > 0 && product.stock_quantity <= 5;

                return (
                  <div
                    key={product.id}
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "14px",
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      transition: "box-shadow 0.2s ease, border-color 0.2s ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                    }}
                  >
                    <div>
                      {/* Product Header / Stock Badge */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                        <div
                          style={{
                            width: "48px",
                            height: "48px",
                            borderRadius: "10px",
                            backgroundColor: "#f8fafc",
                            border: "1px solid #f1f5f9",
                            display: "grid",
                            placeItems: "center",
                            fontSize: "24px",
                          }}
                        >
                          {getProductIcon(product.name)}
                        </div>

                        {isOutOfStock ? (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: "#dc2626",
                              backgroundColor: "#fee2e2",
                              padding: "3px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            Out of Stock
                          </span>
                        ) : isLowStock ? (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: "#d97706",
                              backgroundColor: "#fef3c7",
                              padding: "3px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            Only {product.stock_quantity} left
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: "#16a34a",
                              backgroundColor: "#dcfce7",
                              padding: "3px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            In Stock
                          </span>
                        )}
                      </div>

                      <h3 style={{ margin: "0 0 6px", fontSize: "1.05rem", color: "#0f172a", fontWeight: 600 }}>
                        {product.name}
                      </h3>

                      {product.description && (
                        <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "#64748b", lineHeight: 1.4 }}>
                          {product.description}
                        </p>
                      )}
                    </div>

                    <div style={{ marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid #f1f5f9" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                        <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Self-Pickup Price</span>
                        <strong style={{ fontSize: "1.2rem", color: "#0f172a" }}>₹{product.price}</strong>
                      </div>

                      {/* Add to Cart / Quantity controls */}
                      {quantityInCart > 0 ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            backgroundColor: "#f8fafc",
                            border: "1px solid #cbd5e1",
                            borderRadius: "8px",
                            padding: "4px 8px",
                          }}
                        >
                          <button
                            onClick={() => updateQuantity(product.id, quantityInCart - 1)}
                            style={{
                              width: "30px",
                              height: "30px",
                              border: "none",
                              background: "#e2e8f0",
                              borderRadius: "6px",
                              fontWeight: 700,
                              fontSize: "1rem",
                              cursor: "pointer",
                              color: "#0f172a",
                            }}
                          >
                            -
                          </button>
                          <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "#0f172a" }}>
                            {quantityInCart} in cart
                          </span>
                          <button
                            onClick={() => updateQuantity(product.id, quantityInCart + 1)}
                            disabled={quantityInCart >= product.stock_quantity}
                            style={{
                              width: "30px",
                              height: "30px",
                              border: "none",
                              background: quantityInCart >= product.stock_quantity ? "#f1f5f9" : "#4f46e5",
                              color: quantityInCart >= product.stock_quantity ? "#94a3b8" : "#ffffff",
                              borderRadius: "6px",
                              fontWeight: 700,
                              fontSize: "1rem",
                              cursor: quantityInCart >= product.stock_quantity ? "not-allowed" : "pointer",
                            }}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAddToCart(product)}
                          disabled={isOutOfStock}
                          style={{
                            width: "100%",
                            padding: "0.65rem 1rem",
                            borderRadius: "8px",
                            border: "none",
                            backgroundColor: isOutOfStock ? "#e2e8f0" : "#4f46e5",
                            color: isOutOfStock ? "#94a3b8" : "#ffffff",
                            fontWeight: 600,
                            fontSize: "0.9rem",
                            cursor: isOutOfStock ? "not-allowed" : "pointer",
                            transition: "background-color 0.15s ease",
                          }}
                        >
                          {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default ShopDetails;