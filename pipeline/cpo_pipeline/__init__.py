"""cpo.today data pipeline.

Fetches official charge-point registries (starting with Greece's MYFAH),
validates them, and writes compact, versioned JSON for the cpo.today portal.
Standard library only: no third-party dependencies to audit or update.
"""

__version__ = "0.1.0"
