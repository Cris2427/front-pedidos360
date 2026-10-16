import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from './useApi';
import { useRoles } from './useRoles';
import { notificationsApi, CANAL_LABEL, type Canal, type Notificacion } from './api/notifications';
import { describeError } from './lib/errors';
import { formatCLP } from './lib/format';

// llegan unos segundos despues de cada cambio porque las procesa la mensajeria,
// no la peticion, asi que la pantalla se refresca sola
const REFRESCO_MS = 10_000;

const hora = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'medium' }) : '—';

export function NotificationsView() {
  const api = useApi();
  const { has } = useRoles();
  const esOperador = has('Operador');

  const [items, setItems] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canal, setCanal] = useState<'todos' | Canal>('todos');
  const [actualizado, setActualizado] = useState<Date | null>(null);

  const cargar = useCallback(async () => {
    if (!api) return;
    try {
      setItems(await notificationsApi.getNotifications(api));
      setActualizado(new Date());
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  const canales: Canal[] = esOperador ? ['email', 'bodega', 'boleta'] : ['email', 'boleta'];
  const visibles = useMemo(
    () => (canal === 'todos' ? items : items.filter((n) => n.canal === canal)),
    [items, canal],
  );

  return (
    <div className="card card-wide">
      <h2>Notificaciones</h2>
      <p className="subtitle">
        {esOperador
          ? 'Todo lo que hizo la mensajería: correos a los clientes, órdenes para bodega y boletas.'
          : 'Los correos y las boletas de tus pedidos.'}{' '}
        Llegan unos segundos después de cada cambio, porque se procesan de forma asíncrona.
      </p>

      <div className="form-row">
        <label className="field field-sm">
          <span>Canal</span>
          <select value={canal} onChange={(e) => setCanal(e.target.value as 'todos' | Canal)}>
            <option value="todos">Todos</option>
            {canales.map((c) => (
              <option key={c} value={c}>
                {CANAL_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-ghost" type="button" onClick={cargar} disabled={!api}>
          Actualizar
        </button>
        {actualizado && (
          <span className="muted">Actualizado a las {actualizado.toLocaleTimeString('es-CL')}</span>
        )}
      </div>

      {error && <p className="alert">{error}</p>}

      {loading ? (
        <p className="subtitle">Cargando notificaciones…</p>
      ) : visibles.length === 0 ? (
        <p className="subtitle">Todavía no hay notificaciones.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Hora del evento</th>
                <th>Canal</th>
                <th>Pedido</th>
                <th>Detalle</th>
                {esOperador && <th>Cliente</th>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((n) => (
                <tr key={n.id}>
                  <td className="hora">{hora(n.ocurridoEn ?? n.creadoEn)}</td>
                  <td>
                    <span className={`badge badge-canal-${n.canal}`}>{CANAL_LABEL[n.canal] ?? n.canal}</span>
                  </td>
                  <td>
                    <code>{n.pedidoId}</code>
                  </td>
                  <td>
                    <Detalle n={n} />
                  </td>
                  {esOperador && (
                    <td className="cliente" title={n.clienteId}>
                      {n.clienteId ?? '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Detalle({ n }: { n: Notificacion }) {
  return (
    <div className="notif-detalle">
      <strong>{n.titulo}</strong>
      {n.detalle && n.detalle.length > 0 && (
        <ul>
          {n.detalle.map((linea, i) => (
            <li key={i}>{linea}</li>
          ))}
        </ul>
      )}
      {n.boleta && (
        <span className="muted">
          Neto {formatCLP(n.boleta.neto)} · IVA {formatCLP(n.boleta.iva)} · Total {formatCLP(n.boleta.total)}
        </span>
      )}
    </div>
  );
}
