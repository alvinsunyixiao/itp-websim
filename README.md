# Spresso Web - An  Isotachphoresis Simulator

This project is a web based GPU-accelerated re-implementation of 
[Spresso](http://stanfordspresso.blogspot.com/) (Stanford Public Release Electrophoretic 
Sparation Solver). It adopts a pure-frontend implementation that removes the requirement 
for a backend compute server. This means that all computations run entirely on local browsers,
providing a maximum degree of real-time user interactivity.

## Implementation Notes

High dimensional array processing is done via 
[TensorFlow JavaScript](https://www.tensorflow.org/js). A simulation step is defined as
a TensorFlow computation graph [here](model/spresso_tf.py). The graph is serialized and 
saved as a [TF SavedModel](https://www.tensorflow.org/guide/saved_model).
The model is then loaded by the JavaScript frontend, and inference is done by executing
the graph. The computation can be accelerated both on GPU (via
WebGL) and CPU (via WebAssembly), thanks to 
[tfjs-backend-webgl](https://github.com/tensorflow/tfjs/tree/master/tfjs-backend-webgl)
and
[tfjs-backend-wasm](https://github.com/tensorflow/tfjs/tree/master/tfjs-backend-wasm).

## Serving

This project is bootstrapped with 
[Create React App](https://github.com/facebook/create-react-app). Follow their instructions 
to setup and serve the project.


