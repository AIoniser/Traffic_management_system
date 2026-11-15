"""Create beginner-friendly charts from the prepared Kolkata traffic data."""

from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent
DERIVED_DIR = PROJECT_DIR / "Derived_Data"
OUTPUT_DIR = PROJECT_DIR / "Analysis_Outputs"
RAW_GPS_DIR = PROJECT_DIR / "Data" / (
    "aceacedey-Kolkata_Data_PMC_paper_"
    "TrafficCountEstimationUsingCrowdSourcedTrajectory-a713896"
) / "GPS_raw_Trajectory_leader_follower" / "LFdata"

plt.style.use("seaborn-v0_8-whitegrid")


def save_chart(filename: str) -> None:
    """Save the active chart with consistent layout and resolution."""
    plt.tight_layout()
    plt.savefig(OUTPUT_DIR / filename, dpi=180, bbox_inches="tight")
    plt.close()
    print(f"Created {filename}")


def analyze_counts(counts: pd.DataFrame) -> None:
    counts["Dates"] = pd.to_datetime(counts["Dates"])
    daily = counts.groupby("Dates", as_index=False).agg(
        average_vehicle_count=("Count", "mean"),
        average_delay_seconds=("HeadDelay", "mean"),
    )
    daily.to_csv(OUTPUT_DIR / "daily_traffic_summary.csv", index=False)

    plt.figure(figsize=(10, 5))
    plt.plot(daily["Dates"], daily["average_vehicle_count"], marker="o", color="#176B87")
    plt.title("Average Vehicle Count by Observation Date")
    plt.xlabel("Observation date")
    plt.ylabel("Average vehicles per observation")
    plt.xticks(rotation=35)
    save_chart("01_average_vehicle_count_by_date.png")

    plt.figure(figsize=(8, 5))
    points = plt.scatter(
        counts["gPhaseDuration"], counts["Count"],
        c=counts["HeadDelay"], cmap="YlOrRd", alpha=0.8,
    )
    plt.colorbar(points, label="Headway delay (seconds)")
    plt.title("Vehicle Count and Green Signal Duration")
    plt.xlabel("Green signal duration (seconds)")
    plt.ylabel("Observed vehicle count")
    save_chart("02_count_vs_green_duration.png")

    plt.figure(figsize=(8, 5))
    plt.scatter(counts["Count"], counts["est_LinkCount"], color="#3A7D44", alpha=0.75)
    limit = max(counts["Count"].max(), counts["est_LinkCount"].max())
    plt.plot([0, limit], [0, limit], linestyle="--", color="black", label="Perfect estimate")
    plt.title("Observed Count Compared with Estimated Count")
    plt.xlabel("Observed vehicle count")
    plt.ylabel("Estimated vehicle count")
    plt.legend()
    save_chart("03_observed_vs_estimated_count.png")


def analyze_headways(headways: pd.DataFrame) -> None:
    plt.figure(figsize=(8, 5))
    plt.hist(headways["HeadDelay"].dropna(), bins=12, color="#B04A5A", edgecolor="white")
    plt.title("Distribution of Headway Delay")
    plt.xlabel("Headway delay (seconds)")
    plt.ylabel("Number of observations")
    save_chart("04_headway_delay_distribution.png")

    valid = headways.dropna(subset=["LinkCount", "est_LinkCount"])
    plt.figure(figsize=(8, 5))
    plt.scatter(valid["LinkCount"], valid["est_LinkCount"], color="#704C9F", alpha=0.8)
    limit = max(valid["LinkCount"].max(), valid["est_LinkCount"].max())
    plt.plot([0, limit], [0, limit], linestyle="--", color="black", label="Perfect estimate")
    plt.title("Observed and Estimated Vehicles in a Signal Phase")
    plt.xlabel("Observed vehicles (LinkCount)")
    plt.ylabel("Estimated vehicles")
    plt.legend()
    save_chart("05_headway_observed_vs_estimated.png")


def plot_first_gps_pair() -> None:
    files = {
        "Follower": RAW_GPS_DIR / "ds 1 F 20220108-114848.txt",
        "Leader": RAW_GPS_DIR / "ds 1 L 20220108 -114856.txt",
    }
    plt.figure(figsize=(7, 7))
    for role, path in files.items():
        data = pd.read_csv(path)
        plt.plot(data["longitude"], data["latitude"], linewidth=1.5, label=role)
        plt.scatter(data["longitude"].iloc[0], data["latitude"].iloc[0], s=35)
    plt.title("GPS Paths: Dataset 1 Leader and Follower")
    plt.xlabel("Longitude")
    plt.ylabel("Latitude")
    plt.legend()
    plt.axis("equal")
    save_chart("06_gps_path_dataset_1.png")


def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    counts = pd.read_csv(DERIVED_DIR / "kolkata_count_timing_clean.csv")
    headways = pd.read_csv(DERIVED_DIR / "kolkata_vehicle_headway_clean.csv")

    analyze_counts(counts)
    analyze_headways(headways)
    plot_first_gps_pair()


if __name__ == "__main__":
    main()
