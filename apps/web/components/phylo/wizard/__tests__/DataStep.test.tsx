// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import type {MethodSpec} from '@phylo/contracts';
import DataStep from '../DataStep';

vi.mock('@/features/files/hooks', () => ({
  useFilesList: () => ({data: {files: []}, isLoading: false, error: null}),
}));

const spec = {id: 'gctree', name: 'GCtree', version: '1', accepts: ['text/fasta'], paramSchema: {}} as unknown as MethodSpec;
const pick = (input: Element, file: File) => fireEvent.change(input, {target: {files: [file]}});

function stubPointer(coarse: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: coarse && query === '(pointer: coarse)',
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => stubPointer(false));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderStep() {
  const onChoose = vi.fn();
  const {container} = render(<DataStep spec={spec} onChoose={onChoose} onBack={() => {}} />);
  return {onChoose, input: container.querySelector('input[type="file"]')!};
}

test('with a mouse, the picker filters by file type', () => {
  expect(renderStep().input.getAttribute('accept')).toContain('.fasta');
});

test('on touch, the picker does not filter, because phones grey out unknown extensions', () => {
  stubPointer(true);
  expect(renderStep().input.hasAttribute('accept')).toBe(false);
});

test('a file of the right type is chosen', () => {
  const {onChoose, input} = renderStep();
  const file = new File(['>a\nACGT\n'], 'sample.fasta');
  pick(input, file);
  expect(onChoose).toHaveBeenCalledWith({kind: 'upload', file});
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a file of the wrong type is refused with a reason, and a later good pick clears it', () => {
  const {onChoose, input} = renderStep();
  pick(input, new File(['x'], 'notes.docx'));
  expect(onChoose).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('notes.docx');
  pick(input, new File(['>a\nACGT\n'], 'sample.fasta'));
  expect(onChoose).toHaveBeenCalledOnce();
  expect(screen.queryByRole('alert')).toBeNull();
});
