# Action centre

The overview ranks water bodies by recorded target exceptions and paired-probe disagreement, then missing paired samples and unavailable data. Unknown or cached conditions never count as healthy. Equal priorities use names. These checks describe measurements; they are not validated predictions.

Sensor confidence compares two pH probes only after an owner confirms they sample the same water. Send numeric `ph` and `ph_secondary` with `timestamp`; optionally include `ph_secondary_timestamp`. Without that field, both values are treated as one sample. Stale, invalid or widely separated timestamps prevent agreement claims. Comparison tolerance and maximum time separation are owner settings; defaults are examples. Agreement does not certify accuracy or identify a faulty probe.

Water alerts group repeated episodes by measurement and active/recovered state. Connection, missing and stale data share a data-unavailable group. Care reminders remain separate. Acknowledging a group marks its latest episode seen, not resolved.

Guided setup saves a name, provides a unique device destination, requires a fresh reading, and requires target review. Real writes need the existing verified-owner Firebase account. The labelled local example never writes simulated measurements to Firebase.

After a successful online visit, supported browsers retain the public app shell. Public readings retain original timestamps, up to 500 records per water body and 12 water bodies per browser, separated by Firebase project and path. Cached readings stay labelled as snapshots. Public profiles may also be retained. Diary entries, reminders, credentials and private writes are excluded from this offline cache. Reconnecting refreshes subscriptions. This does not buffer ESP32 uploads while the device is offline. Storage removal or eviction removes offline availability.

The three optional comparison fields in `firebase.farm.rules.json` validate profile metadata without expanding access.
