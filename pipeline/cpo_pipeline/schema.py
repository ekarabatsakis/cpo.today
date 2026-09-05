"""Shared vocabulary for the normalized cpo.today data model.

The source registries publish OCPI-style documents. We keep OCPI semantics but
shorten the enums so the files stay small enough to version every 10 minutes.
"""

# EVSE status -> single-letter code. Anything unmapped becomes "X".
STATUS_CODES = {
    "AVAILABLE": "A",
    "CHARGING": "C",
    "BLOCKED": "B",
    "INOPERATIVE": "I",
    "OUTOFORDER": "O",
    "UNKNOWN": "U",
    "RESERVED": "R",
    "PLANNED": "P",
    "REMOVED": "M",
}
STATUS_NAMES = {v: k for k, v in STATUS_CODES.items()}
STATUS_NAMES["X"] = "OTHER"

# Connector standard -> short label.
CONNECTOR_CODES = {
    "IEC_62196_T2": "T2",
    "IEC_62196_T2_COMBO": "CCS2",
    "IEC_62196_T1": "T1",
    "IEC_62196_T1_COMBO": "CCS1",
    "IEC_62196_T3A": "T3A",
    "IEC_62196_T3C": "T3C",
    "CHADEMO": "CHADEMO",
    "TESLA_R": "TESLA_R",
    "TESLA_S": "TESLA_S",
    "DOMESTIC_A": "DOM",
    "DOMESTIC_B": "DOM",
    "DOMESTIC_C": "DOM",
    "DOMESTIC_D": "DOM",
    "DOMESTIC_E": "DOM",
    "DOMESTIC_F": "DOM",
    "DOMESTIC_G": "DOM",
    "DOMESTIC_H": "DOM",
    "DOMESTIC_I": "DOM",
    "DOMESTIC_J": "DOM",
    "DOMESTIC_K": "DOM",
    "DOMESTIC_L": "DOM",
    "IEC_60309_2_single_16": "IND",
    "IEC_60309_2_three_16": "IND",
    "IEC_60309_2_three_32": "IND",
    "IEC_60309_2_three_64": "IND",
}

POWER_TYPE_CODES = {
    "AC_1_PHASE": "AC1",
    "AC_2_PHASE": "AC2",
    "AC_2_PHASE_SPLIT": "AC2",
    "AC_3_PHASE": "AC3",
    "DC": "DC",
}

# Power classes used for aggregation and filtering (kW, lower bound inclusive).
POWER_CLASSES = [
    ("slow", 0, 11),      # < 11 kW
    ("ac", 11, 43),       # 11-43 kW AC
    ("fast", 43, 150),    # 43-149 kW
    ("ultra", 150, None), # >= 150 kW
]


def status_code(raw):
    if raw is None:
        return "U"
    return STATUS_CODES.get(str(raw).upper(), "X")


def connector_code(raw):
    if raw is None:
        return "OTHER"
    return CONNECTOR_CODES.get(str(raw), str(raw)[:16])


def power_type_code(raw):
    if raw is None:
        return "NA"
    return POWER_TYPE_CODES.get(str(raw), str(raw)[:8])


def power_class(kw):
    if kw is None:
        return "na"
    for name, lo, hi in POWER_CLASSES:
        if kw >= lo and (hi is None or kw < hi):
            return name
    return "na"
