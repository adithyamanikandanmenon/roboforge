import React, { useState } from "react";
import { Download, BarChart3 } from "lucide-react";
import { metrics, formatValue } from "./pondData.js";
import {
  analyseRows,
  thermalDifference,
  analyticsReport,
  analyticsCSV,
  analyticsDataset,
} from "./analyticsData.js";
import {
  MetricSnapshots,
  DualTrend,
  Radar,
  Scatter,
  PacketBrowser,
} from "./analyticsVisuals.jsx";
import "./analytics.css";
export default function Analytics({
  profile,
  rows,
  targets,
  mode,
  connection,
  now,
  settings,
  cached,
  Chart,
}) {
  const [hours, setHours] = useState(24),
    [primary, setPrimary] = useState("ph"),
    [secondary, setSecondary] = useState("dissolved_oxygen"),
    [layout, setLayout] = useState("overlay");
  const selectedRows = rows.filter(
    (r) => r.time >= now - hours * 3600000 && r.time <= now,
  );
  const stats = analyseRows(selectedRows, targets),
    latest = selectedRows.at(-1);
  const fresh = latest && now - latest.time <= settings.staleMinutes * 60000;
  const source =
    mode === "demo"
      ? "Example data — simulated"
      : cached
        ? "Saved snapshot — current conditions unknown"
        : mode === "live" && connection === "connected"
          ? "Firebase records"
          : "Connection unavailable — current conditions unknown";
  const stamp = (t) =>
    t ? new Date(t).toLocaleString() : "No timestamp received";
  function download(content, type, extension) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `roboforge-${profile.id}-${mode === "demo" ? "example" : "records"}-${hours}h.${extension}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="water-analytics">
      <section className="plain-panel analytics-lead">
        <div>
          <span className="overline">READINGS INTO PERSPECTIVE</span>
          <h2>Water analytics · {profile.name}</h2>
          <p>{source}</p>
          <p>
            Last acquired: {stamp(latest?.time)} ·{" "}
            {fresh ? "Within update timeout" : "Fresh reading unavailable"}
          </p>
        </div>
        <div className="analytics-actions">
          <label>
            Analysis period
            <select value={hours} onChange={(e) => setHours(+e.target.value)}>
              <option value="6">Last 6 hours</option>
              <option value="24">Last 24 hours</option>
              <option value="168">Last 7 days</option>
            </select>
          </label>
          <button
            className="quiet-button"
            disabled={!selectedRows.length}
            onClick={() =>
              download(analyticsCSV(selectedRows), "text/csv", "csv")
            }
          >
            <Download size={16} />
            Export analytics CSV
          </button>
          <button
            className="quiet-button"
            disabled={!selectedRows.length}
            onClick={() =>
              download(
                analyticsReport({
                  profile,
                  rows: selectedRows,
                  targets,
                  source: `${source}; ${fresh ? "reading within update timeout" : "fresh reading unavailable"}`,
                  hours,
                  now,
                }),
                "text/html",
                "html",
              )
            }
          >
            <Download size={16} />
            Download observation report
          </button>
        </div>
        <p className="analytics-note">
          {selectedRows.length} records in this window, from up to 500 fetched
          per water body. Summaries use recorded samples; gaps and missing
          measurements are not filled in. Exports include only this water body's
          selected period.
        </p>
      </section>
      <details className="plain-panel connection-inspector">
        <summary>Data connection &amp; integration details</summary>
        <dl>
          <dt>Source mode</dt>
          <dd>{source}</dd>
          <dt>Firebase project</dt>
          <dd>{settings.firebase?.projectId || "Not configured"}</dd>
          <dt>Readings path</dt>
          <dd>
            <code>{profile.path}</code>
          </dd>
          <dt>Connection status</dt>
          <dd>{connection}</dd>
          <dt>Last acquisition</dt>
          <dd>{stamp(latest?.time)}</dd>
        </dl>
        <p className="analytics-note">
          The dashboard uses one shared subscription for the selected water
          body. Connection status confirms the reader connection, not sensor
          calibration or hardware operation. Configure the device to send
          timestamped packets to this path using its authorized account.
        </p>
      </details>
      <p className="analytics-note">
        Latest recorded measurements in this period. These may be old; use the
        acquisition timestamp and connection status above to judge freshness.
        Select a card to graph it.
      </p>
      <MetricSnapshots
        stats={stats}
        rows={selectedRows}
        targets={targets}
        onSelect={setPrimary}
      />
      <section className="plain-panel analytics-chart-controls">
        <label>
          Chart layout
          <select value={layout} onChange={(e) => setLayout(e.target.value)}>
            <option value="overlay">Combined dual-axis view</option>
            <option value="separate">Separate charts</option>
          </select>
        </label>
        <p className="analytics-note">
          Choose measurements below, or select a reading card to change the
          first measurement.
        </p>
      </section>
      <div className="analytics-charts">
        {[
          [primary, setPrimary, "First measurement"],
          [secondary, setSecondary, "Second measurement"],
        ].map(([key, setKey, label]) => (
          <section className="plain-panel" key={label}>
            <label className="analytics-picker">
              {label}
              <select value={key} onChange={(e) => setKey(e.target.value)}>
                {metrics.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name} ({m.unit})
                  </option>
                ))}
              </select>
            </label>
            {layout === "separate" && (
              <Chart
                rows={selectedRows}
                metric={metrics.find((m) => m.key === key)}
                targets={targets}
              />
            )}
            <p className="analytics-note">
              Each graph has its own labelled scale. Dashed lines show selected
              target bounds where configured. Similar movements do not establish
              cause.
            </p>
          </section>
        ))}
      </div>
      {layout === "overlay" && (
        <section className="plain-panel">
          <h2>Dual-measurement trend</h2>
          <DualTrend
            rows={selectedRows}
            primary={primary}
            secondary={secondary}
            targets={targets}
          />
        </section>
      )}
      <div className="analytics-charts">
        <Radar stats={stats} />
        <Scatter rows={selectedRows} xKey={primary} yKey={secondary} />
      </div>
      <section className="plain-panel analytics-export-center">
        <h2>Dataset &amp; reports</h2>
        <p>
          Export this water body's selected period with its original acquisition
          timestamps. JSON includes source mode, saved targets and statistics.
        </p>
        <button
          className="quiet-button"
          disabled={!selectedRows.length}
          onClick={() =>
            download(
              analyticsDataset({
                profile,
                rows: selectedRows,
                targets,
                source,
                hours,
                now,
              }),
              "application/json",
              "json",
            )
          }
        >
          <Download size={16} />
          Download JSON dataset
        </button>
      </section>
      <PacketBrowser rows={selectedRows} />
      <section className="plain-panel">
        <div className="panel-title">
          <div>
            <h2>
              <BarChart3 size={19} /> Recorded ranges and changes
            </h2>
            <p>
              Latest and change refer to the last two packets in this period.
              Missing values break that comparison.
            </p>
          </div>
        </div>
        <div className="analytics-table">
          <table>
            <caption>Sample statistics for {profile.name}</caption>
            <thead>
              <tr>
                <th>Measurement</th>
                <th>Latest / change</th>
                <th>Min / mean / max</th>
                <th>Numeric / missing</th>
                <th>Selected target</th>
                <th>Within target</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.key}>
                  <th scope="row">
                    {s.name}
                    <small>{s.unit}</small>
                  </th>
                  <td>
                    {formatValue(s.latest, s.precision)}
                    <small>
                      {s.delta === null
                        ? "Change unavailable"
                        : `${s.delta > 0 ? "+" : ""}${s.delta.toFixed(s.precision)} ${s.unit} since previous packet`}
                    </small>
                  </td>
                  <td>
                    {[s.min, s.mean, s.max]
                      .map((n) => formatValue(n, s.precision))
                      .join(" / ")}
                  </td>
                  <td>
                    {s.count} / {s.missing}
                  </td>
                  <td>{s.target}</td>
                  <td>
                    {s.assessed
                      ? `${s.within} of ${s.assessed} (${Math.round((s.within / s.assessed) * 100)}%)`
                      : "No assessed samples"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="analytics-note">
          Means and percentages are sample-based, not time-weighted. Averages
          can hide individual exceptions. A within-target percentage is not a
          water-safety score.
        </p>
      </section>
      <section className="plain-panel analytics-calculations">
        <h2>What we can calculate from these readings</h2>
        <p>
          <strong>
            Air minus water temperature:{" "}
            {formatValue(thermalDifference(selectedRows.at(-1)), 1)} °C
          </strong>
        </p>
        <p>
          A direct difference using both measurements from the latest packet in
          this period. It is unavailable if either value is missing.
        </p>
        <details>
          <summary>About calculated indices in the attached prototype</summary>
          <p>
            Conductivity and salinity conversions need instrument and
            water-specific assumptions. Ammonia concentration needs an ammonia
            measurement; pH and temperature alone cannot supply it. Evaporation
            and a water-quality index need a validated method and appropriate
            inputs. These estimates are not used to assign farm alerts or
            certify water conditions.
          </p>
        </details>
      </section>
    </div>
  );
}
