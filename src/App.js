import React, { useState } from 'react';
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
  constructor(props) {
    super(props);
    this.state = {
      x: [],
      y: [],
    };
  }

  stepSimulation() {
    const { spresso } = this.state;
    if (!this.state.run) {
      return;
    }
    for (let i = 0; i < 30; ++i) {
      spresso.simulate_step();
    }
    const t = spresso.get_current_time();
    this.setState({
      t: t,
      y: spresso.get_current_concentration_x(),
    });
    if (t <= this.state.sim_time) {
      requestAnimationFrame(() => this.stepSimulation());
    }
  }

  updateInit() {
    const { num_grids, domain_len } = this.state;
    if (!num_grids || !domain_len) {
      return ;
    }
    window.pyodide.runPythonAsync(`
      spresso = SpressoBurger(${num_grids}, ${domain_len})
      spresso
    `).then(spresso => this.setState({
      x: spresso.grid_x,
      y: spresso.get_current_concentration_x(),
      run: false,
      t: 0,
      spresso: spresso,
    }));
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
      this.stepSimulation();
    }
  }

  render() {
    const disabled = this.state.spresso ? false : true;
    return (
      <div>
        <Button
          className="m-3 btn-success"
          onClick={() => this.setState({run: true})}
          disabled={ disabled }
        >Start</Button>
        <Button
          className="m-3 btn-warning"
          onClick={() => this.setState({run: false})}
        >Pause</Button>
        <Button
          className="m-3 btn-danger"
          onClick={() => this.updateInit()}
        >Reset</Button>
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
              title: { text: "Concentration Plot @ " + this.state.t + "s" },
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

function App() {
  const [pyodideReady, setPyodideReady] = useState(false);
  const ui = pyodideReady ? <SimUI /> : "Loading";
  window.languagePluginLoader
    .then(() => window.pyodide.loadPackage(['numpy']))
    .then(() => fetch('spresso_burger.py'))
    .then(res => res.text())
    .then(pydef => window.pyodide.runPythonAsync(pydef))
    .then(() => setPyodideReady(true));
  return (
    <Container>
      <Jumbotron className="p-4">
        <h1 className="header">Welcome To Spresso Simulator</h1>
      </Jumbotron>
      { ui }
    </Container>
  );
}

export default App;
