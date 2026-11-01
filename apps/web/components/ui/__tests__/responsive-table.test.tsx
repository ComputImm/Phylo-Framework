// @vitest-environment jsdom
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, expect, test} from 'vitest';
import {
  ResponsiveTable,
  ResponsiveTableBody,
  ResponsiveTableCell,
  ResponsiveTableHeader,
  ResponsiveTableRow,
} from '../responsive-table';

afterEach(cleanup);

function Example({stackBelow}: {stackBelow?: 'sm' | 'md' | 'lg'}) {
  return (
    <ResponsiveTable stackBelow={stackBelow} caption="Runs">
      <ResponsiveTableHeader columns={['Name', {label: 'Size', className: 'text-right'}]} />
      <ResponsiveTableBody>
        <ResponsiveTableRow>
          <ResponsiveTableCell>sample.fa</ResponsiveTableCell>
          <ResponsiveTableCell label="Size" noWrap>
            12 KB
          </ResponsiveTableCell>
        </ResponsiveTableRow>
      </ResponsiveTableBody>
    </ResponsiveTable>
  );
}

test('renders one real table with its caption and headers', () => {
  render(<Example />);
  expect(screen.getByRole('table', {name: 'Runs'})).toBeTruthy();
  expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['Name', 'Size']);
  expect(screen.getByRole('columnheader', {name: 'Size'}).className).toContain('text-right');
});

test('labels a cell only when given one, and hides that label once the table has room', () => {
  render(<Example stackBelow="lg" />);
  const label = screen.getAllByText('Size').find((element) => element.tagName === 'SPAN')!;
  expect(label.className).toContain('@4xl:hidden');
  expect(screen.getByText('sample.fa').closest('td')!.querySelector('span')).toBeNull();
});

test('each breakpoint switches the table, header and row at the same width', () => {
  const {container} = render(<Example stackBelow="sm" />);
  expect(container.querySelector('table')!.className).toContain('@xl:table');
  expect(container.querySelector('thead')!.className).toContain('@xl:table-header-group');
  expect(container.querySelector('tbody tr')!.className).toContain('@xl:table-row');
});

test('noWrap applies in table form only, so a stacked value can still wrap', () => {
  render(<Example stackBelow="md" />);
  const cell = screen.getByText('12 KB').closest('td')!;
  expect(cell.className).toContain('@2xl:whitespace-nowrap');
  expect(cell.className.split(' ')).not.toContain('whitespace-nowrap');
});
