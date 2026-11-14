// administracion de kafka: brokers, topicos, grupos de consumidores y las
// dlt, con el microservicio admin del backend. todo lo que se cambia aca lo
// valida el backend: si algo no se puede (borrar un topico de pedidos360,
// mover un grupo con instancias), la pantalla muestra su 400 o su 409
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useApi } from './useApi';
import { analyticsConfig } from './authConfig';
import type { ApiClient } from './api/client';
import {
  kafkaApi,
  ESTADO_GRUPO,
  type Cluster,
  type DetalleTopico,
  type Dlt,
  type Grupo,
  type NuevoTopico,
  type Topico,
} from './api/kafka';
import { Kpi } from './Graficos';
import { describeError } from './lib/errors';
import { formatNumero } from './lib/format';

// el lag y las copias cambian mientras los consumidores trabajan
const REFRESCO_MS = 5_000;

// lo que tiene que hacer cada seccion despues de cambiar algo
interface Avisos {
  avisar: (texto: string) => void;
  fallar: (err: unknown) => void;
  recargar: () => Promise<void>;
}

export function KafkaView() {
  const api = useApi(analyticsConfig.kafkaAdminUrl);
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [topicos, setTopicos] = useState<Topico[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [actualizado, setActualizado] = useState<Date | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!api) return;
    try {
      const [c, t, g] = await Promise.all([kafkaApi.cluster(api), kafkaApi.topicos(api), kafkaApi.grupos(api)]);
      setCluster(c);
      setTopicos(t);
      setGrupos(g);
      setActualizado(new Date());
    } catch (err) {
      setError(describeError(err));
    }
  }, [api]);

  useEffect(() => {
    recargar();
    const id = setInterval(recargar, REFRESCO_MS);
    return () => clearInterval(id);
  }, [recargar]);

  const avisos: Avisos = {
    avisar: (texto) => {
      setAviso(texto);
      setError(null);
    },
    fallar: (err) => {
      setError(describeError(err));
      setAviso(null);
    },
    recargar,
  };

  const atrasadas = topicos.reduce((suma, t) => suma + t.particionesConCopiaAtrasada, 0);
  const lagTotal = grupos.reduce((suma, g) => suma + g.lag, 0);

  return (
    <div className="card card-wide">
      <div className="titulo-fila">
        <h2>Kafka</h2>
        {actualizado && (
          <span className="muted">Actualizado a las {actualizado.toLocaleTimeString('es-CL')}</span>
        )}
      </div>

      {aviso && <p className="aviso">{aviso}</p>}
      {error && <p className="alert">{error}</p>}

      {!cluster ? (
        !error && <p className="subtitle">Cargando el clúster…</p>
      ) : (
        <>
          <div className="kpi-row">
            <Kpi
              etiqueta="Brokers"
              valor={formatNumero(cluster.brokers.length)}
              detalle={`controlador: broker ${cluster.controlador}`}
            />
            <Kpi
              etiqueta="Tópicos"
              valor={formatNumero(topicos.length)}
              detalle={`${formatNumero(topicos.reduce((s, t) => s + t.mensajes, 0))} mensajes`}
            />
            <Kpi
              etiqueta="Grupos"
              valor={formatNumero(grupos.length)}
              detalle={`lag total: ${formatNumero(lagTotal)}`}
            />
            <Kpi
              etiqueta="Particiones con copias atrasadas"
              valor={formatNumero(atrasadas)}
              alerta={atrasadas > 0}
            />
          </div>

          {api && (
            <>
              <Topicos api={api} topicos={topicos} avisos={avisos} />
              <Grupos api={api} grupos={grupos} avisos={avisos} />
              <Dlts api={api} avisos={avisos} />
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- topicos

const NUEVO: NuevoTopico = {
  nombre: '',
  particiones: 3,
  replicas: 3,
  retencionDias: 7,
  limpieza: 'delete',
  minInsync: 2,
};

function Topicos({ api, topicos, avisos }: { api: ApiClient; topicos: Topico[]; avisos: Avisos }) {
  const [nuevo, setNuevo] = useState<NuevoTopico>(NUEVO);
  const [detalle, setDetalle] = useState<DetalleTopico | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // corre una accion, avisa como resulto y recarga la pantalla
  const hacer = async (accion: () => Promise<string>) => {
    setOcupado(true);
    try {
      avisos.avisar(await accion());
      await avisos.recargar();
    } catch (err) {
      avisos.fallar(err);
    } finally {
      setOcupado(false);
    }
  };

  const crear = (e: FormEvent) => {
    e.preventDefault();
    hacer(async () => {
      const t = await kafkaApi.crearTopico(api, { ...nuevo, nombre: nuevo.nombre.trim() });
      setNuevo(NUEVO);
      setDetalle(t);
      return `Tópico ${t.nombre} creado: ${t.particiones} particiones y ${t.replicas} copias.`;
    });
  };

  const verDetalle = async (nombre: string) => {
    try {
      setDetalle(await kafkaApi.detalleTopico(api, nombre));
    } catch (err) {
      avisos.fallar(err);
    }
  };

  const borrar = (nombre: string) => {
    if (!confirm(`¿Borrar el tópico ${nombre} con todos sus mensajes? No se puede deshacer.`)) return;
    hacer(async () => {
      await kafkaApi.borrarTopico(api, nombre);
      if (detalle?.nombre === nombre) setDetalle(null);
      return `Tópico ${nombre} borrado.`;
    });
  };

  return (
    <section className="panel panel-kafka">
      <h3 className="panel-title">Tópicos</h3>

      <form className="form-row" onSubmit={crear}>
        <label className="field">
          <span>Nombre</span>
          <input
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            placeholder="pedidos.pruebas"
            required
          />
        </label>
        <Numero etiqueta="Particiones" valor={nuevo.particiones} min={1} max={12}
          cambiar={(n) => setNuevo({ ...nuevo, particiones: n })} />
        <Numero etiqueta="Copias" valor={nuevo.replicas} min={1} max={3}
          cambiar={(n) => setNuevo({ ...nuevo, replicas: n })} />
        <Numero etiqueta="Min ISR" valor={nuevo.minInsync} min={1} max={3}
          cambiar={(n) => setNuevo({ ...nuevo, minInsync: n })} />
        <Numero etiqueta="Retención (días)" valor={nuevo.retencionDias} min={1} max={365}
          cambiar={(n) => setNuevo({ ...nuevo, retencionDias: n })} />
        <Limpieza valor={nuevo.limpieza} cambiar={(l) => setNuevo({ ...nuevo, limpieza: l })} />
        <button className="btn btn-primary" type="submit" disabled={ocupado}>
          Crear tópico
        </button>
      </form>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Tópico</th>
              <th className="num">Particiones</th>
              <th className="num">Copias</th>
              <th className="num">Min ISR</th>
              <th className="num">Retención</th>
              <th>Limpieza</th>
              <th className="num">Mensajes</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {topicos.map((t) => (
              <tr key={t.nombre}>
                <td>
                  <code>{t.nombre}</code>{' '}
                  {t.gestionado && <span className="badge badge-rol">Pedidos360</span>}
                  {t.particionesConCopiaAtrasada > 0 && (
                    <span className="badge badge-danger">
                      {t.particionesConCopiaAtrasada} con copias atrasadas
                    </span>
                  )}
                </td>
                <td className="num">{t.particiones}</td>
                <td className="num">{t.replicas}</td>
                <td className="num">{t.minInsync}</td>
                <td className="num">{t.retencionDias === null ? '—' : `${formatNumero(t.retencionDias)} d`}</td>
                <td>{t.limpieza}</td>
                <td className="num">{formatNumero(t.mensajes)}</td>
                <td className="actions">
                  <button className="btn btn-ghost btn-sm" type="button" disabled={ocupado}
                    onClick={() => verDetalle(t.nombre)}>
                    Detalle
                  </button>
                  <button className="btn btn-danger btn-sm" type="button" disabled={ocupado}
                    onClick={() => borrar(t.nombre)}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalle && (
        <DetalleDeTopico
          key={detalle.nombre}
          api={api}
          detalle={detalle}
          ocupado={ocupado}
          hacer={hacer}
          cambiar={setDetalle}
          cerrar={() => setDetalle(null)}
        />
      )}
    </section>
  );
}

function DetalleDeTopico({
  api,
  detalle,
  ocupado,
  hacer,
  cambiar,
  cerrar,
}: {
  api: ApiClient;
  detalle: DetalleTopico;
  ocupado: boolean;
  hacer: (accion: () => Promise<string>) => Promise<void>;
  cambiar: (d: DetalleTopico) => void;
  cerrar: () => void;
}) {
  const [config, setConfig] = useState({
    retencionDias: detalle.retencionDias ?? 7,
    limpieza: detalle.limpieza,
    minInsync: detalle.minInsync,
  });
  const [total, setTotal] = useState(detalle.particiones + 1);

  const guardarConfig = (e: FormEvent) => {
    e.preventDefault();
    hacer(async () => {
      const d = await kafkaApi.cambiarConfig(api, detalle.nombre, config);
      cambiar(d);
      const cambios = d.cambios?.length ? d.cambios.join(', ') : 'sin cambios';
      return `${detalle.nombre}: ${cambios}.${d.aviso ? ` Ojo: ${d.aviso}.` : ''}`;
    });
  };

  const agregar = (e: FormEvent) => {
    e.preventDefault();
    hacer(async () => {
      const d = await kafkaApi.agregarParticiones(api, detalle.nombre, total);
      cambiar(d);
      return `${detalle.nombre} ahora tiene ${d.particiones} particiones.`;
    });
  };

  return (
    <div className="detalle-kafka">
      <div className="titulo-fila">
        <h4>
          <code>{detalle.nombre}</code>
        </h4>
        <button className="btn btn-ghost btn-sm" type="button" onClick={cerrar}>
          Cerrar
        </button>
      </div>

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th className="num">Partición</th>
              <th className="num">Líder</th>
              <th>Copias</th>
              <th>Al día (ISR)</th>
              <th className="num">Mensajes</th>
            </tr>
          </thead>
          <tbody>
            {detalle.porParticion.map((p) => (
              <tr key={p.particion}>
                <td className="num">{p.particion}</td>
                <td className="num">broker {p.lider}</td>
                <td>{p.replicas.join(', ')}</td>
                <td className={p.alDia.length < p.replicas.length ? 'kpi-alerta' : undefined}>
                  {p.alDia.join(', ')}
                </td>
                <td className="num">{formatNumero(p.fin - p.inicio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted">
        {detalle.grupos.length === 0
          ? 'Ningún grupo lo lee.'
          : `Lo leen: ${detalle.grupos.map((g) => `${g.grupo} (lag ${formatNumero(g.lag)})`).join(', ')}.`}
      </p>

      <form className="form-row" onSubmit={guardarConfig}>
        <Numero etiqueta="Retención (días)" valor={config.retencionDias} min={1} max={365}
          cambiar={(n) => setConfig({ ...config, retencionDias: n })} />
        <Limpieza valor={config.limpieza} cambiar={(l) => setConfig({ ...config, limpieza: l })} />
        <Numero etiqueta="Min ISR" valor={config.minInsync} min={1} max={3}
          cambiar={(n) => setConfig({ ...config, minInsync: n })} />
        <button className="btn btn-primary" type="submit" disabled={ocupado}>
          Guardar configuración
        </button>
      </form>

      <form className="form-row" onSubmit={agregar}>
        <Numero etiqueta="Particiones en total" valor={total} min={1} max={12} cambiar={setTotal} />
        <button className="btn btn-primary" type="submit" disabled={ocupado}>
          Agregar particiones
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- grupos

function Grupos({ api, grupos, avisos }: { api: ApiClient; grupos: Grupo[]; avisos: Avisos }) {
  const [ocupado, setOcupado] = useState(false);

  const hacer = async (pregunta: string, accion: () => Promise<string>) => {
    if (!confirm(pregunta)) return;
    setOcupado(true);
    try {
      avisos.avisar(await accion());
      await avisos.recargar();
    } catch (err) {
      avisos.fallar(err);
    } finally {
      setOcupado(false);
    }
  };

  const mover = (g: Grupo, posicion: 'inicio' | 'fin') => {
    const topico = g.topicos[0];
    const pregunta =
      posicion === 'inicio'
        ? `¿Mover ${g.grupo} al inicio de ${topico}? Al conectarse vuelve a leer todo.`
        : `¿Mover ${g.grupo} al final de ${topico}? Se salta lo que tenía pendiente.`;
    hacer(pregunta, async () => {
      const r = await kafkaApi.moverOffsets(api, g.grupo, topico, posicion);
      return `${g.grupo} quedó al ${posicion} de ${topico}: lag ${formatNumero(r.lag)}.`;
    });
  };

  const borrar = (g: Grupo) =>
    hacer(`¿Borrar el grupo ${g.grupo} y sus offsets?`, async () => {
      await kafkaApi.borrarGrupo(api, g.grupo);
      return `Grupo ${g.grupo} borrado.`;
    });

  return (
    <section className="panel panel-kafka">
      <h3 className="panel-title">Grupos de consumidores</h3>
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Grupo</th>
              <th>Estado</th>
              <th className="num">Instancias</th>
              <th className="num">Lag</th>
              <th>Lee</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.grupo}>
                <td>
                  <code>{g.grupo}</code>
                </td>
                <td>
                  <span className={`badge badge-grupo-${g.estado.toLowerCase()}`}>
                    {ESTADO_GRUPO[g.estado] ?? g.estado}
                  </span>
                </td>
                <td className="num">{g.instancias}</td>
                <td className={g.lag > 0 ? 'num kpi-alerta' : 'num'}>{formatNumero(g.lag)}</td>
                <td>{g.topicos.join(', ') || '—'}</td>
                <td className="actions">
                  <button className="btn btn-ghost btn-sm" type="button"
                    disabled={ocupado || g.topicos.length === 0} onClick={() => mover(g, 'inicio')}>
                    Al inicio
                  </button>
                  <button className="btn btn-ghost btn-sm" type="button"
                    disabled={ocupado || g.topicos.length === 0} onClick={() => mover(g, 'fin')}>
                    Al final
                  </button>
                  <button className="btn btn-danger btn-sm" type="button" disabled={ocupado}
                    onClick={() => borrar(g)}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- dlt

// la dlt se lee a pedido y no cada 5 segundos: leerla abre un consumidor
function Dlts({ api, avisos }: { api: ApiClient; avisos: Avisos }) {
  const [servicio, setServicio] = useState('report');
  const [dlt, setDlt] = useState<Dlt | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const ver = async (cual = servicio) => {
    setOcupado(true);
    try {
      setDlt(await kafkaApi.dlt(api, cual));
    } catch (err) {
      setDlt(null);
      avisos.fallar(err);
    } finally {
      setOcupado(false);
    }
  };

  const reprocesar = async () => {
    if (!confirm(`¿Devolver los mensajes pendientes de la DLT de ${servicio} a su tópico de origen?`)) return;
    setOcupado(true);
    try {
      const r = await kafkaApi.reprocesar(api, servicio);
      avisos.avisar(
        `${formatNumero(r.reprocesados)} mensajes reprocesados${r.sinOrigen ? ` (${r.sinOrigen} sin un origen válido)` : ''}.`,
      );
      await ver();
    } catch (err) {
      avisos.fallar(err);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="panel panel-kafka">
      <h3 className="panel-title">DLT</h3>
      <div className="form-row">
        <label className="field field-sm">
          <span>Servicio</span>
          <select
            value={servicio}
            onChange={(e) => {
              setServicio(e.target.value);
              setDlt(null);
            }}
          >
            <option value="report">report</option>
            <option value="audit">audit</option>
          </select>
        </label>
        <button className="btn btn-primary" type="button" disabled={ocupado} onClick={() => ver()}>
          Ver mensajes
        </button>
        <button className="btn btn-ghost" type="button" disabled={ocupado || !dlt?.pendientes}
          onClick={reprocesar}>
          Reprocesar pendientes
        </button>
        {dlt && (
          <span className="muted">
            <code>{dlt.topico}</code>: {formatNumero(dlt.total)} mensajes, {formatNumero(dlt.pendientes)} pendientes
          </span>
        )}
      </div>

      {dlt && dlt.mensajes.length > 0 && (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Key</th>
                <th>Motivo</th>
                <th>Origen</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {dlt.mensajes.map((m) => (
                <tr key={`${m.particion}-${m.offset}`}>
                  <td className="hora">
                    {m.fecha
                      ? new Date(m.fecha).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23' })
                      : '—'}
                  </td>
                  <td>
                    <code>{m.key ?? '—'}</code>
                  </td>
                  <td>
                    <strong>{m.motivo}</strong>
                    {m.error && m.error !== m.motivo && <span className="muted dlt-error">{m.error}</span>}
                  </td>
                  <td className="desde">
                    {m.origen.topico} · partición {m.origen.particion} · offset {m.origen.offset}
                    <span className="muted">grupo {m.origen.grupo}</span>
                  </td>
                  <td>
                    <span className={`badge ${m.reprocesado ? 'badge-dlt-reprocesado' : 'badge-dlt-pendiente'}`}>
                      {m.reprocesado ? 'Reprocesado' : 'Pendiente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- campos

function Numero({
  etiqueta,
  valor,
  min,
  max,
  cambiar,
}: {
  etiqueta: string;
  valor: number;
  min: number;
  max: number;
  cambiar: (n: number) => void;
}) {
  return (
    <label className="field field-sm">
      <span>{etiqueta}</span>
      <input type="number" min={min} max={max} value={valor} onChange={(e) => cambiar(Number(e.target.value))} required />
    </label>
  );
}

function Limpieza({ valor, cambiar }: { valor: 'delete' | 'compact'; cambiar: (l: 'delete' | 'compact') => void }) {
  return (
    <label className="field field-sm">
      <span>Limpieza</span>
      <select value={valor} onChange={(e) => cambiar(e.target.value as 'delete' | 'compact')}>
        <option value="delete">delete</option>
        <option value="compact">compact</option>
      </select>
    </label>
  );
}