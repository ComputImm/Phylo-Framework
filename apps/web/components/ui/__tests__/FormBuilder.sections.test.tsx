// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import FormBuilder from '../FormBuilder';

const schema = {
  type: 'object',
  required: ['later'],
  properties: {
    first: {type: 'string', title: 'First field', default: 'x'},
    later: {type: 'string', title: 'Later field', minLength: 1},
  },
  uiHints: {
    sections: [
      {id: 'one', label: 'One', fields: ['first']},
      {id: 'two', label: 'Two', fields: ['later']},
    ],
  },
} as any;

const isHiddenBySection = (element: HTMLElement) => element.closest('.hidden') !== null;

function stubPhone(isPhone: boolean) {
  vi.stubGlobal('matchMedia', () => ({matches: isPhone, addEventListener: () => {}, removeEventListener: () => {}}));
}

beforeEach(() => {
  stubPhone(true);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('on a phone only the first section starts open, and the others open on tap', () => {
  render(<FormBuilder schema={schema} onSubmit={vi.fn()} />);
  expect(isHiddenBySection(screen.getByLabelText('First field'))).toBe(false);
  expect(isHiddenBySection(screen.getByLabelText(/Later field/))).toBe(true);
  fireEvent.click(screen.getByRole('button', {name: 'Two'}));
  expect(isHiddenBySection(screen.getByLabelText(/Later field/))).toBe(false);
});

test('a validation error in a collapsed section opens it', async () => {
  render(<FormBuilder schema={schema} onSubmit={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', {name: 'Run'}));
  await waitFor(() => expect(isHiddenBySection(screen.getByLabelText(/Later field/))).toBe(false));
});

test('from tablet up every section is open with no toggle', () => {
  stubPhone(false);
  render(<FormBuilder schema={schema} onSubmit={vi.fn()} />);
  expect(screen.queryByRole('button', {name: 'Two'})).toBeNull();
  expect(isHiddenBySection(screen.getByLabelText(/Later field/))).toBe(false);
});

test('the reason Run is blocked is on screen, not only in a tooltip', () => {
  render(<FormBuilder schema={schema} onSubmit={vi.fn()} submitDisabled submitDisabledReason="Hourly run limit reached" />);
  expect(screen.getByText('Hourly run limit reached')).toBeTruthy();
});
