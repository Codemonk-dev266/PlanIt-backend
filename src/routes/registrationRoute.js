import express from "express";
import {
  cancelRegistration,
  checkInAttendee,
  getProgrammeCheckInStatistics,
  getProgrammeRegistrations,
  registerAttendee,
} from "../controllers/registrationController.js";
import authMiddleWare from "../middleWare/authMiddleWare.js";
import roleMiddleWare from "../middleWare/roleMiddleWare.js";

const router = express.Router();

// 1. register an attendee
router.post("/", registerAttendee);

// 2. check in a registered attendee
router.post(
  "/check-in",
  authMiddleWare,
  // roleMiddleWare("organiser"),
  checkInAttendee,
);

// 3. fetch programme registration
router.get(
  "/programme/:programmeId",
  authMiddleWare,
  getProgrammeRegistrations,
);

// 4. check in statistics
router.get(
  "/programme/:programmeId/statistics",
  authMiddleWare,
  // roleMiddleWare("organiser"),
  getProgrammeCheckInStatistics,
);

// 5. cancel a registration
router.patch("/cancel", cancelRegistration);

export default router;
