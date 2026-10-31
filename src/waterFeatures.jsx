import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  CalendarClock,
  Check,
  ClipboardCheck,
  Maximize2,
  Minimize2,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { metrics, assess, formatValue, targetText } from "./pondData.js";
import {
  normalizeSensorChecks,
  sensorAssessment,
  reminderKinds,
  reminderStatus,
} from "./waterOperations.js";
import "./waterFeatures.css";

const dateText = (time) =>
  time == null
    ? "Not recorded"
    : new Date(time).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      });
const localInput = (time) => {
  const date = new Date(time);
  return new Date(time - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};

export function OwnerGate({ farm, mode, onOwner, children }) {
  if (farm.canEdit) return children;
  return (
    <div className="owner-gate">
      <ShieldCheck size={22} />
      <p>
        {mode === "demo"
          ? "Try these controls by enabling the local owner demo in Owner tools."
          : "Sign in with a verified owner account to manage this water body."}
      </p>
      <button className="quiet-button" onClick={onOwner}>
        Open owner tools
      </button>
    </div>
  );
}

export function SensorConfidence({
  farm,
  rows,
  now,
  connected,
  mode,
  onOwner,
}) {
  const records = normalizeSensorChecks(farm.profile.sensorChecks);
  const [sensor, setSensor] = useState("ph"),
    [event, setEvent] = useState("checkedAt"),
    [at, setAt] = useState(""),
    [draft, setDraft] = useState(records.ph);
  useEffect(() => {
    setDraft(records[sensor]);
    setAt("");
  }, [farm.profile, sensor]);
  const metric = metrics.find((m) => m.key === sensor);
  return (
    <div className="water-feature-stack">
      <section className="plain-panel farm-panel">
        <div className="panel-title">
          <div>
            <h2>Can I trust this reading?</h2>
            <p>
              Sensor records for {farm.profile.name} ·{" "}
              {farm.profile.bodyType || "Pond"}
            </p>
          </div>
          <ShieldCheck size={23} />
        </div>
        <p className="water-explanation">
          A sudden change can come from the water or the sensor. Verify it with
          a fresh reading or another instrument. These checks keep the original
          readings visible and do not certify accuracy.
        </p>
        <div className="sensor-grid">
          {metrics.map((m) => {
            const record = records[m.key],
              status = sensorAssessment(
                m,
                rows,
                record,
                now,
                farm.profile.staleMinutes,
                connected,
              );
            return (
              <article className="sensor-card" key={m.key}>
                <header>
                  <h3>{m.name}</h3>
                  <span>{m.technical || m.unit}</span>
                </header>
                <span className={`water-status ${status.code}`}>
                  <Activity size={14} />
                  {status.label}
                </span>
                <p>{status.detail}</p>
                <dl>
                  <div>
                    <dt>Last checked</dt>
                    <dd>{dateText(record.checkedAt)}</dd>
                  </div>
                  <div>
                    <dt>Last calibrated</dt>
                    <dd>{dateText(record.calibratedAt)}</dd>
                  </div>
                  <div>
                    <dt>Next check due</dt>
                    <dd>
                      {status.checkDueAt === null
                        ? "Record a check first"
                        : dateText(status.checkDueAt)}
                    </dd>
                  </div>
                  <div>
                    <dt>Next calibration due</dt>
                    <dd>
                      {status.calibrationDueAt === null
                        ? "Record calibration first"
                        : dateText(status.calibrationDueAt)}
                    </dd>
                  </div>
                </dl>
                <div className="sensor-comparison">
                  Flag changes over {record.jumpLimit} {m.unit} between readings
                  up to {record.maxGapMinutes} min apart.
                  {!status.comparable &&
                    " Waiting for two comparable readings."}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <section className="plain-panel farm-panel">
        <div className="panel-title">
          <div>
            <h2>Record sensor care</h2>
            <p>
              Saved separately for each water body. Dates are visible on the
              public dashboard.
            </p>
          </div>
          <ClipboardCheck size={22} />
        </div>
        <OwnerGate farm={farm} mode={mode} onOwner={onOwner}>
          <div className="water-form">
            <label>
              Sensor
              <select
                value={sensor}
                onChange={(e) => setSensor(e.target.value)}
              >
                {metrics.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name} ({m.unit})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <form
            className="water-form"
            onSubmit={(e) => {
              e.preventDefault();
              const when =
                e.currentTarget.elements.namedItem("sensorEventAt").value;
              void farm.action(async () => {
                await farm.saveSensorEvent(
                  sensor,
                  event,
                  when ? new Date(when).getTime() : Date.now(),
                );
                setAt("");
              });
            }}
          >
            <label>
              What was done?
              <select value={event} onChange={(e) => setEvent(e.target.value)}>
                <option value="checkedAt">Sensor checked</option>
                <option value="calibratedAt">Sensor calibrated</option>
              </select>
            </label>
            <label>
              When (leave blank for now)
              <input
                type="datetime-local"
                name="sensorEventAt"
                max={localInput(now)}
                value={at}
                onChange={(e) => setAt(e.target.value)}
                onInput={(e) => setAt(e.currentTarget.value)}
              />
            </label>
            <button className="green-button" disabled={farm.busy}>
              <Check size={16} />
              Save care record
            </button>
          </form>
          <form
            className="water-form sensor-settings"
            onSubmit={(e) => {
              e.preventDefault();
              void farm.action(() =>
                farm.saveProfile({
                  ...farm.profile,
                  sensorChecks: { ...records, [sensor]: draft },
                }),
              );
            }}
          >
            <h3>Check settings for {metric.name.toLowerCase()}</h3>
            {[
              ["checkEveryDays", "Check every (days)", 1, 3650, 1],
              ["calibrateEveryDays", "Calibrate every (days)", 1, 3650, 1],
              [
                "jumpLimit",
                `Unusual change over (${metric.unit})`,
                0.001,
                1000000,
                "any",
              ],
              [
                "maxGapMinutes",
                "Compare readings within (minutes)",
                1,
                1440,
                1,
              ],
            ].map(([key, label, min, max, step]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  required
                  min={min}
                  max={max}
                  step={step}
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [key]:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
            <p className="water-explanation">
              Starting intervals and change limits are examples. Set them for
              your equipment and sampling rate using the sensor manufacturer’s
              guidance. A smaller comparison window avoids treating a long gap
              as a sudden jump.
            </p>
            <button className="quiet-button" disabled={farm.busy}>
              Save sensor settings
            </button>
          </form>
        </OwnerGate>
      </section>
    </div>
  );
}

const blankReminder = () => ({
  title: "",
  kind: "Feeding",
  dueAt: localInput(Date.now() + 3600000),
  repeat: "none",
  notes: "",
});
const repeatWords = {
  none: "One time",
  daily: "Every 24 hours",
  weekly: "Every 7 days",
};
export function CareReminders({ farm, mode, now, onOwner }) {
  const [draft, setDraft] = useState(blankReminder),
    [filter, setFilter] = useState("active");
  const due = farm.reminders.filter(
    (r) => reminderStatus(r, now) === "due",
  ).length;
  const list = farm.reminders
    .filter((r) => {
      const status = reminderStatus(r, now);
      return filter === "active"
        ? ["due", "upcoming"].includes(status)
        : status === filter;
    })
    .sort((a, b) => a.dueAt - b.dueAt);
  return (
    <div className="water-feature-stack">
      <section className="plain-panel farm-panel">
        <div className="panel-title">
          <div>
            <h2>Everyday care, remembered.</h2>
            <p>{farm.profile.name} · Feeding, cleaning and sensor checks</p>
          </div>
          <CalendarClock size={23} />
        </div>
        <p className="water-explanation">
          These are your planned tasks, separate from water-quality alerts.
          Reminders and notes are private to owners. Due tasks appear here while
          the website is open; phone delivery needs the optional Firebase
          notification service.
        </p>
        <OwnerGate farm={farm} mode={mode} onOwner={onOwner}>
          <div className="reminder-summary">
            <strong>{due}</strong>
            <span>
              {due === 1 ? "task due" : "tasks due"} for this water body
            </span>
            <span className="water-status">Owner only</span>
          </div>
          <div className="reminder-filters" aria-label="Filter care reminders">
            {[
              ["active", "All active"],
              ["due", "Due now"],
              ["upcoming", "Upcoming"],
              ["completed", "Completed"],
              ["archived", "Archived"],
            ].map(([key, title]) => (
              <button
                key={key}
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {title}
              </button>
            ))}
          </div>
          <div className="reminder-list">
            {list.map((r) => {
              const status = reminderStatus(r, now),
                active = ["due", "upcoming"].includes(status);
              return (
                <article className={`reminder-card ${status}`} key={r.id}>
                  <div className="reminder-card-heading">
                    <span className={`water-status ${status}`}>
                      {status === "due"
                        ? "Due now"
                        : status === "upcoming"
                          ? "Scheduled"
                          : status === "completed"
                            ? "Completed"
                            : "Archived"}
                    </span>
                    <span>
                      {r.kind} · {repeatWords[r.repeat]}
                    </span>
                  </div>
                  <h3>{r.title}</h3>
                  <p>
                    {status === "completed"
                      ? `Done ${dateText(r.completedAt)}`
                      : `Due ${dateText(r.dueAt)}`}
                  </p>
                  {r.notes && <p className="reminder-notes">{r.notes}</p>}
                  {r.lastCompletedAt && status !== "completed" && (
                    <small>Last done {dateText(r.lastCompletedAt)}</small>
                  )}
                  {active && (
                    <div className="water-actions">
                      <button
                        className="green-button"
                        disabled={farm.busy}
                        onClick={() =>
                          farm.action(() => farm.changeReminder(r, "complete"))
                        }
                      >
                        <Check size={15} />
                        Mark done
                      </button>
                      <button
                        className="quiet-button"
                        disabled={farm.busy}
                        onClick={() =>
                          farm.action(() => farm.changeReminder(r, "snooze"))
                        }
                      >
                        Remind in 1 hour
                      </button>
                      <button
                        className="quiet-button"
                        onClick={() => {
                          setDraft({ ...r, dueAt: localInput(r.dueAt) });
                          document
                            .getElementById("care-reminder-form")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="quiet-button"
                        disabled={farm.busy}
                        onClick={() =>
                          farm.action(() => farm.changeReminder(r, "archive"))
                        }
                      >
                        Archive
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {!list.length && (
            <div className="farm-empty">
              <CalendarClock size={28} />
              <h3>No {filter === "active" ? "active" : filter} tasks</h3>
              <p>Add a task below, or choose another filter.</p>
            </div>
          )}
        </OwnerGate>
      </section>
      {farm.canEdit && (
        <section className="plain-panel farm-panel" id="care-reminder-form">
          <div className="panel-title">
            <div>
              <h2>{draft.id ? "Edit care reminder" : "Add a care reminder"}</h2>
              <p>
                For {farm.profile.name}. Repeats use elapsed hours, so local
                time can shift where daylight saving applies.
              </p>
            </div>
            <Plus size={22} />
          </div>
          <form
            className="water-form"
            onSubmit={(e) => {
              e.preventDefault();
              const dueAt = new Date(
                e.currentTarget.elements.namedItem("dueAt").value,
              ).getTime();
              void farm.action(async () => {
                await farm.saveReminder({
                  ...draft,
                  dueAt,
                });
                setDraft(blankReminder());
              });
            }}
          >
            <label className="water-wide">
              Task title
              <input
                required
                maxLength="120"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Clean the intake filter"
              />
            </label>
            <label>
              Care type
              <select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              >
                {reminderKinds.map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <label>
              Due date and time
              <input
                required
                type="datetime-local"
                name="dueAt"
                value={draft.dueAt}
                onChange={(e) => setDraft({ ...draft, dueAt: e.target.value })}
                onInput={(e) => {
                  const value = e.currentTarget.value;
                  setDraft((previous) => ({ ...previous, dueAt: value }));
                }}
              />
            </label>
            <label>
              Repeat
              <select
                value={draft.repeat}
                onChange={(e) => setDraft({ ...draft, repeat: e.target.value })}
              >
                {Object.entries(repeatWords).map(([key, title]) => (
                  <option key={key} value={key}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <label className="water-wide">
              Notes (optional)
              <textarea
                rows="2"
                maxLength="1000"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </label>
            <div className="water-actions">
              <button className="green-button" disabled={farm.busy}>
                <Plus size={15} />
                {draft.id ? "Save changes" : "Add reminder"}
              </button>
              {draft.id && (
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => setDraft(blankReminder())}
                >
                  Cancel editing
                </button>
              )}
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

export function SensorSummary({ farm, rows, now, connected, onOpen }) {
  const records = normalizeSensorChecks(farm.profile.sensorChecks);
  const assessments = metrics
    .slice(0, 5)
    .map((m) =>
      sensorAssessment(
        m,
        rows,
        records[m.key],
        now,
        farm.profile.staleMinutes,
        connected,
      ),
    );
  const jumps = assessments.filter((s) => s.code === "verify").length,
    maintenance = assessments.filter((s) => s.code === "due").length;
  return (
    <button className="sensor-summary" onClick={onOpen}>
      <ShieldCheck size={23} />
      <span>
        <strong>
          {jumps
            ? `${jumps} unusual sensor ${jumps === 1 ? "change" : "changes"} — verify`
            : maintenance
              ? `${maintenance} sensor maintenance ${maintenance === 1 ? "check" : "checks"} due`
              : "Sensor checks & confidence"}
        </strong>
        <small>
          {jumps
            ? "Compare a fresh reading before deciding whether this is a water or sensor issue."
            : "See recorded checks, calibration dates and unusual changes."}
        </small>
      </span>
      <span>View details →</span>
    </button>
  );
}

export function LargeScreen({
  farm,
  rows,
  targets,
  now,
  mode,
  connection,
  onExit,
}) {
  const root = useRef(null),
    exitRef = useRef(onExit),
    [fullscreen, setFullscreen] = useState(false),
    [message, setMessage] = useState("");
  exitRef.current = onExit;
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !document.fullscreenElement) exitRef.current();
    };
    const onFull = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFull);
    root.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFull);
    };
  }, []);
  const latest = rows.at(-1),
    connected = mode === "demo" || connection === "connected",
    old = latest && now - latest.time > farm.profile.staleMinutes * 60000,
    records = normalizeSensorChecks(farm.profile.sensorChecks);
  const title = !connected
    ? "Connection interrupted"
    : !latest
      ? "Waiting for readings"
      : old
        ? "Readings are old"
        : "Latest readings";
  return (
    <main className="farm-display" ref={root} tabIndex="-1">
      <header className="display-header">
        <div>
          <span className="display-brand">ROBOFORGE · FARM DISPLAY</span>
          <h1>{farm.profile.name}</h1>
          <p>
            {farm.profile.bodyType || "Pond"} ·{" "}
            {farm.profile.location || "Location not specified"}
          </p>
        </div>
        <div className="display-controls">
          <label>
            Water body
            <select
              value={farm.selectedId}
              onChange={(e) => farm.setSelectedId(e.target.value)}
            >
              {farm.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await root.current.requestFullscreen();
              } catch {
                setMessage(
                  "Full screen is unavailable in this browser. The large-screen layout is still active.",
                );
              }
            }}
          >
            {fullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            <span>{fullscreen ? "Leave full screen" : "Full screen"}</span>
          </button>
          <button onClick={onExit}>
            <X size={20} />
            Exit display
          </button>
        </div>
      </header>
      <div className="display-state" role="status">
        <strong>
          {mode === "demo" ? "EXAMPLE DATA · " : ""}
          {title}
        </strong>
        <span>
          {latest
            ? `Last reading: ${dateText(latest.time)}`
            : "No measurements have arrived for this water body."}
        </span>
        {mode === "demo" && (
          <span>Simulated readings. No real pond is being monitored.</span>
        )}
      </div>
      {message && <p role="status">{message}</p>}
      <div className="display-metrics">
        {metrics.slice(0, 5).map((m) => {
          const value = latest?.[m.key],
            status = assess(m, value, targets),
            sensor = sensorAssessment(
              m,
              rows,
              records[m.key],
              now,
              farm.profile.staleMinutes,
              connected,
            ),
            unavailable = !connected || old;
          return (
            <article
              className={`display-card ${unavailable ? "unknown" : status}`}
              key={m.key}
            >
              <h2>{m.name}</h2>
              <div className="display-value">
                {formatValue(value, m.precision)}
                <span>{m.unit}</span>
              </div>
              <strong>
                {unavailable
                  ? "Current condition unknown"
                  : {
                      good: "Within target",
                      attention: "Outside target — check",
                      unknown: "No reading",
                      info: "No target set",
                    }[status]}
              </strong>
              <p>
                Target: {targetText(targets[m.key])} {m.unit}
              </p>
              {sensor.code === "verify" && (
                <div className="display-sensor-warning">
                  Unusual change — verify this sensor reading
                </div>
              )}
            </article>
          );
        })}
      </div>
      <footer className="display-footer">
        <p>
          Compare readings with targets chosen for this water body. These
          readings do not certify water safety.
        </p>
        <span>
          {mode === "demo"
            ? "Example mode"
            : connected
              ? "Firebase connected"
              : "Firebase unavailable"}{" "}
          · Updates appear automatically
        </span>
      </footer>
    </main>
  );
}
