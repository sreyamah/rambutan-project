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
  4000
);
camera.position.z = 350;

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xf5f3ee, 1);
document.body.appendChild(renderer.domElement);

// =======================
// LIGHTING
// =======================

scene.add(new THREE.AmbientLight(0xffffff, 0.82));

const keyLight = new THREE.PointLight(0xffffff, 1.25, 1500);
keyLight.position.set(240, 240, 320);
scene.add(keyLight);

const fillLight = new THREE.PointLight(0xffd9df, 0.85, 1200);
fillLight.position.set(-240, -100, 260);
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

// =======================
// RESET BUTTON
// =======================

const resetBtn = document.createElement("button");
resetBtn.textContent = "Reset";
resetBtn.style.position = "absolute";
resetBtn.style.top = "20px";
resetBtn.style.right = "20px";
resetBtn.style.padding = "10px 18px";
resetBtn.style.font = "600 16px 'Cormorant Garamond', serif";
resetBtn.style.background = "rgba(255,255,255,0.9)";
resetBtn.style.border = "1px solid rgba(0,0,0,0.2)";
resetBtn.style.borderRadius = "4px";
resetBtn.style.cursor = "pointer";
resetBtn.style.zIndex = "1000";
document.body.appendChild(resetBtn);

// =======================
// GLOBAL STATE
// =======================

let PHASE = 1;

let progress = 0;
const REQUIRED_TIME = 30; // TESTING: 5 seconds. Change to 30 for final.

let softness = 0;
let targetSoftness = 0;

let smoothVolume = 0;
let speechConfidence = 0;
let gentleSpeechGlobal = false;

let pitchSmooth = 0.5;

let lastFrameTime = performance.now();
let phase2StartTime = 0;

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

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

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
    console.error(err);
    alert("Microphone access failed.");
  }
}

initAudio();

document.addEventListener(
  "click",
  () => {
    if (audioContext && audioContext.state === "suspended") {
      audioContext.resume();
    }
  },
  { once: true }
);

// =======================
// HELPERS
// =======================

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
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
// TEXT
// =======================

