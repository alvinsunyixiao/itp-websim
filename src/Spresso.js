import * as tf from '@tensorflow/tfjs'

/*
 * sim_time:      physical time in [s]
 * num_grids:     number of grid points
 * domain_len:    domain length in [m]
 * animate_rate:  animation rate in [steps / animation]
 **/

export class spressoBurgerInput {
  constructor(sim_time, animate_rate, num_grids, domain_len,
              injection_loc, injection_width, injection_amount, interface_width) {
    this.sim_time = sim_time;
    this.animate_rate = animate_rate;
    this.num_grids = num_grids;
    this.domain_len = domain_len;
    this.injection_loc = injection_loc;
    this.injection_width = injection_width;
    this.injection_amount = injection_amount;
    this.interface_width = interface_width;
  }
}

export class spressoBurger {
  constructor(input) {
    this.input = input;
    this.dx = input.domain_len / (input.num_grids - 1);
    this.dt = this.dx
    this.step = 0;
    this.grid_x = tf.linspace(0, input.domain_len, input.num_grids);
    this.time_t = [0];
    this.concentration_tx = [tf.tidy(() => {
      const { injection_loc, injection_width, injection_amount, interface_width } = this.input;
      const erf_l = this.grid_x.add(-injection_loc+injection_width/2.).div(interface_width).erf();
      const erf_r = this.grid_x.add(-injection_loc-injection_width/2.).div(interface_width).erf();
      const c_norm = tf.sub(erf_l, erf_r).mul(0.5);
      const c_norm_integral = c_norm.sum().mul(this.dx);
      const c0 = tf.div(injection_amount, c_norm_integral);
      return c_norm.mul(c0);
    })]
  }

  calcFlux(numeric_step=0) {
    const N = this.input.num_grids;
    const { dx } = this;
    const concentration_x = this.getCurrentConcentration().add(numeric_step);
    const c_right = concentration_x.slice([1], [N-1]);
    const c_left = concentration_x.slice([0], [N-1]);
    const flux = tf.sub(
      tf.add(c_right.square(), c_left.square()).mul(0.5),
      tf.abs(c_right.add(c_left)).mul(c_right.sub(c_left)).mul(0.5)
    );
    const rhs = tf.sub(flux.slice([0], [N-2]), flux.slice([1], [N-2])).div(dx);
    const rhs_pad = rhs.pad([[1, 1]]);
    return rhs_pad;
  }

  getCurrentStep() {
    return this.time_t.length - 1;
  }

  getCurrentTime() {
    return this.time_t[this.time_t.length - 1];
  }

  getCurrentConcentration() {
    return this.concentration_tx[this.concentration_tx.length - 1];
  }

  getAllConcentration() {
    return tf.stack(this.concentration_tx);
  }

  simulateStep() {
    if (this.getCurrentTime() >= this.input.sim_time) {
      return false;
    }

    const { dt } = this;
    const concentration_x = this.getCurrentConcentration();
    const t = this.getCurrentTime();
    const k1 = tf.tidy(() => this.calcFlux());
    const k2 = tf.tidy(() => this.calcFlux(k1.mul(0.5*dt)));
    const k3 = tf.tidy(() => this.calcFlux(k2.mul(0.5*dt)));
    const k4 = tf.tidy(() => this.calcFlux(k3.mul(dt)));
    const flux = tf.tidy(() => k1.add(k2.mul(2)).add(k3.mul(2)).add(k4).div(6));
    const new_concentration_x = tf.tidy(() => flux.mul(dt).add(concentration_x));

    this.time_t.push(t + dt);
    this.concentration_tx.push(new_concentration_x);

    k1.dispose();
    k2.dispose();
    k3.dispose();
    k4.dispose();
    flux.dispose();

    return true;
  }

  reset() {
    this.concentration_tx.forEach(c => c.dispose());
    this.grid_x.dispose();
  }
}
