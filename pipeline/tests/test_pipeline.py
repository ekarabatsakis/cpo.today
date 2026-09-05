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
                elif "_openapiTariffs" in c:
                    cc["_openapiTariffs"] = c["_openapiTariffs"]
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
        key, t = next(iter(dyn["tariffs"].items()))
        self.assertEqual(len(key), 8)
        self.assertEqual(t["kwh"], 0.54)
        self.assertEqual(t["cur"], "EUR")
        self.assertEqual(dyn["connector_tariffs"]["GR-OPX-S1-L"]["1"]["10"], key)


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

    def test_operator_table_splits_ac_and_dc_prices(self):
        ac_tariff = [{"currency": "EUR", "elements": [{"price_components": [{"type": "ENERGY", "price": "0.40"}]}]}]
        dc_tariff = [{"currency": "EUR", "elements": [{"price_components": [{"type": "ENERGY", "price": "0.59"}]}]}]
        loc = location(evses=[
            evse("1", "AVAILABLE", [connector("10", 22000, tariffs=ac_tariff)]),
            evse("2", "AVAILABLE", [connector("11", 50000, "IEC_62196_T2_COMBO", "DC", tariffs=dc_tariff)]),
            evse("3", "AVAILABLE", [connector("12", 22000)]),
        ])
        static = gr.normalize_static(envelope([loc]))
        dyn = gr.normalize_dynamic(to_dynamic(envelope([loc])))
        table = aggregate.operator_table(static, dyn["statuses"], dyn["tariffs"], dyn["connector_tariffs"], "t")
        row = table["operators"][0]
        self.assertEqual((row["median_kwh_ac"], row["priced_ac"]), (0.4, 1))
        self.assertEqual((row["median_kwh_dc"], row["priced_dc"]), (0.59, 1))
        self.assertEqual((row["median_kwh_price"], row["priced_connectors"]), (0.495, 2))

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

    def test_evse_order_is_stable(self):
        with TemporaryDirectory() as d:
            root = Path(d)
            t0 = dt.datetime(2026, 9, 5, 4, 0, tzinfo=dt.timezone.utc)
            doc = envelope([location()])
            self.run_tick(root, doc, to_dynamic(doc), t0)
            shard = (root / "data" / "gr" / "locations" / "00.json").read_text()
            swapped = envelope([location()])
            swapped["Locations"][0]["evses"].reverse()
            self.run_tick(root, swapped, to_dynamic(swapped, overrides={("GR-OPX-S1-L", "1"): "CHARGING"}), t0 + dt.timedelta(minutes=10))
            self.assertEqual((root / "data" / "gr" / "locations" / "00.json").read_text(), shard, "EVSE reorder must not rewrite the shard")
            st = json.loads((root / "data" / "gr" / "status.json").read_text())
            self.assertEqual(st["locations"]["GR-OPX-S1-L"], "CC")

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
            key = tf["locations"]["LT-1"]["535"]["650306"]
            self.assertEqual(tf["tariffs"][key]["kwh"], 0.38)
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

    def test_nl_drops_volatile_last_updated(self):
        from cpo_pipeline.sources import nl_ndw as nl
        norm = nl.parse_static([location(lid="NLLOC1", party="ALLEGO", lat="52.37", lon="4.89")], nl.SPEC)
        self.assertEqual(norm["locations"][0]["upd"], "")

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


