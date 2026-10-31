import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Droplets,
  Leaf,
  LayoutDashboard,
  History,
  BookOpen,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Check,
  CheckCircle2,
  AlertCircle,
  CloudSun,
  Wind,
  CloudRain,
  Thermometer,
  Waves,
  SlidersHorizontal,
  Download,
  X,
  RefreshCw,
  ChevronDown,
  ExternalLink,
  Fish,
  Database,
  Info,
  ShieldCheck,
  CalendarClock,
  Maximize2,
} from "lucide-react";
import {
  metrics,
  defaultTargets,
  normalizeReadings,
  makeDemo,
  summary,
  assess,
  formatValue,
  targetText,
} from "./pondData.js";
import { subscribeToPond, validateSettings } from "./firebaseReader.js";
import {
  useFarmWorkspace,
  DailyBrief,
  FarmTools,
  ActivityMarkers,
} from "./farmWorkspace.jsx";
import { buildAlerts } from "./farmInsights.js";
import {
  SensorConfidence,
  SensorSummary,
  CareReminders,
  LargeScreen,
} from "./waterFeatures.jsx";
import { reminderStatus } from "./waterOperations.js";
import "./farm.css";
import "./dashboard.css";
const initialSettings = {
  pondName: "Pond 01",
  location: "Fish farm",
  firebase: null,
  path: "water_quality/POND_01/readings",
  anonymous: false,
  staleMinutes: 10,
};
const metricIcons = {
  ph: Droplets,
  temperature: Thermometer,
  dissolved_oxygen: Wind,
  turbidity: Waves,
  tds: Droplets,
};
const labels = {
  good: "Within target",
  attention: "Check this reading",
  unknown: "No reading",
  info: "No target set",
};
function relative(timestamp, now) {
  if (!timestamp) return "No update yet";
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? `${minutes} min ago`
      : `${Math.floor(minutes / 60)} hr ago`;
}
const localTime = (time) =>
  new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function PondArt() {
  return (
    <svg
      viewBox="0 0 360 200"
      role="img"
      aria-label="Illustration of a fish pond surrounded by plants"
    >
      <defs>
        <linearGradient id="pond-water" x2="1" y2="1">
          <stop stopColor="#8fc9b5" />
          <stop offset="1" stopColor="#4d9f98" />
        </linearGradient>
      </defs>
      <ellipse cx="183" cy="158" rx="150" ry="26" fill="#c9ddc3" />
      <path
        d="M40 108Q63 50 168 63Q277 38 321 106Q347 170 182 179Q27 168 40 108"
        fill="#a5cba8"
      />
      <path
        d="M54 109Q89 65 171 78Q267 55 307 109Q324 156 181 165Q44 158 54 109"
        fill="url(#pond-water)"
      />
      <g fill="none" stroke="#cae7d9" strokeWidth="2" opacity=".7">
        <path d="M79 116q35-12 73 0m37-21q32-10 66 1m-95 45q29 10 63-1m37-20q21 7 35-1" />
        <ellipse cx="123" cy="98" rx="22" ry="6" />
        <ellipse cx="235" cy="143" rx="25" ry="5" />
      </g>
      <g fill="#f4c27e">
        <path d="M115 129q17-12 33 0q-17 12-33 0l-12 7v-14z" />
        <path d="M231 107q-13-10-27 0q14 10 27 0l10 6v-12z" />
      </g>
      <g stroke="#386e4c" strokeWidth="3" fill="#6a9a65">
        <path d="M49 119V74m0 24Q27 96 32 77Q48 80 49 98m1-10Q48 66 65 62Q71 81 50 88M300 95V48m0 24q-20-3-19-21q18 3 19 21m0-11q1-20 16-24q7 17-16 24" />
      </g>
      <g fill="#e0e5c4">
        <ellipse cx="73" cy="72" rx="14" ry="8" />
        <ellipse cx="292" cy="153" rx="18" ry="8" />
      </g>
      <circle cx="263" cy="42" r="19" fill="#e9cf8a" />
      <path
        d="M97 50q12-12 23 0m5-9q12-11 21 0"
        fill="none"
        stroke="#82a58d"
        strokeWidth="2"
      />
    </svg>
  );
}
function Chart({ rows, metric, targets, activities = [] }) {
  const points = rows.filter((r) => r[metric.key] !== null);
  if (!points.length)
    return <div className="chart-empty">No readings in this time period.</div>;
  const vals = points.map((r) => r[metric.key]);
  const range = targets[metric.key];
  const bottom = Math.min(
    ...vals,
    ...(range?.min !== null && range?.min !== undefined ? [range.min] : []),
  );
  const top = Math.max(
    ...vals,
    ...(range?.max !== null && range?.max !== undefined ? [range.max] : []),
  );
  const pad = Math.max((top - bottom) * 0.2, 0.2),
    min = bottom - pad,
    max = top + pad;
  const y = (value) => 180 - ((value - min) / (max - min)) * 150;
  const first = points[0].time,
    eventRows = activities.filter(
      (a) => a.time >= first && a.time <= Date.now(),
    ),
    last = Math.max(points.at(-1).time, ...eventRows.map((a) => a.time));
  const x = (time) => 45 + ((time - first) / Math.max(last - first, 1)) * 690;
  const line = points
    .map((r, i) => `${i ? "L" : "M"}${x(r.time)},${y(r[metric.key])}`)
    .join(" ");
  return (
    <div className="plot">
      <svg
        viewBox="0 0 760 225"
        role="img"
        aria-label={`${metric.name} over time, from ${formatValue(vals[0], metric.precision)} to ${formatValue(vals.at(-1), metric.precision)} ${metric.unit}`}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop stopColor="#4a9d80" stopOpacity=".18" />
            <stop offset="1" stopColor="#4a9d80" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => {
          const value = min + ((max - min) * i) / 3;
          return (
            <g key={i}>
              <line
                x1="45"
                x2="735"
                y1={y(value)}
                y2={y(value)}
                stroke="#e7ece5"
                strokeDasharray="4 5"
              />
              <text x="34" y={y(value) + 4} textAnchor="end">
                {value.toFixed(1)}
              </text>
            </g>
          );
        })}
        {range?.min !== null && range?.min !== undefined && (
          <line
            x1="45"
            x2="735"
            y1={y(range.min)}
            y2={y(range.min)}
            stroke="#d2ad6d"
            strokeDasharray="6 6"
          />
        )}
        <path
          d={`${line} L${x(points.at(-1).time)},185 L45,185Z`}
          fill="url(#chart-fill)"
        />
        <path
          d={line}
          fill="none"
          stroke="#39876e"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {eventRows.map((a) => (
          <g key={a.id}>
            <title>
              {a.type}: {a.note}
            </title>
            <line
              x1={x(a.time)}
              x2={x(a.time)}
              y1="30"
              y2="185"
              stroke="#c6aa70"
              strokeDasharray="3 4"
            />
            <circle cx={x(a.time)} cy="30" r="4" fill="#c6aa70" />
          </g>
        ))}
        <circle
          cx={x(points.at(-1).time)}
          cy={y(vals.at(-1))}
          r="4"
          fill="#39876e"
          stroke="white"
          strokeWidth="2"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <text
            key={t}
            x={45 + t * 690}
            y="214"
            textAnchor={t === 0 ? "start" : t === 1 ? "end" : "middle"}
          >
            {localTime(first + (last - first) * t)}
          </text>
        ))}
      </svg>
    </div>
  );
}
function Dashboard() {
  const [settings, setSettings] = useState(initialSettings),
    [rows, setRows] = useState(() => makeDemo()),
    [mode, setMode] = useState("demo"),
    [connection, setConnection] = useState("demo"),
    [error, setError] = useState(""),
    [section, setSection] = useState(
      [
        "alerts",
        "activity",
        "owner",
        "history",
        "guide",
        "waterbodies",
        "sensors",
        "reminders",
      ].includes(new URLSearchParams(location.search).get("section"))
        ? new URLSearchParams(location.search).get("section")
        : "overview",
    ),
    [selected, setSelected] = useState("dissolved_oxygen"),
    [period, setPeriod] = useState(24),
    [now, setNow] = useState(Date.now()),
    [modal, setModal] = useState(false),
    [draft, setDraft] = useState(initialSettings),
    [configText, setConfigText] = useState(""),
    [formError, setFormError] = useState(""),
    [targets, setTargets] = useState(defaultTargets),
    [retry, setRetry] = useState(0),
    [display, setDisplay] = useState(
      new URLSearchParams(location.search).get("view") === "display",
    );
  const farm = useFarmWorkspace(settings, mode);
  useEffect(() => {
    if (display) {
      const url = new URL(location.href);
      url.searchParams.set("water", farm.selectedId);
      history.replaceState(null, "", url);
    }
  }, [display, farm.selectedId]);
  const activeSource = useRef("");
  useEffect(() => {
    const profile = farm.profile;
    setSettings((previous) =>
      previous.pondName === profile.name &&
      previous.location === profile.location &&
      previous.path === profile.path &&
      previous.staleMinutes === profile.staleMinutes
        ? previous
        : {
            ...previous,
            pondName: profile.name,
            location: profile.location,
            path: profile.path,
            staleMinutes: profile.staleMinutes,
          },
    );
    setTargets(profile.targets);
    const source = `${mode}:${profile.id}:${profile.path}`;
    if (activeSource.current !== source) {
      setRows(mode === "demo" ? makeDemo() : []);
      activeSource.current = source;
    }
  }, [farm.profile]);
  const mounted = useRef(true);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const dialog = document.querySelector('[role="dialog"]');
    const controls = () =>
      [...dialog.querySelectorAll("button,input,textarea,select")].filter(
        (el) => !el.disabled,
      );
    controls()[0]?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") setModal(false);
      if (event.key !== "Tab") return;
      const items = controls(),
        first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [modal]);
  useEffect(() => {
    mounted.current = true;
    const clock = setInterval(() => setNow(Date.now()), 30000);
    fetch("./pond-config.json")
      .then((r) => r.json())
      .then((config) => {
        if (!mounted.current) return;
        setSettings((previous) => ({
          ...initialSettings,
          ...config,
          ...(!config.firebase
            ? {
                pondName: previous.pondName,
                location: previous.location,
                path: previous.path,
                staleMinutes: previous.staleMinutes,
              }
            : {}),
        }));
        if (config.targets)
          setTargets({ ...defaultTargets, ...config.targets });
        if (config.firebase) {
          setMode("live");
          setRows([]);
          setConnection("connecting");
        }
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
      clearInterval(clock);
    };
  }, []);
  useEffect(() => {
    if (mode !== "live") return;
    let cancelled = false,
      close;
    setConnection("connecting");
    setError("");
    subscribeToPond(settings, {
      onData: (data) => {
        if (!cancelled) {
          setRows(normalizeReadings(data));
          setError("");
          setNow(Date.now());
        }
      },
      onStatus: (value) => {
        if (!cancelled) setConnection(value);
      },
      onError: (e) => {
        if (!cancelled) setError(e.message);
      },
    })
      .then((stop) => {
        if (cancelled) stop();
        else close = stop;
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
          setConnection("error");
        }
      });
    return () => {
      cancelled = true;
      close?.();
    };
  }, [mode, settings, retry]);
  const state = summary(rows, targets, now, settings.staleMinutes),
    latest = state.latest;
  const displayState =
    mode === "live" && (connection === "error" || connection === "offline")
      ? "unavailable"
      : !latest
        ? "empty"
        : state.stale
          ? "stale"
          : state.missing.length
            ? "missing"
            : state.unassessed.length
              ? "targets"
              : state.alerts.length
                ? "attention"
                : "good";
  const headings = {
    good: "A clear picture of your pond.",
    attention: "A few readings need your attention.",
    missing: "Some readings are missing.",
    targets: "Set a target for each water reading.",
    stale: "It’s time for a fresh update.",
    empty: "Waiting for your pond’s readings.",
    unavailable: "We can’t get a fresh update.",
  };
  const descriptions = {
    good: "Your latest water readings are within the selected targets. See what each one means below.",
    targets:
      "Open Understand the readings to choose the ranges that fit your pond.",
    attention: `${state.alerts.map((m) => m.name).join(" and ")} ${state.alerts.length === 1 ? "is" : "are"} outside the selected targets. Check the details below.`,
    missing:
      "Some sensors haven’t reported a value. We’ll show a status when those readings arrive.",
    stale:
      "These are older readings. Check the sensor connection before relying on the current status.",
    empty:
      "Once readings arrive from Firebase, your pond overview will appear here.",
    unavailable:
      "Check the data connection. Any readings shown below are the last ones received.",
  };
  const currentMetric = metrics.find((m) => m.key === selected),
    filtered = rows.filter((r) => r.time >= now - period * 3600000),
    lastHour = rows.filter(
      (r) => latest && r.time >= latest.time - 3 * 3600000,
    ),
    oxygenDelta =
      lastHour.length > 1 &&
      Number.isFinite(lastHour.at(-1).dissolved_oxygen) &&
      Number.isFinite(lastHour[0].dissolved_oxygen)
        ? lastHour.at(-1).dissolved_oxygen - lastHour[0].dissolved_oxygen
        : null;
  function openSettings() {
    setDraft({ ...settings });
    setConfigText(
      settings.firebase ? JSON.stringify(settings.firebase, null, 2) : "",
    );
    setFormError("");
    setModal(true);
  }
  function applyConnection(e) {
    e.preventDefault();
    try {
      const next = validateSettings({
        ...draft,
        firebase: JSON.parse(configText),
      });
      setSettings(next);
      setRows([]);
      setError("");
      setMode("live");
      setConnection("connecting");
      setModal(false);
    } catch (err) {
      setFormError(err.message);
    }
  }
  function useDemo() {
    setMode("demo");
    setRows(makeDemo());
    setConnection("demo");
    setNow(Date.now());
    setError("");
    setModal(false);
  }
  function exportCSV() {
    const lines = [
      ["timestamp", ...metrics.map((m) => m.key)].join(","),
      ...filtered.map((row) =>
        [
          new Date(row.time).toISOString(),
          ...metrics.map((m) => row[m.key] ?? ""),
        ].join(","),
      ),
    ];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([lines.join("\n")], { type: "text/csv" }),
    );
    link.download = "pond-readings.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function navigate(next) {
    setSection(next);
    const url = new URL(location.href);
    url.searchParams.set("section", next);
    history.replaceState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function setDisplayMode(value) {
    setDisplay(value);
    const url = new URL(location.href);
    if (value) {
      url.searchParams.set("view", "display");
      url.searchParams.set("water", farm.selectedId);
    } else {
      url.searchParams.delete("view");
      url.searchParams.delete("water");
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
    }
    history.replaceState(null, "", url);
    window.scrollTo(0, 0);
  }
  if (display)
    return (
      <LargeScreen
        farm={farm}
        rows={rows}
        targets={targets}
        now={now}
        mode={mode}
        connection={connection}
        onExit={() => setDisplayMode(false)}
      />
    );
  return (
    <div className="pond-app">
      <aside className="pond-sidebar">
        <a className="pond-brand" href="#">
          <span>
            <Waves size={22} />
          </span>
          roboforge<span className="logo-period">.</span>
        </a>
        <span className="workspace-caption">
          A LITTLE CLARITY FOR YOUR POND
        </span>
        <nav aria-label="Main navigation">
          {[
            ["overview", "Pond overview", LayoutDashboard],
            ["waterbodies", "Water bodies", Waves],
            ["history", "Water history", History],
            ["guide", "Understand the readings", BookOpen],
            ["alerts", "Pond alerts", AlertCircle],
            ["sensors", "Sensor confidence", ShieldCheck],
            ["reminders", "Care reminders", CalendarClock],
            ["activity", "Activity diary", History],
            ["owner", "Owner tools", Settings],
          ].map(([key, title, Icon]) => (
            <button
              className={section === key ? "active" : ""}
              key={key}
              aria-label={title}
              onClick={() => navigate(key)}
            >
              <Icon size={18} />
              <span>{title}</span>
              {key === "alerts" && (
                <b className="nav-alert-count">
                  {
                    buildAlerts(rows, targets, {
                      now,
                      staleMinutes: settings.staleMinutes,
                      connected: mode === "demo" || connection === "connected",
                    }).filter((a) => a.active).length
                  }
                </b>
              )}
              {key === "reminders" &&
                farm.canEdit &&
                farm.reminders.some(
                  (r) => reminderStatus(r, now) === "due",
                ) && (
                  <b className="nav-alert-count">
                    {
                      farm.reminders.filter(
                        (r) => reminderStatus(r, now) === "due",
                      ).length
                    }
                  </b>
                )}
              {section === key && <i />}
            </button>
          ))}
        </nav>
        <div className="pond-selector">
          <span className="pond-selector-icon">
            <Fish size={21} />
          </span>
          <div>
            <strong>{settings.pondName}</strong>
            <small>{settings.location}</small>
          </div>
          <span className="pond-online" />
        </div>
        <div className="sidebar-bottom">
          <div className="small-leaf">
            <Leaf size={20} />
          </div>
          <h3>
            Better information.
            <br />
            More peace of mind.
          </h3>
          <p>Know what’s happening below the surface.</p>
          <button onClick={() => navigate("guide")}>
            Get to know your water <ArrowUpRight size={14} />
          </button>
        </div>
        <button
          className="source-link"
          aria-label="Data connection"
          onClick={openSettings}
        >
          <Settings size={16} />
          <span>Data connection</span>
        </button>
      </aside>
      <main className="pond-main">
        <header className="pond-topbar">
          <div>
            <span>YOUR FARM</span>
            <span className="top-separator">/</span>
            <select
              className="header-pond-select"
              aria-label="Choose water body"
              value={farm.selectedId}
              onChange={(e) => farm.setSelectedId(e.target.value)}
            >
              {farm.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              className="top-display-button"
              onClick={() => setDisplayMode(true)}
            >
              <Maximize2 size={15} />
              Large-screen view
            </button>
            <span
              className={`connection-dot ${mode === "live" && connection !== "connected" ? "disconnected" : ""}`}
            />
            <span>
              {mode === "demo"
                ? "Example data"
                : connection === "connected"
                  ? "Connected to Firebase"
                  : connection === "connecting"
                    ? "Connecting…"
                    : "Connection interrupted"}
            </span>
            <span className="top-date">
              {new Date(now).toLocaleDateString([], {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        </header>
        <div className="pond-content">
          <div className="page-intro">
            <div>
              <p className="overline">
                A HEALTHIER POND STARTS WITH UNDERSTANDING
              </p>
              <h1>
                {section === "waterbodies"
                  ? "All your water, in one place."
                  : section === "sensors"
                    ? "Good readings start with good sensors."
                    : section === "reminders"
                      ? "A little care, at the right time."
                      : section === "history"
                        ? "Your water, over time."
                        : section === "guide"
                          ? "Good information. Simply explained."
                          : section === "alerts"
                            ? "Know what needs attention."
                            : section === "activity"
                              ? "The story around your pond."
                              : section === "owner"
                                ? "Your farm, your settings."
                                : "Your pond, at a glance."}
              </h1>
              <p>
                {section === "waterbodies"
                  ? "Add a pond, tank, lake or another water body, then switch between them."
                  : section === "sensors"
                    ? "See what was checked, what is due and which changes need verification."
                    : section === "reminders"
                      ? "Schedule everyday tasks without mixing them with water-quality alerts."
                      : section === "history"
                        ? "See how conditions have changed and explore earlier readings."
                        : section === "guide"
                          ? "You don’t need to be an expert to understand your water."
                          : section === "alerts"
                            ? "Clear alerts, useful context and recorded resolution."
                            : section === "activity"
                              ? "Keep track of feeding, water changes and everyday care."
                              : section === "owner"
                                ? "Manage pond profiles, access and notifications."
                                : "The numbers that matter, explained in a way that makes sense."}
              </p>
            </div>
            <button className="quiet-button" onClick={openSettings}>
              <Database size={15} />
              {mode === "demo" ? "Connect my pond" : "Data settings"}
            </button>
          </div>
          {mode === "demo" && (
            <div className="example-banner">
              <Info size={16} />
              <span>
                You’re exploring an example pond.{" "}
                <strong>These are sample readings.</strong>
              </span>
              <button onClick={openSettings}>
                Show my Firebase data <ArrowRight size={14} />
              </button>
            </div>
          )}
          {farm.notice && (
            <div className="farm-notice" role="status">
              <Info size={16} />
              <span>{farm.notice}</span>
              <button
                aria-label="Dismiss owner message"
                onClick={() => farm.setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {farm.demoOwner && (
            <div className="owner-demo-banner">
              Owner demo enabled · Edits are stored only in this browser.
              <button onClick={() => farm.setDemoOwner(false)}>
                Leave demo
              </button>
            </div>
          )}
          {["alerts", "activity", "owner", "waterbodies"].includes(section) && (
            <FarmTools
              farm={farm}
              section={section}
              rows={rows}
              targets={targets}
              now={now}
              mode={mode}
              connection={connection}
              settings={settings}
              onConnect={openSettings}
              onOwner={() => navigate("owner")}
            />
          )}
          {section === "sensors" && (
            <SensorConfidence
              key={farm.selectedId}
              farm={farm}
              rows={rows}
              now={now}
              connected={mode === "demo" || connection === "connected"}
              mode={mode}
              onOwner={() => navigate("owner")}
            />
          )}
          {section === "reminders" && (
            <CareReminders
              key={farm.selectedId}
              farm={farm}
              now={now}
              mode={mode}
              onOwner={() => navigate("owner")}
            />
          )}
          {mode === "live" && (error || connection === "offline") && (
            <div className="connection-banner" role="alert">
              <AlertCircle size={18} />
              <div>
                <b>Live readings are unavailable</b>
                <p>
                  {error ||
                    "The connection was interrupted. Waiting to reconnect."}
                </p>
              </div>
              <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
            </div>
          )}
          {section === "overview" && (
            <>
              <SensorSummary
                farm={farm}
                rows={rows}
                now={now}
                connected={mode === "demo" || connection === "connected"}
                onOpen={() => navigate("sensors")}
              />
              <DailyBrief
                rows={rows}
                targets={targets}
                now={now}
                farm={farm}
                mode={mode}
                onNavigate={navigate}
              />
              <section
                className={`pond-hero ${displayState === "good" ? "" : "hero-caution"}`}
              >
                <div className="hero-copy">
                  <span className="status-chip">
                    <span />
                    {displayState === "good"
                      ? "WITHIN SELECTED TARGETS"
                      : displayState === "attention"
                        ? "NEEDS A CLOSER LOOK"
                        : displayState === "empty"
                          ? "WAITING FOR DATA"
                          : "CHECK THE LATEST UPDATE"}
                  </span>
                  <h2>{headings[displayState]}</h2>
                  <p>{descriptions[displayState]}</p>
                  <div className="hero-bottom">
                    <span>
                      <span className="tiny-check">
                        <Check size={12} />
                      </span>
                      {mode === "demo"
                        ? "Example reading"
                        : `Last reading: ${relative(latest?.time, now)}`}
                    </span>
                    <span className="hero-divider" />
                    <button onClick={() => navigate("history")}>
                      See water history <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
                <div className="pond-art">
                  {farm.profile.photoUrl ? (
                    <img
                      className="hero-pond-photo"
                      src={farm.profile.photoUrl}
                      alt={farm.profile.name}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <PondArt />
                  )}
                  <span>
                    <Waves size={13} />
                    {settings.pondName} · Water overview
                  </span>
                </div>
              </section>
              <div className="section-title">
                <div>
                  <h2>What’s in the water?</h2>
                  <p>A simple look at your latest readings.</p>
                </div>
                <span className="updated-label">
                  <RefreshCw size={12} />
                  {latest
                    ? `Updated ${relative(latest.time, now)}`
                    : "Awaiting first reading"}
                </span>
              </div>
              <section className="water-cards">
                {metrics.slice(0, 4).map((metric) => {
                  const result = assess(metric, latest?.[metric.key], targets),
                    Icon = metricIcons[metric.key],
                    value = latest?.[metric.key],
                    status =
                      displayState === "unavailable" || displayState === "stale"
                        ? "unknown"
                        : result;
                  return (
                    <button
                      key={metric.key}
                      className="water-card"
                      onClick={() => {
                        setSelected(metric.key);
                        document
                          .getElementById("water-trends")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      }}
                    >
                      <div className="metric-top">
                        <span className={`metric-icon ${metric.key}`}>
                          <Icon size={19} />
                        </span>
                        <ArrowUpRight size={15} />
                      </div>
                      <h3>{metric.name}</h3>
                      <div className="metric-number">
                        {formatValue(value, metric.precision)}
                        <span>{metric.unit}</span>
                      </div>
                      <span className={`reading-state ${status}`}>
                        <i />
                        {displayState === "stale"
                          ? "Older reading"
                          : displayState === "unavailable"
                            ? "Last known reading"
                            : labels[status]}
                      </span>
                      <p>{metric.description}</p>
                      <div className="metric-target">
                        Selected target{" "}
                        <b>
                          {targetText(targets[metric.key])} {metric.unit}
                        </b>
                      </div>
                    </button>
                  );
                })}
              </section>
              <section className="middle-grid">
                <div className="plain-panel trends-panel" id="water-trends">
                  <div className="panel-title">
                    <div>
                      <h2>A little perspective</h2>
                      <p>How your water is changing over time.</p>
                    </div>
                    <select
                      aria-label="Chart time period"
                      value={period}
                      onChange={(e) => setPeriod(+e.target.value)}
                    >
                      <option value="6">Last 6 hours</option>
                      <option value="24">Last 24 hours</option>
                      <option value="168">Last 7 days</option>
                    </select>
                  </div>
                  <div className="chart-metric-tabs">
                    {metrics.slice(0, 4).map((m) => (
                      <button
                        className={selected === m.key ? "selected" : ""}
                        key={m.key}
                        onClick={() => setSelected(m.key)}
                      >
                        {m.key === "dissolved_oxygen"
                          ? "Oxygen"
                          : m.key === "temperature"
                            ? "Temperature"
                            : m.key === "turbidity"
                              ? "Clarity"
                              : "pH"}
                      </button>
                    ))}
                    <span>{currentMetric.unit}</span>
                  </div>
                  <Chart
                    rows={filtered}
                    metric={currentMetric}
                    targets={targets}
                    activities={farm.activities}
                  />
                  <ActivityMarkers
                    activities={farm.activities}
                    rows={filtered}
                  />
                  <div className="chart-caption">
                    <span />
                    <span>
                      Actual recorded values
                      {mode === "demo" ? " in this example" : ""}
                    </span>
                    <small>Up to 500 latest records</small>
                  </div>
                </div>
                <div className="plain-panel attention-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Worth keeping an eye on</h2>
                      <p>A few helpful observations.</p>
                    </div>
                    <span className="observation-icon">
                      <Leaf size={18} />
                    </span>
                  </div>
                  {state.alerts.length ? (
                    state.alerts.map((metric) => (
                      <div className="observation" key={metric.key}>
                        <span className="observation-symbol amber">
                          <AlertCircle size={17} />
                        </span>
                        <div>
                          <h3>{metric.name} is outside your target</h3>
                          <p>
                            {formatValue(latest[metric.key], metric.precision)}{" "}
                            {metric.unit}; selected target:{" "}
                            {targetText(targets[metric.key])}. Check the sensor
                            reading and your pond’s requirements.
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="observation">
                      <span className="observation-symbol">
                        <CheckCircle2 size={17} />
                      </span>
                      <div>
                        <h3>
                          {displayState === "good"
                            ? "No readings outside your targets"
                            : "Check data freshness"}
                        </h3>
                        <p>
                          {displayState === "good"
                            ? "The five water measurements are within the ranges selected for this dashboard."
                            : "A current picture needs fresh readings from all five water measurements."}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="observation">
                    <span
                      className={`observation-symbol ${oxygenDelta !== null && oxygenDelta < -0.2 ? "amber" : ""}`}
                    >
                      {oxygenDelta !== null && oxygenDelta < -0.2 ? (
                        <ArrowDownRight size={17} />
                      ) : (
                        <Waves size={17} />
                      )}
                    </span>
                    <div>
                      <h3>
                        {oxygenDelta !== null && oxygenDelta < -0.2
                          ? "Oxygen has been moving down"
                          : "Follow the oxygen trend"}
                      </h3>
                      <p>
                        {oxygenDelta !== null && oxygenDelta < -0.2
                          ? `It fell by ${Math.abs(oxygenDelta).toFixed(1)} mg/L across the available readings in the last 3 hours. Keep checking for updates.`
                          : "The chart helps you spot changes in the oxygen available in the water."}
                      </p>
                    </div>
                  </div>
                  <div className="observation-note">
                    <Info size={13} />
                    <span>
                      Observations describe recorded changes. They aren’t a
                      prediction of what happens next.
                    </span>
                  </div>
                </div>
              </section>
              <section className="environment-section">
                <div className="section-title">
                  <div>
                    <h2>Around the pond</h2>
                    <p>The wider picture, from your connected sensors.</p>
                  </div>
                </div>
                <div className="environment-cards">
                  {[
                    ["tds", Droplets],
                    ["air_temperature", CloudSun],
                    ["aqi", Wind],
                    ["rainfall", CloudRain],
                  ].map(([key, Icon]) => {
                    const metric = metrics.find((m) => m.key === key);
                    return (
                      <div key={key}>
                        <span className="environment-icon">
                          <Icon size={21} />
                        </span>
                        <div>
                          <h3>{metric.name}</h3>
                          <strong>
                            {formatValue(latest?.[key], metric.precision)}{" "}
                            <small>{metric.unit}</small>
                          </strong>
                          <p>
                            {key === "tds"
                              ? `Target: ${targetText(targets.tds)} ppm`
                              : metric.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="learn-strip">
                <span className="learn-icon">
                  <BookOpen size={25} />
                </span>
                <div>
                  <h3>Curious what these numbers really mean?</h3>
                  <p>
                    A quick, everyday guide to understanding your pond’s water.
                  </p>
                </div>
                <button onClick={() => navigate("guide")}>
                  Let’s make it simple <ArrowRight size={15} />
                </button>
              </section>
            </>
          )}
          {section === "history" && (
            <section className="plain-panel history-panel">
              <div className="panel-title">
                <div>
                  <h2>Recorded water readings</h2>
                  <p>
                    {mode === "demo"
                      ? "Sample history"
                      : "Read directly from Firebase"}{" "}
                    · {filtered.length} records in this period
                  </p>
                </div>
                <div className="history-actions">
                  <select
                    aria-label="History time period"
                    value={period}
                    onChange={(e) => setPeriod(+e.target.value)}
                  >
                    <option value="6">Last 6 hours</option>
                    <option value="24">Last 24 hours</option>
                    <option value="168">Last 7 days</option>
                  </select>
                  <button
                    className="quiet-button"
                    onClick={exportCSV}
                    disabled={!filtered.length}
                  >
                    <Download size={14} />
                    Download CSV
                  </button>
                </div>
              </div>
              <div className="chart-metric-tabs">
                {metrics.slice(0, 5).map((m) => (
                  <button
                    key={m.key}
                    className={selected === m.key ? "selected" : ""}
                    onClick={() => setSelected(m.key)}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
              <Chart
                rows={filtered}
                metric={currentMetric}
                targets={targets}
                activities={farm.activities}
              />
              <ActivityMarkers activities={farm.activities} rows={filtered} />
              <div className="readings-table">
                <table>
                  <thead>
                    <tr>
                      <th>Reading time</th>
                      {metrics.map((m) => (
                        <th key={m.key}>
                          {m.name}
                          <small>{m.unit}</small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...filtered].reverse().map((row) => (
                      <tr key={row.id}>
                        <td>{new Date(row.time).toLocaleString()}</td>
                        {metrics.map((m) => (
                          <td key={m.key}>
                            <span
                              className={
                                assess(m, row[m.key], targets) === "attention"
                                  ? "cell-alert"
                                  : ""
                              }
                            >
                              {formatValue(row[m.key], m.precision)}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!filtered.length && (
                  <p className="empty-records">
                    No records in this period. Try a longer period or check the
                    data connection.
                  </p>
                )}
              </div>
            </section>
          )}
          {section === "guide" && (
            <>
              <section className="guide-intro">
                <BookOpen size={25} />
                <p>
                  Every reading tells part of the story. Look at readings
                  together and watch how they change; a single number doesn’t
                  describe the whole pond.
                </p>
              </section>
              <div className="guide-grid">
                {metrics.map((metric) => {
                  const Icon = metricIcons[metric.key] || CloudSun;
                  return (
                    <article
                      className="plain-panel guide-card"
                      key={metric.key}
                    >
                      <Icon size={23} />
                      <h2>{metric.name}</h2>
                      <span>{metric.technical || metric.unit}</span>
                      <p>
                        {metric.description} {metric.meaning}
                      </p>
                      {targets[metric.key] && (
                        <div className="guide-target">
                          Selected target:{" "}
                          <strong>
                            {targetText(targets[metric.key])} {metric.unit}
                          </strong>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <section className="plain-panel target-settings">
                <h2>Choose the right targets for your pond</h2>
                <p>
                  The starting ranges are examples, not recommendations for a
                  particular fish species. Ask your farm expert for suitable
                  targets, then save them in Owner tools. These are the
                  currently selected targets.
                </p>
                <div className="target-grid">
                  {metrics.slice(0, 5).map((metric) => (
                    <fieldset key={metric.key}>
                      <legend>
                        {metric.name} ({metric.unit})
                      </legend>
                      {["min", "max"].map((bound) => (
                        <label key={bound}>
                          {bound === "min" ? "Minimum" : "Maximum"}
                          <input
                            aria-label={`${metric.name} ${bound}`}
                            type="number"
                            disabled
                            step="0.1"
                            value={targets[metric.key]?.[bound] ?? ""}
                            placeholder="No limit"
                            onChange={(e) => {
                              const value =
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value);
                              setTargets((t) => ({
                                ...t,
                                [metric.key]: {
                                  ...t[metric.key],
                                  [bound]: value,
                                },
                              }));
                            }}
                          />
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
                {Object.values(targets).some(
                  (range) =>
                    range.min !== null &&
                    range.max !== null &&
                    range.min > range.max,
                ) && (
                  <p role="alert" className="form-error">
                    A minimum is higher than its maximum. Correct the target
                    range.
                  </p>
                )}
                <button
                  className="quiet-button"
                  onClick={() => navigate("owner")}
                >
                  Manage targets in Owner tools
                </button>
              </section>
            </>
          )}
          <footer className="pond-footer">
            <span>
              <Leaf size={13} /> Made for people who care for ponds.
            </span>
            <span>
              Example targets · Adjust for your fish and farm{" "}
              <button onClick={() => navigate("guide")}>
                Learn more <ArrowUpRight size={12} />
              </button>
            </span>
          </footer>
        </div>
      </main>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(false);
          }}
        >
          <section
            className="connection-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-title"
          >
            <div className="modal-header">
              <div>
                <p className="overline">FOR THE FARM OWNER</p>
                <h2 id="connection-title">Connect your pond’s readings</h2>
              </div>
              <button
                className="close-button"
                aria-label="Close connection settings"
                onClick={() => setModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="modal-explainer">
              Once connected, visitors see the readings as simple cards and
              charts. Public viewing only reads sensor data. Verified owners can
              save pond profiles and diary entries.
            </p>
            <form onSubmit={applyConnection}>
              <div className="connection-two-fields">
                <label>
                  Pond name
                  <input
                    value={draft.pondName}
                    required
                    onChange={(e) =>
                      setDraft({ ...draft, pondName: e.target.value })
                    }
                  />
                </label>
                <label>
                  Location label
                  <input
                    value={draft.location}
                    onChange={(e) =>
                      setDraft({ ...draft, location: e.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                Firebase web app configuration
                <textarea
                  aria-label="Firebase web app configuration"
                  value={configText}
                  onChange={(e) => setConfigText(e.target.value)}
                  placeholder={
                    '{"apiKey":"…","projectId":"…","databaseURL":"https://….firebasedatabase.app"}'
                  }
                  required
                />
              </label>
              <label>
                Path to your readings
                <input
                  aria-label="Path to your readings"
                  value={draft.path}
                  onChange={(e) => setDraft({ ...draft, path: e.target.value })}
                  required
                />
                <small>For example: water_quality/POND_01/readings</small>
              </label>
              <label className="anonymous-checkbox">
                <input
                  type="checkbox"
                  checked={draft.anonymous}
                  onChange={(e) =>
                    setDraft({ ...draft, anonymous: e.target.checked })
                  }
                />
                Use Firebase anonymous sign-in (only if your read rules require
                it)
              </label>
              <div className="connection-two-fields">
                <label>
                  Mark readings old after (minutes)
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    required
                    value={draft.staleMinutes}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        staleMinutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              {formError && (
                <p role="alert" className="form-error">
                  {formError}
                </p>
              )}
              <div className="modal-buttons">
                <button type="submit" className="green-button">
                  Show my pond’s data <ArrowRight size={14} />
                </button>
                <button
                  type="button"
                  className="quiet-button"
                  onClick={useDemo}
                >
                  Explore example pond
                </button>
              </div>
            </form>
            <p className="owner-help">
              Settings entered here apply only in this tab. To connect the
              website for all visitors, the owner sets the shared{" "}
              <code>pond-config.json</code> file. Use web configuration only;
              never a private service-account key.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
if (new URLSearchParams(location.search).get("view") === "simulator")
  import("./main.jsx").then(({ default: App }) =>
    createRoot(document.getElementById("root")).render(<App />),
  );
else createRoot(document.getElementById("root")).render(<Dashboard />);
