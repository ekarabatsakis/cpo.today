"""Registry of implemented national sources, keyed by lower-case country code."""

from . import be_road, cy_ems, fr_irve, gr_myfah, lt_vialietuva, lu_chargy, nl_ndw

SPECS = {
    "be": be_road.SPEC,
    "cy": cy_ems.SPEC,
    "fr": fr_irve.SPEC,
    "gr": gr_myfah.SPEC,
    "lt": lt_vialietuva.SPEC,
    "lu": lu_chargy.SPEC,
    "nl": nl_ndw.SPEC,
}
