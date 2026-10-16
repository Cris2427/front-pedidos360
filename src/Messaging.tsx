import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useApi } from './useApi';
import { messagingApi, type Binding, type Cola, type Topic } from './api/messaging';
import { describeError } from './lib/errors';

const colaVacia = { nombre: '', maxReceiveCount: '3', visibilidadSegundos: '30' };

// a proposito no valida nada aca: las reglas son del servidor, y la pantalla
// muestra el motivo exacto con el que rechaza
export function MessagingView() {
  const api = useApi();
  const [colas, setColas] = useState<Cola[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [form, setForm] = useState(colaVacia);

  const cargar = useCallback(async () => {
    if (!api) return;
    try {
      const [c, t, b] = await Promise.all([
        messagingApi.getColas(api),
        messagingApi.getTopics(api),
        messagingApi.getBindings(api),
      ]);
      setColas(c);
      setTopics(t);
      setBindings(b);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // despues de cada cambio se recarga todo, para que la tabla muestre lo que
  // quedo de verdad en aws
  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    setOcupado(true);
    setError(null);
    setAviso(null);
    try {
      await accion();
      setAviso(exito);
      await cargar();
      return true;
    } catch (err) {
      setError(describeError(err));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const crearCola = async (e: FormEvent) => {
    e.preventDefault();
    if (!api) return;
    const nombre = form.nombre.trim();
    const ok = await ejecutar(
      () =>
        messagingApi.createCola(api, {
          nombre,
          maxReceiveCount: Number(form.maxReceiveCount),
          visibilidadSegundos: Number(form.visibilidadSegundos),
        }),
      `Cola ${nombre} creada, con su DLQ ${nombre}-dlq.`,
    );
    if (ok) setForm(colaVacia);
  };

  const eliminarCola = (nombre: string) => {
    if (!api || !confirm(`¿Eliminar la cola ${nombre} y su DLQ? No se puede deshacer.`)) return;
    void ejecutar(() => messagingApi.deleteCola(api, nombre), `Cola ${nombre} eliminada junto con su DLQ.`);
  };

  if (loading) {
    return (
      <div className="card card-wide">
        <p className="subtitle">Cargando la mensajería…</p>
      </div>
    );
  }

  return (
    <div className="card card-wide">
      <h2>Mensajería</h2>

      {error && <p className="alert">{error}</p>}
      {aviso && <p className="aviso">{aviso}</p>}

      <section className="panel">
        <h3 className="panel-title">Colas</h3>
        <form className="form-row" onSubmit={crearCola}>
          <label className="field">
            <span>Nombre</span>
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              placeholder="q-sms"
              required
            />
          </label>
          <label className="field field-sm">
            <span>Reintentos</span>
            <input
              type="number"
              value={form.maxReceiveCount}
              onChange={(e) => setForm({ ...form, maxReceiveCount: e.target.value })}
            />
          </label>
          <label className="field field-sm">
            <span>Visibilidad (s)</span>
            <input
              type="number"
              value={form.visibilidadSegundos}
              onChange={(e) => setForm({ ...form, visibilidadSegundos: e.target.value })}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={ocupado || !api}>
            Crear cola y su DLQ
          </button>
        </form>

        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Cola</th>
                <th className="num">En cola</th>
                <th className="num">En proceso</th>
                <th>DLQ</th>
                <th className="num">Reintentos</th>
                <th className="num">Visibilidad</th>
                <th>Consumidor</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {colas.map((c) => {
                const enDlq = c.dlq?.mensajes?.disponibles ?? 0;
                return (
                  <tr key={c.nombre}>
                    <td>
                      <code>{c.nombre}</code>
                    </td>
                    <td className="num">{c.mensajes.disponibles}</td>
                    <td className="num">{c.mensajes.enProceso}</td>
                    <td>
                      {c.dlq ? (
                        <>
                          <code>{c.dlq.nombre}</code>{' '}
                          <span className={enDlq > 0 ? 'badge badge-danger' : 'badge'}>
                            {enDlq} {enDlq === 1 ? 'mensaje' : 'mensajes'}
                          </span>
                        </>
                      ) : (
                        <span className="muted">sin DLQ</span>
                      )}
                    </td>
                    <td className="num">{c.maxReceiveCount ?? '—'}</td>
                    <td className="num">{c.visibilidadSegundos} s</td>
                    <td>{c.consumidor ? <code>{c.consumidor}</code> : <span className="muted">ninguno</span>}</td>
                    <td className="actions">
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={ocupado}
                        onClick={() => eliminarCola(c.nombre)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel-title">Topics</h3>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Topic</th>
                <th className="num">Suscripciones</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.arn}>
                  <td>
                    <code>{t.nombre}</code>
                  </td>
                  <td className="num">{t.suscripciones}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3 className="panel-title">Suscripciones</h3>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Cola</th>
                <th>Filtro</th>
              </tr>
            </thead>
            <tbody>
              {bindings.map((b) => (
                <tr key={b.id}>
                  <td>
                    <code>{b.topic}</code>
                  </td>
                  <td>
                    <code>{b.cola}</code>
                  </td>
                  <td>
                    {b.filtro ? (
                      <code className="filtro">{JSON.stringify(b.filtro)}</code>
                    ) : (
                      <span className="muted">sin filtro</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
