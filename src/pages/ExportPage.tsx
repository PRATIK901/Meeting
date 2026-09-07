import { ExportPanel } from '../components/ExportPanel';
import { PageHeading } from '../components/PageHeading';

/** `/admin/export` — the Excel export, on its own screen. */
export function ExportPage() {
  return (
    <>
      <PageHeading
        title="Export"
        subtitle="Download the attendance log as a three-sheet Excel workbook."
      />
      <div className="mt-6">
        <ExportPanel />
      </div>
    </>
  );
}
