import mongoose from "mongoose";

import Registration from "../models/registrationModel.js";
import createAdminAuditLog from "../utils/createAdminAuditLog.js";

const validateInterventionReason = (reason) => {
  return (
    typeof reason === "string" &&
    reason.trim().length >= 10 &&
    reason.trim().length <= 1000
  );
};

// admin correct registration check-in
export const adminCorrectCheckIn = async (req, res, next) => {
  let session;

  try {
    const { id } = req.params;
    const { checked_in, reason } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid registration ID",
      });
    }

    if (typeof checked_in !== "boolean") {
      return res.status(400).json({
        message: "checked_in must be a boolean",
      });
    }

    if (!validateInterventionReason(reason)) {
      return res.status(400).json({
        message: "A valid correction reason is required",
      });
    }

    session = await mongoose.startSession();

    let correctedRegistration;

    await session.withTransaction(async () => {
      const registration = await Registration.findById(id).session(session);

      if (!registration) {
        throw Object.assign(new Error("Registration not found"), {
          statusCode: 404,
        });
      }

      if (registration.status !== "registered") {
        throw Object.assign(
          new Error(
            "Only active registrations can have their check-in status corrected",
          ),
          { statusCode: 409 },
        );
      }

      if (registration.checked_in === checked_in) {
        throw Object.assign(
          new Error("Registration already has this check-in status"),
          { statusCode: 409 },
        );
      }

      const previousCheckIn = {
        checked_in: registration.checked_in,
        checked_in_at: registration.checked_in_at,
        checked_in_by: registration.checked_in_by,
      };

      // Apply the correction.
      registration.checked_in = checked_in;

      if (checked_in) {
        registration.checked_in_at = new Date();
        registration.checked_in_by = req.user.userId;
      } else {
        registration.checked_in_at = null;
        registration.checked_in_by = null;
      }

      await registration.save({ session });

      // Preserve the previous and corrected values in the audit log.
      await createAdminAuditLog({
        adminId: req.user.userId,
        action: "checkin_corrected",
        targetType: "registration",
        targetId: registration._id,
        reason: reason.trim(),
        changes: {
          checked_in: {
            before: previousCheckIn.checked_in,
            after: registration.checked_in,
          },
          checked_in_at: {
            before: previousCheckIn.checked_in_at,
            after: registration.checked_in_at,
          },
          checked_in_by: {
            before: previousCheckIn.checked_in_by,
            after: registration.checked_in_by,
          },
        },
        session,
      });

      correctedRegistration = registration;
    });

    return res.status(200).json({
      message: "Registration check-in status corrected successfully",
      registration: {
        _id: correctedRegistration._id,
        programme: correctedRegistration.programme,
        full_name: correctedRegistration.full_name,
        email: correctedRegistration.email,
        status: correctedRegistration.status,
        checked_in: correctedRegistration.checked_in,
        checked_in_at: correctedRegistration.checked_in_at,
        checked_in_by: correctedRegistration.checked_in_by,
      },
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }

    next(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};
