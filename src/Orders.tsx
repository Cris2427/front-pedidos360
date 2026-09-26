// src/Orders.tsx
// Vista PROTEGIDA: CRUD de PEDIDOS, del Cliente y del Operador.
//
// El Admin no entra acá (lo detiene el guard de App.tsx y, si llama la API
// directo, la Lambda responde 403): administra el catálogo, no los pedidos.
//
// Permisos dentro de la vista:
//   Cliente  — crea, edita y elimina SUS pedidos mientras están en CREADO.
//   Operador — lo mismo sobre todos, y además avanza el ciclo de estados.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useApi } from './useApi';
import { useRoles } from './useRoles';
import {
  ordersApi,
  ORDER_TRANSITIONS,
  ORDER_STATUS_LABEL,
  ESTADOS_EDITABLES,
  ESTADOS_BORRABLES,
  type Order,
  type OrderStatus,
} from './api/orders';
import { catalogApi, type Product } from './api/catalog';
import { describeError } from './lib/errors';
import { formatCLP } from './lib/format';

const formVacio = { clienteId: '', productoId: '', cantidad: '1' };

export function OrdersView() {
  const api = useApi();
  // El Operador ve y opera sobre todos los pedidos y avanza sus estados.
  const { has } = useRoles();
  const esOperador = has('Operador');

  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [form, setForm] = useState(formVacio);
  const [editando, setEditando] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadOrders = useCallback(async () => {
    // `api` es null mientras MSAL aún no resuelve la cuenta activa.
    if (!api) return;
    try {
      // Nada de setState antes del await: el estado de carga arranca en `true`
      // y solo se apaga al terminar, así el efecto no encadena renders.
      const data = await ordersApi.getOrders(api);
      setOrders(data);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // El catálogo alimenta el selector de productos. Si falla no bloqueamos la
  // vista: los pedidos existentes se siguen viendo.
  useEffect(() => {
    if (!api) return;
    let cancelado = false;
    catalogApi
      .getProducts(api)
      .then((data) => {
        if (!cancelado) setProducts(data);
      })
      .catch(() => {
        if (!cancelado) setProducts([]);
      });
    return () => {
      cancelado = true;
    };
  }, [api]);

  const seleccionado = useMemo(
    () => products.find((p) => p.id === form.productoId),
    [products, form.productoId],
  );
  const total = seleccionado ? seleccionado.precio * Number(form.cantidad || 0) : 0;

  const cancelarEdicion = () => {
    setEditando(null);
    setForm(formVacio);
    setError(null);
  };

  const empezarEdicion = (pedido: Order) => {
    const item = pedido.items?.[0];
    setEditando(pedido.id ?? null);
    setForm({
      clienteId: pedido.clienteId,
      productoId: item?.productoId ?? '',
      cantidad: String(item?.cantidad ?? 1),
    });
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!api) return;

    const cantidad = Number(form.cantidad);
    if (!form.productoId) {
      setError('Selecciona el producto del pedido.');
      return;
    }
    if (esOperador && !form.clienteId.trim()) {
      setError('Indica el cliente del pedido.');
      return;
    }
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setError('La cantidad debe ser un entero mayor que 0.');
      return;
    }
    if (seleccionado && cantidad > seleccionado.stock) {
      setError(`Stock insuficiente: quedan ${seleccionado.stock} de ${seleccionado.nombre}.`);
      return;
    }

    // El Cliente no manda clienteId: el servidor usa la identidad del token.
    const cuerpo = {
      clienteId: esOperador ? form.clienteId.trim() : '',
      items: [{ productoId: form.productoId, cantidad }],
    };

    setSaving(true);
    setError(null);
    try {
      if (editando) await ordersApi.updateOrder(api, editando, cuerpo);
      else await ordersApi.createOrder(api, cuerpo);
      cancelarEdicion();
      await loadOrders();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const cambiarEstado = async (id: string, nuevo: OrderStatus) => {
    if (!api) return;
    setBusyId(id);
    setError(null);
    try {
      await ordersApi.updateStatus(api, id, nuevo);
      await loadOrders();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusyId(null);
    }
  };

  const eliminar = async (pedido: Order) => {
    if (!api || !pedido.id) return;
    if (!confirm(`¿Eliminar el pedido ${pedido.id}? No se puede deshacer.`)) return;

    setBusyId(pedido.id);
    setError(null);
    try {
      await ordersApi.deleteOrder(api, pedido.id);
      if (editando === pedido.id) cancelarEdicion();
      await loadOrders();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="card card-wide">
      <h2>Módulo de Gestión de Pedidos</h2>
      <form className="form-row" onSubmit={handleSubmit}>
        {esOperador && (
          <label className="field">
            <span>Cliente</span>
            <input
              id="pedido-cliente"
              value={form.clienteId}
              onChange={(e) => setForm({ ...form, clienteId: e.target.value })}
              placeholder="cliente@correo.cl"
              required
            />
          </label>
        )}
        <label className="field">
          <span>Producto</span>
          <select
            id="pedido-producto"
            value={form.productoId}
            onChange={(e) => setForm({ ...form, productoId: e.target.value })}
            required
          >
            <option value="">— Selecciona —</option>
            {products.map((p, i) => (
              <option key={p.id ?? i} value={p.id ?? ''}>
                {p.nombre} (stock {p.stock})
              </option>
            ))}
          </select>
        </label>
        <label className="field field-sm">
          <span>Cantidad</span>
          <input
            id="pedido-cantidad"
            type="number"
            min="1"
            step="1"
            value={form.cantidad}
            onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
            required
          />
        </label>
        <label className="field field-sm">
          <span>Total</span>
          <output className="total">{formatCLP(total)}</output>
        </label>
        <button className="btn btn-primary" type="submit" disabled={saving || !api}>
          {saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear pedido'}
        </button>
        {editando && (
          <button className="btn btn-ghost" type="button" onClick={cancelarEdicion}>
            Cancelar
          </button>
        )}
      </form>

      {editando && (
        <p className="subtitle">
          Editando el pedido <code>{editando}</code>.
        </p>
      )}

      {products.length === 0 && (
        <p className="subtitle">El catálogo no devolvió productos, así que el selector está vacío.</p>
      )}

      {error && <p className="alert">{error}</p>}

      {loading ? (
        <p className="subtitle">Cargando pedidos…</p>
      ) : orders.length === 0 ? (
        <p className="subtitle">Todavía no hay pedidos registrados.</p>
      ) : (
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>ID Pedido</th>
                <th>Cliente</th>
                <th className="num">Ítems</th>
                <th className="num">Total</th>
                <th>Estado</th>
                {esOperador && <th>Ciclo de estados</th>}
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => {
                const ocupado = busyId === o.id;
                const editable = ESTADOS_EDITABLES.includes(o.estado);
                const borrable = ESTADOS_BORRABLES.includes(o.estado);
                return (
                  <tr key={o.id ?? i}>
                    <td>
                      <code>{o.id ?? '—'}</code>
                    </td>
                    <td className="cliente" title={o.clienteId}>
                      {o.clienteId}
                    </td>
                    <td className="num">{o.items?.length ?? 0}</td>
                    <td className="num">{formatCLP(o.total)}</td>
                    <td>
                      <span className={`badge badge-${String(o.estado).toLowerCase()}`}>
                        {ORDER_STATUS_LABEL[o.estado] ?? o.estado}
                      </span>
                    </td>

                    {esOperador && (
                      <td className="actions">
                        {(ORDER_TRANSITIONS[o.estado] ?? []).length === 0 ? (
                          <span className="muted">Sin transiciones</span>
                        ) : (
                          ORDER_TRANSITIONS[o.estado].map((next) => (
                            <button
                              key={next}
                              className={
                                next === 'CANCELADO'
                                  ? 'btn btn-ghost btn-sm'
                                  : 'btn btn-primary btn-sm'
                              }
                              disabled={!o.id || ocupado}
                              onClick={() => o.id && cambiarEstado(o.id, next)}
                            >
                              {ORDER_STATUS_LABEL[next]}
                            </button>
                          ))
                        )}
                      </td>
                    )}

                    <td className="actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={!o.id || ocupado || !editable}
                        title={editable ? 'Editar' : `Un pedido en ${o.estado} ya no se edita`}
                        onClick={() => empezarEdicion(o)}
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={!o.id || ocupado || !borrable}
                        title={
                          borrable ? 'Eliminar' : 'Tiene stock comprometido: cancélalo primero'
                        }
                        onClick={() => eliminar(o)}
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
      )}
    </div>
  );
}
