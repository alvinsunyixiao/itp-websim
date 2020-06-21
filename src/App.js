import React, { useState } from 'react';
import './App.css';
// bootstrap stuff
import 'bootstrap/dist/css/bootstrap.min.css';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import InputGroup from 'react-bootstrap/InputGroup';
import Jumbotron from 'react-bootstrap/Jumbotron';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger'
import Tooltip from 'react-bootstrap/Tooltip'
// tensorflow stuff
import * as tf from '@tensorflow/tfjs'
// plotly
import Plot from 'react-plotly.js'
// cookies
import { Cookies } from 'react-cookie'

import download from 'downloadjs'
import { spressoBurger, spressoBurgerInput } from './Spresso.js'

const cookies = new Cookies();

const default_input = {
  // simulation related
  sim_time:         0.1,
  animate_rate:     30,
  // data related
  num_grids:        250,
  domain_len:       50,
  injection_loc:    15,
  injection_width:  10,
  injection_amount: 3,
  interface_width:  1,
};

class Input extends React.Component {
  constructor(props) {
    super(props);
    const { name } = this.props;
    let value = cookies.get(name);
    if (value === undefined) {
      value = default_input[name];
      cookies.set(name, value);
    }
    if (this.props.update)
      this.props.update(name, this.formatValue(value));
  }

  formatValue(value) {
    return value;
  }

  onChange(event) {
    cookies.set(event.target.name, event.target.value);
    const value = this.formatValue(event.target.value);
    if (this.props.update) {
      this.props.update(event.target.name, value);
    }
  }
}

class InputNumber extends Input {
  render() {
    const { hint, placeholder, name } = this.props;
    return (
      <InputGroup size="sm">
        <InputGroup.Prepend>
          <OverlayTrigger
            placement="top"
            delay={{ show: 500 }}
            overlay={
              <Tooltip>
                { this.props.children }
              </Tooltip>
            }
          >
            <InputGroup.Text>{hint}</InputGroup.Text>
          </OverlayTrigger>
        </InputGroup.Prepend>
        <Form.Control
          name={ name }
          placeholder={ placeholder }
          type="number"
          value={ cookies.get(name) }
          onChange={(event) => this.onChange(event)}
          readOnly={ this.props.readOnly }
        />
      </InputGroup>
    )
  }
}

class InputInt extends InputNumber {
  formatValue(value) {
    return parseInt(value);
  }
}

class InputFloat extends InputNumber {
  formatValue(value) {
    return parseFloat(value);
  }
}