DATEX_TABLE = """<?xml version="1.0" encoding="utf-8"?>
<d2:payload xsi:type="egi:EnergyInfrastructureTablePublication" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:com="https://datex2.eu/schema/3/common" xmlns:egi="https://datex2.eu/schema/3/energyInfrastructure"
  xmlns:fac="https://datex2.eu/schema/3/facilities" xmlns:loc="https://datex2.eu/schema/3/locationReferencing" xmlns:d2="https://datex2.eu/schema/3/d2Payload">
  <egi:energyInfrastructureTable id="T" version="1">
    <egi:energyInfrastructureSite id="EGI-S-1" version="v1">
      <fac:name><com:values><com:value lang="lt">Vilnius Hub</com:value></com:values></fac:name>
      <egi:energyInfrastructureStation id="EGI-ST-1" version="v1">
        <egi:lastUpdated>2026-07-09T09:28:04+03:00</egi:lastUpdated>
        <egi:energyProvider xsi:type="fac:OrganisationSpecification">
          <fac:name><com:values><com:value lang="lt">In Balance grid, UAB</com:value></com:values></fac:name>
        </egi:energyProvider>
        <egi:siteLocation xsi:type="loc:LocationReference"><loc:pointByCoordinates><loc:pointCoordinates>
          <loc:latitude>54.7049540</loc:latitude><loc:longitude>25.2724750</loc:longitude></loc:pointCoordinates></loc:pointByCoordinates></egi:siteLocation>
        <egi:refillPoint xsi:type="egi:ElectricChargingPoint" id="LT-IBG-P-A" version="v1">
          <egi:connector><egi:connectorType>Type 2</egi:connectorType><egi:maxPowerAtSocket>22</egi:maxPowerAtSocket></egi:connector>
        </egi:refillPoint>
        <egi:refillPoint xsi:type="egi:ElectricChargingPoint" id="LT-IBG-P-B" version="v1">
          <egi:connector><egi:connectorType>CCS</egi:connectorType><egi:maxPowerAtSocket>150000</egi:maxPowerAtSocket></egi:connector>
        </egi:refillPoint>
      </egi:energyInfrastructureStation>
    </egi:energyInfrastructureSite>
    <egi:energyInfrastructureSite id="EGI-S-2" version="v1">
      <egi:energyInfrastructureStation id="EGI-ST-2" version="v1">
        <egi:siteLocation><loc:pointByCoordinates><loc:pointCoordinates><loc:latitude>10</loc:latitude><loc:longitude>10</loc:longitude></loc:pointCoordinates></loc:pointByCoordinates></egi:siteLocation>
        <egi:refillPoint id="X"><egi:connector><egi:connectorType>chademo</egi:connectorType></egi:connector></egi:refillPoint>
      </egi:energyInfrastructureStation>
    </egi:energyInfrastructureSite>
  </egi:energyInfrastructureTable>
</d2:payload>"""

DATEX_STATUS = """<?xml version="1.0" encoding="utf-8"?>
<d2:payload xsi:type="egi:EnergyInfrastructureStatusPublication" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:egi="https://datex2.eu/schema/3/energyInfrastructure" xmlns:fac="https://datex2.eu/schema/3/facilities" xmlns:d2="https://datex2.eu/schema/3/d2Payload">
  <egi:energyInfrastructureSiteStatus id="EGI-S-1" version="v1">
    <egi:energyInfrastructureStationStatus id="EGI-ST-1" version="v1">
      <egi:refillPointStatus id="LT-IBG-P-A"><egi:status>OUTOFORDER</egi:status></egi:refillPointStatus>
      <egi:refillPointStatus id="1"><egi:status>occupied</egi:status></egi:refillPointStatus>
    </egi:energyInfrastructureStationStatus>
  </egi:energyInfrastructureSiteStatus>
</d2:payload>"""


class DatexTests(unittest.TestCase):
    def spec(self):
        from cpo_pipeline.sources import lt_vialietuva as lt
        return lt.SPEC

    def test_table(self):
        from cpo_pipeline.sources import datex2
        norm = datex2.parse_table(DATEX_TABLE.encode(), self.spec())
        self.assertEqual([l["id"] for l in norm["locations"]], ["EGI-S-1"])
        self.assertEqual(norm["dropped"], [("EGI-S-2", "outside bbox")])
        loc = norm["locations"][0]
        self.assertEqual(loc["name"], "Vilnius Hub")
        self.assertEqual(norm["operators"][loc["op"]]["name"], "In Balance grid, UAB")
        self.assertEqual(loc["lat"], 54.704954)
        self.assertEqual([e["uid"] for e in loc["evses"]], ["LT-IBG-P-A", "LT-IBG-P-B"])
        self.assertEqual(loc["evses"][0]["conns"][0], {"id": "1", "std": "T2", "fmt": "SOCKET", "pt": "AC3", "kw": 22.0})
        self.assertEqual(loc["evses"][1]["conns"][0]["std"], "CCS2")
        self.assertEqual(loc["evses"][1]["conns"][0]["kw"], 150.0)
        self.assertEqual(loc["evses"][1]["conns"][0]["pt"], "DC")
        self.assertEqual(loc["upd"], "2026-07-09")

    def test_status_by_id_and_position(self):
        from cpo_pipeline.sources import datex2
        inv = datex2.parse_table(DATEX_TABLE.encode(), self.spec())
        st = datex2.parse_status(DATEX_STATUS.encode(), inv)
        self.assertEqual(st["statuses"], {"EGI-S-1": {"LT-IBG-P-A": "O", "LT-IBG-P-B": "C"}})

    def test_codes(self):
        from cpo_pipeline.sources import datex2
        self.assertEqual(datex2.status_code("outOfOrder"), "O")
        self.assertEqual(datex2.status_code("AVAILABLE"), "A")
        self.assertEqual(datex2.status_code("weird"), "U")
        self.assertEqual(datex2.connector_code("iec62196T2Combo"), "CCS2")
        self.assertEqual(datex2.connector_code("Type 2"), "T2")
        self.assertEqual(datex2.connector_code("CHAdeMO"), "CHADEMO")


