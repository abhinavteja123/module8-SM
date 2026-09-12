import 'dotenv/config';
import express from 'express';
import 'express-async-errors';
import cors from 'cors';
import path from 'node:path';

import authRoutes from './routes/auth.js';
import orgRoutes from './routes/org.js';
import cyclesRoutes from './routes/cycles.js';
import researchRoutes from './routes/research.js';
import opportunitiesRoutes from './routes/opportunities.js';
import selfInternshipRoutes from './routes/self-internship.js';
import documentsRoutes from './routes/documents.js';
import marksRoutes from './routes/marks.js';
import analyticsRoutes from './routes/analytics.js';
import adminRoutes from './routes/admin.js';
import reportDeadlinesRoutes from './routes/reportDeadlines.js';
import mentorAllocationsRoutes from './routes/mentorAllocations.js';
import attendanceRoutes from './routes/attendance.js';
import oversightRoutes from './routes/oversight.js';
import cycleDocumentsRoutes from './routes/cycleDocuments.js';
import { startReportDeadlineReminders } from './lib/reportDeadlineReminders.js';
import { startAnalyticsAlertNotifications } from './lib/analyticsAlertNotifications.js';

export const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api', orgRoutes);
app.use('/api', cyclesRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/opportunities', opportunitiesRoutes);
app.use('/api/self-internships', selfInternshipRoutes);
app.use('/api', documentsRoutes);
app.use('/api/marks', marksRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', adminRoutes);
app.use('/api/report-deadlines', reportDeadlinesRoutes);
app.use('/api', mentorAllocationsRoutes);
app.use('/api', attendanceRoutes);
app.use('/api', oversightRoutes);
app.use('/api', cycleDocumentsRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'internal error' });
});

// Vercel imports the Express app as a request handler. Keep the local server
// and its long-lived reminder workers for development, but do not start them
// inside a serverless function instance.
if (!process.env.VERCEL) {
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(`[server] listening on :${port}`);
    startReportDeadlineReminders();
    startAnalyticsAlertNotifications();
  });
}

export default app;
