// =======================
// FONT LOADING
// =======================

const fontLink = document.createElement("link");
fontLink.rel = "preconnect";
fontLink.href = "https://fonts.googleapis.com";
document.head.appendChild(fontLink);

const fontLink2 = document.createElement("link");
fontLink2.rel = "preconnect";
fontLink2.href = "https://fonts.gstatic.com";
fontLink2.crossOrigin = "anonymous";
document.head.appendChild(fontLink2);

const fontStylesheet = document.createElement("link");
fontStylesheet.rel = "stylesheet";
fontStylesheet.href =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&display=swap";
document.head.appendChild(fontStylesheet);

// =======================
// SCENE SETUP
// =======================

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 350;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf5f3ee, 1);
document.body.appendChild(renderer.domElement);

// =======================
// LIGHTING
// =======================

const ambient = new THREE.AmbientLight(0xffffff, 0.82);
scene.add(ambient);

const keyLight = new THREE.PointLight(0xffffff, 1.2, 1200);
keyLight.position.set(220, 220, 300);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0xffd9df, 0.8, 900);
fillLight.position.set(-220, -80, 220);
scene.add(fillLight);

// =======================
// UI OVERLAY
// =======================

const uiCanvas = document.createElement("canvas");
const uiCtx = uiCanvas.getContext("2d");

uiCanvas.width = window.innerWidth;
uiCanvas.height = window.innerHeight;
uiCanvas.style.position = "absolute";
uiCanvas.style.left = "0";
uiCanvas.style.top = "0";
uiCanvas.style.pointerEvents = "none";
document.body.appendChild(uiCanvas);

// Reset button
const resetBtn = document.createElement("button");
resetBtn.textContent = "Reset";
resetBtn.style.position = "absolute";
resetBtn.style.right = "20px";
resetBtn.style.top = "20px";
resetBtn.style.padding = "10px 20px";
resetBtn.style.font = "600 16px 'Cormorant Garamond', serif";
resetBtn.style.background = "rgba(255,255,255,0.9)";
resetBtn.style.border = "1px solid rgba(0,0,0,0.2)";
resetBtn.style.borderRadius = "4px";
resetBtn.style.cursor = "pointer";
resetBtn.style.zIndex = "1000";
document.body.appendChild(resetBtn);

resetBtn.addEventListener("click", () => {
  PHASE = 1;
  progress = 0;
  softness = 0;
  targetSoftness = 0;
  smoothVolume = 0;
  speechConfidence = 0;
  gentleSpeechGlobal = false;
  topTextCurrent = "";
  topTextTarget = "";
  bottomTextCurrent = "";
  bottomTextTarget = "";
  textAnim = 1;
  textAnimating = false;
});

// =======================
// GLOBAL STATE
// =======================

let PHASE = 1; // 1 = discovery, 2 = taste, 3 = reflection

let progress = 0;
const REQUIRED_TIME = 30; // use 8 while testing if needed

let softness = 0;
let targetSoftness = 0;

let smoothVolume = 0;
let speechConfidence = 0;
let gentleSpeechGlobal = false;

let lastFrameTime = performance.now();
let phase2StartTime = 0;

// debug readout
let lastFeatures = {
  rms: 0,
  midRatio: 0,
  speechy: false
};

// animated text
let topTextCurrent = "";
let bottomTextCurrent = "";
let topTextTarget = "";
let bottomTextTarget = "";
let textAnim = 1;
let textAnimating = false;

// spike behavior
const OPTIMAL_SPIKE_SCALE = 0.85;
const MAX_SPIKE_SCALE = 1.8;
const MODULATION_MAX = 0.9;
const MODULATION_MIN = 0.03;

// =======================
// AUDIO
// =======================

let audioContext;
let analyser;
let timeDomainData;
let freqData;

async function initAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false
      }
    });

    const source = audioContext.createMediaStreamSource(stream);

    analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;

    source.connect(analyser);

    timeDomainData = new Float32Array(analyser.fftSize);
    freqData = new Float32Array(analyser.frequencyBinCount);

    console.log("🎤 Mic connected");
  } catch (err) {
    console.error("Mic error:", err);
    alert("Could not access microphone. Check browser permissions.");
  }
}

// Auto-initialize audio on load
initAudio();

// =======================
// HELPERS
// =======================

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeInOutCubic(x) {
  return x < 0.5
    ? 4 * x * x * x
    : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}

function getProgressNorm() {
  return clamp(progress / REQUIRED_TIME, 0, 1);
}

