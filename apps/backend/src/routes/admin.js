import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  cancelNotification,
  createBlockedPeriod,
  createSpace,
  deleteBlockedPeriod,
  deleteSpace,
  exportAppointmentsToGoogle,
  getGoogleCalendarStatus,
  listAvailability,
  listAppointments,
  listBlockedPeriods,
  listNotifications,
  listSpaces,
  updateAppointmentSpace,
  updateAppointmentStatus,
  updateAvailability,
  updateSpace
} from "../controllers/adminController.js";

const router = express.Router();

router.use(requireAuth);

router.get("/appointments", requireRole(["ADMIN", "PROFESSIONAL"]), listAppointments);
router.patch(
  "/appointments/:id/status",
  requireRole(["ADMIN", "PROFESSIONAL"]),
  updateAppointmentStatus
);
router.patch(
  "/appointments/:id/space",
  requireRole(["ADMIN", "PROFESSIONAL"]),
  updateAppointmentSpace
);
router.get("/availability", requireRole(["ADMIN", "PROFESSIONAL"]), listAvailability);
router.post("/availability", requireRole(["ADMIN", "PROFESSIONAL"]), updateAvailability);
router.get(
  "/google-calendar/status",
  requireRole(["ADMIN", "PROFESSIONAL"]),
  getGoogleCalendarStatus
);
router.post(
  "/google-calendar/export",
  requireRole(["ADMIN", "PROFESSIONAL"]),
  exportAppointmentsToGoogle
);
router.get("/spaces", requireRole(["ADMIN", "PROFESSIONAL"]), listSpaces);
router.post("/spaces", requireRole("ADMIN"), createSpace);
router.patch("/spaces/:id", requireRole("ADMIN"), updateSpace);
router.delete("/spaces/:id", requireRole("ADMIN"), deleteSpace);
router.get("/blocked-periods", requireRole(["ADMIN", "PROFESSIONAL"]), listBlockedPeriods);
router.post("/blocked-periods", requireRole(["ADMIN", "PROFESSIONAL"]), createBlockedPeriod);
router.delete(
  "/blocked-periods/:id",
  requireRole(["ADMIN", "PROFESSIONAL"]),
  deleteBlockedPeriod
);
router.get("/notifications", requireRole(["ADMIN", "PROFESSIONAL"]), listNotifications);
router.patch(
  "/notifications/:id/cancel",
  requireRole(["ADMIN", "PROFESSIONAL"]),
  cancelNotification
);

export default router;
