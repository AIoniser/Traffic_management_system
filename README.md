# Smart Adaptive Traffic Light System

Project Based Learning project for Manipal University Jaipur, Semester 5.

## Project purpose

This software simulation compares a fixed-time traffic signal with an adaptive traffic signal. The adaptive controller uses vehicle count, estimated count, headway delay, and red-light waiting time from the Kolkata traffic dataset to choose the next road and green duration.

## Run the project

1. Open `Traffic_Light_Prototype/index.html` in a web browser.
2. Select either **Adaptive controller** or **Fixed-time controller**.
3. Click **Start simulation**.
4. Observe automatic green, yellow, and red phases, queue lengths, and live metrics.

## Main project files

- `prepare_kolkata_data.py` creates cleaned dataset copies.
- `analyze_kolkata_data.py` creates traffic and GPS analysis charts.
- `traffic_signal_controller.py` creates transparent green-time recommendations.
- `build_prototype_data.py` exports cleaned records for the browser simulation.
- `run_experiments.py` compares both controllers across four traffic scenarios.
- `Traffic_Light_Prototype/` contains the browser simulation.
- `Evaluation_Outputs/` contains the experiment results and charts.

## Evaluation summary

The experiments run 20 repeatable simulations for each controller under light, medium, heavy, and uneven traffic. Both controllers receive the same generated arrivals for each run.

The adaptive controller reduced average waiting time under medium, heavy, and uneven demand. The largest improvement occurred in uneven traffic, where it gave more green time to the busiest approach. Fixed timing slightly reduced waiting time under light traffic because frequent adaptive phase changes carry a small transition cost.

## Important limitation

The Kolkata records describe a single observed intersection. The four-road simulation samples those observations to create realistic changing demand, so the four approaches represent a controlled simulation rather than four separately measured Kolkata roads.
