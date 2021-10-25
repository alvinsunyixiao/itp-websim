import React, { useState, useEffect } from 'react';
import './App.css';
// material ui stuff
import Box from '@material-ui/core/Box';
import Button from '@material-ui/core/Button';
import Container from '@material-ui/core/Container';
import Grid from '@material-ui/core/Grid';
import IconButton from '@material-ui/core/IconButton';
import Slider from '@material-ui/core/Slider';
// material icons
import AddCircleRoundedIcon from '@material-ui/icons/AddCircleRounded';
import AssessmentIcon from '@material-ui/icons/Assessment';
import DeleteIcon from '@material-ui/icons/Delete';
import PauseIcon from '@material-ui/icons/Pause';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import PublishIcon from '@material-ui/icons/Publish';
import SaveAltIcon from '@material-ui/icons/SaveAlt';
import SaveIcon from '@material-ui/icons/Save';
import MaterialTable from "material-table";
// plotly
import Plotly from 'plotly.js-basic-dist';
import createPlotlyComponent from 'react-plotly.js/factory';
// JSZip
import JSZip from "jszip";
// download file from frontend
import { saveAs } from 'file-saver';
// common species database
import commonSpecies from './commonSpecies.json';
// mathjs
import { range } from 'mathjs';

import { SpressoInput } from './Spresso';
import { InputNumber, InputText, InputSelect, LargeTooltip } from './Input';

const VERSION = 'spresso_v1.5';

const Plot = createPlotlyComponent(Plotly);

const DEFAULT_INPUT = {
  // simulation related
  simTime:          '50',
  animateRate:      '5',
  // numerics related
  numGrids:         '1000',
  interfaceWidth:   '1',
  tolerance:        '1e-2',
  // data related
  domainLen:        '40',
  current:          '-10',
  area:             '1400',
};

const DEFAULT_SPECIES = [
  {
    name:               'HCl',
    injectionType:      'Right Plateau',
    injectionLoc:       '12',
    initConcentration:  '100',
    valence:            '-1',
    mobility:           '79.1',
    pKa:                '-2',
  },
  {
    name:               'Hepes',
    injectionType:      'Left Plateau',
    injectionLoc:       '12',
    initConcentration:  '100',
    valence:            '-1',
    mobility:           '26',
    pKa:                '7.2',
  },
  {
    name:               'Acetic Acid',
    injectionType:      'Peak',
    injectionLoc:       '12',
    injectionWidth:     '2',
    injectionAmount:    '140',
    valence:            '-1',
    mobility:           '42.4',
    pKa:                '4.756',
  },
  {
    name:               'Acid 2',
    injectionType:      'Peak',
    injectionLoc:       '12',
    injectionWidth:     '2',
    injectionAmount:    '120',
    valence:            '-1',
    mobility:           '52.4',
    pKa:                '4',
  },
  {
    name:               'Tris',
    injectionType:      'Uniform',
    initConcentration:  '200',
    valence:            '1',
    mobility:           '29',
    pKa:                '8.076',
  },
];

const SPECIE_TYPE = [
  { label: 'Left Plateau', value: 'Left Plateau' },
  { label: 'Right Plateau', value: 'Right Plateau' },
  { label: 'Peak', value: 'Peak' },
  { label: 'Uniform', value: 'Uniform' },
];

const ValueLabelTooltip = (props) => {
  const { children, open, value } = props;
  return (
    <LargeTooltip open={open} placement="top" title={value}>
      {children}
    </LargeTooltip>
  );
}

