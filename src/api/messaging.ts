// el microservicio administrador: solo el Admin, con el scope messaging.manage
// la pantalla crea y borra colas; topics y bindings solo se muestran
import type { ApiClient } from './client';
import { unwrapList } from './client';

export interface Mensajes {
  disponibles: number;
  enProceso: number;
}

export interface Cola {
  nombre: string;
  arn: string;
  visibilidadSegundos: number;
  maxReceiveCount: number | null;
  mensajes: Mensajes;
  dlq: { nombre: string; mensajes: Mensajes | null } | null;
  consumidor: string | null;
}

export interface NuevaCola {
  nombre: string;
  maxReceiveCount?: number;
  visibilidadSegundos?: number;
}

export interface Topic {
  nombre: string;
  arn: string;
  suscripciones: number;
}

export type FiltroSns = Record<string, unknown[]>;

export interface Binding {
  id: string;
  topic: string;
  cola: string;
  filtro: FiltroSns | null;
  entregaSinProcesar: boolean;
}

const conNombre = (base: string, nombre: string) => `${base}/${encodeURIComponent(nombre)}`;

export const messagingApi = {
  getColas: async (api: ApiClient): Promise<Cola[]> =>
    unwrapList<Cola>(await api.get<unknown>('/api/admin/queues')),

  // crea tambien su dlq, con el sufijo -dlq
  createCola: (api: ApiClient, cola: NuevaCola): Promise<Cola> =>
    api.post<Cola>('/api/admin/queues', cola),

  deleteCola: (api: ApiClient, nombre: string): Promise<{ eliminada: string; dlq: string | null }> =>
    api.del(conNombre('/api/admin/queues', nombre)),

  getTopics: async (api: ApiClient): Promise<Topic[]> =>
    unwrapList<Topic>(await api.get<unknown>('/api/admin/topics')),

  getBindings: async (api: ApiClient): Promise<Binding[]> =>
    unwrapList<Binding>(await api.get<unknown>('/api/admin/bindings')),
};