CHARGY_KML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Stations</name>
<Placemark><name>Esch-sur-Alzette - Parking Brill</name><address>Rue Louis Pasteur, L-4276 Esch-sur-Alzette Luxembourg</address><styleUrl>#AVAILABLE</styleUrl>
<ExtendedData><Data name="CPnum"><value>4</value></Data>
<Data name="chargingdevice"><value>{"id":10644,"name":"CP2500","numberOfConnectors":2,"connectors":[{"id":59985,"name":"CP2500 - 1","maxchspeed":22.08,"connector":1,"description":"AVAILABLE"},{"id":59986,"name":"CP2500 - 2","maxchspeed":22.08,"connector":2,"description":"CHARGING"}]}</value></Data>
</ExtendedData><Point><coordinates>5.98186,49.49577,0.0</coordinates></Point></Placemark>
<Placemark><name>SuperChargy Aire de Berchem</name><address>A3, L-3325 Berchem Luxembourg</address><styleUrl>#UNAVAILABLE</styleUrl>
<ExtendedData><Data name="chargingdevice"><value>{"id":20001,"name":"SC1","numberOfConnectors":1,"connectors":[{"id":70001,"name":"SC1 - 1","maxchspeed":160,"connector":1,"description":"UNAVAILABLE"}]}</value></Data></ExtendedData>
<Point><coordinates>6.13,49.53,0</coordinates></Point></Placemark>
</Document></kml>"""

CY_XML = """<?xml version='1.0' encoding='utf-8'?><d2LogicalModel xmlns="http://datex2.eu/schema/3/common" xmlns:ei="http://datex2.eu/schema/3/energyInfrastructure"><payload>
<ei:energyInfrastructureTable><ei:energyInfrastructureTablePublication><ei:chargingPoints>
<ei:chargingPoint><chargingPointIdentification>Petrolina GSZ Station (150kW)</chargingPointIdentification><ei:chargingPointOwner>Alpitronic Right</ei:chargingPointOwner>
<chargingPointStatus><value>operational</value><lang>en</lang></chargingPointStatus><ei:chargingPointOperator>Petrolina (Holdings) Public Ltd.</ei:chargingPointOperator>
<numberOfConnectors>2</numberOfConnectors><location><pointByCoordinates><pointCoordinates><latitude>34.925</latitude><longitude>33.601</longitude></pointCoordinates></pointByCoordinates></location>
<ei:maximumPower>300</ei:maximumPower><ei:connectorPower>300</ei:connectorPower><ei:creationDate>2023-07-05</ei:creationDate><chargingMode>fastCharging</chargingMode>
<connectorTypes><connectorType>type2</connectorType><connectorType>comboType2</connectorType></connectorTypes>
<chargingPointAddress><value>Georgiou Christodoulidi Avenue, 6043, Larnaca</value><lang>el</lang></chargingPointAddress></ei:chargingPoint>
</ei:chargingPoints></ei:energyInfrastructureTablePublication></ei:energyInfrastructureTable></payload></d2LogicalModel>"""


class NewSourcesTests(unittest.TestCase):
    def test_chargy_kml(self):
        from cpo_pipeline.sources import lu_chargy as lu
        norm = lu.parse_chargy(CHARGY_KML, lu.SPEC)
        self.assertEqual(len(norm["locations"]), 2)
        a = norm["locations"][0]
        self.assertEqual(a["id"], "LU-CHARGY-10644")
        self.assertEqual(a["pc"], "4276")
        self.assertEqual(a["city"], "Esch-sur-Alzette")
        self.assertEqual([e["uid"] for e in a["evses"]], ["59985", "59986"])
        self.assertEqual(a["evses"][0]["conns"][0], {"id": "1", "std": "T2", "fmt": "SOCKET", "pt": "AC3", "kw": 22.1})
        self.assertEqual(norm["statuses"]["LU-CHARGY-10644"], {"59985": "A", "59986": "C"})
        b = norm["locations"][1]
        self.assertEqual(b["evses"][0]["conns"][0]["std"], "CCS2")
        self.assertEqual(norm["statuses"]["LU-CHARGY-20001"], {"70001": "O"})

    def test_cyprus_xml(self):
        from cpo_pipeline.sources import cy_ems as cy
        norm = cy.parse_static(CY_XML, cy.SPEC)
        self.assertEqual(len(norm["locations"]), 1)
        loc = norm["locations"][0]
        self.assertEqual(norm["operators"][loc["op"]]["name"], "Petrolina (Holdings) Public Ltd.")
        self.assertEqual(len(loc["evses"]), 2)
        self.assertEqual({e["conns"][0]["std"] for e in loc["evses"]}, {"T2", "CCS2"})
        self.assertEqual(loc["evses"][0]["conns"][0]["kw"], 300.0)
        self.assertEqual(loc["addr"], "Georgiou Christodoulidi Avenue, 6043, Larnaca")

    def test_parts_merge_and_status(self):
        """A single-feed source with an extra inventory part: statuses merged, parts deduplicated."""
        from cpo_pipeline.sources import lu_chargy as lu
        from cpo_pipeline.sources.base import Feed, SourceSpec
        eco = DATEX_TABLE.replace("54.7049540", "49.60").replace("25.2724750", "6.13")
        spec = SourceSpec(**{**{f: getattr(lu.SPEC, f) for f in lu.SPEC.__dataclass_fields__}, "parts": ()})
        with TemporaryDirectory() as d:
            root = Path(d)
            (root / "chargy.kml").write_text(CHARGY_KML)
            t = Tick(spec, root / "data", static_file=root / "chargy.kml", now=dt.datetime(2026, 9, 5, 4, 0, tzinfo=dt.timezone.utc))
            # simulate the part having been fetched
            t._part_cache = {}
            t.run_static()
            # inject the eco part manually via parser to check merge semantics
            pn = lu.parse_eco(eco, spec)
            self.assertEqual([l["id"] for l in pn["locations"]], ["EGI-S-1"])
            t.run_dynamic(); t.finish()
            st = json.loads((root / "data" / "lu" / "status.json").read_text())
            self.assertEqual(st["locations"]["LU-CHARGY-10644"], "AC")
            self.assertEqual(st["locations"]["LU-CHARGY-20001"], "O")


DE_CSV = """\ufeffLadesäulenregister Bundesnetzagentur;;;;
;;;;
Letzte Aktualisierung vom: 01.09.2026;;;;
Ladeeinrichtungs-ID;Betreiber;Anzeigename (Karte);Status;Art der Ladeeinrichtung;Anzahl Ladepunkte;Nennleistung Ladeeinrichtung [kW];Inbetriebnahmedatum;Straße;Hausnummer;Adresszusatz;Postleitzahl;Ort;Kreis/kreisfreie Stadt;Bundesland;Breitengrad;Längengrad;Standortbezeichnung;Informationen zum Parkraum;Bezahlsysteme;Öffnungszeiten;Öffnungszeiten: Wochentage;Öffnungszeiten: Tageszeiten;Steckertypen1;Nennleistung Stecker1;EVSE-ID1;Public Key1;Steckertypen2;Nennleistung Stecker2;EVSE-ID2;Public Key2
1010338;Albwerk GmbH;Albwerk;In Betrieb;Normalladeeinrichtung;2;22;11.01.2020;Am Berg;1;;72535;Heroldstatt;Alb-Donau;BW;48,442398;9,659075;;;"RFID-Karte;Onlinezahlungsverfahren";247;;;AC Typ 2 Steckdose;22;DEAEWE002501;KEY;AC Typ 2 Steckdose;22;DEAEWE002502;KEY
1010339;Albwerk GmbH;Albwerk;In Betrieb;Schnellladeeinrichtung;1;150;11.01.2021;Am Berg;1;;72535;Heroldstatt;Alb-Donau;BW;48,442398;9,659075;;;Kreditkarte;247;;;DC Fahrzeugkupplung Typ Combo (CCS);150;DEAEWE002601;KEY;;;;
"""


class GermanyTests(unittest.TestCase):
    def test_groups_devices_into_locations(self):
        from cpo_pipeline.sources import de_bnetza as de
        norm = de.parse_static(DE_CSV, de.SPEC)
        self.assertEqual(len(norm["locations"]), 1, "same operator + address + coords must merge")
        loc = norm["locations"][0]
        self.assertEqual(loc["addr"], "Am Berg 1")
        self.assertEqual(loc["lat"], 48.442398)
        self.assertEqual([e["uid"] for e in loc["evses"]], ["DEAEWE002501", "DEAEWE002502", "DEAEWE002601"])
        self.assertEqual(loc["evses"][0]["conns"][0]["std"], "T2")
        self.assertEqual(loc["evses"][2]["conns"][0], {"std": "CCS2", "fmt": "CABLE", "pt": "DC", "kw": 150.0, "id": "1"})
        self.assertIn("CREDIT_CARD_PAYABLE", loc["evses"][2]["caps"])
        self.assertTrue(loc["h24"])
        self.assertEqual(loc["upd"], "2021-01-11")
        self.assertEqual(next(iter(norm["operators"].values()))["name"], "Albwerk GmbH")

    def test_discover_regex(self):
        from cpo_pipeline.sources import de_bnetza as de
        import re
        html = 'x href="https://data.bundesnetzagentur.de/Bundesnetzagentur/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenregister_BNetzA_2026-09-01.csv" y'
        self.assertTrue(re.search(de.DISCOVER, html))


class EcoMovementRenditionTests(unittest.TestCase):
    def test_address_and_external_id(self):
        from cpo_pipeline.sources import datex2, lu_chargy as lu
        xml = """<d2:payload xmlns:d2="http://datex2.eu/schema/3/d2Payload" xmlns:com="http://datex2.eu/schema/3/common" xmlns:loc="http://datex2.eu/schema/3/locationReferencing" xmlns:egi="http://datex2.eu/schema/3/energyInfrastructure" xmlns:fac="http://datex2.eu/schema/3/facilities" xmlns:locx="http://datex2.eu/schema/3/locationExtension">
