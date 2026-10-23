// Entry point: builds the scene, lights, cube, camera rig, input, UI and
// the solver worker, and runs the render loop.

// Three.js is imported lazily inside main() so routes like /t never load it.
import { Cube } from './Cube.js';
import { CameraRig } from './CameraRig.js';
import { InputController } from './InputController.js';
import { UI } from './UI.js';
import { Effects } from './Effects.js';
import { Timer } from './Timer.js';
import { viewFaces } from './Orientation.js';
import { CAMERA, FLOOR_Y } from './constants.js';

export async function mount() {
  await main();
}

async function main() {
  const host = document.getElementById('cube');
  if (host && host.hidden) return; // the SPA only shows the 3D view on /3d
  const canvas = document.getElementById('scene');
  if (!canvas) return;
  const THREE = await import('three'); // lazy: only the 3D route pays for it

  // ---- renderer ----------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ---- scene -------------------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e1116);
  scene.fog = new THREE.Fog(0x0e1116, 14, 36);

  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov, window.innerWidth / window.innerHeight, 0.1, 100,
  );

  // ---- lights ------------------------------------------------------------
  // Lifted ground colour so downward-facing surfaces (e.g. the yellow D face,
  // which no directional light reaches) stay dim but readable instead of black.
  scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x39424f, 0.7));

  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(5, 8, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 30;
  key.shadow.camera.left = -7; key.shadow.camera.right = 7;
  key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
  key.shadow.bias = -0.0002;
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x88aaff, 0.6);
  fill.position.set(-5, 3, -6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(0, 4, -8);
  scene.add(rim);

  // Dim upward fill: shines from below toward the origin, so the D face reads
  // as yellow instead of a silhouette. Kept low so the top faces keep contrast.
  const under = new THREE.DirectionalLight(0xcfe0ff, 0.45);
  under.position.set(1.5, -6, 2.5);
  scene.add(under);

  // ---- floor (soft shadow catcher) ---------------------------------------
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.ShadowMaterial({ opacity: 0.38 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- cube, camera, ui, input -------------------------------------------
  const cube = new Cube(scene);
  const rig = new CameraRig(camera);
  const ui = new UI();
  const effects = new Effects(scene);
  const timer = new Timer(60); // timer mode: user-set countdown

  function syncTimer() {
    // left <= 0 only happens after a timeout, so 0:00 stays red once time is up.
    ui.setTimer(`Timer ${timer.display()}`, timer.urgent() || timer.left <= 0);
    ui.showStop(timer.running);
  }

  // Current view-relative face mapping, recomputed every frame after the rig
  // has moved the camera (camera.up is set by rig.update()).
  let view = null;
  let litCubie = null;
  let litFace = null;
  function currentView() {
    if (!view) {
      rig.update();
      view = viewFaces(camera.position, rig.target, camera.up);
    }
    return view;
  }

  // ---- solver worker -----------------------------------------------------
  let solverReady = false;
  let solving = false;
  let playingBack = false;

  // Cross-thread cancel flag: main thread writes cancelFlag[0]=1 to abort worker search.
  let cancelSab = null;
  let cancelFlag = null;
  try {
    cancelSab = new SharedArrayBuffer(4);
    cancelFlag = new Int32Array(cancelSab);
  } catch {
    cancelFlag = null;
  }

  const worker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'ready') {
      solverReady = true;
      ui.setSolveEnabled(true);
      ui.setSolver('ready', `Solver: ready (${(m.buildMs / 1000).toFixed(0)}s tables${m.tables === 'rebuilt' ? ', pre-computed ones rejected' : ''})`);
    } else if (m.type === 'build') {
      ui.setSolver('building', `Solver: ${m.label} (${m.pct | 0}%)`);
    } else if (m.type === 'progress') {
      const raw = typeof m.nodes === 'number' ? m.nodes : 0;
      const nodes = raw > 1e6 ? (raw / 1e6).toFixed(2) + 'M' : raw.toLocaleString();
      const secs = ((m.time ?? 0) / 1000).toFixed(1);
      const what = m.phase ? (m.phase + (m.cand ? ' #' + m.cand : '')) : ('b' + (m.bound ?? '?'));
      ui.setSolver('solving', `Solving… ${what} · ${nodes} · ${secs}s`);
    } else if (m.type === 'solved') {
      solving = false;
      ui.showCancel(false);
      if (m.moves.length === 0) {
        ui.setSolveEnabled(true);
        ui.setSolver('solved', 'Solver: already solved');
      } else {
        playingBack = true;
        ui.setSolveEnabled(false);
        cube.solve(m.moves);
        ui.setSolver('solved', `Solved in ${m.moves.length} moves · ${(m.time / 1000).toFixed(1)}s`);
      }
    } else if (m.type === 'error') {
      solving = false;
      ui.showCancel(false);
      ui.setSolveEnabled(true);
      ui.setSolver('error', 'Solver: ' + m.error);
    }
  };

  // Surface worker load/runtime errors to the UI so we can debug.
  worker.addEventListener('error', (e) => {
    const msg = e && (e.message || (e.error && e.error.message) || 'unknown worker error');
    console.error('[worker error]', msg);
    ui.setSolver('error', 'Solver: worker error: ' + msg);
  });

  // ---- cube -> ui callbacks ----------------------------------------------
  // A solved cube freezes the countdown: the timed round is over (and using
  // the solver at all voids it, see ui.actions.solve).
  cube.onSolveChange = (s) => {
    ui.setSolved(s);
    // onSolveChange only fires on a *change*, so the initially-solved cube
    // never celebrates on page load.
    if (s) {
      timer.stop();
      syncTimer();
      effects.celebrate();
    }
  };

  // Time up: red "TIMEOUT" pop, same animation style as the solve "GG".
  timer.onTimeout = () => effects.timeout();
  cube.onMoveDone = () => afterHistory();
  cube.onBusyChange = (busy) => {
    afterHistory();
    if (busy) return;
    if (playingBack) {
      playingBack = false;
      ui.setSolveEnabled(solverReady);
    }
    // A solve asked for while the cube was still turning now has a committed
    // state to read, so start it here (unless Cancel came in during the wait).
    if (pendingSolve) {
      pendingSolve = false;
      if (cancelFlag && cancelFlag[0] !== 0) ui.setSolver('solving', 'Solve cancelled');
      else startSolve();
    }
  };

  function afterHistory() {
    ui.setMoveCount(cube.history.length);
    ui.setUndoRedo(cube.history.length > 0, cube.redoStack.length > 0);
  }

  // While a search is in flight the worker will reply with moves computed for
  // the state it was given, and cube.solve() applies them to whatever the cube
  // is at when the reply lands. So no cube-changing input may happen until the
  // reply arrives; Cancel is the way out.
  const busySearch = () => {
    if (!solving) return true;
    ui.setSolver('solving', 'Solver: still searching - Cancel first');
    return false;
  };

  // ---- input -> cube / rig -----------------------------------------------
  new InputController(canvas, {
    onOrbit: (dt, dp) => rig.orbit(dt, dp),
    onZoom: (d) => rig.zoom(d),
    onMove: (move) => { if (busySearch()) cube.doMove(move); },
    getView: () => currentView(),
    modalOpen: () => ui.isHelpOpen(),
    onUndo: () => { if (busySearch() && cube.undo()) afterHistory(); },
    onRedo: () => { if (busySearch() && cube.redo()) afterHistory(); },
    onReset: () => { if (busySearch()) { cube.reset(); afterHistory(); } },
    onHelp: () => ui.toggleHelp(),
  });

  let pendingSolve = false;

  /** Send the current cube to the worker. Only legal on an idle cube: the worker
   * snapshots the state now, while CubeState only changes at animation commit,
   * so queued/in-flight moves would be missing from the search input. */
  const startSolve = () => {
    if (solving || cube.isBusy()) return;
    // Letting the solver do the work is not a timed run: freeze the clock.
    timer.stop();
    syncTimer();
    if (cube.solved) { ui.setSolver('solved', 'Solver: already solved'); return; }
    solving = true;
    if (cancelFlag) cancelFlag[0] = 0; // reset cancel for a new search
    ui.setSolveEnabled(false);
    // Cancel only works through the SharedArrayBuffer; without it (page served
    // without the COOP/COEP headers) the search cannot be interrupted, so do not
    // advertise a button that is a no-op.
    ui.showCancel(cancelFlag !== null);
    ui.setSolver('solving', cancelFlag ? 'Solving…' : 'Solving… (cannot be cancelled here)');
    worker.postMessage({
      type: 'solve',
      cubies: cube.state.cubies.map((c) => ({
        id: c.id, home: c.home, pos: c.pos, rot: c.rot, stickers: c.stickers,
      })),
      maxTimeMs: 0, // no hard limit; user can Cancel (solver posts live progress)
      cancel: cancelSab,
    });
  };

  // ---- ui actions --------------------------------------------------------
  ui.actions = {
    scramble: () => {
      if (!busySearch()) return;
      // Setting up a new scramble voids the run in progress: freeze the clock
      // (press Start again for the next attempt), same as Solve does.
      timer.stop();
      syncTimer();
      cube.scramble();
      afterHistory();
      ui.setSolver('ready', 'Solver: ready');
    },
    solve: () => {
      if (!solverReady || solving) return;
      if (cube.isBusy()) {
        // Wait for the cube to land, then solve the state it settles on.
        pendingSolve = true;
        ui.showCancel(cancelFlag !== null);
        ui.setSolver('solving', 'Solving… (queued: waiting for the cube to stop)');
        return;
      }
      startSolve();
    },
    undo: () => { if (busySearch() && cube.undo()) afterHistory(); },
    redo: () => { if (busySearch() && cube.redo()) afterHistory(); },
    reset: () => { if (!busySearch()) return; cube.reset(); afterHistory(); },
    help: () => ui.toggleHelp(),
    cancel: () => {
      pendingSolve = false; // Cancel during the "waiting for the cube" window
      if (cancelFlag) cancelFlag[0] = 1;
      else ui.setSolver('solving', 'Solver: cannot be cancelled here');
    },
    start: () => { timer.start(); syncTimer(); },
    stop: () => { timer.stop(); syncTimer(); },
    time: (stepSec) => { timer.setTime(timer.limit + stepSec); syncTimer(); },
  };

  // ---- initial UI state --------------------------------------------------
  ui.setSolved(cube.solved);
  ui.setMoveCount(0);
  ui.setUndoRedo(false, false);
  ui.setCurrentFace(currentView().front);
  syncTimer();

  // ---- resize ------------------------------------------------------------
  function onResize() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.aspect = aspect;
    // Widen FOV on narrow viewports so the cube still fits horizontally.
    camera.fov = aspect < 1 ? Math.min(70, 40 / Math.max(aspect, 0.6)) : 40;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', onResize);
  onResize();

  // ---- render loop -------------------------------------------------------
  function animate(now) {
    requestAnimationFrame(animate);
    cube.update(now);
    rig.update();
    timer.tick(now);
    syncTimer();

    // View-relative faces: viewFaces allocates, so only recompute while the
    // camera orientation is actually still changing (idle frames keep `view`).
    if (rig.moved) {
      view = viewFaces(camera.position, rig.target, camera.up);
      if (view.front !== litFace) {
        if (litCubie) litCubie.setGlow(false);
        litFace = view.front;
        litCubie = cube.centerCubie(view.front);
        if (litCubie) litCubie.setGlow(true);
        ui.setCurrentFace(view.front);
      }
    }
    if (litCubie) {
      // Roughly one blink per second, fading to nearly dark each cycle.
      litCubie.setGlowLevel(0.5 + 0.5 * Math.sin(now * 0.006));
    }

    effects.update(now);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(animate);
}

// not self-run: app.js calls mount() for the 3D route
