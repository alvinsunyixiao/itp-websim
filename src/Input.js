import React from 'react';
// material-ui
import TextField from '@material-ui/core/TextField';
import MenuItem from '@material-ui/core/MenuItem';
import Tooltip from '@material-ui/core/Tooltip';

class Input extends React.Component {
  constructor(props) {
    super(props);
    const { name } = this.props;
    let value = this.props.defaultValue || '';
    if (this.props.cache) {
      value = localStorage.getItem(name) || value;
    }
    this.updateCache(name, value.toString());
    if (this.props.update) {
      if (this.props.value !== undefined) {
        this.props.update(name, this.props.value);
      }
      else {
        this.props.update(name, value);
      }
    }
  }

  updateCache(name, value) {
    if (this.props.cache) {
      localStorage.setItem(name, value);
    }
  }

  onChange(event) {
    this.updateCache(event.target.name, event.target.value);
    const value = event.target.value;
    if (this.props.update) {
      this.props.update(event.target.name, value);
    }
  }
}

export class InputNumber extends Input {
  render() {
    const { name, value, label, readOnly, valid, invalidText, validEmbed } = this.props;
    const props = { name, label };
    const descTitle = validEmbed ?
      <div>
        { this.props.children }
        { !valid &&
          <div>
            <strong style={{ color: 'red' }}>Error</strong>: { invalidText }
          </div>
        }
      </div>
      :
      this.props.children;
    return (
      <Tooltip title={ descTitle } enterDelay={400} arrow>
        <TextField
          fullWidth
          error={ !valid }
          helperText={ !valid && !validEmbed && invalidText }
          type="number"
          value={ value || '' }
          size="small"
          variant="outlined"
          InputProps={{
            readOnly: readOnly
          }}
          onChange={ (event) => this.onChange(event) }
          {...props}
        />
      </Tooltip>
    );
  }
}

export class InputText extends Input {
  render() {
    const { name, value, label, readOnly, valid, invalidText } = this.props;
    const props = { name, label };
    return (
      <Tooltip title={ this.props.children } enterDelay={400} arrow>
        <TextField
          fullWidth
          error={ !valid }
          helperText={ !valid && invalidText }
          type="text"
          value={ value || '' }
          size="small"
          variant="outlined"
          InputProps={{
            readOnly: readOnly
          }}
          onChange={ (event) => this.onChange(event) }
          {...props}
        />
      </Tooltip>
    );
  }
}

export class InputSelect extends Input {
  render() {
    const { options, name, value, label } = this.props;
    const props = { name, label };
    return (
      <Tooltip title={ this.props.children } enterDelay={400} arrow>
        <TextField
          select
          fullWidth
          value={ value || '' }
          size="small"
          variant="outlined"
          onChange={ (event) => {
            this.onChange(event);
          }}
          {...props}
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              { option.label }
            </MenuItem>
          ))}
        </TextField>
      </Tooltip>
    );
  }
}