class SimUI extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      x: undefined,
      y: undefined,
      run: false,
    }
    this.spresso = undefined;
  }

  simulateSteps() {
    if (!this.state.run) {
      return ;
    }
    let should_continue = true;
    for (let i = 0; i < this.spresso.input.animate_rate && should_continue; ++i) {
      should_continue = this.spresso.simulateStep();
    }
    this.spresso.getCurrentConcentration().data().then(data => this.setState({y: data}));
    // request animate new frame
    if (should_continue) {
      requestAnimationFrame(() => this.simulateSteps());
    }
    else {
      this.setState({run: false});
    }
  }

  resetHandler() {
    const { sim_time, num_grids, domain_len, animate_rate,
            injection_loc, injection_width, injection_amount, interface_width } = this.state;
    if (!sim_time || !num_grids || !domain_len || !animate_rate ||
        !injection_loc || !injection_width ||
        !injection_amount || !interface_width) {
      return;
    }
    if (this.spresso) {
      this.spresso.reset();
    }

    this.setState({run: false});
    const spresso_input = new spressoBurgerInput(sim_time, animate_rate, num_grids, domain_len,
      injection_loc, injection_width, injection_amount, interface_width);
    this.spresso = new spressoBurger(spresso_input);
    this.spresso.grid_x.data().then(data => this.setState({x: data}));
    this.spresso.getCurrentConcentration().data().then(data => this.setState({y: data}));
  }

  componentDidUpdate(prevProps, prevState) {
    if (this.spresso) {
      if (prevState.sim_time !== this.state.sim_time) {
        this.spresso.input.sim_time = this.state.sim_time;
      }
      if (prevState.animate_rate !== this.state.animate_rate) {
        this.spresso.input.animate_rate = this.state.animate_rate;
      }
    }
    if (prevState.num_grids !== this.state.num_grids ||
        prevState.domain_len !== this.state.domain_len ||
        prevState.injection_loc !== this.state.injection_loc ||
        prevState.injection_width !== this.state.injection_width ||
        prevState.injection_amount !== this.state.injection_amount ||
        prevState.interface_width !== this.state.interface_width) {
      this.resetHandler();
    }
    if (!prevState.run && this.state.run) {
      this.simulateSteps();
    }
  }

  render() {
    const plot = (this.state.x && this.state.y) ?
      (
        <Plot
          className="mt-3"
          data={[
            {
              x: this.state.x,
              y: this.state.y,
            }
          ]}
          layout={{
            title: { text: "Concentration Plot @ " + this.spresso.getCurrentTime() + "s" },
            xaxis: { title: { text: "Domain [m]" } },
            yaxis: {
              title: { text: "Concentration [mole / m^3]" },
            }
          }}
          divId="concentration_plot"
        />
      )
      :
      "Loading";
    const start_pause = this.state.run ?
      (
        <Button className="m-3 btn-warning" onClick={() => this.setState({run: false})}>
          Pause
        </Button>
      )
      :
      (
        <Button className="m-3 btn-success" onClick={() => this.setState({run: true})}>
          Start
        </Button>
      );
    return (
      <div>
        <Form.Row className="mb-3">
          <Col>
            <InputFloat
              hint="Simulation Time"
              placeholder="[s]"
              name="sim_time"
              update={(name, value) => this.setState({[name]: value})}
            >
              Physical simulated time in [s]
            </InputFloat>
          </Col>
          <Col>
            <InputInt
              hint="Animation Rate"
              placeholder="[steps/update]"
              name="animate_rate"
              update={(name, value) => this.setState({[name]: value})}
            >
              Update the animated graph once every this many steps of simulation.<br/>
              <strong>Note</strong>: lower this value to obtain smoother animation but
                                     slower simulation.
            </InputInt>
          </Col>
          <Col>
            <InputInt
              hint="# Grid Points"
              placeholder="[s]"
              name="num_grids"
              update={(name, value) => this.setState({[name]: value})}
            >
              Number of discrete grid points in the spatial domain.
            </InputInt>
          </Col>
          <Col>
            <InputFloat
              hint="Domain Length"
              placeholder="[mm]"
              name="domain_len"
              //                                              [mm] -> [m]
              update={(name, value) => this.setState({[name]: value * 1e-3})}
            >
              Domain length in [mm].
            </InputFloat>
          </Col>
        </Form.Row>
        <Form.Row>
          <Col>
            <InputFloat
              hint="Injection Location"
              placeholder="[mm]"
              name="injection_loc"
              update={(name, value) => this.setState({[name]: value * 1e-3})}
            >
              Injection Location in [mm].
            </InputFloat>
          </Col>
          <Col>
            <InputFloat
              hint="Injection Width"
              placeholder="[mm]"
              name="injection_width"
              update={(name, value) => this.setState({[name]: value * 1e-3})}
            >
              Injection Width in [mm].
            </InputFloat>
          </Col>
          <Col>
            <InputFloat
              hint="Injection Amount"
              placeholder="[milli moles]"
              name="injection_amount"
              update={(name, value) => this.setState({[name]: value * 1e-3})}
            >
              Amount of injected substance in [milli moles].
            </InputFloat>
          </Col>
          <Col>
            <InputFloat
              hint="Interface Width"
              placeholder="[mm]"
              name="interface_width"
              update={(name, value) => this.setState({[name]: value * 1e-3})}
              readOnly
            >
              Interface width in [mm].
            </InputFloat>
          </Col>
        </Form.Row>
        <Row>
          { start_pause }
          <Button className="m-3 btn-danger" onClick={() => this.resetHandler()}>Reset</Button>
          <Button className="m-3 btn-info" onClick={() => {
            const content = JSON.stringify(this.spresso.input, null, 2);
            download(content, "config.json", "application/json");
          }}>Save Configurations</Button>
          <Button className="m-3 btn-info" onClick={() => {
            const handler = async function(spresso) {
              const concentration_tx = spresso.getAllConcentration();
              const data = await concentration_tx.data();
              const blob = new Blob([data]);
              download(blob, "data.bin");
            }
            handler(this.spresso);
          }}>
            Save Data
          </Button>
        </Row>
        <Row>
        </Row>
        <Row>
          { plot }
        </Row>
      </div>
    );
  }
}

const App = function() {
  const [appReady, setAppReady] = useState(false);
  if (tf.ENV.getBool('HAS_WEBGL'))
    tf.setBackend('webgl');
  else
    tf.setBackend('cpu');
  tf.ready().then(() => setAppReady(true));
  if (!appReady)
    return "Loading"
  return (
    <Container>
      <Jumbotron className="p-4">
        <h1 className="header">
          Spresso <span role="img" aria-label="burger">🍔</span> Simulator
        </h1>
      </Jumbotron>
      <SimUI />
    </Container>
  );
};

export default App;
