// llamadas de pedidos
// el crud es del cliente y del operador, el admin no entra aca
// cada operacion pega a una lambda distinta en aws
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

// de cada estado, a cuales se puede pasar
// con esto dibujamos solo los botones que corresponden, igual la lambda lo
// vuelve a revisar
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

// solo se puede tocar mientras no haya stock comprometido
export const ESTADOS_EDITABLES: OrderStatus[] = ['CREADO'];
export const ESTADOS_BORRABLES: OrderStatus[] = ['CREADO', 'CANCELADO'];

export type NuevoPedido = Pick<Order, 'clienteId' | 'items'>;

export const ordersApi = {
  // el cliente ve los suyos y el operador ve todos, eso lo filtra el backend
  getOrders: async (api: ApiClient): Promise<Order[]> => {
    const raw = await api.get<unknown>('/api/orders');
    return unwrapList<Order>(raw, 'orders', 'pedidos');
  },

  createOrder: (api: ApiClient, order: NuevoPedido): Promise<Order> =>
    api.post<Order>('/api/orders', order),

  updateOrder: (api: ApiClient, id: string, order: NuevoPedido): Promise<Order> =>
    api.put<Order>(`/api/orders/${encodeURIComponent(id)}`, order),

  // cambiar el estado es solo del operador
  updateStatus: (api: ApiClient, id: string, estado: OrderStatus): Promise<Order> =>
    api.request<Order>(`/api/orders/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ estado }),
    }),

  deleteOrder: (api: ApiClient, id: string): Promise<{ eliminado: string }> =>
    api.del<{ eliminado: string }>(`/api/orders/${encodeURIComponent(id)}`),
};
