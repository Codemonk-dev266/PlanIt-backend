import mongoose from "mongoose";

import Programme from "../models/programmeModel.js";
import Registration from "../models/registrationModel.js";
import createAdminAuditLog from "../utils/createAdminAuditLog.js";

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validateInterventionReason = (reason) => {
  return (
    typeof reason === "string" &&
    reason.trim().length >= 10 &&
    reason.trim().length <= 1000
  );
};

const validateProgrammeDates = (programme) => {
  const startDate = new Date(programme.startDate);
  const endDate = new Date(programme.endDate);
  const registrationDeadline = new Date(programme.registrationDeadline);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    Number.isNaN(registrationDeadline.getTime())
  ) {
    throw createHttpError("Programme dates are invalid");
  }

  if (startDate >= endDate || registrationDeadline >= startDate) {
    throw createHttpError(
      "Registration deadline must be before the programme start date, and the start date must be before the end date",
    );
  }
};

//admin update programme details
export const adminUpdateProgramme = async (req, res, next) => {
  let session;

  try {
    const { id } = req.params;
    const { reason, ...updates } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid programme ID",
      });
    }

    if (!validateInterventionReason(reason)) {
      return res.status(400).json({
        message: "A valid intervention reason is required",
      });
    }

    const allowedFields = [
      "title",
      "description",
      "category",
      "venue",
      "address",
      "startDate",
      "endDate",
      "registrationDeadline",
      "capacity",
      "image",
    ];

    const updateFields = Object.keys(updates);

    if (
      updateFields.length === 0 ||
      updateFields.some((field) => !allowedFields.includes(field))
    ) {
      return res.status(400).json({
        message: "Invalid or unsupported programme fields",
      });
    }

    session = await mongoose.startSession();

    let updatedProgramme;

    await session.withTransaction(async () => {
      const programme = await Programme.findById(id).session(session);

      if (!programme) return;

      const before = {};

      updateFields.forEach((field) => {
        before[field] = programme[field];
      });

      const previousRegistrationEnabled = programme.registrationEnabled;

      // Validate capacity against active registrations.
      if (Object.prototype.hasOwnProperty.call(updates, "capacity")) {
        const capacity = updates.capacity;

        if (
          capacity !== null &&
          (!Number.isInteger(capacity) || capacity < 1)
        ) {
          throw createHttpError(
            "Capacity must be a positive whole number or null",
          );
        }

        const activeRegistrations = await Registration.countDocuments({
          programme: programme._id,
          status: "registered",
        }).session(session);

        if (capacity !== null && capacity < activeRegistrations) {
          throw createHttpError(
            "Capacity cannot be lower than active registrations",
            409,
          );
        }
      }

      programme.set(updates);

      validateProgrammeDates(programme);

      // Never leave registration enabled after its deadline.
      if (
        programme.status !== "published" ||
        programme.registrationDeadline <= new Date() ||
        programme.startDate <= new Date()
      ) {
        programme.registrationEnabled = false;
      }

      await programme.save({ session });

      const changes = {};

      updateFields.forEach((field) => {
        changes[field] = {
          before: before[field],
          after: programme[field],
        };
      });

      if (previousRegistrationEnabled !== programme.registrationEnabled) {
        changes.registrationEnabled = {
          before: previousRegistrationEnabled,
          after: programme.registrationEnabled,
        };
      }

      await createAdminAuditLog({
        adminId: req.user.userId,
        action: "programme_updated",
        targetType: "programme",
        targetId: programme._id,
        reason: reason.trim(),
        changes,
        session,
      });

      updatedProgramme = programme;
    });

    if (!updatedProgramme) {
      return res.status(404).json({
        message: "Programme not found",
      });
    }

    return res.status(200).json({
      message: "Programme updated by administrator",
      programme: updatedProgramme,
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

// admin change programme status
export const adminChangeProgrammeStatus = async (req, res, next) => {
  let session;

  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid programme ID",
      });
    }

    if (!validateInterventionReason(reason)) {
      return res.status(400).json({
        message: "A valid intervention reason is required",
      });
    }

    const validStatuses = ["draft", "published", "cancelled", "completed"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid programme status",
      });
    }

    session = await mongoose.startSession();

    let updatedProgramme;
    let auditAction;

    await session.withTransaction(async () => {
      const programme = await Programme.findById(id).session(session);

      if (!programme) return;

      const previousStatus = programme.status;
      const previousRegistrationEnabled = programme.registrationEnabled;

      if (previousStatus === status) {
        throw createHttpError("Programme already has this status", 409);
      }

      if (["completed", "cancelled"].includes(previousStatus)) {
        throw createHttpError(
          `A ${previousStatus} programme cannot be reopened or changed`,
          409,
        );
      }

      if (status === "completed" && programme.endDate > new Date()) {
        throw createHttpError(
          "A programme cannot be completed before its scheduled end date",
          409,
        );
      }

      if (status === "published") {
        validateProgrammeDates(programme);
        programme.registrationEnabled = false;

        const now = new Date();

        if (programme.registrationDeadline <= now) {
          throw createHttpError(
            "A programme with an expired registration deadline cannot be published",
            409,
          );
        }

        if (programme.startDate <= now) {
          throw createHttpError(
            "A programme that has already started cannot be published",
            409,
          );
        }
      }

      programme.status = status;

      // Any status other than published must have registration disabled.
      // Publishing never automatically enables registration.
      if (status !== "published") {
        programme.registrationEnabled = false;
      }

      if (status === "cancelled") {
        auditAction = "programme_cancelled";
      } else if (status === "completed") {
        auditAction = "programme_completed";
      } else if (status === "published") {
        auditAction = "programme_published";
      } else if (previousStatus === "published" && status === "draft") {
        auditAction = "programme_unpublished";
      } else {
        auditAction = "programme_updated";
      }

      await programme.save({ session });

      await createAdminAuditLog({
        adminId: req.user.userId,
        action: auditAction,
        targetType: "programme",
        targetId: programme._id,
        reason: reason.trim(),
        changes: {
          status: {
            before: previousStatus,
            after: status,
          },
          registrationEnabled: {
            before: previousRegistrationEnabled,
            after: programme.registrationEnabled,
          },
        },
        session,
      });

      updatedProgramme = programme;
    });

    if (!updatedProgramme) {
      return res.status(404).json({
        message: "Programme not found",
      });
    }

    return res.status(200).json({
      message: "Programme status updated successfully",
      programme: updatedProgramme,
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

// admin enable or disable programme registration
export const adminToggleProgrammeRegistration = async (req, res, next) => {
  let session;

  try {
    const { id } = req.params;
    const { enabled, reason } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid programme ID",
      });
    }

    if (typeof enabled !== "boolean") {
      return res.status(400).json({
        message: "Registration enabled must be a boolean",
      });
    }

    if (!validateInterventionReason(reason)) {
      return res.status(400).json({
        message: "A valid intervention reason is required",
      });
    }

    session = await mongoose.startSession();

    let updatedProgramme;

    await session.withTransaction(async () => {
      const programme = await Programme.findById(id).session(session);

      if (!programme) return;

      if (programme.registrationEnabled === enabled) {
        throw createHttpError("Registration already has this setting", 409);
      }

      if (enabled) {
        if (programme.status !== "published") {
          throw createHttpError(
            "Only published programmes can accept registrations",
            409,
          );
        }

        const now = new Date();

        if (programme.registrationDeadline <= now) {
          throw createHttpError("Registration deadline has passed", 409);
        }

        if (programme.startDate <= now) {
          throw createHttpError("The programme has already started", 409);
        }

        const activeRegistrations = await Registration.countDocuments({
          programme: programme._id,
          status: "registered",
        }).session(session);

        if (
          programme.capacity !== null &&
          activeRegistrations >= programme.capacity
        ) {
          throw createHttpError("Programme capacity has been reached", 409);
        }
      }

      const previousValue = programme.registrationEnabled;

      programme.registrationEnabled = enabled;

      await programme.save({ session });

      await createAdminAuditLog({
        adminId: req.user.userId,
        action: enabled ? "registration_enabled" : "registration_disabled",
        targetType: "programme",
        targetId: programme._id,
        reason: reason.trim(),
        changes: {
          registrationEnabled: {
            before: previousValue,
            after: enabled,
          },
        },
        session,
      });

      updatedProgramme = programme;
    });

    if (!updatedProgramme) {
      return res.status(404).json({
        message: "Programme not found",
      });
    }

    return res.status(200).json({
      message: enabled
        ? "Programme registration enabled"
        : "Programme registration disabled",
      programme: updatedProgramme,
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
