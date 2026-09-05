import copy
import datetime as dt
import io
import json
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

from cpo_pipeline import aggregate, fetch, schema
from cpo_pipeline.run_gr import Tick
from cpo_pipeline.sources import gr_myfah as gr


def location(lid="GR-OPX-S1-L", party="OPX", name="Test", lat="37.9", lon="23.7", evses=None):
    return {
        "country_code": "GR", "party_id": party, "id": lid, "publish": True,
        "name": name, "address": "Somewhere 1", "city": "Athens", "postal_code": "10000",
        "country": "GRC", "coordinates": {"latitude": lat, "longitude": lon},
        "parking_type": "ON_STREET", "operator": {"name": "Operator X"},
        "opening_times": {"twentyfourseven": True}, "time_zone": "Europe/Athens",
        "last_updated": "2026-09-05T01:00:00",
        "evses": evses if evses is not None else [
            evse("1", "AVAILABLE", [connector("10", 22000)]),
            evse("2", "CHARGING", [connector("11", 50000, "IEC_62196_T2_COMBO", "DC")]),
        ],
    }


def evse(uid, status, connectors):
    return {"uid": uid, "evse_id": f"GR*OPX*E{uid}", "status": status, "connectors": connectors,
            "capabilities": ["REMOTE_START_STOP_CAPABLE"], "last_updated": "2026-09-05T01:00:00"}


def connector(cid, watts, standard="IEC_62196_T2", power_type="AC_3_PHASE", tariffs=None):
    c = {"id": cid, "standard": standard, "format": "SOCKET", "power_type": power_type,
         "max_voltage": 400, "max_amperage": 32, "max_electric_power": watts,
         "last_updated": "2026-09-05T01:00:00"}
    if tariffs is not None:
        c["_openapiTariffs"] = tariffs
    return c


TARIFF = [{"currency": "EUR", "type": "AD_HOC_PAYMENT", "elements": [{"price_components": [
    {"type": "FLAT", "price": "0", "vat": "24"},
    {"type": "ENERGY", "price": "0.5400", "vat": "6", "step_size": 1000},
    {"type": "TIME", "price": "0", "vat": "24", "step_size": 60},
]}]}]


def envelope(locs):
    return {"Locations": locs, "status": "ok", "statusDesc": "success"}


def to_dynamic(static_doc, overrides=None, tariffs=None):
    """Derive a dynamic feed from a static one, optionally overriding statuses."""
    out = []
    for l in static_doc["Locations"]:
        evs = []
        for e in l["evses"]:
            st = (overrides or {}).get((l["id"], e["uid"]), e["status"])
            conns = []
            for c in e["connectors"]:
                cc = {"id": c["id"]}
                if tariffs:
                    cc["_openapiTariffs"] = tariffs
                conns.append(cc)
            evs.append({"uid": e["uid"], "evse_id": e["evse_id"], "status": st,
                        "connectors": conns, "last_updated": e["last_updated"]})
        out.append({"country_code": "GR", "party_id": l["party_id"], "id": l["id"],
                    "name": l["name"], "evses": evs, "last_updated": l["last_updated"]})
    return envelope(out)


def zipped(doc, name="x.json"):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(name, "﻿" + json.dumps(doc, ensure_ascii=False))
    return buf.getvalue()


class SchemaTests(unittest.TestCase):
    def test_codes(self):
        self.assertEqual(schema.status_code("AVAILABLE"), "A")
        self.assertEqual(schema.status_code("weird"), "X")
        self.assertEqual(schema.status_code(None), "U")
        self.assertEqual(schema.connector_code("IEC_62196_T2_COMBO"), "CCS2")
        self.assertEqual(schema.power_type_code("AC_3_PHASE"), "AC3")
        self.assertEqual(schema.power_class(7.4), "slow")
        self.assertEqual(schema.power_class(22), "ac")
        self.assertEqual(schema.power_class(50), "fast")
        self.assertEqual(schema.power_class(350), "ultra")
        self.assertEqual(schema.power_class(None), "na")


