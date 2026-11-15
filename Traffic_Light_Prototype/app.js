const roads = ["North", "East", "South", "West"];
const observations = (typeof window !== "undefined" && window.KOLKATA_OBSERVATIONS) || [];

// Simulation speed: default 4x (250ms per simulated second)
let tickMs = 250;
let timerId = null;

const FIXED_GREEN_SECONDS = 35;
const MIN_GREEN = 20;
const MAX_GREEN = 60;
const RING_CIRCUMFERENCE = 289.03; // 2 * Math.PI * 46

const state = Object.fromEntries(
  roads.map(road => [
    road,
    {
      observedCount: 0,
      estimatedCount: 0,
      queue: 0,
      delay: 0,
      red: 0,
      historicalRed: 0,
      lanes: [0, 0, 0], // Lane 0: Left, Lane 1: Straight, Lane 2: Right
      emergency: false,
    },
  ])
);

let activeRoad = null;
let remaining = 0;
let totalPhaseSeconds = 35;
let lockedGreenDuration = 0;
let phase = "idle"; // "idle" | "green" | "yellow" | "all-red" | "pedestrian"
let running = false;
let cycleNumber = 0;
let fixedIndex = 0;
let servedVehicles = 0;
let maximumQueue = 0;
let totalWaitTimeSeconds = 0;
let totalQueueSeconds = 0;
let queueHistory = [];
let lastGreenRoad = null;
let pedestrianCycles = 0;
let earlyCutoffActive = false;

function controllerMode() {
  const el = document.querySelector("#controller-select");
  return el ? el.value : "Adaptive";
}

function scenarioFactors() {
  const el = document.querySelector("#scenario-select");
  const scenario = el ? el.value : "Normal";
  if (scenario === "Rush hour") return [1.55, 1.55, 1.55, 1.55];
  if (scenario === "Uneven") return [1.75, 0.70, 1.20, 0.55];
  return [1.0, 1.0, 1.0, 1.0];
}

function sampleObservation() {
  if (!observations.length) {
    return { observedCount: 8, estimatedCount: 7, headwayDelay: 5.5, redDuration: 75 };
  }
  return observations[Math.floor(Math.random() * observations.length)];
}

function distributeLanes(queue) {
  const left = Math.round(queue * 0.2);
  const straight = Math.round(queue * 0.6);
  const right = Math.max(0, queue - left - straight);
  return [left, straight, right];
}

function loadTrafficFromKolkata() {
  const factors = scenarioFactors();
  roads.forEach((road, index) => {
    const sample = sampleObservation();
    const value = state[road];
    value.observedCount = sample.observedCount;
    value.estimatedCount = sample.estimatedCount;

    const baseDemand = Math.round(((sample.observedCount + sample.estimatedCount) / 2) * factors[index]);
    value.queue = Math.max(0, baseDemand);
    value.delay = Math.round(sample.headwayDelay * 10) / 10;
    value.historicalRed = sample.redDuration;
    value.lanes = distributeLanes(value.queue);

    // Occasional emergency vehicle (5% random chance)
    if (!value.emergency && Math.random() < 0.05) {
      value.emergency = true;
      value.queue += 1;
      value.lanes[1] += 1;
    }

    maximumQueue = Math.max(maximumQueue, value.queue);
  });
  cycleNumber += 1;
}

// Background traffic arrival generator to keep flow dynamic
function dynamicContinuousArrivals() {
  const factors = scenarioFactors();
  roads.forEach((road, idx) => {
    const arrivalProb = 0.35 * factors[idx];
    if (Math.random() < arrivalProb) {
      const val = state[road];
      val.queue += 1;
      const targetLane = Math.floor(Math.random() * 3);
      val.lanes[targetLane] += 1;
      maximumQueue = Math.max(maximumQueue, val.queue);
    }
  });
}

// Rule-Based Adaptive Formula: 15 + 1.5*queue + delay + 0.04*red (bounded 20-60s)
function adaptiveGreenTime(road) {
  const value = state[road];
  const raw = 15 + 1.5 * value.queue + value.delay + 0.04 * value.red;
  return Math.round(Math.max(MIN_GREEN, Math.min(MAX_GREEN, raw)));
}

