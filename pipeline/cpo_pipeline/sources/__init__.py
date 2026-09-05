"""Registry of implemented national sources, keyed by lower-case country code."""

from . import fr_irve, gr_myfah, lt_vialietuva, nl_ndw

SPECS = {
    "fr": fr_irve.SPEC,
    "gr": gr_myfah.SPEC,
    "lt": lt_vialietuva.SPEC,
    "nl": nl_ndw.SPEC,
}