const SimReport = ({simResult}) => {
  const { domainLen } = simResult.input;
  const numSteps = simResult.output.time_t.length;
  const numSpecies = simResult.input.species.length;
  const numGrids = simResult.input.numGrids;
  const [frameIdx, setFrameIdx] = useState(0);
  const [simConfig, setSimConfig] = useState({ responsive: true });
  const [simLayout, setSimLayout] = useState({
    title: 'Concentration / pH Plot',
    xaxis: { title: 'Domain [mm]' },
    yaxis: { title: 'Concentration [mM]' },
    yaxis2: { title: 'pH' },
    grid: { rows: 2, columns: 1 },
    autosize: true,
  });
  const [simData, setSimData] = useState([]);
  useEffect(() => {
    const grid_n = range(0, domainLen * 1e3, domainLen * 1e3 / numGrids).toArray(); // m => mm
    const concentration_sn = simResult.output.concentration_tsn.subarray(
      frameIdx * numSpecies * numGrids, (frameIdx + 1) * numSpecies * numGrids);
    const cH_n = simResult.output.cH_tn.subarray(frameIdx * numGrids, (frameIdx + 1) * numGrids);
    setSimData((sData) => simResult.input.species.map((specie, idx) => ({
      ...sData[idx],
      x: grid_n,
      y: concentration_sn.subarray(idx * numGrids, (idx + 1) * numGrids),
      name: specie.name + ' -- ' + specie.injectionType,
    })).concat([{
      ...sData[simResult.input.species.length],
      x: grid_n,
      y: cH_n.map((val) => -Math.log10(val)),
      yaxis: 'y2',
      name: 'pH',
    }]));
  }, [frameIdx, simResult, domainLen, numGrids, numSpecies]);
  return (
  <>
    <Grid container key="plotTitle" alignItems="center">
      <Grid item sm={3}>
        <h3>Simulation Playback</h3>
      </Grid>
      <Grid item sm={6}>
        <Slider
          value={ frameIdx }
          min={0}
          max={numSteps - 1}
          step={1}
          onChange={ (_, val) => setFrameIdx(val) }
          aria-labelledby="time-step-slider"
          ValueLabelComponent={ValueLabelTooltip}
          valueLabelDisplay="auto"
          valueLabelFormat={(i) => `[${i}] ${simResult.output.time_t[i].toFixed(2)} s`}
        />
      </Grid>
      <Grid item sm={1}></Grid>
      <Grid item sm={2}>
        t = {simResult.output.time_t[frameIdx].toFixed(2) + ' s'}
      </Grid>
    </Grid>
    <Grid container key="plot">
      <Plot
        data={ simData }
        layout={ simLayout }
        config={ simConfig }
        style={{ width: '100%', height: 700 }}
        divId='simPlayback'
        onInitialized={(fig) => {
          setSimLayout(fig.layout); setSimConfig(fig.config); setSimData(fig.data)}}
        onUpdate={(fig) => {
          setSimLayout(fig.layout); setSimConfig(fig.config); setSimData(fig.data)}}
      />
    </Grid>
  </>
  );
};

