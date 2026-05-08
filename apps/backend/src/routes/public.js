import express from "express";
import {
  cancelNotification,
  confirmNotification,
  createAppointment,
  getAvailability,
  listProfessionals
} from "../controllers/publicController.js";

const router = express.Router();

router.get("/professionals", listProfessionals);
router.get("/availability", getAvailability);
router.post("/appointments", createAppointment);
router.get("/notifications/:token/confirm", confirmNotification);
router.get("/notifications/:token/cancel", cancelNotification);

export default router;
