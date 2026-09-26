// src/Dashboard.tsx
// Vista PROTEGIDA: resumen de actividad según el perfil, como pide el caso.
//
//   Cliente   — sus pedidos: cuántos, en qué estado, cuánto lleva gastado.
//   Operador  — la operación completa: pedidos en curso, ventas, ticket medio.
//   Admin     — el catálogo: productos, unidades y valor del inventario.
//
// El Admin no ve ventas porque no tiene acceso al dominio de pedidos: su
// panel se arma solo con datos del catálogo. Cada panel pide únicamente los
// endpoints que su rol puede leer, así que ninguno provoca un 403.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { useApi } from './useApi';
import { useRoles } from './useRoles';
import { TokenInspector } from './TokenInspector';
import { ordersApi, ORDER_STATUS_LABEL, type Order, type OrderStatus } from './api/orders';
import { catalogApi, type Product } from './api/catalog';
import { describeError } from './lib/errors';
import { formatCLP, formatCompacto, formatNumero } from './lib/format';

/** Estados que cuentan como "pedido en curso" (ni entregado ni cancelado). */
const EN_CURSO: OrderStatus[] = ['CREADO', 'ACEPTADO', 'EN_PREPARACION', 'DESPACHADO'];

const ORDEN_ESTADOS: OrderStatus[] = [
  'CREADO',
  'ACEPTADO',
  'EN_PREPARACION',
  'DESPACHADO',
  'ENTREGADO',
  'CANCELADO',
];

export function Dashboard() {
  const { accounts } = useMsal();
  const api = useApi();
  const { roles, has, loading: cargandoRoles } = useRoles();
  const usuario = accounts[0];

  const verPedidos = has('Cliente', 'Operador');
  const verCatalogo = has('Admin', 'Operador');

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!api || cargandoRoles) return;
    try {
      // Nada de setState antes del await: el estado de carga arranca en true.
      const [pedidos, productos] = await Promise.all([
        verPedidos ? ordersApi.getOrders(api) : Promise.resolve([]),
        verCatalogo ? catalogApi.getProducts(api) : Promise.resolve([]),
      ]);
      setOrders(pedidos);
      setProducts(productos);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setCargando(false);
    }
  }, [api, cargandoRoles, verPedidos, verCatalogo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const kpisPedidos = useMemo(() => {
    const vivos = orders.filter((o) => EN_CURSO.includes(o.estado));
    const entregados = orders.filter((o) => o.estado === 'ENTREGADO');
    const facturado = entregados.reduce((suma, o) => suma + (o.total ?? 0), 0);
    const vendibles = orders.filter((o) => o.estado !== 'CANCELADO');
    return {
      total: orders.length,
      enCurso: vivos.length,
      facturado,
      ticket: vendibles.length ? Math.round(facturado / Math.max(entregados.length, 1)) : 0,
      entregados: entregados.length,
    };
  }, [orders]);

  const kpisCatalogo = useMemo(() => {
    const unidades = products.reduce((suma, p) => suma + (p.stock ?? 0), 0);
    const valor = products.reduce((suma, p) => suma + (p.precio ?? 0) * (p.stock ?? 0), 0);
    return {
      productos: products.length,
      unidades,
      valor,
      agotados: products.filter((p) => (p.stock ?? 0) === 0).length,
    };
  }, [products]);

  const porEstado = useMemo(
    () =>
      ORDEN_ESTADOS.map((estado) => ({
        etiqueta: ORDER_STATUS_LABEL[estado],
        valor: orders.filter((o) => o.estado === estado).length,
      })).filter((f) => f.valor > 0),
    [orders],
  );

  const stockPorProducto = useMemo(
    () =>
      [...products]
        .sort((a, b) => (b.stock ?? 0) - (a.stock ?? 0))
        .slice(0, 8)
        .map((p) => ({ etiqueta: p.nombre, valor: p.stock ?? 0 })),
    [products],
  );

  const inicial = usuario?.name?.charAt(0).toUpperCase() ?? 'U';

  return (
    <div className="card card-wide">
      <header className="panel-head">
        <div className="avatar avatar-inline">{inicial}</div>
        <div>
          <h2>Hola, {usuario?.name ?? 'Usuario'}</h2>
          <p className="panel-sub">
            {usuario?.username}
            {roles.length > 0 && (
              <>
                {' · '}
                {roles.map((r) => (
                  <span key={r} className="badge badge-rol">
                    {r}
                  </span>
                ))}
              </>
            )}
          </p>
        </div>
      </header>

      {error && <p className="alert">{error}</p>}

      {cargando ? (
        <p className="subtitle">Cargando tu resumen…</p>
      ) : (
        <>
          {verPedidos && (
            <section className="panel">
              <h3 className="panel-title">
                {has('Operador') ? 'Operación' : 'Mis pedidos'}
              </h3>
              <div className="kpi-row">
                <Kpi etiqueta="Pedidos" valor={formatNumero(kpisPedidos.total)} />
                <Kpi etiqueta="En curso" valor={formatNumero(kpisPedidos.enCurso)} />
                <Kpi
                  etiqueta={has('Operador') ? 'Ventas entregadas' : 'Total gastado'}
                  valor={formatCompacto(kpisPedidos.facturado)}
                  detalle={`${kpisPedidos.entregados} entregado${kpisPedidos.entregados === 1 ? '' : 's'}`}
                />
                <Kpi
                  etiqueta="Ticket promedio"
                  valor={kpisPedidos.entregados ? formatCompacto(kpisPedidos.ticket) : '—'}
                />
              </div>

              {porEstado.length > 0 && (
                <Barras titulo="Pedidos por estado" datos={porEstado} sufijo="" />
              )}
            </section>
          )}

          {verCatalogo && (
            <section className="panel">
              <h3 className="panel-title">Inventario</h3>
              <div className="kpi-row">
                <Kpi etiqueta="Productos" valor={formatNumero(kpisCatalogo.productos)} />
                <Kpi etiqueta="Unidades en stock" valor={formatNumero(kpisCatalogo.unidades)} />
                <Kpi
                  etiqueta="Valor del inventario"
                  valor={formatCompacto(kpisCatalogo.valor)}
                  detalle={formatCLP(kpisCatalogo.valor)}
                />
                <Kpi
                  etiqueta="Sin stock"
                  valor={formatNumero(kpisCatalogo.agotados)}
                  alerta={kpisCatalogo.agotados > 0}
                />
              </div>

              {stockPorProducto.length > 0 && (
                <Barras titulo="Stock por producto" datos={stockPorProducto} sufijo=" u." />
              )}
            </section>
          )}

          {!verPedidos && !verCatalogo && (
            <p className="subtitle">
              Tu cuenta todavía no tiene un App Role asignado, así que no hay nada que resumir.
              Pídele a un administrador del tenant que te asigne uno.
            </p>
          )}
        </>
      )}

      <details className="tecnico">
        <summary>Detalle técnico del token</summary>
        <TokenInspector />
      </details>
    </div>
  );
}

