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

// view all users
router.get("/", authMiddleWare, adminMiddleWare, getAllUsersForAdmin);

// inspect individual user account
router.get("/:id", authMiddleWare, adminMiddleWare, getUserByIdForAdmin);

// promote user role
router.patch("/:id/role", authMiddleWare, adminMiddleWare, adminChangeUserRole);

// activate or deactivate an account
router.patch(
  "/:id/active",
  authMiddleWare,
  adminMiddleWare,
  adminChangeUserActiveStatus,
);

export default router;
