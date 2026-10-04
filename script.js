const tubeCanvas = document.getElementById("tubeCanvas");
const tubeCtx = tubeCanvas.getContext("2d");
const graphCanvas = document.getElementById("graphCanvas");
const graphCtx = graphCanvas.getContext("2d");

const voltage = document.getElementById("voltage");
const voltageDisplay = document.getElementById("voltageDisplay");
const currentDisplay = document.getElementById("currentDisplay");
const energyValue = document.getElementById("energyValue");
const statusBox = document.getElementById("status");
const peakInfo = document.getElementById("peakInfo");
const measurementsBody = document.getElementById("measurementsBody");

const gasSelect = document.getElementById("gasType");
const subtitleEl = document.getElementById("subtitle");
const atomLegendLabel = document.getElementById("atomLegendLabel");
const atomLegendDot = document.getElementById("atomLegendDot");
const peakSpacingValue = document.getElementById("peakSpacingValue");
const gasNameText1 = document.getElementById("gasNameText1");
const excitationEnergyText1 = document.getElementById("excitationEnergyText1");
const excitationEnergyText2 = document.getElementById("excitationEnergyText2");
const formulaDeltaU = document.getElementById("formulaDeltaU");
const formulaExc = document.getElementById("formulaExc");

const showTrails = document.getElementById("showTrails");
const showCollisions = document.getElementById("showCollisions");
const showEnergy = document.getElementById("showEnergy");

let U = 0;
const Ur = 0;
let temp = 180;
let current = 0;
let averageEnergy = 0;

let running = true;
let sweep = false;
let lastTime = performance.now();
let sampleTimer = 0;
let measurementNumber = 0;

// Variables pour le filtrage des points remarquables pendant le balayage
let sweepLastI = 0;
let sweepDirection = 0; // 1 = monte, -1 = descend
let lastRecordedU = -10;

let simTime = 0;
let electrons = [];
let atoms = [];
let collisions = [];
let graphData = [];
let measuredRows = [];

const GASES = {
  mercury: {
    label: "mercure",
    subtitle: "vapeur de mercure",
    excitation: 4.9,
    atomColor: "#cbcdda",
    atomStroke: "rgba(120,20,30,.25)"
  },
  sodium: {
    label: "sodium",
    subtitle: "vapeur de sodium",
    excitation: 2.1,
    atomColor: "#f2b705",
    atomStroke: "rgba(140,100,0,.3)"
  },
  argon: {
    label: "argon",
    subtitle: "vapeur d'argon",
    excitation: 11.55,
    atomColor: "#8f7bff",
    atomStroke: "rgba(70,40,160,.35)"
  },
  neon: {
    label: "néon",
    subtitle: "vapeur de néon",
    excitation: 18.7,
    atomColor: "#ff6d4d",
    atomStroke: "rgba(160,40,20,.35)"
  }
};

let currentGas = "mercury";
let HgExcitation = GASES[currentGas].excitation;
const maxVoltage = 50;

function tubeGeometry() {
  const w = tubeCanvas.clientWidth;
  const h = tubeCanvas.clientHeight;

  return {
    left: w * 0.09,
    right: w * 0.91,
    top: h * 0.20,
    bottom: h * 0.60,
    cathode: w * 0.16,
    grid: w * 0.39,
    anode: w * 0.84
  };
}

function resizeCanvas(canvas, ctx) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resizeAll() {
  resizeCanvas(tubeCanvas, tubeCtx);
  resizeCanvas(graphCanvas, graphCtx);
  drawTube();
  drawGraph();
}

window.addEventListener("resize", resizeAll);

function mercuryAtomCount() {
  return Math.round(24 + (temp - 100) * 0.10);
}

function createAtom() {
  const g = tubeGeometry();
  return {
    x: g.grid + 30 + Math.random() * (g.anode - g.grid - 60),
    y: g.top + 15 + Math.random() * (g.bottom - g.top - 30),
    vx: (Math.random() - 0.5) * 6,
    vy: (Math.random() - 0.5) * 6,
    excited: false,
    exciteUntil: 0
  };
}

function maintainAtoms() {
  const target = mercuryAtomCount();
  while (atoms.length < target) atoms.push(createAtom());
  if (atoms.length > target) atoms.length = target;
}