// =======================
// TEXT CONTENT
// =======================

function getPhaseText() {
  if (PHASE === 1) {
    return {
      top: "Sweet sayings for sweeter fruit",
      bottom: "Speak gently to the fruit"
    };
  } else if (PHASE === 2) {
    return {
      top: "You may taste what’s within the spikes",
      bottom: "Take one."
    };
  } else {
    return {
      top: "What you soften remembers",
      bottom: "Form is memory. Form is survival."
    };
  }
}

function initTextState() {
  const t = getPhaseText();
  topTextCurrent = t.top;
  bottomTextCurrent = t.bottom;
  topTextTarget = t.top;
  bottomTextTarget = t.bottom;
}

function updateAnimatedText(dt) {
  const t = getPhaseText();

  if (t.top !== topTextTarget || t.bottom !== bottomTextTarget) {
    topTextTarget = t.top;
    bottomTextTarget = t.bottom;
    textAnimating = true;
    textAnim = 0;
  }

  if (textAnimating) {
    textAnim += dt * 1.7;

    if (textAnim >= 1) {
      textAnim = 1;
      textAnimating = false;
      topTextCurrent = topTextTarget;
      bottomTextCurrent = bottomTextTarget;
    }
  } else {
    topTextCurrent = topTextTarget;
    bottomTextCurrent = bottomTextTarget;
  }
}

// =======================
// AUDIO FEATURE ANALYSIS
// SIMPLER DEBUG VERSION
// =======================

function getAudioFeatures() {
  if (!analyser || !timeDomainData || !freqData || !audioContext) {
    return {
      rms: 0,
      midRatio: 0,
      speechy: false
    };
  }

  analyser.getFloatTimeDomainData(timeDomainData);

  let sumSquares = 0;
  for (let i = 0; i < timeDomainData.length; i++) {
    const s = timeDomainData[i];
    sumSquares += s * s;
  }

  const rms = Math.sqrt(sumSquares / timeDomainData.length);

  analyser.getFloatFrequencyData(freqData);

  const sampleRate = audioContext.sampleRate;
  const nyquist = sampleRate / 2;

  let totalEnergy = 0;
  let midEnergy = 0;

  for (let i = 0; i < freqData.length; i++) {
    const freq = (i / freqData.length) * nyquist;
    const mag = Math.pow(10, freqData[i] / 20);
    const energy = mag * mag;

    totalEnergy += energy;
    if (freq >= 250 && freq <= 4000) {
      midEnergy += energy;
    }
  }

  const midRatio = totalEnergy > 0 ? midEnergy / totalEnergy : 0;

  // looser, debug-friendly speech guess
  const speechy = rms > 0.01 && midRatio > 0.15;

  return {
    rms,
    midRatio,
    speechy
  };
}

// =======================
// CORE
// =======================

const coreGeometry = new THREE.SphereGeometry(70, 64, 64);
const coreMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xffe6ee,
  roughness: 0.25,
  transmission: 0.55,
  thickness: 1.8,
  clearcoat: 0.4,
  clearcoatRoughness: 0.2
});

const core = new THREE.Mesh(coreGeometry, coreMaterial);
core.visible = false;
scene.add(core);

// =======================
// SPIKES
// =======================

const spikeGroup = new THREE.Group();
scene.add(spikeGroup);

const spikeMeshes = [];
const spikeCount = 320;
const fruitRadius = 110;
const spikeLength = 40;
const spikeBaseOffset = 20; // matches previous translate

function createTendrilCurve(dir, i) {
  // Returns a custom curve for a spike, with curl and animation
  class TendrilCurve extends THREE.Curve {
    constructor() {
      super();
      this.dir = dir.clone();
      this.i = i;
    }
    getPoint(t) {
      // t: 0 (base) to 1 (tip)
      // Curl and animate the tip
      const base = this.dir.clone().multiplyScalar(fruitRadius - spikeBaseOffset);
      const tip = this.dir.clone().multiplyScalar(fruitRadius - spikeBaseOffset + spikeLength);

      // Curl: add a perpendicular offset that increases with t
      // Animate: sine wave based on time and spike index
      const now = performance.now() * 0.001;
      // Find a perpendicular vector
      let perp = new THREE.Vector3(0, 1, 0);
      if (Math.abs(this.dir.dot(perp)) > 0.99) perp = new THREE.Vector3(1, 0, 0);
      perp.cross(this.dir).normalize();
      // Curl amount
      const curlStrength = 10 + 6 * Math.sin(now * 0.7 + this.i * 0.13);
      const curl = perp.multiplyScalar(Math.sin(Math.PI * t) * curlStrength * t);

      // Subtle waving in a second direction
      let perp2 = new THREE.Vector3().crossVectors(this.dir, perp).normalize();
      const waveStrength = 6 + 3 * Math.cos(now * 0.9 + this.i * 0.19);
      const wave = perp2.multiplyScalar(Math.sin(Math.PI * t) * waveStrength * t);

      // Interpolate base to tip
      const pos = base.clone().lerp(tip, t);
      pos.add(curl).add(wave);
      return pos;
    }
  }
  return new TendrilCurve();
}