/** Tarjeta de KPI: etiqueta, valor y un detalle opcional. */
function Kpi({
  etiqueta,
  valor,
  detalle,
  alerta,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  alerta?: boolean;
}) {
  return (
    <div className="kpi">
      <span className="kpi-label">{etiqueta}</span>
      <span className={alerta ? 'kpi-value kpi-alerta' : 'kpi-value'}>{valor}</span>
      {detalle && <span className="kpi-detalle">{detalle}</span>}
    </div>
  );
}

/**
 * Barras horizontales de una sola tonalidad: el color no codifica nada, el
 * largo sí. El valor va al extremo de cada barra, no repartido por el gráfico.
 */
function Barras({
  titulo,
  datos,
  sufijo,
}: {
  titulo: string;
  datos: { etiqueta: string; valor: number }[];
  sufijo: string;
}) {
  const maximo = Math.max(...datos.map((d) => d.valor), 1);

  return (
    <figure className="grafico">
      <figcaption className="grafico-titulo">{titulo}</figcaption>
      {datos.map((d) => (
        <div className="grafico-fila" key={d.etiqueta}>
          <span className="grafico-etiqueta" title={d.etiqueta}>
            {d.etiqueta}
          </span>
          <span className="grafico-pista">
            <span
              className="grafico-barra"
              style={{ width: `${Math.max((d.valor / maximo) * 100, 2)}%` }}
            />
          </span>
          <span className="grafico-valor">
            {formatNumero(d.valor)}
            {sufijo}
          </span>
        </div>
      ))}
    </figure>
  );
}
