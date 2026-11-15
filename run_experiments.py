"""Evaluate fixed-time and adaptive traffic signals using Kolkata observations.

Each experiment creates four simulated approaches. Arrival rates, delay, and
red-phase conditions are sampled from the cleaned Kolkata count/timing table.
Both controllers receive exactly the same generated arrivals for each seed.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent
DATA_FILE = PROJECT_DIR / "Derived_Data" / "kolkata_count_timing_clean.csv"
OUTPUT_DIR = PROJECT_DIR / "Evaluation_Outputs"
ROADS = ("North", "East", "South", "West")
SIMULATION_SECONDS = 3600
TRANSITION_SECONDS = 3
FIXED_GREEN_SECONDS = 35
SERVICE_RATE_PER_SECOND = 0.65
REPETITIONS = 20

SCENARIOS = {
    "Light traffic": {"scale": 0.60, "uneven": None},
    "Medium traffic": {"scale": 1.00, "uneven": None},
    "Heavy traffic": {"scale": 1.55, "uneven": None},
    "Uneven traffic": {"scale": 1.00, "uneven": (1.75, 0.70, 1.20, 0.55)},
}


@dataclass
class RoadState:
    queue: deque[int]
    delay: float = 0.0
    red_seconds: int = 0
    served: int = 0
    total_wait: float = 0.0
    maximum_queue: int = 0


def load_observations() -> pd.DataFrame:
    data = pd.read_csv(DATA_FILE)
    return data[["Count", "HeadDelay", "est_LinkCount", "rPhaseDuration"]].copy()


def build_arrival_schedule(
    observations: pd.DataFrame, scenario: dict, seed: int
) -> tuple[dict[str, np.ndarray], dict[str, np.ndarray], dict[str, np.ndarray]]:
    """Create one common traffic input for both controllers."""
    rng = np.random.default_rng(seed)
    arrivals = {road: np.zeros(SIMULATION_SECONDS, dtype=int) for road in ROADS}
    delays = {road: np.zeros(SIMULATION_SECONDS, dtype=float) for road in ROADS}
    observed_counts = {road: np.zeros(SIMULATION_SECONDS, dtype=float) for road in ROADS}
    factors = scenario["uneven"] or (1.0, 1.0, 1.0, 1.0)

    for road, factor in zip(ROADS, factors):
        for start in range(0, SIMULATION_SECONDS, 30):
            row = observations.iloc[rng.integers(len(observations))]
            demand = (row["Count"] + row["est_LinkCount"]) / 2
            expected_arrivals = max(0.05, demand * scenario["scale"] * factor / 60)
            end = min(start + 30, SIMULATION_SECONDS)
            arrivals[road][start:end] = rng.poisson(expected_arrivals, end - start)
            delays[road][start:end] = row["HeadDelay"]
            observed_counts[road][start:end] = demand
    return arrivals, delays, observed_counts


def choose_adaptive_road(states: dict[str, RoadState]) -> str:
    def priority(road: str) -> float:
        state = states[road]
        return (1.5 * len(state.queue)) + state.delay + (0.04 * state.red_seconds)

    return max(ROADS, key=priority)


def adaptive_green_time(state: RoadState) -> int:
    seconds = 15 + (1.5 * len(state.queue)) + state.delay + (0.04 * state.red_seconds)
    return int(round(max(20, min(60, seconds))))


def run_controller(
    controller: str,
    arrivals: dict[str, np.ndarray],
    delays: dict[str, np.ndarray],
) -> dict[str, float]:
    states = {road: RoadState(deque()) for road in ROADS}
    active_road: str | None = None
    green_remaining = 0
    transition_remaining = 0
    fixed_index = 0
    service_credit = 0.0

    for second in range(SIMULATION_SECONDS):
        for road in ROADS:
            states[road].delay = float(delays[road][second])
            states[road].queue.extend([second] * int(arrivals[road][second]))
            states[road].maximum_queue = max(states[road].maximum_queue, len(states[road].queue))

        if transition_remaining > 0:
            transition_remaining -= 1
            for road in ROADS:
                states[road].red_seconds += 1
            if transition_remaining == 0:
                if controller == "Fixed time":
                    active_road = ROADS[fixed_index % len(ROADS)]
                    fixed_index += 1
                    green_remaining = FIXED_GREEN_SECONDS
                else:
                    active_road = choose_adaptive_road(states)
                    green_remaining = adaptive_green_time(states[active_road])
            continue

        if active_road is None:
            transition_remaining = TRANSITION_SECONDS
            continue

        for road in ROADS:
            if road != active_road:
                states[road].red_seconds += 1

        service_credit += SERVICE_RATE_PER_SECOND
        while service_credit >= 1 and states[active_road].queue:
            arrival_second = states[active_road].queue.popleft()
            states[active_road].served += 1
            states[active_road].total_wait += second - arrival_second
            service_credit -= 1

        green_remaining -= 1
        if green_remaining == 0:
            states[active_road].red_seconds = 0
            active_road = None
            transition_remaining = TRANSITION_SECONDS
            service_credit = 0.0

    served = sum(state.served for state in states.values())
    wait = sum(state.total_wait for state in states.values())
    throughputs = np.array([state.served for state in states.values()], dtype=float)
    fairness = (throughputs.sum() ** 2) / (len(throughputs) * np.square(throughputs).sum()) if served else 0
    return {
        "average_wait_seconds": wait / served if served else 0,
        "maximum_queue": max(state.maximum_queue for state in states.values()),
        "vehicles_served": served,
        "throughput_fairness": fairness,
    }


def build_charts(summary: pd.DataFrame) -> None:
    plt.style.use("seaborn-v0_8-whitegrid")
    metrics = [
        ("average_wait_seconds", "Average Waiting Time", "Seconds", "01_average_wait_time.png"),
        ("maximum_queue", "Maximum Queue Length", "Vehicles", "02_maximum_queue.png"),
        ("vehicles_served", "Vehicles Served", "Vehicles", "03_vehicles_served.png"),
        ("throughput_fairness", "Throughput Fairness", "Jain fairness index", "04_throughput_fairness.png"),
    ]
    for metric, title, ylabel, filename in metrics:
        pivot = summary.pivot(index="scenario", columns="controller", values=metric).reindex(SCENARIOS)
        ax = pivot.plot(kind="bar", figsize=(9, 5), color=["#627d98", "#168aad"])
        ax.set_title(title)
        ax.set_xlabel("Traffic scenario")
        ax.set_ylabel(ylabel)
        ax.tick_params(axis="x", rotation=0)
        ax.legend(title="Controller")
        plt.tight_layout()
        plt.savefig(OUTPUT_DIR / filename, dpi=180)
        plt.close()


def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)
    observations = load_observations()
    records = []
    for scenario_number, (scenario_name, scenario) in enumerate(SCENARIOS.items()):
        for repetition in range(REPETITIONS):
            arrivals, delays, _ = build_arrival_schedule(
                observations, scenario, seed=10_000 + (scenario_number * 100) + repetition
            )
            for controller in ("Fixed time", "Adaptive"):
                metrics = run_controller(controller, arrivals, delays)
                records.append({
                    "scenario": scenario_name,
                    "repetition": repetition + 1,
                    "controller": controller,
                    **metrics,
                })

    results = pd.DataFrame(records)
    summary = results.groupby(["scenario", "controller"], as_index=False).mean(numeric_only=True)
    results.to_csv(OUTPUT_DIR / "experiment_results.csv", index=False)
    summary.to_csv(OUTPUT_DIR / "scenario_summary.csv", index=False)
    build_charts(summary)

    print("Created experiment results for 160 simulations.")
    print(summary[["scenario", "controller", "average_wait_seconds", "maximum_queue", "vehicles_served", "throughput_fairness"]].round(2).to_string(index=False))


if __name__ == "__main__":
    main()
