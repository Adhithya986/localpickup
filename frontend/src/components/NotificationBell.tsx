import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch, getUser } from "../utils/api";

export interface NotificationItem {
  id: string;
  userId: string;
  shopId: string | null;
  orderId: string | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const user = getUser();

  // Poll unread count periodically
  const fetchUnreadCount = async () => {
    if (!user) return;
    try {
      const res = await authFetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count || 0);
      }
    } catch {
      // Ignore network errors in polling
    }
  };

  // Fetch full notifications list when opening dropdown
  const fetchNotifications = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await authFetch("/api/notifications?limit=20");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = () => {
    if (!isOpen) {
      fetchNotifications();
    }
    setIsOpen(!isOpen);
  };

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await authFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await authFetch("/api/notifications/mark-all-read", { method: "POST" });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
    }
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      await markAsRead(notif.id);
    }
    setIsOpen(false);
    if (user?.role === "SHOP_OWNER" || user?.role === "SHOPKEEPER") {
      navigate("/dashboard");
    } else {
      navigate("/bookings");
    }
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (diffSec < 60) return "Just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    } catch {
      return "";
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "ORDER_PLACED":
        return { icon: "📦", bg: "#eff6ff", text: "#2563eb" };
      case "ORDER_ACCEPTED":
        return { icon: "⏳", bg: "#fef3c7", text: "#d97706" };
      case "ORDER_PREPARING":
        return { icon: "🖨️", bg: "#ede9fe", text: "#7c3aed" };
      case "ORDER_READY":
        return { icon: "🔔", bg: "#ecfdf5", text: "#059669" };
      case "ORDER_COMPLETED":
        return { icon: "✅", bg: "#f0fdf4", text: "#16a34a" };
      case "ORDER_CANCELLED":
      case "ORDER_REJECTED":
        return { icon: "❌", bg: "#fef2f2", text: "#dc2626" };
      default:
        return { icon: "ℹ️", bg: "#f1f5f9", text: "#475569" };
    }
  };

  if (!user) return null;

  return (
    <div style={{ position: "relative" }} ref={popoverRef}>
      <button
        onClick={handleToggle}
        aria-label="In-app notifications"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "38px",
          height: "38px",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          backgroundColor: isOpen ? "#f1f5f9" : "#ffffff",
          cursor: "pointer",
          fontSize: "1.1rem",
          transition: "all 0.15s ease",
        }}
      >
        <span role="img" aria-label="bell">🔔</span>
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: "-4px",
              right: "-4px",
              backgroundColor: "#ef4444",
              color: "#ffffff",
              fontSize: "0.7rem",
              fontWeight: 700,
              borderRadius: "999px",
              padding: "1px 5px",
              minWidth: "16px",
              height: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 4px rgba(239, 68, 68, 0.4)",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: "360px",
            maxHeight: "480px",
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
            border: "1px solid #e2e8f0",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              backgroundColor: "#fafafa",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a" }}>
                Notifications
              </span>
              {unreadCount > 0 && (
                <span
                  style={{
                    backgroundColor: "#e0e7ff",
                    color: "#4338ca",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: "999px",
                  }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  background: "none",
                  border: "none",
                  color: "#4f46e5",
                  fontSize: "0.775rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: "4px 8px",
                  borderRadius: "4px",
                }}
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Body */}
          <div
            style={{
              overflowY: "auto",
              maxHeight: "400px",
              padding: "4px 0",
            }}
          >
            {loading ? (
              <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: "0.875rem" }}>
                Loading updates...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center", color: "#64748b" }}>
                <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🎉</div>
                <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "#0f172a" }}>All caught up!</div>
                <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "4px" }}>
                  No notifications to show right now.
                </div>
              </div>
            ) : (
              notifications.map((notif) => {
                const badge = getTypeIcon(notif.type);
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    style={{
                      display: "flex",
                      gap: "12px",
                      padding: "12px 16px",
                      borderBottom: "1px solid #f8fafc",
                      cursor: "pointer",
                      backgroundColor: notif.isRead ? "#ffffff" : "#f0fdf4",
                      transition: "background-color 0.15s ease",
                      position: "relative",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = notif.isRead ? "#f8fafc" : "#e6f9ed";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = notif.isRead ? "#ffffff" : "#f0fdf4";
                    }}
                  >
                    {/* Icon */}
                    <div
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "8px",
                        backgroundColor: badge.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1rem",
                        flexShrink: 0,
                      }}
                    >
                      {badge.icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          marginBottom: "2px",
                        }}
                      >
                        <span
                          style={{
                            fontWeight: notif.isRead ? 600 : 700,
                            fontSize: "0.85rem",
                            color: notif.isRead ? "#334155" : "#0f172a",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "200px",
                          }}
                        >
                          {notif.title}
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "#94a3b8", flexShrink: 0 }}>
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.8rem",
                          color: "#64748b",
                          lineHeight: 1.35,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {notif.message}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!notif.isRead && (
                      <div
                        onClick={(e) => markAsRead(notif.id, e)}
                        title="Mark as read"
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "999px",
                          backgroundColor: "#16a34a",
                          alignSelf: "center",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