function updateAtomsAnimation(dt) {
  const g = tubeGeometry();
  const heat = 0.3 + Math.max(0, temp - 80) / 170 * 2.5;

  for (const a of atoms) {
    a.vx += (Math.random() - 0.5) * heat * dt * 12;
    a.vy += (Math.random() - 0.5) * heat * dt * 12;
    a.vx *= 0.985;
    a.vy *= 0.985;

    a.x += a.vx * dt * 10;
    a.y += a.vy * dt * 10;

    if (a.x < g.grid + 20 || a.x > g.anode - 20) a.vx *= -1;
    if (a.y < g.top + 10 || a.y > g.bottom - 10) a.vy *= -1;

    a.x = Math.min(Math.max(a.x, g.grid + 20), g.anode - 20);
    a.y = Math.min(Math.max(a.y, g.top + 10), g.bottom - 10);
  }
}

function theoreticalCurrent(u) {
  if (u <= 0) return 0;

  const density = Math.max(0.35, Math.min(1.7, Math.exp((temp - 180) / 95)));
  const damping = 0.13;

  let base = 0.25 + 0.17 * u;
  let oscillation = 0;

  const peakCount = Math.ceil(maxVoltage / HgExcitation) + 1;

  for (let n = 1; n <= peakCount; n++) {
    const peak = n * HgExcitation;
    const width = 1.65 + 0.012 * peak;
    const amplitude = 4.2 * Math.exp(-damping * (n - 1));
    oscillation += amplitude * Math.exp(-Math.pow((u - peak) / width, 2));
  }

  let loss = 0;
  for (let n = 1; n <= peakCount - 1; n++) {
    const valley = (n + 0.5) * HgExcitation;
    loss += 2.2 * Math.exp(-Math.pow((u - valley) / 1.6, 2));
  }

  const retardingFactor = Math.max(0.35, 1 - Ur * 0.045);
  return Math.max(0, (base + density * oscillation - loss) * retardingFactor);
}

class Electron {
  constructor() {
    const g = tubeGeometry();
    this.x = g.cathode + 8;
    this.y = g.top + 20 + Math.random() * (g.bottom - g.top - 40);
    this.energy = 0;
    this.speed = 45 + Math.random() * 25;
    this.age = Math.random() * 100;
    this.trail = [];
    this.lastCollision = -10;
    this.alive = true;
    this.collected = false;
  }

  reset() {
    const g = tubeGeometry();
    this.x = g.cathode + 8;
    this.y = g.top + 20 + Math.random() * (g.bottom - g.top - 40);
    this.energy = 0;
    this.speed = 45 + Math.random() * 25;
    this.trail = [];
    this.lastCollision = -10;
    this.alive = true;
    this.collected = false;
  }

  update(dt, time) {
    const g = tubeGeometry();
    const acceleration = 8 + U * 1.8;
    this.speed += acceleration * dt;

    const visualSpeed = this.speed * (0.7 + U / 25);
    this.energy += (U / 50) * 13 * dt;
    this.x += visualSpeed * dt;

    if (showTrails.checked) {
      this.trail.push({x: this.x, y: this.y});
      if (this.trail.length > 12) this.trail.shift();
    } else {
      this.trail.length = 0;
    }

    this.y += Math.sin(time * 0.003 + this.age) * 0.08;

    if (this.x > g.grid && this.x < g.anode - 10 && time - this.lastCollision > 130) {
      const collisionRadius = 11;
      for (const atom of atoms) {
        const dx = this.x - atom.x;
        const dy = this.y - atom.y;

        if (dx * dx + dy * dy < collisionRadius * collisionRadius) {
          if (this.energy >= HgExcitation) {
            const excess = this.energy - HgExcitation;
            const inelasticChance = Math.min(0.9, 0.35 + excess * 0.12);
            if (Math.random() < inelasticChance) {
              this.collide(time, atom);
            } else {
              this.elasticBounce(atom);
            }
          } else {
            this.elasticBounce(atom);
          }
          break;
        }
      }
    }

    if (this.x >= g.anode) {
      this.collected = true;
      this.alive = false;
    }

    if (this.x > g.right + 30) this.alive = false;
  }

