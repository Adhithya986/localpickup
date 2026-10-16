import { useState, useEffect, useCallback } from "react";
import Navbar from "../components/Navbar";
import { useNavigate } from "react-router-dom";
import { authFetch, getUser } from "../utils/api";

interface AdminShop {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  subscriptionStatus: "TRIAL" | "ACTIVE" | "PAST_DUE" | "EXPIRED" | "SUSPENDED" | "CANCELLED";
  planId: string;
  planName: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  requestedPlanId: string | null;
  requestedPlanName: string | null;
  staffCount: number;
  maxStaff: number;
  productCount: number;
  maxProducts: number;
  orderCount: number;
  revenue: number;
  rating: number;
  priceStarting: string | null;
  createdAt: string;
}

interface AdminPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  monthly_price: number;
  maximum_staff: number;
  maximum_products: number;
  analytics_level: "BASIC" | "STANDARD" | "ADVANCED";
  feature_config_json: string | null;
  is_active: number;
  activeSubscribers?: number;
  features?: Record<string, boolean>;
}

interface AuditLog {
  id: string;
  actorUserId: string;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  details: any;
  ipAddress: string | null;
  createdAt: string;
}

interface PlatformMetrics {
  totalUsers: number;
  totalCustomers: number;
  totalShops: number;
  activeShops: number;
  suspendedShops: number;
  trialShops: number;
  expiredShops: number;
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  totalRevenue: number;
}

interface SubscriptionHistoryItem {
  id: string;
  shop_id: string;
  from_plan_name?: string;
  to_plan_name?: string;
  from_status: string | null;
  to_status: string;
  changed_by_name?: string;
  reason: string | null;
  created_at: string;
}

