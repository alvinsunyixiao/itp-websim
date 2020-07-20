import React from 'react';
import './App.css';
// material ui stuff
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Container from '@material-ui/core/Container';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import Tooltip from '@material-ui/core/Tooltip';
// material icons
import AddCircleRoundedIcon from '@material-ui/icons/AddCircleRounded';
import DeleteIcon from '@material-ui/icons/Delete';
import PauseIcon from '@material-ui/icons/Pause';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
// plotly
import Plot from 'react-plotly.js';
// download file from frontend
import download from 'downloadjs';

import { SpressoInput } from './Spresso';
import { InputNumber, InputText, InputSelect } from './Input';

const VERSION = 'spresso_2species';

const DEFAULT_INPUT = {
  // simulation related
  simTime:         0.03,
  animateRate:     50,
  // data related
  numGrids:        250,
  domainLen:       50,
  interfaceWidth:  1.,
};

const SPECIE_TYPE = [
  { label: 'TE', value: 'TE' },
  { label: 'LE', value: 'LE' },
  { label: 'Analyte', value: 'Analyte' },
];

class SimUI extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      data: [],
      x: undefined,
      t: undefined,
      run: false,
      species: JSON.parse(localStorage.getItem("species")) || [],
      injectionValid: JSON.parse(localStorage.getItem("injectionValid") || false),
    }
    this.worker = new Worker('./worker.js', { type: 'module' });
    this.worker.onmessage = (e) => this.workerHandler(e);
  }

  workerHandler(e) {
    switch (e.data.msg) {
      case 'update':
        const { numGrids } = this.state;
        this.setState({
          t: e.data.plot.t,
          data: this.state.species.map((specie, specieIdx) => {
            return e.data.plot.concentration_sx.subarray(specieIdx * numGrids,
                                                         (specieIdx+1) * numGrids); 
          }),         
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
    const { simTimeValid, numGridsValid, domainLenValid, animateRateValid, species } = this.state;
    return (
      simTimeValid && numGridsValid && domainLenValid && animateRateValid &&
      species.every((specie) => (specie.nameValid))
    );
  }

  resetHandler() {
    if (!this.inputValid()) {
      return;
    }
    const { simTime, numGrids, domainLen, animateRate, interfaceWidth, species } = this.state;

    const input = new SpressoInput(
      simTime, animateRate, numGrids, domainLen, interfaceWidth, species);

    this.worker.postMessage({msg: 'reset', input: input});
  }

  validateInjection() {
    if (!this.state.domainLenValid) {
      return false;
    }
    const domainLen = parseFloat(this.state.domainLen);
    // validate raw entry
    if (!this.state.species.every((specie) => {
      const injectionLoc = parseFloat(specie.injectionLoc);
      const injectionWidth = parseFloat(specie.injectionWidth);
      const injectionLocValid = (injectionLoc > 0 && injectionLoc < domainLen);
      const injectionWidthValid = (injectionWidth > 0);
      switch (specie.injectionType) {
        case 'Analyte':
          return injectionLocValid && injectionWidthValid; 
        case 'LE':
        case 'TE':
          return injectionLocValid;
        default:
          return true;
      }
    })) {
      return false;
    }
    // validate overlap
    let intervals = this.state.species.map((specie) => {
      const loc = parseFloat(specie.injectionLoc);
      const width = parseFloat(specie.injectionWidth);
      switch (specie.injectionType) {
        case 'TE':
          return {left: 0., right: loc};
        case 'LE':
          return {left: loc, right: domainLen};
        case 'Analyte':
          return {left: loc - width/2, right: loc + width/2};
        default:
          return {left: 0., right: domainLen};
      }
    }).sort((a, b) => a.left - b.left);
    intervals.unshift({left: -1., right: 0.});
    intervals.push({left: domainLen, right: domainLen + 1});
    for (let i = 0; i < intervals.length - 1; ++i) {
      if (intervals[i].right < intervals[i+1].left) {
        return false;
      }
    }
    return true;
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.simTime !== this.state.simTime ||
        prevState.animateRate !== this.state.animateRate ||
        prevState.numGrids !== this.state.numGrids ||
        prevState.domainLen !== this.state.domainLen ||
        prevState.species !== this.state.species) {
      this.resetHandler();
    }
    // cache the new species dict if updated
    if (prevState.species !== this.state.species) {
      localStorage.setItem("species", JSON.stringify(this.state.species));
      // validate injection
      const injectionValid = this.validateInjection();
      localStorage.setItem("injectionValid", JSON.stringify(injectionValid));
      this.setState({injectionValid});
    }
    // inform worker about graphics update
    if (prevState.t !== this.state.t) {
      this.worker.postMessage({msg: 'updated'});
    }
  }

  render() {
    const plot = (this.state.t !== undefined) ?
      <Plot
        data={this.state.species.map((specie, idx) => {
          return {
            x: this.state.x,
            y: this.state.data[idx],
            name: specie.name + ' -- ' + specie.injectionType,
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
      <Button 
        variant="contained" 
        color="default"
        endIcon={<PauseIcon/>} 
        onClick={() => {
          this.setState({running: false});
          this.worker.postMessage({msg: 'pause'});
        }}
      >
        Pause
      </Button>
      :
      <Button 
        variant="contained" 
        color="primary"
        endIcon={<PlayArrowIcon/>} 
        onClick={() => {
          this.setState({running: true});
          this.worker.postMessage({msg: 'start'});
        }}
      >
        Start
      </Button>
      ;

    const inputUpdate = (name, value, valid) => {
      this.setState({[name]: value, [name+'Valid']: valid});
    };

    return (
      <div>
        <Box mb={2}><Grid container spacing={1}>
          <Grid item sm={2} key="simTime">
            <InputNumber
              cache
              valid={ this.state.simTimeValid || false }
              invalidText="Must be positive"
              label="Simulation Time"
              name="simTime"
              value={ this.state.simTime }
              defaultValue={ DEFAULT_INPUT.simTime }
              update={(name, value) => inputUpdate(name, value, (parseFloat(value) > 0))}
            >
              Physical simulated time in [s]
            </InputNumber>
          </Grid>
          <Grid item sm={2} key="animateRate">
            <InputNumber
              cache
              valid={ this.state.animateRateValid || false }
              invalidText="Must be a positive integer"
              label="Animation Rate"
              name="animateRate"
              update={(name, value) => inputUpdate(name, value, 
                Number.isInteger(parseFloat(value)) && parseInt(value) > 0)}
              value={ this.state.animateRate }
              defaultValue={ DEFAULT_INPUT.animateRate }
            >
              Update the animated graph once every this many steps of simulation.<br/>
              <strong>Note</strong>: lower this value to obtain smoother animation.<br/>
              <strong>Warning</strong>: extremely small animation rate can cause the simulation
                                        to slow down dramatically.
            </InputNumber>
          </Grid>
          <Grid item sm={2} key="numGrids">
            <InputNumber
              cache
              valid={ this.state.numGridsValid || false }
              invalidText="Must be an integer greater than 100"
              label="# Grid Points"
              name="numGrids"
              update={(name, value) => inputUpdate(name, value,
                Number.isInteger(parseFloat(value)) && parseInt(value) > 100)}
              value={ this.state.numGrids }
              defaultValue={ DEFAULT_INPUT.numGrids }
            >
              Number of discrete grid points in the spatial domain.
            </InputNumber>
          </Grid>
          <Grid item sm={2} key="domainLen">
            <InputNumber
              cache
              valid={ this.state.domainLenValid || false }
              invalidText="Must be positive"
              label="Domain Length"
              name="domainLen"
              update={(name, value) => inputUpdate(name, value, parseFloat(value) > 0)}
              value={ this.state.domainLen }
              defaultValue={ DEFAULT_INPUT.domainLen }
            >
              Domain length in [mm].
            </InputNumber>
          </Grid>
          <Grid item sm={1} key="interfaceWidth">
            <InputNumber
              cache
              valid={ this.state.interfaceWidth || false }
              invalidText="Must be positive"
              label="&sigma;"
              name="interfaceWidth"
              update={(name, value) => inputUpdate(name, value, parseFloat(value) > 0)}
              value={ this.state.interfaceWidth }
              defaultValue={ DEFAULT_INPUT.interfaceWidth }
              readOnly
            >
              Interface width in [mm].
            </InputNumber>
          </Grid>
          <Grid item sm={1} key="add_button">
            <Tooltip arrow title="Add a specie">
              <IconButton onClick={() => {
                this.setState({species: [...this.state.species, {}]});
              }}>
                <AddCircleRoundedIcon/>
              </IconButton>
            </Tooltip>
          </Grid>
        </Grid></Box>
        {this.state.species.map((specie, specieIdx) => {
          // callback function for setting per specie properties
          const setSpecieSpec = (name, value, valid) => {
            this.setState({species: this.state.species.map((specie, idx) => {
              if (idx === specieIdx) {
                specie[name] = value;
                specie[name+"Valid"] = valid;
              }
              return specie;
            })});
          };

          return (
          <Box mb={2} key={specieIdx}><Grid container spacing={1}>
            <Grid container item sm={4} spacing={1}>
              <Grid item sm={7} key="name">
                <InputText
                  label="Specie Name"
                  valid={ specie.nameValid || false }
                  invalidText="Must not be empty"
                  name={ "Specie" + specieIdx }
                  value={ specie.name }
                  defaultValue={ "Specie " + specieIdx }
                  update={(name, value) => setSpecieSpec("name", value, !(!value))}
                >
                  Specie Name.
                </InputText>
              </Grid>
              <Grid item sm={5} key="injectionType">
                <InputSelect
                  label="type"
                  name={ "injectionType" + specie.name }
                  options={ SPECIE_TYPE }
                  value={ specie.injectionType }
                  defaultValue="Analyte"
                  update={(name, value) => setSpecieSpec("injectionType", value)}
                >
                  Injection Type
                </InputSelect>
              </Grid>
            </Grid>
            <Grid container item sm={3} spacing={1}>
              {specie.injectionType === 'Analyte' &&
              <Grid item sm={4} key="injectionAmount">
                <InputNumber
                  label="N"
                  valid={ specie.injectionAmountValid || false }
                  invalidText="Must be positive"
                  name={ "injectionAmount" + specie.name }
                  value={ specie.injectionAmount }
                  update={(name, value) => setSpecieSpec("injectionAmount", value, 
                    parseFloat(value) > 0)}
                >
                  Amount of injected substance in [milli mole].
                </InputNumber>
              </Grid>
              }
              {(specie.injectionType !== 'Analyte' ) && 
              <Grid item sm={4} key="initConcentration">
                <InputNumber
                  label={ <span>c<sub>0</sub></span> }
                  valid={ specie.initConcentrationValid || false }
                  invalidText="Must be positive"
                  name={ "initConcentration" + specie.name }
                  value={ specie.initConcentration }
                  update={(name, value) => setSpecieSpec("initConcentration", value,
                    parseFloat(value) > 0)}
                >
                  Initial concentration in [mole / m^3].
                </InputNumber>
              </Grid>
              }
              <Grid item sm={4} key="injectionLoc">
                <InputNumber
                  label={ <span>x<sub>inj</sub></span> }
                  valid={ this.state.injectionValid }
                  invalidText={specieIdx === this.state.species.length - 1 && 
                    "Please ensure enough concentration overlap"}
                  name={ "injectionLoc" + specie.name }
                  value={ specie.injectionLoc }
                  update={(name, value) => setSpecieSpec("injectionLoc", value)}
                >
                  Injection Location in [mm].
                </InputNumber>
              </Grid>
              {specie.injectionType === 'Analyte' &&
              <Grid item sm={4} key="injectionWidth">
                <InputNumber
                  label="h"
                  valid={ this.state.injectionValid }
                  name={ "injectionWidth" + specie.name }
                  value={ specie.injectionWidth }
                  update={(name, value) => setSpecieSpec("injectionWidth", value)}
                >
                  Injection Width in [mm].
                </InputNumber>
              </Grid>
              }
            </Grid>
            <Grid container item sm={4} spacing={1}>
              <Grid item sm={4} key="valence">
                <InputText
                  label="Valence"
                  valid= { specie.valenceValid }
                  invalidText="Format error"
                  name={ "valence" + specie.name }
                  value={ specie.valence }
                  update={(name, value) => setSpecieSpec("valence", value)}
                >
                  Valence electrical charges. <br/>
                  <strong>Format:</strong> a comma seperated list of integers (e.g. 2, 1, -1).
                </InputText>
              </Grid>
              <Grid item sm={4} key="mobility">
                <InputText
                  label="&mu;"
                  valid={ specie.mobilityValid }
                  invalidText={ !specie.paramsValid && "" }
                  name={ "mobility" + specie.name }
                  value={ specie.mobility }
                  update={(name, value) => setSpecieSpec("mobility", value)}
                >
                  Mobility at each valence in [10<sup>-9</sup>m<sup>2</sup>/(V&middot;s)]. <br/>
                  <strong>Format:</strong> a comma seperated list of numbers (must have the
                  same number of entries as the number of valences.
                </InputText>
              </Grid>
              <Grid item sm={4} key="pKa">
                <InputText
                  label="pKa"
                  name={ "pKa" + specie.name }
                  value={ specie.pKa }
                  update={(name, value) => setSpecieSpec("pKa", value)}
                >
                  Negative log dissociation constant at each valence.
                  <strong>Format:</strong> a comma seperated list of numbers (must have the
                  same number of entries as the number of valences.
                </InputText>
              </Grid>
            </Grid>
            <Grid item sm={1}>
              <IconButton color="secondary" onClick={() => {
                this.setState({species: this.state.species.filter(
                  (_, specieDelIdx) => specieDelIdx !== specieIdx)});
              }}>
                <DeleteIcon/>
              </IconButton>
            </Grid>
          </Grid></Box>
          );
        })}
        <Box mb={3}><Grid container alignItems="center" spacing={1}>
          <Grid item>
            { start_pause }
          </Grid>
          <Grid item>
            <Button color="secondary" variant="contained" onClick={() => this.resetHandler()}>
              Reset
            </Button>
          </Grid>
          <Grid item>
            <Button variant="contained" onClick={() =>
              this.worker.postMessage({msg: "config"})
            }>
              Save Config
            </Button>
          </Grid>
        </Grid></Box>
        <Grid container>
          { plot }
        </Grid>
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
      <Grid container justify="center" alignItems="center">
        <Box 
          m={3} 
          bgcolor="primary.main" 
          color="primary.contrastText" 
          width={1} 
          textAlign="center"
          borderRadius={16}
        >
          <h1>Spresso Simulator</h1>
        </Box>
      </Grid>
      <SimUI />
    </Container>
  );
};

export default App;
