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

import { SpressoInput } from './Spresso';
import { InputInt, InputFloat } from './Input';

const VERSION = 'spresso_2species';

const default_input = {
  // simulation related
  sim_time:         0.03,
  animate_rate:     50,
  // data related
  num_grids:        250,
  domain_len:       50,
  species: [
    {
      injection_loc:    15,
      injection_width:  1,
      injection_amount: 0.2,
      injection_type:   'TE',
      interface_width:  1,
    },
    {
      injection_loc:    15,
      injection_width:  1,
      injection_amount: 1.,
      injection_type:   'LE',
      interface_width:  1,
    },
  ],
};

class SimUI extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      data: [],
      x: undefined,
      t: undefined,
      run: false,
      species: default_input.species,
    }
    this.worker = new Worker('./worker.js', { type: 'module' });
    this.worker.onmessage = (e) => this.workerHandler(e);
  }

  workerHandler(e) {
    switch (e.data.msg) {
      case 'update':
        this.setState({
          t: e.data.plot.t,
          data: [
            e.data.plot.concentration_sx.subarray(0, this.state.num_grids),
            e.data.plot.concentration_sx.subarray(this.state.num_grids),
          ],
        });
        if (e.data.plot.x !== undefined) {
          this.setState({x: e.data.plot.x});
        }
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
    const { sim_time, num_grids, domain_len, animate_rate, species } = this.state;
    // TODO(alvin): actually perform validation here
    return (
      sim_time && num_grids && domain_len && animate_rate &&
      species.every(specie =>
        specie.injection_amount &&
        specie.injection_loc &&
        isFinite(specie.injection_width) &&
        specie.injection_type &&
        specie.interface_width)
    );
  }

  resetHandler(update=false) {
    if (!this.inputValid()) {
      return;
    }
    const { sim_time, num_grids, domain_len, animate_rate, species } = this.state;

    const input = new SpressoInput(
      sim_time, animate_rate, num_grids, domain_len, species);
    if (update) {
      this.worker.postMessage({msg: 'update input', input: input});
    }
    else {
      this.worker.postMessage({msg: 'reset', input: input});
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.sim_time !== this.state.sim_time ||
        prevState.animate_rate !== this.state.animate_rate ||
        prevState.num_grids !== this.state.num_grids ||
        prevState.domain_len !== this.state.domain_len ||
        prevState.species !== this.state.species) {
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
        data={this.state.data.map(ydata => {
          return {
            x: this.state.x,
            y: ydata,
          };
        })}
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
        { this.state.species.map((specie, specie_idx) => {
          const setSpecieSpec = (name, value, scale=1) => {
            this.setState({species: this.state.species.map((specie, idx) => {
              if (idx === specie_idx) {
                specie[name] = value * scale;
              }
              return specie;
            })});
          };

          return (
          <Form.Row className="mb-3" key={specie_idx}>
            <Col sm="1"><strong>{ specie.injection_type }</strong></Col>
            <Col>
              <InputFloat
                hint="Injection Location"
                placeholder="[mm]"
                name={ "injection_loc" + specie_idx }
                update={(name, value) => setSpecieSpec("injection_loc", value, 1e-3)}
                defaultValue={ default_input.species[specie_idx].injection_loc }
              >
                Injection Location in [mm].
              </InputFloat>
            </Col>
            <Col>
              <InputFloat
                hint="Injection Width"
                placeholder="[mm]"
                name={"injection_width" + specie_idx}
                update={(name, value) => setSpecieSpec("injection_width", value, 1e-3)}
                defaultValue={ default_input.species[specie_idx].injection_width }
              >
                Injection Width in [mm].
              </InputFloat>
            </Col>
            <Col>
              { specie.injection_type === 'LE' || specie.injection_type === 'TE'
                ? // Injection amount for LE / TE are actually initial concentration
                <InputFloat
                  hint="Initial Concentration"
                  placeholder="[mole / m^3]"
                  name={"injection_amount" + specie_idx}
                  update={(name, value) => setSpecieSpec("injection_amount", value)}
                  defaultValue={ default_input.species[specie_idx].injection_amount }
                >
                  Initial concentration in [mole / m^3].
                </InputFloat>
                :
                <InputFloat
                  hint="Injection Amount"
                  placeholder="[milli moles]"
                  name={"injection_amount" + specie_idx}
                  update={(name, value) => setSpecieSpec("injection_amount", value, 1e-3)}
                  defaultValue={ default_input.species[specie_idx].injection_amount }
                >
                  Amount of injected substance in [milli moles].
                </InputFloat>
              }
            </Col>
            <Col>
              <InputFloat
                hint="Interface Width"
                placeholder="[mm]"
                name={"interface_width" + specie_idx}
                update={(name, value) => setSpecieSpec("interface_width", value, 1e-3)}
                defaultValue={ default_input.species[specie_idx].interface_width }
                readOnly
              >
                Interface width in [mm].
              </InputFloat>
            </Col>
          </Form.Row>
          )})
        }
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
  // for reset cache if app is updated to a newer version
  if (localStorage.getItem('version') !== VERSION) {
    localStorage.clear();
    localStorage.setItem('version', VERSION);
  }
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
