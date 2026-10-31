export const sensors = [
  ["ph", "Water pH", "pH", 0, 14, 0.1, 7.2],
  ["temperature", "Water temperature", "°C", 0, 60, 0.1, 28.5],
  ["dissolved_oxygen", "Dissolved oxygen", "mg/L", 0, 30, 0.1, 6.8],
  ["turbidity", "Turbidity", "NTU", 0, 2000, 1, 12],
  ["tds", "Total dissolved solids", "ppm", 0, 5000, 1, 320],
  ["air_temperature", "Air temperature", "°C", -40, 80, 0.1, 31.2],
  ["aqi", "Air quality index", "AQI", 0, 500, 1, 45],
  ["rainfall", "Rainfall", "mm/h", 0, 500, 0.1, 0],
];
export const defaults = () =>
  Object.fromEntries(sensors.map(([key, , , , , , value]) => [key, value]));
export function sample(values, automatic, random = Math.random) {
  return Object.fromEntries(
    sensors.map(([key, , , min, max, step]) => [
      key,
      values[key] === "" || !Number.isFinite(Number(values[key]))
        ? NaN
        : automatic
        ? Number(
            Math.max(
              min,
              Math.min(max, values[key] + (random() - 0.5) * step * 4),
            ).toFixed(step === 1 ? 0 : 1),
          )
        : Number(values[key]),
    ]),
  );
}
export function validate(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet))
    return "Packet must be an object";
  for (const key of ["device_id", "pond_id", "packet_id"])
    if (
      typeof packet[key] !== "string" ||
      !/^[-a-zA-Z0-9_]{1,80}$/.test(packet[key])
    )
      return `Invalid ${key}`;
  if (
    typeof packet.timestamp !== "string" ||
    !Number.isFinite(Date.parse(packet.timestamp))
  )
    return "Invalid timestamp";
  for (const [key, , , min, max] of sensors)
    if (
      typeof packet[key] !== "number" ||
      !Number.isFinite(packet[key]) ||
      packet[key] < min ||
      packet[key] > max
    )
      return `Invalid or missing ${key} (${min}–${max})`;
  return null;
}
