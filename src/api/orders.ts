// src/api/orders.ts
// Dominio PEDIDOS. Scopes: orders.read / orders.write.
// El CRUD es del Cliente y del Operador; el Admin no participa.
// En AWS cada operación es una Lambda distinta (una por método y ruta).
import type { ApiClient } from './client';
import { unwrapList } from './client';

export type OrderStatus =
  | 'CREADO'
  | 'ACEPTADO'
  | 'EN_PREPARACION'
  | 'DESPACHADO'
  | 'ENTREGADO'
  | 'CANCELADO';

export interface OrderItem {
  productoId: string;
  cantidad: number;
  precio?: number;
}

export interface Order {
  id?: string;
  clienteId: string;
  items: OrderItem[];
  total: number;
  estado: OrderStatus;
  creadoEn?: string;
}

/**
 * Máquina de estados del pedido: desde cada estado, a cuáles se puede pasar.
 * La UI solo ofrece las transiciones válidas; la Lambda las revalida.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  CREADO: ['ACEPTADO', 'CANCELADO'],
  ACEPTADO: ['EN_PREPARACION', 'CANCELADO'],
  EN_PREPARACION: ['DESPACHADO'],
  DESPACHADO: ['ENTREGADO'],
  ENTREGADO: [],
  CANCELADO: [],
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  CREADO: 'Creado',
  ACEPTADO: 'Aceptado',
  EN_PREPARACION: 'En preparación',
  DESPACHADO: 'Despachado',
  ENTREGADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

/** Un pedido solo se edita o elimina mientras no tenga stock comprometido. */
export const ESTADOS_EDITABLES: OrderStatus[] = ['CREADO'];
export const ESTADOS_BORRABLES: OrderStatus[] = ['CREADO', 'CANCELADO'];

export type NuevoPedido = Pick<Order, 'clienteId' | 'items'>;

export const ordersApi = {
  // GET /api/orders  ·  orders.read  ·  Cliente (los suyos) u Operador (todos)
  getOrders: async (api: ApiClient): Promise<Order[]> => {
    const raw = await api.get<unknown>('/api/orders');
    return unwrapList<Order>(raw, 'orders', 'pedidos');
  },

  // POST /api/orders  ·  orders.write  ·  Cliente u Operador
  createOrder: (api: ApiClient, order: NuevoPedido): Promise<Order> =>
    api.post<Order>('/api/orders', order),

  // PUT /api/orders/{id}  ·  orders.write  ·  Cliente (propio) u Operador
  updateOrder: (api: ApiClient, id: string, order: NuevoPedido): Promise<Order> =>
    api.put<Order>(`/api/orders/${encodeURIComponent(id)}`, order),

  // PATCH /api/orders/{id}/status  ·  orders.write  ·  rol Operador
  updateStatus: (api: ApiClient, id: string, estado: OrderStatus): Promise<Order> =>
    api.request<Order>(`/api/orders/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ estado }),
    }),

  // DELETE /api/orders/{id}  ·  orders.write  ·  Cliente (propio) u Operador
  deleteOrder: (api: ApiClient, id: string): Promise<{ eliminado: string }> =>
    api.del<{ eliminado: string }>(`/api/orders/${encodeURIComponent(id)}`),
};
