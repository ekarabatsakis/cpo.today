import copy
import datetime as dt
import io
import json
import unittest
import zipfile
from pathlib import Path
from tempfile import TemporaryDirectory

from cpo_pipeline import aggregate, fetch, schema
from cpo_pipeline.runner import Tick
from cpo_pipeline.sources import gr_myfah as gr
from cpo_pipeline.sources.base import SourceError


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

    def test_static_tolerates_malformed_subobjects(self):
        loc = location()
        loc["energy_mix"] = []            # seen in the Lithuanian feed
        loc["opening_times"] = None
        loc["operator"] = ["not", "an", "object"]
        loc["evses"][0]["capabilities"] = None
        loc["evses"][0]["connectors"][0]["tariff_ids"] = None
        norm = gr.normalize_static(envelope([loc]))
        self.assertEqual(len(norm["locations"]), 1)
        self.assertEqual(norm["operators"]["OPX"]["name"], "OPX")
        dyn = gr.normalize_dynamic(envelope([loc]))
        self.assertEqual(dyn["evse_count"], 2)

    def test_static_rejects_bad_envelope(self):
        with self.assertRaises(SourceError):
            gr.normalize_static({"status": "error", "Locations": []})
        with self.assertRaises(SourceError):
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
    def test_diff_encoded(self):
        prev = {"L1": "AC", "L2": "A"}
        cur = {"L1": "CCA", "L3": "A"}
        self.assertEqual(aggregate.diff_encoded(prev, cur), [
            ["L1", 0, "A", "C"], ["L1", 2, "-", "A"], ["L2", 0, "A", "-"], ["L3", 0, "-", "A"],
        ])
        self.assertEqual(aggregate.diff_encoded(None, cur), [])

    def test_points_layer(self):
        static = gr.normalize_static(envelope([location()]))
        pts = aggregate.points_layer(static, "t", 1)
        row = pts["points"][0]
        self.assertEqual(row[0], "GR-OPX-S1-L")
        self.assertEqual(row[6], 2)          # evses
        self.assertEqual(row[7], 1)          # dc evses
        self.assertEqual(row[8], 50.0)       # max kW
        self.assertEqual(row[9], aggregate.CLASS_BITS["ac"] | aggregate.CLASS_BITS["fast"])
        self.assertEqual(row[10], aggregate.CONN_BITS["T2"] | aggregate.CONN_BITS["CCS2"])
        self.assertEqual(row[11] & 1, 1)     # 24/7

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
        self.assertEqual(table["totals"]["hardware"]["none"]["n"], 2)

    def test_hardware_mix_normalises_spellings(self):
        mix = aggregate.hardware_mix([{"mfr": "ABB"}, {"mfr": "Abb "}, {"mfr": "ABB E-mobility", "model": "Terra 184"}, {"mfr": "alpitronic GmbH", "model": "HYC300"}, {}])
        self.assertEqual(mix["abb"]["n"], 3)
        self.assertEqual(mix["abb"]["name"], "ABB")
        self.assertEqual(mix["abb"]["models"], ["Terra 184"])
        self.assertEqual(mix["alpitronic"]["n"], 1)
        self.assertEqual(mix["none"]["name"], "Not declared")

    def test_tick_summary(self):
        static = gr.normalize_static(envelope([location()]))
        summ = aggregate.tick_summary(static, {"GR-OPX-S1-L": {"1": "A", "2": "C"}}, "t")
        self.assertEqual(summ["n"], {"A": 1, "C": 1})
        self.assertEqual(summ["kwc"], 50)


class TickTests(unittest.TestCase):
    def run_tick(self, root, static_doc, dyn_doc, now):
        (root / "static.zip").write_bytes(zipped(static_doc))
        (root / "dynamic.zip").write_bytes(zipped(dyn_doc))
        t = Tick(gr.SPEC, root / "data", static_file=root / "static.zip", dynamic_file=root / "dynamic.zip", now=now)
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
            self.assertTrue((gr_dir / "points.json").exists())
            self.assertTrue((gr_dir / "locations" / "00.json").exists())
            self.assertTrue((gr_dir / "status.json").exists())
            st = json.loads((gr_dir / "status.json").read_text())
            self.assertEqual(st["locations"], {"GR-OPX-S1-L": "AC"})
            self.assertFalse((gr_dir / "events" / "2026-09-05.jsonl").exists())
            hist = (gr_dir / "history" / "2026-09-05.jsonl").read_text().splitlines()
            self.assertEqual(len(hist), 1)

            t1 = t0 + dt.timedelta(minutes=10)
            t = self.run_tick(root, static_doc,
                              to_dynamic(static_doc, overrides={("GR-OPX-S1-L", "1"): "OUTOFORDER"}), t1)
            hist = (gr_dir / "history" / "2026-09-05.jsonl").read_text().splitlines()
            self.assertEqual(len(hist), 2)
            ev = json.loads((gr_dir / "events" / "2026-09-05.jsonl").read_text())
            self.assertEqual(ev["ch"], [["GR-OPX-S1-L", 0, "A", "O"]])
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
            pts = json.loads((root / "data" / "gr" / "points.json").read_text())
            self.assertEqual(len(pts["points"]), 10)

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


