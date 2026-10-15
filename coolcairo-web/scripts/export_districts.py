"""Export extra CoolCairo districts (and the Nasr City satellite basemap) for the web planner.

Uses only data committed in the CoolCairo repository, so it runs offline:
  data/sample_input/blocks_east_cairo.csv   every 90 m block of the east-Cairo model area
  data/osm/buildings_osm_2026-09-23.gpkg    OpenStreetMap footprints (ODbL)
  data/sample_input/nasr_city/sentinel2_summer_10m.tif   Sentinel-2 summer composite

The heat model is fitted once on the whole model area, so every district reuses the model block of
Nasr City's export/district.json (same coefficients, heat line and data sources). Blocks and
buildings go through CoolCairo's own export helpers, so the files follow district.json schema 1.

Building heights: OSM height / levels where tagged, else the block's mean height from Google Open
Buildings 2.5D (in the block table), else 5 storeys. Nasr City itself keeps its per-footprint heights.

Usage (from a CoolCairo checkout's analysis environment):
  uv run --project <CoolCairo>/analysis python scripts/export_districts.py <CoolCairo> src/assets
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

from coolcairo.export import _block_arrays, _building_arrays

BLOCK = 90.0
SIZE = 24
DEFAULT_HEIGHT_M = 16.0

# Top-left (north-west) block of each 24 x 24 window in the model-area grid (row 0 = north),
# chosen by scripts/README: the best-mapped buildings, the densest population, the most new growth.
DISTRICTS = {
    "heliopolis-edge": {"name": "Heliopolis edge", "row": 40, "col": 72,
                        "about": "North of Nasr City, toward Heliopolis: the best-mapped buildings in the model area."},
    "zeitoun": {"name": "El Zeitoun area", "row": 24, "col": 8,
                "about": "Dense older neighbourhoods in the west: about 440,000 residents, few buildings mapped in OSM."},
    "nozha-growth": {"name": "Eastern growth edge", "row": 28, "col": 112,
                     "about": "New building since 2016 on the desert edge near El Nozha El Gedida: 106 newly built blocks."},
}


def district_blocks(blocks: pd.DataFrame, r0: int, c0: int) -> pd.DataFrame:
    w = blocks[(blocks.row >= r0) & (blocks.row < r0 + SIZE) & (blocks.col >= c0) & (blocks.col < c0 + SIZE)].copy()
    w["row"] -= r0
    w["col"] -= c0
    return w.rename(columns={"built_2016": "built_first", "built_2023": "built_last"})


def district_buildings(osm: gpd.GeoDataFrame, w: pd.DataFrame, origin: tuple[float, float]) -> gpd.GeoDataFrame:
    ox, oy = origin
    span = SIZE * BLOCK
    inside = osm.cx[ox:ox + span, oy:oy + span].copy()
    c = inside.geometry.centroid
    inside = inside[(c.x >= ox) & (c.x < ox + span) & (c.y >= oy) & (c.y < oy + span)]
    # Fill untagged heights with the block mean (Open Buildings), then a default.
    c = inside.geometry.centroid
    col = ((c.x - ox) // BLOCK).astype(int)
    row_from_south = ((c.y - oy) // BLOCK).astype(int)
    block_h = w.set_index([SIZE - 1 - w.row, w.col]).mean_height_m
    fallback = [block_h.get((r, k), np.nan) for r, k in zip(row_from_south, col, strict=True)]
    h = inside.height_m.where(inside.height_source.str.startswith("osm"), np.nan)
    h = h.fillna(pd.Series(fallback, index=inside.index)).where(lambda v: v > 0).fillna(DEFAULT_HEIGHT_M)
    return inside.assign(height_m=h)


def growth_summary(w: pd.DataFrame) -> dict:
    area = BLOCK * BLOCK / 1e6
    return {
        "available": 1, "firstYear": 2016, "lastYear": 2023,
        "builtFirstKm2": float(w.built_first.clip(lower=0).sum() * area),
        "builtLastKm2": float(w.built_last.clip(lower=0).sum() * area),
        "newBlocks": int((w.growth_class == 3).sum()),
        "denserBlocks": int((w.growth_class == 2).sum()),
        "denserMin": 0.05,
        "source": "Google Open Buildings 2.5D Temporal (CC BY 4.0)",
    }


def basemap(tif: Path, nasr: dict, out: Path) -> None:
    """True-colour PNG of the Nasr City grid from the Sentinel-2 summer composite (north up)."""
    import rioxarray
    from PIL import Image

    da = rioxarray.open_rasterio(tif)
    span = nasr["cols"] * nasr["blockSize"]
    clip = da.rio.clip_box(nasr["originX"], nasr["originY"], nasr["originX"] + span, nasr["originY"] + span)
    names = list(clip.attrs["long_name"])  # B02 B03 B04 B08 B11 B12, reflectance 0..1
    idx = [names.index(b) for b in ("B04", "B03", "B02")]
    rgb = np.stack([clip.isel(band=i).values.astype("float32") for i in idx], axis=-1)
    lo, hi = np.nanpercentile(rgb, [1, 99.5])  # gentle contrast stretch
    img = np.clip((rgb - lo) / (hi - lo), 0, 1) ** 0.9
    Image.fromarray((np.nan_to_num(img) * 255).astype("uint8")).resize((864, 864), Image.LANCZOS).save(out, quality=82)
    print(f"basemap {out.name}: {rgb.shape[1]}x{rgb.shape[0]} px from {tif.name}, bands {idx}")


def main(root: Path, assets: Path) -> None:
    nasr = json.loads((assets / "district.json").read_text())
    blocks = pd.read_csv(root / "data/sample_input/blocks_east_cairo.csv")
    osm = gpd.read_file(root / "data/osm/buildings_osm_2026-09-23.gpkg")
    out_dir = assets / "districts"
    out_dir.mkdir(exist_ok=True)
    for key, spec in DISTRICTS.items():
        w = district_blocks(blocks, spec["row"], spec["col"])
        origin = (float(w.x.min() - BLOCK / 2), float(w.y.min() - BLOCK / 2))
        bld = district_buildings(osm, w, origin)
        payload = {
            "schemaVersion": 1, "name": spec["name"], "about": spec["about"], "crs": nasr["crs"],
            "originX": origin[0], "originY": origin[1], "blockSize": BLOCK, "rows": SIZE, "cols": SIZE,
            "blocks": _block_arrays(w, SIZE, SIZE),
            "buildings": _building_arrays(bld, origin, BLOCK, SIZE, SIZE),
            "model": nasr["model"], "provenance": nasr.get("provenance", {}), "sources": nasr.get("sources", []),
            "hyperspectral": nasr.get("hyperspectral", {"available": 0}), "growth": growth_summary(w),
            "heightNote": "OSM heights where tagged, else block mean from Google Open Buildings 2.5D",
        }
        (out_dir / f"{key}.json").write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        valid = w.lst_c.notna().sum()
        print(f"{key}: {valid} blocks with LST, {payload['buildings']['count']} buildings, "
              f"{w.population.clip(lower=0).sum():,.0f} residents")
    tif = root / "data/sample_input/nasr_city/sentinel2_summer_10m.tif"
    if tif.exists():
        basemap(tif, nasr, assets / "nasr_city_sentinel2.jpg")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
