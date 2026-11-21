import QRCode from "qrcode";
import mongoose from "mongoose";

import Programme from "../models/programmeModel.js";
import Registration from "../models/registrationModel.js";
import Organisation from "../models/organisationModels.js";
import crypto from "node:crypto";

const generateQrToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Store only the hash of the QR token.
const hashQrToken = (token) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

// Register an attendee
export const registerAttendee = async (req, res, next) => {
  let session;

  try {
    const { programmeId, full_name, email, phone_number } = req.body;

    // 1. Validate required fields
    if (
      typeof programmeId !== "string" ||
      typeof full_name !== "string" ||
      typeof email !== "string" ||
      typeof phone_number !== "string" ||
      !programmeId.trim() ||
      !full_name.trim() ||
      !email.trim() ||
      !phone_number.trim()
    ) {
      return res.status(400).json({
        message: "All registration fields are required",
      });
    }

    if (!mongoose.isValidObjectId(programmeId)) {
      return res.status(400).json({
        message: "Invalid programme ID",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Please provide a valid email address",
      });
    }

    // 2. Generate registration reference and QR token
    const registrationReference = `REG-${crypto
      .randomBytes(6)
      .toString("hex")
      .toUpperCase()}`;

    let result;

    // 3. Start database session
    session = await mongoose.startSession();

    // 4. Execute registration transaction
    await session.withTransaction(async () => {
      // Check programme availability inside transaction.
      const programme = await Programme.findOne({
        _id: programmeId,
        status: "published",
        registrationEnabled: true,
        startDate: { $gt: new Date() },
        registrationDeadline: { $gt: new Date() },
      }).session(session);

      if (programme.status !== "published") {
        return res.status(409).json({
          message: "Check-in is unavailable for this programme",
        });
      }

      if (!programme) {
        result = {
          status: 404,
          message: "Programme not found or registration is unavailable",
        };

        return;
      }

      // Check for an existing active registration.
      const existingRegistration = await Registration.findOne({
        programme: programmeId,
        email: normalizedEmail,
        status: "registered",
      }).session(session);

      if (existingRegistration) {
        result = {
          status: 409,
          message: "You are already registered for this programme",
        };

        return;
      }

      // 5. Reserve a slot atomically.
      const updatedProgramme = await Programme.findOneAndUpdate(
        {
          _id: programmeId,
          status: "published",
          registrationEnabled: true,
          startDate: { $gt: new Date() },
          registrationDeadline: { $gt: new Date() },

          $or: [
            { capacity: null },
            {
              $expr: {
                $lt: ["$registeredCount", "$capacity"],
              },
            },
          ],
        },
        {
          $inc: {
            registeredCount: 1,
          },
        },
        {
          new: true,
          session,
        },
      );

      if (!updatedProgramme) {
        result = {
          status: 409,
          message: "Programme is full or registration is unavailable",
        };

        return;
      }

      const qrToken = generateQrToken();

      const hashedQrToken = hashQrToken(qrToken);

      const qrCode = await QRCode.toDataURL(qrToken);

      // 6. Create registration inside the same transaction.
      const [registration] = await Registration.create(
        [
          {
            programme: programmeId,
            full_name: full_name.trim(),
            email: normalizedEmail,
            phone_number: phone_number.trim(),
            registration_reference: registrationReference,
            qr_token: hashedQrToken,
          },
        ],
        { session },
      );

      // 7. Prepare successful response.
      result = {
        status: 201,
        message: "Registration successful",
        registration: {
          full_name: registration.full_name,
          email: registration.email,
          registration_reference: registration.registration_reference,
          programme: updatedProgramme.title,
          qrCode,
        },
      };
    });

    return res.status(result.status).json({
      message: result.message,
      ...(result.registration && {
        registration: result.registration,
      }),
    });
  } catch (error) {
    // Duplicate-key errors may occur if two requests
    // attempt to register the same email simultaneously.
    if (error.code === 11000) {
      return res.status(409).json({
        message: "You are already registered for this programme",
      });
    }

    next(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

//
export const checkInAttendee = async (req, res, next) => {
  try {
    const { qr_token } = req.body;

    // 1. Validate QR token
    if (typeof qr_token !== "string" || !/^[a-f0-9]{64}$/i.test(qr_token)) {
      return res.status(400).json({
        message: "A valid QR token is required",
      });
    }

    // 2. Hash the received token
    const hashedToken = hashQrToken(qr_token);

    // 3. Find registration using the hashed token
    const registration = await Registration.findOne({
      qr_token: hashedToken,
    });

    if (!registration) {
      return res.status(404).json({
        message: "Invalid QR code",
      });
    }

    // 4. Find the associated programme
    const programme = await Programme.findById(registration.programme);

    if (!programme) {
      return res.status(404).json({
        message: "Programme not found",
      });
    }

    const userId = req.user.userId;

    // 5. Check permissions
    if (!programme.organisation) {
      // Individual programme: creator only.
      if (programme.organiser.toString() !== userId) {
        return res.status(403).json({
          message: "You are not authorised to check in attendees",
        });
      }
    } else {
      // Organisation programme.
      const organisation = await Organisation.findById(programme.organisation);

      if (!organisation) {
        return res.status(404).json({
          message: "Organisation not found",
        });
      }

      const isOwner = organisation.owner.toString() === userId;

      const membership = organisation.members.find(
        (member) => member.user.toString() === userId,
      );

      const allowedRoles = ["manager", "check_in_staff"];

      const hasPermission =
        isOwner || (membership && allowedRoles.includes(membership.role));

      if (!hasPermission) {
        return res.status(403).json({
          message: "You are not authorised to check in attendees",
        });
      }
    }

    // 6. Check registration status
    if (registration.status !== "registered") {
      return res.status(400).json({
        message: "This registration has been cancelled",
      });
    }

    if (registration.checked_in) {
      return res.status(409).json({
        message: "This attendee has already been checked in",
        checked_in_at: registration.checked_in_at,
      });
    }

    // 7. Atomically check in attendee
    const checkedInRegistration = await Registration.findOneAndUpdate(
      {
        _id: registration._id,
        status: "registered",
        checked_in: false,
      },
      {
        $set: {
          checked_in: true,
          checked_in_at: new Date(),
          checked_in_by: userId,
        },
      },
      {
        new: true,
      },
    ).select("-qr_token");

    // Another staff member may have scanned it simultaneously.
    if (!checkedInRegistration) {
      return res.status(409).json({
        message: "This attendee has already been checked in",
      });
    }

    // 8. Return successful check-in
    return res.status(200).json({
      message: "Attendee checked in successfully",

      attendee: {
        name: checkedInRegistration.full_name,
        registration_reference: checkedInRegistration.registration_reference,
        checked_in: checkedInRegistration.checked_in,
        checked_in_at: checkedInRegistration.checked_in_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

// get programme registration
export const getProgrammeRegistrations = async (req, res, next) => {
  try {
    const { programmeId } = req.params;
    const userId = req.user.userId;

    if (!mongoose.isValidObjectId(programmeId)) {
      return res.status(400).json({
        message: "Invalid programme ID",
      });
    }

    const programme = await Programme.findById(programmeId);

    if (!programme) {
      return res.status(404).json({
        message: "Programme not found",
      });
    }

    let authorised = false;

    // Individual programme: only creator.
    if (!programme.organisation) {
      authorised = programme.organiser.toString() === userId;
    }

    // Organisation programme: check organisation permissions.
    else {
      const organisation = await Organisation.findById(programme.organisation);

      if (organisation) {
        const isOwner = organisation.owner.toString() === userId;

        const membership = organisation.members.find(
          (member) => member.user.toString() === userId,
        );

        const memberRole = isOwner ? "owner" : membership?.role;

        authorised = ["owner", "manager", "editor"].includes(memberRole);
      }
    }

    if (!authorised) {
      return res.status(403).json({
        message: "You do not have permission to view these registrations",
      });
    }

    const registrations = await Registration.find({
      programme: programmeId,
    })
      .select("-qr_token")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Programme registrations fetched successfully",
      count: registrations.length,
      registrations,
    });
  } catch (error) {
    next(error);
  }
};

// cancel a registration

export const cancelRegistration = async (req, res, next) => {
  let session;

  try {
    const { registration_reference, email } = req.body;

    if (
      typeof registration_reference !== "string" ||
      typeof email !== "string" ||
      !registration_reference.trim() ||
      !email.trim()
    ) {
      return res.status(400).json({
        message: "Registration reference and email are required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedReference = registration_reference.trim();

    session = await mongoose.startSession();

    let result;

    await session.withTransaction(async () => {
      // Find and cancel an active registration.
      const registration = await Registration.findOneAndUpdate(
        {
          registration_reference: normalizedReference,
          email: normalizedEmail,
          status: "registered",
          checked_in: false,
        },
        {
          $set: {
            status: "cancelled",
          },
        },
        {
          new: true,
          session,
        },
      );

      if (!registration) {
        const existingRegistration = await Registration.findOne({
          registration_reference: normalizedReference,
          email: normalizedEmail,
        }).session(session);

        if (!existingRegistration) {
          result = {
            status: 404,
            message: "Registration not found",
          };
          return;
        }

        if (existingRegistration.status === "cancelled") {
          result = {
            status: 409,
            message: "Registration has already been cancelled",
          };
          return;
        }

        if (existingRegistration.checked_in) {
          result = {
            status: 409,
            message: "A checked-in registration cannot be cancelled",
          };
          return;
        }

        result = {
          status: 409,
          message: "Registration could not be cancelled",
        };
        return;
      }

      // Release the reserved programme slot.
      const updatedProgramme = await Programme.findOneAndUpdate(
        {
          _id: registration.programme,
          registeredCount: { $gt: 0 },
        },
        {
          $inc: {
            registeredCount: -1,
          },
        },
        {
          new: true,
          session,
        },
      );

      if (!updatedProgramme) {
        throw new Error("Programme registration count could not be updated");
      }

      result = {
        status: 200,
        message: "Registration cancelled successfully",
        remainingCapacity:
          updatedProgramme.capacity === null
            ? null
            : Math.max(
                updatedProgramme.capacity - updatedProgramme.registeredCount,
                0,
              ),
      };
    });

    return res.status(result.status).json({
      message: result.message,
      ...(result.status === 200 && {
        remainingCapacity: result.remainingCapacity,
      }),
    });
  } catch (error) {
    next(error);
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

export const getProgrammeCheckInStatistics = async (req, res, next) => {
  try {
    const { programmeId } = req.params;

    // 1. Validate programme ID
    if (!mongoose.isValidObjectId(programmeId)) {
      return res.status(400).json({
        message: "Invalid programme ID",
      });
    }

    // 2. Find programme
    const programme = await Programme.findById(programmeId);

    if (!programme) {
      return res.status(404).json({
        message: "Programme not found",
      });
    }

    const userId = req.user.userId;

    // 3. Check permissions
    if (!programme.organisation) {
      // Individual programme: creator only.
      if (programme.organiser.toString() !== userId) {
        return res.status(403).json({
          message: "You are not authorised to view these statistics",
        });
      }
    } else {
      // Organisation programme.
      const organisation = await Organisation.findById(programme.organisation);

      if (!organisation) {
        return res.status(404).json({
          message: "Organisation not found",
        });
      }

      const isOwner = organisation.owner.toString() === userId;

      const membership = organisation.members.find(
        (member) => member.user.toString() === userId,
      );

      const allowedRoles = ["manager", "check_in_staff"];

      const hasPermission =
        isOwner || (membership && allowedRoles.includes(membership.role));

      if (!hasPermission) {
        return res.status(403).json({
          message: "You are not authorised to view these statistics",
        });
      }
    }

    // 4. Aggregate registration statistics
    const [statistics] = await Registration.aggregate([
      {
        $match: {
          programme: new mongoose.Types.ObjectId(programmeId),
        },
      },
      {
        $group: {
          _id: null,

          totalRegistrations: {
            $sum: 1,
          },

          activeRegistrations: {
            $sum: {
              $cond: [{ $eq: ["$status", "registered"] }, 1, 0],
            },
          },

          cancelledRegistrations: {
            $sum: {
              $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0],
            },
          },

          checkedIn: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "registered"] },
                    { $eq: ["$checked_in", true] },
                  ],
                },
                1,
                0,
              ],
            },
          },

          notCheckedIn: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "registered"] },
                    { $eq: ["$checked_in", false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    // 5. Handle programmes without registrations
    const result = statistics || {
      totalRegistrations: 0,
      activeRegistrations: 0,
      cancelledRegistrations: 0,
      checkedIn: 0,
      notCheckedIn: 0,
    };

    // 6. Calculate attendance percentage
    const checkInPercentage =
      result.activeRegistrations === 0
        ? 0
        : Number(
            ((result.checkedIn / result.activeRegistrations) * 100).toFixed(2),
          );

    // 7. Calculate remaining capacity
    const remainingCapacity =
      programme.capacity === null
        ? null
        : Math.max(programme.capacity - result.activeRegistrations, 0);

    return res.status(200).json({
      message: "Programme statistics fetched successfully",

      programme: {
        id: programme._id,
        title: programme.title,
        capacity: programme.capacity,
        registeredCount: programme.registeredCount,
      },

      statistics: {
        totalRegistrations: result.totalRegistrations,
        activeRegistrations: result.activeRegistrations,
        cancelledRegistrations: result.cancelledRegistrations,
        checkedIn: result.checkedIn,
        notCheckedIn: result.notCheckedIn,
        checkInPercentage,
        remainingCapacity,
      },
    });
  } catch (error) {
    next(error);
  }
};