function getPhaseText() {
  if (PHASE === 1) {
    return {
      top: "Sweet sayings for sweeter fruit",
      bottom: "Speak gently to the fruit"
    };
  }

  if (PHASE === 2) {
    return {
      top: "You may taste what’s within the spikes",
      bottom: "Take one."
    };
  }

  return {
    top: "What you soften remembers",
    bottom: "Form is memory. Form is survival."
  };
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
// AUDIO FEATURES
// =======================

function getAudioFeatures() {
  if (!analyser || !timeDomainData || !freqData || !audioContext) {
    return {
      rms: 0,
      midRatio: 0,
      speechy: false,
      pitchNorm: 0.5,
      hasPitch: false
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

  let strongestEnergy = 0;
  let strongestFreq = 0;

  for (let i = 0; i < freqData.length; i++) {
    const freq = (i / freqData.length) * nyquist;

    const mag = Math.pow(10, freqData[i] / 20);
    const energy = mag * mag;

    totalEnergy += energy;

    if (freq >= 250 && freq <= 4000) {
      midEnergy += energy;
    }

    if (freq >= 85 && freq <= 450 && energy > strongestEnergy) {
      strongestEnergy = energy;
      strongestFreq = freq;
    }
  }

  const midRatio = totalEnergy > 0 ? midEnergy / totalEnergy : 0;

  const speechy = rms > 0.01 && midRatio > 0.15;

  const hasPitch = strongestFreq > 0 && rms > 0.01;

  const pitchNorm = hasPitch
    ? clamp((strongestFreq - 85) / (450 - 85), 0, 1)
    : 0.5;

  return {
    rms,
    midRatio,
    speechy,
    pitchNorm,
    hasPitch
  };
}

// =======================
// CORE
// =======================

const coreGeometry = new THREE.SphereGeometry(72, 64, 64);

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
// SHELL
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
// SPIKES — CONNECTED 3D CONICAL DROOPING SPINES
// =======================

const spikeGroup = new THREE.Group();
scene.add(spikeGroup);

let spikeMeshes = [];

const spikeCount = 390;
const fruitRadius = 110;

// shorter, thicker, more rambutan-like
const spikeHeight = 44;      // was 28
const spikeBaseRadius = 4.4; // was 4.8
const spikeEmbedDepth = 13;

const spikeMaterial = new THREE.MeshStandardMaterial({
  color: 0x651923,
  roughness: 0.9,
  metalness: 0.02
});

function makeSpikeGeometry() {
  const geo = new THREE.ConeGeometry(
    spikeBaseRadius,
    spikeHeight,
    14,
    2,
    false
  );

  // Base is buried into the fruit so it visibly connects to the body.
  // Local cone extends along Y.
  geo.translate(0, spikeHeight / 2 - spikeEmbedDepth, 0);

  return geo;
}

const baseSpikeGeo = makeSpikeGeometry();

function createSpike(i, dir) {
  const mesh = new THREE.Mesh(baseSpikeGeo.clone(), spikeMaterial.clone());

  // Root sits slightly inside the flesh.
  const basePos = dir.clone().multiplyScalar(fruitRadius - 10);
  mesh.position.copy(basePos);

  const outwardQuat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir
  );

  const gravity = new THREE.Vector3(0, -1, 0);

  let droopDir = gravity
    .clone()
    .sub(dir.clone().multiplyScalar(gravity.dot(dir)));

  if (droopDir.lengthSq() < 0.0001) {
    droopDir = new THREE.Vector3(1, 0, 0);
  }

  droopDir.normalize();

  const bendAxis = new THREE.Vector3()
    .crossVectors(dir, droopDir)
    .normalize();

  mesh.quaternion.copy(outwardQuat);

  spikeGroup.add(mesh);

  return {
    mesh,
    dir,
    basePos,
    bendAxis,
    phase: Math.random() * Math.PI * 2,
    launchDistance: 0,
    launchSpeed: 180 + Math.random() * 220
  };
}

for (let i = 0; i < spikeCount; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 2 - 1);

  const dir = new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi)
  ).normalize();

  spikeMeshes.push(createSpike(i, dir));
}

function updateSpikes(now, progressNorm, dt) {
  const time = now * 0.002;

  const pitchInfluence = 1 - progressNorm;
  const medianPitch = 0.5;

  const settledPitch = medianPitch * progressNorm + pitchSmooth * pitchInfluence;
  const pitchScale = 0.78 + settledPitch * 0.4;

  const modulationAmount =
    MODULATION_MAX * (1 - progressNorm) +
    MODULATION_MIN * progressNorm;

  const targetSpikeScale =
    OPTIMAL_SPIKE_SCALE * progressNorm +
    pitchScale * (1 - progressNorm);

  spikeMeshes.forEach((item, i) => {
    const { mesh, dir, basePos } = item;

    if (PHASE === 1) {
      item.launchDistance = 0;

      const wave =
        Math.sin(time * 1.7 + item.phase) * 0.14 +
        Math.sin(time * 2.6 + i * 0.13) * 0.08;

      const voicePulse =
        wave * modulationAmount +
        smoothVolume * 0.28 * (1 - progressNorm);

      const scaleY = targetSpikeScale + voicePulse;

      mesh.position.copy(basePos);

      const outwardQuat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir
      );

      // strong enough to read as drooping, but still attached
      const droopAmount =
        0.72 * (1 - progressNorm) +
        0.34 +
        Math.sin(time * 1.6 + item.phase) * 0.07 * modulationAmount;

      const droopQuat = new THREE.Quaternion().setFromAxisAngle(
        item.bendAxis,
        droopAmount
      );

      mesh.quaternion.copy(outwardQuat).multiply(droopQuat);

      mesh.scale.set(
        1,
        Math.max(0.7, scaleY),
        1
      );
    }

    else if (PHASE === 2) {
      item.launchDistance += item.launchSpeed * dt;

      const splitPos = dir
        .clone()
        .multiplyScalar(fruitRadius + item.launchDistance);

      mesh.position.copy(splitPos);

      const outwardQuat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir
      );

      const tumbleQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          time + i * 0.01,
          time * 0.7 + item.phase,
          time * 1.1
        )
      );

      mesh.quaternion.copy(outwardQuat).multiply(tumbleQuat);

      const s = Math.max(0.35, 1 - item.launchDistance / 1800);
      mesh.scale.set(s, s, s);
    }

    else if (PHASE === 3) {
      item.launchDistance = Math.max(
        0,
        item.launchDistance - item.launchSpeed * dt * 1.25
      );

      const returningPos = dir
        .clone()
        .multiplyScalar(fruitRadius + item.launchDistance);

      mesh.position.copy(returningPos);

      const returnNorm = clamp(item.launchDistance / 900, 0, 1);

      const outwardQuat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir
      );

      const droopQuat = new THREE.Quaternion().setFromAxisAngle(
        item.bendAxis,
        0.34 + returnNorm * 0.25
      );

      mesh.quaternion.copy(outwardQuat).multiply(droopQuat);

      const s = 0.8 + returnNorm * 0.2;
      mesh.scale.set(s, s, s);
    }
  });
}

