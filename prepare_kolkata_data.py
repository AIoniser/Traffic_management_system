"""Create cleaned, derived copies of the Kolkata traffic datasets.

This script never edits the files in Data/. It writes its results to
Derived_Data/ so the original research data remains unchanged.
"""

from pathlib import Path
import csv

import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent
KOLKATA_DIR = PROJECT_DIR / "Data" / (
    "aceacedey-Kolkata_Data_PMC_paper_"
    "TrafficCountEstimationUsingCrowdSourcedTrajectory-a713896"
)
SOURCE_DIR = KOLKATA_DIR / "Intersection_SignalTiming_Traffic_Count"
GPS_DIR = KOLKATA_DIR / "GPS_raw_Trajectory_leader_follower" / "LFdata"
OUTPUT_DIR = PROJECT_DIR / "Derived_Data"


def clean_table(
    source_name: str,
    output_name: str,
    date_columns: list[str],
    date_format: str,
) -> None:
    """Remove the exported index column and standardize unavailable values."""
    table = pd.read_csv(SOURCE_DIR / source_name)
    table = table.drop(columns=[column for column in table if column.startswith("Unnamed")])
    table = table.replace({"NO": pd.NA, "NE": pd.NA})

    for column in date_columns:
        table[column] = pd.to_datetime(
            table[column], format=date_format, errors="coerce"
        )

    table.to_csv(OUTPUT_DIR / output_name, index=False)
    print(f"Created {output_name}: {len(table)} rows, {len(table.columns)} columns")


def create_gps_inventory() -> None:
    """Summarize every raw GPS recording without changing it."""
    records = []
    for path in sorted(GPS_DIR.glob("*.txt")):
        with path.open(newline="", encoding="utf-8", errors="replace") as file:
            rows = list(csv.DictReader(file))

        timestamps = pd.to_datetime(
            [row["date time"] for row in rows if row.get("date time")], errors="coerce"
        )
        latitudes = pd.to_numeric([row["latitude"] for row in rows], errors="coerce")
        longitudes = pd.to_numeric([row["longitude"] for row in rows], errors="coerce")
        records.append(
            {
                "file_name": path.name,
                "vehicle_role": "follower" if " F " in path.name else "leader",
                "record_count": len(rows),
                "first_timestamp": timestamps.min(),
                "last_timestamp": timestamps.max(),
                "duration_seconds": (timestamps.max() - timestamps.min()).total_seconds(),
                "latitude_min": latitudes.min(),
                "latitude_max": latitudes.max(),
                "longitude_min": longitudes.min(),
                "longitude_max": longitudes.max(),
            }
        )

    inventory = pd.DataFrame(records)
    inventory.to_csv(OUTPUT_DIR / "gps_trajectory_inventory.csv", index=False)
    print(f"Created gps_trajectory_inventory.csv: {len(inventory)} recordings")


def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    clean_table(
        "Processed_Count_and_timining_data.csv",
        "kolkata_count_timing_clean.csv",
        ["Dates"],
        "%d/%m/%Y",
    )
    clean_table(
        "Processed_Vehicle_Headway.csv",
        "kolkata_vehicle_headway_clean.csv",
        [
            "Dates", "Ob_Tr_dt", "Ob_Le_dt", "Ob_Fo_dt", "Est_Tr_dt",
            "Est_Le_dt", "Est_Fo_dt", "PhaseStart", "PhaseEnd",
        ],
        "ISO8601",
    )
    create_gps_inventory()


if __name__ == "__main__":
    main()
