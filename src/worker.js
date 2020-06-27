import { Spresso } from './Spresso';
import * as tf from '@tensorflow/tfjs';
import { setWasmPath } from '@tensorflow/tfjs-backend-wasm';

let spresso = undefined;
let running = false;
let ready = false;
let updated = true;
let model = undefined;

setWasmPath('/tfjs-backend-wasm.wasm');
tf.setBackend('wasm').then(async () => {
  model = await tf.loadGraphModel('/spresso_web/model.json');
  console.log("Tensorflow using " + tf.getBackend() + " backend.");
  ready = true;
});

async function requestUpdate(updateX=false) {
  if (!spresso) {
    return;
  }
  updated = false;
  let plot = {
    t: spresso.getCurrentTime(),
    concentration_sx: await spresso.getCurrentConcentration().data(),
  }
  if (updateX) {
    plot.x = await spresso.grid_x.data();
  }
  postMessage({msg: 'update', plot: plot});
}

async function reset(input) {
  running = false;
  if (spresso) { spresso.reset(); }
  spresso = new Spresso(input, model);
  await requestUpdate(true);
}

async function updateInput(input) {
  await reset(input);
  spresso.input.sim_time = input.sim_time;
  spresso.input.animate_rate = input.animate_rate;
}

async function simulate() {
  let shouldContinue = running;
  for (let i = 0; i < spresso.input.animate_rate && shouldContinue; ++i) {
    shouldContinue = spresso.simulateStep(model);
  }
  if (shouldContinue) {
    setTimeout(simulate, 0);
  }
  else {
    running = false;
    await requestUpdate();
    postMessage({msg: 'finished'});
  }
  if (updated) {
    await requestUpdate();
  }
}

onmessage = function(e) {
  if (!ready) {
    setTimeout(() => onmessage(e), 100);
    return;
  }
  switch (e.data.msg) {
    case 'reset':
      reset(e.data.input);
      break;
    case 'update input':
      updateInput(e.data.input);
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
    case 'config':
      postMessage({msg: 'config', config: spresso.input});
      break;
    default:
      console.log('Unrecognized message: ' + e.data.msg);
  }
}
