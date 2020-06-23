import { spressoBurger } from './Spresso';
import * as tf from '@tensorflow/tfjs';
import { setWasmPath } from '@tensorflow/tfjs-backend-wasm';

let spresso = undefined;
let running = false;
let ready = false;
let updated = false;

setWasmPath('/tfjs-backend-wasm.wasm');
tf.setBackend('wasm').then(() => {
  console.log("Tensorflow using " + tf.getBackend() + " backend.");
  ready = true;
});

async function requestUpdate(updateX=false) {
  if (!spresso) {
    return;
  }
  const plot = {
    t: spresso.getCurrentTime(),
    x: await spresso.grid_x.data(),
    y: await spresso.getCurrentConcentration().data(),
  }
  postMessage({msg: 'update', plot: plot});
}

async function reset(input) {
  running = false;
  if (spresso) { spresso.reset(); }
  spresso = new spressoBurger(input);
  await requestUpdate(true);
}

async function updateInput(input) {
  if (!spresso ||
      spresso.input.num_grids !== input.num_grids ||
      spresso.input.domain_len !== input.domain_len ||
      spresso.input.injection_loc !== input.injection_loc ||
      spresso.input.injection_width !== input.injection_width ||
      spresso.input.injection_amount !== input.injection_amount ||
      spresso.input.interface_width !== input.interface_width) {
    await reset(input);
  }
  else {
    spresso.input.sim_time = input.sim_time;
    spresso.input.animate_rate = input.animate_rate;
  }
}

async function simulate() {
  let shouldContinue = running;
  for (let i = 0; i < spresso.input.animate_rate && shouldContinue; ++i) {
    shouldContinue = spresso.simulateStep();
  }
  if (updated) {
    updated = false;
    await requestUpdate();
  }
  if (shouldContinue) {
    setTimeout(simulate, 0);
  }
  else {
    await requestUpdate();
    postMessage({msg: 'finished'});
    running = false;
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
