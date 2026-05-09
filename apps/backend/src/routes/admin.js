import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
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
router.use(requireRole("ADMIN"));

router.get("/appointments", listAppointments);
router.patch("/appointments/:id/status", updateAppointmentStatus);
router.patch("/appointments/:id/space", updateAppointmentSpace);
router.get("/availability", listAvailability);
router.post("/availability", updateAvailability);
router.get("/google-calendar/status", getGoogleCalendarStatus);
router.post("/google-calendar/export", exportAppointmentsToGoogle);
router.get("/spaces", listSpaces);
router.post("/spaces", createSpace);
router.patch("/spaces/:id", updateSpace);
router.delete("/spaces/:id", deleteSpace);
router.get("/blocked-periods", listBlockedPeriods);
router.post("/blocked-periods", createBlockedPeriod);
router.delete("/blocked-periods/:id", deleteBlockedPeriod);
router.get("/notifications", listNotifications);

export default router;
