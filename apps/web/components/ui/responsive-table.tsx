"use client";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A table that turns into stacked, labelled rows when too narrow for its columns.
 * It follows its own width through a container query, not the viewport, so it
 * behaves the same in a full page or a narrow card. There is one DOM for both
 * forms, restyled by CSS.
 */

type StackVariant = {
  table: string;
  head: string;
  body: string;
  row: string;
  cell: string;
  sideCell: string;
  value: string;
  label: string;
  noWrap: string;
};

// Whole class names, written out so Tailwind can find them.
const STACK_VARIANTS = {
  /** Below 576px: two or three short columns. */
  sm: {
    table: "block @xl:table",
    head: "hidden @xl:table-header-group",
    body: "block @xl:table-row-group",
    row: "block @xl:table-row",
    cell: "block py-1 @xl:table-cell @xl:p-3",
    sideCell: "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 py-1 @xl:table-cell @xl:p-3",
    value: "wrap-anywhere @xl:wrap-normal",
    label: "@xl:hidden",
    noWrap: "@xl:whitespace-nowrap",
  },
  /** Below 672px: about five columns. */
  md: {
    table: "block @2xl:table",
    head: "hidden @2xl:table-header-group",
    body: "block @2xl:table-row-group",
    row: "block @2xl:table-row",
    cell: "block py-1 @2xl:table-cell @2xl:p-3",
    sideCell: "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 py-1 @2xl:table-cell @2xl:p-3",
    value: "wrap-anywhere @2xl:wrap-normal",
    label: "@2xl:hidden",
    noWrap: "@2xl:whitespace-nowrap",
  },
  /** Below 896px: six or more columns. */
  lg: {
    table: "block @4xl:table",
    head: "hidden @4xl:table-header-group",
    body: "block @4xl:table-row-group",
    row: "block @4xl:table-row",
    cell: "block py-1 @4xl:table-cell @4xl:p-3",
    sideCell: "grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 py-1 @4xl:table-cell @4xl:p-3",
    value: "wrap-anywhere @4xl:wrap-normal",
    label: "@4xl:hidden",
    noWrap: "@4xl:whitespace-nowrap",
  },
} satisfies Record<string, StackVariant>;

export type StackBelow = keyof typeof STACK_VARIANTS;

/** Where a stacked cell puts its label: beside short values, above long prose. */
type LabelPlacement = "side" | "top";

const TableContext = createContext<{ variant: StackVariant; labelPlacement: LabelPlacement }>({
  variant: STACK_VARIANTS.md,
  labelPlacement: "top",
});

export function ResponsiveTable({
  stackBelow = "md",
  labelPlacement = "top",
  caption,
  className,
  tableClassName,
  children,
}: {
  stackBelow?: StackBelow;
  labelPlacement?: LabelPlacement;
  caption?: string;
  className?: string;
  tableClassName?: string;
  children: ReactNode;
}) {
  const variant = STACK_VARIANTS[stackBelow];
  return (
    <TableContext.Provider value={{ variant, labelPlacement }}>
      <div className={cn("@container w-full overflow-x-auto", className)}>
        <table className={cn("w-full text-sm", variant.table, tableClassName)}>
          {caption && <caption className="sr-only">{caption}</caption>}
          {children}
        </table>
      </div>
    </TableContext.Provider>
  );
}

export type ResponsiveTableColumn = string | { label: ReactNode; className?: string };

export function ResponsiveTableHeader({
  columns,
  className,
}: {
  columns: ResponsiveTableColumn[];
  className?: string;
}) {
  const { variant } = useContext(TableContext);
  return (
    <thead className={variant.head}>
      <tr className={cn("border-b", className)}>
        {columns.map((column, index) => {
          const { label, className: columnClassName } =
            typeof column === "string" ? { label: column, className: undefined } : column;
          return (
            <th key={index} scope="col" className={cn("px-3 py-2.5 text-left font-medium", columnClassName)}>
              {label}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function ResponsiveTableBody({ children }: { children: ReactNode }) {
  const { variant } = useContext(TableContext);
  return <tbody className={variant.body}>{children}</tbody>;
}

export function ResponsiveTableRow({ className, ...props }: ComponentProps<"tr">) {
  const { variant } = useContext(TableContext);
  return <tr className={cn("border-b py-3 align-top last:border-0", variant.row, className)} {...props} />;
}

export function ResponsiveTableCell({
  label,
  noWrap = false,
  className,
  children,
  ...props
}: ComponentProps<"td"> & {
  /** Shown only when stacked. Leave out for a cell that explains itself. */
  label?: ReactNode;
  /** Keeps the value on one line in table form; a stacked value always wraps. */
  noWrap?: boolean;
}) {
  const { variant, labelPlacement } = useContext(TableContext);
  return (
    <td
      className={cn(labelPlacement === "side" ? variant.sideCell : variant.cell, noWrap && variant.noWrap, className)}
      {...props}
    >
      {label && <span className={cn("block text-xs font-medium text-muted-foreground", variant.label)}>{label}</span>}
      <div className={cn("min-w-0", !label && "col-span-full", variant.value)}>{children}</div>
    </td>
  );
}
