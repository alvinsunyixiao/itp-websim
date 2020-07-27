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

const VERSION = 'spressov2';

const DEFAULT_INPUT = {
  // simulation related
  simTime:          '50',
  animateRate:      '20',
  // numerics related
  numGrids:         '1000',
  interfaceWidth:   '1',
  tolerance:        '1e-2',
  // data related
  domainLen:        '40',
  current:          '10',
  area:             '1400e-6',
};

const DEFAULT_SPECIES = [
  {
    name:               'HCl',
    injectionType:      'LE',
    injectionLoc:       '12',
    initConcentration:  '100',
    valence:            '-1',
    mobility:           '79.1',
    pKa:                '-2',
  },
  {
    name:               'Hepes',
    injectionType:      'TE',
    injectionLoc:       '12',
    initConcentration:  '100',
    valence:            '-1',
    mobility:           '26',
    pKa:                '7.2',
  },
  {
    name:               'Acetic Acid',
    injectionType:      'Analyte',
    injectionLoc:       '12',
    injectionWidth:     '2',
    injectionAmount:    '140',
    valence:            '-1',
    mobility:           '42.4',
    pKa:                '4.756',
  },
  {
    name:               'Acid 2',
    injectionType:      'Analyte',
    injectionLoc:       '12',
    injectionWidth:     '2',
    injectionAmount:    '120',
    valence:            '-1',
    mobility:           '52.4',
    pKa:                '4',
  },
  {
    name:               'Tris',
    injectionType:      'Background',
    initConcentration:  '200',
    valence:            '1',
    mobility:           '29',
    pKa:                '8.076',
  },
];

const SPECIE_TYPE = [
  { label: 'TE', value: 'TE' },
  { label: 'LE', value: 'LE' },
  { label: 'Analyte', value: 'Analyte' },
  { label: 'Background', value: 'Background' },
];

