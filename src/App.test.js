import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

test('renders spresso', () => {
  const { getByText } = render(<App />);
  const linkElement = getByText(/Spresso/i);
  expect(linkElement).toBeInTheDocument();
});
