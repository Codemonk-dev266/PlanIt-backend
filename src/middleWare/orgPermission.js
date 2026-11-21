import mongoose from "mongoose";
import Organisation from "../models/organisationModels.js";

const organisationPermission = ({ roles = [], ownerOnly = false } = {}) => {
  return async (req, res, next) => {
    try {
      // 1. Check authentication
      if (!req.user || !req.user.userId) {
        return res.status(401).json({
          message: "Authentication required",
        });
      }

      // 2. Get organisation ID
      const organisationId =
        req.params.organisationId || req.params.id || req.body.organisation;

      if (!organisationId) {
        return res.status(400).json({
          message: "Organisation ID is required",
        });
      }

      // 3. Validate organisation ID
      if (!mongoose.isValidObjectId(organisationId)) {
        return res.status(400).json({
          message: "Invalid organisation ID",
        });
      }

      // 4. Find organisation
      const organisation = await Organisation.findById(organisationId);

      if (!organisation) {
        return res.status(404).json({
          message: "Organisation not found",
        });
      }

      const userId = req.user.userId;

      // 5. Check ownership
      const isOwner = organisation.owner.toString() === userId;

      if (isOwner) {
        req.organisation = organisation;
        req.organisationRole = "owner";

        return next();
      }

      // 6. Enforce owner-only operations
      if (ownerOnly) {
        return res.status(403).json({
          message: "Only the organisation owner can perform this action",
        });
      }

      // 7. Check membership
      const membership = organisation.members.find(
        (member) => member.user.toString() === userId,
      );

      if (!membership) {
        return res.status(403).json({
          message: "You are not a member of this organisation",
        });
      }

      // 8. Check membership role
      if (roles.length > 0 && !roles.includes(membership.role)) {
        return res.status(403).json({
          message: "You do not have permission to perform this action",
        });
      }

      // 9. Attach organisation information to request
      req.organisation = organisation;
      req.organisationRole = membership.role;

      next();
    } catch (error) {
      next(error);
    }
  };
};

export default organisationPermission;