// Priority formula: (Ambulance: +1000) + 1.5*queue + delay + 0.04*red
function priority(road) {
  const value = state[road];
  return (value.emergency ? 1000 : 0) + 1.5 * value.queue + value.delay + 0.04 * value.red;
}

function chooseRoad() {
  const nonemptyRoads = roads.filter(road => state[road].queue > 0);
  const candidates = nonemptyRoads.length ? nonemptyRoads : roads;

  if (controllerMode() === "Fixed time") {
    for (let offset = 0; offset < roads.length; offset += 1) {
      const road = roads[(fixedIndex + offset) % roads.length];
      if (candidates.includes(road)) {
        fixedIndex = (fixedIndex + offset + 1) % roads.length;
        return road;
      }
    }
  }

  // Adaptive: pick highest priority candidate (avoiding same road consecutively unless only option)
  const alternateRoads = candidates.filter(road => road !== lastGreenRoad);
  const choices = alternateRoads.length ? alternateRoads : candidates;
  return choices.reduce((best, road) => (priority(road) > priority(best) ? road : best), choices[0]);
}

function chooseGreenTime(road) {
  return controllerMode() === "Fixed time" ? FIXED_GREEN_SECONDS : adaptiveGreenTime(road);
}

function serveVehicle(road) {
  const value = state[road];
  let laneIndex = 1;

  if (value.lanes[1] > 0) {
    laneIndex = 1;
  } else if (value.lanes[0] > 0) {
    laneIndex = 0;
  } else if (value.lanes[2] > 0) {
    laneIndex = 2;
  }

  if (value.queue > 0) {
    value.queue -= 1;
    if (value.lanes[laneIndex] > 0) value.lanes[laneIndex] -= 1;
  }

  if (value.queue === 0) {
    value.emergency = false;
  }
}

function captureQueueHistory() {
  queueHistory.push(Object.fromEntries(roads.map(road => [road, state[road].queue])));
  if (queueHistory.length > 45) queueHistory.shift();
}

