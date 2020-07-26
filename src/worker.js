import { Spresso } from './Spresso';
import * as tf from '@tensorflow/tfjs';
import { setWasmPath } from '@tensorflow/tfjs-backend-wasm';

let spresso = undefined;
let running = false;
let ready = false;
let updated = true;
let model = undefined;

setWasmPath('/tfjs-backend-wasm.wasm');
tf.setBackend('webgl').then(async () => {
  model = await tf.loadGraphModel('/spresso_tf/model.json');
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
    concentration_sn: await spresso.getCurrentConcentration().data(),
  }
  if (updateX) {
    plot.x = await spresso.grid_n.data();
  }
  postMessage({msg: 'update', plot: plot});
}

async function reset(input) {
  running = false;
  if (spresso) { spresso.reset(); }
  spresso = new Spresso(input, model);
  await requestUpdate(true);
}

async function simulate() {
  let shouldContinue = running;
  for (let i = 0; i < spresso.input.animateRate && shouldContinue; ++i) {
    shouldContinue = await spresso.simulateStep(model);
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
    default:
      console.log('Unrecognized message: ' + e.data.msg);
  }
}
