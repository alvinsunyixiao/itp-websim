import * as tf from '@tensorflow/tfjs';
import { range, chain } from 'mathjs';

/*
 * sim_time:      physical time in [s]
 * num_grids:     number of grid points
 * domain_len:    domain length in [m]
 * animate_rate:  animation rate in [steps / animation]
 * species:       a dictionary of species properties
 **/
export class SpressoInput {
  constructor(sim_time, animate_rate, num_grids, domain_len, species) {
    this.sim_time = sim_time;
    this.animate_rate = animate_rate;
    this.num_grids = num_grids;
    this.domain_len = domain_len;
    this.species = species;
  }
}

export class Spresso {
  constructor(input, model) {
    this.input = input;
    this.model = model;
    this.dx = input.domain_len / (input.num_grids - 1);
    this.dt = 0.2 * this.dx;
    this.step = 0;
    const grid_x_arr = range(0, input.domain_len, this.dx);
    this.grid_x = tf.tensor1d(grid_x_arr.toArray());
    this.time_t = [0];
    const concentration_sx = input.species.map(specie => {
      const { injection_loc, injection_width, injection_amount, interface_width, 
              init_concentration } = specie;
      switch (specie.injection_type) {
        case 'TE':
          const erf_te = tf.tensor1d(chain(grid_x_arr)
            .add(-injection_loc).divide(interface_width).erf().done().toArray());
          return erf_te.neg().add(1).mul(init_concentration/2);
        case 'LE':
          const erf_le = tf.tensor1d(chain(grid_x_arr)
            .add(-injection_loc).divide(interface_width).erf().done().toArray());
          return erf_le.add(1).mul(init_concentration/2);
        case 'Anaylyte':
          const erf_l = tf.tensor1d(chain(grid_x_arr)
            .add(-injection_loc+injection_width/2).divide(interface_width).erf().done().toArray());
          const erf_r = tf.tensor1d(chain(grid_x_arr)
            .add(-injection_loc-injection_width/2).divide(interface_width).erf().done().toArray());
        default:
          console.log('Unsupported specie type ' + specie.type);
      }
      return undefined;
    });
    this.concentration_tsx = [tf.stack(concentration_sx)];
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
    if (this.getCurrentTime() >= this.input.sim_time) {
      return false;
    }

    const { dt, dx } = this;
    const t = this.getCurrentTime();
    const concentration_sx = this.getCurrentConcentration();
    const new_concentration_sx = tf.tidy(() => this.model.execute({
      concentration_sx: concentration_sx,
      alpha_s: tf.tensor(
        this.input.species.map(specie => specie.alpha), [2], 'float32'),
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
