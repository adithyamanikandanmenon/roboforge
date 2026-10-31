export class PacketMonitor {
  constructor() {
    this.listeners = new Set();
    this.entries = [];
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(channel, stage, message, extra = {}) {
    const entry = {
      id: crypto.randomUUID(),
      time: new Date().toISOString(),
      channel,
      stage,
      message,
      ...extra,
    };
    this.entries = [entry, ...this.entries].slice(0, 300);
    this.listeners.forEach((fn) => fn(entry));
    return entry;
  }
  clear() {
    this.entries = [];
  }
}
