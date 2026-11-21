import express from "express";

import {
  adminUpdateProgramme,
  adminChangeProgrammeStatus,
  adminToggleProgrammeRegistration,
} from "../controllers/adminProgrammeInterventionController.js";
import authMiddleWare from "../middleWare/authMiddleWare.js";
import adminMiddleWare from "../middleWare/adminMiddleWare.js";

const router = express.Router();

router.use(authMiddleWare, adminMiddleWare);

// Update programme information
router.patch("/:id", adminUpdateProgramme);

// Change programme status
router.patch("/:id/status", adminChangeProgrammeStatus);

// Enable or disable registration
router.patch("/:id/registration", adminToggleProgrammeRegistration);

export default router;
