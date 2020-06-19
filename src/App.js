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
  sim_time:   0.05,
  num_grids:  250,
  domain_len: 10,
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

  calcFlux(extra=0) {
    const { N, dx, concentration_tx } = this.state;
    const concentration_x = concentration_tx[concentration_tx.length - 1].add(extra);
    const c_right = concentration_x.slice([1], [N-1]);
    const c_left = concentration_x.slice([0], [N-1]);
    const flux = tf.sub(
      tf.add(c_right.square(), c_left.square()).mul(0.5),
      tf.abs(c_right.add(c_left)).mul(c_right.sub(c_left)).mul(0.5)
    );
    const rhs = tf.sub(flux.slice([0], [N-2]), flux.slice([1], [N-2])).div(dx);
    return rhs.pad([[1, 1]]);
  }

  stepSimluation() {
    const { dx, concentration_tx } = this.state;
    const concentration_x = concentration_tx[concentration_tx.length - 1];
    const dt = dx;
    const t = this.state.ts.slice(-1)[0] + dt;
    // RK-4
    const k1 = this.calcFlux();
    const k2 = this.calcFlux(k1.mul(0.5*dt));
    const k3 = this.calcFlux(k2.mul(0.5*dx));
    const k4 = this.calcFlux(k3.mul(dt));
    const flux = k1.add(k2.mul(2)).add(k3.mul(2)).add(k4).div(6);
    const new_concentration_x = flux.mul(dt).add(concentration_x)
    this.setState({
      concentration_tx: [...concentration_tx, new_concentration_x],
      ts: [...this.state.ts, t],
      idx: this.state.idx + 1,
    });
  }

  updateInit() {
    if (this.state.num_grids === undefined || this.state.domain_len === undefined) {
      return;
    }
    const num_grids = parseInt(this.state.num_grids);
    const domain_len = parseFloat(this.state.domain_len) * 1e-3; // [mm] -> [m]
    const grid_x = tf.linspace(0, domain_len, num_grids);
    const concentration_x = tf.exp(
      grid_x.sub(0.1 * domain_len).square().neg().div(Math.pow(0.02 * domain_len, 2)));
    grid_x.array().then(arr => this.setState({x: arr}));
    concentration_x.array().then(arr => this.setState({y: arr}));
    this.setState({
      concentration_tx: [concentration_x],
      grid_x: grid_x,
      L: domain_len,
      N: num_grids,
      dx: domain_len / (num_grids - 1),
    });
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.num_grids !== this.state.num_grids ||
        prevState.domain_len !== this.state.domain_len) {
      this.updateInit();
    }
    if (prevState.idx !== this.state.idx) {
      this.state.concentration_tx[this.state.idx].array().then(arr => this.setState({y: arr}));
    }
  }

  render() {
    return (
      <div>
        <Button className="m-3" onClick={() => this.stepSimluation()}>Start</Button>
        <Row>
          <Col>
            <InputNumber
              hint="Simulation Time"
              placeholder="[s]"
              name="sim_time"
              update={(name, value) => this.setState({[name]: value})}
            />
          </Col>
          <Col>
            <InputNumber
              hint="# Grid Points"
              placeholder="[s]"
              name="num_grids"
              update={(name, value) => this.setState({[name]: value})}
            />
          </Col>
          <Col>
            <InputNumber
              hint="Domain Length"
              placeholder="[mm]"
              name="domain_len"
              update={(name, value) => this.setState({[name]: value})}
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
