import React, { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Bell,
  NotebookPen,
  UserRound,
  Download,
  Check,
  Plus,
  LogOut,
  ShieldCheck,
  Info,
  ArrowRight,
  Settings,
  CloudOff,
} from "lucide-react";
import { defaultTargets, makeDemo, metrics, formatValue } from "./pondData.js";
import {
  activityTypes,
  validateProfile,
  dailySummary,
  buildAlerts,
  reportText,
} from "./farmInsights.js";
import { FarmClient } from "./farmClient.js";
const key = "roboforge-farm-demo-v1";
const initialProfile = {
  id: "POND_01",
  name: "Pond 01",
  location: "Fish farm",
  fishSpecies: "Not specified",
  notes: "",
  photoUrl: "",
  path: "water_quality/POND_01/readings",
  staleMinutes: 10,
  targets: defaultTargets,
};
function cached() {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (
      value &&
      Array.isArray(value.profiles) &&
      value.profiles.length &&
      value.profiles.every((p) => validateProfile(p))
    )
      return value;
  } catch {}
  return { profiles: [initialProfile], activities: {}, ack: {} };
}
export function useFarmWorkspace(settings, mode) {
  const [local, setLocal] = useState(cached),
    [profiles, setProfiles] = useState(() => cached().profiles),
    [selectedId, setSelectedId] = useState("POND_01"),
    [activities, setActivities] = useState([]),
    [ack, setAck] = useState({}),
    [session, setSession] = useState({ user: null, isOwner: false }),
    [demoOwner, setDemoOwner] = useState(false),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [pushOn, setPushOn] = useState(false);
  const clientRef = useRef(null);
  const configKey = JSON.stringify(settings.firebase);
  useEffect(() => {
    setDemoOwner(false);
    setPushOn(false);
    if (mode === "demo") {
      setProfiles(local.profiles);
      setSession({ user: null, isOwner: false });
      return;
    }
    setSession({ user: null, isOwner: false });
    setProfiles([
      {
        ...initialProfile,
        name: settings.pondName || "Pond 01",
        location: settings.location || "Fish farm",
        path: settings.path,
        staleMinutes: settings.staleMinutes || 10,
        targets: settings.targets || defaultTargets,
      },
    ]);
    let disposed = false,
      offProfiles;
    const client = new FarmClient();
    clientRef.current = client;
    client
      .open(settings.firebase, (s) => {
        if (!disposed) setSession(s);
      })
      .then(() => {
        if (disposed) {
          void client.close();
          return;
        }
        offProfiles = client.watch(
          "pond_profiles",
          (data) => {
            if (disposed) return;
            if (data) {
              const valid = Object.entries(data).flatMap(([id, p]) => {
                try {
                  return [validateProfile({ ...p, id })];
                } catch {
                  return [];
                }
              });
              if (valid.length) setProfiles(valid);
            } else
              setProfiles([
                {
                  ...initialProfile,
                  name: settings.pondName || "Pond 01",
                  path: settings.path,
                },
              ]);
          },
          (e) => setNotice(`Pond profiles could not load: ${e.message}`),
        );
      })
      .catch((e) => {
        if (!disposed) setNotice(`Owner connection unavailable: ${e.message}`);
      });
    return () => {
      disposed = true;
      offProfiles?.();
      void client.close();
      clientRef.current = null;
    };
  }, [mode, configKey]);
  useEffect(() => {
    if (!profiles.some((p) => p.id === selectedId))
      setSelectedId(profiles[0]?.id || "POND_01");
  }, [profiles, selectedId]);
  useEffect(() => {
    if (mode === "demo") {
      setActivities(local.activities[selectedId] || []);
      setAck(local.ack[selectedId] || {});
      return;
    }
    setActivities([]);
    setAck({});
    if (!session.isOwner || !clientRef.current?.sdk) return;
    const client = clientRef.current;
    const offA = client.watch(
      `farm_activity/${selectedId}`,
      (v) =>
        setActivities(
          Object.entries(v || {})
            .map(([id, a]) => ({ ...a, id }))
            .sort((a, b) => b.time - a.time),
        ),
      (e) => setNotice(e.message),
    );
    const offAck = client.watch(
      `alert_ack/${selectedId}`,
      (v) => setAck(v || {}),
      (e) => setNotice(e.message),
    );
    return () => {
      offA();
      offAck();
    };
  }, [mode, selectedId, session.isOwner, local]);
  const profile =
    profiles.find((p) => p.id === selectedId) || profiles[0] || initialProfile;
  const canEdit = mode === "demo" ? demoOwner : session.isOwner;
  function persist(next) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setLocal(next);
    } catch {
      throw new Error(
        "Your browser could not save this change. Check storage permissions.",
      );
    }
  }
  async function action(fn) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setNotice(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile(value) {
    if (!canEdit) throw new Error("Open owner tools to edit a pond.");
    const p = validateProfile(value);
    if (mode === "demo") {
      const next = [...local.profiles.filter((x) => x.id !== p.id), p];
      persist({ ...local, profiles: next });
      setProfiles(next);
    } else await clientRef.current.write(`pond_profiles/${p.id}`, p);
    setSelectedId(p.id);
    setNotice(
      mode === "demo"
        ? "Pond profile saved in this browser’s demo."
        : "Pond profile saved to Firebase.",
    );
  }
  async function addActivity(value) {
    if (!canEdit) throw new Error("Owner access is required.");
    if (
      !activityTypes.includes(value.type) ||
      !value.note?.trim() ||
      value.note.length > 1000 ||
      !Number.isFinite(value.time) ||
      value.time > Date.now() + 60000
    )
      throw new Error(
        "Choose an activity, enter a note under 1,000 characters, and use a valid past or current time.",
      );
    const item = {
      ...value,
      note: value.note.trim(),
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    if (mode === "demo")
      persist({
        ...local,
        activities: {
          ...local.activities,
          [selectedId]: [item, ...(local.activities[selectedId] || [])].slice(
            0,
            500,
          ),
        },
      });
    else
      await clientRef.current.write(
        `farm_activity/${selectedId}/${item.id}`,
        item,
      );
    setNotice(
      mode === "demo"
        ? "Diary entry saved locally."
        : "Diary entry saved to Firebase.",
    );
  }
  async function acknowledge(alert) {
    if (!canEdit) throw new Error("Owner access is required.");
    const value = { time: Date.now(), note: "Owner has seen this alert" };
    if (mode === "demo")
      persist({
        ...local,
        ack: {
          ...local.ack,
          [selectedId]: { ...(local.ack[selectedId] || {}), [alert.id]: value },
        },
      });
    else
      await clientRef.current.write(
        `alert_ack/${selectedId}/${alert.id}`,
        value,
      );
  }
  return {
    profiles,
    profile,
    selectedId,
    setSelectedId,
    activities: mode === "demo" || session.isOwner ? activities : [],
    ack,
    session,
    canEdit,
    demoOwner,
    setDemoOwner,
    notice,
    setNotice,
    busy,
    action,
    saveProfile,
    addActivity,
    acknowledge,
    pushOn: pushOn === selectedId,
    async login(email, password) {
      await clientRef.current.login(email, password);
    },
    async logout() {
      if (mode === "demo") setDemoOwner(false);
      else {
        try {
          if (pushOn) await clientRef.current.disablePush();
        } finally {
          await clientRef.current.logout();
          setPushOn(false);
        }
      }
    },
    async push() {
      if (mode === "demo")
        throw new Error(
          "Push delivery needs your live Firebase project and deployed alert functions.",
        );
      if (pushOn === selectedId) {
        await clientRef.current.disablePush();
        setPushOn(false);
      } else {
        await clientRef.current.enablePush(selectedId, settings.vapidKey);
        setPushOn(selectedId);
      }
    },
  };
}
function downloadReport(content) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  link.download = "pond-daily-report.txt";
  link.click();
  URL.revokeObjectURL(link.href);
}
export function DailyBrief({ rows, targets, now, farm, mode, onNavigate }) {
  const sum = dailySummary(rows, targets, now);
  const oxygen = sum.stats.find((s) => s.key === "dissolved_oxygen");
  return (
    <section className="daily-brief">
      <div className="daily-brief-heading">
        <span>
          <CalendarDays size={18} />
        </span>
        <div>
          <h2>Today in your pond</h2>
          <p>
            {mode === "demo" ? "Example summary" : "Past 24 hours"} ·{" "}
            {sum.count} recorded updates
          </p>
        </div>
        <button
          className="quiet-button"
          disabled={!sum.count}
          onClick={() =>
            downloadReport(
              reportText({
                pond: farm.profile,
                rows,
                targets,
                activities: farm.activities,
                now,
                demo: mode === "demo",
              }),
            )
          }
        >
          <Download size={13} />
          Daily report
        </button>
      </div>
      <div className="daily-statements">
        <p>
          <strong>
            {sum.outside
              ? `${sum.outside} readings to check`
              : "No recorded target exceptions"}
          </strong>
          <span>
            {sum.count
              ? `${sum.missing} incomplete readings in this period.`
              : "Waiting for measurements to make a summary."}
          </span>
        </p>
        <p>
          <strong>
            Oxygen{" "}
            {oxygen.count
              ? `${formatValue(oxygen.min)}–${formatValue(oxygen.max)} mg/L`
              : "not reported"}
          </strong>
          <span>
            {oxygen.count > 1
              ? `Changed by ${(oxygen.last - oxygen.first).toFixed(1)} mg/L between the first and latest available values.`
              : "More readings will help show a trend."}
          </span>
        </p>
        <p>
          <strong>
            {farm.profile.fishSpecies || "Fish species not specified"}
          </strong>
          <span>
            Targets selected for {farm.profile.name}.{" "}
            <button onClick={() => onNavigate("owner")}>
              Manage pond <ArrowRight size={11} />
            </button>
          </span>
        </p>
      </div>
    </section>
  );
}
export function ActivityMarkers({ activities, rows }) {
  const first = rows[0]?.time;
  const visible = activities.filter(
    (a) => first && a.time >= first && a.time <= Date.now(),
  );
  return visible.length ? (
    <div
      className="activity-markers"
      aria-label="Pond activities during the chart period"
    >
      {visible.slice(0, 8).map((a) => (
        <span key={a.id}>
          <NotebookPen size={12} />
          {new Date(a.time).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · {a.type}
        </span>
      ))}
    </div>
  ) : null;
}
export function FarmTools({
  farm,
  section,
  rows,
  targets,
  now,
  mode,
  connection,
  settings,
  onConnect,
}) {
  const alerts = buildAlerts(rows, targets, {
    now,
    staleMinutes: farm.profile.staleMinutes,
    connected: mode === "demo" || connection === "connected",
  });
  const [filter, setFilter] = useState("active"),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [profileDraft, setProfileDraft] = useState(null),
    [creatingProfile, setCreatingProfile] = useState(false),
    [activity, setActivity] = useState({ type: "Feeding", note: "", time: "" });
  useEffect(() => setProfileDraft(null), [farm.selectedId]);
  const submitActivity = (event) => {
    event.preventDefault();
    void farm.action(async () => {
      await farm.addActivity({
        ...activity,
        time: activity.time ? new Date(activity.time).getTime() : Date.now(),
      });
      setActivity({ ...activity, note: "", time: "" });
    });
  };
  const list = alerts.filter(
    (a) => filter === "all" || (filter === "active" ? a.active : !a.active),
  );
  if (section === "alerts")
    return (
      <section className="plain-panel farm-panel">
        <div className="panel-title">
          <div>
            <h2>Pond alerts</h2>
            <p>
              What changed, when it was seen, and whether it still needs
              attention.
            </p>
          </div>
          <select
            aria-label="Alert filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
            <option value="all">All in 24 hours</option>
          </select>
        </div>
        <p className="farm-note">
          Based on selected targets and available records. Acknowledging means
          “seen”; it does not resolve the condition.
        </p>
        {!list.length && (
          <div className="farm-empty">
            <Check size={25} />
            <h3>No {filter === "all" ? "recorded" : filter} alerts</h3>
            <p>
              We’ll highlight target exceptions, missing values and stopped
              updates here.
            </p>
          </div>
        )}
        {list.map((alert) => (
          <article
            className={`alert-row ${alert.active ? "" : "resolved"}`}
            key={alert.id}
          >
            <Bell size={19} />
            <div>
              <h3>
                {alert.title}
                <span>{alert.active ? "Active" : "Resolved"}</span>
              </h3>
              <p>{alert.detail}</p>
              <small>
                First seen: {new Date(alert.started).toLocaleString()}
                {alert.resolved &&
                  ` · Back in range: ${new Date(alert.resolved).toLocaleString()}`}
              </small>
            </div>
            {farm.canEdit && (
              <button
                disabled={farm.busy || !!farm.ack[alert.id]}
                className="quiet-button"
                onClick={() => farm.action(() => farm.acknowledge(alert))}
              >
                {farm.ack[alert.id] ? "Seen" : "Mark seen"}
              </button>
            )}
          </article>
        ))}
        <div className="farm-actions">
          <button
            className="quiet-button"
            disabled={
              !farm.canEdit ||
              farm.busy ||
              mode === "demo" ||
              !settings.vapidKey
            }
            onClick={() => farm.action(() => farm.push())}
          >
            <Bell size={14} />
            {farm.pushOn ? "Turn off phone alerts" : "Enable phone alerts"}
          </button>
          <p>
            {mode === "demo"
              ? "Push delivery becomes available after Firebase and alert functions are deployed."
              : !settings.vapidKey
                ? "Web Push key not configured."
                : !farm.canEdit
                  ? "Sign in as owner to subscribe."
                  : "Sends on condition changes and stopped sensor updates after backend setup."}
          </p>
        </div>
      </section>
    );
  if (section === "activity")
    return (
      <section className="plain-panel farm-panel">
        <div className="panel-title">
          <div>
            <h2>Pond activity diary</h2>
            <p>
              Record what happened around the pond, then compare it with water
              changes.
            </p>
          </div>
          <NotebookPen size={20} />
        </div>
        {farm.canEdit ? (
          <form className="activity-form" onSubmit={submitActivity}>
            <label>
              Activity
              <select
                value={activity.type}
                onChange={(e) =>
                  setActivity({ ...activity, type: e.target.value })
                }
              >
                {activityTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              When (leave blank for now)
              <input
                type="datetime-local"
                value={activity.time}
                onChange={(e) =>
                  setActivity({ ...activity, time: e.target.value })
                }
              />
            </label>
            <label className="activity-note-field">
              What happened?
              <input
                maxLength="1000"
                required
                placeholder="e.g. Morning feeding, 2 kg"
                value={activity.note}
                onChange={(e) =>
                  setActivity({ ...activity, note: e.target.value })
                }
              />
            </label>
            <button className="green-button" disabled={farm.busy} type="submit">
              <Plus size={14} />
              Add entry
            </button>
          </form>
        ) : (
          <div className="owner-gate">
            <UserRound size={20} />
            <p>
              {mode === "demo"
                ? "Open Owner tools and enable the local demo to try the diary."
                : "Only signed-in owners can view and edit the private farm diary."}
            </p>
          </div>
        )}
        {farm.activities.length ? (
          farm.activities.map((a) => (
            <article key={a.id} className="diary-row">
              <span>
                <NotebookPen size={17} />
              </span>
              <div>
                <h3>{a.type}</h3>
                <p>{a.note}</p>
                <small>{new Date(a.time).toLocaleString()}</small>
              </div>
            </article>
          ))
        ) : (
          <div className="farm-empty">
            <NotebookPen size={25} />
            <h3>No diary entries to show</h3>
            <p>
              Feeding, aerator use, rain, sensor checks and water changes can be
              recorded here.
            </p>
          </div>
        )}
        <p className="farm-note">
          {mode === "demo"
            ? "Demo diary entries stay in this browser."
            : "Live diary entries are stored in Firebase and visible only to verified owners."}
        </p>
      </section>
    );
  if (section !== "owner") return null;
  return (
    <div className="owner-layout">
      <section className="plain-panel farm-panel">
        <div className="panel-title">
          <div>
            <h2>Owner access</h2>
            <p>Public visitors can see readings. Owners manage the farm.</p>
          </div>
          <ShieldCheck size={21} />
        </div>
        {mode === "demo" ? (
          <div className="owner-access-content">
            <div className="demo-access-note">
              <Info size={19} />
              <p>
                Local owner demo. This is a way to try editing, not a real
                signed-in account. Changes stay in your browser.
              </p>
            </div>
            <button
              className={farm.canEdit ? "quiet-button" : "green-button"}
              onClick={() => farm.setDemoOwner(!farm.demoOwner)}
            >
              {farm.canEdit ? "Leave owner demo" : "Try owner tools locally"}
            </button>
            <button className="quiet-button" onClick={onConnect}>
              Connect Firebase
            </button>
          </div>
        ) : farm.session.user ? (
          <div className="owner-access-content">
            <p>{farm.session.user.email}</p>
            <p>
              {farm.session.isOwner
                ? "Verified farm owner"
                : "Signed in, but the farm_owner role has not been granted."}
            </p>
            <button
              className="quiet-button"
              onClick={() => farm.action(() => farm.logout())}
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        ) : (
          <form
            className="owner-login"
            onSubmit={(e) => {
              e.preventDefault();
              void farm.action(async () => {
                try {
                  await farm.login(email, password);
                } finally {
                  setPassword("");
                }
              });
            }}
          >
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button className="green-button" disabled={farm.busy}>
              Sign in as owner
            </button>
            <p>
              Ask the project administrator to create your account and grant the
              farm owner role.
            </p>
          </form>
        )}
        <div className="setup-status">
          <h3>Connection checklist</h3>
          {[
            [!!settings.firebase, "Firebase web configuration"],
            [
              mode === "live" && connection === "connected",
              "Readings connection",
            ],
            [farm.session.isOwner, "Verified owner account"],
            [!!settings.vapidKey, "Web Push key"],
          ].map(([ready, label]) => (
            <div key={label}>
              <span className={ready ? "ready" : ""}>
                {ready ? "Ready" : "Not set up"}
              </span>
              {label}
            </div>
          ))}
          <p>
            Backend deployment and message delivery still need verification in
            your Firebase project.
          </p>
          <a
            className="setup-guide-link"
            href="https://github.com/adithyamanikandanmenon/roboforge/blob/main/FIREBASE_SETUP.md"
            target="_blank"
            rel="noreferrer"
          >
            Open Firebase setup guide <ArrowRight size={12} />
          </a>
        </div>
      </section>
      <section className="plain-panel farm-panel">
        <div className="panel-title">
          <div>
            <h2>Pond profiles</h2>
            <p>Names, fish species, photos and owner-selected targets.</p>
          </div>
          <button
            className="quiet-button"
            disabled={!farm.canEdit}
            onClick={() => {
              setCreatingProfile(true);
              setProfileDraft({
                ...initialProfile,
                id: "",
                name: "New pond",
                targets: structuredClone(defaultTargets),
              });
            }}
          >
            <Plus size={13} />
            Add pond
          </button>
        </div>
        <div className="profile-list">
          {farm.profiles.map((p) => (
            <button
              key={p.id}
              className={p.id === farm.selectedId ? "selected" : ""}
              onClick={() => farm.setSelectedId(p.id)}
            >
              <span>
                {p.name}
                <small>
                  {p.fishSpecies || "Species not specified"} · {p.location}
                </small>
              </span>
              <ArrowRight size={13} />
            </button>
          ))}
        </div>
        {farm.profile.photoUrl && (
          <img
            className="profile-photo"
            src={farm.profile.photoUrl}
            alt={farm.profile.name}
            referrerPolicy="no-referrer"
          />
        )}
        <div className="farm-actions">
          <button
            className="quiet-button"
            disabled={!farm.canEdit}
            onClick={() => {
              setCreatingProfile(false);
              setProfileDraft(structuredClone(farm.profile));
            }}
          >
            <Settings size={14} />
            Edit selected pond
          </button>
          <span className="farm-note">
            Targets should be confirmed for your fish species.
          </span>
        </div>
        {profileDraft && (
          <form
            className="profile-form"
            onSubmit={(e) => {
              e.preventDefault();
              void farm.action(async () => {
                if (
                  creatingProfile &&
                  farm.profiles.some((p) => p.id === profileDraft.id)
                )
                  throw new Error(
                    "This pond ID already exists. Choose a different ID.",
                  );
                await farm.saveProfile(profileDraft);
                setProfileDraft(null);
              });
            }}
          >
            <div className="profile-fields">
              {[
                ["id", "Pond ID"],
                ["name", "Pond name"],
                ["fishSpecies", "Fish species"],
                ["location", "Location"],
                ["photoUrl", "Photo URL (HTTPS, optional)"],
                ["path", "Firebase readings path"],
              ].map(([k, label]) => (
                <label key={k}>
                  {label}
                  <input
                    value={profileDraft[k] || ""}
                    maxLength={k === "photoUrl" ? 2000 : 120}
                    required={["id", "name", "path"].includes(k)}
                    disabled={k === "id" && !creatingProfile}
                    onChange={(e) =>
                      setProfileDraft({
                        ...profileDraft,
                        [k]: e.target.value,
                        ...(k === "id"
                          ? { path: `water_quality/${e.target.value}/readings` }
                          : {}),
                      })
                    }
                  />
                </label>
              ))}
              <label>
                Old after (minutes)
                <input
                  type="number"
                  min="1"
                  max="1440"
                  required
                  value={profileDraft.staleMinutes}
                  onChange={(e) =>
                    setProfileDraft({
                      ...profileDraft,
                      staleMinutes: +e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <div className="profile-targets">
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
                        step="0.1"
                        value={profileDraft.targets[m.key][b] ?? ""}
                        placeholder="No limit"
                        onChange={(e) =>
                          setProfileDraft({
                            ...profileDraft,
                            targets: {
                              ...profileDraft.targets,
                              [m.key]: {
                                ...profileDraft.targets[m.key],
                                [b]:
                                  e.target.value === ""
                                    ? null
                                    : +e.target.value,
                              },
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            <div className="farm-actions">
              <button
                type="submit"
                className="green-button"
                disabled={farm.busy}
              >
                Save pond profile
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => setProfileDraft(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
