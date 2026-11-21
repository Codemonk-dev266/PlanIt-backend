import express from "express";

import {
  adminUpdateProgramme,
  adminChangeProgrammeStatus,
  adminToggleProgrammeRegistration,
} from "../controllers/adminProgrammeInterventionController.js";
import authMiddleWare from "../middleWare/authMiddleWare.js";
import adminMiddleWare from "../middleWare/adminMiddleWare.js";

const router = express.Router();


// Update programme information
router.patch("/:id", authMiddleWare, adminMiddleWare, adminUpdateProgramme);

// Change programme status
router.patch(
  "/:id/status",
  authMiddleWare,
  adminMiddleWare,
  adminChangeProgrammeStatus,
);

// Enable or disable registration
router.patch(
  "/:id/registration",
  authMiddleWare,
  adminMiddleWare,
  adminToggleProgrammeRegistration,
);

export default router;
