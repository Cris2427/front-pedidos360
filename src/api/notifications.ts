// lo que registraron los consumidores de la mensajeria
import type { ApiClient } from './client';
import { unwrapList } from './client';

export type Canal = 'email' | 'bodega' | 'boleta';

export interface Notificacion {
  id: string;
  canal: Canal;
  tipo: string;
  pedidoId: string;
  clienteId?: string;
  titulo: string;
  detalle?: string[];
  boleta?: { neto: number; iva: number; total: number };
  ocurridoEn?: string;
  creadoEn: string;
}

export const CANAL_LABEL: Record<Canal, string> = {
  email: 'Correo',
  bodega: 'Bodega',
  boleta: 'Boleta',
};

export const notificationsApi = {
  // el cliente recibe solo las suyas, el operador todas: lo filtra la lambda
  getNotifications: async (api: ApiClient): Promise<Notificacion[]> => {
    const raw = await api.get<unknown>('/api/notifications');
    return unwrapList<Notificacion>(raw, 'notificaciones');
  },
};