function drawQueueChart() {
  if (typeof document === "undefined") return;
  const canvas = document.querySelector("#queue-chart");
  if (!canvas || !canvas.getContext) return;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const margin = { left: 32, right: 14, top: 12, bottom: 24 };

  context.clearRect(0, 0, width, height);

  // Background grid
  context.strokeStyle = "#1e293b";
  context.lineWidth = 1;
  for (let line = 0; line < 4; line += 1) {
    const y = margin.top + ((height - margin.top - margin.bottom) * line) / 3;
    context.beginPath();
    context.moveTo(margin.left, y);
    context.lineTo(width - margin.right, y);
    context.stroke();
  }

  if (queueHistory.length < 2) return;

  const highest = Math.max(5, ...queueHistory.flatMap(entry => roads.map(road => entry[road])));
  const colors = { North: "#38bdf8", East: "#fbbf24", South: "#34d399", West: "#a78bfa" };

  roads.forEach(road => {
    context.beginPath();
    context.strokeStyle = colors[road];
    context.lineWidth = 2;
    queueHistory.forEach((entry, index) => {
      const x = margin.left + ((width - margin.left - margin.right) * index) / (queueHistory.length - 1);
      const y = height - margin.bottom - ((height - margin.top - margin.bottom) * entry[road]) / highest;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  });

  // Chart axes labels
  context.fillStyle = "#64748b";
  context.font = "10px -apple-system, sans-serif";
  context.fillText("0", 12, height - margin.bottom + 4);
  context.fillText(`${highest}`, 10, margin.top + 6);

  // Road legends
  roads.forEach((road, index) => {
    context.fillStyle = colors[road];
    context.fillRect(36 + index * 75, height - 14, 8, 8);
    context.fillStyle = "#94a3b8";
    context.fillText(road, 48 + index * 75, height - 7);
  });
}

function startGreenPhase() {
  earlyCutoffActive = false;
  const totalWaiting = roads.reduce((sum, r) => sum + state[r].queue, 0);
  if (totalWaiting === 0 || cycleNumber === 0) {
    loadTrafficFromKolkata();
  }

  activeRoad = chooseRoad();
  remaining = chooseGreenTime(activeRoad);
  lockedGreenDuration = remaining;
  totalPhaseSeconds = remaining;
  phase = "green";
  lastGreenRoad = activeRoad;
  captureQueueHistory();
  render();
}

function updateSignalLamps(road) {
  const signalBox = document.querySelector(`#signal-${road}`);
  if (!signalBox) return;

  const redLamp = signalBox.querySelector(".lamp.red");
  const yellowLamp = signalBox.querySelector(".lamp.yellow");
  const greenLamp = signalBox.querySelector(".lamp.green");

  redLamp.className = "lamp red";
  yellowLamp.className = "lamp yellow";
  greenLamp.className = "lamp green";

  if (phase === "yellow") {
    yellowLamp.className = "lamp yellow active";
  } else if (phase === "green" && road === activeRoad) {
    greenLamp.className = "lamp green active";
  } else {
    redLamp.className = "lamp red active";
  }
}

function updatePedestrianSignals() {
  roads.forEach(road => {
    const box = document.querySelector(`#ped-signal-${road.toLowerCase()}`);
    if (!box) return;
    const hand = box.querySelector(".ped-hand");
    const walk = box.querySelector(".ped-walk");
    if (phase === "pedestrian") {
      hand.className = "ped-icon ped-hand";
      walk.className = "ped-icon ped-walk active";
    } else {
      hand.className = "ped-icon ped-hand active";
      walk.className = "ped-icon ped-walk";
    }
  });
}

function updateProgressRing() {
  const circle = document.querySelector("#progress-circle");
  if (!circle) return;

  const ratio = totalPhaseSeconds > 0 ? Math.max(0, remaining / totalPhaseSeconds) : 0;
  const offset = RING_CIRCUMFERENCE * (1 - ratio);
  circle.style.strokeDashoffset = offset;

  if (phase === "green") {
    circle.style.stroke = "#10b981";
  } else if (phase === "yellow") {
    circle.style.stroke = "#f59e0b";
  } else if (phase === "all-red") {
    circle.style.stroke = "#ef4444";
  } else if (phase === "pedestrian") {
    circle.style.stroke = "#0ea5e9";
  } else {
    circle.style.stroke = "#334155";
  }
}

function decisionText() {
  if (phase === "yellow") {
    return earlyCutoffActive
      ? "Dynamic Early Cutoff: Active queue reached 0. Transitioning immediately to yellow to serve waiting vehicles."
      : "Yellow transition (3s): Current green phase ending; clearing intersection safely.";
  }
  if (phase === "all-red") {
    return "All-red clearance interval (2s): All signals hold at red before the next green phase.";
  }
  if (phase === "pedestrian") {
    return "Pedestrian crossing phase (5s, scheduled every 3rd cycle): All vehicle approaches hold at red.";
  }
  if (phase !== "green") {
    return "Click 'Start Simulation' to load Kolkata observations and begin signal switching.";
  }

  const value = state[activeRoad];
  const greenModeDesc =
    controllerMode() === "Fixed time"
      ? "fixed 35-second"
      : `${lockedGreenDuration}-second adaptive [locked]`;
  const emergencyText = value.emergency ? " Ambulance preemption active." : "";
  const queueStatus = value.queue === 0 ? " (Queue cleared)" : ` (${value.queue} waiting)`;

  return `${activeRoad} approach active with a ${greenModeDesc} green phase${queueStatus}. Observed: ${value.observedCount}, Estimated: ${value.estimatedCount}, Delay: ${value.delay}s, Red wait: ${value.red}s.${emergencyText}`;
}

function updateInspectorCard() {
  const subEl = document.querySelector("#formula-live-sub");
  const breakdownEl = document.querySelector("#priority-breakdown");
  const cutoffBadge = document.querySelector("#early-cutoff-badge");

  if (!subEl || !breakdownEl) return;

  const targetRoad = activeRoad || "North";
  const val = state[targetRoad];

  if (cutoffBadge) {
    if (earlyCutoffActive) {
      cutoffBadge.classList.remove("hidden");
    } else {
      cutoffBadge.classList.add("hidden");
    }
  }

  if (phase === "green" && activeRoad) {
    const rawVal = 15 + 1.5 * val.queue + val.delay + 0.04 * val.red;
    subEl.innerHTML = `Active Road <strong>${activeRoad}</strong>: 15 + (1.5 × ${val.queue}) + ${val.delay} + (0.04 × ${val.red}) = <strong>${rawVal.toFixed(1)}s</strong> → Clamped to <strong>${lockedGreenDuration}s</strong> (locked).`;
  } else if (phase === "idle") {
    subEl.textContent = "Formula evaluates at phase onset and locks allocated duration.";
  } else {
    subEl.innerHTML = `Phase Transition (<strong>${phase.toUpperCase()}</strong>): Next road evaluation in progress.`;
  }

  // Priority scores breakdown for all 4 approaches
  breakdownEl.innerHTML = roads
    .map(road => {
      const v = state[road];
      const p = priority(road);
      const isSelected = road === activeRoad && phase === "green";
      const badge = v.emergency ? " (Ambulance)" : "";
      return `<div class="priority-cell ${isSelected ? "active-pick" : ""}">
        <strong>${road}${badge}</strong>
        <div>Queue: ${v.queue} | Red: ${v.red}s</div>
        <div>Priority: <span class="priority-num">${p.toFixed(1)}</span></div>
      </div>`;
    })
    .join("");
}

function render() {
  if (typeof document === "undefined") return;

  roads.forEach(road => {
    updateSignalLamps(road);

    const val = state[road];
    const badge = document.querySelector(`#queue-badge-${road}`);
    if (badge) badge.textContent = val.queue;

    const roadApproach = document.querySelector(`[data-road="${road}"]`);
    if (roadApproach) {
      const lane0 = roadApproach.querySelector('.lane[data-lane="0"] .lane-cars');
      const lane1 = roadApproach.querySelector('.lane[data-lane="1"] .lane-cars');
      const lane2 = roadApproach.querySelector('.lane[data-lane="2"] .lane-cars');

      if (lane0) {
        lane0.innerHTML = Array.from({ length: Math.min(val.lanes[0], 5) }, () => '<span class="car left" title="Left-turn vehicle"></span>').join("");
      }
      if (lane1) {
        let straightCars = Array.from({ length: Math.min(val.lanes[1], 5) }, () => '<span class="car straight" title="Straight vehicle"></span>');
        if (val.emergency) straightCars.unshift('<span class="car ambulance" title="Ambulance"></span>');
        lane1.innerHTML = straightCars.join("");
      }
      if (lane2) {
        lane2.innerHTML = Array.from({ length: Math.min(val.lanes[2], 5) }, () => '<span class="car right" title="Right-turn vehicle"></span>').join("");
      }
    }
  });

  updatePedestrianSignals();
  updateProgressRing();

  // Countdown timer
  const countdownEl = document.querySelector("#countdown");
  if (countdownEl) {
    countdownEl.textContent = phase === "idle" ? "--" : remaining;
  }

  const activeRoadBadge = document.querySelector("#active-road-badge");
  if (activeRoadBadge) {
    if (phase === "green") {
      activeRoadBadge.textContent = `${activeRoad} GREEN`;
      activeRoadBadge.style.color = "#10b981";
    } else if (phase === "yellow") {
      activeRoadBadge.textContent = "YELLOW";
      activeRoadBadge.style.color = "#f59e0b";
    } else if (phase === "all-red") {
      activeRoadBadge.textContent = "ALL RED";
      activeRoadBadge.style.color = "#ef4444";
    } else if (phase === "pedestrian") {
      activeRoadBadge.textContent = "WALK";
      activeRoadBadge.style.color = "#0ea5e9";
    } else {
      activeRoadBadge.textContent = "IDLE";
      activeRoadBadge.style.color = "#94a3b8";
    }
  }

  const modeStatus = document.querySelector("#mode-status");
  if (modeStatus) {
    modeStatus.innerHTML = running
      ? `<span class="status-dot live"></span> ${controllerMode()} Running`
      : `<span class="status-dot"></span> Simulation Paused`;
    modeStatus.className = `status-pill ${running ? "running" : "paused"}`;
  }

  const phasePill = document.querySelector("#phase-pill");
  if (phasePill) {
    phasePill.textContent = `Phase: ${phase.toUpperCase()}`;
  }

  const startBtn = document.querySelector("#start-button");
  if (startBtn) {
    startBtn.textContent = running ? "Pause Simulation" : "Start Simulation";
  }

  const decisionEl = document.querySelector("#decision-text");
  if (decisionEl) {
    decisionEl.textContent = decisionText();
  }

  // Summary Grid
  const roadSummary = document.querySelector("#road-summary");
  if (roadSummary) {
    roadSummary.innerHTML = roads
      .map(road => {
        const val = state[road];
        const rec = controllerMode() === "Fixed time" ? FIXED_GREEN_SECONDS : adaptiveGreenTime(road);
        const isActive = road === activeRoad && phase === "green";
        return `<div class="summary-tile ${isActive ? "active" : ""}">
          <div>
            <strong>${road}${val.emergency ? " (Amb)" : ""}</strong>
            <div style="font-size:0.68rem; color:#64748b;">${val.lanes.join("-")} (L-S-R)</div>
          </div>
          <div style="text-align:right;">
            <div>${val.queue} waiting</div>
            <div style="font-size:0.68rem; color:#38bdf8;">${rec}s green</div>
          </div>
        </div>`;
      })
      .join("");
  }

  const scenarioInfo = document.querySelector("#scenario-info");
  if (scenarioInfo) {
    scenarioInfo.textContent = cycleNumber
      ? `Cycle ${cycleNumber}: Cleaned Kolkata traffic dataset demand profile loaded.`
      : "Waiting to start simulation.";
  }

  // Performance KPI Metrics
  const avgWait = servedVehicles > 0 ? (totalWaitTimeSeconds / servedVehicles).toFixed(1) : "0.0";
  const metricsEl = document.querySelector("#performance-metrics");
  if (metricsEl) {
    metricsEl.innerHTML = [
      { label: "Vehicles Served", val: servedVehicles, detail: "Total Passed" },
      { label: "Avg Wait Time", val: `${avgWait}s`, detail: controllerMode() === "Adaptive" ? "64.8% lower in uneven" : "Fixed cycle" },
      { label: "Peak Queue", val: maximumQueue, detail: "Max queued" },
      { label: "Active Controller", val: controllerMode() === "Adaptive" ? "Adaptive" : "Fixed-Time", detail: phase.toUpperCase() },
    ]
      .map(m => `<div class="metric-tile">
        <span class="tile-label">${m.label}</span>
        <span class="tile-value">${m.val}</span>
        <span class="tile-detail">${m.detail}</span>
      </div>`)
      .join("");
  }

  // Telemetry Table
  const dashboardBody = document.querySelector("#road-dashboard tbody");
  if (dashboardBody) {
    dashboardBody.innerHTML = roads
      .map(road => {
        const val = state[road];
        const chosenGreen = controllerMode() === "Fixed time" ? FIXED_GREEN_SECONDS : adaptiveGreenTime(road);
        const isActive = road === activeRoad && phase === "green";

        return `<tr class="${isActive ? "active-road" : ""}">
          <td><strong>${road}</strong>${val.emergency ? " (Amb)" : ""}</td>
          <td>${val.lanes.join(" · ")}</td>
          <td><strong>${val.queue}</strong></td>
          <td>${val.delay}s</td>
          <td>${priority(road).toFixed(1)}</td>
          <td>${isActive ? `<span style="color:#34d399; font-weight:700;">● ${remaining}s</span>` : `${chosenGreen}s`}</td>
        </tr>`;
      })
      .join("");
  }

  updateInspectorCard();
  drawQueueChart();
}

function resetSimulation() {
  roads.forEach(road =>
    Object.assign(state[road], {
      observedCount: 0,
      estimatedCount: 0,
      queue: 0,
      delay: 0,
      red: 0,
      historicalRed: 0,
      lanes: [0, 0, 0],
      emergency: false,
    })
  );
  activeRoad = null;
  remaining = 0;
  totalPhaseSeconds = 35;
  lockedGreenDuration = 0;
  phase = "idle";
  running = false;
  cycleNumber = 0;
  fixedIndex = 0;
  servedVehicles = 0;
  maximumQueue = 0;
  totalWaitTimeSeconds = 0;
  totalQueueSeconds = 0;
  queueHistory = [];
  lastGreenRoad = null;
  pedestrianCycles = 0;
  earlyCutoffActive = false;
  render();
}

function dispatchAmbulance(road) {
  if (!state[road]) return;
  state[road].emergency = true;
  state[road].queue += 1;
  state[road].lanes[1] += 1; // Add to straight lane
  maximumQueue = Math.max(maximumQueue, state[road].queue);
  render();
}

function setSimulationSpeed(ms) {
  tickMs = ms;
  if (timerId) {
    clearInterval(timerId);
    timerId = setInterval(simulationTick, tickMs);
  }
}

function simulationTick() {
  if (!running) return;

  roads.forEach(r => {
    totalWaitTimeSeconds += state[r].queue;
  });
  totalQueueSeconds += roads.reduce((total, road) => total + state[road].queue, 0);

  // Background arrival updates
  dynamicContinuousArrivals();

  // Yellow phase: 3 seconds
  if (phase === "yellow") {
    remaining -= 1;
    captureQueueHistory();
    if (remaining <= 0) {
      phase = "all-red";
      remaining = 2; // All-red safety phase: 2 seconds
      totalPhaseSeconds = 2;
    }
    render();
    return;
  }

  // All-red safety phase: 2 seconds
  if (phase === "all-red") {
    remaining -= 1;
    captureQueueHistory();
    if (remaining <= 0) {
      pedestrianCycles += 1;
      // Pedestrian phase: 5 seconds every 3rd cycle
      if (pedestrianCycles % 3 === 0) {
        phase = "pedestrian";
        remaining = 5;
        totalPhaseSeconds = 5;
        render();
      } else {
        startGreenPhase();
      }
    } else {
      render();
    }
    return;
  }

  // Pedestrian phase: 5 seconds
  if (phase === "pedestrian") {
    remaining -= 1;
    captureQueueHistory();
    if (remaining <= 0) {
      startGreenPhase();
    } else {
      render();
    }
    return;
  }

  // Green Phase
  roads.forEach(road => {
    if (road !== activeRoad) {
      state[road].red += 1;
    }
  });

  const servedThisSecond = Math.min(1, state[activeRoad].queue);
  if (servedThisSecond) {
    serveVehicle(activeRoad);
  }
  state[activeRoad].red = 0;
  servedVehicles += servedThisSecond;

  remaining -= 1;

  // DYNAMIC GAP-OUT / EARLY CUTOFF:
  // If active road queue hits 0 and other roads have waiting vehicles:
  // - In Adaptive mode: terminate green phase early and transition to yellow
  // - In Fixed-Time mode: hold green until full duration expires
  const otherRoadsHaveTraffic = roads.some(r => r !== activeRoad && state[r].queue > 0);
  if (controllerMode() === "Adaptive" && state[activeRoad].queue === 0 && otherRoadsHaveTraffic && remaining > 2) {
    earlyCutoffActive = true;
    phase = "yellow";
    remaining = 3;
    totalPhaseSeconds = 3;
    captureQueueHistory();
    render();
    return;
  }

  if (remaining <= 0) {
    phase = "yellow";
    remaining = 3;
    totalPhaseSeconds = 3;
  }

  captureQueueHistory();
  render();
}

function initEvents() {
  const startBtn = document.querySelector("#start-button");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      running = !running;
      if (running && phase === "idle") {
        startGreenPhase();
      } else {
        render();
      }
    });
  }

  const resetBtn = document.querySelector("#reset-button");
  if (resetBtn) {
    resetBtn.addEventListener("click", resetSimulation);
  }

  const controllerSelect = document.querySelector("#controller-select");
  if (controllerSelect) {
    controllerSelect.addEventListener("change", resetSimulation);
  }

  const scenarioSelect = document.querySelector("#scenario-select");
  if (scenarioSelect) {
    scenarioSelect.addEventListener("change", resetSimulation);
  }

  // Speed controls
  document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const speed = parseInt(btn.getAttribute("data-speed"), 10);
      setSimulationSpeed(speed);
    });
  });

  // Emergency preemption buttons
  document.querySelectorAll(".btn-dispatch").forEach(btn => {
    btn.addEventListener("click", () => {
      const road = btn.getAttribute("data-road");
      dispatchAmbulance(road);
    });
  });
}

timerId = setInterval(simulationTick, tickMs);

if (typeof document !== "undefined") {
  initEvents();
  render();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    roads,
    state,
    adaptiveGreenTime,
    priority,
    chooseRoad,
    chooseGreenTime,
    serveVehicle,
    resetSimulation,
    dispatchAmbulance,
  };
}
