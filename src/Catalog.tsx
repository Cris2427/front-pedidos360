import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useApi } from './useApi';
import { useRoles } from './useRoles';
import { catalogApi, type Product } from './api/catalog';
import { describeError } from './lib/errors';
import { formatCLP } from './lib/format';

const emptyForm = { nombre: '', precio: '', stock: '' };

export function CatalogView() {
  const api = useApi();
  const { has } = useRoles();
  const puedeEditar = has('Admin');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editando, setEditando] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    if (!api) return;
    try {
      const data = await catalogApi.getProducts(api);
      setProducts(data);
      setError(null);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const cancelarEdicion = () => {
    setEditando(null);
    setForm(emptyForm);
    setError(null);
  };

  const empezarEdicion = (p: Product) => {
    setEditando(p.id ?? null);
    setForm({ nombre: p.nombre, precio: String(p.precio), stock: String(p.stock) });
    setError(null);
  };

  const eliminar = async (p: Product) => {
    if (!api || !p.id) return;
    if (!confirm(`¿Eliminar "${p.nombre}" del catálogo?`)) return;
    setBusyId(p.id);
    setError(null);
    try {
      await catalogApi.deleteProduct(api, p.id);
      if (editando === p.id) cancelarEdicion();
      await loadProducts();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!api) return;

    const precio = Number(form.precio);
    const stock = Number(form.stock);
    if (!form.nombre.trim() || !Number.isFinite(precio) || precio < 0) {
      setError('Nombre y precio son obligatorios (precio ≥ 0).');
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setError('El stock debe ser un entero ≥ 0.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const datos = { nombre: form.nombre.trim(), precio, stock };
      if (editando) await catalogApi.updateProduct(api, editando, datos);
      else await catalogApi.createProduct(api, datos);
      cancelarEdicion();
      await loadProducts();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleStock = async (product: Product, delta: number) => {
    if (!api || !product.id) return;
    const nuevo = product.stock + delta;
    if (nuevo < 0) return;

    setError(null);
    // lo mostramos al tiro y si la api falla recargamos
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, stock: nuevo } : p)),
    );
    try {
      await catalogApi.updateStock(api, product.id, nuevo);
    } catch (err) {
      setError(describeError(err));
    } finally {
      await loadProducts();
    }
  };

  return (
    <div className="card card-wide">
      <h2>Módulo de Catálogo</h2>
      {!puedeEditar && (
        <p className="subtitle">
          Estás viendo el catálogo en modo consulta. Administrar productos y stock
          requiere el App Role <code>Admin</code>.
        </p>
      )}

      {puedeEditar && (
      <form className="form-row" onSubmit={handleCreate}>
        <label className="field">
          <span>Producto</span>
          <input
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Notebook 14&quot;"
            required
          />
        </label>
        <label className="field">
          <span>Precio</span>
          <input
            type="number"
            min="0"
            step="1"
            value={form.precio}
            onChange={(e) => setForm({ ...form, precio: e.target.value })}
            placeholder="499990"
            required
          />
        </label>
        <label className="field">
          <span>Stock</span>
          <input
            type="number"
            min="0"
            step="1"
            value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
            placeholder="10"
            required
          />
        </label>
        <button className="btn btn-primary" type="submit" disabled={saving || !api}>
          {saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar producto'}
        </button>
        {editando && (
          <button className="btn btn-ghost" type="button" onClick={cancelarEdicion}>
            Cancelar
          </button>
        )}
      </form>
      )}

      {error && <p className="alert">{error}</p>}

      {loading ? (
        <p className="subtitle">Cargando productos…</p>
      ) : products.length === 0 ? (
        <p className="subtitle">Todavía no hay productos en el catálogo.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Producto</th>
              <th className="num">Precio</th>
              <th className="num">Stock</th>
              {puedeEditar && <th>Ajustar stock</th>}
              {puedeEditar && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={p.id ?? `${p.nombre}-${i}`}>
                <td><code>{p.id ?? '—'}</code></td>
                <td>{p.nombre}</td>
                <td className="num">{formatCLP(p.precio)}</td>
                <td className="num">
                  <span className={p.stock === 0 ? 'badge badge-danger' : 'badge'}>
                    {p.stock}
                  </span>
                </td>
                {puedeEditar && (
                  <td className="actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleStock(p, -1)}
                      disabled={!p.id || p.stock === 0 || busyId === p.id}
                    >
                      −1
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleStock(p, +1)}
                      disabled={!p.id || busyId === p.id}
                    >
                      +1
                    </button>
                  </td>
                )}
                {puedeEditar && (
                  <td className="actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => empezarEdicion(p)}
                      disabled={!p.id || busyId === p.id}
                    >
                      Editar
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => eliminar(p)}
                      disabled={!p.id || busyId === p.id}
                    >
                      Eliminar
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
