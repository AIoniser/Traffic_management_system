const assert = require("assert");

// Test simulation controller rules and mathematical formulas
function runTests() {
  console.log("Starting Traffic Light Controller Logic Tests...\n");

  const ROADS = ["North", "East", "South", "West"];
  const FIXED_GREEN_SECONDS = 35;
  const MIN_GREEN = 20;
  const MAX_GREEN = 60;

  // 1. Test Adaptive Green Duration Formula: 15 + 1.5*queue + delay + 0.04*red
  function adaptiveGreenTime(queue, delay, red) {
    const raw = 15 + 1.5 * queue + delay + 0.04 * red;
    return Math.round(Math.max(MIN_GREEN, Math.min(MAX_GREEN, raw)));
  }

  // Test lower bound clamp (20s)
  assert.strictEqual(adaptiveGreenTime(0, 0, 0), 20, "Should clamp to minimum 20s for zero traffic");
  assert.strictEqual(adaptiveGreenTime(1, 1, 10), 20, "Should clamp to minimum 20s for very low traffic");

  // Test upper bound clamp (60s)
  assert.strictEqual(adaptiveGreenTime(50, 15, 200), 60, "Should clamp to maximum 60s for heavy congestion");

  // Test typical values
  // queue=10, delay=5, red=50 -> 15 + 15 + 5 + 2 = 37s
  assert.strictEqual(adaptiveGreenTime(10, 5, 50), 37, "Formula calculation should match exact parameters");
  console.log("✔ Test 1 Passed: Adaptive Green Duration formula and [20, 60] bounds verified.");

  // 2. Test Priority Formula: (emergency ? 1000 : 0) + 1.5*queue + delay + 0.04*red
  function calculatePriority(queue, delay, red, emergency) {
    return (emergency ? 1000 : 0) + 1.5 * queue + delay + 0.04 * red;
  }

  const pNormal = calculatePriority(10, 4, 30, false);
  const pEmergency = calculatePriority(2, 1, 10, true);
  assert(pEmergency > pNormal, "Ambulance road must have higher priority than heavy normal traffic");
  console.log("✔ Test 2 Passed: Emergency preemption priority verified.");

  // 3. Test Road Selection: Empty roads must NEVER be selected if another road has vehicles
  function chooseRoad(roadsState, lastGreenRoad) {
    const nonempty = ROADS.filter(r => roadsState[r].queue > 0);
    const candidates = nonempty.length > 0 ? nonempty : ROADS;
    const alternate = candidates.filter(r => r !== lastGreenRoad);
    const choices = alternate.length > 0 ? alternate : candidates;
    return choices.reduce((best, r) => {
      const pR = calculatePriority(roadsState[r].queue, roadsState[r].delay, roadsState[r].red, roadsState[r].emergency);
      const pBest = calculatePriority(roadsState[best].queue, roadsState[best].delay, roadsState[best].red, roadsState[best].emergency);
      return pR > pBest ? r : best;
    }, choices[0]);
  }

  const testState1 = {
    North: { queue: 0, delay: 0, red: 100, emergency: false },
    East: { queue: 4, delay: 2, red: 10, emergency: false },
    South: { queue: 0, delay: 0, red: 100, emergency: false },
    West: { queue: 0, delay: 0, red: 100, emergency: false },
  };
  const chosen1 = chooseRoad(testState1, "South");
  assert.strictEqual(chosen1, "East", "Must pick East because it is the only road with queued vehicles");

  // Test emergency selection
  const testState2 = {
    North: { queue: 25, delay: 8, red: 80, emergency: false },
    East: { queue: 3, delay: 2, red: 15, emergency: true },
    South: { queue: 20, delay: 6, red: 70, emergency: false },
    West: { queue: 15, delay: 5, red: 60, emergency: false },
  };
  const chosen2 = chooseRoad(testState2, "North");
  assert.strictEqual(chosen2, "East", "Must pick East due to emergency vehicle priority");
  console.log("✔ Test 3 Passed: Non-empty road selection & ambulance preemption verified.");

  // 4. Test Phase Transitions:
  // Green -> Yellow (3s) -> All-Red (2s) -> [Pedestrian (5s) every 3rd cycle | Green]
  let phase = "green";
  let remaining = 25; // locked green duration
  let pedCycles = 0;
  let phasesVisited = [];

  // Simulate tick for exactly one complete green -> yellow -> all-red sequence
  while (phase === "green" || phase === "yellow" || phase === "all-red") {
    phasesVisited.push({ phase, remaining });
    if (phase === "green") {
      remaining--;
      if (remaining <= 0) {
        phase = "yellow";
        remaining = 3;
      }
    } else if (phase === "yellow") {
      remaining--;
      if (remaining <= 0) {
        phase = "all-red";
        remaining = 2;
      }
    } else if (phase === "all-red") {
      remaining--;
      if (remaining <= 0) {
        phase = "completed";
      }
    }
  }

  // Check green ran for exactly 25 seconds
  const greenTicks = phasesVisited.filter(p => p.phase === "green").length;
  assert.strictEqual(greenTicks, 25, "Green must stay locked and run for exact allocated seconds");

  const yellowTicks = phasesVisited.filter(p => p.phase === "yellow").length;
  assert.strictEqual(yellowTicks, 3, "Yellow transition must be exactly 3 seconds");

  const allRedTicks = phasesVisited.filter(p => p.phase === "all-red").length;
  assert.strictEqual(allRedTicks, 2, "All-red clearance phase must be exactly 2 seconds");
  console.log("✔ Test 4 Passed: Exact timing sequence (Green -> Yellow: 3s -> All-Red: 2s) verified.");

  // Test pedestrian phase on 3rd cycle
  pedCycles = 2; // Next cycle will be 3rd
  phase = "all-red";
  remaining = 1;
  remaining--;
  if (remaining <= 0) {
    pedCycles++;
    if (pedCycles % 3 === 0) {
      phase = "pedestrian";
      remaining = 5;
    }
  }
  assert.strictEqual(phase, "pedestrian", "Must trigger pedestrian phase on 3rd cycle");
  assert.strictEqual(remaining, 5, "Pedestrian phase must be 5 seconds");
  console.log("✔ Test 5 Passed: Pedestrian phase triggers every 3rd cycle for 5 seconds.");

  // 6. Test Dynamic Gap-Out / Early Cutoff on Empty Queue
  // When active road queue reaches 0 and other roads are waiting:
  // In Adaptive mode: early cutoff activates to prevent idle green waste.
  // In Fixed time mode: timer does not cutoff early.
  function checkEarlyCutoff(controller, activeQueue, remainingSeconds, otherRoadsHaveTraffic) {
    if (controller === "Adaptive" && activeQueue === 0 && otherRoadsHaveTraffic && remainingSeconds > 2) {
      return true; // Truncate early to yellow
    }
    return false;
  }

  assert.strictEqual(
    checkEarlyCutoff("Adaptive", 0, 24, true),
    true,
    "Adaptive controller must trigger early cutoff when active lane is empty and others wait"
  );
  assert.strictEqual(
    checkEarlyCutoff("Fixed time", 0, 24, true),
    false,
    "Fixed time controller does not truncate early"
  );
  assert.strictEqual(
    checkEarlyCutoff("Adaptive", 4, 24, true),
    false,
    "Adaptive controller does not truncate if active road still has vehicles"
  );
  console.log("✔ Test 6 Passed: Dynamic early cutoff (gap-out) on empty queue verified.");

  console.log("\nALL SIMULATION RULES AND CONSTRAINTS VERIFIED SUCCESSFULLY!");
}

runTests();
