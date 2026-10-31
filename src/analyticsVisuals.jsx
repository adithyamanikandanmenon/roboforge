import React, { useState } from "react";
import { metrics, formatValue, assess } from "./pondData.js";
import { pairedSamples, correlation } from "./analyticsData.js";
const color = ["#087d89", "#ac4e83"];
export function Sparkline({ rows, metric }) {
  const vals = rows.map((r) => r[metric.key]).filter(Number.isFinite);
  if (!vals.length) return <span>No numeric samples</span>;
  const lo = Math.min(...vals),
    hi = Math.max(...vals);
  let drawing = false;
  const path = rows
    .map((r, i) => {
      const v = r[metric.key];
      if (!Number.isFinite(v)) {
        drawing = false;
        return "";
      }
      const p = `${drawing ? "L" : "M"}${4 + (i / Math.max(rows.length - 1, 1)) * 152},${36 - ((v - lo) / Math.max(hi - lo, 0.01)) * 28}`;
      drawing = true;
      return p;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 160 44"
      role="img"
      aria-label={`${metric.name}: ${vals.length} numeric samples`}
    >
      <path d={path} stroke="currentColor" fill="none" strokeWidth="2" />
      <circle
        cx={
          4 +
          (rows.findLastIndex((r) => Number.isFinite(r[metric.key])) /
            Math.max(rows.length - 1, 1)) *
            152
        }
        cy={36 - ((vals.at(-1) - lo) / Math.max(hi - lo, 0.01)) * 28}
        r="2"
      />
    </svg>
  );
}
export function MetricSnapshots({ stats, rows, targets, onSelect }) {
  const names = {
    good: "Within selected target",
    attention: "Outside selected target",
    unknown: "Latest value missing",
    info: "No target selected",
  };
  return (
    <div className="analytics-snapshots">
      {stats.map((s) => (
        <button
          key={s.key}
          className="snapshot-card"
          onClick={() => onSelect(s.key)}
        >
          <span>{s.name}</span>
          <strong>
            {formatValue(s.latest, s.precision)} <small>{s.unit}</small>
          </strong>
          <span className={`snapshot-state ${assess(s, s.latest, targets)}`}>
            {names[assess(s, s.latest, targets)]}
          </span>
          <Sparkline rows={rows.slice(-20)} metric={s} />
          <small>
            {s.delta === null
              ? "Previous packet comparison unavailable"
              : `${s.delta > 0 ? "+" : ""}${s.delta.toFixed(s.precision)} ${s.unit} since previous packet`}
          </small>
        </button>
      ))}
    </div>
  );
}
export function DualTrend({ rows, primary, secondary, targets }) {
  const [index, setIndex] = useState(0),
    selected = rows[Math.min(index, rows.length - 1)];
  const series = [primary, secondary].map((k) =>
    metrics.find((m) => m.key === k),
  );
  if (!rows.length)
    return <p className="chart-empty">No records in this period.</p>;
  const first = rows[0].time,
    last = rows.at(-1).time,
    x = (t) => 60 + ((t - first) / Math.max(last - first, 1)) * 680;
  const scales = series.map((m) => {
    const vals = rows.map((r) => r[m.key]).filter(Number.isFinite),
      range = targets[m.key];
    vals.push(...[range?.min, range?.max].filter(Number.isFinite));
    if (!vals.length) return null;
    const min = Math.min(...vals),
      max = Math.max(...vals),
      pad = Math.max((max - min) * 0.15, 0.2);
    return {
      min: min - pad,
      max: max + pad,
      y: (v) => 218 - ((v - (min - pad)) / (max - min + 2 * pad)) * 174,
    };
  });
  const range = targets[primary],
    p = scales[0];
  return (
    <>
      <div className="dual-legend">
        {series.map((m, i) => (
          <span key={i} style={{ color: color[i] }}>
            {i ? "Dashed · right axis" : "Solid · left axis"}: {m.name} (
            {m.unit})
          </span>
        ))}
      </div>
      <svg
        viewBox="0 0 800 270"
        className="dual-trend"
        role="img"
        aria-label={`${series[0].name} and ${series[1].name} over acquisition time; independent vertical scales`}
      >
        {p && (
          <rect
            x="60"
            width="680"
            y={range?.max != null ? p.y(range.max) : 44}
            height={Math.max(
              0,
              (range?.min != null ? p.y(range.min) : 218) -
                (range?.max != null ? p.y(range.max) : 44),
            )}
            fill={range ? "#0a9b8a" : "none"}
            opacity=".08"
          />
        )}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1="60"
              x2="740"
              y1={44 + f * 174}
              y2={44 + f * 174}
              stroke="#c9dfe2"
              strokeDasharray="4 4"
            />
            {scales.map(
              (s, i) =>
                s && (
                  <text
                    key={i}
                    x={i ? 750 : 50}
                    y={48 + f * 174}
                    textAnchor={i ? "start" : "end"}
                    fill={color[i]}
                  >
                    {(s.max - f * (s.max - s.min)).toFixed(1)}
                  </text>
                ),
            )}
          </g>
        ))}
        {series.map((m, i) => {
          const s = scales[i];
          if (!s) return null;
          let drawing = false;
          const path = rows
            .map((r) => {
              if (!Number.isFinite(r[m.key])) {
                drawing = false;
                return "";
              }
              const cmd = `${drawing ? "L" : "M"}${x(r.time)},${s.y(r[m.key])}`;
              drawing = true;
              return cmd;
            })
            .join(" ");
          return (
            <g key={i}>
              <path
                d={path}
                fill="none"
                stroke={color[i]}
                strokeWidth="2.5"
                strokeDasharray={i ? "7 4" : undefined}
              />
              {rows.map(
                (r, j) =>
                  Number.isFinite(r[m.key]) && (
                    <circle
                      key={j}
                      cx={x(r.time)}
                      cy={s.y(r[m.key])}
                      r="2.5"
                      fill={color[i]}
                    >
                      <title>
                        {new Date(r.time).toLocaleString()}: {r[m.key]} {m.unit}
                      </title>
                    </circle>
                  ),
              )}
            </g>
          );
        })}
        <text x="60" y="250">
          {new Date(first).toLocaleTimeString()}
        </text>
        <text x="740" y="250" textAnchor="end">
          {new Date(last).toLocaleTimeString()}
        </text>
        {selected && (
          <line
            x1={x(selected.time)}
            x2={x(selected.time)}
            y1="44"
            y2="218"
            stroke="#344f65"
            opacity=".5"
          />
        )}
      </svg>
      <label className="packet-scrubber">
        Inspect packet {selected?.id || index + 1}
        <input
          type="range"
          aria-label="Inspect chart packet"
          min="0"
          max={Math.max(rows.length - 1, 0)}
          value={Math.min(index, rows.length - 1)}
          onChange={(e) => setIndex(+e.target.value)}
        />
      </label>
      <p className="analytics-note">
        {selected && new Date(selected.time).toLocaleString()} ·{" "}
        {series
          .map(
            (m) =>
              `${m.name}: ${formatValue(selected?.[m.key], m.precision)} ${m.unit}`,
          )
          .join(" · ")}
      </p>
      <p className="analytics-note">
        Shading shows the first measurement's selected target interval. Scales
        are independent. Similar shapes do not establish a relationship.
      </p>
    </>
  );
}
export function Radar({ stats }) {
  const five = stats.slice(0, 5),
    xy = (i, v) => [
      180 + Math.cos(-Math.PI / 2 + (i * Math.PI * 2) / 5) * v * 100,
      145 + Math.sin(-Math.PI / 2 + (i * Math.PI * 2) / 5) * v * 100,
    ];
  const complete = five.every((s) => s.assessed > 0),
    points = complete
      ? five.map((s, i) => xy(i, s.within / s.assessed).join(",")).join(" ")
      : "";
  return (
    <section className="plain-panel">
      <h2>Selected target coverage</h2>
      <p className="analytics-note">
        Percentage of assessed numeric samples within each target, 0–100%.
        Missing values are excluded.
      </p>
      <svg
        viewBox="0 0 360 300"
        className="target-radar"
        role="img"
        aria-label={
          complete
            ? "Within-target sample percentages across five water measurements"
            : "Radar unavailable: each measurement needs assessed samples"
        }
      >
        {[0.25, 0.5, 0.75, 1].map((v) => (
          <polygon
            key={v}
            points={five.map((_, i) => xy(i, v).join(",")).join(" ")}
            fill="none"
            stroke="#c9dfe2"
          />
        ))}
        {five.map((s, i) => {
          const [x, y] = xy(i, 1.27);
          return (
            <g key={s.key}>
              <line
                x1="180"
                y1="145"
                x2={xy(i, 1)[0]}
                y2={xy(i, 1)[1]}
                stroke="#c9dfe2"
              />
              <text x={x} y={y} textAnchor="middle">
                {s.technical || s.name}
              </text>
            </g>
          );
        })}
        {complete && (
          <polygon
            points={points}
            fill="#17af9e"
            fillOpacity=".2"
            stroke="#087d89"
            strokeWidth="2"
          />
        )}
      </svg>
      {!complete && (
        <p>
          Waiting for numeric samples and selected targets on all five axes.
        </p>
      )}
      <ul className="radar-values">
        {five.map((s) => (
          <li key={s.key}>
            {s.name}:{" "}
            {s.assessed
              ? `${Math.round((s.within / s.assessed) * 100)}% (${s.within}/${s.assessed})`
              : "Unavailable"}{" "}
            · missing {s.missing}
          </li>
        ))}
      </ul>
      <p className="analytics-note">
        This describes fetched samples. It is not a health rating or WQI.
      </p>
    </section>
  );
}
export function Scatter({ rows, xKey, yKey }) {
  const pairs = pairedSamples(rows, xKey, yKey),
    r = correlation(rows, xKey, yKey),
    xm = metrics.find((m) => m.key === xKey),
    ym = metrics.find((m) => m.key === yKey);
  const scale = (key, start, length, invert = false) => {
    const v = pairs.map((p) => p[key]),
      min = Math.min(...v),
      max = Math.max(...v),
      pad = Math.max((max - min) * 0.1, 0.1);
    return {
      min: min - pad,
      max: max + pad,
      fn: (n) =>
        start +
        (invert
          ? 1 - (n - min + pad) / (max - min + 2 * pad)
          : (n - min + pad) / (max - min + 2 * pad)) *
          length,
    };
  };
  const x = scale(xKey, 60, 285),
    y = scale(yKey, 35, 175, true);
  return (
    <section className="plain-panel">
      <h2>Measurement relationship</h2>
      <p className="analytics-note">
        X: {xm.name} ({xm.unit}) · Y: {ym.name} ({ym.unit})
      </p>
      {pairs.length ? (
        <svg
          viewBox="0 0 400 270"
          className="scatter-plot"
          role="img"
          aria-label={`${pairs.length} paired numeric samples; correlation ${r === null ? "unavailable" : r.toFixed(2)}`}
        >
          <path d="M60 35V210H345" fill="none" stroke="#7a969e" />
          {pairs.map((p, i) => (
            <circle
              key={i}
              cx={x.fn(p[xKey])}
              cy={y.fn(p[yKey])}
              r="3.5"
              fill="#087d89"
              opacity=".55"
            >
              <title>
                {new Date(p.time).toLocaleString()}: {p[xKey]} {xm.unit},{" "}
                {p[yKey]} {ym.unit}
              </title>
            </circle>
          ))}
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <text x={60 + f * 285} y="235" textAnchor="middle">
                {(x.min + f * (x.max - x.min)).toFixed(1)}
              </text>
              <text x="50" y={214 - f * 175} textAnchor="end">
                {(y.min + f * (y.max - y.min)).toFixed(1)}
              </text>
            </g>
          ))}
        </svg>
      ) : (
        <p className="chart-empty">No paired numeric samples in this period.</p>
      )}
      <p>
        <strong>Pearson r: {r === null ? "Unavailable" : r.toFixed(2)}</strong>{" "}
        · {pairs.length} paired samples
      </p>
      <p className="analytics-note">
        Requires at least three pairs and variation in both measurements.
        Samples from the same packet are paired; missing values are excluded.
        Correlation does not establish cause.
      </p>
    </section>
  );
}
export function PacketBrowser({ rows }) {
  const [query, setQuery] = useState(""),
    [limit, setLimit] = useState(20);
  const found = [...rows]
    .reverse()
    .filter((r) =>
      `${r.id} ${new Date(r.time).toISOString()} ${metrics.map((m) => r[m.key] ?? "").join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  return (
    <section className="plain-panel">
      <h2>Recorded packet explorer</h2>
      <div className="analytics-actions">
        <label>
          Search packets
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(20);
            }}
            placeholder="Packet ID, UTC timestamp or value"
          />
        </label>
        <span>{found.length} matches · newest first</span>
      </div>
      <div className="analytics-table">
        <table>
          <caption>Recorded values for the selected period</caption>
          <thead>
            <tr>
              <th>Packet</th>
              <th>Acquired (UTC)</th>
              {metrics.map((m) => (
                <th key={m.key}>
                  {m.technical || m.name}
                  <small>{m.unit}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {found.slice(0, limit).map((r, i) => (
              <tr key={`${r.id}-${r.time}-${i}`}>
                <td>{r.id}</td>
                <td>{new Date(r.time).toISOString()}</td>
                {metrics.map((m) => (
                  <td key={m.key}>{formatValue(r[m.key], m.precision)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!found.length && <p>No matching packets.</p>}
      {found.length > limit && (
        <button
          className="quiet-button"
          onClick={() => setLimit((n) => n + 50)}
        >
          Show more packets
        </button>
      )}
    </section>
  );
}
