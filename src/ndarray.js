import { Base64 } from 'js-base64';

const typeMap = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
};

export class ndarray {
  constructor (data, shape) {
    this.data = data;
    this.shape = shape;
  }

  encode() {
    const { shape } = this;
    const data = Base64.fromUint8Array(new Uint8Array(this.data.buffer));
    return JSON.stringify({ data, shape, type: this.data.constructor.name });
  }

  static decode(dataStr) {
    const { data, shape, type } = JSON.parse(dataStr);
    const dataUint8 = Base64.toUint8Array(data);
    return new ndarray(new typeMap[type](dataUint8.buffer), shape);
  }
}
