# Smart Adaptive Traffic Light System Demo Script

## Opening

This project compares a fixed-time traffic signal with an adaptive signal that uses Kolkata traffic observations. The adaptive controller considers vehicle count, estimated vehicle count, delay, and time spent at red.

## Demonstrating the simulation

1. Open `Traffic_Light_Prototype/index.html`.
2. Select **Adaptive controller** and start the simulation.
3. Point out the road selected for green, its queue, and the decision text.
4. Wait for the yellow transition and show that the next road is selected automatically.
5. Reset the simulation, select **Fixed-time controller**, and start it.
6. Explain that fixed timing gives each road a 35-second green phase in turn, regardless of current demand.

## Explaining the result

The adaptive method improves performance when traffic is medium, heavy, or uneven. It reduces the queue on the road with the greatest need. Fixed timing remains useful under light traffic because a simple regular cycle avoids extra switching overhead.

## Closing

The project demonstrates how existing traffic observations can support automatic signal decisions. A future version could use live cameras or roadside sensors to replace the sampled dataset input.
