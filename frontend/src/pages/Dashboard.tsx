import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import Navbar from "../components/Navbar";
import { authFetch, getToken, getUser, apiUrl } from "../utils/api";
import { OrderTimelineModal } from "../components/OrderTimelineModal";

interface OrderItem {
  id: string;
  productId?: string;
  itemType: "PRODUCT" | "PRINT_JOB";
  title: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface Order {
  id: string;
  shopName: string;
  fileName?: string;
  filePath?: string;
  pickupTime: string;
  total: number;
  pickupToken?: string;
  status: "Pending" | "Accepted" | "Preparing" | "Ready" | "Completed" | "Rejected" | "Cancelled";
  createdAt: string;
  items?: OrderItem[];
  paper?: string;
  colour?: string;
  sides?: string;
  copies?: number;
  binding?: boolean;
  lamination?: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
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
  created_at: string;
  updated_at: string;
}

function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"orders" | "inventory" | "subscription">("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [shop, setShop] = useState<any>(null);

  // Subscription state
  const [subData, setSubData] = useState<any>(null);
  const [loadingSub, setLoadingSub] = useState(false);
  const [requestingPlanId, setRequestingPlanId] = useState<string | null>(null);
  const [subRequestSuccess, setSubRequestSuccess] = useState<string>("");
  const [subRequestError, setSubRequestError] = useState<string>("");

  // Verification & Status state
  const [verifyCodeMap, setVerifyCodeMap] = useState<Record<string, string>>({});
  const [verifyErrorMap, setVerifyErrorMap] = useState<Record<string, string>>({});
  const [actionSuccess, setActionSuccess] = useState<string>("");
  const [timelineOrderId, setTimelineOrderId] = useState<string | null>(null);
  const [timelineOrderStatus, setTimelineOrderStatus] = useState<string>("");

  // Product Add/Edit Modal state
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [prodFormName, setProdFormName] = useState("");
  const [prodFormDesc, setProdFormDesc] = useState("");
  const [prodFormPrice, setProdFormPrice] = useState("");
  const [prodFormStock, setProdFormStock] = useState("");
  const [prodFormCategory, setProdFormCategory] = useState("");
  const [prodFormAvailable, setProdFormAvailable] = useState(true);
  const [prodFormError, setProdFormError] = useState("");
  const [prodFormSubmitting, setProdFormSubmitting] = useState(false);

  // Category Modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catError, setCatError] = useState("");

  const token = getToken();

  const fetchOrders = useCallback(() => {
    authFetch("/api/orders")
      .then((res) => {
        if (res.status === 401) {
          navigate("/login");
          return [];
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          const sorted = data.sort(
            (a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setOrders(sorted);
        }
        setLoadingOrders(false);
      })
      .catch((err) => {
        console.error("Failed to fetch orders:", err);
        setLoadingOrders(false);
      });
  }, [navigate]);

  const fetchProductsAndCategories = useCallback((shopId: string) => {
    setLoadingProducts(true);
    Promise.all([
      authFetch(`/api/shops/${shopId}/products`).then((r) => r.json()),
      authFetch(`/api/shops/${shopId}/categories`).then((r) => r.json()),
    ])
      .then(([prods, cats]) => {
        if (Array.isArray(prods)) setProducts(prods);
        if (Array.isArray(cats)) setCategories(cats);
        setLoadingProducts(false);
      })
      .catch((err) => {
        console.error("Failed to fetch products/categories:", err);
        setLoadingProducts(false);
      });
  }, []);

  const fetchSubscription = useCallback((shopId: string) => {
    setLoadingSub(true);
    authFetch(`/api/shops/${shopId}/subscription`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setSubData(data);
        }
        setLoadingSub(false);
      })
      .catch((err) => {
        console.error("Failed to fetch subscription:", err);
        setLoadingSub(false);
      });
  }, []);

  const handleRequestPlanChange = async (targetPlanId: string) => {
    if (!shop) return;
    setSubRequestError("");
    setSubRequestSuccess("");
    setRequestingPlanId(targetPlanId);
    try {
      const res = await authFetch(`/api/shops/${shop.id}/subscription/request-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedPlanId: targetPlanId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubRequestError(data.error || "Failed to submit plan change request");
        setRequestingPlanId(null);
        return;
      }
      setSubRequestSuccess(data.message || "Plan change request recorded for administrator review.");
      fetchSubscription(shop.id);
    } catch (err) {
      setSubRequestError("Network error while submitting plan change request");
    } finally {
      setRequestingPlanId(null);
    }
  };

  useEffect(() => {
    const user = getUser();
    if (!user || (user.role !== "SHOPKEEPER" && user.role !== "SHOP_OWNER" && user.role !== "ADMIN")) {
      navigate("/login");
      return;
    }

    // Load authenticated shopkeeper's shop
    authFetch("/api/shops/mine")
      .then((res) => res.json())
      .then((data) => {
        if (!data.error) {
          setShop(data);
          fetchProductsAndCategories(data.id);
          fetchSubscription(data.id);
        }
      })
      .catch(() => {});

    fetchOrders();
    const interval = setInterval(fetchOrders, 10000);
    return () => clearInterval(interval);
  }, [navigate, fetchOrders, fetchProductsAndCategories, fetchSubscription]);

  const updateStatus = async (id: string, newStatus: string) => {
    setActionSuccess("");
    try {
      const res = await authFetch(`/api/orders/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to update status");
        return;
      }
      setActionSuccess(`Order ${id} marked as ${newStatus}`);
      fetchOrders();
    } catch (err) {
      console.error("Failed to update status", err);
    }
  };

  const verifyPickup = async (orderId: string) => {
    const code = verifyCodeMap[orderId] || "";
    if (!code.trim()) {
      setVerifyErrorMap((prev) => ({ ...prev, [orderId]: "Please enter pickup code" }));
      return;
    }

    try {
      const res = await authFetch(`/api/orders/${orderId}/verify-pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVerifyErrorMap((prev) => ({ ...prev, [orderId]: data.error || "Verification failed" }));
        return;
      }

      setVerifyErrorMap((prev) => ({ ...prev, [orderId]: "" }));
      setActionSuccess(`Order ${orderId} verified and completed!`);
      fetchOrders();
    } catch (err) {
      setVerifyErrorMap((prev) => ({ ...prev, [orderId]: "Network error verifying pickup" }));
    }
  };

  // Product Management Handlers
  const openAddProductModal = () => {
    setEditingProduct(null);
    setProdFormName("");
    setProdFormDesc("");
    setProdFormPrice("");
    setProdFormStock("");
    setProdFormCategory(categories[0]?.id || "");
    setProdFormAvailable(true);
    setProdFormError("");
    setShowProductModal(true);
  };

  const openEditProductModal = (prod: Product) => {
    setEditingProduct(prod);
    setProdFormName(prod.name);
    setProdFormDesc(prod.description || "");
    setProdFormPrice(prod.price.toString());
    setProdFormStock(prod.stock_quantity.toString());
    setProdFormCategory(prod.category_id || "");
    setProdFormAvailable(Boolean(prod.is_available));
    setProdFormError("");
    setShowProductModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop) return;
    setProdFormError("");

    if (!prodFormName.trim()) {
      setProdFormError("Product name is required.");
      return;
    }
    const priceNum = parseFloat(prodFormPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      setProdFormError("Price must be a valid non-negative number.");
      return;
    }
    const stockNum = parseInt(prodFormStock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setProdFormError("Stock quantity must be a valid non-negative integer.");
      return;
    }

    setProdFormSubmitting(true);
    try {
      const payload = {
        name: prodFormName.trim(),
        description: prodFormDesc.trim() || null,
        price: priceNum,
        stockQuantity: stockNum,
        categoryId: prodFormCategory || null,
        isAvailable: prodFormAvailable,
      };

      const endpoint = editingProduct
        ? `/api/shops/${shop.id}/products/${editingProduct.id}`
        : `/api/shops/${shop.id}/products`;
      const method = editingProduct ? "PUT" : "POST";

      const res = await authFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save product");
      }

      setShowProductModal(false);
      setActionSuccess(
        editingProduct ? `Updated "${payload.name}" successfully!` : `Created "${payload.name}" successfully!`
      );
      fetchProductsAndCategories(shop.id);
    } catch (err: any) {
      setProdFormError(err.message || "Failed to save product");
    } finally {
      setProdFormSubmitting(false);
    }
  };

  const handleDeleteProduct = async (prod: Product) => {
    if (!shop) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete "${prod.name}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const res = await authFetch(`/api/shops/${shop.id}/products/${prod.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to delete product");
        return;
      }
      setActionSuccess(`Deleted "${prod.name}" successfully`);
      fetchProductsAndCategories(shop.id);
    } catch (err) {
      alert("Error deleting product");
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shop || !newCatName.trim()) return;
    setCatError("");

    try {
      const res = await authFetch(`/api/shops/${shop.id}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCatError(data.error || "Failed to create category");
        return;
      }
      setShowCategoryModal(false);
      setNewCatName("");
      setActionSuccess(`Created category "${data.name}"`);
      fetchProductsAndCategories(shop.id);
    } catch (err) {
      setCatError("Error creating category");
    }
  };

  const lowStockCount = products.filter((p) => p.stock_quantity <= 5).length;
  const totalStockUnits = products.reduce((acc, p) => acc + p.stock_quantity, 0);

  return (
    <div className="app">
      <Navbar />

      <main>
        {/* Header */}
        <section className="shops-header">
          <p className="eyebrow">SHOPKEEPER PORTAL</p>
          <h1>{shop ? shop.name : "Shop Management Dashboard"}</h1>
          <p className="hero-description">
            Manage incoming orders, verify customer pickups, maintain your catalogue, and manage subscription limits.
          </p>

          {/* Account Status Warnings */}
          {shop && (shop.subscriptionStatus === "SUSPENDED" || shop.subscriptionStatus === "EXPIRED" || subData?.subscription?.status === "SUSPENDED" || subData?.subscription?.status === "EXPIRED") && (
            <div
              style={{
                backgroundColor: (shop.subscriptionStatus === "SUSPENDED" || subData?.subscription?.status === "SUSPENDED") ? "#fef2f2" : "#fffbeb",
                border: `1px solid ${(shop.subscriptionStatus === "SUSPENDED" || subData?.subscription?.status === "SUSPENDED") ? "#fecaca" : "#fef08a"}`,
                borderRadius: "10px",
                padding: "1rem 1.25rem",
                marginTop: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div>
                <h4 style={{ margin: "0 0 4px", color: (shop.subscriptionStatus === "SUSPENDED" || subData?.subscription?.status === "SUSPENDED") ? "#991b1b" : "#92400e", fontSize: "0.95rem" }}>
                  {(shop.subscriptionStatus === "SUSPENDED" || subData?.subscription?.status === "SUSPENDED") ? "⛔ Shop Subscription Suspended" : "⚠️ Shop Subscription Expired"}
                </h4>
                <p style={{ margin: 0, fontSize: "0.85rem", color: (shop.subscriptionStatus === "SUSPENDED" || subData?.subscription?.status === "SUSPENDED") ? "#b91c1c" : "#b45309" }}>
                  Customer order placement is paused while in this status. Existing orders remain accessible for pickup fulfillment.
                </p>
              </div>
              <button
                onClick={() => setActiveTab("subscription")}
                style={{
                  padding: "0.5rem 1rem",
                  backgroundColor: (shop.subscriptionStatus === "SUSPENDED" || subData?.subscription?.status === "SUSPENDED") ? "#dc2626" : "#d97706",
                  color: "#fff",
                  border: "none",
                  borderRadius: "6px",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: "pointer",
                }}
              >
                Manage Subscription & Billing
              </button>
            </div>
          )}

          {actionSuccess && (
            <div
              style={{
                padding: "0.85rem 1.25rem",
                background: "#dcfce7",
                color: "#166534",
                border: "1px solid #bbf7d0",
                borderRadius: "8px",
                marginTop: "1rem",
                fontWeight: 600,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>✓ {actionSuccess}</span>
              <button
                onClick={() => setActionSuccess("")}
                style={{ background: "none", border: "none", color: "#166534", cursor: "pointer", fontWeight: 700 }}
              >
                ✕
              </button>
            </div>
          )}
        </section>

        {/* Navigation Tabs */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            borderBottom: "1px solid #e2e8f0",
            marginBottom: "2rem",
            paddingBottom: "4px",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => setActiveTab("orders")}
            style={{
              padding: "10px 20px",
              border: "none",
              borderBottom: activeTab === "orders" ? "3px solid #4f46e5" : "3px solid transparent",
              background: "none",
              color: activeTab === "orders" ? "#4f46e5" : "#64748b",
              fontWeight: 700,
              fontSize: "1rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            📋 Orders & Pickups ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab("inventory")}
            style={{
              padding: "10px 20px",
              border: "none",
              borderBottom: activeTab === "inventory" ? "3px solid #4f46e5" : "3px solid transparent",
              background: "none",
              color: activeTab === "inventory" ? "#4f46e5" : "#64748b",
              fontWeight: 700,
              fontSize: "1rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>📦 Products & Inventory ({products.length})</span>
            {lowStockCount > 0 && (
              <span
                style={{
                  fontSize: "0.75rem",
                  backgroundColor: "#fef3c7",
                  color: "#d97706",
                  padding: "2px 7px",
                  borderRadius: "999px",
                  fontWeight: 700,
                }}
              >
                {lowStockCount} low stock
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab("subscription");
              if (shop) fetchSubscription(shop.id);
            }}
            style={{
              padding: "10px 20px",
              border: "none",
              borderBottom: activeTab === "subscription" ? "3px solid #4f46e5" : "3px solid transparent",
              background: "none",
              color: activeTab === "subscription" ? "#4f46e5" : "#64748b",
              fontWeight: 700,
              fontSize: "1rem",
              cursor: "pointer",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>💳 Subscription & Plan</span>
            {subData?.subscription?.status && (
              <span
                style={{
                  fontSize: "0.75rem",
                  backgroundColor:
                    subData.subscription.status === "ACTIVE" ? "#dcfce7" :
                    subData.subscription.status === "TRIAL" ? "#e0e7ff" :
                    subData.subscription.status === "PAST_DUE" ? "#fef3c7" : "#fee2e2",
                  color:
                    subData.subscription.status === "ACTIVE" ? "#166534" :
                    subData.subscription.status === "TRIAL" ? "#3730a3" :
                    subData.subscription.status === "PAST_DUE" ? "#92400e" : "#991b1b",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  fontWeight: 700,
                }}
              >
                {subData.subscription.status}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: ORDERS & PICKUP VERIFICATION */}
        {activeTab === "orders" && (
          <section className="section">
            {loadingOrders ? (
              <p style={{ color: "#64748b" }}>Loading orders...</p>
            ) : orders.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "3rem 1rem",
                  backgroundColor: "#ffffff",
                  borderRadius: "12px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📭</div>
                <h3 style={{ margin: "0 0 0.5rem", color: "#1e293b" }}>No orders yet</h3>
                <p style={{ color: "#64748b", margin: 0 }}>
                  Incoming customer printing bookings and stationery orders will appear here automatically.
                </p>
              </div>
            ) : (
              <div className="services-list" style={{ gridTemplateColumns: "1fr" }}>
                {orders.map((order) => {
                  const docUrl = apiUrl(`/api/documents/${order.id}${token ? `?token=${encodeURIComponent(token)}` : ""}`);
                  const hasPrintJob = Boolean(order.fileName);
                  const stationeryItems = order.items
                    ? order.items.filter((it) => it.itemType === "PRODUCT")
                    : [];

                  return (
                    <div
                      className="service-card"
                      key={order.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        backgroundColor: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "12px",
                        padding: "1.5rem",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          width: "100%",
                          flexWrap: "wrap",
                          gap: "1rem",
                        }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <h3 style={{ margin: 0, fontSize: "1.2rem", color: "#0f172a" }}>Order #{order.id}</h3>
                            <span
                              style={{
                                fontSize: "0.8rem",
                                color: "#64748b",
                                background: "#f1f5f9",
                                padding: "2px 8px",
                                borderRadius: "4px",
                              }}
                            >
                              {new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <p style={{ margin: "6px 0 2px", color: "#334155" }}>
                            <strong>Pickup Time Slot:</strong>{" "}
                            <span style={{ color: "#4f46e5", fontWeight: 700 }}>{order.pickupTime}</span>
                          </p>
                          <p style={{ margin: "2px 0", color: "#334155" }}>
                            <strong>Order Total:</strong> ₹{order.total}
                          </p>
                          {order.verifiedAt && (
                            <p style={{ fontSize: "0.85rem", color: "#166534", margin: "4px 0 0" }}>
                              ✓ Collected & Verified on {new Date(order.verifiedAt).toLocaleTimeString()}
                            </p>
                          )}
                        </div>

                        <div>
                          <span
                            className={`status-badge ${order.status.toLowerCase()}`}
                            style={{
                              padding: "6px 14px",
                              borderRadius: "6px",
                              fontWeight: "bold",
                              display: "inline-block",
                              backgroundColor:
                                order.status === "Pending"
                                  ? "#fef3c7"
                                  : order.status === "Ready"
                                  ? "#dcfce7"
                                  : order.status === "Completed"
                                  ? "#f1f5f9"
                                  : order.status === "Cancelled"
                                  ? "#fee2e2"
                                  : "#e0e7ff",
                              color:
                                order.status === "Pending"
                                  ? "#92400e"
                                  : order.status === "Ready"
                                  ? "#166534"
                                  : order.status === "Completed"
                                  ? "#475569"
                                  : order.status === "Cancelled"
                                  ? "#991b1b"
                                  : "#3730a3",
                            }}
                          >
                            {order.status === "Ready" ? "Ready for Pickup" : order.status}
                          </span>
                        </div>
                      </div>

                      {/* Stationery Items Breakdown */}
                      {stationeryItems.length > 0 && (
                        <div
                          style={{
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                            padding: "1rem",
                            borderRadius: "8px",
                            margin: "1rem 0 0.5rem",
                          }}
                        >
                          <h4 style={{ margin: "0 0 0.5rem 0", color: "#334155", fontSize: "0.95rem" }}>
                            📦 Stationery Products ({stationeryItems.reduce((acc, it) => acc + it.quantity, 0)} items):
                          </h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {stationeryItems.map((item, idx) => (
                              <div
                                key={idx}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  fontSize: "0.9rem",
                                  color: "#0f172a",
                                }}
                              >
                                <span>
                                  <strong>{item.title}</strong> × {item.quantity}
                                </span>
                                <span style={{ color: "#64748b" }}>
                                  ₹{item.unitPrice} each = <strong>₹{item.subtotal}</strong>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Print Document Details */}
                      {hasPrintJob && (
                        <div
                          style={{
                            background: "#f0fdf4",
                            border: "1px solid #dcfce7",
                            padding: "1rem",
                            borderRadius: "8px",
                            margin: "0.5rem 0 1rem",
                          }}
                        >
                          <h4 style={{ margin: "0 0 0.5rem 0", color: "#166534", fontSize: "0.95rem" }}>
                            📄 Print Job Specifications:
                          </h4>
                          <p style={{ margin: "0.2rem 0" }}>
                            <a
                              href={docUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#2563eb", fontWeight: "bold", textDecoration: "underline" }}
                            >
                              📥 {order.fileName} (Download / View File)
                            </a>
                          </p>
                          <p style={{ margin: "0.2rem 0", fontSize: "0.875rem", color: "#374151" }}>
                            • {order.paper} Size, {order.colour === "colour" ? "Full Colour" : "Black & White"} •{" "}
                            {order.sides === "double" ? "Double-sided" : "Single-sided"} • {order.copies} Copies
                          </p>
                          {(order.binding || order.lamination) && (
                            <p style={{ margin: "0.2rem 0", fontSize: "0.875rem", color: "#374151" }}>
                              • Extra Options:{" "}
                              {[order.binding && "Spiral Binding", order.lamination && "Lamination"]
                                .filter(Boolean)
                                .join(", ")}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Action Bar */}
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "1rem",
                          justifyContent: "space-between",
                          alignItems: "center",
                          width: "100%",
                          marginTop: "0.75rem",
                          paddingTop: "0.75rem",
                          borderTop: "1px solid #f1f5f9",
                        }}
                      >
                        {/* Left: Timeline button */}
                        <button
                          onClick={() => {
                            setTimelineOrderId(order.id);
                            setTimelineOrderStatus(order.status);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            backgroundColor: "#f8fafc",
                            color: "#475569",
                            border: "1px solid #cbd5e1",
                            borderRadius: "6px",
                            padding: "6px 12px",
                            fontSize: "0.825rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <span>🕒</span>
                          <span>Timeline</span>
                        </button>

                        {/* Right: Lifecycle Actions */}
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                          {order.status === "Pending" && (
                            <>
                              <button
                                style={{
                                  backgroundColor: "#4f46e5",
                                  color: "#ffffff",
                                  border: "none",
                                  padding: "7px 14px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  cursor: "pointer",
                                }}
                                onClick={() => updateStatus(order.id, "Accepted")}
                              >
                                Accept Order
                              </button>
                              <button
                                style={{
                                  backgroundColor: "#166534",
                                  color: "#ffffff",
                                  border: "none",
                                  padding: "7px 14px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  cursor: "pointer",
                                }}
                                onClick={() => updateStatus(order.id, "Ready")}
                              >
                                Mark Ready
                              </button>
                              <button
                                style={{
                                  backgroundColor: "#fee2e2",
                                  color: "#b91c1c",
                                  border: "1px solid #fecaca",
                                  padding: "7px 12px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  cursor: "pointer",
                                }}
                                onClick={() => updateStatus(order.id, "Cancelled")}
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {order.status === "Accepted" && (
                            <>
                              <button
                                style={{
                                  backgroundColor: "#7c3aed",
                                  color: "#ffffff",
                                  border: "none",
                                  padding: "7px 14px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  cursor: "pointer",
                                }}
                                onClick={() => updateStatus(order.id, "Preparing")}
                              >
                                🖨️ Start Preparing
                              </button>
                              <button
                                style={{
                                  backgroundColor: "#166534",
                                  color: "#ffffff",
                                  border: "none",
                                  padding: "7px 14px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  cursor: "pointer",
                                }}
                                onClick={() => updateStatus(order.id, "Ready")}
                              >
                                Mark Ready
                              </button>
                              <button
                                style={{
                                  backgroundColor: "#fee2e2",
                                  color: "#b91c1c",
                                  border: "1px solid #fecaca",
                                  padding: "7px 12px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  cursor: "pointer",
                                }}
                                onClick={() => updateStatus(order.id, "Cancelled")}
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {order.status === "Preparing" && (
                            <>
                              <button
                                style={{
                                  backgroundColor: "#166534",
                                  color: "#ffffff",
                                  border: "none",
                                  padding: "7px 14px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  cursor: "pointer",
                                }}
                                onClick={() => updateStatus(order.id, "Ready")}
                              >
                                🔔 Mark Ready for Pickup
                              </button>
                              <button
                                style={{
                                  backgroundColor: "#fee2e2",
                                  color: "#b91c1c",
                                  border: "1px solid #fecaca",
                                  padding: "7px 12px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  cursor: "pointer",
                                }}
                                onClick={() => updateStatus(order.id, "Cancelled")}
                              >
                                Cancel
                              </button>
                            </>
                          )}

                          {order.status === "Ready" && (
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                              <input
                                type="text"
                                placeholder="Enter Customer Pickup Code"
                                value={verifyCodeMap[order.id] || ""}
                                onChange={(e) =>
                                  setVerifyCodeMap({ ...verifyCodeMap, [order.id]: e.target.value.toUpperCase() })
                                }
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  borderRadius: "6px",
                                  border: "1px solid #cbd5e1",
                                  fontSize: "0.875rem",
                                  width: "210px",
                                  textTransform: "uppercase",
                                  letterSpacing: "1px",
                                }}
                              />
                              <button
                                className="shop-button"
                                style={{ background: "#166534", padding: "7px 14px", fontSize: "0.85rem" }}
                                onClick={() => verifyPickup(order.id)}
                              >
                                Verify & Hand Over
                              </button>
                              <button
                                style={{
                                  backgroundColor: "#fee2e2",
                                  color: "#b91c1c",
                                  border: "1px solid #fecaca",
                                  padding: "7px 12px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  cursor: "pointer",
                                }}
                                onClick={() => updateStatus(order.id, "Cancelled")}
                              >
                                Cancel
                              </button>
                              {verifyErrorMap[order.id] && (
                                <span style={{ color: "#dc2626", fontSize: "0.85rem", marginLeft: "0.5rem", width: "100%" }}>
                                  {verifyErrorMap[order.id]}
                                </span>
                              )}
                            </div>
                          )}

                          {order.status === "Completed" && (
                            <span style={{ color: "#166534", fontWeight: 700, fontSize: "0.875rem" }}>
                              ✓ Collected & Verified
                            </span>
                          )}

                          {(order.status === "Cancelled" || order.status === "Rejected") && (
                            <span style={{ color: "#991b1b", fontWeight: 600, fontSize: "0.875rem" }}>
                              🛑 Order {order.status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: PRODUCTS & INVENTORY MANAGEMENT */}
        {activeTab === "inventory" && (
          <section className="section">
            {/* Overview Stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
                marginBottom: "2rem",
              }}
            >
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "1.25rem",
                }}
              >
                <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>TOTAL CATALOGUE PRODUCTS</span>
                <h3 style={{ margin: "8px 0 0", fontSize: "1.75rem", color: "#0f172a" }}>{products.length}</h3>
              </div>
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "1.25rem",
                }}
              >
                <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>TOTAL INVENTORY UNITS</span>
                <h3 style={{ margin: "8px 0 0", fontSize: "1.75rem", color: "#4f46e5" }}>{totalStockUnits}</h3>
              </div>
              <div
                style={{
                  backgroundColor: lowStockCount > 0 ? "#fef3c7" : "#ffffff",
                  border: lowStockCount > 0 ? "1px solid #fde68a" : "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "1.25rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.85rem",
                    color: lowStockCount > 0 ? "#92400e" : "#64748b",
                    fontWeight: 600,
                  }}
                >
                  LOW STOCK ALERTS (≤ 5 units)
                </span>
                <h3
                  style={{
                    margin: "8px 0 0",
                    fontSize: "1.75rem",
                    color: lowStockCount > 0 ? "#b45309" : "#0f172a",
                  }}
                >
                  {lowStockCount}
                </h3>
              </div>
            </div>

            {/* Actions Bar */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <h2 style={{ margin: 0, fontSize: "1.3rem", color: "#0f172a" }}>Products List</h2>
                <span style={{ color: "#64748b", fontSize: "0.9rem" }}>
                  ({categories.length} categories)
                </span>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  onClick={() => setShowCategoryModal(true)}
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #cbd5e1",
                    color: "#334155",
                    padding: "0.6rem 1rem",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  + Add Category
                </button>
                <button
                  onClick={openAddProductModal}
                  style={{
                    backgroundColor: "#4f46e5",
                    border: "none",
                    color: "#ffffff",
                    padding: "0.6rem 1.25rem",
                    borderRadius: "8px",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    cursor: "pointer",
                  }}
                >
                  + Add Product
                </button>
              </div>
            </div>

            {/* Products Table */}
            {loadingProducts ? (
              <p style={{ color: "#64748b" }}>Loading products...</p>
            ) : products.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "3rem 1rem",
                  backgroundColor: "#ffffff",
                  borderRadius: "12px",
                  border: "1px dashed #cbd5e1",
                }}
              >
                <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📦</div>
                <h3 style={{ margin: "0 0 0.5rem", color: "#1e293b" }}>Your catalogue is empty</h3>
                <p style={{ color: "#64748b", maxWidth: "400px", margin: "0 auto 1.5rem" }}>
                  Add stationery items (pens, notebooks, folders, calculators) for customers to pre-order alongside their document prints.
                </p>
                <button
                  onClick={openAddProductModal}
                  style={{
                    backgroundColor: "#4f46e5",
                    color: "#fff",
                    border: "none",
                    padding: "0.75rem 1.5rem",
                    borderRadius: "8px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Add Your First Product
                </button>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  overflowX: "auto",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ padding: "12px 16px", color: "#475569", fontWeight: 600 }}>Product Name</th>
                      <th style={{ padding: "12px 16px", color: "#475569", fontWeight: 600 }}>Category</th>
                      <th style={{ padding: "12px 16px", color: "#475569", fontWeight: 600 }}>Price</th>
                      <th style={{ padding: "12px 16px", color: "#475569", fontWeight: 600 }}>Stock Quantity</th>
                      <th style={{ padding: "12px 16px", color: "#475569", fontWeight: 600 }}>Status</th>
                      <th style={{ padding: "12px 16px", color: "#475569", fontWeight: 600, textAlign: "right" }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((prod) => {
                      const cat = categories.find((c) => c.id === prod.category_id);
                      const isLow = prod.stock_quantity <= 5 && prod.stock_quantity > 0;
                      const isZero = prod.stock_quantity === 0;

                      return (
                        <tr key={prod.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ fontWeight: 600, color: "#0f172a" }}>{prod.name}</div>
                            {prod.description && (
                              <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "2px" }}>
                                {prod.description}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "14px 16px", color: "#475569" }}>
                            {cat ? cat.name : <span style={{ color: "#94a3b8" }}>Uncategorized</span>}
                          </td>
                          <td style={{ padding: "14px 16px", fontWeight: 600, color: "#0f172a" }}>
                            ₹{prod.price}
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                fontWeight: 700,
                                color: isZero ? "#dc2626" : isLow ? "#d97706" : "#0f172a",
                              }}
                            >
                              {prod.stock_quantity}
                              {isZero ? (
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    backgroundColor: "#fee2e2",
                                    color: "#dc2626",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                  }}
                                >
                                  OUT OF STOCK
                                </span>
                              ) : isLow ? (
                                <span
                                  style={{
                                    fontSize: "0.7rem",
                                    backgroundColor: "#fef3c7",
                                    color: "#d97706",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                  }}
                                >
                                  LOW STOCK
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td style={{ padding: "14px 16px" }}>
                            {prod.is_available ? (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  backgroundColor: "#dcfce7",
                                  color: "#16a34a",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                }}
                              >
                                Active
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  backgroundColor: "#f1f5f9",
                                  color: "#64748b",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontWeight: 600,
                                }}
                              >
                                Inactive
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "14px 16px", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                              <button
                                onClick={() => openEditProductModal(prod)}
                                style={{
                                  backgroundColor: "#f8fafc",
                                  border: "1px solid #cbd5e1",
                                  color: "#334155",
                                  padding: "4px 10px",
                                  borderRadius: "6px",
                                  fontSize: "0.8rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(prod)}
                                style={{
                                  backgroundColor: "#fff",
                                  border: "1px solid #fecaca",
                                  color: "#dc2626",
                                  padding: "4px 10px",
                                  borderRadius: "6px",
                                  fontSize: "0.8rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 3: SUBSCRIPTION & BILLING */}
        {activeTab === "subscription" && (
          <section className="section">
            {loadingSub ? (
              <p style={{ color: "#64748b" }}>Loading subscription details...</p>
            ) : !subData ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem", backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <p style={{ color: "#64748b" }}>No subscription record found for this shop.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
                {subRequestSuccess && (
                  <div style={{ padding: "0.85rem 1.25rem", background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: "8px", fontWeight: 600 }}>
                    ✓ {subRequestSuccess}
                  </div>
                )}
                {subRequestError && (
                  <div style={{ padding: "0.85rem 1.25rem", background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: "8px", fontWeight: 600 }}>
                    ✕ {subRequestError}
                  </div>
                )}

                {/* 1. CURRENT SUBSCRIPTION OVERVIEW CARD */}
                <div style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "12px",
                  padding: "1.75rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                        <h2 style={{ margin: 0, fontSize: "1.5rem", color: "#0f172a" }}>
                          {subData.plan?.name || "Free Trial"}
                        </h2>
                        <span style={{
                          fontSize: "0.8rem",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          backgroundColor:
                            subData.subscription?.status === "ACTIVE" ? "#dcfce7" :
                            subData.subscription?.status === "TRIAL" ? "#e0e7ff" :
                            subData.subscription?.status === "PAST_DUE" ? "#fef3c7" : "#fee2e2",
                          color:
                            subData.subscription?.status === "ACTIVE" ? "#166534" :
                            subData.subscription?.status === "TRIAL" ? "#3730a3" :
                            subData.subscription?.status === "PAST_DUE" ? "#92400e" : "#991b1b",
                        }}>
                          {subData.subscription?.status || "UNKNOWN"}
                        </span>
                      </div>
                      <p style={{ margin: 0, color: "#64748b", fontSize: "0.95rem" }}>
                        Monthly Rate: <strong style={{ color: "#0f172a" }}>₹{subData.plan?.monthly_price ?? 0} / month</strong>
                      </p>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      {subData.subscription?.status === "TRIAL" && subData.subscription.trial_ends_at && (
                        <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", padding: "8px 14px", borderRadius: "8px" }}>
                          <div style={{ fontSize: "0.75rem", color: "#4f46e5", fontWeight: 600 }}>TRIAL PERIOD</div>
                          <div style={{ fontSize: "0.9rem", color: "#1e1b4b", fontWeight: 700 }}>
                            Ends on {new Date(subData.subscription.trial_ends_at).toLocaleDateString()}
                          </div>
                        </div>
                      )}
                      {subData.subscription?.status === "ACTIVE" && subData.subscription.current_period_end && (
                        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "8px 14px", borderRadius: "8px" }}>
                          <div style={{ fontSize: "0.75rem", color: "#166534", fontWeight: 600 }}>BILLING CYCLE</div>
                          <div style={{ fontSize: "0.9rem", color: "#14532d", fontWeight: 700 }}>
                            Renews on {new Date(subData.subscription.current_period_end).toLocaleDateString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pending plan change banner */}
                  {subData.subscription?.requested_plan_id && (
                    <div style={{
                      marginTop: "1.25rem",
                      padding: "1rem",
                      backgroundColor: "#f0f9ff",
                      border: "1px solid #bae6fd",
                      borderRadius: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px"
                    }}>
                      <span style={{ fontSize: "1.25rem" }}>⏳</span>
                      <div>
                        <strong style={{ color: "#0369a1", fontSize: "0.9rem" }}>Upgrade/Change Request Under Review:</strong>
                        <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "#0c4a6e" }}>
                          You have requested a plan change to <strong>{subData.plans?.find((p: any) => p.id === subData.subscription.requested_plan_id)?.name || subData.subscription.requested_plan_id}</strong>.
                          The platform administrator will review and activate your requested tier.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. PLAN LIMITS & LIVE USAGE METERS */}
                <div>
                  <h3 style={{ margin: "0 0 1rem", fontSize: "1.2rem", color: "#0f172a" }}>Resource Quotas & Entitlements</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                    {/* Staff Quota Meter */}
                    <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "1.25rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b" }}>STAFF ACCOUNTS</span>
                        <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0f172a" }}>
                          {subData.entitlements?.currentStaffCount ?? 0} / {subData.entitlements?.maxStaff ?? 0}
                        </span>
                      </div>
                      <div style={{ height: "8px", backgroundColor: "#f1f5f9", borderRadius: "999px", overflow: "hidden", marginBottom: "8px" }}>
                        <div style={{
                          height: "100%",
                          width: `${Math.min(100, ((subData.entitlements?.currentStaffCount ?? 0) / (subData.entitlements?.maxStaff || 1)) * 100)}%`,
                          backgroundColor: (subData.entitlements?.currentStaffCount ?? 0) >= (subData.entitlements?.maxStaff ?? 0) ? "#ef4444" : "#4f46e5",
                          borderRadius: "999px"
                        }} />
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {subData.entitlements?.canAddStaff ? "Seats available for additional staff." : "Maximum staff reached for current plan."} (Owner does not consume quota)
                      </div>
                    </div>

                    {/* Product Quota Meter */}
                    <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "1.25rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b" }}>PRODUCT CATALOGUE</span>
                        <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0f172a" }}>
                          {subData.entitlements?.currentProductCount ?? 0} / {subData.entitlements?.maxProducts ?? 0}
                        </span>
                      </div>
                      <div style={{ height: "8px", backgroundColor: "#f1f5f9", borderRadius: "999px", overflow: "hidden", marginBottom: "8px" }}>
                        <div style={{
                          height: "100%",
                          width: `${Math.min(100, ((subData.entitlements?.currentProductCount ?? 0) / (subData.entitlements?.maxProducts || 1)) * 100)}%`,
                          backgroundColor: (subData.entitlements?.currentProductCount ?? 0) >= (subData.entitlements?.maxProducts ?? 0) ? "#ef4444" : "#10b981",
                          borderRadius: "999px"
                        }} />
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {subData.entitlements?.canAddProduct ? "Items available to add." : "Product limit reached. Upgrade plan to expand catalogue."}
                      </div>
                    </div>

                    {/* Order Acceptance & Analytics */}
                    <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "1.25rem" }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b", marginBottom: "8px" }}>STORE ORDER ACCEPTANCE</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                        <span style={{
                          width: "10px",
                          height: "10px",
                          borderRadius: "50%",
                          backgroundColor: subData.entitlements?.canAcceptOrders ? "#16a34a" : "#dc2626"
                        }} />
                        <span style={{ fontWeight: 600, fontSize: "0.95rem", color: subData.entitlements?.canAcceptOrders ? "#15803d" : "#b91c1c" }}>
                          {subData.entitlements?.canAcceptOrders ? "Active & Accepting Orders" : "Orders Paused"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        Analytics Tier: <strong style={{ color: "#0f172a" }}>{subData.entitlements?.analyticsLevel}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. AVAILABLE PLANS & UPGRADE/DOWNGRADE SELECTION */}
                <div>
                  <div style={{ marginBottom: "1rem" }}>
                    <h3 style={{ margin: "0 0 4px", fontSize: "1.2rem", color: "#0f172a" }}>Available Subscription Tiers</h3>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
                      Select a tier below to request an upgrade or downgrade. Changes are reviewed and authorized by platform administration.
                    </p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1.25rem" }}>
                    {subData.plans?.map((p: any) => {
                      const isCurrent = subData.subscription?.plan_id === p.id;
                      const isPending = subData.subscription?.requested_plan_id === p.id;
                      let features: string[] = [];
                      try {
                        features = JSON.parse(p.features_json);
                      } catch (_) {}

                      return (
                        <div
                          key={p.id}
                          style={{
                            backgroundColor: "#ffffff",
                            border: isCurrent ? "2px solid #4f46e5" : "1px solid #e2e8f0",
                            borderRadius: "12px",
                            padding: "1.5rem",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "space-between",
                            boxShadow: isCurrent ? "0 4px 12px rgba(79, 70, 229, 0.08)" : "0 1px 3px rgba(0,0,0,0.05)",
                            position: "relative"
                          }}
                        >
                          {isCurrent && (
                            <div style={{
                              position: "absolute",
                              top: "-10px",
                              right: "16px",
                              backgroundColor: "#4f46e5",
                              color: "#fff",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              padding: "2px 8px",
                              borderRadius: "999px",
                              textTransform: "uppercase"
                            }}>
                              Current Plan
                            </div>
                          )}

                          <div>
                            <h4 style={{ margin: "0 0 6px", fontSize: "1.15rem", color: "#0f172a" }}>{p.name}</h4>
                            <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#0f172a", marginBottom: "1rem" }}>
                              ₹{p.monthly_price} <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#64748b" }}>/ month</span>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.85rem", color: "#475569", marginBottom: "1.25rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span>👥</span> <strong>{p.maximum_staff}</strong> Staff Accounts
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span>📦</span> <strong>{p.maximum_products}</strong> Active Products
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span>📊</span> <strong>{p.analytics_level}</strong> Analytics
                              </div>
                            </div>

                            {features.length > 0 && (
                              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "0.75rem", marginBottom: "1.25rem" }}>
                                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#94a3b8", marginBottom: "6px", textTransform: "uppercase" }}>Features Included</div>
                                <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.8rem", color: "#64748b", display: "flex", flexDirection: "column", gap: "4px" }}>
                                  {features.map((feat: string, idx: number) => (
                                    <li key={idx}>{feat.replace(/_/g, " ")}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>

                          <div>
                            {isCurrent ? (
                              <button
                                disabled
                                style={{
                                  width: "100%",
                                  padding: "0.65rem",
                                  backgroundColor: "#f1f5f9",
                                  color: "#64748b",
                                  border: "none",
                                  borderRadius: "8px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  cursor: "not-allowed"
                                }}
                              >
                                Active Plan ✓
                              </button>
                            ) : isPending ? (
                              <button
                                disabled
                                style={{
                                  width: "100%",
                                  padding: "0.65rem",
                                  backgroundColor: "#f0f9ff",
                                  color: "#0284c7",
                                  border: "1px solid #bae6fd",
                                  borderRadius: "8px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  cursor: "not-allowed"
                                }}
                              >
                                Request Pending ⏳
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRequestPlanChange(p.id)}
                                disabled={requestingPlanId === p.id}
                                style={{
                                  width: "100%",
                                  padding: "0.65rem",
                                  backgroundColor: "#4f46e5",
                                  color: "#ffffff",
                                  border: "none",
                                  borderRadius: "8px",
                                  fontWeight: 600,
                                  fontSize: "0.85rem",
                                  cursor: requestingPlanId === p.id ? "not-allowed" : "pointer"
                                }}
                              >
                                {requestingPlanId === p.id ? "Submitting..." : "Request Plan Change"}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. SUBSCRIPTION CHANGE HISTORY */}
                <div style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1.5rem" }}>
                  <h3 style={{ margin: "0 0 1rem", fontSize: "1.1rem", color: "#0f172a" }}>Subscription Change History</h3>
                  {!subData.history || subData.history.length === 0 ? (
                    <p style={{ margin: 0, color: "#64748b", fontSize: "0.85rem" }}>No subscription plan or status transitions recorded yet.</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
                        <thead>
                          <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                            <th style={{ padding: "10px 12px", color: "#475569" }}>Timestamp</th>
                            <th style={{ padding: "10px 12px", color: "#475569" }}>Plan Transition</th>
                            <th style={{ padding: "10px 12px", color: "#475569" }}>Status Transition</th>
                            <th style={{ padding: "10px 12px", color: "#475569" }}>Reason / Notes</th>
                            <th style={{ padding: "10px 12px", color: "#475569" }}>Changed By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subData.history.map((h: any) => (
                            <tr key={h.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "10px 12px", color: "#64748b" }}>
                                {new Date(h.changed_at).toLocaleString()}
                              </td>
                              <td style={{ padding: "10px 12px", fontWeight: 600, color: "#1e293b" }}>
                                {h.old_plan_id ? `${h.old_plan_id} → ${h.new_plan_id}` : h.new_plan_id}
                              </td>
                              <td style={{ padding: "10px 12px" }}>
                                <span style={{
                                  fontSize: "0.75rem",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  fontWeight: 600,
                                  backgroundColor: "#f1f5f9",
                                  color: "#334155"
                                }}>
                                  {h.old_status ? `${h.old_status} → ${h.new_status}` : h.new_status}
                                </span>
                              </td>
                              <td style={{ padding: "10px 12px", color: "#334155" }}>
                                {h.change_reason || "-"}
                              </td>
                              <td style={{ padding: "10px 12px", color: "#64748b" }}>
                                {h.changed_by}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* MODAL: ADD / EDIT PRODUCT */}
        {showProductModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.4)",
              backdropFilter: "blur(2px)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
            }}
            onClick={() => setShowProductModal(false)}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "14px",
                width: "100%",
                maxWidth: "520px",
                padding: "2rem",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1.5rem",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "1.3rem", color: "#0f172a" }}>
                  {editingProduct ? `Edit "${editingProduct.name}"` : "Add New Stationery Product"}
                </h3>
                <button
                  onClick={() => setShowProductModal(false)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "1.25rem",
                    color: "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              {prodFormError && (
                <div
                  style={{
                    backgroundColor: "#fee2e2",
                    color: "#dc2626",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    marginBottom: "1rem",
                    fontSize: "0.875rem",
                  }}
                >
                  ⚠️ {prodFormError}
                </div>
              )}

              <form onSubmit={handleSaveProduct} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Pilot V7 Hi-Tecpoint Pen"
                    value={prodFormName}
                    onChange={(e) => setProdFormName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.95rem",
                    }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Price (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="80"
                      value={prodFormPrice}
                      onChange={(e) => setProdFormPrice(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.65rem 0.85rem",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "0.95rem",
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                      Stock Quantity *
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      required
                      placeholder="20"
                      value={prodFormStock}
                      onChange={(e) => setProdFormStock(e.target.value)}
                      style={{
                        width: "100%",
                        padding: "0.65rem 0.85rem",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                        fontSize: "0.95rem",
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    Category
                  </label>
                  <select
                    value={prodFormCategory}
                    onChange={(e) => setProdFormCategory(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.95rem",
                      backgroundColor: "#fff",
                    }}
                  >
                    <option value="">-- No Category --</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    Description (optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Short description or technical specs..."
                    value={prodFormDesc}
                    onChange={(e) => setProdFormDesc(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.95rem",
                      resize: "vertical",
                    }}
                  />
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "0.9rem" }}>
                  <input
                    type="checkbox"
                    checked={prodFormAvailable}
                    onChange={(e) => setProdFormAvailable(e.target.checked)}
                  />
                  <span>Product is Available for Ordering in Storefront</span>
                </label>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => setShowProductModal(false)}
                    style={{
                      padding: "0.65rem 1.25rem",
                      border: "1px solid #cbd5e1",
                      backgroundColor: "#fff",
                      borderRadius: "8px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={prodFormSubmitting}
                    style={{
                      padding: "0.65rem 1.5rem",
                      border: "none",
                      backgroundColor: "#4f46e5",
                      color: "#fff",
                      borderRadius: "8px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {prodFormSubmitting ? "Saving..." : editingProduct ? "Save Changes" : "Create Product"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: ADD CATEGORY */}
        {showCategoryModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(15, 23, 42, 0.4)",
              backdropFilter: "blur(2px)",
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1rem",
            }}
            onClick={() => setShowCategoryModal(false)}
          >
            <div
              style={{
                backgroundColor: "#ffffff",
                borderRadius: "14px",
                width: "100%",
                maxWidth: "420px",
                padding: "2rem",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1.5rem",
                }}
              >
                <h3 style={{ margin: 0, fontSize: "1.25rem", color: "#0f172a" }}>Add Product Category</h3>
                <button
                  onClick={() => setShowCategoryModal(false)}
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "1.25rem",
                    color: "#94a3b8",
                    cursor: "pointer",
                  }}
                >
                  ✕
                </button>
              </div>

              {catError && (
                <div
                  style={{
                    backgroundColor: "#fee2e2",
                    color: "#dc2626",
                    padding: "0.75rem",
                    borderRadius: "8px",
                    marginBottom: "1rem",
                    fontSize: "0.875rem",
                  }}
                >
                  ⚠️ {catError}
                </div>
              )}

              <form onSubmit={handleCreateCategory} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "#334155", marginBottom: "4px" }}>
                    Category Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Notebooks, Writing Tools, Paper"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.65rem 0.85rem",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.95rem",
                    }}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(false)}
                    style={{
                      padding: "0.65rem 1.25rem",
                      border: "1px solid #cbd5e1",
                      backgroundColor: "#fff",
                      borderRadius: "8px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: "0.65rem 1.5rem",
                      border: "none",
                      backgroundColor: "#4f46e5",
                      color: "#fff",
                      borderRadius: "8px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Add Category
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Order Lifecycle Timeline Modal */}
        {timelineOrderId && (
          <OrderTimelineModal
            orderId={timelineOrderId}
            currentStatus={timelineOrderStatus}
            onClose={() => setTimelineOrderId(null)}
          />
        )}
      </main>
    </div>
  );
}

export default Dashboard;
