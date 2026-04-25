#!/usr/bin/env python3
"""Convert GeoJSON FeatureCollections to Earth Engine upload CSVs."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def iter_property_keys(features: list[dict]) -> list[str]:
    keys: list[str] = []
    seen = set()
    for feature in features:
        for key in (feature.get("properties") or {}).keys():
            if key not in seen:
                seen.add(key)
                keys.append(key)
    return keys


def csv_value(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return value


def convert(path: Path, output: Path, overwrite: bool = False) -> tuple[int, list[str]]:
    if output.exists() and not overwrite:
        raise FileExistsError(f"{output} already exists; pass --overwrite to replace it")

    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)

    if data.get("type") != "FeatureCollection":
        raise ValueError(f"{path} is not a GeoJSON FeatureCollection")

    features = data.get("features") or []
    property_keys = iter_property_keys(features)
    fieldnames = [key for key in property_keys if key != ".geo"] + [".geo"]

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for feature in features:
            properties = feature.get("properties") or {}
            row = {key: csv_value(properties.get(key)) for key in property_keys if key != ".geo"}
            row[".geo"] = json.dumps(
                feature.get("geometry"),
                ensure_ascii=False,
                separators=(",", ":"),
            )
            writer.writerow(row)

    geometry_types = sorted({(feature.get("geometry") or {}).get("type", "null") for feature in features})
    return len(features), geometry_types


def default_output(path: Path) -> Path:
    return path.with_name(f"{path.stem}_gee_upload.csv")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert GeoJSON FeatureCollections to CSV files suitable for GEE table upload.",
    )
    parser.add_argument("geojson", nargs="+", type=Path, help="GeoJSON file(s) to convert")
    parser.add_argument("--output-dir", type=Path, help="Write all converted CSVs to this directory")
    parser.add_argument("--overwrite", action="store_true", help="Replace existing output CSVs")
    args = parser.parse_args()

    for path in args.geojson:
        output = (
            args.output_dir / f"{path.stem}_gee_upload.csv"
            if args.output_dir
            else default_output(path)
        )
        count, geometry_types = convert(path, output, overwrite=args.overwrite)
        print(f"{path} -> {output} ({count} features; geometry={','.join(geometry_types)})")


if __name__ == "__main__":
    main()
