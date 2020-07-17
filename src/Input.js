import React from 'react';
// bootstrap stuff
import InputGroup from 'react-bootstrap/InputGroup';
import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Tooltip from 'react-bootstrap/Tooltip';
import Form from 'react-bootstrap/Form';

export class Input extends React.Component {
  constructor(props) {
    super(props);
    const { name } = this.props;
    let value = localStorage.getItem(name);
    if (value === null) {
      value = this.props.defaultValue;
      localStorage.setItem(name, value.toString());
    }
    if (this.props.update)
      this.props.update(name, this.formatValue(value));
  }

  formatValue(value) {
    return value;
  }

  onChange(event) {
    localStorage.setItem(event.target.name, event.target.value);
    const value = this.formatValue(event.target.value);
    if (this.props.update) {
      this.props.update(event.target.name, value);
    }
  }

  getContent() {
    console.log('Base Input Class Content Not Implemented');
    return '';
  }

  render() {
    const { hint } = this.props;
    return (
      <InputGroup size="sm">
        <InputGroup.Prepend>
          <OverlayTrigger
            placement="bottom"
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
        { this.getContent() }
      </InputGroup>
    );
  }
}

export class InputNumber extends Input {
  getContent() {
    const { name, placeholder } = this.props;
    return (
      <Form.Control
        name={ name }
        placeholder={ placeholder }
        type="number"
        value={ localStorage.getItem(name) }
        onChange={ (event) => this.onChange(event) }
        readOnly={ this.props.readOnly }
      />
    );
  }
}

export class InputInt extends InputNumber {
  formatValue(value) {
    return parseInt(value);
  }
}

export class InputFloat extends InputNumber {
  formatValue(value) {
    return parseFloat(value);
  }
}

export class InputText extends Input {
  getContent() {
    const { name, placeholder } = this.props;
    return (
      <Form.Control
        name={ name }
        placeholder={ placeholder }
        type="text"
        value={ localStorage.getItem(name) }
        onChange={ (event) => this.onChange(event) }
        readOnly={ this.props.readOnly }
      />
    );
  }
}

