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
  constructor(simTime, animateRate,
              numGrids, tolerance, interfaceWidth,
              domainLen, current, area, species) {
    // convert type+unit to SI
    this.simTime = simTime;
    this.animateRate = animateRate;
    this.numGrids = numGrids;
    this.tolerance = tolerance;
    this.interfaceWidth = interfaceWidth;
    this.domainLen = domainLen;
    this.current = current;
    this.area = area;
    this.species = species;
  }

  parseProperties(specie, maxNumValence) {
    const maxDeg = maxNumValence + 1;
    if (!specie.propertyValid) {
      return {
        zList: Array(maxDeg).fill(0.),
        uList: Array(maxDeg).fill(0.),
        dList: Array(maxDeg).fill(0.),
        coeffList: Array(maxDeg).fill(0.) };
    }
    const valences = specie.valence.replace(' ', '').split(',').map((v) => parseFloat(v));
    const mobilities = specie.mobility.replace(' ', '').split(',').map((v) =>
      parseFloat(v) * 1e-9);
    const pKas = specie.pKa.replace(' ', '').split(',').map((v) => Math.pow(10, -parseFloat(v)));
    const R = 8.314, T = 298.0, F = 96500.0; // Gas, room temperature (K), Faraday constants
    // zip all properties
    const properties = valences.map((_, idx) => ({
      valence: valences[idx],
      mobility: mobilities[idx] * Math.sign(valences[idx]),
      pKa: pKas[idx],
      diffusivity: Math.abs(R * T * mobilities[idx] / (F * valences[idx])),
    }));
    // add in valence 0
    properties.push({
      valence: 0.,
      mobility: 0.,
      pKa: 1.,
      diffusivity: properties.reduce((sum, a) => (sum + a.diffusivity), 0) / properties.length,
    });
    // sort according to valence
    properties.sort((a, b) => (a.valence - b.valence));
    // unzip data
    const zList = properties.map((prop) => prop.valence)
                            .concat(Array(maxDeg - properties.length).fill(0));
    const uList = properties.map((prop) => prop.mobility)
                            .concat(Array(maxDeg - properties.length).fill(0));
    const dList = properties.map((prop) => prop.diffusivity)
                            .concat(Array(maxDeg - properties.length).fill(0));
    // calculate equilibrium coefficients
    const minValence = parseInt(properties[0].valence);
    const pKaList = properties.map((prop) => prop.pKa);
    const coeffList = properties.map((prop, idx) => {
      if (prop.valence < 0) {
        return pKaList.slice(idx, -minValence).reduce((a, b) => a * b);
      } else if (prop.valence > 0) {
        return 1 / pKaList.slice(-minValence, idx+1).reduce((a, b) => a * b);
      } else {
        return 1.;
      }
    }).concat(Array(maxDeg - properties.length).fill(0));
    return { zList, uList, dList, coeffList };
  }

  parse() {
    const maxNumValence = this.species.reduce((acc, a) =>
      (Math.max(acc, a.valence.split(',').length)), 0);
    return {
      simTime:        parseFloat(this.simTime),
      animateRate:    parseInt(this.animateRate),
      numGrids:       parseInt(this.numGrids),
      tolerance:      parseFloat(this.tolerance),
      interfaceWidth: parseFloat(this.interfaceWidth) * 1e-3,
      domainLen:      parseFloat(this.domainLen) * 1e-3,
      current:        -parseFloat(this.current) / parseFloat(this.area * 1e-6),
      area:           parseFloat(this.area) * 1e-12,
      species:        this.species.map((specie) => ({
        ...this.parseProperties(specie, maxNumValence),
        name:               specie.name,
        injectionType:      specie.injectionType,
        injectionAmount:    parseFloat(specie.injectionAmount) * 1e-12,
        injectionLoc:       parseFloat(specie.injectionLoc) * 1e-3,
        injectionWidth:     parseFloat(specie.injectionWidth) * 1e-3,
        initConcentration:  parseFloat(specie.initConcentration),
      })),
    }
  }
}

