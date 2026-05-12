import express from "express";
import {
  cancelNotification,
  confirmNotification,
  createAppointment,
  createStaffSignupRequest,
  getAvailability,
  listProfessionals
} from "../controllers/publicController.js";

const router = express.Router();

router.get("/professionals", listProfessionals);
router.get("/availability", getAvailability);
router.post("/appointments", createAppointment);
router.post("/staff-signup-requests", createStaffSignupRequest);
router.get("/notifications/:token/confirm", confirmNotification);
router.get("/notifications/:token/cancel", cancelNotification);

export default router;
