import { Badge } from "@/components/ui/badge";
import {
  ResponsiveTable,
  ResponsiveTableBody,
  ResponsiveTableCell,
  ResponsiveTableHeader,
  ResponsiveTableRow,
} from "@/components/ui/responsive-table";
import type { DocSection } from "@/features/docs/types";
import { RichText } from "./RichText";

const NEEDS_VERIFICATION = "⚠ NEEDS VERIFICATION";

function MapsToCell({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  if (value.startsWith("N/A")) {
    return <span className="text-muted-foreground">{value}</span>;
  }
  if (value.includes("NEEDS VERIFICATION")) {
    return <Badge variant="warning">{NEEDS_VERIFICATION}</Badge>;
  }
  return (
    <span className="text-foreground">
      <RichText text={value} />
    </span>
  );
}

export function FieldTable({ section }: { section: DocSection }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold tracking-tight text-foreground">{section.label}</h4>
      <ResponsiveTable stackBelow="lg" className="rounded-lg border">
        <ResponsiveTableHeader
          className="bg-muted/50 text-muted-foreground"
          columns={[
            { label: "Field", className: "min-w-[10rem]" },
            { label: "What it is / used for", className: "min-w-[16rem]" },
            { label: "Allowed values", className: "min-w-[9rem]" },
            { label: "Default", className: "min-w-[6rem]" },
            { label: "Maps to method parameter", className: "min-w-[14rem]" },
            { label: "Visible when", className: "min-w-[12rem]" },
          ]}
        />
        <ResponsiveTableBody>
          {section.fields.map((field) => (
            <ResponsiveTableRow key={field.name} className="px-3">
              <ResponsiveTableCell>
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-foreground">{field.label}</span>
                  <code className="w-fit rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                    {field.name}
                  </code>
                  {field.required && (
                    <Badge variant="secondary" className="w-fit">
                      Required
                    </Badge>
                  )}
                </div>
              </ResponsiveTableCell>
              <ResponsiveTableCell label="What it is / used for" className="text-muted-foreground">
                {field.description ? <RichText text={field.description} /> : "—"}
              </ResponsiveTableCell>
              <ResponsiveTableCell label="Allowed values" className="text-muted-foreground">
                {field.allowedValues}
              </ResponsiveTableCell>
              <ResponsiveTableCell label="Default" className="text-muted-foreground">
                {field.defaultValue}
              </ResponsiveTableCell>
              <ResponsiveTableCell label="Maps to method parameter">
                <MapsToCell value={field.mapsTo} />
              </ResponsiveTableCell>
              <ResponsiveTableCell label="Visible when" className="text-muted-foreground">
                {field.visibleWhen || <span className="text-muted-foreground/70">Always</span>}
              </ResponsiveTableCell>
            </ResponsiveTableRow>
          ))}
        </ResponsiveTableBody>
      </ResponsiveTable>
    </div>
  );
}
