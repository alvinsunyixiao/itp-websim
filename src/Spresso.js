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
    const zList = new Float32Array(maxNumValence + 1);
    const uList = new Float32Array(maxNumValence + 1)
    const dList = new Float32Array(maxNumValence + 1);
    const coeffList = new Float32Array(maxNumValence + 1);
    if (!specie.propertyValid) { return { zList, uList, dList, coeffList }; }
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
    zList.set(properties.map((prop) => prop.valence));
    uList.set(properties.map((prop) => prop.mobility));
    dList.set(properties.map((prop) => prop.diffusivity));
    // calculate equilibrium coefficients 
    const minValence = parseInt(properties[0].valence);
    const pKaList = properties.map((prop) => prop.pKa);
    coeffList.set(properties.map((prop, idx) => {
      if (prop.valence < 0) { 
        return pKaList.slice(idx, -minValence).reduce((a, b) => a * b); 
      } else if (prop.valence > 0) { 
        return 1 / pKaList.slice(-minValence, idx+1).reduce((a, b) => a * b); 
      } else {
        return 1.;
      }
    }));
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
      current:        -parseFloat(this.current) / parseFloat(this.area),
      species:        this.species.map((specie) => ({
        ...this.parseProperties(specie, maxNumValence),
        name:               specie.name,
        injectionType:      specie.injectionType,
        injectionAmount:    parseFloat(specie.injectionAmount) * 1e-3,
        injectionLoc:       parseFloat(specie.injectionLoc) * 1e-3,
        injectionWidth:     parseFloat(specie.injectionWidth) * 1e-3,
        initConcentration:  parseFloat(specie.initConcentration),
      })),
    }
  }
}

export class Spresso {
  constructor(input, model) {
    this.input = input;
    this.model = model;
    this.dx = input.domainLen / input.numGrids;
    this.dt = tf.scalar(1e-3, 'float32');
    this.step = 0;
    const grid_n_arr = range(0, input.domainLen, this.dx);
    this.grid_n = tf.tensor1d(grid_n_arr.toArray());
    this.time_t = [0];
    // initial concentration
    const concentration_sn = input.species.map(specie => {
      const { interfaceWidth } = input;
      const { injectionLoc, injectionWidth, injectionAmount, initConcentration } = specie;
      switch (specie.injectionType) {
        case 'TE':
          return tf.tidy(() => {
            const erf_te = tf.tensor1d(chain(grid_n_arr)
              .add(-injectionLoc).divide(interfaceWidth).erf().done().toArray());
            return erf_te.neg().add(1).mul(initConcentration/2);
          });
        case 'LE':
          return tf.tidy(() => {
            const erf_le = tf.tensor1d(chain(grid_n_arr)
              .add(-injectionLoc).divide(interfaceWidth).erf().done().toArray());
            return erf_le.add(1).mul(initConcentration/2);
          });
        case 'Analyte':
          return tf.tidy(() => {
            const erf_l = tf.tensor1d(chain(grid_n_arr)
              .add(-injectionLoc+injectionWidth/2)
              .divide(interfaceWidth).erf().done().toArray());
            const erf_r = tf.tensor1d(chain(grid_n_arr)
              .add(-injectionLoc-injectionWidth/2)
              .divide(interfaceWidth).erf().done().toArray());
            const lhs = erf_l.add(1);
            const rhs = erf_r.add(1);
            const c_raw = lhs.sub(rhs);
            const c0_over_2 = tf.scalar(injectionAmount/this.dx).div(tf.sum(c_raw));
            return c_raw.mul(c0_over_2);
          });
        case 'Background':
          return tf.tidy(() => tf.onesLike(this.grid_n).mul(initConcentration));
        default:
          console.log('Unsupported specie type ' + specie.type);
      }
      return undefined;
    });
    this.concentration_tsn = concentration_sn.length ?
      [tf.stack(concentration_sn)] : [tf.tensor1d([])];
    concentration_sn.forEach(concentration_n => concentration_n.dispose());
    // initial cH                   pH 7 == 10^-7 mole / L == 10^-4 mole / m^3
    this.cH_n = tf.tidy(() => tf.onesLike(this.grid_n).mul(1e-7 * 1e3));
    // equilibrium params
    this.val_mat_sd = tf.stack(input.species.map((specie) => specie.zList));
    this.u_mat_sd = tf.stack(input.species.map((specie) => specie.uList));
    this.d_mat_sd = tf.stack(input.species.map((specie) => specie.dList));
    this.l_mat_sd = tf.stack(input.species.map((specie) => specie.coeffList));
  }

  getCurrentStep() {
    return this.time_t.length - 1;
  }

  getCurrentTime() {
    return this.time_t[this.time_t.length - 1];
  }

  getCurrentConcentration() {
    return this.concentration_tsn[this.concentration_tsn.length - 1];
  }

  getAllConcentration() {
    return tf.stack(this.concentration_tsn);
  }

  async simulateStep() {
    if (this.getCurrentTime() >= this.input.simTime) {
      return false;
    }

    const [new_cH_n, new_concentration_sn, dt, new_dt] = await this.model.executeAsync({
      ch_n: this.cH_n,
      c_mat_sn: this.getCurrentConcentration(),
      l_mat_sd: this.l_mat_sd,
      val_mat_sd: this.val_mat_sd,
      u_mat_sd: this.u_mat_sd,
      d_mat_sd: this.d_mat_sd,
      current: tf.scalar(this.input.current, 'float32'),
      dx: tf.scalar(this.dx, 'float32'),
      dt: this.dt,
      tolerance: tf.scalar(this.input.tolerance, 'float32'),
    });

    console.log(new_cH_n.shape, new_concentration_sn.shape, dt.shape, new_dt.shape);

    const t = this.getCurrentTime();
    this.time_t.push(t + await dt.data());
    this.concentration_tsn.push(new_concentration_sn);
    this.cH_n = new_cH_n;
    this.dt = new_dt;

    return true;
  }

  reset() {
    this.concentration_tsn.forEach(c => c.dispose());
    this.grid_n.dispose();
  }
}