class SingleFeedTests(unittest.TestCase):
    """Sources where one OCPI document carries inventory and live status (LT, NL)."""

    def ocpi_doc(self, status="AVAILABLE", tariff_ids=None):
        loc = location(lid="LT-1", party="IBG", lat="54.68", lon="25.28", evses=[
            evse("535", status, [connector("650306", 22000, tariffs=None)]),
        ])
        if tariff_ids is not None:
            loc["evses"][0]["connectors"][0]["tariff_ids"] = tariff_ids
        return {"status_code": 1000, "data": [loc]}

    def run_tick(self, root, doc, now, spec):
        (root / "feed.json").write_text(json.dumps(doc))
        t = Tick(spec, root / "data", static_file=root / "feed.json", now=now)
        t.run_static()
        t.tariff_lookup = {"t1": {"id": "t1", "currency": "EUR", "elements": [{"price_components": [{"type": "ENERGY", "price": "0.38"}]}]}}
        t.run_dynamic()
        t.finish()
        return t

    def test_lt_single_feed_with_tariff_lookup(self):
        from cpo_pipeline.sources import lt_vialietuva as lt
        with TemporaryDirectory() as d:
            root = Path(d)
            t0 = dt.datetime(2026, 9, 5, 4, 0, tzinfo=dt.timezone.utc)
            t = self.run_tick(root, self.ocpi_doc(tariff_ids=["t1"]), t0, lt.SPEC)
            self.assertEqual(t.warnings, [])
            lt_dir = root / "data" / "lt"
            st = json.loads((lt_dir / "status.json").read_text())
            self.assertEqual(st["locations"]["LT-1"], "A")
            tf = json.loads((lt_dir / "tariffs.json").read_text())
            self.assertEqual(tf["tariffs"][0]["kwh"], 0.38)
            self.assertEqual(tf["locations"]["LT-1"]["535"]["650306"], 0)
            locs = json.loads((lt_dir / "locations" / "00.json").read_text())
            self.assertNotIn("st", locs["locations"][0]["evses"][0], "live status must not be stored in shards")
            meta0 = json.loads((lt_dir / "meta.json").read_text())

            # Second tick: only the status changed. Inventory file must not be rewritten.
            t = self.run_tick(root, self.ocpi_doc(status="CHARGING", tariff_ids=["t1"]), t0 + dt.timedelta(minutes=10), lt.SPEC)
            meta1 = json.loads((lt_dir / "meta.json").read_text())
            self.assertEqual(meta0["static"]["structure"], meta1["static"]["structure"])
            locs2 = json.loads((lt_dir / "locations" / "00.json").read_text())
            self.assertEqual(locs2, locs, "shard rewritten despite unchanged structure")
            ev = json.loads((lt_dir / "events" / "2026-09-05.jsonl").read_text())
            self.assertEqual(ev["ch"], [["LT-1", 0, "A", "C"]])
            hist = (lt_dir / "history" / "2026-09-05.jsonl").read_text().splitlines()
            self.assertEqual(len(hist), 2)
            index = json.loads((root / "data" / "index.json").read_text())
            self.assertEqual([c["code"] for c in index["countries"]], ["LT"])

    def test_nl_bbox_and_plain_list(self):
        from cpo_pipeline.sources import nl_ndw as nl
        doc = [location(lid="NLLOC1", party="ALLEGO", lat="52.37", lon="4.89"),
               location(lid="FAR", party="X", lat="37.9", lon="23.7")]
        norm = nl.parse_static(doc, nl.SPEC)
        self.assertEqual([l["id"] for l in norm["locations"]], ["NLLOC1"])
        self.assertEqual(norm["dropped"], [("FAR", "outside bbox")])


class OcpiPagesTests(unittest.TestCase):
    def test_pagination_via_total_count(self):
        from cpo_pipeline import fetch as F
        calls = []

        def fake_get(url, **kw):
            calls.append(url)
            off = int(url.split("offset=")[1].split("&")[0])
            data = [{"id": i} for i in range(off, min(off + 2, 5))]
            return F.FetchResult(200, json.dumps({"status_code": 1000, "data": data}).encode(), None, None, None, "5")

        orig = F.http_get
        F.http_get = fake_get
        try:
            items, info = F.fetch_ocpi_pages("https://x/locations", page_size=2, max_pages=10, max_bytes=1 << 20)
        finally:
            F.http_get = orig
        self.assertEqual([i["id"] for i in items], [0, 1, 2, 3, 4])
        self.assertEqual(info["pages"], 3)
        self.assertEqual(info["total_count"], 5)


