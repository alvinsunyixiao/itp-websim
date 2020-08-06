import { Spresso } from './Spresso';
import * as tf from '@tensorflow/tfjs';

let spresso = undefined;
let running = false;
let ready = false;
let updated = true;
let spresso_sim = undefined;
let spresso_ph = undefined;

const initBackend = async () => {
  tf.enableProdMode();
  if (tf.ENV.getBool('WEBGL_RENDER_FLOAT32_CAPABLE')) {
    await tf.setBackend('webgl');
  }
  else {
    await tf.setBackend('cpu');
  }
  spresso_sim = await tf.loadGraphModel('/spresso_sim/model.json');
  spresso_ph = await tf.loadGraphModel('/spresso_ph/model.json');
  postMessage({msg: 'init', backend: tf.getBackend()});
};

initBackend().then(() => { ready = true; });

async function requestUpdate() {
  if (!spresso) {
    return;
  }
  updated = false;
  const plot = {
    x: await spresso.grid_n.data(),
    concentration_sn: spresso.getCurrentConcentration(),
    pH_n: spresso.getCurrentCH().map((val) => -Math.log10(val)),
  }
  postMessage({msg: 'update', plot: plot, t: spresso.getCurrentTime()});
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
  for (let i = 0; i < spresso.input.animateRate && shouldContinue; ++i) {
    shouldContinue = await spresso.simulateStep();
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
    default:
      console.log('Unrecognized message: ' + e.data.msg);
  }
}
