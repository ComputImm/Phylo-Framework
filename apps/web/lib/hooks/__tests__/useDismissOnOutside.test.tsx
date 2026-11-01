// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach, expect, test, vi} from 'vitest';
import {useBackdropDismiss, useDismissOnOutside} from '../useDismissOnOutside';

afterEach(cleanup);

function Popover({active, onDismiss}: {active: boolean; onDismiss: () => void}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismissOnOutside(ref, onDismiss, active);
  return (
    <div>
      <div ref={ref}>inside</div>
      <div>outside</div>
    </div>
  );
}

test('a press outside dismisses; a press inside does not', () => {
  const onDismiss = vi.fn();
  render(<Popover active onDismiss={onDismiss} />);
  fireEvent.pointerDown(screen.getByText('inside'));
  expect(onDismiss).not.toHaveBeenCalled();
  fireEvent.pointerDown(screen.getByText('outside'));
  expect(onDismiss).toHaveBeenCalledOnce();
});

test('does nothing while inactive', () => {
  const onDismiss = vi.fn();
  render(<Popover active={false} onDismiss={onDismiss} />);
  fireEvent.pointerDown(screen.getByText('outside'));
  expect(onDismiss).not.toHaveBeenCalled();
});

function Modal({onDismiss}: {onDismiss: () => void}) {
  const props = useBackdropDismiss(onDismiss);
  return (
    <div data-testid="backdrop" {...props}>
      <div>panel</div>
    </div>
  );
}

test('a backdrop closes on the click of a press that began on it', () => {
  const onDismiss = vi.fn();
  render(<Modal onDismiss={onDismiss} />);
  const backdrop = screen.getByTestId('backdrop');
  fireEvent.pointerDown(backdrop);
  expect(onDismiss).not.toHaveBeenCalled(); // not yet: the tap's click would hit what lies beneath
  fireEvent.click(backdrop);
  expect(onDismiss).toHaveBeenCalledOnce();
});

test('a text selection dragged from the panel onto the backdrop does not close it', () => {
  const onDismiss = vi.fn();
  render(<Modal onDismiss={onDismiss} />);
  fireEvent.pointerDown(screen.getByText('panel'));
  fireEvent.click(screen.getByTestId('backdrop'));
  expect(onDismiss).not.toHaveBeenCalled();
});