const spikeMaterial = new THREE.MeshStandardMaterial({
  color: 0xaa3948,
  roughness: 0.85,
  metalness: 0.02
});

for (let i = 0; i < spikeCount; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 2 - 1);

  const x = Math.sin(phi) * Math.cos(theta);
  const y = Math.sin(phi) * Math.sin(theta);
  const z = Math.cos(phi);
  const dir = new THREE.Vector3(x, y, z).normalize();

  // Use TubeGeometry for tendril
  const curve = createTendrilCurve(dir, i);
  // Tapered tube: radius decreases from base to tip
  const taperRadius = t => 2.1 * (1 - t) + 0.18; // base thick, tip thin
  const tubeGeo = new THREE.TubeGeometry(curve, 16, 2.1, 7, false, taperRadius);
  const spike = new THREE.Mesh(tubeGeo, spikeMaterial.clone());
  spikeGroup.add(spike);
  spikeMeshes.push({ mesh: spike, dir, curve, i });
}

// =======================
// SHELL PANELS
// =======================

let shellGroup;
let shellPanels = [];
const shellPanelCount = 6;
const shellRadius = 95;

function createShell() {
  shellGroup = new THREE.Group();
  scene.add(shellGroup);

  const shellMaterial = new THREE.MeshStandardMaterial({
    color: 0xc44e5b,
    roughness: 0.78,
    metalness: 0.03,
    side: THREE.DoubleSide
  });

  for (let i = 0; i < shellPanelCount; i++) {
    const panelGroup = new THREE.Group();

    const panelGeometry = new THREE.SphereGeometry(
      shellRadius,
      24,
      18,
      0,
      Math.PI * 2 / shellPanelCount,
      0.2,
      Math.PI - 0.4
    );

    const panelMesh = new THREE.Mesh(panelGeometry, shellMaterial);
    const baseYRotation = (i / shellPanelCount) * Math.PI * 2;
    panelMesh.rotation.y = baseYRotation;

    panelGroup.add(panelMesh);
    shellGroup.add(panelGroup);

    shellPanels.push({
      group: panelGroup,
      mesh: panelMesh,
      baseYRotation
    });
  }
}

createShell();

function updateShell(now) {
  const eased = easeInOutCubic(softness);

  shellPanels.forEach((panelObj, i) => {
    const group = panelObj.group;
    const delay = i * 0.04;
    const localOpen = clamp((eased - delay) / (1 - delay), 0, 1);

    group.rotation.z = localOpen * 1.15;
    group.rotation.x = Math.sin(now * 0.001 + i) * 0.08 * localOpen;

    const outward = localOpen * 22;
    const upward = localOpen * 14;
    const angle = panelObj.baseYRotation;

    group.position.set(
      Math.cos(angle) * outward,
      upward,
      Math.sin(angle) * outward
    );
  });

  shellGroup.visible = softness < 0.995;
}

// =======================
// DRAW UI
// =======================

function drawAnimatedTextLine(currentText, targetText, x, y, isTitle) {
  const t = easeOutCubic(textAnim);

  if (!textAnimating) {
    uiCtx.globalAlpha = 1;
    uiCtx.fillText(currentText, x, y);
    return;
  }

  const outgoingAlpha = 1 - t;
  const incomingAlpha = t;
  const offset = isTitle ? 18 : 12;

  uiCtx.globalAlpha = outgoingAlpha;
  uiCtx.fillText(currentText, x, y - offset * t);

  uiCtx.globalAlpha = incomingAlpha;
  uiCtx.fillText(targetText, x, y + offset * (1 - t));
}

