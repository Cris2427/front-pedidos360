// auditoria: quien hizo que, cuando y desde donde con cada pedido
// los registros los arma el servicio audit a partir de los eventos de kafka
import { useEffect, useState, type FormEvent } from 'react';
import { useApi } from './useApi';
import { analyticsConfig } from './authConfig';
import {
  auditApi,
  CANAL_LABEL,
  ROL_LABEL,
  SUCURSALES,
  TIPOS_EVENTO,
  type Registro,
  type TipoEvento,
} from './api/analytics';
import { ORDER_STATUS_LABEL, type OrderStatus } from './api/orders';
import { describeError } from './lib/errors';
import { formatNumero } from './lib/format';

const LIMITES = ['20', '50', '100', '200'];

interface Filtros {
  usuario: string;
  que: '' | TipoEvento;
  desde: string;
  hasta: string;
  limite: string;
}

const SIN_FILTROS: Filtros = { usuario: '', que: '', desde: '', hasta: '', limite: '50' };

// PEDIDO_EN_PREPARACION -> En preparación
const etiquetaDe = (tipo: TipoEvento) =>
  ORDER_STATUS_LABEL[tipo.replace('PEDIDO_', '') as OrderStatus];

// el input datetime-local da la hora local sin zona; la api la quiere en iso
const aIso = (valor: string) => (valor ? new Date(valor).toISOString() : undefined);

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23' });

export function AuditView() {
  const api = useApi(analyticsConfig.auditUrl);

  // historial de un pedido
  const [pedidoId, setPedidoId] = useState('');
  const [historial, setHistorial] = useState<Registro[] | null>(null);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);

  // busqueda: lo que esta escrito en el formulario y lo que se consulto
  const [form, setForm] = useState<Filtros>(SIN_FILTROS);
  const [consulta, setConsulta] = useState<Filtros>(SIN_FILTROS);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // cada vez que cambia la consulta (boton Buscar) se piden los registros
  useEffect(() => {
    if (!api) return;
    let vigente = true;
    auditApi
      .buscar(api, {
        usuario: consulta.usuario.trim() || undefined,
        que: consulta.que || undefined,
        desde: aIso(consulta.desde),
        hasta: aIso(consulta.hasta),
        limite: Number(consulta.limite),
      })
      .then((r) => {
        if (!vigente) return;
        setRegistros(r);
        setError(null);
      })
      .catch((err) => vigente && setError(describeError(err)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [api, consulta]);

  const verHistorial = async (id: string) => {
    if (!api || !id.trim()) return;
    setPedidoId(id.trim());
    try {
      setHistorial(await auditApi.historial(api, id.trim()));
      setErrorHistorial(null);
    } catch (err) {
      setHistorial(null);
      setErrorHistorial(describeError(err));
    }
  };

  const handleHistorial = (e: FormEvent) => {
    e.preventDefault();
    verHistorial(pedidoId);
  };

  const handleBuscar = (e: FormEvent) => {
    e.preventDefault();
    // un objeto nuevo aunque los filtros sean los mismos: asi vuelve a consultar
    setConsulta({ ...form });
  };

  return (
    <div className="card card-wide">
      <h2>Auditoría</h2>

      <section className="panel">
        <h3 className="panel-title">Historial de un pedido</h3>
        <form className="form-row" onSubmit={handleHistorial}>
          <label className="field">
            <span>Pedido</span>
            <input
              value={pedidoId}
              onChange={(e) => setPedidoId(e.target.value)}
              placeholder="PED-0A1B-000001"
              required
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!api}>
            Ver historial
          </button>
        </form>

        {errorHistorial && <p className="alert">{errorHistorial}</p>}
        {historial && <TablaRegistros registros={historial} />}
      </section>

      <section className="panel">
        <h3 className="panel-title">Registros</h3>
        <form className="form-row" onSubmit={handleBuscar}>
          <label className="field">
            <span>Usuario</span>
            <input
              value={form.usuario}
              onChange={(e) => setForm({ ...form, usuario: e.target.value })}
              placeholder="OPE-01"
            />
          </label>
          <label className="field">
            <span>Evento</span>
            <select
              value={form.que}
              onChange={(e) => setForm({ ...form, que: e.target.value as Filtros['que'] })}
            >
              <option value="">Todos</option>
              {TIPOS_EVENTO.map((t) => (
                <option key={t} value={t}>
                  {etiquetaDe(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Desde</span>
            <input
              type="datetime-local"
              value={form.desde}
              onChange={(e) => setForm({ ...form, desde: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Hasta</span>
            <input
              type="datetime-local"
              value={form.hasta}
              onChange={(e) => setForm({ ...form, hasta: e.target.value })}
            />
          </label>
          <label className="field field-sm">
            <span>Límite</span>
            <select value={form.limite} onChange={(e) => setForm({ ...form, limite: e.target.value })}>
              {LIMITES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary" type="submit" disabled={!api}>
            Buscar
          </button>
        </form>

        {error && <p className="alert">{error}</p>}

        {cargando ? (
          <p className="subtitle">Cargando registros…</p>
        ) : registros.length === 0 ? (
          <p className="subtitle">No hay registros con esos filtros.</p>
        ) : (
          <>
            <p className="muted">
              {formatNumero(registros.length)} registros, del más nuevo al más antiguo
            </p>
            <TablaRegistros
              registros={registros}
              onPedido={(id) => {
                verHistorial(id);
                // el historial esta arriba
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}
      </section>
    </div>
  );
}

// la misma tabla para el historial y para la busqueda. en la busqueda cada
// pedido se puede abrir para ver su historial; en el historial va ademas el
// detalle en palabras
function TablaRegistros({
  registros,
  onPedido,
}: {
  registros: Registro[];
  onPedido?: (pedidoId: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            <th>Cuándo</th>
            {onPedido && <th>Pedido</th>}
            <th>Evento</th>
            <th>Quién</th>
            <th>Desde dónde</th>
            {!onPedido && <th>Detalle</th>}
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.eventId}>
              <td className="hora">{fecha(r.cuando)}</td>
              {onPedido && (
                <td>
                  <button className="link-pedido" type="button" onClick={() => onPedido(r.pedidoId)}>
                    {r.pedidoId}
                  </button>
                </td>
              )}
              <td>
                <span className={`badge badge-${r.estadoNuevo.toLowerCase()}`}>
                  {etiquetaDe(r.que)}
                </span>
              </td>
              <td>
                <code>{r.quien.usuarioId}</code>{' '}
                <span className="muted">{ROL_LABEL[r.quien.rol] ?? r.quien.rol}</span>
              </td>
              <td className="desde">
                {CANAL_LABEL[r.desdeDonde.canal] ?? r.desdeDonde.canal} · {r.desdeDonde.comuna}
                <span className="muted">
                  Sucursal {SUCURSALES[r.desdeDonde.sucursalId] ?? r.desdeDonde.sucursalId}
                </span>
              </td>
              {!onPedido && <td>{r.detalle}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}