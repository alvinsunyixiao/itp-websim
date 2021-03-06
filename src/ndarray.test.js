import { ndarray } from './ndarray';

test('ndarray float32', () => {
  const float32Arr = new ndarray(new Float32Array([1, 4, 2, 8, 5, 7]), [2, 3]);
  const encoded = JSON.stringify(float32Arr);
  const decoded = ndarray.decode(JSON.parse(encoded));
  expect(decoded.data).toBeInstanceOf(Float32Array);
  decoded.data.forEach((val, idx) => expect(val === float32Arr.data[idx]).toBe(true));
  decoded.shape.forEach((val, idx) => expect(val === float32Arr.shape[idx]).toBe(true));
})
