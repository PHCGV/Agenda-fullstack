import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  approveStaffSignupRequest,
  cancelNotification,
  createBlockedPeriod,
  createSpace,
  deleteBlockedPeriod,
  deleteSpace,
  exportAppointmentsCsv,
  exportAppointmentsToGoogle,
  exportDashboardCsv,
  getGoogleCalendarStatus,
  handleGoogleCalendarCallback,
  listAuditActions,
  listAuditLogs,
  listAvailability,
  listAppointments,
  listBlockedPeriods,
  listDashboardBreakdown,
  listDashboardSummary,
  listDashboardTimeseries,
  listNotifications,
  listStaffSignupRequests,
  listSystemSettings,
  listSpaces,
  rejectStaffSignupRequest,
  updateGlobalAvatar,
  updateAppointmentSpace,
  updateAppointmentStatus,
  updateAvailability,
  updateSpace
} from "../controllers/adminController.js";

const router = express.Router();

router.get("/google-calendar/callback", handleGoogleCalendarCallback);

router.use(requireAuth);

router.get("/dashboard/summary", requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]), listDashboardSummary);
router.get(
  "/dashboard/timeseries",
  requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]),
  listDashboardTimeseries
);
router.get(
  "/dashboard/breakdown",
  requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]),
  listDashboardBreakdown
);
router.get(
  "/dashboard/export",
  requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]),
  exportDashboardCsv
);

router.get("/appointments", requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]), listAppointments);
router.get(
  "/appointments/export",
  requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]),
  exportAppointmentsCsv
);
router.patch(
  "/appointments/:id/status",
  requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]),
  updateAppointmentStatus
);
router.patch(
  "/appointments/:id/space",
  requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]),
  updateAppointmentSpace
);
router.get("/availability", requireRole(["ADMIN", "PROFESSIONAL"]), listAvailability);
router.post("/availability", requireRole(["ADMIN", "PROFESSIONAL"]), updateAvailability);
router.get(
  "/google-calendar/status",
  requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]),
  getGoogleCalendarStatus
);
router.post(
  "/google-calendar/export",
  requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]),
  exportAppointmentsToGoogle
);
router.get("/spaces", requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]), listSpaces);
router.post("/spaces", requireRole(["ADMIN", "RECEPTION"]), createSpace);
router.patch("/spaces/:id", requireRole(["ADMIN", "RECEPTION"]), updateSpace);
router.delete("/spaces/:id", requireRole(["ADMIN", "RECEPTION"]), deleteSpace);
router.get("/blocked-periods", requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]), listBlockedPeriods);
router.post("/blocked-periods", requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]), createBlockedPeriod);
router.delete(
  "/blocked-periods/:id",
  requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]),
  deleteBlockedPeriod
);
router.get("/notifications", requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]), listNotifications);
router.patch(
  "/notifications/:id/cancel",
  requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]),
  cancelNotification
);
router.get("/audit-logs", requireRole(["ADMIN", "RECEPTION"]), listAuditLogs);
router.get("/audit-actions", requireRole(["ADMIN", "RECEPTION"]), listAuditActions);
router.get("/system-settings", requireRole(["ADMIN", "RECEPTION", "PROFESSIONAL"]), listSystemSettings);
router.patch("/system-settings/avatar", requireRole("ADMIN"), updateGlobalAvatar);
router.get("/staff-signup-requests", requireRole(["ADMIN", "RECEPTION"]), listStaffSignupRequests);
router.patch(
  "/staff-signup-requests/:id/approve",
  requireRole("ADMIN"),
  approveStaffSignupRequest
);
router.patch(
  "/staff-signup-requests/:id/reject",
  requireRole("ADMIN"),
  rejectStaffSignupRequest
);

export default router;
