"""A simple, explainable traffic-light decision method for the project.

The controller takes one traffic observation at a time and recommends a
green-light duration. It is intentionally rule-based so every decision can be
explained in the project demo. The source data is never modified.
"""

from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent
INPUT_FILE = PROJECT_DIR / "Derived_Data" / "kolkata_count_timing_clean.csv"
OUTPUT_DIR = PROJECT_DIR / "Decision_Outputs"

MIN_GREEN_SECONDS = 20
MAX_GREEN_SECONDS = 60


def traffic_level(count: float) -> str:
    """Turn a vehicle count into a label suitable for the prototype UI."""
    if count <= 5:
        return "low"
    if count <= 12:
        return "medium"
    return "high"


def recommend_green_time(
    vehicle_count: float, headway_delay: float, red_duration: float
) -> tuple[int, str]:
    """Recommend a fair, bounded green duration in seconds.

    The formula starts every phase with 15 seconds. It adds time for more
    waiting vehicles, longer observed delay, and time already spent at red.
    A 20–60 second boundary keeps the decision safe and understandable.
    """
    recommendation = 15 + (1.5 * vehicle_count) + headway_delay + (0.04 * red_duration)
    green_seconds = round(min(MAX_GREEN_SECONDS, max(MIN_GREEN_SECONDS, recommendation)))
    explanation = (
        f"{traffic_level(vehicle_count).title()} traffic: {vehicle_count:.0f} vehicles, "
        f"{headway_delay:.0f}s delay, {red_duration:.0f}s at red"
    )
    return green_seconds, explanation


def create_decisions(data: pd.DataFrame) -> pd.DataFrame:
    """Apply the controller to every historical Kolkata observation."""
    decision_data = data.copy()
    decision_data["recommended_green_seconds"], decision_data["decision_explanation"] = zip(
        *decision_data.apply(
            lambda row: recommend_green_time(
                row["Count"], row["HeadDelay"], row["rPhaseDuration"]
            ),
            axis=1,
        )
    )
    decision_data["traffic_level"] = decision_data["Count"].apply(traffic_level)
    decision_data["green_time_difference_seconds"] = (
        decision_data["recommended_green_seconds"] - decision_data["gPhaseDuration"]
    )
    return decision_data


def create_preview_chart(decisions: pd.DataFrame) -> None:
    """Show how traffic demand affects the controller's recommendation."""
    plt.style.use("seaborn-v0_8-whitegrid")
    plt.figure(figsize=(8, 5))
    points = plt.scatter(
        decisions["Count"],
        decisions["recommended_green_seconds"],
        c=decisions["HeadDelay"],
        cmap="YlOrRd",
        alpha=0.8,
    )
    plt.colorbar(points, label="Headway delay (seconds)")
    plt.title("Rule-Based Green-Time Recommendations")
    plt.xlabel("Waiting vehicle count")
    plt.ylabel("Recommended green time (seconds)")
    plt.ylim(MIN_GREEN_SECONDS - 2, MAX_GREEN_SECONDS + 2)
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / "green_time_recommendations_preview.png", dpi=180)
    plt.close()


def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    source_data = pd.read_csv(INPUT_FILE)
    decisions = create_decisions(source_data)
    decisions.to_csv(OUTPUT_DIR / "traffic_signal_recommendations.csv", index=False)
    create_preview_chart(decisions)

    print(f"Created {len(decisions)} signal recommendations.")
    print(
        "Recommended green-time range: "
        f"{decisions['recommended_green_seconds'].min()}–"
        f"{decisions['recommended_green_seconds'].max()} seconds"
    )


if __name__ == "__main__":
    main()
