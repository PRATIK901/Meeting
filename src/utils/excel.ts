import type {
  AttendanceExportRow,
  MeetingSummaryReportRow,
  ParticipantSummaryReportRow,
} from '../types/database';

/** `07-09-2026` — the format the exported sheets use for dates. */
function formatSheetDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}-${m}-${y}`;
}

/** `09:15:32` in the viewer's local time, matching what the app displays. */
function formatSheetTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** `meeting-attendance-2026-09-06.xlsx` */
export function exportFileName(today = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return `meeting-attendance-${stamp}.xlsx`;
}

export interface WorkbookData {
  records: AttendanceExportRow[];
  meetingSummary: MeetingSummaryReportRow[];
  participantSummary: ParticipantSummaryReportRow[];
  /** Human-readable description of the filters, written into each sheet. */
  filterLabel: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sheet = any;

const HEADER_FILL = 'FF1E293B'; // slate-800
const PERCENT_FMT = '0.0"%"';

/**
 * Style a sheet's header row and turn it into a frozen, filterable table.
 *
 * Worth the few lines: without a frozen header a thousand-row export is
 * unreadable the moment you scroll, and without autofilter the first thing
 * anyone does is add one by hand.
 */
function styleHeader(sheet: Sheet, columnCount: number, titleRows: number) {
  const header = sheet.getRow(titleRows + 1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_FILL },
  };
  header.alignment = { vertical: 'middle' };
  header.height = 20;

  sheet.views = [{ state: 'frozen', ySplit: titleRows + 1 }];
  sheet.autoFilter = {
    from: { row: titleRows + 1, column: 1 },
    to: { row: titleRows + 1, column: columnCount },
  };
}

/** A small caption above the header explaining what the sheet covers. */
function addTitle(sheet: Sheet, title: string, subtitle: string, width: number) {
  sheet.mergeCells(1, 1, 1, width);
  const cell = sheet.getCell(1, 1);
  cell.value = title;
  cell.font = { bold: true, size: 13 };

  sheet.mergeCells(2, 1, 2, width);
  const sub = sheet.getCell(2, 1);
  sub.value = subtitle;
  sub.font = { size: 10, color: { argb: 'FF64748B' } };
}

/**
 * Build the three-sheet workbook and hand it to the browser as a real .xlsx.
 *
 * ExcelJS is imported dynamically so its ~1 MB writer stays out of the bundle
 * a phone downloads when it scans a QR code — the export only ever runs on an
 * admin screen.
 *
 * Dates and times are written as preformatted strings rather than Excel date
 * serials on purpose: a serial is interpreted against the *reader's* timezone,
 * which would quietly shift a 00:15 check-in onto the previous day for a
 * colleague opening the file in another country. The exported figures should
 * say the same thing everywhere.
 */
export async function buildWorkbook(data: WorkbookData): Promise<Sheet> {
  const { default: ExcelJS } = await import('exceljs');

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  workbook.creator = 'Meeting Attendance';

  /* ----- Sheet 1: Attendance Records ------------------------------------ */
  const records = workbook.addWorksheet('Attendance Records');
  records.columns = [
    { key: 'date', width: 14 },
    { key: 'time', width: 12 },
    { key: 'meeting', width: 26 },
    { key: 'number', width: 16 },
    { key: 'name', width: 26 },
  ];
  addTitle(records, 'Attendance Records', data.filterLabel, 5);
  records.getRow(3).values = [
    'Date',
    'Time',
    'Meeting',
    'Person Number',
    'Person Name',
  ];
  for (const row of data.records) {
    records.addRow({
      date: formatSheetDate(row.attendance_date),
      time: formatSheetTime(row.attended_at),
      meeting: row.meeting_name,
      // Text, not a number: person numbers can carry leading zeros, and Excel
      // would otherwise render 0123 as 123.
      number: row.person_number,
      name: row.person_name,
    });
  }
  styleHeader(records, 5, 2);

  /* ----- Sheet 2: Meeting Summary --------------------------------------- */
  const meetings = workbook.addWorksheet('Meeting Summary');
  meetings.columns = [
    { key: 'date', width: 14 },
    { key: 'meeting', width: 26 },
    { key: 'eligible', width: 20 },
    { key: 'attended', width: 12 },
    { key: 'absent', width: 12 },
    { key: 'percentage', width: 22 },
  ];
  addTitle(
    meetings,
    'Meeting Summary',
    'One row per meeting occurrence. Eligible counts the meeting\'s current active participants.',
    6,
  );
  meetings.getRow(3).values = [
    'Date',
    'Meeting',
    'Eligible Participants',
    'Attended',
    'Absent',
    'Attendance Percentage',
  ];
  for (const row of data.meetingSummary) {
    const added = meetings.addRow({
      date: formatSheetDate(row.attendance_date),
      meeting: row.meeting_name,
      eligible: Number(row.eligible_participants),
      attended: Number(row.attended),
      absent: Number(row.absent),
      percentage: Number(row.attendance_percentage),
    });
    // Numeric, so it still sorts and charts; the format supplies the % sign.
    added.getCell('percentage').numFmt = PERCENT_FMT;
  }
  styleHeader(meetings, 6, 2);

  /* ----- Sheet 3: Participant Summary ----------------------------------- */
  const participants = workbook.addWorksheet('Participant Summary');
  participants.columns = [
    { key: 'number', width: 16 },
    { key: 'name', width: 26 },
    { key: 'eligible', width: 24 },
    { key: 'attended', width: 24 },
    { key: 'percentage', width: 22 },
  ];
  addTitle(
    participants,
    'Participant Summary',
    'Meetings each person could have attended in this range, against those they did.',
    5,
  );
  participants.getRow(3).values = [
    'Person Number',
    'Person Name',
    'Total Meetings Eligible',
    'Total Meetings Attended',
    'Attendance Percentage',
  ];
  for (const row of data.participantSummary) {
    const added = participants.addRow({
      number: row.person_number,
      name: row.person_name,
      eligible: Number(row.meetings_eligible),
      attended: Number(row.meetings_attended),
      percentage: Number(row.attendance_percentage),
    });
    added.getCell('percentage').numFmt = PERCENT_FMT;
  }
  styleHeader(participants, 5, 2);

  return workbook;
}

/** Build the workbook and hand it to the browser as a download. */
export async function exportAttendanceWorkbook(
  data: WorkbookData,
  fileName = exportFileName(),
): Promise<void> {
  const workbook = await buildWorkbook(data);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