  collide(time, atom) {
    const loss = Math.min(HgExcitation, this.energy);
    this.energy = Math.max(0, this.energy - loss);
    this.speed *= 0.55;
    this.y += (Math.random() - 0.5) * 10;
    this.lastCollision = time;

    if (atom) {
      atom.vx += (Math.random() - 0.5) * 5;
      atom.vy += (Math.random() - 0.5) * 5;
      atom.excited = true;
      atom.exciteUntil = time + 220;
    }

    if (showCollisions.checked) {
      collisions.push({
        x: atom ? atom.x : this.x,
        y: atom ? atom.y : this.y,
        life: 0,
        maxLife: 500
      });
    }
  }

  elasticBounce(atom) {
    this.y += (Math.random() - 0.5) * 6;
    atom.vx += (Math.random() - 0.5) * 1.5;
    atom.vy += (Math.random() - 0.5) * 1.5;
  }

  draw(ctx) {
    if (!this.alive) return;

    if (showTrails.checked && this.trail.length > 1) {
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (const p of this.trail) ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = "rgba(30, 115, 230, .24)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(this.x, this.y, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = "#1976e8";
    ctx.fill();

    if (showEnergy.checked) {
      ctx.font = "11px Arial";
      ctx.fillStyle = "#175bb0";
      ctx.fillText(this.energy.toFixed(1) + " eV", this.x + 7, this.y - 7);
    }
  }
}

function maintainElectrons() {
  const target = 28;
  while (electrons.length < target) electrons.push(new Electron());
  for (const e of electrons) {
    if (!e.alive) e.reset();
  }
}

// ----------------------------
// Dessin du Tube & Circuit électrique
// ----------------------------

function drawTube() {
  const w = tubeCanvas.clientWidth;
  const h = tubeCanvas.clientHeight;
  const g = tubeGeometry();

  tubeCtx.clearRect(0, 0, w, h);

  // Fond du Canvas
  tubeCtx.fillStyle = "#f8fafc";
  tubeCtx.fillRect(0, 0, w, h);

  // Corps du tube en verre
  tubeCtx.save();
  tubeCtx.beginPath();
  tubeCtx.roundRect(g.left, g.top, g.right - g.left, g.bottom - g.top, (g.bottom-g.top)/2);
  const gradient = tubeCtx.createLinearGradient(0, g.top, 0, g.bottom);
  gradient.addColorStop(0, "rgba(235,244,255,.9)");
  gradient.addColorStop(.5, "rgba(255,255,255,.97)");
  gradient.addColorStop(1, "rgba(220,237,255,.9)");
  tubeCtx.fillStyle = gradient;
  tubeCtx.fill();
  tubeCtx.strokeStyle = "#94a3b8";
  tubeCtx.lineWidth = 2;
  tubeCtx.stroke();
  tubeCtx.restore();

  // Électrodes C, G, A
  drawElectrode(g.cathode, g.top, g.bottom, "C");
  drawElectrode(g.anode, g.top, g.bottom, "A");

  // Grille
  tubeCtx.save();
  tubeCtx.fillStyle = "rgba(130,140,155,.12)";
  tubeCtx.fillRect(g.grid - 9, g.top + 5, 18, g.bottom - g.top - 10);
  tubeCtx.strokeStyle = "#697789";
  tubeCtx.lineWidth = 1;

  for (let x = g.grid - 9; x <= g.grid + 9; x += 6) {
    tubeCtx.beginPath();
    tubeCtx.moveTo(x, g.top + 5);
    tubeCtx.lineTo(x, g.bottom - 5);
    tubeCtx.stroke();
  }

  for (let y = g.top + 8; y <= g.bottom - 8; y += 7) {
    tubeCtx.beginPath();
    tubeCtx.moveTo(g.grid - 9, y);
    tubeCtx.lineTo(g.grid + 9, y);
    tubeCtx.stroke();
  }
  tubeCtx.restore();

  // Libellés C, G, A sous le tube
  tubeCtx.font = "bold 15px Arial";
  tubeCtx.fillStyle = "#1e293b";
  tubeCtx.textAlign = "center";
  tubeCtx.fillText("C (Cathode)", g.cathode, g.bottom + 22);
  tubeCtx.fillText("G (Grille)", g.grid, g.bottom + 22);
  tubeCtx.fillText("A (Anode)", g.anode, g.bottom + 22);

  // Atomes
  for (const a of atoms) {
    const excited = a.excited && simTime < a.exciteUntil;
    if (a.excited && simTime >= a.exciteUntil) a.excited = false;

    tubeCtx.beginPath();
    tubeCtx.arc(a.x, a.y, excited ? 6.6 : 5.2, 0, Math.PI * 2);
    tubeCtx.fillStyle = excited ? "#ffb020" : GASES[currentGas].atomColor;
    tubeCtx.fill();
    tubeCtx.strokeStyle = excited ? "rgba(160,90,0,.5)" : GASES[currentGas].atomStroke;
    tubeCtx.stroke();
  }

  // Collisions
  for (const c of collisions) {
    const alpha = Math.max(0, 1 - c.life / c.maxLife);
    const radius = 7 + c.life / 18;
    tubeCtx.beginPath();
    tubeCtx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    tubeCtx.strokeStyle = `rgba(255,170,20,${alpha})`;
    tubeCtx.lineWidth = 3;
    tubeCtx.stroke();

    tubeCtx.beginPath();
    tubeCtx.arc(c.x, c.y, 3, 0, Math.PI * 2);
    tubeCtx.fillStyle = `rgba(255,210,60,${alpha})`;
    tubeCtx.fill();
  }

  // Flèche direction électrons
  tubeCtx.strokeStyle = "#1f70cf";
  tubeCtx.lineWidth = 2;
  tubeCtx.beginPath();
  tubeCtx.moveTo(g.cathode + 20, g.top - 18);
  tubeCtx.lineTo(g.grid - 25, g.top - 18);
  tubeCtx.stroke();
  tubeCtx.beginPath();
  tubeCtx.moveTo(g.grid - 25, g.top - 18);
  tubeCtx.lineTo(g.grid - 34, g.top - 23);
  tubeCtx.lineTo(g.grid - 34, g.top - 13);
  tubeCtx.closePath();
  tubeCtx.fillStyle = "#1f70cf";
  tubeCtx.fill();

  tubeCtx.font = "12px Arial";
  tubeCtx.fillStyle = "#38618d";
  tubeCtx.textAlign = "left";
  tubeCtx.fillText("électrons accélérés →", g.cathode + 10, g.top - 28);

  // DESSIN DU CIRCUIT ÉLECTRIQUE ET DES INSTRUMENTS
  drawCircuitAndInstruments(g, w, h);
}

function drawElectrode(x, top, bottom, label) {
  tubeCtx.save();
  tubeCtx.fillStyle = "#334155";
  tubeCtx.beginPath();
  tubeCtx.roundRect(x - 10, top + 9, 20, bottom - top - 18, 10);
  tubeCtx.fill();

  tubeCtx.fillStyle = "#ffffff";
  tubeCtx.font = "bold 15px Arial";
  tubeCtx.textAlign = "center";
  tubeCtx.textBaseline = "middle";
  tubeCtx.fillText(label, x, (top + bottom) / 2);
  tubeCtx.restore();
}

// Dessin complet du circuit : Générateur, Voltmètre et Ampèremètre
function drawCircuitAndInstruments(g, w, h) {
  const wireColor = "#475569";
  const genY = h - 45;
  const genX = (g.cathode + g.grid) / 2;

  tubeCtx.strokeStyle = wireColor;
  tubeCtx.lineWidth = 2;

  // 1. Connexions du Générateur (entre C et G) : tension accélératrice
  tubeCtx.beginPath();
  tubeCtx.moveTo(g.cathode, g.bottom + 28);
  tubeCtx.lineTo(g.cathode, genY);
  tubeCtx.lineTo(genX - 30, genY);

  tubeCtx.moveTo(g.grid, g.bottom + 28);
  tubeCtx.lineTo(g.grid, genY);
  tubeCtx.lineTo(genX + 30, genY);
  tubeCtx.stroke();

  // Dessin du Générateur
  tubeCtx.fillStyle = "#ffffff";
  tubeCtx.strokeStyle = "#0f172a";
  tubeCtx.lineWidth = 2;
  tubeCtx.beginPath();
  tubeCtx.roundRect(genX - 30, genY - 20, 60, 40, 6);
  tubeCtx.fill();
  tubeCtx.stroke();

  // Symbole Générateur DC / Bouton
  tubeCtx.fillStyle = "#0f172a";
  tubeCtx.font = "bold 12px Arial";
  tubeCtx.textAlign = "center";
  tubeCtx.fillText("Générateur", genX, genY - 6);
  tubeCtx.fillStyle = "#2563eb";
  tubeCtx.fillText(`${U.toFixed(1)} V`, genX, genY + 12);

  // 2. Voltmètre en parallèle entre Cathode et Grille
  const voltY = h - 90;
  tubeCtx.strokeStyle = "#0284c7";
  tubeCtx.lineWidth = 1.5;
  tubeCtx.beginPath();
  tubeCtx.moveTo(g.cathode, genY - 25);
  tubeCtx.lineTo(g.cathode - 25, genY - 25);
  tubeCtx.lineTo(g.cathode - 25, voltY);
  tubeCtx.lineTo(genX - 20, voltY);

  tubeCtx.moveTo(g.grid, genY - 25);
  tubeCtx.lineTo(g.grid + 25, genY - 25);
  tubeCtx.lineTo(g.grid + 25, voltY);
  tubeCtx.lineTo(genX + 20, voltY);
  tubeCtx.stroke();

  // Cadran Voltmètre (V)
  tubeCtx.fillStyle = "#e0f2fe";
  tubeCtx.strokeStyle = "#0284c7";
  tubeCtx.lineWidth = 2;
  tubeCtx.beginPath();
  tubeCtx.arc(genX, voltY, 18, 0, Math.PI * 2);
  tubeCtx.fill();
  tubeCtx.stroke();

  tubeCtx.fillStyle = "#0369a1";
  tubeCtx.font = "bold 15px Arial";
  tubeCtx.textAlign = "center";
  tubeCtx.textBaseline = "middle";
  tubeCtx.fillText("V", genX, voltY);

  // 3. Courant anodique : fil de l'Anode (A) vers l'Ampèremètre,
  //    puis de l'Ampèremètre vers la Cathode (C) — le courant mesuré
  //    est bien le courant anodique, qui revient boucler sur la cathode.
  const returnY = h - 15;
  const ammeterX = (g.anode + g.cathode) / 2;
  const ammeterY = returnY;

  tubeCtx.strokeStyle = wireColor;
  tubeCtx.lineWidth = 2;
  tubeCtx.beginPath();
  tubeCtx.moveTo(g.anode, g.bottom + 28);
  tubeCtx.lineTo(g.anode, returnY);
  tubeCtx.lineTo(ammeterX + 18, returnY);

  tubeCtx.moveTo(ammeterX - 18, returnY);
  tubeCtx.lineTo(g.cathode, returnY);
  tubeCtx.lineTo(g.cathode, genY);
  tubeCtx.stroke();

  // Petit point de jonction sur le fil de la cathode
  tubeCtx.beginPath();
  tubeCtx.arc(g.cathode, genY, 3, 0, Math.PI * 2);
  tubeCtx.fillStyle = wireColor;
  tubeCtx.fill();

  // Cadran Ampèremètre (A) — mesure le courant anodique, reboucle sur la Cathode
  tubeCtx.fillStyle = "#dcfce7";
  tubeCtx.strokeStyle = "#16a34a";
  tubeCtx.lineWidth = 2;
  tubeCtx.beginPath();
  tubeCtx.arc(ammeterX, ammeterY, 18, 0, Math.PI * 2);
  tubeCtx.fill();
  tubeCtx.stroke();

  tubeCtx.fillStyle = "#15803d";
  tubeCtx.font = "bold 15px Arial";
  tubeCtx.textAlign = "center";
  tubeCtx.textBaseline = "middle";
  tubeCtx.fillText("A", ammeterX, ammeterY);
}

// ----------------------------
// Graphique
// ----------------------------

function drawGraph() {
  const w = graphCanvas.clientWidth;
  const h = graphCanvas.clientHeight;
  if (graphCanvas.style.display === "none" || w === 0 || h === 0) return;
  graphCtx.clearRect(0, 0, w, h);

  const pad = {left: 55, right: 18, top: 20, bottom: 38};
  const gw = w - pad.left - pad.right;
  const gh = h - pad.top - pad.bottom;
  const maxI = 20;

  graphCtx.fillStyle = "#fff";
  graphCtx.fillRect(0, 0, w, h);

  graphCtx.strokeStyle = "#dce3ed";
  graphCtx.lineWidth = 1;

  for (let u = 0; u <= 50; u += 5) {
    const x = pad.left + u / 50 * gw;
    graphCtx.beginPath();
    graphCtx.moveTo(x, pad.top);
    graphCtx.lineTo(x, pad.top + gh);
    graphCtx.stroke();

    graphCtx.fillStyle = "#667085";
    graphCtx.font = "11px Arial";
    graphCtx.textAlign = "center";
    graphCtx.fillText(u, x, h - 14);
  }

  for (let i = 0; i <= 20; i += 5) {
    const y = pad.top + gh - i / maxI * gh;
    graphCtx.beginPath();
    graphCtx.moveTo(pad.left, y);
    graphCtx.lineTo(pad.left + gw, y);
    graphCtx.stroke();

    graphCtx.fillStyle = "#667085";
    graphCtx.textAlign = "right";
    graphCtx.fillText(i, pad.left - 8, y + 4);
  }

  graphCtx.fillStyle = "#344054";
  graphCtx.font = "bold 12px Arial";
  graphCtx.textAlign = "center";
  graphCtx.fillText("Tension U (V)", pad.left + gw / 2, h - 1);

  graphCtx.save();
  graphCtx.translate(14, pad.top + gh / 2);
  graphCtx.rotate(-Math.PI / 2);
  graphCtx.fillText("Courant I (µA)", 0, 0);
  graphCtx.restore();

  if (graphData.length > 0) {
    graphCtx.beginPath();
    graphData.forEach((p, index) => {
      const x = pad.left + p.u / 50 * gw;
      const y = pad.top + gh - Math.min(maxI, p.i) / maxI * gh;
      if (index === 0) graphCtx.moveTo(x, y);
      else graphCtx.lineTo(x, y);
    });
    graphCtx.strokeStyle = "#2478dc";
    graphCtx.lineWidth = 2.5;
    graphCtx.stroke();

    for (const p of graphData) {
      const x = pad.left + p.u / 50 * gw;
      const y = pad.top + gh - Math.min(maxI, p.i) / maxI * gh;
      graphCtx.beginPath();
      graphCtx.arc(x, y, 2.8, 0, Math.PI * 2);
      graphCtx.fillStyle = "#2478dc";
      graphCtx.fill();
    }
  }

  const markerX = pad.left + U / 50 * gw;
  graphCtx.beginPath();
  graphCtx.moveTo(markerX, pad.top);
  graphCtx.lineTo(markerX, pad.top + gh);
  graphCtx.strokeStyle = "#e04a3a";
  graphCtx.lineWidth = 1.5;
  graphCtx.stroke();

  graphCtx.fillStyle = "#e04a3a";
  graphCtx.font = "bold 11px Arial";
  graphCtx.textAlign = "center";
  graphCtx.fillText(U.toFixed(1) + " V", markerX, pad.top + 12);
}

// ----------------------------
// Animation & Mises à jour
// ----------------------------

function update(dt, time) {
  simTime = time;
  const sweepingBefore = sweep;

  if (sweep) {
    U += dt * 4.5;
    if (U >= maxVoltage) {
      U = maxVoltage;
      sweep = false;
      running = false;
    }
    voltage.value = U;
  }

  maintainElectrons();
  maintainAtoms();
  updateAtomsAnimation(dt);

  let sumEnergy = 0;
  let aliveCount = 0;

  for (const e of electrons) {
    if (e.alive) {
      e.update(dt, time);
      sumEnergy += e.energy;
      aliveCount++;
    }
  }

  for (const c of collisions) c.life += dt * 1000;
  collisions = collisions.filter(c => c.life < c.maxLife);

  averageEnergy = aliveCount ? sumEnergy / aliveCount : 0;

  // Utiliser la valeur théorique du courant pour la détection des extremums
  const theoretical = theoreticalCurrent(U);
  const noise = running ? (Math.random() - 0.5) * 0.10 : 0;
  current = Math.max(0, theoretical + noise);

  sampleTimer += dt * 1000;
  if (running && sampleTimer > 160) {
    sampleTimer = 0;
    graphData.push({u: U, i: current});
    if (graphData.length > 700) graphData.shift();
  }

  // --- FILTRAGE DES MESURES REMARQUABLES PENDANT LE BALAYAGE ---
  if (sweepingBefore) {
    let newDir = theoretical > sweepLastI ? 1 : (theoretical < sweepLastI ? -1 : 0);

    // Détection d'un sommet (Peak) ou d'un creux (Valley)
    if (sweepDirection !== 0 && newDir !== 0 && sweepDirection !== newDir) {
      if (Math.abs(U - lastRecordedU) > 0.8) {
        addMeasurement();
        lastRecordedU = U;
      }
    }

    if (newDir !== 0) sweepDirection = newDir;
    sweepLastI = theoretical;

    if (!sweep) {
      // Point final (50 V)
      if (Math.abs(50 - lastRecordedU) > 0.5) {
        addMeasurement();
      }
      statusBox.textContent = "Balayage terminé : seuls les maxima et minima ont été enregistrés.";
    }
  }

  updateUI();
}

function draw() {
  drawTube();

  for (const e of electrons) {
    if (e.alive) e.draw(tubeCtx);
  }

  drawGraph();
}

function animate(now) {
  const dt = Math.min(0.04, (now - lastTime) / 1000);
  lastTime = now;

  if (running || sweep) update(dt, now);

  draw();
  requestAnimationFrame(animate);
}

// ----------------------------
// Interface utilisateur
// ----------------------------

function updateUI() {
  voltageDisplay.textContent = U < 10 ? `0${U.toFixed(1)}` : U.toFixed(1);
  currentDisplay.textContent = current.toFixed(2);
  energyValue.textContent = `${averageEnergy.toFixed(2)} eV`;

  if (!running && !sweep) {
    if (U < 4.9) {
      statusBox.textContent = "Les électrons n'ont pas encore assez d'énergie pour exciter le mercure.";
    } else if (nearPeak(U)) {
      statusBox.textContent = `Excitation du ${GASES[currentGas].label} : énergie proche d'un multiple de ${HgExcitation.toFixed(1)} eV.`;
    } else if (nearValley(U)) {
      statusBox.textContent = "Après une collision inélastique, de nombreux électrons ont perdu environ 4,9 eV.";
    }
  }
}

function nearPeak(u) {
  const peakCount = Math.ceil(maxVoltage / HgExcitation) + 1;
  for (let n = 1; n <= peakCount; n++) {
    if (Math.abs(u - n * HgExcitation) < 0.45) return true;
  }
  return false;
}

function nearValley(u) {
  const peakCount = Math.ceil(maxVoltage / HgExcitation) + 1;
  for (let n = 1; n <= peakCount - 1; n++) {
    if (Math.abs(u - (n + 0.5) * HgExcitation) < 0.45) return true;
  }
  return false;
}

function setVoltage(v) {
  U = Number(v);
  voltage.value = U;
  current = theoreticalCurrent(U);
  updateUI();
  draw();
}

voltage.addEventListener("input", e => {
  setVoltage(e.target.value);
  if (!running) {
    graphData.push({u: U, i: current});
    if (graphData.length > 700) graphData.shift();
  }
});

document.getElementById("startBtn").addEventListener("click", () => {
  running = true;
  sweep = false;
  statusBox.textContent = "Simulation en cours : les électrons sont accélérés vers la grille.";
});

document.getElementById("pauseBtn").addEventListener("click", () => {
  running = false;
  sweep = false;
  statusBox.textContent = "Simulation en pause.";
});

document.getElementById("stepBtn").addEventListener("click", () => {
  running = false;
  sweep = false;
  update(0.035, performance.now());
  draw();
  statusBox.textContent = "Un pas de simulation a été exécuté.";
});

document.getElementById("resetBtn").addEventListener("click", resetSimulation);

document.getElementById("sweepBtn").addEventListener("click", () => {
  U = 0;
  voltage.value = 0;
  graphData = [];
  sampleTimer = 0;
  measuredRows = [];
  measurementNumber = 0;

  // Réinitialisation des variables de suivi pour le filtrage
  sweepLastI = theoreticalCurrent(0);
  sweepDirection = 0;
  lastRecordedU = 0;

  renderTable();

  // Enregistrer la valeur initiale (0 V)
  addMeasurement();

  running = true;
  sweep = true;
  statusBox.textContent = "Balayage automatique en cours (enregistrement des extremums)...";
});

document.getElementById("measureBtn").addEventListener("click", () => {
  addMeasurement();
  statusBox.textContent = `Mesure enregistrée : U = ${U.toFixed(1)} V, I = ${current.toFixed(2)} µA.`;
});

document.getElementById("clearTableBtn").addEventListener("click", () => {
  measuredRows = [];
  measurementNumber = 0;
  renderTable();
});

const toggleGraphBtn = document.getElementById("toggleGraphBtn");
const graphInfoEl = document.getElementById("graphInfo");

toggleGraphBtn.addEventListener("click", () => {
  const isHidden = graphCanvas.style.display === "none";
  graphCanvas.style.display = isHidden ? "block" : "none";
  graphInfoEl.style.display = isHidden ? "flex" : "none";
  toggleGraphBtn.textContent = isHidden ? "🙈 Cacher le graphe" : "👁 Afficher le graphe";
  if (isHidden) {
    resizeCanvas(graphCanvas, graphCtx);
    drawGraph();
  }
});

function addMeasurement() {
  measuredRows.push({
    n: ++measurementNumber,
    u: U,
    i: current,
    e: averageEnergy
  });
  renderTable();
}

function renderTable() {
  measurementsBody.innerHTML = measuredRows.map(r => `
    <tr>
      <td>${r.n}</td>
      <td>${r.u.toFixed(1)}</td>
      <td>${r.i.toFixed(2)}</td>
      <td>${r.e.toFixed(2)}</td>
    </tr>
  `).join("");
}

function applyGas(gasKey) {
  currentGas = gasKey;
  const gas = GASES[gasKey];
  HgExcitation = gas.excitation;

  subtitleEl.textContent = `Simulation interactive — tube à ${gas.subtitle}`;
  atomLegendLabel.textContent = ` Atomes de ${gas.label}`;
  atomLegendDot.style.background = gas.atomColor;
  peakSpacingValue.textContent = `${HgExcitation.toFixed(1)} V`;
  gasNameText1.textContent = gas.label;
  excitationEnergyText1.textContent = `${HgExcitation.toFixed(1)} eV`;
  excitationEnergyText2.textContent = `${HgExcitation.toFixed(1)} eV`;
  formulaDeltaU.textContent = `ΔU ≈ ${HgExcitation.toFixed(1)} V`;
  formulaExc.innerHTML = `E<sub>exc</sub> ≈ ${HgExcitation.toFixed(1)} eV`;

  graphData = [];
  atoms = [];
  measuredRows = [];
  measurementNumber = 0;
  sampleTimer = 0;
  renderTable();
  maintainAtoms();
  statusBox.textContent = `Gaz choisi : ${gas.subtitle}. Réglez la tension U pour observer les collisions.`;
  updateUI();
  draw();
}

gasSelect.addEventListener("change", e => applyGas(e.target.value));

function resetSimulation() {
  U = 0;
  voltage.value = 0;
  current = 0;
  averageEnergy = 0;
  running = false;
  sweep = false;
  graphData = [];
  collisions = [];
  electrons = [];
  atoms = [];
  sampleTimer = 0;
  statusBox.textContent = "Réglez la tension U pour observer les collisions.";
  maintainElectrons();
  maintainAtoms();
  updateUI();
  draw();
}

// Initialisation
resizeAll();
maintainElectrons();
applyGas(gasSelect.value);
updateUI();
drawTube();
drawGraph();
requestAnimationFrame(animate);