FR_HEADER = "nom_amenageur,siren_amenageur,contact_amenageur,nom_operateur,contact_operateur,telephone_operateur,nom_enseigne,id_station_itinerance,id_station_local,nom_station,implantation_station,adresse_station,code_insee_commune,coordonneesXY,nbre_pdc,id_pdc_itinerance,id_pdc_local,puissance_nominale,prise_type_ef,prise_type_2,prise_type_combo_ccs,prise_type_chademo,prise_type_autre,gratuit,paiement_acte,paiement_cb,paiement_autre,tarification,condition_acces,reservation,horaires,accessibilite_pmr,restriction_gabarit,station_deux_roues,raccordement,num_pdl,date_mise_en_service,observations,date_maj,cable_t2_attache,last_modified,datagouv_dataset_id,datagouv_resource_id,datagouv_organization_or_owner,consolidated_longitude,consolidated_latitude,consolidated_code_postal,consolidated_commune,consolidated_is_lon_lat_correct,consolidated_is_code_insee_verified"


def fr_row(**kw):
    base = {c: "" for c in FR_HEADER.split(",")}
    base.update({"nom_amenageur": "Ville de Paris", "nom_operateur": "Total Marketing France", "id_station_itinerance": "FRTCBP00123",
                 "nom_station": "Paris Bastille", "implantation_station": "Voirie", "adresse_station": "1 Place de la Bastille",
                 "coordonneesXY": "[2.369, 48.853]", "nbre_pdc": "2", "id_pdc_itinerance": "FRTCBE001231", "puissance_nominale": "22",
                 "prise_type_2": "true", "prise_type_combo_ccs": "false", "prise_type_chademo": "false", "prise_type_ef": "false",
                 "paiement_cb": "true", "horaires": "24/7", "date_maj": "2026-09-01", "consolidated_longitude": "2.369",
                 "consolidated_latitude": "48.853", "consolidated_code_postal": "75004", "consolidated_commune": "Paris"})
    base.update(kw)
    return base


class FranceTests(unittest.TestCase):
    def csv_text(self, rows):
        import csv as _csv
        buf = io.StringIO()
        w = _csv.DictWriter(buf, fieldnames=FR_HEADER.split(","))
        w.writeheader()
        for r in rows:
            w.writerow(r)
        return buf.getvalue()

    def test_static_groups_points_into_stations(self):
        from cpo_pipeline.sources import fr_irve as fr
        text = self.csv_text([
            fr_row(),
            fr_row(id_pdc_itinerance="FRTCBE001232", puissance_nominale="150000", prise_type_2="false", prise_type_combo_ccs="true"),
            fr_row(id_station_itinerance="FRXYZP9", id_pdc_itinerance="FRXYZE9", nom_operateur="Other", consolidated_latitude="60.0"),
        ])
        norm = fr.parse_static(text, fr.SPEC)
        self.assertEqual(len(norm["locations"]), 1)
        st = norm["locations"][0]
        self.assertEqual(st["op"], "TCB")
        self.assertEqual(len(st["evses"]), 2)
        self.assertEqual(st["evses"][0]["conns"][0]["std"], "T2")
        self.assertEqual(st["evses"][0]["conns"][0]["kw"], 22.0)
        self.assertEqual(st["evses"][1]["conns"][0]["std"], "CCS2")
        self.assertEqual(st["evses"][1]["conns"][0]["kw"], 150.0)   # watts normalised
        self.assertTrue(st["h24"])
        self.assertEqual(norm["dropped"], [("FRXYZP9", "outside bbox")])
        self.assertEqual(norm["operators"]["TCB"]["name"], "Total Marketing France")

    def test_inventory_only_tick(self):
        from cpo_pipeline.sources import fr_irve as fr
        with TemporaryDirectory() as d:
            root = Path(d)
            (root / "irve.csv").write_text(self.csv_text([fr_row()]), encoding="utf-8")
            t0 = dt.datetime(2026, 9, 5, 4, 0, tzinfo=dt.timezone.utc)
            t = Tick(fr.SPEC, root / "data", static_file=root / "irve.csv", now=t0)
            t.run_static(); t.run_tariffs(); t.run_dynamic(); t.finish()
            self.assertEqual(t.warnings, [])
            fr_dir = root / "data" / "fr"
            self.assertTrue((fr_dir / "points.json").exists())
            self.assertFalse((fr_dir / "status.json").exists())
            ops = json.loads((fr_dir / "operators.json").read_text())
            self.assertEqual(ops["totals"]["evses"], 1)
            self.assertIsNone(ops["totals"]["avail_pct"])
            index = json.loads((root / "data" / "index.json").read_text())
            self.assertFalse(index["countries"][0]["live"])
