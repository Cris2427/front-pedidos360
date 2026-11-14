// kpis de los pedidos, calculados por el servicio report a partir de los
// eventos de kafka. se refresca solo: mientras corre el publicador, los
// numeros suben en vivo
import { useCallback, useEffect, useState } from 'react';
import { useApi } from './useApi';
import { analyticsConfig } from './authConfig';
import {
  reportApi,
  SUCURSALES,
  type ActivosPorEstado,
  type LeadTime,
  type Resumen,
  type TopProducto,
  type VentaPorHora,
} from './api/analytics';
import { ORDER_STATUS_LABEL } from './api/orders';
import { Kpi, Barras } from './Graficos';
import { describeError } from './lib/errors';
import { formatCLP, formatCompacto, formatNumero } from './lib/format';

const REFRESCO_MS = 5_000;

interface Datos {
  resumen: Resumen;
  ventas: VentaPorHora[];
  top: TopProducto[];
  activos: ActivosPorEstado[];
  lead: LeadTime;
}

const horaCorta = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

export function ReportsView() {
  const api = useApi(analyticsConfig.reportUrl);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizado, setActualizado] = useState<Date | null>(null);

  const cargar = useCallback(async () => {
    if (!api) return;
    try {
      // las cinco consultas van a la vez
      const [resumen, ventas, top, activos, lead] = await Promise.all([
        reportApi.resumen(api),
        reportApi.ventasPorHora(api),
        reportApi.topProductos(api, 5),
        reportApi.pedidosActivos(api),
        reportApi.leadTime(api),
      ]);
      setDatos({ resumen, ventas, top, activos, lead });
      setActualizado(new Date());
      setError(null);
    } catch (err) {
      setError(describeError(err));
    }
  }, [api]);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(id);
  }, [cargar]);

  return (
    <div className="card card-wide">
      <div className="titulo-fila">
        <h2>Reportes</h2>
        {actualizado && (
          <span className="muted">Actualizado a las {actualizado.toLocaleTimeString('es-CL')}</span>
        )}
      </div>

      {error && <p className="alert">{error}</p>}

      {!datos ? (
        !error && <p className="subtitle">Cargando reportes…</p>
      ) : datos.resumen.pedidos === 0 ? (
        <p className="subtitle">Todavía no hay pedidos procesados.</p>
      ) : (
        <Paneles datos={datos} />
      )}
    </div>
  );
}

function Paneles({ datos }: { datos: Datos }) {
  const { resumen, ventas, top, activos, lead } = datos;
  const enCurso = activos.reduce((suma, a) => suma + a.pedidos, 0);

  return (
    <>
      <div className="kpi-row">
        <Kpi
          etiqueta="Pedidos"
          valor={formatNumero(resumen.pedidos)}
          detalle={`${formatNumero(resumen.eventosAplicados)} eventos procesados`}
        />
        <Kpi
          etiqueta="Ventas"
          valor={formatCompacto(resumen.ventas)}
          detalle={formatCLP(resumen.ventas)}
        />
        <Kpi
          etiqueta="En curso"
          valor={formatNumero(enCurso)}
          detalle={`${formatNumero(resumen.porEstado.CANCELADO ?? 0)} cancelados`}
        />
        <Kpi
          etiqueta="Lead time promedio"
          valor={lead.promedioMin === null ? '—' : `${formatNumero(lead.promedioMin)} min`}
          detalle={`${formatNumero(lead.pedidos)} entregados`}
        />
      </div>

      <div className="graficos">
        <Barras
          titulo="Ventas por hora"
          datos={ventas.slice(-12).map((v) => ({ etiqueta: horaCorta(v.hora), valor: v.ventas }))}
          formato={formatCompacto}
        />
        <Barras
          titulo="Productos más vendidos"
          datos={top.map((p) => ({ etiqueta: p.nombre, valor: p.unidades }))}
          sufijo=" u."
        />
        <Barras
          titulo="Pedidos activos por estado"
          datos={activos.map((a) => ({ etiqueta: ORDER_STATUS_LABEL[a.estado], valor: a.pedidos }))}
        />
        <Barras
          titulo="Lead time por sucursal"
          datos={lead.porSucursal.map((s) => ({
            etiqueta: SUCURSALES[s.sucursalId] ?? s.sucursalId,
            valor: s.promedioMin,
          }))}
          sufijo=" min"
        />
      </div>
    </>
  );
}