<egi:energyInfrastructureTable><egi:energyInfrastructureSite id="SWIO-1"><fac:name><com:values><com:value lang="en">Mondorf</com:value></com:values></fac:name>
<fac:locationReference><loc:pointByCoordinates><loc:pointCoordinates><loc:latitude>49.5057</loc:latitude><loc:longitude>6.2750</loc:longitude></loc:pointCoordinates></loc:pointByCoordinates>
<loc:_pointLocationExtension><locx:facilityLocation><locx:address><locx:postcode>5627</locx:postcode><locx:city>Mondorf-les-Bains</locx:city><locx:addressLine order="0"><locx:type>street</locx:type><locx:text>1, Place des Villes Jumelees</locx:text></locx:addressLine></locx:address></locx:facilityLocation></loc:_pointLocationExtension></fac:locationReference>
<fac:operator><fac:name><com:values><com:value lang="en">SWIO</com:value></com:values></fac:name></fac:operator>
<egi:energyInfrastructureStation id="1"><egi:refillPoint id="c62c"><fac:externalIdentifier>LU*SWO*E100422</fac:externalIdentifier><egi:connector><egi:connectorType>iec62196T2</egi:connectorType><egi:chargingMode>mode3AC3p</egi:chargingMode><egi:maxPowerAtSocket>22000</egi:maxPowerAtSocket></egi:connector></egi:refillPoint></egi:energyInfrastructureStation>
</egi:energyInfrastructureSite></egi:energyInfrastructureTable></d2:payload>"""
        norm = datex2.parse_table(xml.encode(), lu.SPEC)
        loc = norm["locations"][0]
        self.assertEqual(loc["addr"], "1, Place des Villes Jumelees")
        self.assertEqual(loc["city"], "Mondorf-les-Bains")
        self.assertEqual(loc["pc"], "5627")
        self.assertEqual(norm["operators"][loc["op"]]["name"], "SWIO")
        self.assertEqual(loc["evses"][0]["id"], "LU*SWO*E100422")
        self.assertEqual(loc["evses"][0]["conns"][0]["kw"], 22.0)