function Admin() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"shops" | "plans" | "audit">("shops");
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [shops, setShops] = useState<AdminShop[]>([]);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Manage Subscription Modal
  const [selectedShop, setSelectedShop] = useState<AdminShop | null>(null);
  const [modalPlanId, setModalPlanId] = useState("");
  const [modalStatus, setModalStatus] = useState("");
  const [modalExtendDays, setModalExtendDays] = useState("");
  const [modalNotes, setModalNotes] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalSuccess, setModalSuccess] = useState("");
  const [modalError, setModalError] = useState("");

  // History Modal
  const [historyShop, setHistoryShop] = useState<AdminShop | null>(null);
  const [historyItems, setHistoryItems] = useState<SubscriptionHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Add/Edit Plan Modal
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AdminPlan | null>(null);
  const [planName, setPlanName] = useState("");
  const [planSlug, setPlanSlug] = useState("");
  const [planDesc, setPlanDesc] = useState("");
  const [planPrice, setPlanPrice] = useState("");
  const [planStaff, setPlanStaff] = useState("");
  const [planProducts, setPlanProducts] = useState("");
  const [planAnalytics, setPlanAnalytics] = useState<"BASIC" | "STANDARD" | "ADVANCED">("BASIC");
  const [planError, setPlanError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [mRes, sRes, pRes] = await Promise.all([
        authFetch("/api/admin/metrics"),
        authFetch("/api/admin/shops"),
        authFetch("/api/admin/plans"),
      ]);

      if (mRes.ok) setMetrics(await mRes.json());
      if (sRes.ok) setShops(await sRes.json());
      if (pRes.ok) setPlans(await pRes.json());
      setLoading(false);
    } catch (err) {
      console.error("Admin dashboard fetch error:", err);
      setLoading(false);
    }
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const res = await authFetch("/api/admin/audit-logs?limit=50");
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    }
  }, []);

  useEffect(() => {
    const user = getUser();
    if (!user) {
      navigate("/login");
      return;
    }
    if (user.role !== "ADMIN" && user.role !== "PLATFORM_ADMIN") {
      navigate("/");
      return;
    }

    fetchData();
  }, [navigate, fetchData]);

  useEffect(() => {
    if (activeTab === "audit") {
      fetchAuditLogs();
    }
  }, [activeTab, fetchAuditLogs]);

  // Open Manage Subscription Modal
  const openManageModal = (shop: AdminShop) => {
    setSelectedShop(shop);
    setModalPlanId(shop.planId);
    setModalStatus(shop.subscriptionStatus);
    setModalExtendDays("");
    setModalNotes("");
    setModalSuccess("");
    setModalError("");
  };

  const handleUpdateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedShop) return;

    setModalSubmitting(true);
    setModalError("");
    setModalSuccess("");

    try {
      const payload: any = {
        planId: modalPlanId !== selectedShop.planId ? modalPlanId : undefined,
        status: modalStatus !== selectedShop.subscriptionStatus ? modalStatus : undefined,
        notes: modalNotes.trim() || undefined,
      };

      if (modalExtendDays) {
        const days = parseInt(modalExtendDays, 10);
        if (!isNaN(days) && days > 0) {
          payload.extendDays = days;
        }
      }

      const res = await authFetch(`/api/admin/shops/${selectedShop.id}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || "Failed to update subscription");
        setModalSubmitting(false);
        return;
      }

      setModalSuccess("Subscription successfully updated!");
      setTimeout(() => {
        setSelectedShop(null);
        fetchData();
      }, 1000);
    } catch (err: any) {
      setModalError(err.message || "Network error updating subscription");
    } finally {
      setModalSubmitting(false);
    }
  };

  // 1-Click Approve Requested Plan Upgrade
  const handleApprovePlanUpgrade = async (shop: AdminShop) => {
    if (!shop.requestedPlanId) return;
    try {
      const res = await authFetch(`/api/admin/shops/${shop.id}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: shop.requestedPlanId,
          notes: `Admin approved requested upgrade to ${shop.requestedPlanName}`,
        }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error("Failed to approve plan upgrade:", err);
    }
  };

  // Open Subscription History Modal
  const openHistoryModal = async (shop: AdminShop) => {
    setHistoryShop(shop);
    setHistoryLoading(true);
    try {
      const res = await authFetch(`/api/admin/shops/${shop.id}/subscription-history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryItems(data || []);
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Save Plan (Add or Edit)
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanError("");

    if (!planName.trim()) {
      setPlanError("Plan name is required");
      return;
    }

    const payload = {
      name: planName.trim(),
      slug: planSlug.trim() || planName.toLowerCase().replace(/\s+/g, "_"),
      description: planDesc.trim(),
      monthlyPrice: parseFloat(planPrice) || 0,
      maximumStaff: parseInt(planStaff, 10) || 1,
      maximumProducts: parseInt(planProducts, 10) || 10,
      analyticsLevel: planAnalytics,
    };

    try {
      const url = editingPlan ? `/api/admin/plans/${editingPlan.id}` : "/api/admin/plans";
      const method = editingPlan ? "PATCH" : "POST";

      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setPlanError(data.error || "Failed to save plan");
        return;
      }

      setShowPlanModal(false);
      fetchData();
    } catch (err: any) {
      setPlanError(err.message || "Network error saving plan");
    }
  };

  // Filtered Shops
  const filteredShops = shops.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.ownerEmail.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || s.subscriptionStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: AdminShop["subscriptionStatus"]) => {
    switch (status) {
      case "ACTIVE":
        return { bg: "#dcfce7", text: "#166534", label: "ACTIVE" };
      case "TRIAL":
        return { bg: "#fef3c7", text: "#92400e", label: "TRIAL" };
      case "SUSPENDED":
        return { bg: "#fee2e2", text: "#991b1b", label: "SUSPENDED" };
      case "EXPIRED":
        return { bg: "#f1f5f9", text: "#475569", label: "EXPIRED" };
      case "PAST_DUE":
        return { bg: "#ffedd5", text: "#c2410c", label: "PAST DUE" };
      case "CANCELLED":
        return { bg: "#f3f4f6", text: "#6b7280", label: "CANCELLED" };
      default:
        return { bg: "#f1f5f9", text: "#475569", label: status };
    }
  };

  return (
    <div className="app">
      <Navbar />

      <main>
        {/* Header */}
        <section className="shops-header">
          <p className="eyebrow">PLATFORM ADMINISTRATION</p>
          <h1>SaaS Command Center</h1>
          <p className="hero-description">
            Oversee tenant shops, enforce subscription tiers, audit administrative events, and monitor platform health.
          </p>
        </section>

        {/* Top KPI Metric Cards */}
        {metrics && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}
          >
            <div style={kpiCardStyle}>
              <span style={kpiLabelStyle}>Total Shops</span>
              <strong style={kpiValueStyle}>{metrics.totalShops}</strong>
              <span style={{ fontSize: "0.75rem", color: "#16a34a" }}>
                {metrics.activeShops} active • {metrics.trialShops} trial
              </span>
            </div>

            <div style={kpiCardStyle}>
              <span style={kpiLabelStyle}>Suspended / Expired</span>
              <strong style={{ ...kpiValueStyle, color: metrics.suspendedShops > 0 ? "#dc2626" : "#475569" }}>
                {metrics.suspendedShops + metrics.expiredShops}
              </strong>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {metrics.suspendedShops} suspended • {metrics.expiredShops} expired
              </span>
            </div>

            <div style={kpiCardStyle}>
              <span style={kpiLabelStyle}>Platform Orders</span>
              <strong style={kpiValueStyle}>{metrics.totalOrders}</strong>
              <span style={{ fontSize: "0.75rem", color: "#4f46e5" }}>
                {metrics.completedOrders} completed ({metrics.pendingOrders} pending)
              </span>
            </div>

            <div style={kpiCardStyle}>
              <span style={kpiLabelStyle}>Gross Merchandise Value (GMV)</span>
              <strong style={{ ...kpiValueStyle, color: "#16a34a" }}>₹{metrics.totalRevenue}</strong>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Completed in-store counter pickups</span>
            </div>

            <div style={kpiCardStyle}>
              <span style={kpiLabelStyle}>Registered Users</span>
              <strong style={kpiValueStyle}>{metrics.totalUsers}</strong>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                {metrics.totalCustomers} student customers
              </span>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div
          style={{
            display: "flex",
            gap: "12px",
            borderBottom: "1px solid #e2e8f0",
            marginBottom: "1.5rem",
          }}
        >
          <button
            onClick={() => setActiveTab("shops")}
            style={getTabButtonStyle(activeTab === "shops")}
          >
            🏢 Shops & Subscriptions ({shops.length})
          </button>
          <button
            onClick={() => setActiveTab("plans")}
            style={getTabButtonStyle(activeTab === "plans")}
          >
            📦 Subscription Plans ({plans.length})
          </button>
          <button
            onClick={() => setActiveTab("audit")}
            style={getTabButtonStyle(activeTab === "audit")}
          >
            🛡️ Administrative Audit Logs
          </button>
        </div>

        {/* ==================================================== */}
        {/* TAB 1: SHOPS & SUBSCRIPTIONS */}
        {/* ==================================================== */}
        {activeTab === "shops" && (
          <section>
            {/* Filter Bar */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "1rem",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.25rem",
              }}
            >
              <input
                type="text"
                placeholder="Search by shop name, owner name, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  padding: "0.6rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  fontSize: "0.9rem",
                  minWidth: "300px",
                  flex: 1,
                  maxWidth: "450px",
                }}
              />

              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ fontSize: "0.85rem", color: "#64748b", fontWeight: 600 }}>Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    padding: "0.55rem 0.85rem",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="TRIAL">Trial</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="PAST_DUE">Past Due</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>

            {loading ? (
              <p>Loading tenant directory...</p>
            ) : filteredShops.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b", backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                No shops match the selected filters.
              </div>
            ) : (
              <div style={{ overflowX: "auto", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
                  <thead style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                    <tr>
                      <th style={{ padding: "0.85rem 1rem" }}>Shop & Owner</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Plan</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Subscription Status</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Usage Quota</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Orders & GMV</th>
                      <th style={{ padding: "0.85rem 1rem", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShops.map((s) => {
                      const badge = getStatusBadge(s.subscriptionStatus);
                      return (
                        <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "1rem" }}>
                            <strong style={{ color: "#0f172a", fontSize: "0.95rem" }}>{s.name}</strong>
                            <div style={{ fontSize: "0.775rem", color: "#64748b", marginTop: "2px" }}>
                              {s.ownerName} • <span style={{ color: "#4f46e5" }}>{s.ownerEmail}</span>
                            </div>
                          </td>

                          <td style={{ padding: "1rem" }}>
                            <span style={{ fontWeight: 600, color: "#1e293b" }}>{s.planName}</span>
                            {s.requestedPlanId && (
                              <div style={{ marginTop: "4px" }}>
                                <span
                                  style={{
                                    backgroundColor: "#ede9fe",
                                    color: "#6d28d9",
                                    fontSize: "0.725rem",
                                    fontWeight: 700,
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    display: "inline-block",
                                  }}
                                >
                                  Requested: {s.requestedPlanName}
                                </span>
                              </div>
                            )}
                          </td>

                          <td style={{ padding: "1rem" }}>
                            <span
                              style={{
                                backgroundColor: badge.bg,
                                color: badge.text,
                                fontSize: "0.75rem",
                                fontWeight: 700,
                                padding: "3px 8px",
                                borderRadius: "999px",
                              }}
                            >
                              {badge.label}
                            </span>
                            {s.subscriptionStatus === "TRIAL" && s.trialEndsAt && (
                              <div style={{ fontSize: "0.725rem", color: "#94a3b8", marginTop: "4px" }}>
                                Ends {new Date(s.trialEndsAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                              </div>
                            )}
                          </td>

                          <td style={{ padding: "1rem", color: "#475569" }}>
                            <div>
                              Staff: <strong>{s.staffCount}</strong> / {s.maxStaff}
                            </div>
                            <div style={{ fontSize: "0.775rem", color: "#64748b" }}>
                              Products: <strong>{s.productCount}</strong> / {s.maxProducts}
                            </div>
                          </td>

                          <td style={{ padding: "1rem" }}>
                            <div><strong>{s.orderCount}</strong> orders</div>
                            <div style={{ color: "#16a34a", fontWeight: 600, fontSize: "0.8rem" }}>
                              ₹{s.revenue}
                            </div>
                          </td>

                          <td style={{ padding: "1rem", textAlign: "right" }}>
                            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                              {s.requestedPlanId && (
                                <button
                                  onClick={() => handleApprovePlanUpgrade(s)}
                                  title="Approve requested plan upgrade"
                                  style={{
                                    backgroundColor: "#16a34a",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "6px",
                                    padding: "5px 10px",
                                    fontSize: "0.775rem",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  ✓ Approve Upgrade
                                </button>
                              )}

                              <button
                                onClick={() => openManageModal(s)}
                                style={{
                                  backgroundColor: "#f1f5f9",
                                  color: "#334155",
                                  border: "1px solid #cbd5e1",
                                  borderRadius: "6px",
                                  padding: "5px 10px",
                                  fontSize: "0.775rem",
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Manage
                              </button>

                              <button
                                onClick={() => openHistoryModal(s)}
                                title="View subscription audit trail"
                                style={{
                                  backgroundColor: "transparent",
                                  color: "#64748b",
                                  border: "none",
                                  fontSize: "0.85rem",
                                  cursor: "pointer",
                                  padding: "4px 6px",
                                }}
                              >
                                🕒
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

        {/* ==================================================== */}
        {/* TAB 2: SUBSCRIPTION PLANS & ENTITLEMENTS */}
        {/* ==================================================== */}
        {activeTab === "plans" && (
          <section>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.5rem",
              }}
            >
              <div>
                <h3 style={{ margin: 0, color: "#0f172a" }}>Configurable Subscription Plans</h3>
                <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.875rem" }}>
                  Adjust pricing, resource ceilings, and feature matrices platform-wide.
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingPlan(null);
                  setPlanName("");
                  setPlanSlug("");
                  setPlanDesc("");
                  setPlanPrice("0");
                  setPlanStaff("3");
                  setPlanProducts("50");
                  setPlanAnalytics("BASIC");
                  setPlanError("");
                  setShowPlanModal(true);
                }}
                className="shop-button"
                style={{ backgroundColor: "#4f46e5" }}
              >
                + Create New Plan
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1.5rem",
              }}
            >
              {plans.map((p) => (
                <div
                  key={p.id}
                  style={{
                    backgroundColor: "#ffffff",
                    borderRadius: "12px",
                    border: "1px solid #e2e8f0",
                    padding: "1.5rem",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: "1.2rem", color: "#0f172a" }}>{p.name}</h4>
                        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>slug: {p.slug}</span>
                      </div>
                      <span
                        style={{
                          backgroundColor: "#f0fdf4",
                          color: "#16a34a",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: "999px",
                        }}
                      >
                        {p.activeSubscribers || 0} active
                      </span>
                    </div>

                    <div style={{ margin: "1rem 0" }}>
                      <span style={{ fontSize: "2rem", fontWeight: 800, color: "#0f172a" }}>
                        ₹{p.monthly_price}
                      </span>
                      <span style={{ color: "#64748b", fontSize: "0.85rem" }}> / month</span>
                    </div>

                    <p style={{ fontSize: "0.85rem", color: "#64748b", lineHeight: 1.4, margin: "0 0 1rem" }}>
                      {p.description || "Configured tier limits"}
                    </p>

                    <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "0.75rem", fontSize: "0.85rem" }}>
                      <div style={featureRowStyle}>
                        <span>👥 Max Staff Accounts:</span>
                        <strong>{p.maximum_staff}</strong>
                      </div>
                      <div style={featureRowStyle}>
                        <span>📦 Max Physical Products:</span>
                        <strong>{p.maximum_products}</strong>
                      </div>
                      <div style={featureRowStyle}>
                        <span>📊 Analytics Level:</span>
                        <strong style={{ color: p.analytics_level === "ADVANCED" ? "#7c3aed" : "#0f172a" }}>
                          {p.analytics_level}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: "1.25rem", borderTop: "1px solid #f1f5f9", paddingTop: "0.75rem" }}>
                    <button
                      onClick={() => {
                        setEditingPlan(p);
                        setPlanName(p.name);
                        setPlanSlug(p.slug);
                        setPlanDesc(p.description || "");
                        setPlanPrice(p.monthly_price.toString());
                        setPlanStaff(p.maximum_staff.toString());
                        setPlanProducts(p.maximum_products.toString());
                        setPlanAnalytics(p.analytics_level);
                        setPlanError("");
                        setShowPlanModal(true);
                      }}
                      style={{
                        width: "100%",
                        padding: "8px",
                        backgroundColor: "#f8fafc",
                        color: "#334155",
                        border: "1px solid #cbd5e1",
                        borderRadius: "6px",
                        fontWeight: 600,
                        fontSize: "0.825rem",
                        cursor: "pointer",
                      }}
                    >
                      ✏️ Edit Plan Ceilings
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ==================================================== */}
        {/* TAB 3: ADMINISTRATIVE AUDIT LOGS */}
        {/* ==================================================== */}
        {activeTab === "audit" && (
          <section>
            <div style={{ marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, color: "#0f172a" }}>Platform Audit Trail</h3>
              <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "0.875rem" }}>
                Immutable historical record of all plan assignments, status overrides, and trial extensions.
              </p>
            </div>

            {auditLogs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem", color: "#64748b", backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                No audit events recorded yet.
              </div>
            ) : (
              <div style={{ overflowX: "auto", backgroundColor: "#ffffff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem" }}>
                  <thead style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569" }}>
                    <tr>
                      <th style={{ padding: "0.85rem 1rem" }}>Timestamp</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Admin Actor</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Action</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Target</th>
                      <th style={{ padding: "0.85rem 1rem" }}>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "0.85rem 1rem", color: "#64748b", whiteSpace: "nowrap" }}>
                          {new Date(log.createdAt).toLocaleString("en-IN", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td style={{ padding: "0.85rem 1rem" }}>
                          <strong>{log.actorName}</strong>
                        </td>
                        <td style={{ padding: "0.85rem 1rem" }}>
                          <span
                            style={{
                              backgroundColor:
                                log.action.includes("SUSPEND")
                                  ? "#fee2e2"
                                  : log.action.includes("ASSIGN") || log.action.includes("APPROV")
                                  ? "#dcfce7"
                                  : "#e0e7ff",
                              color:
                                log.action.includes("SUSPEND")
                                  ? "#991b1b"
                                  : log.action.includes("ASSIGN") || log.action.includes("APPROV")
                                  ? "#166534"
                                  : "#3730a3",
                              fontWeight: 700,
                              fontSize: "0.75rem",
                              padding: "3px 8px",
                              borderRadius: "6px",
                            }}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td style={{ padding: "0.85rem 1rem", color: "#334155" }}>
                          {log.targetType}: <code>{log.targetId}</code>
                        </td>
                        <td style={{ padding: "0.85rem 1rem", color: "#64748b", maxWidth: "350px" }}>
                          {log.details ? (
                            <span style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
                              {JSON.stringify(log.details)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>

      {/* ==================================================== */}
      {/* MODAL 1: MANAGE SUBSCRIPTION (PLAN & STATUS) */}
      {/* ==================================================== */}
      {selectedShop && (
        <div style={modalBackdropStyle} onClick={() => setSelectedShop(null)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={{ margin: 0, color: "#0f172a" }}>Manage Subscription: {selectedShop.name}</h3>
              <button onClick={() => setSelectedShop(null)} style={closeBtnStyle}>✕</button>
            </div>

            <form onSubmit={handleUpdateSubscription} style={{ padding: "1.5rem" }}>
              {modalSuccess && <div style={successAlertStyle}>✓ {modalSuccess}</div>}
              {modalError && <div style={errorAlertStyle}>⚠ {modalError}</div>}

              {/* Plan Picker */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={labelStyle}>Assigned Subscription Plan:</label>
                <select
                  value={modalPlanId}
                  onChange={(e) => setModalPlanId(e.target.value)}
                  style={inputStyle}
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (₹{p.monthly_price}/mo — {p.maximum_staff} staff, {p.maximum_products} prods)
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Picker */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={labelStyle}>Subscription Status:</label>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value)}
                  style={inputStyle}
                >
                  <option value="ACTIVE">ACTIVE (Fully operational)</option>
                  <option value="TRIAL">TRIAL (14-day evaluation)</option>
                  <option value="PAST_DUE">PAST_DUE (7-day grace period)</option>
                  <option value="EXPIRED">EXPIRED (Order intake blocked)</option>
                  <option value="SUSPENDED">SUSPENDED (Storefront locked)</option>
                  <option value="CANCELLED">CANCELLED (Non-renewing)</option>
                </select>
              </div>

              {/* Trial Extension */}
              {selectedShop.subscriptionStatus === "TRIAL" && (
                <div style={{ marginBottom: "1rem" }}>
                  <label style={labelStyle}>Extend Trial Period (Days):</label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    placeholder="e.g. 7 or 14 days"
                    value={modalExtendDays}
                    onChange={(e) => setModalExtendDays(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Administrative Reason / Notes */}
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={labelStyle}>Audit Note / Reason for Change:</label>
                <input
                  type="text"
                  placeholder="e.g. Student campus partnership, phone verification complete"
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setSelectedShop(null)}
                  style={{ ...buttonBaseStyle, backgroundColor: "#f1f5f9", color: "#475569" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  style={{ ...buttonBaseStyle, backgroundColor: "#4f46e5", color: "#ffffff" }}
                >
                  {modalSubmitting ? "Applying Changes..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 2: SUBSCRIPTION AUDIT HISTORY */}
      {/* ==================================================== */}
      {historyShop && (
        <div style={modalBackdropStyle} onClick={() => setHistoryShop(null)}>
          <div style={{ ...modalCardStyle, maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div>
                <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>
                  Subscription History
                </span>
                <h3 style={{ margin: "2px 0 0", color: "#0f172a" }}>{historyShop.name}</h3>
              </div>
              <button onClick={() => setHistoryShop(null)} style={closeBtnStyle}>✕</button>
            </div>

            <div style={{ padding: "1.5rem", maxHeight: "450px", overflowY: "auto" }}>
              {historyLoading ? (
                <p>Loading history...</p>
              ) : historyItems.length === 0 ? (
                <p style={{ color: "#64748b" }}>No previous subscription transitions found.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {historyItems.map((h) => (
                    <div
                      key={h.id}
                      style={{
                        padding: "10px 14px",
                        backgroundColor: "#f8fafc",
                        borderRadius: "8px",
                        border: "1px solid #e2e8f0",
                        fontSize: "0.85rem",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <strong>
                          {h.from_plan_name ? `${h.from_plan_name} → ` : ""}
                          <span style={{ color: "#4f46e5" }}>{h.to_plan_name || "Plan"}</span>
                        </strong>
                        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
                          {new Date(h.created_at).toLocaleDateString("en-IN", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <div style={{ color: "#475569", fontSize: "0.8rem" }}>
                        Status: <strong>{h.to_status}</strong> {h.reason ? `• ${h.reason}` : ""}
                      </div>
                      {h.changed_by_name && (
                        <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginTop: "2px" }}>
                          Changed by: {h.changed_by_name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 3: CREATE / EDIT PLAN */}
      {/* ==================================================== */}
      {showPlanModal && (
        <div style={modalBackdropStyle} onClick={() => setShowPlanModal(false)}>
          <div style={modalCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3 style={{ margin: 0, color: "#0f172a" }}>
                {editingPlan ? `Edit Plan: ${editingPlan.name}` : "Create New Subscription Plan"}
              </h3>
              <button onClick={() => setShowPlanModal(false)} style={closeBtnStyle}>✕</button>
            </div>

            <form onSubmit={handleSavePlan} style={{ padding: "1.5rem" }}>
              {planError && <div style={errorAlertStyle}>⚠ {planError}</div>}

              <div style={{ marginBottom: "1rem" }}>
                <label style={labelStyle}>Plan Name:</label>
                <input
                  type="text"
                  placeholder="e.g. Campus Pro"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={labelStyle}>Slug (Unique key):</label>
                  <input
                    type="text"
                    placeholder="e.g. campus_pro"
                    value={planSlug}
                    onChange={(e) => setPlanSlug(e.target.value)}
                    style={inputStyle}
                    disabled={Boolean(editingPlan)}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Monthly Price (₹):</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 999"
                    value={planPrice}
                    onChange={(e) => setPlanPrice(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label style={labelStyle}>Maximum Staff Ceilings:</label>
                  <input
                    type="number"
                    min="1"
                    value={planStaff}
                    onChange={(e) => setPlanStaff(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Maximum Product Ceilings:</label>
                  <input
                    type="number"
                    min="0"
                    value={planProducts}
                    onChange={(e) => setPlanProducts(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={labelStyle}>Analytics Level:</label>
                <select
                  value={planAnalytics}
                  onChange={(e) => setPlanAnalytics(e.target.value as any)}
                  style={inputStyle}
                >
                  <option value="BASIC">BASIC (Daily orders & revenue)</option>
                  <option value="STANDARD">STANDARD (Product breakdown & peak hours)</option>
                  <option value="ADVANCED">ADVANCED (Cohort analytics & export)</option>
                </select>
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={labelStyle}>Description:</label>
                <input
                  type="text"
                  placeholder="Target shop size and key benefits"
                  value={planDesc}
                  onChange={(e) => setPlanDesc(e.target.value)}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  style={{ ...buttonBaseStyle, backgroundColor: "#f1f5f9", color: "#475569" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ ...buttonBaseStyle, backgroundColor: "#4f46e5", color: "#ffffff" }}
                >
                  Save Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------
// Component Styles
// ----------------------------------------------------
const kpiCardStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "10px",
  padding: "1rem 1.25rem",
  border: "1px solid #e2e8f0",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#64748b",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.025em",
};

const kpiValueStyle: React.CSSProperties = {
  fontSize: "1.5rem",
  fontWeight: 800,
  color: "#0f172a",
};

const featureRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "5px 0",
  color: "#334155",
};

const getTabButtonStyle = (isActive: boolean): React.CSSProperties => ({
  padding: "10px 18px",
  border: "none",
  borderBottom: isActive ? "3px solid #4f46e5" : "3px solid transparent",
  background: "none",
  color: isActive ? "#4f46e5" : "#64748b",
  fontWeight: 700,
  fontSize: "0.95rem",
  cursor: "pointer",
  transition: "all 0.15s ease",
});

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(15, 23, 42, 0.5)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1100,
  padding: "1rem",
};

const modalCardStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  borderRadius: "14px",
  width: "100%",
  maxWidth: "520px",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
  border: "1px solid #e2e8f0",
};

const modalHeaderStyle: React.CSSProperties = {
  padding: "1.25rem 1.5rem",
  borderBottom: "1px solid #f1f5f9",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  backgroundColor: "#f8fafc",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: "1.25rem",
  color: "#94a3b8",
  cursor: "pointer",
  padding: "4px 8px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.825rem",
  fontWeight: 600,
  color: "#334155",
  marginBottom: "4px",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.85rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  fontSize: "0.9rem",
  backgroundColor: "#fff",
};

const buttonBaseStyle: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: "8px",
  border: "none",
  fontWeight: 600,
  fontSize: "0.875rem",
  cursor: "pointer",
};

const successAlertStyle: React.CSSProperties = {
  padding: "0.65rem 1rem",
  backgroundColor: "#dcfce7",
  color: "#166534",
  borderRadius: "6px",
  marginBottom: "1rem",
  fontSize: "0.85rem",
  fontWeight: 600,
};

const errorAlertStyle: React.CSSProperties = {
  padding: "0.65rem 1rem",
  backgroundColor: "#fee2e2",
  color: "#991b1b",
  borderRadius: "6px",
  marginBottom: "1rem",
  fontSize: "0.85rem",
  fontWeight: 600,
};

export default Admin;
