import { test } from "node:test";
import assert from "node:assert/strict";
import { PacketMonitor } from "../src/packetMonitor.js";
import { Transmitter } from "../src/transmitter.js";
import { Receiver } from "../src/receiver.js";
import { WirelessTransport } from "../src/wirelessTransport.js";
import { FirebaseService } from "../src/firebaseService.js";
import { defaults, validate } from "../src/sensorSimulator.js";
const wait = () => new Promise((resolve) => setTimeout(resolve, 35));
function setup() {
  const config = {
    interval: 1000,
    delay: 5,
    automatic: false,
    pondId: "POND_01",
    txConnected: true,
    rxConnected: true,
    wifi: true,
    cloud: true,
    lossEnabled: false,
    loss: 100,
  };
  const monitor = new PacketMonitor();
  const transport = new WirelessTransport({
    monitor,
    getConfig: () => config,
    random: () => 0,
  });
  const writes = [];
  const firebase = {
    upload: async (packet) => {
      if (!config.cloud) throw new Error("Cloud offline");
      writes.push(packet);
      return { demo: true, path: "demo" };
    },
  };
  const rx = new Receiver({
    transport,
    monitor,
    firebase,
    getConfig: () => config,
  });
  const tx = new Transmitter({
    transport,
    monitor,
    getConfig: () => config,
    getValues: defaults,
  });
  return { config, monitor, transport, rx, tx, writes };
}
test("serialized asynchronous handoff preserves packet and receiver alone uploads", async () => {
  const { tx, rx, writes, monitor } = setup();
  rx.start();
  tx.send();
  assert.equal(writes.length, 0);
  await wait();
  assert.equal(writes.length, 1);
  const sent = monitor.entries.find((e) => e.stage === "transmitted").packet;
  assert.deepEqual(writes[0], sent);
  assert.notEqual(writes[0], sent);
  assert.equal(validate(writes[0]), null);
  assert.ok(monitor.entries.find((e) => e.stage === "stored"));
  rx.stop();
});
test("100% loss produces failure and no receiver writes", async () => {
  const { tx, rx, config, writes, monitor } = setup();
  config.lossEnabled = true;
  rx.start();
  tx.send();
  await wait();
  assert.equal(writes.length, 0);
  assert.ok(monitor.entries.find((e) => e.stage === "failed"));
  rx.stop();
});
test("receiver offline blocks packet delivery", async () => {
  const { tx, writes, monitor } = setup();
  tx.send();
  await wait();
  assert.equal(writes.length, 0);
  assert.match(
    monitor.entries.find((e) => e.stage === "failed").message,
    /offline/,
  );
});
test("Wi-Fi and cloud failure log failures; restore succeeds", async () => {
  const { tx, rx, config, writes, monitor } = setup();
  rx.start();
  config.wifi = false;
  tx.send();
  await wait();
  config.wifi = true;
  config.cloud = false;
  tx.send();
  await wait();
  assert.equal(writes.length, 0);
  assert.equal(
    monitor.entries.filter((e) => e.channel === "cloud" && e.stage === "failed")
      .length,
    2,
  );
  config.cloud = true;
  tx.send();
  await wait();
  assert.equal(writes.length, 1);
  rx.stop();
});
test("invalid JSON and invalid/missing sensors never upload", async () => {
  const { rx, writes, monitor } = setup();
  rx.start();
  await rx.receive("{broken");
  await rx.receive(
    JSON.stringify({
      packet_id: "abc",
      device_id: "TX",
      pond_id: "POND",
      timestamp: new Date().toISOString(),
      ...defaults(),
      ph: 99,
    }),
  );
  assert.equal(writes.length, 0);
  assert.equal(monitor.entries.filter((e) => e.stage === "invalid").length, 2);
  assert.match(validate({}), /device_id/);
  rx.stop();
});
test("stop cancels in-flight transport and transmitter cannot double-start", async () => {
  const { tx, rx, transport, writes } = setup();
  rx.start();
  tx.start();
  tx.start();
  tx.stop();
  rx.stop();
  transport.cancel();
  await wait();
  assert.equal(writes.length, 0);
  assert.equal(transport.pending.size, 0);
});
test("demo persists records and retrieves pond-specific history", async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key),
    setItem: (key, value) => store.set(key, value),
  };
  const service = new FirebaseService(() => ({ cloud: true }));
  const packet = {
    ...defaults(),
    packet_id: "abc",
    pond_id: "POND_01",
    device_id: "TX",
    timestamp: new Date().toISOString(),
  };
  assert.equal((await service.upload(packet)).demo, true);
  assert.equal(
    (await new FirebaseService(() => ({ cloud: true })).retrieve("POND_01"))
      .length,
    1,
  );
  assert.equal((await service.retrieve("OTHER")).length, 0);
});
test("live upload never declares success before SDK acknowledgement", async () => {
  const service = new FirebaseService(() => ({ cloud: true }));
  service.mode = "live";
  service.connected = true;
  service.uid = "test";
  service.db = {};
  let acknowledge;
  service.sdk = {
    ref: (_, path) => path,
    serverTimestamp: () => 123,
    set: () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
    goOffline: () => {},
  };
  let done = false;
  const upload = service
    .upload({ pond_id: "P", device_id: "D", packet_id: "I" })
    .then((result) => {
      done = true;
      assert.equal(result.demo, false);
    });
  await Promise.resolve();
  assert.equal(done, false);
  acknowledge();
  await upload;
  assert.equal(done, true);
});
test("Firebase permission failure propagates as failed write", async () => {
  const service = new FirebaseService(() => ({ cloud: true }));
  service.mode = "live";
  service.connected = true;
  service.uid = "test";
  service.sdk = {
    ref: () => "",
    serverTimestamp: () => 123,
    set: () => Promise.reject(new Error("PERMISSION_DENIED")),
    goOffline: () => {},
  };
  await assert.rejects(service.upload({}), /PERMISSION_DENIED/);
});
