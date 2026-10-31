import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  ShieldCheck,
  WifiOff,
  Compass,
  Check,
  Copy,
} from "lucide-react";
import { subscribeToPond } from "./firebaseReader.js";
import {
  normalizeReadings,
  makeDemo,
  metrics,
  defaultTargets,
} from "./pondData.js";
import { waterAction, compareProbes } from "./actionPolicy.js";
import { normalizeSensorChecks, waterBodyTypes } from "./waterOperations.js";
import {
  readSavedReadings,
  saveReadings,
  removeSavedReadings,
} from "./offlineReadings.js";
import "./actionCenter.css";

export function ActionCenter({
  farm,
  settings,
  mode,
  now,
  onNavigate,
  onSelect,
}) {
  const [fleet, setFleet] = useState({});
  const keys = JSON.stringify(farm.profiles.map((p) => [p.id, p.path]));
  useEffect(() => {
    if (mode === "demo") {
      setFleet(
        Object.fromEntries(
          farm.profiles.map((p) => [
            p.id,
            { rows: makeDemo(), connected: true },
          ]),
        ),
      );
      return;
    }
    if (mode !== "live") return;
    let disposed = false;
    const stops = [];
    setFleet(
      Object.fromEntries(
        farm.profiles.map((p) => {
          const saved = readSavedReadings({ ...settings, path: p.path });
          return [
            p.id,
            { rows: saved?.rows || [], connected: false, cached: !!saved },
          ];
        }),
      ),
    );
    for (const p of farm.profiles) {
      let received = false;
      subscribeToPond(
        { ...settings, path: p.path, limit: 3 },
        {
          onData: (data) => {
            received = true;
            if (!disposed)
              saveReadings(
                { ...settings, path: p.path },
                normalizeReadings(data),
                localStorage,
                true,
              );
            if (!disposed)
              setFleet((prev) => ({
                ...prev,
                [p.id]: {
                  rows: normalizeReadings(data),
                  connected: true,
                  cached: false,
                },
              }));
          },
          onStatus: (status) => {
            if (!disposed)
              setFleet((prev) => ({
                ...prev,
                [p.id]: {
                  ...(prev[p.id] || { rows: [] }),
                  connected: status === "connected" && received,
                },
              }));
          },
          onError: (error) => {
            if (/permission/i.test(error.message))
              removeSavedReadings({ ...settings, path: p.path });
            if (!disposed)
              setFleet((prev) => ({
                ...prev,
                [p.id]: {
                  rows: /permission/i.test(error.message)
                    ? []
                    : prev[p.id]?.rows || [],
                  connected: false,
                  cached: true,
                },
              }));
          },
        },
      )
        .then((stop) => (disposed ? stop() : stops.push(stop)))
        .catch(() => {
          if (!disposed)
            setFleet((prev) => ({
              ...prev,
              [p.id]: { rows: [], connected: false },
            }));
        });
    }
    return () => {
      disposed = true;
      stops.forEach((stop) => stop());
    };
  }, [mode, keys, JSON.stringify(settings.firebase)]);
  const queue = farm.profiles
    .map((p) => ({
      profile: p,
      ...waterAction(p, fleet[p.id]?.rows || [], {
        now,
        connected: !!fleet[p.id]?.connected,
        cached: fleet[p.id]?.cached,
      }),
      last: fleet[p.id]?.rows?.at(-1)?.time,
    }))
    .sort(
      (a, b) => a.rank - b.rank || a.profile.name.localeCompare(b.profile.name),
    );
  const first = queue[0];
  return (
    <section
      className="action-center plain-panel"
      aria-label="What needs attention"
    >
      <div className="action-center-title">
        <div>
          <p className="overline">YOUR NEXT CHECK</p>
          <h2>
            {!first
              ? "Add your first water body"
              : first.rank === 0
                ? `Check ${first.profile.name} first`
                : first.rank < 3
                  ? `${first.profile.name} needs a check`
                  : "No current target exceptions"}
          </h2>
          <p>
            {first?.reason || "Guided setup will help connect its readings."}
          </p>
        </div>
        <button className="quiet-button" onClick={() => onNavigate("setup")}>
          <Compass size={16} />
          Guided setup
        </button>
      </div>
      <p className="action-context">
        {mode === "demo" ? "Example data · " : ""}Target exceptions and probe
        disagreement come first. Unavailable data needs verification and is
        never counted as healthy. Equal priorities are listed by name.
      </p>
      <div className="action-queue">
        {queue.map((item) => (
          <article className={`action-item ${item.code}`} key={item.profile.id}>
            <div>
              <span className={`water-status ${item.code}`}>
                {item.code === "attention"
                  ? "Inspect now"
                  : item.code === "verify"
                    ? "Verify reading"
                    : item.code === "unknown"
                      ? "Current condition unknown"
                      : "Within target"}
              </span>
              <h3>{item.profile.name}</h3>
              <strong>{item.title}</strong>
              <p>{item.reason}</p>
              <p className="next-check">Next: {item.next}</p>
              <small>
                {item.last
                  ? `Last reading: ${new Date(item.last).toLocaleString()}`
                  : "No timestamp received"}
              </small>
            </div>
            <button
              className="quiet-button"
              onClick={() => {
                onSelect(item.profile.id);
                onNavigate(item.code === "verify" ? "sensors" : "overview");
              }}
            >
              Open {item.profile.name}
              <ArrowRight size={14} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ProbeComparison({ farm, rows, now, mode, connected, onOwner }) {
  const record = normalizeSensorChecks(farm.profile.sensorChecks).ph;
  const [draft, setDraft] = useState(record),
    [example, setExample] = useState(false);
  useEffect(() => {
    setDraft(record);
    setExample(false);
  }, [farm.profile]);
  const input =
    example && mode === "demo"
      ? [{ time: now, ph: 7.2, ph_secondary: 8.2, ph_secondary_time: now }]
      : rows;
  const profile =
    example && mode === "demo"
      ? {
          ...farm.profile,
          sensorChecks: {
            ...farm.profile.sensorChecks,
            ph: { ...record, comparePair: true },
          },
        }
      : farm.profile;
  const comparison = !connected
    ? {
        code: "unknown",
        label: "Fresh comparison unavailable",
        detail: "Reconnect and receive a fresh paired sample before comparing.",
      }
    : compareProbes(input, profile, now);
  return (
    <section className="plain-panel probe-panel">
      <div className="panel-title">
        <div>
          <h2>Do the two pH probes agree?</h2>
          <p>For two probes sampling the same water, not two separate ponds.</p>
        </div>
        <ShieldCheck size={24} />
      </div>
      <div className="probe-content">
        <span
          className={`water-status ${comparison.code === "disagree" ? "verify" : comparison.code === "agree" ? "current" : "unknown"}`}
        >
          {comparison.label}
        </span>
        <p>{comparison.detail}</p>
        {comparison.code === "disagree" && (
          <p className="next-check">
            Check both probes, then take a fresh sample or use a reference
            instrument. This flag does not identify which probe is wrong.
          </p>
        )}
        {mode === "demo" && (
          <button className="quiet-button" onClick={() => setExample(!example)}>
            {example
              ? "Return to recorded example"
              : "Try a probe-disagreement example"}
          </button>
        )}
        {example && (
          <p className="farm-note">
            Local illustration only; it does not change recorded readings or any
            live data.
          </p>
        )}
        {farm.canEdit ? (
          <form
            className="water-form"
            onSubmit={(e) => {
              e.preventDefault();
              void farm.action(() =>
                farm.saveProfile({
                  ...farm.profile,
                  sensorChecks: {
                    ...normalizeSensorChecks(farm.profile.sensorChecks),
                    ph: { ...record, ...draft },
                  },
                }),
              );
            }}
          >
            <label className="pair-switch water-wide">
              <input
                type="checkbox"
                checked={draft.comparePair}
                onChange={(e) =>
                  setDraft({ ...draft, comparePair: e.target.checked })
                }
              />
              Both pH probes sample the same water
            </label>
            <label>
              Flag difference over (pH)
              <input
                type="number"
                min="0.01"
                max="14"
                step="0.01"
                required
                value={draft.pairTolerance}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pairTolerance:
                      e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              Maximum time apart (seconds)
              <input
                type="number"
                min="1"
                max="3600"
                step="1"
                required
                value={draft.pairMaxSkewSeconds}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    pairMaxSkewSeconds:
                      e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </label>
            <p className="water-wide">
              The starting comparison limit is an example. Set it for your
              instruments and sampling procedure.
            </p>
            <button className="green-button" disabled={farm.busy}>
              Save comparison settings
            </button>
          </form>
        ) : (
          <button className="quiet-button" onClick={onOwner}>
            Owner tools: set up probe comparison
          </button>
        )}
        <details>
          <summary>Paired reading format for your teammate</summary>
          <p>
            Store both samples in one reading under this water body. Use{" "}
            <code>ph</code>, <code>ph_secondary</code>, <code>timestamp</code>{" "}
            and, if measured at another time,{" "}
            <code>ph_secondary_timestamp</code>. Without the secondary
            timestamp, the app assumes both values came from the same sample
            time. Never pair probes from different water bodies.
          </p>
        </details>
      </div>
    </section>
  );
}

export function GuidedSetup({ farm, settings, mode, onOwner, onDemo }) {
  const [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [type, setType] = useState("Pond"),
    [id, setId] = useState(
      () => `WATER_${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    ),
    [chosen, setChosen] = useState(null),
    [reading, setReading] = useState(null),
    [status, setStatus] = useState("waiting"),
    [targets, setTargets] = useState(structuredClone(defaultTargets)),
    [reviewed, setReviewed] = useState(false),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!chosen) return;
    if (mode === "demo") {
      setReading(makeDemo().at(-1));
      setStatus("demo");
      return;
    }
    let disposed = false,
      close;
    setStatus("connecting");
    setReading(null);
    subscribeToPond(
      { ...settings, path: chosen.path, limit: 1 },
      {
        onData: (data) => {
          if (!disposed) {
            setReading(normalizeReadings(data).at(-1) || null);
            setStatus("connected");
          }
        },
        onStatus: (s) => {
          if (!disposed) setStatus(s);
        },
        onError: () => {
          if (!disposed) setStatus("error");
        },
      },
    )
      .then((stop) => (disposed ? stop() : (close = stop)))
      .catch(() => {
        if (!disposed) setStatus("error");
      });
    return () => {
      disposed = true;
      close?.();
    };
  }, [chosen, mode]);
  const fresh =
    reading &&
    Date.now() - reading.time <= (chosen?.staleMinutes || 10) * 60000 &&
    (status === "connected" || status === "demo");
  return (
    <section className="plain-panel setup-wizard">
      <div className="panel-title">
        <div>
          <h2>Connect your water body, one step at a time.</h2>
          <p>
            {mode === "demo"
              ? "Local example setup. No device or live database is connected."
              : "Owners save the profile; a device supplies the readings."}
          </p>
        </div>
        <Compass size={24} />
      </div>
      <ol className="setup-steps">
        {["Name it", "Connect device", "Confirm reading", "Choose targets"].map(
          (label, i) => (
            <li key={label} aria-current={step === i ? "step" : undefined}>
              <span>{i < step ? <Check size={14} /> : i + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      {!farm.canEdit ? (
        <div className="owner-gate">
          <p>
            {mode === "demo"
              ? "Enable local owner demo to try the setup."
              : "Sign in as the verified owner to add real water bodies."}
          </p>
          <button className="quiet-button" onClick={onOwner}>
            Owner sign-in
          </button>
          {mode === "demo" ? (
            <button
              className="green-button"
              onClick={() => farm.setDemoOwner(true)}
            >
              Enable local owner demo
            </button>
          ) : (
            <button className="quiet-button" onClick={onDemo}>
              Explore example setup
            </button>
          )}
        </div>
      ) : (
        <div className="setup-body">
          {step === 0 && (
            <form
              className="water-form"
              onSubmit={(e) => {
                e.preventDefault();
                void farm.action(async () => {
                  const profile = {
                    id,
                    name,
                    bodyType: type,
                    location: "",
                    fishSpecies: "Not specified",
                    path: `water_quality/${id}/readings`,
                    staleMinutes: 10,
                    targets,
                  };
                  await farm.saveProfile(profile);
                  setChosen(profile);
                  setStep(1);
                });
              }}
            >
              <label>
                Name
                <input
                  required
                  maxLength="80"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. North pond"
                />
              </label>
              <label>
                Water body type
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  {waterBodyTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <p className="water-wide">
                Give it a name everyone recognises. A unique device destination
                will be created for you.
              </p>
              <button className="green-button" disabled={farm.busy}>
                Save name and continue
              </button>
            </form>
          )}
          {step === 1 && (
            <>
              <h3>Connect the device for {chosen.name}</h3>
              <p>
                Ask your teammate to send timestamped readings to this
                destination. A saved profile does not generate measurements by
                itself.
              </p>
              <div className="device-destination">
                <code>{chosen.path}</code>
                <button
                  className="quiet-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(chosen.path);
                      setCopied(true);
                    } catch {
                      setCopied(false);
                      farm.setNotice("Copy the destination text shown here.");
                    }
                  }}
                >
                  <Copy size={14} />
                  {copied ? "Copied" : "Copy destination"}
                </button>
              </div>
              <details>
                <summary>
                  Connection details for the teammate setting up the ESP32
                </summary>
                <p>
                  Use the existing Firebase project and authorised sensor
                  ingestion. Keep device authentication protected; do not make
                  database writes public.
                </p>
                <pre>
                  {JSON.stringify(
                    {
                      projectId: settings.firebase?.projectId || "Example only",
                      path: chosen.path,
                      exampleReading: {
                        timestamp: new Date().toISOString(),
                        ph: 7.2,
                        temperature: 28,
                        dissolved_oxygen: 6,
                        turbidity: 12,
                        tds: 320,
                      },
                    },
                    null,
                    2,
                  )}
                </pre>
                <p>
                  Only send fields your hardware measures. Omitted measurements
                  stay missing.
                </p>
              </details>
              <button className="green-button" onClick={() => setStep(2)}>
                Check for a reading
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <h3>
                {fresh
                  ? mode === "demo"
                    ? "Example reading received"
                    : "A fresh reading arrived"
                  : "Waiting for the device"}
              </h3>
              <p>
                {fresh
                  ? `Timestamp: ${new Date(reading.time).toLocaleString()}`
                  : "Check device power, connectivity and the destination above. Old or missing readings cannot confirm a working connection."}
              </p>
              {reading && (
                <div className="setup-sample">
                  pH: {reading.ph ?? "Not reported"} · Water temperature:{" "}
                  {reading.temperature ?? "Not reported"} °C
                </div>
              )}
              <p>
                Connection: {status === "demo" ? "Simulated only" : status}. You
                can leave and return through Water bodies; the saved profile
                remains available.
              </p>
              <div className="water-actions">
                <button className="quiet-button" onClick={() => setStep(1)}>
                  Back to device details
                </button>
                <button
                  className="green-button"
                  disabled={!fresh}
                  onClick={() => setStep(3)}
                >
                  Confirm and choose targets
                </button>
              </div>
            </>
          )}
          {step === 3 && (
            <form
              className="water-form"
              onSubmit={(e) => {
                e.preventDefault();
                void farm.action(async () => {
                  await farm.saveProfile({ ...chosen, targets });
                  setStep(4);
                });
              }}
            >
              <h3 className="water-wide">Choose suitable targets</h3>
              <p className="water-wide">
                Starting ranges are examples, not a water-safety certification.
                Confirm appropriate limits for this water body and its use with
                someone qualified.
              </p>
              {metrics.slice(0, 5).map((m) => (
                <fieldset key={m.key}>
                  <legend>
                    {m.name} ({m.unit})
                  </legend>
                  {["min", "max"].map((b) => (
                    <label key={b}>
                      {b === "min" ? "Minimum" : "Maximum"}
                      <input
                        type="number"
                        step="any"
                        value={targets[m.key][b] ?? ""}
                        onChange={(e) =>
                          setTargets({
                            ...targets,
                            [m.key]: {
                              ...targets[m.key],
                              [b]:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </fieldset>
              ))}
              <label className="pair-switch water-wide">
                <input
                  required
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I have reviewed these targets for this water body
              </label>
              <button
                className="green-button"
                disabled={!reviewed || farm.busy}
              >
                Save targets and finish
              </button>
            </form>
          )}
          {step === 4 && (
            <>
              <h3>
                {chosen.name} is set up
                {mode === "demo" ? " in the local example" : ""}.
              </h3>
              <p>
                Use the selector at the top to switch water bodies. Check Sensor
                confidence to add maintenance dates, then Care reminders for
                everyday tasks.
              </p>
              <button
                className="quiet-button"
                onClick={() => {
                  setChosen(null);
                  setName("");
                  setStep(0);
                  setReviewed(false);
                  setCopied(false);
                  setId(
                    `WATER_${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                  );
                }}
              >
                Set up another water body
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
