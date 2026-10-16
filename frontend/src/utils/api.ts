export function getToken(): string | null {
  return localStorage.getItem("token");
}

export function getUser(): any | null {
  const userStr = localStorage.getItem("user");
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

export function saveAuth(data: { token?: string; user?: any; [key: string]: any }) {
  if (data.token) {
    localStorage.setItem("token", data.token);
  }
  const userObj = data.user || {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,
    shopId: data.shopId,
  };
  localStorage.setItem("user", JSON.stringify(userObj));
}

export function clearAuth() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
