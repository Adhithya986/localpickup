import { useState, useEffect } from "react";

export interface CartItem {
  productId: string;
  title: string;
  price: number;
  quantity: number;
  maxStock: number;
  imageUrl?: string | null;
  description?: string | null;
}

export interface CartPrintJob {
  paper: "A4" | "A3";
  colour: "bw" | "colour";
  sides: "single" | "double";
  copies: number;
  binding: boolean;
  lamination: boolean;
  fileName: string;
  file?: File | null;
  calculatedPrice: number;
}

export interface CartState {
  shopId: string | null;
  shopName: string | null;
  items: CartItem[];
  printJob?: CartPrintJob;
}

const CART_KEY = "localpickup_cart";

const defaultCart: CartState = {
  shopId: null,
  shopName: null,
  items: [],
};

let inMemoryPrintFile: File | null = null;

export function getPrintFile(): File | null {
  return inMemoryPrintFile;
}

export function setPrintFile(f: File | null): void {
  inMemoryPrintFile = f;
}

export function getCart(): CartState {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return defaultCart;
    const parsed = JSON.parse(raw);
    const printJob = parsed.printJob
      ? {
          ...parsed.printJob,
          file: inMemoryPrintFile,
        }
      : undefined;

    return {
      shopId: parsed.shopId || null,
      shopName: parsed.shopName || null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
      printJob,
    };
  } catch {
    return defaultCart;
  }
}

export function saveCart(cart: CartState): void {
  if (cart.printJob?.file) {
    inMemoryPrintFile = cart.printJob.file;
  }
  // We do not serialize the binary File object in localStorage
  const serialized = {
    ...cart,
    printJob: cart.printJob
      ? {
          ...cart.printJob,
          file: undefined,
        }
      : undefined,
  };
  localStorage.setItem(CART_KEY, JSON.stringify(serialized));
  window.dispatchEvent(new Event("cart_updated"));
}

export function addToCart(
  shopId: string,
  shopName: string,
  item: Omit<CartItem, "quantity">,
  quantity: number = 1
): { success: boolean; error?: string } {
  const cart = getCart();

  // Cross-shop cart defense
  if (cart.shopId && cart.shopId !== shopId && (cart.items.length > 0 || cart.printJob)) {
    return {
      success: false,
      error: `Your cart contains items from "${cart.shopName}". Orders can only contain items from a single shop. Please complete or clear your current cart first.`,
    };
  }

  cart.shopId = shopId;
  cart.shopName = shopName;

  const existingIdx = cart.items.findIndex((it) => it.productId === item.productId);

  if (existingIdx >= 0) {
    const existing = cart.items[existingIdx];
    const newQty = existing.quantity + quantity;
    if (newQty > item.maxStock) {
      return {
        success: false,
        error: `Cannot add more. Only ${item.maxStock} in stock.`,
      };
    }
    existing.quantity = newQty;
  } else {
    if (quantity > item.maxStock) {
      return {
        success: false,
        error: `Cannot add ${quantity}. Only ${item.maxStock} available.`,
      };
    }
    cart.items.push({
      ...item,
      quantity,
    });
  }

  saveCart(cart);
  return { success: true };
}

export function updateQuantity(productId: string, newQty: number): { success: boolean; error?: string } {
  const cart = getCart();
  const item = cart.items.find((it) => it.productId === productId);
  if (!item) return { success: false, error: "Item not found in cart" };

  if (newQty <= 0) {
    return removeFromCart(productId);
  }

  if (newQty > item.maxStock) {
    return { success: false, error: `Only ${item.maxStock} available in stock.` };
  }

  item.quantity = newQty;
  saveCart(cart);
  return { success: true };
}

export function removeFromCart(productId: string): { success: boolean } {
  const cart = getCart();
  cart.items = cart.items.filter((it) => it.productId !== productId);
  if (cart.items.length === 0 && !cart.printJob) {
    cart.shopId = null;
    cart.shopName = null;
  }
  saveCart(cart);
  return { success: true };
}

export function setPrintJobInCart(
  shopId: string,
  shopName: string,
  printJob: CartPrintJob
): { success: boolean; error?: string } {
  const cart = getCart();

  if (cart.shopId && cart.shopId !== shopId && (cart.items.length > 0 || cart.printJob)) {
    return {
      success: false,
      error: `Your cart contains items from "${cart.shopName}". A single pickup order cannot mix items from multiple shops.`,
    };
  }

  cart.shopId = shopId;
  cart.shopName = shopName;
  cart.printJob = printJob;
  saveCart(cart);
  return { success: true };
}

export function removePrintJob(): void {
  inMemoryPrintFile = null;
  const cart = getCart();
  cart.printJob = undefined;
  if (cart.items.length === 0) {
    cart.shopId = null;
    cart.shopName = null;
  }
  saveCart(cart);
}

export function clearCart(): void {
  inMemoryPrintFile = null;
  localStorage.removeItem(CART_KEY);
  window.dispatchEvent(new Event("cart_updated"));
}

export function getCartSummary(cart: CartState) {
  const stationeryTotal = cart.items.reduce((acc, it) => acc + it.price * it.quantity, 0);
  const printTotal = cart.printJob ? cart.printJob.calculatedPrice : 0;
  const itemCount = cart.items.reduce((acc, it) => acc + it.quantity, 0) + (cart.printJob ? 1 : 0);
  return {
    stationeryTotal,
    printTotal,
    grandTotal: stationeryTotal + printTotal,
    itemCount,
  };
}

export function useCart() {
  const [cart, setCart] = useState<CartState>(getCart);

  useEffect(() => {
    const handleUpdate = () => setCart(getCart());
    window.addEventListener("cart_updated", handleUpdate);
    return () => window.removeEventListener("cart_updated", handleUpdate);
  }, []);

  return {
    cart,
    summary: getCartSummary(cart),
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
  };
}
