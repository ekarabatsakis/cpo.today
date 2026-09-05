# Data schema

All files live on the `data` branch and are served at `https://cpo.today/data/<path>`.
Timestamps are ISO 8601 UTC (`2026-09-05T04:06:48Z`). Files are compact JSON (one line) unless noted.

```
index.json                      countries and their freshness
<cc>/meta.json                  pipeline state: ETags, counts, warnings (pretty-printed)
<cc>/locations.json             inventory: locations → EVSEs → connectors (daily)
<cc>/status.json                live EVSE status (every 10 min)
<cc>/tariffs.json               de-duplicated tariffs + connector → tariff index (every 10 min)
<cc>/operators.json             per-operator comparison table + national totals (every 10 min)
<cc>/history/YYYY-MM-DD.jsonl   one line per tick: status counts per operator + charging kW
<cc>/events/YYYY-MM-DD.jsonl    one line per tick: EVSE status transitions
<cc>/daily/YYYY-MM-DD.json      daily inventory snapshot for growth trends
```

`<cc>` is the lower-case ISO country code (`gr`).

## Identifiers

Registry EVSE `uid` and connector `id` values are **only unique within a location** (MYFAH reuses `1`, `2`, … across operators).
The canonical keys are therefore `(location id, evse uid)` and `(location id, evse uid, connector id)`.
`status.json`, `tariffs.json` and events are nested accordingly.

## Enumerations

| Field | Codes |
|---|---|
| EVSE status | `A` available · `C` charging · `B` blocked · `R` reserved · `I` inoperative · `O` out of order · `U` unknown · `P` planned · `M` removed · `X` other · `-` absent from feed (events only) |
| Connector `std` | `T2` IEC 62196 Type 2 · `CCS2` · `CHADEMO` · `T1` · `CCS1` · `DOM` domestic · `IND` industrial · `TESLA_S` / `TESLA_R` · raw value otherwise |
| Connector `pt` (power type) | `AC1` · `AC2` · `AC3` · `DC` |
| Connector `fmt` | `SOCKET` · `CABLE` |
| Power class | `slow` < 11 kW · `ac` 11–43 kW · `fast` 43–150 kW · `ultra` ≥ 150 kW · `na` unknown |

## `locations.json`

```jsonc
{
  "country": "GR", "source": "MYFAH",
  "generated": "…", "source_ts": "…",          // when we ran; upstream file time
  "operators": { "PPC": { "id": "PPC", "name": "DEI Blue" }, … },   // party_id → display name
  "locations": [
    {
      "id": "GR-PPC-Scs32622-L", "op": "PPC",
      "name": "…", "addr": "…", "city": "…", "pc": "16673",
      "lat": 37.83628, "lon": 23.766972,
      "ptype": "ON_STREET",            // optional parking type
      "h24": true,                     // or "hours": [[weekday, "08:00", "21:00"], …]
      "green": true, "fac": ["CAFE"], "subop": "…", "owner": "…", "unpub": true,   // all optional
      "upd": "2026-09-05T01:23:21",    // operator's own last_updated (registry local time, no zone)
      "evses": [
        {
          "uid": "GR-PPC-E0000002027-1", "id": "GR*PPC*E0000002027*1",
          "caps": ["REMOTE_START_STOP_CAPABLE"], "mfr": "ABB", "model": "…", "ref": "…", "park": ["PLUGGED"],
          "conns": [ { "id": "112844", "std": "T2", "fmt": "SOCKET", "pt": "AC3", "kw": 22.0 } ]
        }
      ]
    }
  ]
}
```

## `status.json`

```jsonc
{ "country": "GR", "ts": "2026-09-05T04:06:48Z", "generated": "…",
  "locations": { "GR-PPC-Scs32622-L": { "GR-PPC-E0000002027-1": "A", … }, … } }
```

`ts` is the upstream file's `Last-Modified` time: the moment the registry generated the snapshot.

## `tariffs.json`

```jsonc
{ "country": "GR", "ts": "…",
  "tariffs": [ { "cur": "EUR", "type": "AD_HOC_PAYMENT", "kwh": 0.54, "hour": 0, "flat": 0, "park_hour": 0, "vat": 24 }, … ],
  "locations": { "<location id>": { "<evse uid>": { "<connector id>": 0 } } } }   // index into "tariffs"
```

Prices are as published by the operator (EUR). `kwh` per kWh, `hour` per hour of charging, `flat` session fee, `park_hour` per hour of parking. Where several tariffs are attached, the one with the lowest energy price is kept.

## `history/YYYY-MM-DD.jsonl`

```jsonc
{ "ts": "…", "n": { "A": 8480, "C": 441, "O": 293, … }, "kwc": 11866,
  "ops": { "PPC": { "s": { "A": 3312, "C": 120, … }, "kwc": 3774 }, … } }
```

`kwc` is the sum of the maximum connector power of EVSEs currently charging (an upper bound on instantaneous load).

## `events/YYYY-MM-DD.jsonl`

```jsonc
{ "ts": "…", "ch": [ ["<location id>", "<evse uid>", "A", "C"], … ] }
```

Each entry is a transition observed between two consecutive ticks (`from`, `to`). Session length, utilisation and reliability metrics can be derived from these.

## `operators.json`

Per operator: `locations`, `evses`, `connectors`, `dc_evses`, `ac_evses`, `kw_total`, `max_kw`, `classes`, `connector_types`, `cities`, `h24_locations`, `green_locations`, `status` (counts), `avail_pct`, `charging_pct`, `down_pct`, `unknown_pct` (percentages exclude EVSEs with unknown status, except `unknown_pct`), `median_kwh_price`, `priced_connectors`. Plus `totals`.

## Growth and retention

One 10-minute tick adds roughly 15 KB to the packed repository (status delta, events, history, operator table). That is about 2 MB per day and under 1 GB per year for Greece. When the branch approaches a few GB, older `events/` and `history/` days will be compacted into monthly gzip archives; the file schema above will not change.

## Terms

Data is republished from official public registries under their public-data terms. Attribute **cpo.today** and the registry (for Greece: *MYFAH, Hellenic Ministry of Infrastructure and Transport*). No warranty: status is exactly what operators report.
