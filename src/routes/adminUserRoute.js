import express from "express";

import {
  getAllUsersForAdmin,
  getUserByIdForAdmin,
  adminChangeUserRole,
  adminChangeUserActiveStatus,
} from "../controllers/adminUserController.js";
import authMiddleWare from "../middleWare/authMiddleWare.js";
import adminMiddleWare from "../middleWare/adminMiddleWare.js";

const router = express.Router();

router.use(authMiddleWare, adminMiddleWare);

// view all users
router.get("/", getAllUsersForAdmin);

// inspect individual user account
router.get("/:id", getUserByIdForAdmin);

// promote user role
router.patch("/:id/role", adminChangeUserRole);

// activate or deactivate an account
router.patch("/:id/active", adminChangeUserActiveStatus);

export default router;
