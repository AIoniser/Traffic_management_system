"""Export the cleaned Kolkata observations for the standalone browser prototype."""

from pathlib import Path
import json

import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent
INPUT_FILE = PROJECT_DIR / "Derived_Data" / "kolkata_count_timing_clean.csv"
OUTPUT_FILE = PROJECT_DIR / "Traffic_Light_Prototype" / "kolkata_observations.js"


def main() -> None:
    data = pd.read_csv(INPUT_FILE)
    observations = []
    for _, row in data.iterrows():
        observations.append(
            {
                "observedCount": int(row["Count"]),
                "estimatedCount": round(float(row["est_LinkCount"]), 2),
                "headwayDelay": int(row["HeadDelay"]),
                "redDuration": int(row["rPhaseDuration"]),
                "sourceDate": str(row["Dates"]),
            }
        )

    OUTPUT_FILE.write_text(
        "// Generated from Derived_Data/kolkata_count_timing_clean.csv\n"
        f"window.KOLKATA_OBSERVATIONS = {json.dumps(observations)};\n",
        encoding="utf-8",
    )
    print(f"Exported {len(observations)} Kolkata observations for the prototype.")


if __name__ == "__main__":
    main()
