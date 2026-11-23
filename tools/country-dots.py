#!/usr/bin/env python3
"""Dense dot grids for countries, for the city zoom (globe/country-dots.json).

Input: Natural Earth country shapes as TopoJSON, from the world-atlas package (ISC):
    curl -sL https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json -o countries-50m.json
Run:
    python3 tools/country-dots.py countries-50m.json globe/country-dots.json

Each country gets a staggered (hexagonal) grid of [lat, lon] points inside its outline, ROWS rows
from its southern to its northern edge, so every country has about the same dot spacing on screen
once the zoom has fitted it to the screen. Only the outer ring of each part is used (no lakes).
"""
import json
import sys

COUNTRIES = {"nairobi": "Kenya", "cologne": "Germany"}
ROWS = 70


def decode_arcs(topo):
    sx, sy = topo["transform"]["scale"]
    tx, ty = topo["transform"]["translate"]
    arcs = []
    for arc in topo["arcs"]:
        x = y = 0
        points = []
        for dx, dy in arc:
            x += dx
            y += dy
            points.append((x * sx + tx, y * sy + ty))
        arcs.append(points)
    return arcs


def ring_points(arcs, ids):
    ring = []
    for i in ids:
        part = arcs[i] if i >= 0 else arcs[~i][::-1]
        ring.extend(part if not ring else part[1:])
    return ring


def inside(ring, lon, lat):
    hit = False
    for k in range(len(ring)):
        x1, y1 = ring[k]
        x2, y2 = ring[k - 1]
        if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def country_dots(topo, arcs, name):
    geom = next(g for g in topo["objects"]["countries"]["geometries"]
                if g.get("properties", {}).get("name") == name)
    parts = geom["arcs"] if geom["type"] == "MultiPolygon" else [geom["arcs"]]
    outers = [ring_points(arcs, part[0]) for part in parts]
    lons = [p[0] for r in outers for p in r]
    lats = [p[1] for r in outers for p in r]
    step = (max(lats) - min(lats)) / ROWS
    dots, row, lat = [], 0, min(lats)
    while lat <= max(lats):
        lon = min(lons) + (step / 2 if row % 2 else 0)
        while lon <= max(lons):
            if any(inside(r, lon, lat) for r in outers):
                dots.append([round(lat, 3), round(lon, 3)])
            lon += step
        lat += step * 0.866
        row += 1
    return {"country": name, "bounds": [min(lats), min(lons), max(lats), max(lons)], "dots": dots}


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: country-dots.py <countries-50m.json> <out.json>")
    with open(sys.argv[1]) as f:
        topo = json.load(f)
    arcs = decode_arcs(topo)
    out = {city: country_dots(topo, arcs, name) for city, name in COUNTRIES.items()}
    with open(sys.argv[2], "w") as f:
        json.dump(out, f, separators=(",", ":"))
    for city, data in out.items():
        print(city, data["country"], len(data["dots"]), "dots")


if __name__ == "__main__":
    main()
