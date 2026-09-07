import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom';

import { AttendancePage } from './pages/AttendancePage';
import { Layout } from './components/Layout';
import { Spinner } from './components/Spinner';
import { MeetingQrPage } from './pages/MeetingQrPage';
import { MeetingsPage } from './pages/MeetingsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { QrCodesPage } from './pages/QrCodesPage';
import { QrPrintPage } from './pages/QrPrintPage';
import { RequireAuth } from './components/RequireAuth';

/**
 * The admin screens are loaded on demand.
 *
 * The page that matters most here is the one a phone opens after scanning a
 * poster, often on office wifi in a corridor. It has no use for the dashboard,
 * the reports or the management CRUD, so none of that belongs in the bundle it
 * waits for.
 */
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const ExportPage = lazy(() =>
  import('./pages/ExportPage').then((m) => ({ default: m.ExportPage })),
);
const AdminMeetingsPage = lazy(() =>
  import('./pages/AdminMeetingsPage').then((m) => ({ default: m.AdminMeetingsPage })),
);
const AdminParticipantsPage = lazy(() =>
  import('./pages/AdminParticipantsPage').then((m) => ({
    default: m.AdminParticipantsPage,
  })),
);
const AdminPeoplePage = lazy(() =>
  import('./pages/AdminPeoplePage').then((m) => ({ default: m.AdminPeoplePage })),
);

/**
 * `/m/<ref>` was the attendance path before `/attendance/<ref>` became
 * canonical. Any QR code already printed with the short form keeps working.
 */
function LegacyAttendanceRedirect() {
  const { meetingRef = '' } = useParams();
  return <Navigate to={`/attendance/${encodeURIComponent(meetingRef)}`} replace />;
}

/**
 * Everything under `/admin` requires a signed-in administrator, and arrives in
 * its own chunk — hence the Suspense fallback.
 */
function Admin({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <Suspense fallback={<Spinner />}>{children}</Suspense>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Outside the app shell: printed output carries no navigation. */}
        <Route path="qr/print" element={<QrPrintPage />} />

        <Route element={<Layout />}>
          {/* ---- Public ---------------------------------------------------
              The QR codes and the attendance form stay reachable without an
              account: someone scanning a code in a corridor cannot be expected
              to hold one. What they may *do* is limited by the server to
              inserting a single, validated attendance row. */}
          <Route index element={<MeetingsPage />} />
          <Route path="qr" element={<QrCodesPage />} />
          <Route path="qr/:meetingRef" element={<MeetingQrPage />} />
          <Route path="attendance/:meetingRef" element={<AttendancePage />} />
          <Route path="m/:meetingRef" element={<LegacyAttendanceRedirect />} />

          {/* ---- Admin ---------------------------------------------------- */}
          <Route path="admin" element={<Admin><DashboardPage /></Admin>} />
          <Route path="admin/reports" element={<Admin><ReportsPage /></Admin>} />
          <Route path="admin/export" element={<Admin><ExportPage /></Admin>} />
          <Route path="admin/meetings" element={<Admin><AdminMeetingsPage /></Admin>} />
          <Route
            path="admin/meetings/:meetingId/participants"
            element={<Admin><AdminParticipantsPage /></Admin>}
          />
          <Route path="admin/people" element={<Admin><AdminPeoplePage /></Admin>} />

          {/* Pre-/admin paths, kept so existing links and bookmarks work. */}
          <Route path="dashboard" element={<Navigate to="/admin" replace />} />
          <Route path="reports" element={<Navigate to="/admin/reports" replace />} />
          <Route path="records" element={<Navigate to="/admin/export" replace />} />

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
