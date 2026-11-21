import express from "express";
import authMiddleWare from "../middleWare/authMiddleWare.js";
import {
  addOrganisationMember,
  createOrganisation,
  deleteOrganisation,
  getMyOrganisations,
  getOrganisationById,
  removeOrganisationMember,
  updateOrganisation,
  updateOrganisationMemberRole,
} from "../controllers/organsationController.js";
import roleMiddleWare from "../middleWare/roleMiddleWare.js";
import organisationPermission from "../middleWare/orgPermission.js";

const router = express.Router();

// 1. create new organisation
router.post(
  "/",
  authMiddleWare,
  roleMiddleWare("organiser"),
  createOrganisation,
);

// 2. add a member( owner or manager)
router.post(
  "/:organisationId/members",
  authMiddleWare,
  organisationPermission({ roles: ["manager"] }),
  addOrganisationMember,
);

// 3. fetch  organisations belonging to  verified user
router.get("/my-organisations", authMiddleWare, getMyOrganisations);

// 4. get organisation by id
router.get(
  "/:organisationId",
  authMiddleWare,
  organisationPermission(),
  getOrganisationById,
);

// 5. update organisation
router.patch(
  "/:organisationId",
  authMiddleWare,
  organisationPermission({ roles: ["owner"] }),
  updateOrganisation,
);

// 6. update a member's role(owner only)
router.patch(
  "/:organisationId/members/:memberId/role",
  authMiddleWare,
  organisationPermission({ ownerOnly: true }),
  updateOrganisationMemberRole,
);

// 7. delete organisation
router.delete(
  "/:organisationId",
  authMiddleWare,
  organisationPermission({ ownerOnly: true }),
  deleteOrganisation,
);

// 8. remove a member
router.delete(
  "/:organisationId/members/:memberId",
  authMiddleWare,
  organisationPermission({ ownerOnly: true }),
  removeOrganisationMember,
);

export default router;