class SimUI extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      data: [],
      x: undefined,
      t: undefined,
      running: false,
      species: JSON.parse(localStorage.getItem("species")) || DEFAULT_SPECIES,
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
            return e.data.plot.concentration_sn.subarray(specieIdx * numGrids,
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
      case 'init':
        console.log('TF is using ' + e.data.backend + ' backend.');
        break;
      default:
        console.log('Unrecognized message: ' + e.data.msg);
    }
  }

  inputValid() {
    const { species } = this.state;
    return (
      this.state.simTimeValid && this.state.animateRateValid &&
      this.state.numGridsValid && this.state.toleranceValid && this.state.interfaceWidthValid &&
      this.state.domainLenValid && this.state.currentValid && this.state.areaValid &&
      this.state.injectionValid &&
      species.every((specie) => 
        (specie.nameValid && specie.propertyValid))
    );
  }

  resetHandler() {
    this.setState({running: false});

    const input = new SpressoInput(
      this.state.simTime, this.state.animateRate, 
      this.state.numGrids, this.state.tolerance, this.state.interfaceWidth, 
      this.state.domainLen, this.state.current, this.state.area,
      this.state.species);
    
    try {
      const parsedInput = input.parse();
      this.worker.postMessage({msg: 'reset', input: parsedInput});
    }
    catch (err) {
      console.error("Input", input, "cannot be parsed");
      console.error(err);
    }
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
    const intervals = this.state.species.map((specie) => {
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
          return {left: 0., right: 0.};
      }
    }).sort((a, b) => a.left - b.left);
    intervals.push({left: domainLen, right: domainLen + 1});
    let right = 0;
    for (let i = 0; i < intervals.length - 1; ++i) {
      if (right < intervals[i].left) {
        return false;
      }
      right = Math.max(right, intervals[i].right);
    }
    return true;
  }

  validateProperties(specie, name, value) {
    const specieNew = {...specie, [name]: value};
    const { valence, mobility, pKa } = specieNew;
    // check for empty input
    if (!valence || !mobility || !pKa) {
      return false;
    }
    // valid specie properties
    const numValence = valence.split(',').length;
    if (valence.replace(/\s/g, '').split(',').every((val) => (
        Number.isInteger(parseFloat(val)))) &&        // check valence is integer
        mobility.split(',').length === numValence &&  // check mobility is of same length
        mobility.replace(/\s/g, '').split(',').every((val) => (
        parseFloat(val) > 0)) &&                      // check mobility is positive
        pKa.split(',').length === numValence &&       // check pKa is of same length
        pKa.replace(/\s/g, '').split(',').every((val) => (
        isFinite(val)))) {                            // check pKa is number
      return true;
    }
    // properties invalid
    return false;
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.simTime !== this.state.simTime ||
        prevState.animateRate !== this.state.animateRate ||
        prevState.numGrids !== this.state.numGrids ||
        prevState.tolerance !== this.state.tolerance ||
        prevState.interfaceWidth !== this.state.interfaceWidth ||
        prevState.domainLen !== this.state.domainLen ||
        prevState.current !== this.state.current ||
        prevState.area !== this.state.area ||
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
            title: { text: 'Concentration [mole / m3]' },
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
        disabled={ !this.inputValid() }
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
        <Box mb={2} key="basic"><Grid container>
          <Grid item container sm={6} spacing={1} alignItems="center">
            <Grid item sm={2} key="title"><h4>Simulation</h4></Grid>
            <Grid item sm={4} key="simTime">
              <InputNumber
                cache
                valid={ this.state.simTimeValid || false }
                invalidText="Must be positive"
                label="Simulation Time [s]"
                name="simTime"
                value={ this.state.simTime }
                defaultValue={ DEFAULT_INPUT.simTime }
                update={(name, value) => inputUpdate(name, value, (parseFloat(value) > 0))}
              >
                Physical simulated time in [s]
              </InputNumber>
            </Grid>
            <Grid item sm={4} key="animateRate">
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
                Update the animated graph once every this many steps of simulation. 
                Lower this value to obtain smoother animation.<br/>
                <strong style={{color: 'yellow'}}>Warning</strong>: 
                  extremely small animation rate can potentially slow down the simulation.
              </InputNumber>
            </Grid>
          </Grid>
          <Grid item container sm={6} spacing={1} alignItems="center">
            <Grid item sm={2} key="title"><h4>Numerics</h4></Grid>
            <Grid item sm={3} key="numGrids">
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
            <Grid item sm={3} key="tolerance">
              <InputNumber
                cache
                valid={ this.state.toleranceValid || false }
                invalidText="Must be positive"
                label="ODE Tolerance"
                name="tolerance"
                update={(name, value) => inputUpdate(name, value, parseFloat(value) > 0)}
                value={ this.state.tolerance }
                defaultValue={ DEFAULT_INPUT.tolerance }
              >
                Absolute tolerance for ODE integration step adjustment. Lower this value
                to speed up simulation while raise this to obtain more accurate results.<br/>
                <strong style={{color: 'cyan'}}>Note</strong>: 
                  Try not to set this below 1e-4, otherwise the integration 
                  might fail due to floating point precision issues. Also,
                  don't worry about having a tolerance as high as 1e-2 
                  because the error estimate is the norm of the entire unnormalized
                  concentration error matrix.
              </InputNumber>
            </Grid>
            <Grid item sm={2} key="interfaceWidth">
              <InputNumber
                cache
                valid={ this.state.interfaceWidthValid || false }
                invalidText="Must be positive"
                label="&sigma; [mm]"
                name="interfaceWidth"
                update={(name, value) => inputUpdate(name, value, parseFloat(value) > 0)}
                value={ this.state.interfaceWidth }
                defaultValue={ DEFAULT_INPUT.interfaceWidth }
                readOnly
              >
                Interface width in [mm] (Read Only).
              </InputNumber>
            </Grid>
          </Grid>
        </Grid></Box>
        <Box mb={2} key="numerics"><Grid container alignItems="center">
          <Grid item container sm={6} alignItems="center" spacing={1}>
            <Grid item sm={2} key="title"><h4>Experiment</h4></Grid>
            <Grid item sm={4} key="domainLen">
              <InputNumber
                cache
                valid={ this.state.domainLenValid || false }
                invalidText="Must be positive"
                label="Domain Length [mm]"
                name="domainLen"
                update={(name, value) => inputUpdate(name, value, parseFloat(value) > 0)}
                value={ this.state.domainLen }
                defaultValue={ DEFAULT_INPUT.domainLen }
              >
                Domain length in [mm].
              </InputNumber>
            </Grid>
            <Grid item sm={3} key="current">
              <InputNumber
                cache
                valid={ this.state.currentValid || false }
                invalidText="Must be positive"
                label="Current [&mu;A]"
                name="current"
                update={(name, value) => inputUpdate(name, value, parseFloat(value) > 0)}
                value={ this.state.current }
                defaultValue={ DEFAULT_INPUT.current }
              >
                Electrical current in [&mu;A].
              </InputNumber>
            </Grid>
            <Grid item sm={3} key="area">
              <InputNumber
                cache
                valid={ this.state.areaValid || false }
                invalidText="Must be positive"
                label={ "Area [mm^2]" }
                name="area"
                update={(name, value) => inputUpdate(name, value, parseFloat(value) > 0)}
                value={ this.state.area }
                defaultValue={ DEFAULT_INPUT.area }
              >
                Cross section area of the channel in [mm<sup>2</sup>].
              </InputNumber>
            </Grid>
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
          const setSpecieSpec = (name, value, valid, validName=undefined) => {
            validName = validName || (name + "Valid");
            this.setState({species: this.state.species.map((specie, idx) => {
              if (idx === specieIdx) {
                specie[name] = value;
                specie[validName] = valid;
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
              {specie.injectionType !== 'Analyte' && 
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
                  Initial concentration in [mole / m<sup>3</sup>].
                </InputNumber>
              </Grid>
              }
              {specie.injectionType !== 'Background' &&
              <Grid item sm={4} key="injectionLoc">
                <InputNumber
                  label={ <span>x<sub>inj</sub></span> }
                  validEmbed
                  valid={ this.state.injectionValid }
                  invalidText="Concentration gaps present. Please bring injections 
                               closer to each other to ensure enough concentration overlap."
                  name={ "injectionLoc" + specie.name }
                  value={ specie.injectionLoc }
                  update={(name, value) => setSpecieSpec("injectionLoc", value)}
                >
                  Injection Location in [mm].
                </InputNumber>
              </Grid>
              }
              {specie.injectionType === 'Analyte' &&
              <Grid item sm={4} key="injectionWidth">
                <InputNumber
                  label="h"
                  validEmbed
                  valid={ this.state.injectionValid }
                  invalidText="Concentration gaps present. Please bring injections 
                               closer to each other to ensure enough concentration overlap."
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
                  valid= { specie.propertyValid || false }
                  invalidText="Format error"
                  name={ "valence" + specie.name }
                  value={ specie.valence }
                  update={(name, value) => setSpecieSpec("valence", value,
                    this.validateProperties(specie, 'valence', value), 'propertyValid')}
                >
                  Valence electrical charges. <br/>
                  <strong style={{color: 'cyan'}}>Format</strong>:
                    a comma seperated list of integers (e.g. 2, 1, -1). <br/>
                  <strong style={{color: 'yellow'}}>Warning</strong>:
                    Valences should NOT discontinue, i.e. a specie with a -2 valence must 
                    also has a -1 valence.
                </InputText>
              </Grid>
              <Grid item sm={4} key="mobility">
                <InputText
                  label="&mu;"
                  valid= { specie.propertyValid || false }
                  name={ "mobility" + specie.name }
                  value={ specie.mobility }
                  update={(name, value) => setSpecieSpec("mobility", value,
                    this.validateProperties(specie, 'mobility', value), 'propertyValid')}
                >
                  Mobility at each valence in [10<sup>-9</sup>m<sup>2</sup>/(V&middot;s)]. <br/>
                  <strong style={{color: 'cyan'}}>Format</strong>: 
                    a comma seperated list of numbers (must have the
                    same number of entries as the number of valences.
                </InputText>
              </Grid>
              <Grid item sm={4} key="pKa">
                <InputText
                  label="pKa"
                  valid= { specie.propertyValid || false }
                  name={ "pKa" + specie.name }
                  value={ specie.pKa }
                  update={(name, value) => setSpecieSpec("pKa", value,
                    this.validateProperties(specie, 'pKa', value), 'propertyValid')}
                >
                  Negative log dissociation constant at each valence. <br/>
                  <strong style={{color: 'cyan'}}>Format</strong>: 
                    a comma seperated list of numbers (must have the
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
          <Grid item key="start_pause">
            { start_pause }
          </Grid>
          {!this.state.running &&
            <Grid item>
              <Button color="secondary" variant="contained" onClick={() => this.resetHandler()}>
                Reset
              </Button>
            </Grid>
          }
          {!this.state.running &&
            <Grid item key="saveConfig">
              <Button variant="contained" onClick={() => {
                const content = JSON.stringify({
                  ...this.state,
                  data: undefined,
                  x: undefined,
                  t: undefined,
                  running: undefined,
                }, null, 2);
                download(content, 'config.json', 'application/json');
              }}>
                Save Config
              </Button>
            </Grid>
          }
          {!this.state.running &&
            <Grid item key="loadConfig">
              <Button variant="contained" component="label">
                Load Config
                <input
                  type="file"
                  name="config"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files[0];
                    const reader = new FileReader();
                    reader.onload = (readerEvent) => {
                      const config = JSON.parse(readerEvent.target.result);
                      this.setState(config);
                    };
                    reader.readAsText(file);
                  }}
                />
              </Button>
            </Grid>
          }
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
