import { sample, validate } from "./sensorSimulator.js";
export class Transmitter {
  constructor({ transport, monitor, getConfig, getValues }) {
    Object.assign(this, { transport, monitor, getConfig, getValues });
    this.running = false;
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.monitor.emit("tx", "status", "Transmitter started");
    this.tick();
  }
  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.monitor.emit("tx", "status", "Transmitter stopped");
  }
  async tick() {
    if (!this.running) return;
    this.send();
    this.timer = setTimeout(() => this.tick(), this.getConfig().interval);
  }
  send(override) {
    const config = this.getConfig();
    const packet = override ?? {
      device_id: "ESP32_TX_01",
      pond_id: config.pondId,
      packet_id: crypto.randomUUID(),
      ...sample(this.getValues(), config.automatic),
      timestamp: new Date().toISOString(),
    };
    this.monitor.emit("tx", "generated", "Sensor sample → JSON packet", {
      packet,
    });
    if (!config.txConnected) {
      this.monitor.emit("tx", "failed", "Transmitter disconnected", { packet });
      return;
    }
    if (!override && validate(packet)) {
      this.monitor.emit("tx", "failed", validate(packet), { packet });
      return;
    }
    const raw = JSON.stringify(packet);
    this.monitor.emit(
      "tx",
      "transmitted",
      "JSON packet submitted to wireless transport",
      { packet },
    );
    this.transport.send(raw).catch((error) => {
      if (error.name !== "AbortError")
        this.monitor.emit("tx", "failed", error.message, { packet });
    });
  }
}
