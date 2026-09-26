// src/api/catalog.ts
// Dominio CATÁLOGO. Scopes: catalog.read / catalog.write.
// En AWS cada operación es una Lambda distinta (una por método y ruta).
import type { ApiClient } from './client';
import { unwrapList } from './client';

export interface Product {
  id?: string;
  nombre: string;
  precio: number;
  stock: number;
}

export const catalogApi = {
  // GET /api/catalog  ·  scope catalog.read  ·  cualquier rol
  getProducts: async (api: ApiClient): Promise<Product[]> => {
    const raw = await api.get<unknown>('/api/catalog');
    return unwrapList<Product>(raw, 'products', 'productos', 'catalog');
  },

  // POST /api/catalog  ·  catalog.write  ·  rol Admin
  createProduct: (api: ApiClient, product: Omit<Product, 'id'>): Promise<Product> =>
    api.post<Product>('/api/catalog', product),

  // PUT /api/catalog/{id}  ·  catalog.write  ·  rol Admin
  updateProduct: (api: ApiClient, id: string, product: Omit<Product, 'id'>): Promise<Product> =>
    api.put<Product>(`/api/catalog/${encodeURIComponent(id)}`, product),

  // PUT /api/catalog/{id}/stock  ·  catalog.write  ·  rol Admin
  updateStock: (api: ApiClient, id: string, stock: number): Promise<Product> =>
    api.put<Product>(`/api/catalog/${encodeURIComponent(id)}/stock`, { stock }),

  // DELETE /api/catalog/{id}  ·  catalog.write  ·  rol Admin
  deleteProduct: (api: ApiClient, id: string): Promise<{ eliminado: string }> =>
    api.del<{ eliminado: string }>(`/api/catalog/${encodeURIComponent(id)}`),
};