class FetchTests(unittest.TestCase):
    def test_extract_single_json(self):
        raw = fetch.extract_single_json(zipped({"a": 1}), max_uncompressed=1 << 20)
        self.assertEqual(fetch.parse_json(raw), {"a": 1})

    def test_rejects_multiple_members(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("a.json", "{}")
            zf.writestr("b.json", "{}")
        with self.assertRaises(fetch.FetchError):
            fetch.extract_single_json(buf.getvalue(), max_uncompressed=1 << 20)

    def test_rejects_traversal_and_non_json(self):
        for name in ("../evil.json", "/abs.json", "x.exe"):
            with self.assertRaises(fetch.FetchError):
                fetch.extract_single_json(zipped({}, name), max_uncompressed=1 << 20)

    def test_rejects_oversized_member(self):
        big = zipped({"pad": "x" * 100000})
        with self.assertRaises(fetch.FetchError):
            fetch.extract_single_json(big, max_uncompressed=1000)

    def test_refuses_plain_http(self):
        with self.assertRaises(fetch.FetchError):
            fetch.http_get("http://example.invalid/x", max_bytes=10)


class NormalizeTests(unittest.TestCase):
    def test_static_basic(self):
        norm = gr.normalize_static(envelope([location()]))
        self.assertEqual(len(norm["locations"]), 1)
        loc = norm["locations"][0]
        self.assertEqual(loc["op"], "OPX")
        self.assertTrue(loc["h24"])
        self.assertEqual(loc["evses"][0]["conns"][0]["kw"], 22.0)
        self.assertEqual(loc["evses"][1]["conns"][0]["std"], "CCS2")
        self.assertEqual(norm["operators"]["OPX"]["name"], "Operator X")

    def test_static_drops_bad_rows(self):
        docs = [location(), location(lid="GR-OPX-S2-L", lat="51.5", lon="-0.1"),
                location(lid="GR-OPX-S1-L"), location(lid="GR-OPX-S3-L", lat="nope")]
        norm = gr.normalize_static(envelope(docs))
        self.assertEqual(len(norm["locations"]), 1)
        self.assertEqual({why for _, why in norm["dropped"]}, {"outside bbox", "duplicate id", "missing id/coords"})

    def test_static_rejects_bad_envelope(self):
        with self.assertRaises(gr.SourceError):
            gr.normalize_static({"status": "error", "Locations": []})
        with self.assertRaises(gr.SourceError):
            gr.normalize_static(["not", "an", "object"])

    def test_dynamic_nested_and_tariffs(self):
        static_doc = envelope([location(), location(lid="GR-OPY-S1-L", party="OPY")])
        dyn = gr.normalize_dynamic(to_dynamic(static_doc, tariffs=TARIFF))
        # Same uid "1" in two locations must stay distinct.
        self.assertEqual(dyn["statuses"]["GR-OPX-S1-L"]["1"], "A")
        self.assertEqual(dyn["statuses"]["GR-OPY-S1-L"]["2"], "C")
        self.assertEqual(dyn["evse_count"], 4)
        self.assertEqual(len(dyn["tariffs"]), 1)  # de-duplicated
        t = dyn["tariffs"][0]
        self.assertEqual(t["kwh"], 0.54)
        self.assertEqual(t["cur"], "EUR")
        self.assertEqual(dyn["connector_tariffs"]["GR-OPX-S1-L"]["1"]["10"], 0)


class AggregateTests(unittest.TestCase):
    def test_diff(self):
        prev = {"L1": {"1": "A", "2": "C"}, "L2": {"9": "A"}}
        cur = {"L1": {"1": "C", "2": "C", "3": "A"}, "L3": {"9": "A"}}
        self.assertEqual(aggregate.diff_statuses(prev, cur), [
            ["L1", "1", "A", "C"], ["L1", "3", "-", "A"], ["L2", "9", "A", "-"], ["L3", "9", "-", "A"],
        ])
        self.assertEqual(aggregate.diff_statuses(None, cur), [])

    def test_operator_table(self):
        static = gr.normalize_static(envelope([location()]))
        dyn = gr.normalize_dynamic(to_dynamic(envelope([location()]), tariffs=TARIFF))
        table = aggregate.operator_table(static, dyn["statuses"], dyn["tariffs"], dyn["connector_tariffs"], "t")
        row = table["operators"][0]
        self.assertEqual(row["evses"], 2)
        self.assertEqual(row["dc_evses"], 1)
        self.assertEqual(row["avail_pct"], 50.0)
        self.assertEqual(row["median_kwh_price"], 0.54)
        self.assertEqual(table["totals"]["kw_total"], 72)

    def test_tick_summary(self):
        static = gr.normalize_static(envelope([location()]))
        summ = aggregate.tick_summary(static, {"GR-OPX-S1-L": {"1": "A", "2": "C"}}, "t")
        self.assertEqual(summ["n"], {"A": 1, "C": 1})
        self.assertEqual(summ["kwc"], 50)


class TickTests(unittest.TestCase):
    def run_tick(self, root, static_doc, dyn_doc, now):
        (root / "static.zip").write_bytes(zipped(static_doc))
        (root / "dynamic.zip").write_bytes(zipped(dyn_doc))
        t = Tick(root / "data", static_file=root / "static.zip", dynamic_file=root / "dynamic.zip", now=now)
        t.run_static()
        t.run_dynamic()
        t.finish()
        return t

    def test_two_ticks_produce_history_and_events(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            static_doc = envelope([location()])
            t0 = dt.datetime(2026, 9, 5, 4, 0, tzinfo=dt.timezone.utc)
            t = self.run_tick(root, static_doc, to_dynamic(static_doc), t0)
            self.assertEqual(t.warnings, [])
            gr_dir = root / "data" / "gr"
            self.assertTrue((gr_dir / "locations.json").exists())
            self.assertTrue((gr_dir / "status.json").exists())
            self.assertFalse((gr_dir / "events" / "2026-09-05.jsonl").exists())
            hist = (gr_dir / "history" / "2026-09-05.jsonl").read_text().splitlines()
            self.assertEqual(len(hist), 1)

            t1 = t0 + dt.timedelta(minutes=10)
            t = self.run_tick(root, static_doc,
                              to_dynamic(static_doc, overrides={("GR-OPX-S1-L", "1"): "OUTOFORDER"}), t1)
            hist = (gr_dir / "history" / "2026-09-05.jsonl").read_text().splitlines()
            self.assertEqual(len(hist), 2)
            ev = json.loads((gr_dir / "events" / "2026-09-05.jsonl").read_text())
            self.assertEqual(ev["ch"], [["GR-OPX-S1-L", "1", "A", "O"]])
            meta = json.loads((gr_dir / "meta.json").read_text())
            self.assertEqual(meta["dynamic"]["changes"], 1)
            index = json.loads((root / "data" / "index.json").read_text())
            self.assertEqual(index["countries"][0]["code"], "GR")

    def test_static_shrink_is_rejected(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            many = envelope([location(lid=f"GR-OPX-S{i}-L") for i in range(10)])
            t0 = dt.datetime(2026, 9, 5, 4, 0, tzinfo=dt.timezone.utc)
            self.run_tick(root, many, to_dynamic(many), t0)
            few = envelope([location(lid=f"GR-OPX-S{i}-L") for i in range(3)])
            t = self.run_tick(root, few, to_dynamic(few), t0 + dt.timedelta(days=1))
            self.assertTrue(any("refusing" in w for w in t.warnings))
            locs = json.loads((root / "data" / "gr" / "locations.json").read_text())
            self.assertEqual(len(locs["locations"]), 10)

    def test_unchanged_dynamic_is_skipped(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            static_doc = envelope([location()])
            t0 = dt.datetime(2026, 9, 5, 4, 0, tzinfo=dt.timezone.utc)
            self.run_tick(root, static_doc, to_dynamic(static_doc), t0)
            self.run_tick(root, static_doc, to_dynamic(static_doc), t0 + dt.timedelta(minutes=10))
            hist = (root / "data" / "gr" / "history" / "2026-09-05.jsonl").read_text().splitlines()
            self.assertEqual(len(hist), 1, "identical upstream file must not add a tick")


if __name__ == "__main__":
    unittest.main()
