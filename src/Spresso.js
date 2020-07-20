import * as tf from '@tensorflow/tfjs';
import { range, chain } from 'mathjs';

/*
 * simTime:      physical time in [s]
 * numGrids:     number of grid points
 * domainLen:    domain length in [m]
 * animateRate:  animation rate in [steps / animation]
 * species:       a dictionary of species properties
 **/
export class SpressoInput {
  constructor(simTime, animateRate, numGrids, domainLen, interfaceWidth, species) {
    // convert type+unit to SI
    this.simTime = simTime;
    this.animateRate = animateRate;
    this.numGrids = numGrids;
    this.domainLen = domainLen;
    this.interfaceWidth = interfaceWidth;
    this.species = species;
  }
}

export class Spresso {
  parseInput(input) {
    return {
      simTime:        parseFloat(input.simTime),
      animateRate:    parseInt(input.animateRate),
      numGrids:       parseInt(input.numGrids),
      domainLen:      parseFloat(input.domainLen) * 1e-3,
      interfaceWidth: parseFloat(input.interfaceWidth) * 1e-3,
      species:        input.species.map((specie) => ({
        ...specie,
        injectionAmount:    parseFloat(specie.injectionAmount) * 1e-3,
        injectionLoc:       parseFloat(specie.injectionLoc) * 1e-3,
        injectionWidth:     parseFloat(specie.injectionWidth) * 1e-3,
        initConcentration:  parseFloat(specie.initConcentration),
      })),
    }
  }

  constructor(input, model) {
    input = this.parseInput(input);
    this.input = input;
    this.model = model;
    this.dx = input.domainLen / input.numGrids;
    this.dt = 0.2 * this.dx;
    this.step = 0;
    const grid_x_arr = range(0, input.domainLen, this.dx);
    this.grid_x = tf.tensor1d(grid_x_arr.toArray());
    this.time_t = [0];
    const concentration_sx = input.species.map(specie => {
      const { interfaceWidth } = input;
      const { injectionLoc, injectionWidth, injectionAmount, initConcentration } = specie;
      switch (specie.injectionType) {
        case 'TE':
          return tf.tidy(() => {
            const erf_te = tf.tensor1d(chain(grid_x_arr)
              .add(-injectionLoc).divide(interfaceWidth).erf().done().toArray());
            return erf_te.neg().add(1).mul(initConcentration/2);
          });
        case 'LE':
          return tf.tidy(() => {
            const erf_le = tf.tensor1d(chain(grid_x_arr)
              .add(-injectionLoc).divide(interfaceWidth).erf().done().toArray());
            return erf_le.add(1).mul(initConcentration/2);
          });
        case 'Analyte':
          return tf.tidy(() => {
            const erf_l = tf.tensor1d(chain(grid_x_arr)
              .add(-injectionLoc+injectionWidth/2)
              .divide(interfaceWidth).erf().done().toArray());
            const erf_r = tf.tensor1d(chain(grid_x_arr)
              .add(-injectionLoc-injectionWidth/2)
              .divide(interfaceWidth).erf().done().toArray());
            const lhs = erf_l.add(1);
            const rhs = erf_r.add(1);
            const c_raw = lhs.sub(rhs);
            const c0_over_2 = tf.scalar(injectionAmount/this.dx).div(tf.sum(c_raw));
            return c_raw.mul(c0_over_2);
          });
        default:
          console.log('Unsupported specie type ' + specie.type);
      }
      return undefined;
    });
    this.concentration_tsx = concentration_sx.length ?
      [tf.stack(concentration_sx)] : [tf.tensor1d([])];
    concentration_sx.forEach(concentration_x => concentration_x.dispose());
  }

  getCurrentStep() {
    return this.time_t.length - 1;
  }

  getCurrentTime() {
    return this.time_t[this.time_t.length - 1];
  }

  getCurrentConcentration() {
    return this.concentration_tsx[this.concentration_tsx.length - 1];
  }

  getAllConcentration() {
    return tf.stack(this.concentration_tsx);
  }

  simulateStep() {
    if (this.getCurrentTime() >= this.input.simTime) {
      return false;
    }

    const { dt, dx } = this;
    const t = this.getCurrentTime();
    const concentration_sx = this.getCurrentConcentration();
    const new_concentration_sx = tf.tidy(() => this.model.execute({
      concentration_sx: concentration_sx,
      alpha_s: tf.tensor([0.5, 1.]),
      dt: tf.scalar(dt, 'float32'),
      dx: tf.scalar(dx, 'float32'),
    }));

    this.time_t.push(t + dt);
    this.concentration_tsx.push(new_concentration_sx);

    return true;
  }

  reset() {
    this.concentration_tsx.forEach(c => c.dispose());
    this.grid_x.dispose();
  }
}
