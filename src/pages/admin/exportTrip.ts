import { buildTripReport, reportFileName, reportSheets } from '../../lib/report';
import { buildXlsx, downloadBytes, XLSX_MIME } from '../../lib/xlsx';
import type { Booking, Trip, TripStats } from '../../lib/types';

export async function exportTripXlsx(trip: Trip, stats: TripStats, bookings: Booking[], includeCancelled: boolean) {
  const report = buildTripReport(trip, stats, bookings);
  const bytes = await buildXlsx(reportSheets(report, { includeCancelled }));
  downloadBytes(bytes, reportFileName(trip), XLSX_MIME);
}