function drawUIOverlay() {
  uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);

  const cx = uiCanvas.width / 2;
  const cy = uiCanvas.height / 2;
  const ringRadius = 170;
  const progressNorm = getProgressNorm();

  // ring background
  uiCtx.beginPath();
  uiCtx.strokeStyle = "rgba(30,30,30,0.16)";
  uiCtx.lineWidth = 2;
  uiCtx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  uiCtx.stroke();

  // progress ring
  if (PHASE === 1) {
    uiCtx.beginPath();
    uiCtx.strokeStyle = "rgba(255,255,255,0.88)";
    uiCtx.lineWidth = 3;
    uiCtx.arc(
      cx,
      cy,
      ringRadius,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * progressNorm
    );
    uiCtx.stroke();
  }

  uiCtx.fillStyle = "rgba(18,18,18,0.94)";
  uiCtx.textAlign = "center";
  uiCtx.textBaseline = "middle";

  uiCtx.font = "600 38px 'Cormorant Garamond', serif";
  drawAnimatedTextLine(topTextCurrent, topTextTarget, cx, 70, true);

  //uiCtx.font = "400 24px 'Cormorant Garamond', serif";
  drawAnimatedTextLine(bottomTextCurrent, bottomTextTarget, cx, uiCanvas.height - 60, false);

  uiCtx.globalAlpha = 1;
}

// =======================
// ANIMATE
// =======================

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  updateAnimatedText(dt);

  const features = getAudioFeatures();
  lastFeatures = features;

  smoothVolume += (features.rms - smoothVolume) * 0.15;

  if (features.speechy) {
    speechConfidence += (1 - speechConfidence) * 0.12;
  } else {
    speechConfidence *= 0.75;
  }

  const gentleSpeech = speechConfidence > 0.25;
  gentleSpeechGlobal = gentleSpeech;

  // =======================
  // PHASE LOGIC
  // =======================

  if (PHASE === 1) {
    if (gentleSpeech) {
      progress += dt;
    } else {
      progress -= dt * 0.9;
    }

    progress = clamp(progress, 0, REQUIRED_TIME);

    const progressNorm = getProgressNorm();

    if (progressNorm < 0.65) {
      targetSoftness = progressNorm * 0.12;
    } else {
      targetSoftness = 0.08 + ((progressNorm - 0.65) / 0.35) * 0.92;
    }

    targetSoftness = clamp(targetSoftness, 0, 1);

    if (progressNorm >= 1 && softness > 0.985) {
      PHASE = 2;
      phase2StartTime = now;
    }
  } else if (PHASE === 2) {
    targetSoftness = 1;

    if (now - phase2StartTime > 12000) {
      PHASE = 3;
    }
  } else if (PHASE === 3) {
    targetSoftness = Math.max(0, targetSoftness - 0.003);
  }

  softness += (targetSoftness - softness) * 0.05;

  // =======================
  // SPIKES
  // =======================

  const progressNorm = getProgressNorm();

  const modulationAmount =
    MODULATION_MAX * (1 - progressNorm) +
    MODULATION_MIN * progressNorm;

  const targetSpikeScale =
    MAX_SPIKE_SCALE * (1 - progressNorm) +
    OPTIMAL_SPIKE_SCALE * progressNorm;

  // Animate tendril curves and update geometry
  spikeMeshes.forEach((item, i) => {
    // Rebuild the tube geometry each frame for live curling
    const { mesh, dir, curve, i: idx } = item;
    // Remove old geometry
    mesh.geometry.dispose();
    // Recreate curve with updated time
    const newCurve = createTendrilCurve(dir, idx);
    // Animate with taper
    const taperRadius = t => 2.1 * (1 - t) + 0.18;
    mesh.geometry = new THREE.TubeGeometry(newCurve, 16, 2.1, 7, false, taperRadius);
  });

  // =======================
  // SHELL + CORE
  // =======================

  updateShell(now);

  const pulse = Math.sin(now * 0.005) * 5;
  const breathe = smoothVolume * 40;
  const revealScale = 0.45 + softness * 0.75 + pulse * 0.01 + breathe * 0.01;

  core.scale.setScalar(revealScale);
  core.visible = softness > 0.08;

  // =======================
  // ROTATION
  // =======================

  spikeGroup.rotation.y += 0.003;
  core.rotation.y += 0.003;
  if (shellGroup) shellGroup.rotation.y += 0.003;

  // =======================
  // RENDER + UI
  // =======================

  renderer.render(scene, camera);
  drawUIOverlay();
}

initTextState();
requestAnimationFrame(animate);

// =======================
// RESIZE
// =======================

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  uiCanvas.width = window.innerWidth;
  uiCanvas.height = window.innerHeight;
});