import React from "react";
import { useNavigate } from "react-router-dom";
import { useCart, updateQuantity, removeFromCart, removePrintJob, clearCart } from "../utils/cart";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { cart, summary } = useCart();

  if (!isOpen) return null;

  const handleProceed = () => {
    onClose();
    navigate("/pickup", {
      state: {
        shopId: cart.shopId,
        shopName: cart.shopName,
        items: cart.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          title: it.title,
          price: it.price,
        })),
        file: cart.printJob?.file,
        fileName: cart.printJob?.fileName,
        paper: cart.printJob?.paper,
        colour: cart.printJob?.colour,
        sides: cart.printJob?.sides,
        copies: cart.printJob?.copies,
        binding: cart.printJob?.binding,
        lamination: cart.printJob?.lamination,
        total: summary.grandTotal,
      },
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(2px)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          height: "100%",
          backgroundColor: "#ffffff",
          boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.12)",
          display: "flex",
          flexDirection: "column",
          cursor: "default",
          animation: "slideIn 0.25s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#0f172a", fontWeight: 700 }}>
              Shopping Cart ({summary.itemCount})
            </h2>
            {cart.shopName && (
              <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#4f46e5", fontWeight: 500 }}>
                Pickup from: {cart.shopName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.5rem",
              color: "#64748b",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "1.5rem" }}>
          {summary.itemCount === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "#64748b" }}>
              <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>🛒</div>
              <h3 style={{ margin: "0 0 0.5rem", color: "#1e293b", fontSize: "1.2rem" }}>Your cart is empty</h3>
              <p style={{ fontSize: "0.9rem", color: "#64748b", maxWidth: "280px", margin: "0 auto 1.5rem" }}>
                Add stationery items or document printing from a shop's catalog to get started.
              </p>
              <button
                onClick={() => {
                  onClose();
                  navigate("/shops");
                }}
                style={{
                  background: "#4f46e5",
                  color: "#fff",
                  border: "none",
                  padding: "0.6rem 1.25rem",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                }}
              >
                Browse Local Shops
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Printing Service Item if present */}
              {cart.printJob && (
                <div
                  style={{
                    border: "1px solid #e0e7ff",
                    backgroundColor: "#f8faff",
                    borderRadius: "10px",
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          backgroundColor: "#4f46e5",
                          color: "white",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: 600,
                        }}
                      >
                        PRINTING SERVICE
                      </span>
                      <h4 style={{ margin: "6px 0 2px", fontSize: "1rem", color: "#0f172a" }}>
                        {cart.printJob.fileName || "Uploaded Document"}
                      </h4>
                      <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b" }}>
                        {cart.printJob.paper} • {cart.printJob.colour === "colour" ? "Color" : "B&W"} •{" "}
                        {cart.printJob.sides === "double" ? "2-Sided" : "1-Sided"} • {cart.printJob.copies}{" "}
                        {cart.printJob.copies > 1 ? "copies" : "copy"}
                        {cart.printJob.binding ? " • Spiral Bound" : ""}
                        {cart.printJob.lamination ? " • Laminated" : ""}
                      </p>
                    </div>
                    <button
                      onClick={removePrintJob}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        padding: "2px 4px",
                      }}
                      title="Remove print job"
                    >
                      Remove
                    </button>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", fontWeight: 700, color: "#1e293b" }}>
                    ₹{cart.printJob.calculatedPrice}
                  </div>
                </div>
              )}

              {/* Stationery Items */}
              {cart.items.map((item) => (
                <div
                  key={item.productId}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: "0 0 4px", fontSize: "0.95rem", color: "#0f172a", fontWeight: 600 }}>
                      {item.title}
                    </h4>
                    <p style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "#64748b" }}>
                      ₹{item.price} each • Subtotal: <strong style={{ color: "#0f172a" }}>₹{item.price * item.quantity}</strong>
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        style={{
                          width: "28px",
                          height: "28px",
                          border: "1px solid #cbd5e1",
                          background: "#f8fafc",
                          borderRadius: "6px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        -
                      </button>
                      <span style={{ fontSize: "0.9rem", fontWeight: 600, minWidth: "20px", textAlign: "center" }}>
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        disabled={item.quantity >= item.maxStock}
                        style={{
                          width: "28px",
                          height: "28px",
                          border: "1px solid #cbd5e1",
                          background: item.quantity >= item.maxStock ? "#f1f5f9" : "#f8fafc",
                          color: item.quantity >= item.maxStock ? "#94a3b8" : "#0f172a",
                          borderRadius: "6px",
                          fontWeight: 700,
                          cursor: item.quantity >= item.maxStock ? "not-allowed" : "pointer",
                        }}
                        title={item.quantity >= item.maxStock ? "Maximum stock reached" : "Add one"}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.productId)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#94a3b8",
                      fontSize: "1.2rem",
                      cursor: "pointer",
                      padding: "4px",
                    }}
                    title="Remove item"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Summary & Checkout */}
        {summary.itemCount > 0 && (
          <div
            style={{
              padding: "1.25rem 1.5rem",
              borderTop: "1px solid #e2e8f0",
              backgroundColor: "#f8fafc",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.875rem", color: "#64748b" }}>
              <span>Stationery items:</span>
              <span>₹{summary.stationeryTotal}</span>
            </div>
            {summary.printTotal > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.875rem", color: "#64748b" }}>
                <span>Printing charges:</span>
                <span>₹{summary.printTotal}</span>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "1.25rem",
                fontSize: "1.15rem",
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              <span>Total for Self-Pickup:</span>
              <span style={{ color: "#4f46e5" }}>₹{summary.grandTotal}</span>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                onClick={clearCart}
                style={{
                  padding: "0.75rem",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#64748b",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                Clear
              </button>
              <button
                onClick={handleProceed}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  border: "none",
                  backgroundColor: "#4f46e5",
                  color: "#ffffff",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  cursor: "pointer",
                }}
              >
                Select Pickup Time →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
