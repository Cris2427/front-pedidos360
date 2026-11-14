// llamadas al microservicio administrador de kafka (admin/api.js del backend)
// las reglas (que se puede borrar, 409, 400) las aplica el backend: la
// pantalla solo muestra lo que responde
import type { ApiClient } from './client';

export interface Cluster {
  clusterId: string;
  controlador: number;
  brokers: { id: number; host: string }[];
}

export interface Topico {
  nombre: string;
  gestionado: boolean;
  particiones: number;
  replicas: number;
  limpieza: 'delete' | 'compact';
  retencionDias: number | null;
  retencionMbPorParticion: number | null;
  minInsync: number;
  mensajes: number;
  particionesConCopiaAtrasada: number;
}

export interface DetalleTopico extends Topico {
  configuracion: Record<string, string>;
  porParticion: {
    particion: number;
    lider: number;
    replicas: number[];
    alDia: number[];
    inicio: number;
    fin: number;
  }[];
  grupos: { grupo: string; estado: string; instancias: number; lag: number }[];
  cambios?: string[];
  aviso?: string;
}

export interface NuevoTopico {
  nombre: string;
  particiones: number;
  replicas: number;
  retencionDias: number;
  limpieza: 'delete' | 'compact';
  minInsync: number;
}

export type CambioConfig = Partial<Pick<NuevoTopico, 'retencionDias' | 'limpieza' | 'minInsync'>>;

export interface Grupo {
  grupo: string;
  estado: string;
  instancias: number;
  lag: number;
  topicos: string[];
}

export interface MensajeDlt {
  particion: number;
  offset: number;
  key?: string;
  fecha?: string;
  motivo?: string;
  error?: string;
  origen: { topico?: string; particion: number; offset: number; grupo?: string };
  intentos: number;
  correlationId?: string;
  reprocesado: boolean;
}

export interface Dlt {
  topico: string;
  total: number;
  pendientes: number;
  mensajes: MensajeDlt[];
}

export interface Reproceso {
  topico: string;
  reprocesados: number;
  porTopico: Record<string, number>;
  sinOrigen: number;
}

// lo que dice kafka del estado de un grupo, en palabras
export const ESTADO_GRUPO: Record<string, string> = {
  Stable: 'Leyendo',
  Empty: 'Sin instancias',
  PreparingRebalance: 'Rebalanceando',
  CompletingRebalance: 'Rebalanceando',
};

// si el servicio no esta corriendo, fetch falla sin respuesta: se dice cual
async function llamar<T>(api: ApiClient, ruta: string, init?: RequestInit): Promise<T> {
  try {
    return await api.request<T>(ruta, init);
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('No responde el servicio admin de Kafka. ¿Está corriendo?', { cause: err });
    }
    throw err;
  }
}

const conCuerpo = (method: string, cuerpo: unknown = {}): RequestInit => ({
  method,
  body: JSON.stringify(cuerpo),
});

const ruta = (nombre: string) => encodeURIComponent(nombre);

export const kafkaApi = {
  cluster: (api: ApiClient) => llamar<Cluster>(api, '/api/admin/cluster'),

  topicos: (api: ApiClient) => llamar<Topico[]>(api, '/api/admin/topicos'),
  detalleTopico: (api: ApiClient, nombre: string) =>
    llamar<DetalleTopico>(api, `/api/admin/topicos/${ruta(nombre)}`),
  crearTopico: (api: ApiClient, topico: NuevoTopico) =>
    llamar<DetalleTopico>(api, '/api/admin/topicos', conCuerpo('POST', topico)),
  cambiarConfig: (api: ApiClient, nombre: string, cambios: CambioConfig) =>
    llamar<DetalleTopico>(api, `/api/admin/topicos/${ruta(nombre)}/configuracion`, conCuerpo('PATCH', cambios)),
  agregarParticiones: (api: ApiClient, nombre: string, total: number) =>
    llamar<DetalleTopico>(api, `/api/admin/topicos/${ruta(nombre)}/particiones`, conCuerpo('POST', { total })),
  borrarTopico: (api: ApiClient, nombre: string) =>
    llamar<{ borrado: string }>(api, `/api/admin/topicos/${ruta(nombre)}`, { method: 'DELETE' }),

  grupos: (api: ApiClient) => llamar<Grupo[]>(api, '/api/admin/grupos'),
  moverOffsets: (api: ApiClient, grupo: string, topico: string, posicion: 'inicio' | 'fin') =>
    llamar<{ lag: number }>(api, `/api/admin/grupos/${ruta(grupo)}/offsets`, conCuerpo('POST', { topico, posicion })),
  borrarGrupo: (api: ApiClient, grupo: string) =>
    llamar<{ borrado: string }>(api, `/api/admin/grupos/${ruta(grupo)}`, { method: 'DELETE' }),

  dlt: (api: ApiClient, servicio: string) => llamar<Dlt>(api, `/api/admin/dlt/${ruta(servicio)}`),
  reprocesar: (api: ApiClient, servicio: string) =>
    llamar<Reproceso>(api, `/api/admin/dlt/${ruta(servicio)}/reprocesar`, conCuerpo('POST')),
};