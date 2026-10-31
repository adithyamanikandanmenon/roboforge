export class WirelessTransport {
  constructor({ monitor, getConfig, random = Math.random }) {
    Object.assign(this, { monitor, getConfig, random });
    this.pending = new Map();
    this.onReceive = null;
    this.mqtt = null;
  }
  async connectMqtt(url, topic) {
    if (!/^wss:\/\//.test(url))
      throw new Error("Use a secure wss:// broker URL");
    if (!topic || /[+#]/.test(topic))
      throw new Error("Use a single topic without wildcards");
    const { connect } = await import("mqtt");
    this.disconnectMqtt();
    const client = connect(url, { connectTimeout: 8000, reconnectPeriod: 0 });
    this.mqtt = client;
    this.topic = topic;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        client.end(true);
        reject(new Error("MQTT connection timed out"));
      }, 9000);
      client.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      client.once("connect", () =>
        client.subscribe(topic, { qos: 0 }, (error) => {
          clearTimeout(timer);
          error ? reject(error) : resolve();
        }),
      );
    });
    client.on("message", (_, payload) => {
      const raw = payload.toString();
      let id;
      try {
        id = JSON.parse(raw).packet_id;
      } catch {
        return;
      }
      const entry = this.pending.get(id);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(id);
        this.deliver(raw, entry.resolve, entry.reject);
      }
    });
    client.on("error", (error) =>
      this.monitor.emit("tx", "status", `MQTT: ${error.message}`),
    );
  }
  disconnectMqtt() {
    this.mqtt?.end(true);
    this.mqtt = null;
    this.cancel();
  }
  send(raw) {
    const config = this.getConfig();
    return new Promise((resolve, reject) => {
      const id = JSON.parse(raw).packet_id;
      const delay = config.delay;
      const timer = setTimeout(() => {
        if (this.mqtt) return;
        this.pending.delete(id);
        if (config.lossEnabled && this.random() * 100 < config.loss)
          return reject(new Error("Packet lost in wireless transit"));
        this.deliver(raw, resolve, reject);
      }, delay);
      this.pending.set(id, { timer, resolve, reject });
      if (this.mqtt) {
        clearTimeout(timer);
        this.pending.get(id).timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error("MQTT receive timed out"));
        }, 10000);
        this.mqtt.publish(this.topic, raw, { qos: 0 }, (error) => {
          if (error) {
            clearTimeout(this.pending.get(id)?.timer);
            this.pending.delete(id);
            reject(error);
          }
        });
      }
    });
  }
  deliver(raw, resolve, reject) {
    if (!this.getConfig().rxConnected || !this.onReceive)
      return reject(new Error("Receiver is offline; packet not delivered"));
    this.onReceive(raw);
    resolve();
  }
  cancel() {
    for (const { timer, reject } of this.pending.values()) {
      clearTimeout(timer);
      reject(new DOMException("Simulation cancelled", "AbortError"));
    }
    this.pending.clear();
  }
}
