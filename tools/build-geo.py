"""Per-country region geometry + city→region assignment.

The union of the regions IS the country outline, so we ship regions only —
no separate country path to keep in sync, and half the bytes.
"""
import json, math
from shapely.geometry import shape, Point, mapping
from shapely.ops import unary_union

CITIES = {
 'GR': [("Athens",37.98,23.73),("Thessaloniki",40.64,22.94),("Patras",38.25,21.73),
        ("Heraklion",35.34,25.13),("Larisa",39.64,22.42),("Volos",39.36,22.94),
        ("Ioannina",39.67,20.85),("Kavala",40.94,24.41),("Chania",35.51,24.02),
        ("Rhodes",36.43,28.22),("Corfu",39.62,19.92),("Kalamata",37.04,22.11),
        ("Mytilene",39.11,26.55),("Alexandroupoli",40.85,25.87)],
 'DE': [("Berlin",52.52,13.40),("Hamburg",53.55,9.99),("Munich",48.14,11.58),
        ("Cologne",50.94,6.96),("Frankfurt",50.11,8.68),("Leipzig",51.34,12.37),
        ("Stuttgart",48.78,9.18),("Dresden",51.05,13.74),("Bremen",53.08,8.80),
        ("Hanover",52.37,9.73),("Nuremberg",49.45,11.08),("Dortmund",51.51,7.47),
        ("Rostock",54.09,12.13),("Freiburg",47.99,7.85)],
 'GB': [("London",51.51,-0.13),("Manchester",53.48,-2.24),("Birmingham",52.49,-1.89),
        ("Glasgow",55.86,-4.25),("Leeds",53.80,-1.55),("Bristol",51.45,-2.59),
        ("Liverpool",53.41,-2.98),("Sheffield",53.38,-1.47),("Newcastle",54.98,-1.61),
        ("Edinburgh",55.95,-3.19),("Cardiff",51.48,-3.18),("Brighton",50.82,-0.14),
        ("Nottingham",52.95,-1.15),("Belfast",54.60,-5.93),("Norwich",52.63,1.30)],
 'NL': [("Amsterdam",52.37,4.90),("Rotterdam",51.92,4.48),("Utrecht",52.09,5.12),
        ("The Hague",52.08,4.31),("Eindhoven",51.44,5.48),("Groningen",53.22,6.57),
        ("Nijmegen",51.84,5.86),("Tilburg",51.56,5.09),("Haarlem",52.38,4.64),
        ("Maastricht",50.85,5.69),("Enschede",52.22,6.90),("Leeuwarden",53.20,5.79)],
}
# UK districts are far too granular (232); NE's `region` field is the ITL-1 grouping
GROUP_BY = {'GB': 'region'}
W = 1000.0

ne = json.load(open('ne1.json'))
merc = lambda la: math.degrees(math.log(math.tan(math.pi/4 + math.radians(la)/2)))

out = {}
for cc, cities in CITIES.items():
    feats = [f for f in ne['features'] if f['properties'].get('iso_a2') == cc]
    key = GROUP_BY.get(cc, 'name')

    groups = {}
    for f in feats:
        k = f['properties'].get(key) or f['properties'].get('name')
        if not k: continue
        groups.setdefault(k, []).append(shape(f['geometry']).buffer(0))
    dissolved = {k: unary_union(v) for k, v in groups.items()}

    # Drop overseas fragments before framing: keep only what sits near the
    # largest piece, or NL frames on the Caribbean and GB on Gibraltar.
    whole = unary_union(list(dissolved.values()))
    parts = list(whole.geoms) if whole.geom_type == 'MultiPolygon' else [whole]
    main = max(parts, key=lambda p: p.area)
    mb = main.bounds
    pad = max(mb[2]-mb[0], mb[3]-mb[1]) * 0.6 + 1.0
    near = (mb[0]-pad, mb[1]-pad, mb[2]+pad, mb[3]+pad)
    def inframe(g):
        b = g.bounds
        return b[0] < near[2] and b[2] > near[0] and b[1] < near[3] and b[3] > near[1]

    kept = {}
    for k, g in dissolved.items():
        gs = list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]
        gs = [p for p in gs if inframe(p)]
        if gs: kept[k] = unary_union(gs)
    if not kept: continue

    b = unary_union(list(kept.values())).bounds
    LO0, LA0, LO1, LA1 = b
    S = W / (LO1 - LO0); Y1 = merc(LA1)
    H = (Y1 - merc(LA0)) * S
    px = lambda lo, la: ((lo - LO0) * S, (Y1 - merc(la)) * S)
    tol = (LO1 - LO0) / W * 1.3          # simplify to roughly one output pixel

    regions = []
    for k, g in sorted(kept.items()):
        gs = g.simplify(tol, preserve_topology=True)
        polys = list(gs.geoms) if gs.geom_type == 'MultiPolygon' else [gs]
        parts_d, xs, ys = [], [], []
        for p in polys:
            if p.is_empty: continue
            for ring in [p.exterior]:
                pts = [px(x, y) for x, y in ring.coords]
                rx = [q[0] for q in pts]; ry = [q[1] for q in pts]
                if math.hypot(max(rx)-min(rx), max(ry)-min(ry)) < 2.0: continue
                xs += rx; ys += ry
                parts_d.append('M' + 'L'.join(f'{a:.1f} {c:.1f}' for a, c in pts) + 'Z')
        if not parts_d: continue
        regions.append({'k': k, 'd': ''.join(parts_d),
                        'b': [round(min(xs),1), round(min(ys),1),
                              round(max(xs)-min(xs),1), round(max(ys)-min(ys),1)]})

    # cities → region by containment, falling back to nearest region
    shp = {r['k']: kept[r['k']] for r in regions}
    pins = []
    for name, la, lo in cities:
        pt = Point(lo, la)
        hit = next((k for k, g in shp.items() if g.contains(pt)), None)
        if hit is None:
            hit = min(shp.items(), key=lambda kv: kv[1].distance(pt))[0]
        x, y = px(lo, la)
        pins.append({'n': name, 'r': hit, 'x': round(x,1), 'y': round(y,1)})

    # the projection window travels with the data, so the client can invert
    # a click back into lat/lng without re-deriving anything
    out[cc] = {'w': round(W,1), 'h': round(H,1),
               'bx': [round(LO0,6), round(LO1,6), round(LA0,6), round(LA1,6)],
               'regions': regions, 'pins': pins}
    print(f"{cc}: {len(regions)} regions, {len(pins)} cities, "
          f"{len(json.dumps(out[cc]))//1024} KB")

json.dump(out, open('geo2.json','w'), separators=(',',':'))
print('total', len(json.dumps(out))//1024, 'KB')
for cc, v in out.items():
    print(' ', cc, sorted({p['r'] for p in v['pins']}))