class SimUI extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      // react plot
      data: [],
      config: { responsive: true },
      layout: {
        xaxis: { title: 'Domain [mm]' },
        yaxis: { title: 'Concentration [mM]' },
        yaxis2: { title: 'pH' },
        legend: { x: 1.05, },
        grid: { rows: 2, columns: 1 },
        autosize: true,
      },
      // simulation status
      running: false,
      initialized: false,
      genReport: false,
      // inputs
      species: JSON.parse(localStorage.getItem("species")) || DEFAULT_SPECIES,
      injectionValid: JSON.parse(localStorage.getItem("injectionValid") || false),
      // download status
      downloading: false,
    }
    this.worker = new Worker('./worker.js', { type: 'module' });
    this.worker.onmessage = (e) => this.workerHandler(e);
  }

  workerHandler(e) {
    switch (e.data.msg) {
      case 'update':
        this.setState({
          initialized: true,
          data: this.state.species.map((specie, specieIdx) => ({
            ...(this.state.data.length === this.state.species.length + 1 ?
                this.state.data[specieIdx] : {}),
            x: e.data.plot.x,
            y: e.data.plot.concentration_sn.subarray(specieIdx * this.state.numGrids,
                                                     (specieIdx+1) * this.state.numGrids),
            name: specie.name + ' -- ' + specie.injectionType,
          })).concat([{
            ...(this.state.data.length === this.state.species.length + 1?
                this.state.data[this.state.species.length] : {}),
            x: e.data.plot.x,
            y: e.data.plot.pH_n,
            name: 'pH',
            yaxis: 'y2',
          }]),
          layout: {
            ...this.state.layout,
            title: { text: 'Concentration / pH @ t = ' + e.data.t.toFixed(2) + ' s' },
          },
        });
        break;
      case 'finished':
        this.setState({running: false});
        this.worker.postMessage({msg: 'retrieve'});
        break;
      case 'init':
        console.log('TF is using ' + e.data.backend + ' backend.');
        break;
      case 'data':
        const { result, input } = e.data;
        const simResult = { input: input, output: result };
        this.setState({ simResult });
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
    this.setState({running: false, initialized: false, genReport: false, simResult: undefined});

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
        case 'Peak':
          return injectionLocValid && injectionWidthValid;
        case 'Right Plateau':
        case 'Left Plateau':
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
        case 'Left Plateau':
          return {left: 0., right: loc};
        case 'Right Plateau':
          return {left: loc, right: domainLen};
        case 'Peak':
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
    if (prevState.data !== this.state.data) {
      this.worker.postMessage({msg: 'updated'});
    }
  }

  render() {
    const startPause = this.state.running ?
      <Button
        variant="contained"
        color="default"
        endIcon={<PauseIcon/>}
        size="small"
        onClick={() => {
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
        size="small"
        disabled={ !this.inputValid() || !this.state.initialized }
        onClick={() => {
          this.setState({running: true, simResult: undefined});
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
        <Grid container justify="center" alignItems="center" key="spressTitle">
          <Box
            m={3}
            bgcolor="primary.main"
            color="primary.contrastText"
            width={1}
            textAlign="center"
            borderRadius={16}
          >
            <h1>Client-based Application for Fast Electrophoresis Simulation (CAFES)</h1>
          </Box>
        </Grid>
        <Box mb={2} key="basic"><Grid container>
          <Grid item container sm={6} spacing={1} alignItems="center">
            <Grid item sm={2} key="title"><h4>Simulation</h4></Grid>
            <Grid item sm={4} key="simTime">
              <InputNumber
                cache
                valid={ this.state.simTimeValid || false }
                invalidText="Must be positive"
                label="Simulation Time [s]."
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
                label="Steps per plot update"
                name="animateRate"
                update={(name, value) => inputUpdate(name, value,
                  Number.isInteger(parseFloat(value)) && parseInt(value) > 0)}
                value={ this.state.animateRate }
                defaultValue={ DEFAULT_INPUT.animateRate }
              >
                Update the animated graph once every this many steps of simulation.
                Lower this value to obtain smoother animation.<br/>
                <strong style={{color: 'yellow'}}>Warning</strong>:
                  smaller value can produce smoother animation but at a potential cost of
                  slower simulation speed.
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
                  may fail due to floating point precision issues. Also,
                  don't worry about having a tolerance as high as 1e-2
                  since the error estimate is the norm of the entire unnormalized
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
            <Grid item sm={4} key="title"><h4>Experimental parameters</h4></Grid>
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
            <Grid item sm={2} key="current">
              <InputNumber
                cache
                valid={ this.state.currentValid || false }
                label="Current [&mu;A]"
                name="current"
                update={(name, value) => inputUpdate(name, value, true)}
                value={ this.state.current }
                defaultValue={ DEFAULT_INPUT.current }
              >
                Electrical current in [&mu;A] with positive direction pointing right.
              </InputNumber>
            </Grid>
            <Grid item sm={2} key="area">
              <InputNumber
                cache
                valid={ this.state.areaValid || false }
                invalidText="Must be positive"
                label={<>Area &#91;&mu;m<sup>2</sup>&#93;</>}
                name="area"
                update={(name, value) => inputUpdate(name, value, parseFloat(value) > 0)}
                value={ this.state.area }
                defaultValue={ DEFAULT_INPUT.area }
              >
                Cross section area of the channel in [&mu;m<sup>2</sup>].
              </InputNumber>
            </Grid>
          </Grid>
          <Grid item sm={1} key="add_button">
            <LargeTooltip arrow title="Add a species">
              <IconButton onClick={() => {
                this.setState({species: [...this.state.species, {}]});
              }}>
                <AddCircleRoundedIcon/>
              </IconButton>
            </LargeTooltip>
          </Grid>
        </Grid></Box>
        {this.state.species.map((specie, specieIdx) => {
          // callback function for setting per specie properties
          const setSpecieSpec = (name, value, valid, validName=undefined) => {
            validName = validName || (name + "Valid");
            this.setState((state) => ({
              species: state.species.map((specie, idx) => (idx === specieIdx ?
                {...specie, [name]: value, [validName]: valid} : specie)
              )
            }));
          };

          return (
          <Box mb={2} key={specieIdx}><Grid container spacing={1}>
            <Grid container item sm={4} spacing={1}>
              <Grid item sm={7} key="name">
                <InputText
                  label="Species Name"
                  valid={ specie.nameValid || false }
                  invalidText="Must not be empty"
                  name={ "Specie" + specieIdx }
                  value={ specie.name }
                  defaultValue={ "Species " + specieIdx }
                  update={(name, value) => setSpecieSpec("name", value, !(!value))}
                >
                  Species Name.
                </InputText>
              </Grid>
              <Grid item sm={5} key="injectionType">
                <InputSelect
                  label="Type"
                  name={ "injectionType" + specie.name }
                  options={ SPECIE_TYPE }
                  value={ specie.injectionType }
                  defaultValue="Peak"
                  update={(name, value) => setSpecieSpec("injectionType", value)}
                >
                  Injection Type.
                </InputSelect>
              </Grid>
            </Grid>
            <Grid container item sm={3} spacing={1}>
              {specie.injectionType === 'Peak' &&
              <Grid item sm={4} key="injectionAmount">
                <InputNumber
                  label={ <i>N</i> }
                  valid={ specie.injectionAmountValid || false }
                  invalidText="Must be positive"
                  name={ "injectionAmount" + specie.name }
                  value={ specie.injectionAmount }
                  update={(name, value) => setSpecieSpec("injectionAmount", value,
                    parseFloat(value) > 0)}
                >
                  Amount of injected substance in [10<sup>-12</sup> mole].
                </InputNumber>
              </Grid>
              }
              {specie.injectionType !== 'Peak' &&
              <Grid item sm={4} key="initConcentration">
                <InputNumber
                  label={ <i><span>c<sub>0</sub></span></i> }
                  valid={ specie.initConcentrationValid || false }
                  invalidText="Must be positive"
                  name={ "initConcentration" + specie.name }
                  value={ specie.initConcentration }
                  update={(name, value) => setSpecieSpec("initConcentration", value,
                    parseFloat(value) > 0)}
                >
                  Initial concentration in [mM].
                </InputNumber>
              </Grid>
              }
              {specie.injectionType !== 'Uniform' &&
              <Grid item sm={4} key="injectionLoc">
                <InputNumber
                  label={ <i><span>x<sub>inj</sub></span></i> }
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
              {specie.injectionType === 'Peak' &&
              <Grid item sm={4} key="injectionWidth">
                <InputNumber
                  label={ <i>w</i> }
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
                    Valences should NOT discontinue, i.e. a species with a -2 valence must
                    also has a -1 valence.
                </InputText>
              </Grid>
              <Grid item sm={4} key="mobility">
                <InputText
                  label={ <i>&mu;</i> }
                  valid= { specie.propertyValid || false }
                  name={ "mobility" + specie.name }
                  value={ specie.mobility }
                  update={(name, value) => setSpecieSpec("mobility", value,
                    this.validateProperties(specie, 'mobility', value), 'propertyValid')}
                >
                  <strong>Absolute</strong> mobility at each valence in
                  [10<sup>-9</sup>m<sup>2</sup>/(V&middot;s)].<br/>
                  <strong style={{color: 'cyan'}}>Format</strong>:
                    a comma seperated list of positive numbers (must have the
                    same number of entries as the number of valences).
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
                    same number of entries as the number of valences).
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

        <Box mb={3} key="db"><Grid container alignItems="center" key="commonSpecies">
          <MaterialTable
            title={
              <LargeTooltip title={
                <span>
                  <strong style={{color: 'yellow'}}>Warning: </strong>
                  A large portion of the entries in this data base are based on the
                  work of Hirokawa et al., <i>J. Chromatogr</i>. 252 (1982) 49.
                  We cannot guarantee all of the data is correct.
                </span>
              }>
                <h4>Common Species</h4>
              </LargeTooltip>
            }
            style={ { width: '90%' } }
            localization={{
              header: {
                actions: "Add",
              }
            }}
            options={ { maxBodyHeight: 300, padding: 'dense' } }
            actions={[{ icon: 'add', tooltip: 'Add to simulation', onClick: (_, rowData) => {
              this.setState({species: [...this.state.species, rowData]});
            }}]}
            columns={[
              { title: 'Name', field: 'name',
                tooltip: 'Species Name' },
              { title: 'Valence', field: 'valence',
                tooltip: 'Valence eletrical charges',
                searchable: false },
              { title: 'Mobility', field: 'mobility',
                tooltip: 'Mobility at each valence in [1e-9 m\u00b2/(V\u00b7s)]',
                searchable: false },
              { title: 'pKa', field: 'pKa',
                tooltip: 'Negative log dissociation constant at each valence', searchable: false },
            ]}
            data={commonSpecies.map((specie) => ({
              name: specie.name,
              valence: specie.valence.join(', '),
              mobility: specie.mobility.join(', '),
              pKa: specie.pKa.join(', '),
            }))}
          />
        </Grid></Box>

        <Box mb={3} key="btns"><Grid container alignItems="center" spacing={2}>
          <Grid item key="startPauseBtn">
            { !this.state.genReport && startPause }
          </Grid>
          {!this.state.running &&
            <Grid item key="resetBtn">
              <Button color="secondary" variant="contained" size="small"
                      onClick={() => this.resetHandler()}>
                Reset
              </Button>
            </Grid>
          }
          {!this.state.running &&
            <Grid item key="saveConfig">
              <Button
                variant="contained"
                endIcon={<SaveIcon/>}
                size="small"
                onClick={() => {
                  const content = JSON.stringify({
                    ...this.state,
                    data: undefined,
                    layout: undefined,
                    config: undefined,
                    frames: undefined,
                    running: undefined,
                  }, null, 2);
                  const blob = new Blob([content], {type: 'application/json'});
                  saveAs(blob, 'config.json');
                }
              }>
                Save Config
              </Button>
            </Grid>
          }
          {!this.state.running &&
            <Grid item key="loadConfig">
              <Button variant="contained" component="label" endIcon={<PublishIcon/>} size="small">
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
          {!this.state.running && !this.state.genReport &&
            <Grid item key="report">
              <Button
                variant="contained"
                endIcon={<AssessmentIcon/>}
                size="small"
                disabled={ !this.state.simResult }
                onClick={() => this.setState({genReport: true})}
              >
                Analyze
              </Button>
            </Grid>
          }
          {!this.state.running &&
            <Grid item key="saveResultButton">
              <Button
                variant="contained"
                endIcon={<SaveAltIcon/>}
                size="small"
                disabled={ !this.state.simResult || this.state.downloading }
                onClick={() => {
                  this.setState({downloading: true});
                  const zip = new JSZip();
                  const folder = zip.folder('Simulation Results');
                  folder.file("concentration_tsn.bin",
                              this.state.simResult.output.concentration_tsn.buffer);
                  folder.file("cH_tn.bin",
                              this.state.simResult.output.cH_tn.buffer);
                  folder.file("time_t.bin",
                              this.state.simResult.output.time_t.buffer);
                  folder.file("inputs.json", JSON.stringify(this.state.simResult.input, null, 2));
                  zip.generateAsync({type: 'blob', compression: 'DEFLATE'}).then((blob) => {
                    saveAs(blob, "result.zip");
                    this.setState({downloading: false});
                  });
                }
              }>
                {this.state.downloading ?
                 "Generating..."
                 :
                 "Save Result"
                }
              </Button>
            </Grid>
          }
        </Grid></Box>
        <Box mb={3} key="report"><Grid container alignItems="center" spacing={1}>
        {this.state.genReport &&
          <SimReport simResult={this.state.simResult}/>
        }
        </Grid></Box>
        {!this.state.genReport &&
        <Grid container key="livePlot">
        {this.state.initialized ?
          <Plot
            data={ this.state.data }
            layout={ this.state.layout }
            config={ this.state.config }
            style={ {width: '100%', height: 700} }
            divId='concentrationPlot'
            onInitialized={(figure) => this.setState(figure)}
            onUpdate={(figure) => this.setState(figure)}
          />
          :
          <Plot
            layout={ {...this.state.layout, title: 'Initializing...'} }
            config={ this.state.config }
            style={ {width: '100%', height: 700} }
          />
        }
        </Grid>
        }
      </div>
    );
  }
}

const App = (props) => {
  // for reset cache if app is updated to a newer version
  if (localStorage.getItem('version') !== VERSION) {
    localStorage.clear();
    localStorage.setItem('version', VERSION);
  }
  return (
    <Container>
      <SimUI/>
    </Container>
  );
};

export default App;
