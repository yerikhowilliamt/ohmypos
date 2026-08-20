/**
 * OhMyPos — XLSX export helpers.
 *
 * `exceljs` is dynamic-imported so it never lands in the initial bundle —
 * only pages with an Export button pay for it, and only once clicked.
 * Workbook-building is split from the download side-effect so the former
 * stays unit-testable without a DOM.
 */

export interface ExportColumn<T> {
  header: string;
  accessor: (row: T) => string | number | Date | null;
}

const MAX_COLUMN_WIDTH = 40;
const MIN_COLUMN_WIDTH = 10;

/** Builds the workbook in memory — split out from the download side-effect
 * so it's directly unit-testable without a DOM. */
export async function buildWorkbook<T>(
  columns: ExportColumn<T>[],
  rows: T[],
  sheetName: string,
) {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.header,
    width: Math.min(
      MAX_COLUMN_WIDTH,
      Math.max(MIN_COLUMN_WIDTH, col.header.length + 2),
    ),
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const values = columns.map((col) => col.accessor(row));
    sheet.addRow(values);
    values.forEach((value, index) => {
      const width = Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(
          sheet.columns[index]?.width ?? MIN_COLUMN_WIDTH,
          String(value ?? '').length + 2,
        ),
      );
      const column = sheet.columns[index];
      if (column) column.width = width;
    });
  }

  return workbook;
}

function downloadWorkbook(
  workbook: Awaited<ReturnType<typeof buildWorkbook>>,
  filename: string,
) {
  return workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  });
}

/** Exports a flat row set to a single-sheet `.xlsx` file and downloads it. */
export async function exportRowsToXlsx<T>(
  filename: string,
  columns: ExportColumn<T>[],
  rows: T[],
  sheetName = 'Sheet1',
): Promise<void> {
  const workbook = await buildWorkbook(columns, rows, sheetName);
  await downloadWorkbook(workbook, filename);
}

/**
 * Exports a matrix (e.g. staff × day-of-month) to a single-sheet `.xlsx`
 * file — the first column holds `rowLabels`, one column per `columnLabels`
 * entry, cells computed by `cellFn(rowIndex, columnIndex)`.
 */
export async function exportMatrixToXlsx(
  filename: string,
  cornerLabel: string,
  columnLabels: string[],
  rowLabels: string[],
  cellFn: (rowIndex: number, columnIndex: number) => string,
  sheetName = 'Sheet1',
): Promise<void> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = [cornerLabel, ...columnLabels].map((header, index) => ({
    header,
    key: `col${index}`,
    width: index === 0 ? 24 : 6,
  }));
  sheet.getRow(1).font = { bold: true };

  rowLabels.forEach((label, rowIndex) => {
    const cells = columnLabels.map((_, columnIndex) =>
      cellFn(rowIndex, columnIndex),
    );
    sheet.addRow([label, ...cells]);
  });

  await downloadWorkbook(workbook, filename);
}
