import React from 'react';
import './App.css';
// bootstrap stuff
import 'bootstrap/dist/css/bootstrap.min.css';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import FormControl from 'react-bootstrap/FormControl';
import InputGroup from 'react-bootstrap/InputGroup';
import Jumbotron from 'react-bootstrap/Jumbotron';
// tensorflow stuff
import * as tf from '@tensorflow/tfjs'
// plotly
import Plot from 'react-plotly.js'
// cookies
import { Cookies } from 'react-cookie'

const cookies = new Cookies();

const default_input = {
  sim_time:       0.05,
  num_grids:      250,
  domain_len:     10,
  animation_rate: 30,
};

class InputNumber extends React.Component {
  constructor(props) {
    super(props)
    const { name } = this.props;
    let value = cookies.get(name);
    if (value === undefined) {
      value = default_input[name];
      cookies.set(name, value);
    }
    this.props.update(name, value);
  }

  onChange(event) {
    cookies.set(event.target.name, event.target.value);
    if (this.props.update !== undefined) {
      this.props.update(event.target.name, event.target.value);
    }
  }

  render() {
    const { hint, placeholder, name } = this.props;
    return (
      <InputGroup size="sm">
        <InputGroup.Prepend>
          <InputGroup.Text>{hint}</InputGroup.Text>
        </InputGroup.Prepend>
        <FormControl
          name={ name }
          placeholder={ placeholder }
          type="number"
          value={ cookies.get(name) }
          onChange={(event) => this.onChange(event)}
        />
      </InputGroup>
    );
  }
}

class SimUI extends React.Component {
  state = {
    x: [],
    y: [],
    ts: [0],
    idx: 0,
  }

  calcFlux(concentration_x) {
    const { N, dx } = this.state;
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

  simulateStep() {
    if (!this.state.run) {
      return;
    }
    const { dx, concentration_tx, ts, sim_time, animation_rate } = this.state;
    const dt = dx;
    let concentration_x = concentration_tx[concentration_tx.length - 1];
    let t = ts[ts.length - 1];
    let new_t = [];
    let new_concentration_tx = []
    for (let i = 0; i < animation_rate; ++i) {
      if (t > sim_time) {
        this.setState({
          concentration_tx: concentration_tx.concat(new_concentration_tx),
          ts: ts.concat(new_t),
          idx: this.state.idx + i,
        });
        return;
      }
      // RK-4
      const k1 = tf.tidy(() => this.calcFlux(concentration_x));
      const k2 = tf.tidy(() => this.calcFlux(concentration_x.add(k1.mul(0.5*dt))));
      const k3 = tf.tidy(() => this.calcFlux(concentration_x.add(k2.mul(0.5*dx))));
      const k4 = tf.tidy(() => this.calcFlux(concentration_x.add(k3.mul(dt))));
      const flux = tf.tidy(() => k1.add(k2.mul(2)).add(k3.mul(2)).add(k4).div(6));
      const new_concentration_x = tf.tidy(() => flux.mul(dt).add(concentration_x));
      concentration_x = new_concentration_x;
      t += dt;
      new_concentration_tx.push(concentration_x);
      new_t.push(t);
      // release memory
      k1.dispose();
      k2.dispose();
      k3.dispose();
      k4.dispose();
      flux.dispose();
    }
    // update states
    this.setState({
      concentration_tx: concentration_tx.concat(new_concentration_tx),
      ts: ts.concat(new_t),
      idx: this.state.idx + animation_rate,
    });
    // request animate new frame
    requestAnimationFrame(() => this.simulateStep());
  }

  updateInit() {
    const { num_grids, domain_len } = this.state;
    if (!num_grids || !domain_len) {
      return;
    }
    const grid_x = tf.linspace(0, domain_len, num_grids);
    const concentration_x = tf.exp(
      grid_x.sub(0.1 * domain_len).square().neg().div(Math.pow(0.02 * domain_len, 2)));
    grid_x.array().then(arr => this.setState({x: arr}));
    concentration_x.array().then(arr => this.setState({y: arr}));
    this.setState({
      ts: [0],
      idx: 0,
      run: false,
      concentration_tx: [concentration_x],
      grid_x: grid_x,
      L: domain_len,
      N: num_grids,
      dx: domain_len / (num_grids - 1),
    });
  }

  resetHandler() {
    this.state.concentration_tx.forEach(c => c.dispose());
    this.updateInit();
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.num_grids !== this.state.num_grids ||
        prevState.domain_len !== this.state.domain_len) {
      this.updateInit();
    }
    if (prevState.idx !== this.state.idx) {
      this.state.concentration_tx[this.state.idx].array().then(arr => this.setState({y: arr}));
    }
    if (prevState.run !== this.state.run && this.state.run) {
      this.simulateStep();
    }
  }

  render() {
    return (
      <div>
        <Button className="m-3 btn-success" onClick={() => this.setState({run: true})}>
          Start
        </Button>
        <Button className="m-3 btn-warning" onClick={() => this.setState({run: false})}>
          Pause
        </Button>
        <Button className="m-3 btn-danger" onClick={() => this.resetHandler()}>Reset</Button>
        <Row>
          <Col>
            <InputNumber
              hint="Simulation Time"
              placeholder="[s]"
              name="sim_time"
              update={(name, value) => this.setState({[name]: parseFloat(value)})}
            />
          </Col>
          <Col>
            <InputNumber
              hint="# Grid Points"
              placeholder="[s]"
              name="num_grids"
              update={(name, value) => this.setState({[name]: parseInt(value)})}
            />
          </Col>
          <Col>
            <InputNumber
              hint="Domain Length"
              placeholder="[mm]"
              name="domain_len"
              //                                                                [mm] -> [m]
              update={(name, value) => this.setState({[name]: parseFloat(value) * 1e-3})}
            />
          </Col>
          <Col>
            <InputNumber
              hint="Animation Rate"
              placeholder="[steps/update]"
              name="animation_rate"
              update={(name, value) => this.setState({[name]: parseInt(value)})}
            />
          </Col>
        </Row>
        <Row>
          <Plot
            className="mt-3"
            data={[
              {
                x: this.state.x,
                y: this.state.y,
                line: { simplify: false },
              }
            ]}
            layout={{
              title: { text: "Concentration Plot @ " + this.state.ts[this.state.idx] + "s" },
              xaxis: { title: { text: "Domain [m]" } },
              yaxis: {
                title: { text: "Concentration [unit?]" },
              }
            }}
            divId="concentration_plot"
          />
        </Row>
      </div>
    );
  }
}

const App = () => (
  <Container>
    <Jumbotron className="p-4">
      <h1 className="header">Welcome To Spresso Simulator</h1>
    </Jumbotron>
    <SimUI />
  </Container>
);

export default App;
