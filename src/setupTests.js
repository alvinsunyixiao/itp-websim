// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/extend-expect';
import 'jest-canvas-mock';

class Worker {
  constructor(url) {
    this.url = url;
    this.onmessage = (e) => {};
    this.postMessage = (msg) => {};
  }
}

window.URL.createObjectURL = function() {};
window.Worker = Worker;
