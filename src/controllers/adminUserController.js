import mongoose from "mongoose";
import User from "../models/userModels.js";
import Organisation from "../models/organisationModels.js";
import Programme from "../models/programmeModel.js";
import AdminControl from "../models/adminControlModel.js";
import createAdminAuditLog from "../utils/createAdminAuditLog.js";

export const getAllUsersForAdmin = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, role } = req.query;

    const currentPage = Number(page);
    const pageLimit = Number(limit);

    if (
      !Number.isInteger(currentPage) ||
      !Number.isInteger(pageLimit) ||
      currentPage < 1 ||
      pageLimit < 1 ||
      pageLimit > 100
    ) {
      return res.status(400).json({
        message: "Invalid pagination parameters",
      });
    }

    const filter = {};

    // Filter by account role
    if (role) {
      const validRoles = ["organiser", "member", "admin"];

      if (!validRoles.includes(role)) {
        return res.status(400).json({
          message: "Invalid user role",
        });
      }

      filter.role = role;
    }

    // Search by name or email
    if (search !== undefined) {
      if (typeof search !== "string") {
        return res.status(400).json({
          message: "Search must be a string",
        });
      }

      const searchTerm = search.trim();

      if (searchTerm.length > 100) {
        return res.status(400).json({
          message: "Search term is too long",
        });
      }

      if (searchTerm) {
        const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const regex = new RegExp(escapedSearch, "i");

        filter.$or = [{ name: regex }, { email: regex }];
      }
    }

    const skip = (currentPage - 1) * pageLimit;

    const [users, totalUsers] = await Promise.all([
      User.find(filter)
        .select(
          "name email phone_number image role isActive createdAt updatedAt",
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit)
        .lean(),

      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      message: "Users fetched successfully",

      users,

      pagination: {
        currentPage,
        pageLimit,
        totalUsers,
        totalPages: Math.ceil(totalUsers / pageLimit),
        hasNextPage: currentPage * pageLimit < totalUsers,
        hasPreviousPage: currentPage > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserByIdForAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(id)
      .select("name email phone_number image role isActive createdAt updatedAt")
      .lean();

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Organisations owned by the user or where they are a member
    const organisations = await Organisation.find({
      $or: [{ owner: user._id }, { "members.user": user._id }],
    })
      .select("name email type owner members createdAt")
      .lean();

    // Programmes created by this user
    const programmes = await Programme.find({
      organiser: user._id,
    })
      .select("title category status organisation startDate createdAt")
      .populate("organisation", "name")
      .sort({ createdAt: -1 })
      .lean();

    const ownedOrganisations = organisations.filter(
      (organisation) => organisation.owner.toString() === user._id.toString(),
    );

    const memberships = organisations
      .filter(
        (organisation) => organisation.owner.toString() !== user._id.toString(),
      )
      .map((organisation) => {
        const membership = organisation.members.find(
          (member) => member.user.toString() === user._id.toString(),
        );

        return {
          organisation: {
            id: organisation._id,
            name: organisation.name,
          },
          role: membership?.role,
          joinedAt: membership?.joinedAt,
        };
      });

    return res.status(200).json({
      message: "User details fetched successfully",

      user,

      activity: {
        ownedOrganisations,
        memberships,
        programmesCreated: programmes.length,
        programmes,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const adminChangeUserRole = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const { role, reason } = req.body;

    const allowedRoles = ["organiser", "member", "admin"];

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid user ID",
      });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: "Invalid account role",
      });
    }

    if (
      typeof reason !== "string" ||
      reason.trim().length < 10 ||
      reason.trim().length > 1000
    ) {
      return res.status(400).json({
        message: "A reason between 10 and 1000 characters is required",
      });
    }

    if (id === req.user.userId) {
      return res.status(403).json({
        message: "You cannot change your own administrator role",
      });
    }

    let updatedUser;

    await session.withTransaction(async () => {
      // Acquire the shared administrator-control lock.
      const lockResult = await AdminControl.updateOne(
        { _id: "admin-control" },
        { $inc: { revision: 1 } },
        { session },
      );

      if (lockResult.matchedCount !== 1) {
        const error = new Error("Administrator control is not initialized");
        error.statusCode = 503;
        throw error;
      }

      const targetUser = await User.findById(id).session(session);

      if (!targetUser) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      if (targetUser.role === role) {
        const error = new Error("The user already has this account role");
        error.statusCode = 409;
        throw error;
      }

      if (!targetUser.isActive && role === "admin") {
        const error = new Error(
          "Reactivate the account before promoting it to admin",
        );
        error.statusCode = 409;
        throw error;
      }

      // Protect the last active administrator.
      if (
        targetUser.role === "admin" &&
        targetUser.isActive &&
        role !== "admin"
      ) {
        const activeAdminCount = await User.countDocuments({
          role: "admin",
          isActive: true,
        }).session(session);

        if (activeAdminCount <= 1) {
          const error = new Error(
            "The last active administrator cannot be demoted",
          );
          error.statusCode = 409;
          throw error;
        }
      }

      const previousRole = targetUser.role;

      targetUser.role = role;

      await targetUser.save({ session });

      const action = role === "admin" ? "admin_created" : "admin_role_changed";

      await createAdminAuditLog({
        adminId: req.user.userId,
        action,
        targetType: "user",
        targetId: targetUser._id,
        reason: reason.trim(),
        changes: {
          before: { role: previousRole },
          after: { role },
        },
        session,
      });

      updatedUser = {
        userId: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        isActive: targetUser.isActive,
      };
    });

    return res.status(200).json({
      message: "User role updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    next(error);
  } finally {
    await session.endSession();
  }
};

// deactivate or reactivate user account
export const adminChangeUserActiveStatus = async (req, res, next) => {
  let session;

  try {
    const { id } = req.params;
    const { isActive, reason } = req.body;
    const adminId = req.user.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        message: "isActive must be true or false",
      });
    }

    if (
      typeof reason !== "string" ||
      reason.trim().length < 10 ||
      reason.trim().length > 1000
    ) {
      return res.status(400).json({
        message: "A reason between 10 and 1000 characters is required",
      });
    }

    if (id === adminId) {
      return res.status(400).json({
        message: "You cannot change your own account status",
      });
    }

    session = await mongoose.startSession();

    let responseData;

    await session.withTransaction(async () => {
      // Serialize admin account changes using the shared lock.
      const lock = await AdminControl.updateOne(
        { _id: "admin-control" },
        { $inc: { revision: 1 } },
        { session },
      );

      if (lock.matchedCount !== 1) {
        const error = new Error("Administrator control is not initialized");

        error.statusCode = 503;
        throw error;
      }

      const targetUser = await User.findById(id).session(session);

      if (!targetUser) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      if (targetUser.isActive === isActive) {
        const error = new Error(
          `User account is already ${isActive ? "active" : "deactivated"}`,
        );
        error.statusCode = 409;
        throw error;
      }

      // Never deactivate the last active administrator.
      if (targetUser.role === "admin" && !isActive) {
        const activeAdminCount = await User.countDocuments({
          role: "admin",
          isActive: true,
        }).session(session);

        if (activeAdminCount <= 1) {
          const error = new Error(
            "The last active administrator cannot be deactivated",
          );
          error.statusCode = 409;
          throw error;
        }
      }

      const previousStatus = targetUser.isActive;

      targetUser.isActive = isActive;
      await targetUser.save({ session });

      const action =
        targetUser.role === "admin"
          ? isActive
            ? "admin_reactivated"
            : "admin_deactivated"
          : isActive
            ? "user_reactivated"
            : "user_deactivated";

      await createAdminAuditLog({
        adminId,
        action,
        targetType: "user",
        targetId: targetUser._id,
        reason: reason.trim(),
        changes: {
          isActive: {
            before: previousStatus,
            after: isActive,
          },
        },
        session,
      });

      responseData = {
        userId: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        isActive: targetUser.isActive,
      };
    });

    return res.status(200).json({
      message: `User account ${isActive ? "reactivated" : "deactivated"} successfully`,
      user: responseData,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    next(error);
  } finally {
    if (session) await session.endSession();
  }
};
