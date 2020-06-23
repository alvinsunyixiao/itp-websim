import React from 'react';
import './App.css';
// bootstrap stuff
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Button from 'react-bootstrap/Button';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Jumbotron from 'react-bootstrap/Jumbotron';
// plotly
import Plot from 'react-plotly.js';
// download file from frontend
import download from 'downloadjs';

import { spressoBurgerInput } from './Spresso';
import { InputInt, InputFloat } from './input';

const default_input = {
  // simulation related
  sim_time:         0.3,
  animate_rate:     50,
  // data related
  num_grids:        250,
  domain_len:       50,
  injection_loc:    15,
  injection_width:  10,
  injection_amount: 1,
  interface_width:  1,
};

class SimUI extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      x: undefined,
      y: undefined,
      t: undefined,
      run: false,
    }
    this.spresso = undefined;
    this.worker = new Worker('./worker.js', { type: 'module' });
    this.worker.onmessage = (e) => this.workerHandler(e);
  }

  workerHandler(e) {
    switch (e.data.msg) {
      case 'update':
        this.setState(e.data.plot);
        break;
      case 'finished':
        this.setState({running: false});
        break;
      case 'config':
        const content = JSON.stringify(e.data.config, null, 2);
        download(content, 'config.json', 'application/json');
        break;
      default:
        console.log('Unrecognized message: ' + e.data.msg);
    }
  }

  inputValid() {
    const { sim_time, num_grids, domain_len, animate_rate,
            injection_loc, injection_width, injection_amount, interface_width } = this.state;
    // TODO(alvin): actually perform validation here
    return (
      sim_time && num_grids && domain_len && animate_rate &&
      injection_loc && injection_width &&
      injection_amount && interface_width
    );
  }

  resetHandler(update=false) {
    if (!this.inputValid()) {
      return;
    }
    const { sim_time, num_grids, domain_len, animate_rate,
            injection_loc, injection_width, injection_amount, interface_width } = this.state;

    const spressoInput = new spressoBurgerInput(
      sim_time, animate_rate, num_grids, domain_len,
      injection_loc, injection_width, injection_amount, interface_width);
    if (update) {
      this.worker.postMessage({msg: 'update input', input: spressoInput});
    }
    else {
      this.worker.postMessage({msg: 'reset', input: spressoInput});
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.sim_time !== this.state.sim_time ||
        prevState.animate_rate !== this.state.animate_rate ||
        prevState.num_grids !== this.state.num_grids ||
        prevState.domain_len !== this.state.domain_len ||
        prevState.injection_loc !== this.state.injection_loc ||
        prevState.injection_width !== this.state.injection_width ||
        prevState.injection_amount !== this.state.injection_amount ||
        prevState.interface_width !== this.state.interface_width) {
      this.resetHandler(true);
    }

    if (prevState.t !== this.state.t) {
      this.worker.postMessage({msg: 'updated'});
    }
  }

  render() {
    const plot = (this.state.t !== undefined) ?
      <Plot
        className="mt-3"
        data={[
          {
            x: this.state.x,
            y: this.state.y,
          }
        ]}
        layout={{
          title: { text: 'Concentration Plot @ ' + this.state.t + 's' },
          xaxis: { title: { text: 'Domain [m]' } },
          yaxis: {
            title: { text: 'Concentration [mole / m^3]' },
          }
        }}
        divId='concentration_plot'
      />
      :
      'Loading';
    const start_pause = this.state.running ?
      <Button className="m-3 btn-warning" onClick={() => {
        this.setState({running: false});
        this.worker.postMessage({msg: 'pause'});
      }}>
        Pause
      </Button>
      :
      <Button className="m-3 btn-success" onClick={() => {
        this.setState({running: true});
        this.worker.postMessage({msg: 'start'});
      }}>
        Start
      </Button>
    return (
      <div>
        <Form.Row className="mb-3">
          <Col>
            <InputFloat
              hint="Simulation Time"
              placeholder="[s]"
              name="sim_time"
              update={(name, value) => this.setState({[name]: value})}
              defaultValue={ default_input.sim_time }
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
              defaultValue={ default_input.animate_rate }
            >
              Update the animated graph once every this many steps of simulation.<br/>
              <strong>Note</strong>: lower this value to obtain smoother animation.<br/>
              <strong>Warning</strong>: extremely small animation rate can cause the simulation
                                        to slow down dramatically.
            </InputInt>
          </Col>
          <Col>
            <InputInt
              hint="# Grid Points"
              placeholder="[s]"
              name="num_grids"
              update={(name, value) => this.setState({[name]: value})}
              defaultValue={ default_input.num_grids }
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
              defaultValue={ default_input.domain_len }
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
              defaultValue={ default_input.injection_loc }
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
              defaultValue={ default_input.injection_width }
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
              defaultValue={ default_input.injection_amount }
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
              defaultValue={ default_input.interface_width }
              readOnly
            >
              Interface width in [mm].
            </InputFloat>
          </Col>
        </Form.Row>
        <Row>
          { start_pause }
          <Button className="m-3 btn-danger" onClick={() => this.resetHandler()}>Reset</Button>
          <Button className="m-3 btn-info" onClick={() =>
            this.worker.postMessage({msg: "config"})
          }>Save Configurations</Button>
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
