// llamadas del catalogo
// cada una pega a una lambda distinta en aws
import type { ApiClient } from './client';
import { unwrapList } from './client';

export interface Product {
  id?: string;
  nombre: string;
  precio: number;
  stock: number;
}

export const catalogApi = {
  // lo puede leer cualquiera que tenga el scope
  getProducts: async (api: ApiClient): Promise<Product[]> => {
    const raw = await api.get<unknown>('/api/catalog');
    return unwrapList<Product>(raw, 'products', 'productos', 'catalog');
  },

  // crear, editar, stock y borrar son solo del admin
  createProduct: (api: ApiClient, product: Omit<Product, 'id'>): Promise<Product> =>
    api.post<Product>('/api/catalog', product),

  updateProduct: (api: ApiClient, id: string, product: Omit<Product, 'id'>): Promise<Product> =>
    api.put<Product>(`/api/catalog/${encodeURIComponent(id)}`, product),

  updateStock: (api: ApiClient, id: string, stock: number): Promise<Product> =>
    api.put<Product>(`/api/catalog/${encodeURIComponent(id)}/stock`, { stock }),

  deleteProduct: (api: ApiClient, id: string): Promise<{ eliminado: string }> =>
    api.del<{ eliminado: string }>(`/api/catalog/${encodeURIComponent(id)}`),
};
