// las piezas de los paneles: los kpi y el grafico de barras
// las usan el dashboard y la pantalla de reportes
import { formatNumero } from './lib/format';

export function Kpi({
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

// el color no dice nada, el largo si
// formato: como se escribe cada valor (por defecto, un numero con puntos)
export function Barras({
  titulo,
  datos,
  sufijo = '',
  formato = formatNumero,
}: {
  titulo: string;
  datos: { etiqueta: string; valor: number }[];
  sufijo?: string;
  formato?: (valor: number) => string;
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
            {formato(d.valor)}
            {sufijo}
          </span>
        </div>
      ))}
    </figure>
  );
}