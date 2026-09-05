# Data schema

All files live on the `data` branch and are served at `https://cpo.today/data/<path>`.
Timestamps are ISO 8601 UTC (`2026-09-05T04:06:48Z`). Files are compact JSON (one line) unless noted.

```
index.json                      countries and their freshness
<cc>/meta.json                  pipeline state: ETags, counts, warnings (pretty-printed)
<cc>/points.json                one compact row per location: the map layer (rewritten when the inventory changes)
<cc>/locations/<shard>.json     full inventory: locations → EVSEs → connectors, split into shards
<cc>/status.json                live EVSE status, one letter per EVSE (every 10 min)
<cc>/tariffs.json               de-duplicated tariffs + connector → tariff index (every 10 min)
<cc>/operators.json             per-operator comparison table + national totals (every 10 min)
<cc>/history/YYYY-MM-DD.jsonl   one line per tick: status counts per operator + charging kW
<cc>/events/YYYY-MM-DD.jsonl    one line per tick: EVSE status transitions
<cc>/daily/YYYY-MM-DD.json      daily inventory snapshot for growth trends
```

The layout is the same for a 4,000-location registry (Greece) and a 60,000-location one (Netherlands): the map needs only `points.json` + `status.json`; details are fetched per shard.

`<cc>` is the lower-case ISO country code (`gr`).

## Identifiers

Registry EVSE `uid` and connector `id` values are **only unique within a location** (MYFAH reuses `1`, `2`, … across operators).
The canonical keys are therefore `(location id, evse uid)` and `(location id, evse uid, connector id)`.
Live status and events refer to an EVSE by its **position** in the location's `evses` array (0-based), which is stable as long as `points.json → ts` is unchanged. `status.json` carries the inventory `structure` hash it was encoded against.

## Enumerations

| Field | Codes |
|---|---|
| EVSE status | `A` available · `C` charging · `B` blocked · `R` reserved · `I` inoperative · `O` out of order · `U` unknown · `P` planned · `M` removed · `X` other · `-` absent from feed (events only) |
| Connector `std` | `T2` IEC 62196 Type 2 · `CCS2` · `CHADEMO` · `T1` · `CCS1` · `DOM` domestic · `IND` industrial · `TESLA_S` / `TESLA_R` · raw value otherwise |
| Connector `pt` (power type) | `AC1` · `AC2` · `AC3` · `DC` |
| Connector `fmt` | `SOCKET` · `CABLE` |
| Power class | `slow` < 11 kW · `ac` 11–43 kW · `fast` 43–150 kW · `ultra` ≥ 150 kW · `na` unknown |

## `points.json`

```jsonc
{
  "ts": "…", "shards": 8,
  "operators": [ { "id": "PPC", "name": "DEI Blue" }, … ],           // index = "op" column below
  "fields": ["id","lon","lat","op","name","city","evses","dc","max_kw","class_mask","conn_mask","flags"],
  "class_bits": { "slow": 1, "ac": 2, "fast": 4, "ultra": 8, "na": 16 },
  "conn_bits":  { "T2": 1, "CCS2": 2, "CHADEMO": 4, "T1": 8, "CCS1": 16, "DOM": 32, "IND": 64, "TESLA_S": 128 },
  "points": [ ["GR-PPC-Scs32622-L", 23.766972, 37.83628, 17, "Y003 Vari…", "Voula", 4, 0, 22.0, 2, 1, 1], … ]
}
```

`flags`: bit 1 = 24/7, bit 2 = declared green energy, bit 4 = not published by the operator.

## `locations/<shard>.json`

Shard of a location id = first 8 hex digits of `sha1(id)` modulo `shards`, zero-padded to two hex digits (`00`…`7f`).

```jsonc
{
  "country": "GR", "shard": "03",
  "locations": [
    {
      "id": "GR-PPC-Scs32622-L", "op": "PPC",
      "name": "…", "addr": "…", "city": "…", "pc": "16673",
      "lat": 37.83628, "lon": 23.766972,
      "ptype": "ON_STREET",            // optional parking type
      "h24": true,                     // or "hours": [[weekday, "08:00", "21:00"], …]
      "green": true, "fac": ["CAFE"], "subop": "…", "owner": "…", "unpub": true,   // all optional
      "upd": "2026-09-05",             // day the operator last updated this location (as published)
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
{ "country": "GR", "ts": "2026-09-05T04:06:48Z", "generated": "…", "structure": "<inventory hash>",
  "locations": { "GR-PPC-Scs32622-L": "AACU", … } }     // i-th letter = status of evses[i]
```

`ts` is the upstream file's `Last-Modified` time (or the fetch time for paginated APIs): the moment the registry generated the snapshot.

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
{ "ts": "…", "ch": [ ["<location id>", 0, "A", "C"], … ] }     // [location, evse index, from, to]
```

Each entry is a transition observed between two consecutive ticks. `-` means the EVSE was absent from the feed on one side. Session length, utilisation and reliability metrics can be derived from these.

## `operators.json`

Per operator: `locations`, `evses`, `connectors`, `dc_evses`, `ac_evses`, `kw_total`, `max_kw`, `classes`, `connector_types`, `cities`, `h24_locations`, `green_locations`, `status` (counts), `avail_pct`, `charging_pct`, `down_pct`, `unknown_pct` (percentages exclude EVSEs with unknown status, except `unknown_pct`), `median_kwh_price`, `priced_connectors`. Plus `totals`.

## Growth and retention

One 10-minute tick adds roughly 10 KB to the packed repository for Greece (status delta, events, history, operator table), more for the Netherlands in proportion to its size. Inventories are only rewritten when their structure changes, never for timestamps. When the branch approaches a few GB, older `events/` and `history/` days will be compacted into monthly gzip archives; the file schema above will not change.

## Terms

Data is republished from official public registries under their public-data terms. Attribute **cpo.today** and the registry (Greece: *MYFAH, Hellenic Ministry of Infrastructure and Transport*; Lithuania: *Via Lietuva*; Netherlands: *NDW*; France: *transport.data.gouv.fr / Etalab*; Belgium: *transportdata.be*; Luxembourg: *data.public.lu*; Germany: *Bundesnetzagentur*; Cyprus: *EMS / traffic4cyprus*). Each country's `meta.json` names its source and licence. No warranty: status is exactly what operators report.
