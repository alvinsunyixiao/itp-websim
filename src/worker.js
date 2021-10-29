import {Cafes} from './Cafes';
import * as tf from '@tensorflow/tfjs';
import {setWasmPaths} from '@tensorflow/tfjs-backend-wasm';

let cafes = undefined;
let running = false;
let ready = false;
let updated = true;
let cafes_sim = undefined;
let cafes_init = undefined;

const initBackend = async () => {
  tf.enableProdMode();
  setWasmPaths('/cafes/tfjs-wasm/');
  await tf.setBackend('wasm');
  cafes_sim = await tf.loadGraphModel('/cafes/cafes-sim/model.json');
  cafes_init = await tf.loadGraphModel('/cafes/cafes-init/model.json');
  postMessage({msg: 'init', backend: tf.getBackend()});
};

initBackend().then(() => { ready = true; });

async function requestUpdate() {
  if (!cafes) {
    return;
  }
  updated = false;
  const plot = {
    x: (await cafes.grid_n.data()).map((val) => val * 1e3), // m => mm
    concentration_sn: cafes.getCurrentConcentration(),
    pH_n: cafes.getCurrentCH().map((val) => -Math.log10(val)), // cH => pH
    efield_n: cafes.getCurrentEField().map((val) => val * 1e-3), // V/m => V/mm
  }
  postMessage({msg: 'update', plot: plot, t: cafes.getCurrentTime()},
              [plot.x.buffer, plot.pH_n.buffer]);
}

async function reset(input) {
  running = false;
  if (cafes) { cafes.reset(); }
  cafes = new Cafes(input, cafes_sim, cafes_init);
  await cafes.init();
  await requestUpdate();
}

async function simulate() {
  let shouldContinue = running;
  while (shouldContinue) {
    for (let i = 0; i < cafes.input.animateRate && shouldContinue; ++i) {
      shouldContinue = (await cafes.simulateStep()) && running;
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
  if (running === true || cafes === undefined) { return; }
  const numSpecies = cafes.l_mat_sd.shape[0];
  const numGrids = cafes.input.numGrids;
  const numSteps = cafes.concentration_tsn.length;

  const concentration_tsn = new Float32Array(numSteps * numSpecies * numGrids);
  const cH_tn = new Float32Array(numSteps * numGrids);
  const efield_tn = new Float32Array(numSteps * numGrids);
  const time_t = new Float32Array(cafes.time_t);

  for (let i = 0; i < cafes.time_t.length; ++i) {
    concentration_tsn.set(cafes.concentration_tsn[i], i * numSpecies * numGrids);
    efield_tn.set(cafes.efield_tn[i], i * numGrids);
    cH_tn.set(cafes.cH_tn[i], i * numGrids);
  }

  postMessage({
    msg: 'data',
    result: {concentration_tsn, cH_tn, efield_tn, time_t},
    input: cafes.input,
  }, [concentration_tsn.buffer, cH_tn.buffer, efield_tn.buffer, time_t.buffer]);
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
