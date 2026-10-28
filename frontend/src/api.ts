const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api');
export const tokenKey = 'stockflow_token';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  const token = localStorage.getItem(tokenKey);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Something went wrong. Please try again.');
  return body as T;
}

export type User = { id: string; email: string; organization: { id: string; name: string; defaultLowStockThreshold: number } };
export type Product = { id: string; name: string; sku: string; description: string | null; quantity: number; costPrice: number | null; sellingPrice: number | null; lowStockThreshold: number | null; effectiveThreshold?: number; updatedAt: string };
export type Dashboard = { totalProducts: number; totalUnits: number; lowStockCount: number; lowStock: (Product & { effectiveThreshold: number })[]; recentProducts: Product[] };