// =======================
// UI
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

  uiCtx.beginPath();
  uiCtx.strokeStyle = "rgba(30,30,30,0.16)";
  uiCtx.lineWidth = 2;
  uiCtx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
  uiCtx.stroke();

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

  uiCtx.font = "400 24px 'Cormorant Garamond', serif";
  drawAnimatedTextLine(
    bottomTextCurrent,
    bottomTextTarget,
    cx,
    uiCanvas.height - 60,
    false
  );

  uiCtx.globalAlpha = 1;
}

// =======================
// RESET
// =======================

resetBtn.addEventListener("click", () => {
  PHASE = 1;
  progress = 0;

  softness = 0;
  targetSoftness = 0;

  smoothVolume = 0;
  speechConfidence = 0;
  pitchSmooth = 0.5;

  phase2StartTime = 0;

  textAnim = 1;
  textAnimating = false;

  initTextState();

  spikeMeshes.forEach(item => {
    item.launchDistance = 0;
    item.mesh.position.copy(item.basePos);
    item.mesh.scale.set(1, 1, 1);
  });
});

// =======================
// ANIMATE
// =======================

function animate(now) {
  requestAnimationFrame(animate);

  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  updateAnimatedText(dt);

  const features = getAudioFeatures();

  if (features.hasPitch) {
    pitchSmooth += (features.pitchNorm - pitchSmooth) * 0.18;
  } else {
    pitchSmooth += (0.5 - pitchSmooth) * 0.05;
  }

  smoothVolume += (features.rms - smoothVolume) * 0.15;

  if (features.speechy) {
    speechConfidence += (1 - speechConfidence) * 0.12;
  } else {
    speechConfidence *= 0.75;
  }

  const gentleSpeech = speechConfidence > 0.25;
  gentleSpeechGlobal = gentleSpeech;

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

  const progressNorm = getProgressNorm();
  updateSpikes(now, progressNorm, dt);

  updateShell(now);

  const pulse = Math.sin(now * 0.005) * 5;
  const breathe = smoothVolume * 40;
  const revealScale =
    0.45 + softness * 0.75 + pulse * 0.01 + breathe * 0.01;

  core.scale.setScalar(revealScale);
  core.visible = softness > 0.08;

  spikeGroup.rotation.y += 0.003;
  core.rotation.y += 0.003;

  if (shellGroup) {
    shellGroup.rotation.y += 0.003;
  }

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