export class Spresso {
  constructor(input, model_sim, model_ph) {
    this.input = input;
    this.model_sim = model_sim;
    this.model_ph = model_ph;
    this.dx = input.domainLen / input.numGrids;
    this.step = 0;
    const grid_n_arr = range(0, input.domainLen, this.dx);
    this.grid_n = tf.tensor1d(grid_n_arr.toArray());
    this.t = 0.;
    // initial concentration
    const concentration_sn = input.species.map(specie => {
      const { interfaceWidth } = input;
      const { injectionLoc, injectionWidth, injectionAmount, initConcentration } = specie;
      switch (specie.injectionType) {
        case 'TE':
          return tf.tidy(() => {
            const erf_te = tf.tensor1d(chain(grid_n_arr)
              .add(-injectionLoc).divide(.5*interfaceWidth).erf().done().toArray());
            return erf_te.neg().add(1).mul(initConcentration/2);
          });
        case 'LE':
          return tf.tidy(() => {
            const erf_le = tf.tensor1d(chain(grid_n_arr)
              .add(-injectionLoc).divide(.5*interfaceWidth).erf().done().toArray());
            return erf_le.add(1).mul(initConcentration/2);
          });
        case 'Analyte':
          return tf.tidy(() => {
            const erf_l = tf.tensor1d(chain(grid_n_arr)
              .add(-injectionLoc+injectionWidth/2)
              .divide(.5*interfaceWidth).erf().done().toArray());
            const erf_r = tf.tensor1d(chain(grid_n_arr)
              .add(-injectionLoc-injectionWidth/2)
              .divide(.5*interfaceWidth).erf().done().toArray());
            const lhs = erf_l.add(1);
            const rhs = erf_r.add(1);
            const c_raw = lhs.sub(rhs);
            const c0_over_2 = tf.scalar(injectionAmount/(this.dx*this.input.area))
                                .div(tf.sum(c_raw));
            return c_raw.mul(c0_over_2);
          });
        case 'Background':
          return tf.tidy(() => tf.onesLike(this.grid_n).mul(initConcentration));
        default:
          console.log('Unsupported specie type ' + specie.type);
      }
      return undefined;
    });
    this.dt = tf.scalar(1e-3, 'float32');
    this.dx = tf.scalar(this.dx, 'float32');
    this.current = tf.scalar(this.input.current, 'float32');
    this.tolerance = tf.scalar(this.input.tolerance, 'float32');
    this.concentration_sn = concentration_sn.length ?
      tf.stack(concentration_sn) : tf.tensor1d([]);
    concentration_sn.forEach(concentration_n => concentration_n.dispose());
    // equilibrium params
    this.val_mat_sd = tf.stack(input.species.map((specie) => specie.zList));
    this.u_mat_sd = tf.stack(input.species.map((specie) => specie.uList));
    this.d_mat_sd = tf.stack(input.species.map((specie) => specie.dList));
    this.l_mat_sd = tf.stack(input.species.map((specie) => specie.coeffList));
  }

  async init() {
    // initialize pH
    this.cH_n = await this.model_ph.executeAsync({
      c_mat_sn: this.concentration_sn,
      l_mat_sd: this.l_mat_sd,
      val_mat_sd: this.val_mat_sd,
    });
    // saved temporal slices
    this.concentration_tsn = [await this.concentration_sn.data()];
    this.cH_tn = [await this.cH_n.data()];
    this.time_t = [this.t];
  }

  async simulateStep() {
    if (this.t >= this.input.simTime) {
      return false;
    }

    const [new_cH_n, new_concentration_sn, dt, new_dt] = await this.model_sim.executeAsync({
      ch_n: this.cH_n,
      c_mat_sn: this.concentration_sn,
      l_mat_sd: this.l_mat_sd,
      val_mat_sd: this.val_mat_sd,
      u_mat_sd: this.u_mat_sd,
      d_mat_sd: this.d_mat_sd,
      current: this.current,
      dx: this.dx,
      dt: this.dt,
      tolerance: this.tolerance,
    }, ['Identity:0', 'Identity_1:0', 'Identity_2:0', 'Identity_3:0']);

    // update time
    this.t += (await dt.data())[0];
    // dispose previous states
    dt.dispose();
    this.concentration_sn.dispose();
    this.cH_n.dispose();
    this.dt.dispose();
    // update to new states
    this.concentration_sn = new_concentration_sn;
    this.cH_n = new_cH_n;
    this.dt = new_dt;
    // extract data
    this.time_t.push(this.t);
    this.concentration_tsn.push(await this.concentration_sn.data());
    this.cH_tn.push(await this.cH_n.data());

    return true;
  }

  getCurrentConcentration() {
    return this.concentration_tsn[this.concentration_tsn.length - 1];
  }

  getCurrentCH() {
    return this.cH_tn[this.cH_tn.length - 1];
  }

  getCurrentTime() {
    return this.t;
  }

  reset() {
    this.concentration_sn.dispose();
    this.l_mat_sd.dispose();
    this.val_mat_sd.dispose();
    this.u_mat_sd.dispose();
    this.d_mat_sd.dispose();
    if (this.cH_n) { this.cH_n.dispose(); }
    this.grid_n.dispose();
    this.dt.dispose();
    this.dx.dispose();
    this.current.dispose();
    this.tolerance.dispose();
  }
}
