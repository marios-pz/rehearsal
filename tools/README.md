# Build-time data tools

`build-geo.py` regenerates `src/lib/data/geo/*.json` from Natural Earth
admin-1. Run it when adding a country, not at runtime.

    pip install shapely
    curl -sSLO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
    mv ne_10m_admin_1_states_provinces.geojson ne1.json
    python3 build-geo.py

Add the country to `CITIES` first. Two things it handles that a naive script
does not:

- **Overseas territories.** The Netherlands file carries the Caribbean and
  the UK carries everything out to Gibraltar. Framing on the full bounding
  box shrinks the mainland to a speck. It keeps only what sits near the
  largest landmass.
- **Granularity.** Natural Earth gives the UK 232 districts, which is
  unusable as a picker. Those get dissolved into the 16 ITL-1 regions via
  the `region` property. Add an entry to `GROUP_BY` for any country with the
  same problem.
