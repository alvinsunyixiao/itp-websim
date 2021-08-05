import {Spresso} from './Spresso';
import * as tf from '@tensorflow/tfjs';
import {setWasmPath} from '@tensorflow/tfjs-backend-wasm';

let spresso = undefined;
let running = false;
let ready = false;
let updated = true;
let spresso_sim = undefined;
let spresso_ph = undefined;

const initBackend = async () => {
  tf.enableProdMode();
  setWasmPath('/swift/tfjs-wasm/tfjs-backend-wasm.wasm');
  await tf.setBackend('wasm');
  spresso_sim = await tf.loadGraphModel('/swift/spresso-sim/model.json');
  spresso_ph = await tf.loadGraphModel('/swift/spresso-ph/model.json');
  postMessage({msg: 'init', backend: tf.getBackend()});
};

initBackend().then(() => { ready = true; });

async function requestUpdate() {
  if (!spresso) {
    return;
  }
  updated = false;
  const plot = {
    x: (await spresso.grid_n.data()).map((val) => val * 1e3), // m => mm
    concentration_sn: spresso.getCurrentConcentration(),
    pH_n: spresso.getCurrentCH().map((val) => -Math.log10(val)), // cH => pH
  }
  postMessage({msg: 'update', plot: plot, t: spresso.getCurrentTime()}, [plot.x.buffer]);
}

async function reset(input) {
  running = false;
  if (spresso) { spresso.reset(); }
  spresso = new Spresso(input, spresso_sim, spresso_ph);
  await spresso.init();
  await requestUpdate();
}

async function simulate() {
  let shouldContinue = running;
  while (shouldContinue) {
    for (let i = 0; i < spresso.input.animateRate && shouldContinue; ++i) {
      shouldContinue = (await spresso.simulateStep()) && running;
      // avoid blocking message handler
      if (tf.getBackend() !== 'webgl') { await new Promise(r => setTimeout(r, 0)); }
    }
    if (updated) { await requestUpdate(); }
  }
  running = false;
  await requestUpdate();
  postMessage({msg: 'finished'});
}

function retrieve() {
  if (running === true || spresso === undefined) { return; }
  const numSpecies = spresso.l_mat_sd.shape[0];
  const numGrids = spresso.input.numGrids;
  const numSteps = spresso.concentration_tsn.length;

  const concentration_tsn = new Float32Array(numSteps * numSpecies * numGrids);
  const cH_tn = new Float32Array(numSteps * numGrids);
  const time_t = new Float32Array(spresso.time_t);

  for (let i = 0; i < spresso.time_t.length; ++i) {
    concentration_tsn.set(spresso.concentration_tsn[i], i * numSpecies * numGrids);
    cH_tn.set(spresso.cH_tn[i], i * numGrids);
  }

  postMessage({
    msg: 'data',
    result: {concentration_tsn, cH_tn, time_t},
    input: spresso.input,
  }, [concentration_tsn.buffer, cH_tn.buffer, time_t.buffer]);
}

onmessage = function(e) {
  if (!ready) {
    setTimeout(() => onmessage(e), 100);
    return;
  }
  switch (e.data.msg) {
    case 'reset':
      running = false;
      reset(e.data.input).catch((err) => {
        console.warn("Input invalid: ", err);
      });
      break;
    case 'start':
      updated = true;
      running = true;
      simulate();
      break;
    case 'pause':
      running = false;
      break;
    case 'updated':
      updated = true;
      break;
    case 'retrieve':
      retrieve();
      break;
    default:
      console.log('Unrecognized message: ' + e.data.msg);
  }
}
