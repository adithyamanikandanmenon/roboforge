import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Cpu,
  Radio,
  Wifi,
  Cloud,
  Play,
  Square,
  RotateCcw,
  ArrowRight,
  Activity,
  Settings2,
  Terminal,
  Database,
  SlidersHorizontal,
  Check,
  Download,
  ChevronRight,
  Zap,
  Layers,
} from "lucide-react";
import { sensors, defaults } from "./sensorSimulator.js";
import { PacketMonitor } from "./packetMonitor.js";
import { Transmitter } from "./transmitter.js";
import { Receiver } from "./receiver.js";
import { WirelessTransport } from "./wirelessTransport.js";
import { FirebaseService } from "./firebaseService.js";
import "./styles.css";

const initialConfig = {
  interval: 3000,
  delay: 650,
  lossEnabled: false,
  loss: 15,
  automatic: true,
  pondId: "POND_01",
  txConnected: true,
  rxConnected: true,
  wifi: true,
  cloud: true,
};
const time = (value) =>
  value ? new Date(value).toLocaleTimeString([], { hour12: false }) : "—";
const short = (value) => value?.slice(0, 8) || "—";
function Badge({ on = true, children }) {
  return (
    <span className={`badge ${on ? "" : "off"}`}>
      <i />
      {children}
    </span>
  );
}
function Board({ kind, active, connected }) {
  return (
    <div className={`board-wrap ${active && connected ? "powered" : ""}`}>
      <div className="board">
        <div className="pins left-pins" />
        <div className="pins right-pins" />
        <div className="antenna" />
        <div className="chip">
          <Cpu size={28} />
          <b>ESP32</b>
          <span>WROOM-32</span>
        </div>
        <div className="board-caption">
          {kind === "tx" ? "TX · SENSOR NODE" : "RX · CLOUD GATEWAY"}
        </div>
        <div className="led" />
        <div className="usb" />
        <span className="board-label">ROBOFORGE DEVKIT V1</span>
      </div>
      <span className="board-shadow" />
    </div>
  );
}
function App() {
  const configRef = useRef({ ...initialConfig }),
    valuesRef = useRef(defaults());
  const [config, setConfig] = useState(configRef.current),
    [values, setValues] = useState(valuesRef.current),
    [events, setEvents] = useState([]),
    [txOn, setTxOn] = useState(false),
    [rxOn, setRxOn] = useState(false),
    [tab, setTab] = useState("monitor"),
    [jsonTab, setJsonTab] = useState("tx"),
    [mode, setMode] = useState("demo"),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [firebaseText, setFirebaseText] = useState(""),
    [records, setRecords] = useState([]),
    [historyOpen, setHistoryOpen] = useState(false),
    [historySource, setHistorySource] = useState(""),
    [broker, setBroker] = useState(""),
    [topic, setTopic] = useState("roboforge/your-unique-session/water"),
    [mqttOn, setMqttOn] = useState(false),
    [inspect, setInspect] = useState("");
  const engine = useRef(null);
  if (!engine.current) {
    const getConfig = () => configRef.current;
    const monitor = new PacketMonitor();
    const firebase = new FirebaseService(getConfig);
    const transport = new WirelessTransport({ monitor, getConfig });
    const tx = new Transmitter({
      transport,
      monitor,
      getConfig,
      getValues: () => valuesRef.current,
    });
    const rx = new Receiver({ transport, monitor, firebase, getConfig });
    engine.current = { monitor, firebase, transport, tx, rx };
  }
  const { monitor, firebase, transport, tx, rx } = engine.current;
  useEffect(() => monitor.subscribe(() => setEvents([...monitor.entries])), []);
  useEffect(
    () => () => {
      tx.stop();
      rx.stop();
      transport.disconnectMqtt();
      void firebase.disconnect();
    },
    [],
  );
  function configure(key, value) {
    const next = { ...configRef.current, [key]: value };
    configRef.current = next;
    setConfig(next);
  }
  function sensor(key, value) {
    const next = { ...valuesRef.current, [key]: value };
    valuesRef.current = next;
    setValues(next);
  }
  function startTx() {
    tx.start();
    setTxOn(true);
  }
  function stopTx() {
    tx.stop();
    setTxOn(false);
  }
  function startRx() {
    rx.start();
    setRxOn(true);
  }
  function stopRx() {
    rx.stop();
    setRxOn(false);
  }
  function start() {
    startRx();
    startTx();
  }
  function stop() {
    stopTx();
    stopRx();
    transport.cancel();
  }
  function reset() {
    stop();
    monitor.clear();
    rx.history = [];
    setHistoryOpen(false);
    setEvents([]);
    setInspect("");
    setStatus("Session reset. Saved database records are retained.");
  }
  function restore() {
    for (const key of ["txConnected", "rxConnected", "wifi", "cloud"])
      configure(key, true);
    setStatus("All simulated connections restored.");
  }
  const count = (stage) => events.filter((e) => e.stage === stage).length;
  // Session totals are kept separately from the bounded log buffer.
  const totals = useRef({});
  useEffect(
    () =>
      monitor.subscribe((e) => {
        totals.current[e.stage] = (totals.current[e.stage] || 0) + 1;
        const key = `${e.channel}:${e.stage}`;
        totals.current[key] = (totals.current[key] || 0) + 1;
        if (e.stage === "stored") {
          const storeKey = e.demo ? "demoStored" : "liveStored";
          totals.current[storeKey] = (totals.current[storeKey] || 0) + 1;
        }
      }),
    [],
  );
  function total(stage) {
    return totals.current[stage] || 0;
  }
  const txPacket = events.find((e) => e.stage === "generated")?.packet,
    rxPacket = events.find((e) => e.stage === "decoded")?.packet;
  const last = (stage) => events.find((e) => e.stage === stage)?.time;
  const steps = [
    ["Sensors", "generated", SlidersHorizontal],
    ["ESP32 #1", "generated", Cpu],
    ["Transmit", "transmitted", Radio],
    ["Wireless", "incoming", Activity],
    ["ESP32 #2", "decoded", Cpu],
    ["Local Wi-Fi", "wifi", Wifi],
    ["Upload", "request", Cloud],
    ["Stored", "stored", Database],
  ];
  async function connectFirebase() {
    setBusy(true);
    setStatus("Connecting to Firebase…");
    try {
      await firebase.connect(JSON.parse(firebaseText));
      setMode("live");
      monitor.emit("cloud", "status", `Firebase connected as ${firebase.uid}`);
      setStatus(
        "Firebase connected. Future receiver packets will write to your project.",
      );
    } catch (e) {
      setMode("demo");
      setStatus(`Firebase connection failed: ${e.message}`);
      monitor.emit("cloud", "status", e.message);
    } finally {
      setBusy(false);
    }
  }
  async function demo() {
    await firebase.disconnect();
    setMode("demo");
    setStatus("Demo mode active. Records are stored in this browser.");
  }
  async function loadHistory() {
    try {
      setRecords(await firebase.retrieve(config.pondId));
      setHistorySource(mode === "demo" ? "Demo local store" : "Firebase");
      setHistoryOpen(true);
      monitor.emit("cloud", "status", "Database history synchronized");
    } catch (e) {
      setStatus(e.message);
    }
  }
  function download() {
    const blob = new Blob([JSON.stringify(monitor.entries, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "roboforge-session.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  const delivery = total("transmitted")
    ? Math.round((total("decoded") / total("transmitted")) * 100)
    : 0;
  return (
    <div className="app">
      <aside className="sidebar">
        <a href="#" className="brand">
          <span>
            <Layers size={23} />
          </span>
          ROBOFORGE<span className="brand-dot">.</span>
        </a>
        <div className="side-heading">WORKSPACE</div>
        <button
          className={tab === "monitor" ? "nav active" : "nav"}
          onClick={() => setTab("monitor")}
        >
          <Activity size={17} />
          Communication lab
          <ChevronRight size={14} />
        </button>
        <button
          className={tab === "settings" ? "nav active" : "nav"}
          onClick={() => setTab("settings")}
        >
          <Settings2 size={17} />
          Connections & settings
        </button>
        <div className="sidebar-system">
          <span className="side-heading">VIRTUAL NETWORK</span>
          <div>
            <i className={txOn ? "dot" : "dot muted"} />
            ESP32_TX_01 <small>TX</small>
          </div>
          <div>
            <i className={rxOn ? "dot" : "dot muted"} />
            ESP32_RX_01 <small>RX</small>
          </div>
          <div>
            <i className={mode === "live" ? "dot" : "dot amber"} />
            Firebase <small>{mode.toUpperCase()}</small>
          </div>
        </div>
        <div className="sidebar-bottom">
          <span className="mini-icon">
            <Cpu size={18} />
          </span>
          <div>
            Dual ESP32 simulator
            <small>Virtual hardware. Real communication.</small>
          </div>
          <span className="version">v1.0</span>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            WORKSPACE <ChevronRight size={12} /> <span>COMMUNICATION LAB</span>
          </div>
          <div className="top-tags">
            <span className="pond-label">◈ {config.pondId}</span>
            <Badge on={txOn && rxOn}>
              {txOn && rxOn ? "Simulation running" : "Simulation idle"}
            </Badge>
          </div>
        </header>
        <div className="content">
          <div className="page-title">
            <div>
              <div className="eyebrow">VIRTUAL IOT SANDBOX</div>
              <h1>
                Two boards. One connected system<span>.</span>
              </h1>
              <p>
                Follow every packet from water-quality sensors to the cloud.
              </p>
            </div>
            <button
              className="secondary"
              onClick={() =>
                setTab(tab === "settings" ? "monitor" : "settings")
              }
            >
              <Settings2 size={15} />
              Configure
            </button>
          </div>
          <div className="demo-banner">
            <span className="demo-icon">
              <Zap size={17} />
            </span>
            <div>
              <b>
                {mode === "demo" ? "You’re in demo mode" : "Live Firebase mode"}
              </b>
              <span>
                {mode === "demo"
                  ? " Full communication simulation · Records saved locally in this browser."
                  : " Virtual sensors · Genuine writes to your Firebase project."}
              </span>
            </div>
            <button onClick={() => setTab("settings")}>
              {mode === "demo" ? "Connect Firebase" : "Manage connection"}{" "}
              <ArrowRight size={14} />
            </button>
          </div>
          {status && (
            <div role="status" className="status-message">
              {status}
              <button
                aria-label="Dismiss message"
                onClick={() => setStatus("")}
              >
                ×
              </button>
            </div>
          )}
          <div className="control-strip">
            <div className="flex gap-2 flex-wrap">
              <button
                className="primary"
                onClick={start}
                disabled={txOn && rxOn}
              >
                <Play size={14} fill="currentColor" />
                Start simulation
              </button>
              <button className="secondary" onClick={stop}>
                <Square size={13} />
                Stop
              </button>
              <button
                className="icon-button"
                aria-label="Reset simulation"
                onClick={() => {
                  reset();
                  totals.current = {};
                }}
              >
                <RotateCcw size={15} />
              </button>
            </div>
            <div className="control-meta">
              <span className="pulse" />{" "}
              {txOn ? "TRANSMITTING" : "READY TO TRANSMIT"}
              <span className="divider" />
              Interval{" "}
              <select
                aria-label="Transmission interval"
                value={config.interval}
                onChange={(e) => configure("interval", +e.target.value)}
              >
                {[1000, 2000, 3000, 5000, 10000].map((n) => (
                  <option key={n} value={n}>
                    {n / 1000}s
                  </option>
                ))}
              </select>
            </div>
          </div>
          {tab === "settings" ? (
            <section className="settings-grid">
              <div className="panel">
                <div className="panel-heading">
                  <Cloud size={16} />
                  <h2>Firebase connection</h2>
                  <Badge on={mode === "live"}>
                    {mode === "live" ? "LIVE" : "DEMO"}
                  </Badge>
                </div>
                <p className="help">
                  Paste your Firebase web app config as JSON. Enable Anonymous
                  Authentication and deploy the included rules. Keep this tab
                  open to retain the anonymous session; credentials are held in
                  memory.
                </p>
                <textarea
                  aria-label="Firebase web configuration"
                  className="config-input"
                  value={firebaseText}
                  onChange={(e) => setFirebaseText(e.target.value)}
                  placeholder={
                    '{\n  "apiKey": "…",\n  "authDomain": "your-project.firebaseapp.com",\n  "projectId": "your-project",\n  "databaseURL": "https://your-project-default-rtdb.firebaseio.com"\n}'
                  }
                />
                <div className="flex gap-2 flex-wrap">
                  <button
                    className="primary"
                    onClick={connectFirebase}
                    disabled={busy || txOn}
                  >
                    {busy ? "Connecting…" : "Connect Firebase"}
                  </button>
                  <button
                    className="secondary"
                    onClick={demo}
                    disabled={busy || txOn}
                  >
                    Use demo store
                  </button>
                </div>
                <p className="help">
                  Stop the transmitter before changing cloud mode. A successful
                  connection does not guarantee write permission: each upload
                  reports the actual SDK result.
                </p>
                {firebase.uid && (
                  <p className="mono break-all">Session UID: {firebase.uid}</p>
                )}
                <button className="secondary" onClick={loadHistory}>
                  <Database size={14} />
                  Retrieve stored records
                </button>
              </div>
              <div className="panel">
                <div className="panel-heading">
                  <Radio size={16} />
                  <h2>Wireless transport</h2>
                  <Badge>{mqttOn ? "MQTT / WSS" : "SIMULATED"}</Badge>
                </div>
                <p className="help">
                  Default: isolated asynchronous JSON transport between two
                  modules. Optional: publish and receive through a secure MQTT
                  WebSocket broker. Use a unique topic; packets may be visible
                  to others on public brokers.
                </p>
                <label className="field">
                  Broker URL
                  <input
                    value={broker}
                    onChange={(e) => setBroker(e.target.value)}
                    placeholder="wss://your-broker/mqtt"
                  />
                </label>
                <label className="field">
                  Topic
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  disabled={busy || txOn}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await transport.connectMqtt(broker, topic);
                      setMqttOn(true);
                      setStatus("MQTT broker connected and topic subscribed.");
                    } catch (e) {
                      transport.disconnectMqtt();
                      setMqttOn(false);
                      setStatus(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Connect MQTT
                </button>
                <button
                  className="secondary ml-2"
                  disabled={txOn}
                  onClick={() => {
                    transport.disconnectMqtt();
                    setMqttOn(false);
                  }}
                >
                  Use simulated
                </button>
                <p className="help">
                  Delay and packet-loss settings apply to simulated transport.
                </p>
              </div>
            </section>
          ) : (
            <>
              <section className="panel architecture">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">THE DATA JOURNEY</span>
                    <h2>System architecture</h2>
                  </div>
                  <span className="mono muted-text">
                    8 STAGES · END-TO-END TRACE
                  </span>
                </div>
                <div className="flow">
                  {steps.map(([label, stage, Icon], index) => (
                    <React.Fragment key={index}>
                      <button
                        className={`flow-node ${last(stage) ? "seen" : ""}`}
                        onClick={() =>
                          setInspect(
                            `${label}: ${last(stage) ? "last event at " + time(last(stage)) : "awaiting first packet"}`,
                          )
                        }
                      >
                        <span className="flow-icon">
                          <Icon size={19} />
                          <i />
                        </span>
                        <b>{label}</b>
                        <small>{time(last(stage))}</small>
                      </button>
                      {index < 7 && (
                        <div
                          className={`flow-wire ${txOn && rxOn ? "animated" : ""}`}
                        >
                          <i />
                          <ArrowRight size={12} />
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
                {inspect && <div className="inspect">{inspect}</div>}
              </section>
              <section className="device-grid">
                <div className="panel device-panel">
                  <div className="panel-heading">
                    <span className="number-tag">01</span>
                    <div>
                      <span className="eyebrow">ESP32 #1</span>
                      <h2>Transmitter</h2>
                    </div>
                    <Badge on={txOn && config.txConnected}>
                      {txOn && config.txConnected ? "TRANSMITTING" : "OFFLINE"}
                    </Badge>
                  </div>
                  <Board
                    kind="tx"
                    active={txOn}
                    connected={config.txConnected}
                  />
                  <div className="device-id">
                    <span>ESP32_TX_01</span>
                    <span>WATER-QUALITY NODE</span>
                  </div>
                  <div className="device-stats">
                    <div>
                      <span>Packets sent</span>
                      <b>{total("transmitted").toString().padStart(3, "0")}</b>
                    </div>
                    <div>
                      <span>Last transmission</span>
                      <b>{time(last("transmitted"))}</b>
                    </div>
                  </div>
                  <div className="device-buttons">
                    <button
                      onClick={txOn ? stopTx : startTx}
                      className="secondary"
                    >
                      {txOn ? <Square size={12} /> : <Play size={12} />}{" "}
                      {txOn ? "Stop transmitter" : "Start transmitter"}
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Restart transmitter"
                      onClick={() => {
                        stopTx();
                        startTx();
                      }}
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                </div>
                <div className="wireless-panel">
                  <div className="radio-orbit">
                    <Radio size={29} />
                    <span />
                    <span />
                  </div>
                  <Badge on={rxOn && config.rxConnected}>WIRELESS LINK</Badge>
                  <h3>{mqttOn ? "MQTT over WSS" : "Virtual wireless"}</h3>
                  <p>Serialized JSON packet handoff</p>
                  <div className={`packet-lane ${txOn ? "animated" : ""}`}>
                    <span />
                    <ArrowRight size={18} />
                  </div>
                  <div className="wireless-data">
                    <span>
                      LATENCY <b>{config.delay} ms</b>
                    </span>
                    <span>
                      PACKET LOSS <b>{config.lossEnabled ? config.loss : 0}%</b>
                    </span>
                  </div>
                  <label className="range-label">
                    Transit delay
                    <input
                      aria-label="Transmission delay"
                      type="range"
                      min="100"
                      max="2500"
                      step="50"
                      value={config.delay}
                      onChange={(e) => configure("delay", +e.target.value)}
                    />
                  </label>
                  <label className="toggle-row">
                    <span>Simulate packet loss</span>
                    <input
                      type="checkbox"
                      checked={config.lossEnabled}
                      onChange={(e) =>
                        configure("lossEnabled", e.target.checked)
                      }
                    />
                  </label>
                  {config.lossEnabled && (
                    <label className="range-label">
                      Loss probability: {config.loss}%
                      <input
                        aria-label="Packet loss percentage"
                        type="range"
                        min="0"
                        max="100"
                        value={config.loss}
                        onChange={(e) => configure("loss", +e.target.value)}
                      />
                    </label>
                  )}
                </div>
                <div className="panel device-panel">
                  <div className="panel-heading">
                    <span className="number-tag blue-number">02</span>
                    <div>
                      <span className="eyebrow">ESP32 #2</span>
                      <h2>Receiver / Gateway</h2>
                    </div>
                    <Badge on={rxOn && config.rxConnected}>
                      {rxOn && config.rxConnected ? "LISTENING" : "OFFLINE"}
                    </Badge>
                  </div>
                  <Board
                    kind="rx"
                    active={rxOn}
                    connected={config.rxConnected}
                  />
                  <div className="device-id">
                    <span>ESP32_RX_01</span>
                    <span>FIREBASE GATEWAY</span>
                  </div>
                  <div className="device-stats">
                    <div>
                      <span>Packets received</span>
                      <b>{total("decoded").toString().padStart(3, "0")}</b>
                    </div>
                    <div>
                      <span>Last reception</span>
                      <b>{time(last("decoded"))}</b>
                    </div>
                  </div>
                  <div className="gateway-links">
                    <span className={config.wifi ? "" : "broken"}>
                      <Wifi size={13} />
                      Local Wi-Fi
                    </span>
                    <span className={config.cloud ? "" : "broken"}>
                      <Cloud size={13} />
                      {mode === "demo"
                        ? "Demo store"
                        : firebase.connected
                          ? "Firebase connected"
                          : "Firebase offline"}
                    </span>
                  </div>
                  <div className="device-buttons">
                    <button
                      className="secondary"
                      onClick={rxOn ? stopRx : startRx}
                    >
                      {rxOn ? <Square size={12} /> : <Play size={12} />}{" "}
                      {rxOn ? "Stop receiver" : "Start receiver"}
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Retrieve received history"
                      onClick={() => {setRecords([...rx.history]);setHistorySource("Receiver decoded packets");setHistoryOpen(true);}}
                    >
                      <Database size={14} />
                    </button>
                  </div>
                </div>
              </section>
              <section className="statistics">
                {[
                  ["Generated", total("generated"), Cpu],
                  ["Transmitted", total("transmitted"), Radio],
                  ["Received", total("decoded"), Check],
                  [
                    mode === "demo" ? "Demo stored" : "Firebase uploads",
                    total(mode === "demo" ? "demoStored" : "liveStored"),
                    Cloud,
                  ],
                  ["TX failures", total("tx:failed"), Activity],
                  ["Failed uploads", total("cloud:failed"), Cloud],
                  ["Delivery rate", `${delivery}%`, Activity],
                ].map(([label, value, Icon]) => (
                  <div key={label}>
                    <span>
                      <Icon size={14} />
                      {label}
                    </span>
                    <b>{value}</b>
                  </div>
                ))}
              </section>
              <section className="workspace-grid">
                <div className="panel sensors">
                  <div className="section-heading">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal size={16} />
                      <h2>Virtual sensors</h2>
                    </div>
                    <label className="auto-label">
                      <input
                        type="checkbox"
                        checked={config.automatic}
                        onChange={(e) =>
                          configure("automatic", e.target.checked)
                        }
                      />
                      Auto drift
                    </label>
                  </div>
                  <div className="sensor-grid">
                    {sensors.map(([key, label, unit, min, max, step]) => (
                      <label key={key}>
                        <span>{label}</span>
                        <div>
                          <input
                            aria-label={label}
                            type="number"
                            min={min}
                            max={max}
                            step={step}
                            value={values[key]}
                            onChange={(e) =>
                              sensor(
                                key,
                                e.target.value === "" ? "" : +e.target.value,
                              )
                            }
                          />
                          <small>{unit}</small>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="sensor-footer">
                    <span>Applied to the next generated packet</span>
                    <button onClick={() => tx.send()} className="text-button">
                      Send once <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
                <div className="panel json-panel">
                  <div className="section-heading">
                    <div className="flex items-center gap-2">
                      <Terminal size={16} />
                      <h2>Live JSON monitor</h2>
                    </div>
                    <span className="mono muted-text">
                      {jsonTab === "tx"
                        ? short(txPacket?.packet_id)
                        : short(rxPacket?.packet_id)}
                    </span>
                  </div>
                  <div className="json-tabs">
                    <button
                      className={jsonTab === "tx" ? "selected" : ""}
                      onClick={() => setJsonTab("tx")}
                    >
                      TX / OUTGOING
                    </button>
                    <button
                      className={jsonTab === "rx" ? "selected" : ""}
                      onClick={() => setJsonTab("rx")}
                    >
                      RX / DECODED
                    </button>
                    <span>application/json</span>
                  </div>
                  <pre>
                    {(jsonTab === "tx" ? txPacket : rxPacket)
                      ? JSON.stringify(
                          jsonTab === "tx" ? txPacket : rxPacket,
                          null,
                          2,
                        )
                      : "// Waiting for a packet…\n// Start simulation to trace the first handoff."}
                  </pre>
                </div>
              </section>
              <section className="panel faults">
                <div>
                  <Settings2 size={16} />
                  <h2>Connection fault injection</h2>
                </div>
                <div className="fault-toggles">
                  {[
                    ["txConnected", "Transmitter"],
                    ["rxConnected", "Receiver"],
                    ["wifi", "Local Wi-Fi"],
                    ["cloud", "Firebase link"],
                  ].map(([key, label]) => (
                    <label key={key}>
                      <input
                        type="checkbox"
                        checked={!config[key]}
                        onChange={(e) => configure(key, !e.target.checked)}
                      />
                      {label} failure
                    </label>
                  ))}
                </div>
                <button className="text-button" onClick={restore}>
                  <RotateCcw size={12} />
                  Restore all
                </button>
              </section>
              <section className="panel logs">
                <div className="section-heading">
                  <div className="flex items-center gap-2">
                    <Terminal size={16} />
                    <h2>Communication monitor</h2>
                    <span className="small-tag">LIVE LOGS</span>
                  </div>
                  <button className="text-button" onClick={download}>
                    <Download size={13} />
                    Export
                  </button>
                </div>
                <div className="logs-grid">
                  {[
                    ["tx", "TRANSMITTER LOG"],
                    ["rx", "RECEIVER LOG"],
                    ["cloud", "FIREBASE LOG"],
                  ].map(([channel, label]) => (
                    <div className="log-column" key={channel}>
                      <div className="log-title">
                        <i
                          className={`dot ${channel === "cloud" ? "blue-dot" : ""}`}
                        />
                        {label}
                        <span>
                          {channel === "cloud"
                            ? `${total("stored")} stored · ${events.filter((e) => e.channel === "cloud" && e.stage === "failed").length} failed`
                            : count(
                                channel === "tx" ? "transmitted" : "decoded",
                              ) + " packets"}
                        </span>
                      </div>
                      <div className="log-scroll">
                        {events.filter((e) => e.channel === channel).length ? (
                          events
                            .filter((e) => e.channel === channel)
                            .map((e) => (
                              <div
                                className={`log-entry ${["failed", "invalid"].includes(e.stage) ? "error" : ""}`}
                                key={e.id}
                              >
                                <time>{time(e.time)}</time>
                                <div>
                                  <b>{e.stage.toUpperCase()}</b>
                                  <p>{e.message}</p>
                                  {e.packet && (
                                    <small>#{short(e.packet.packet_id)}</small>
                                  )}
                                </div>
                              </div>
                            ))
                        ) : (
                          <div className="empty-log">
                            Ready. Waiting for the first event.
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
          {historyOpen && (
            <section className="panel history">
              <div className="section-heading">
                <h2>
                  {historySource} ·{" "}
                  {records.length}
                </h2>
                <button
                  className="secondary"
                  onClick={() => setHistoryOpen(false)}
                >
                  Close
                </button>
              </div>
              <p className="help">
                Receiver history includes validated packets even when uploads fail.
                Database history shows records saved in the selected store.
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Received timestamp",
                        "Packet",
                        "pH",
                        "Water °C",
                        "DO mg/L",
                        "NTU",
                        "TDS",
                        "Air °C",
                        "AQI",
                        "Rain mm/h",
                      ].map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((r) => (
                      <tr key={r.packet_id}>
                        <td>{r.timestamp}</td>
                        <td>{short(r.packet_id)}</td>
                        {[
                          "ph",
                          "temperature",
                          "dissolved_oxygen",
                          "turbidity",
                          "tds",
                          "air_temperature",
                          "aqi",
                          "rainfall",
                        ].map((k) => (
                          <td key={k}>{r[k]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!records.length && (
                  <p className="help">No stored records yet.</p>
                )}
              </div>
            </section>
          )}
          <footer>
            <span>
              <i className="dot" />
              ROBOFORGE LAB{" "}
              <span className="muted-text">
                / DUAL ESP32 COMMUNICATION SIMULATOR
              </span>
            </span>
            <span>
              {mqttOn ? "MQTT transport" : "Simulated transport"} ·{" "}
              {mode === "demo"
                ? "Local demo store"
                : "Firebase Realtime Database"}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
