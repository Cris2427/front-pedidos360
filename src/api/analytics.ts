// llamadas a las apis de kafka: report (kpis) y audit (historial)
// los datos los arman los consumidores de pedidos.eventos, no la ep4
import type { ApiClient } from './client';
import type { OrderStatus } from './orders';

export interface VentaPorHora {
  hora: string;
  pedidos: number;
  ventas: number;
}

export interface TopProducto {
  productoId: string;
  nombre: string;
  categoria: string;
  unidades: number;
  monto: number;
}

export interface ActivosPorEstado {
  estado: OrderStatus;
  pedidos: number;
}

export interface LeadTime {
  pedidos: number;
  promedioMin: number | null;
  porSucursal: { sucursalId: string; pedidos: number; promedioMin: number }[];
}

export interface Resumen {
  pedidos: number;
  porEstado: Partial<Record<OrderStatus, number>>;
  ventas: number;
  eventosAplicados: number;
}

export type TipoEvento =
  | 'PEDIDO_CREADO'
  | 'PEDIDO_ACEPTADO'
  | 'PEDIDO_EN_PREPARACION'
  | 'PEDIDO_DESPACHADO'
  | 'PEDIDO_ENTREGADO'
  | 'PEDIDO_CANCELADO';

export const TIPOS_EVENTO: TipoEvento[] = [
  'PEDIDO_CREADO',
  'PEDIDO_ACEPTADO',
  'PEDIDO_EN_PREPARACION',
  'PEDIDO_DESPACHADO',
  'PEDIDO_ENTREGADO',
  'PEDIDO_CANCELADO',
];

// quien, que, cuando y desde donde
export interface Registro {
  eventId: string;
  pedidoId: string;
  quien: { usuarioId: string; rol: 'CLIENTE' | 'OPERADOR' };
  que: TipoEvento;
  cuando: string;
  desdeDonde: { canal: 'APP' | 'WEB' | 'TELEFONO'; comuna: string; sucursalId: string };
  estadoAnterior: OrderStatus | null;
  estadoNuevo: OrderStatus;
  detalle: string;
}

export interface FiltrosAuditoria {
  usuario?: string;
  que?: TipoEvento;
  desde?: string;
  hasta?: string;
  limite?: number;
}

// las mismas sucursales del simulador (bridge/catalogo.js)
export const SUCURSALES: Record<string, string> = {
  'SUC-01': 'Providencia',
  'SUC-02': 'Ñuñoa',
  'SUC-03': 'La Florida',
};

export const CANAL_LABEL: Record<Registro['desdeDonde']['canal'], string> = {
  APP: 'App',
  WEB: 'Web',
  TELEFONO: 'Teléfono',
};

export const ROL_LABEL: Record<Registro['quien']['rol'], string> = {
  CLIENTE: 'Cliente',
  OPERADOR: 'Operador',
};

// si el servicio no esta corriendo, fetch falla sin respuesta: se dice cual
async function pedir<T>(api: ApiClient, ruta: string, servicio: string): Promise<T> {
  try {
    return await api.get<T>(ruta);
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`No responde el servicio ${servicio}. ¿Está corriendo?`, { cause: err });
    }
    throw err;
  }
}

export const reportApi = {
  ventasPorHora: (api: ApiClient) => pedir<VentaPorHora[]>(api, '/api/report/ventas-por-hora', 'report'),
  topProductos: (api: ApiClient, limite = 5) =>
    pedir<TopProducto[]>(api, `/api/report/top-productos?limite=${limite}`, 'report'),
  pedidosActivos: (api: ApiClient) => pedir<ActivosPorEstado[]>(api, '/api/report/pedidos-activos', 'report'),
  leadTime: (api: ApiClient) => pedir<LeadTime>(api, '/api/report/lead-time', 'report'),
  resumen: (api: ApiClient) => pedir<Resumen>(api, '/api/report/resumen', 'report'),
};

export const auditApi = {
  historial: (api: ApiClient, pedidoId: string) =>
    pedir<Registro[]>(api, `/api/audit/pedidos/${encodeURIComponent(pedidoId)}`, 'audit'),

  // solo van los filtros con valor: la api rechaza los vacios o desconocidos
  buscar: (api: ApiClient, filtros: FiltrosAuditoria) => {
    const query = new URLSearchParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== '') query.set(clave, String(valor));
    }
    const texto = query.toString();
    return pedir<Registro[]>(api, `/api/audit/registros${texto ? `?${texto}` : ''}`, 'audit');
  },
};