import { validate } from "./sensorSimulator.js";
export class Receiver {
  constructor({ transport, monitor, firebase, getConfig }) {
    Object.assign(this, { transport, monitor, firebase, getConfig });
    this.running = false;
    this.epoch = 0;
    this.history = [];
  }
  start() {
    if (this.running) return;
    this.running = true;
    this.transport.onReceive = (raw) => this.receive(raw);
    this.monitor.emit("rx", "status", "Receiver listening for packets");
  }
  stop() {
    this.running = false;
    this.epoch++;
    this.transport.onReceive = null;
    this.monitor.emit("rx", "status", "Receiver stopped");
  }
  async receive(raw) {
    if (!this.running) return;
    const epoch = this.epoch;
    this.monitor.emit("rx", "incoming", "Wireless packet arrived");
    let packet;
    try {
      packet = JSON.parse(raw);
      const error = validate(packet);
      if (error) throw new Error(error);
    } catch (error) {
      this.monitor.emit("rx", "invalid", error.message);
      return;
    }
    this.history = [packet, ...this.history].slice(0, 300);
    this.monitor.emit("rx", "decoded", "Packet decoded and validated", {
      packet,
    });
    if (!this.getConfig().wifi) {
      this.monitor.emit(
        "cloud",
        "failed",
        "Wi-Fi unavailable; packet not uploaded",
        { packet },
      );
      return;
    }
    this.monitor.emit(
      "rx",
      "wifi",
      "Gateway connected through simulated local Wi-Fi",
      { packet },
    );
    this.monitor.emit("cloud", "request", "Receiver requested database write", {
      packet,
    });
    try {
      const result = await this.firebase.upload(packet);
      if (epoch !== this.epoch) return;
      this.monitor.emit(
        "cloud",
        "stored",
        `${result.demo ? "Demo local store" : "Firebase"} acknowledged write`,
        { packet, demo: result.demo, path: result.path },
      );
    } catch (error) {
      if (epoch === this.epoch)
        this.monitor.emit("cloud", "failed", error.message, { packet });
    }
  }
}
