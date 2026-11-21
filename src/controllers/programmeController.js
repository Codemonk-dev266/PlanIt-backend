import mongoose from "mongoose";
import Programme from "../models/programmeModel.js";
import Organisation from "../models/organisationModels.js";
import Registration from "../models/registrationModel.js";
import uploadToCloudinary from "../utils/uploadToCloudinary.js";

// check programme  management permission
const getProgrammePermission = async (programmeId, userId) => {
  const programme = await Programme.findById(programmeId);

  if (!programme) {
    return {
      programme: null,
      authorised: false,
      role: null,
    };
  }

  // individual programme
  if (!programme.organisation) {
    const isCreator = programme.organiser.toString() === userId;

    return {
      programme,
      authorised: isCreator,
      role: isCreator ? "creator" : null,
    };
  }

  // Organisation programme
  const organisation = await Organisation.findById(programme.organisation);

  if (!organisation) {
    return {
      programme,
      authorised: false,
      role: null,
    };
  }

  // Check organisation owner
  if (organisation.owner.toString() === userId) {
    return {
      programme,
      authorised: true,
      role: "owner",
    };
  }

  // Check organisation membership
  const membership = organisation.members.find(
    (member) => member.user.toString() === userId,
  );

  if (!membership) {
    return {
      programme,
      authorised: false,
      role: null,
    };
  }

  return {
    programme,
    authorised: true,
    role: membership.role,
  };
};

// Create programme
export const createProgramme = async (req, res, next) => {
  try {
    const {
      title,
      description,
      category,
      organisation,
      venue,
      address,
      startDate,
      endDate,
      registrationDeadline,
      capacity,
    } = req.body;

    const organiser = req.user.userId;

    let image = {};

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);

      image = {
        url: result.secure_url,
        public_id: result.public_id,
      };
    }

    if (
      !image ||
      !title ||
      !description ||
      !category ||
      !venue ||
      !startDate ||
      !endDate ||
      !registrationDeadline
    ) {
      return res.status(400).json({
        message: "Please provide all required programme details",
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const deadline = new Date(registrationDeadline);

    if (
      isNaN(start.getTime()) ||
      isNaN(end.getTime()) ||
      isNaN(deadline.getTime())
    ) {
      return res.status(400).json({
        message: "Invalid programme date",
      });
    }

    if (end <= start) {
      return res.status(400).json({
        message: "Programme end date must be after start date",
      });
    }

    if (deadline >= start) {
      return res.status(400).json({
        message: "Registration deadline cannot be after programme start",
      });
    }

    if (deadline <= new Date()) {
      return res.status(400).json({
        message: "Registration deadline must be in the future",
      });
    }

    let capacityValue = null;

    if (capacity !== undefined && capacity !== null) {
      capacityValue = Number(capacity);

      if (!Number.isInteger(capacityValue) || capacityValue < 1) {
        return res.status(400).json({
          message: "Capacity must be a positive whole number",
        });
      }
    }

    let organisationId = null;

    if (!organisation && req.user.role !== "organiser") {
      return res.status(403).json({
        message: "Only organisers can create individual programmes",
      });
    }

    // CHECK ORGANISATION PERMISSIONS
    if (organisation) {
      if (!mongoose.isValidObjectId(organisation)) {
        return res.status(400).json({
          message: "Invalid organisation ID",
        });
      }

      const organisationExists = await Organisation.findById(organisation);

      if (!organisationExists) {
        return res.status(404).json({
          message: "Organisation not found",
        });
      }

      const isOwner = organisationExists.owner.toString() === organiser;

      const membership = organisationExists.members.find(
        (member) => member.user.toString() === organiser,
      );

      const memberRole = isOwner ? "owner" : membership?.role;

      const allowedRoles = ["owner", "manager", "editor"];

      if (!allowedRoles.includes(memberRole)) {
        return res.status(403).json({
          message:
            "You do not have permission to create programmes for this organisation",
        });
      }

      organisationId = organisationExists._id;
    }

    const programme = await Programme.create({
      title,
      image,
      description,
      category,
      organiser,
      organisation: organisationId,
      venue,
      address,
      startDate: start,
      endDate: end,
      registrationDeadline: deadline,
      capacity: capacity ?? null,
    });

    return res.status(201).json({
      message: "Programme created successfully",
      programme,
    });
  } catch (error) {
    next(error);
  }
};

// get all programmes
export const getAllProgrammes = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(limit) || 10));

    const skip = (pageNumber - 1) * pageSize;

    const now = new Date();

    const filter = {
      status: "published",
      registrationEnabled: true,
      registrationDeadline: { $gt: now },
      startDate: { $gt: now },
    };

    const [programmes, total] = await Promise.all([
      Programme.find(filter)
        .sort({ startDate: 1 })
        .skip(skip)
        .limit(pageSize)
        .populate("organiser", "name")
        .populate("organisation", "name logo"),

      Programme.countDocuments(filter),
    ]);

    return res.status(200).json({
      message: "Programmes fetched successfully",
      programmes,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
};

// get programmes by slug
export const getProgrammeBySlug = async (req, res, next) => {
  try {
    const { slug } = req.params;

    const programme = await Programme.findOne({
      slug,
      status: "published",
    })
      .populate("organiser", "name ")
      .populate("organisation", "name logo");

    if (!programme) {
      return res.status(404).json({ message: "Programme not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Programme fetched successfully",
      programme,
    });
  } catch (error) {
    next(error);
  }
};

// get my programmes
export const getMyProgrammes = async (req, res, next) => {
  try {
    const organiser = req.user.userId;

    // Find organisations the user owns or belongs to.
    const organisations = await Organisation.find({
      $or: [{ owner: organiser }, { "members.user": organiser }],
    }).select("_id");

    const organisationIds = organisations.map(
      (organisation) => organisation._id,
    );

    const programmes = await Programme.find({
      $or: [
        { organiser, organisation: null },
        { organisation: { $in: organisationIds } },
      ],
    })
      .populate("organiser", "name")
      .populate("organisation", "name logo")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Your programmes fetched successfully",
      count: programmes.length,
      programmes,
    });
  } catch (error) {
    next(error);
  }
};

// Update programme
export const updateProgramme = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid programme ID",
      });
    }

    const { programme, authorised, role } = await getProgrammePermission(
      id,
      userId,
    );

    if (!programme) {
      return res.status(404).json({
        message: "Programme not found",
      });
    }

    const allowedRoles = ["creator", "owner", "manager", "editor"];

    if (!authorised || !allowedRoles.includes(role)) {
      return res.status(403).json({
        message: "You do not have permission to update this programme",
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
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "No valid fields provided",
      });
    }

    const start = new Date(updates.startDate ?? programme.startDate);

    const end = new Date(updates.endDate ?? programme.endDate);

    const deadline = new Date(
      updates.registrationDeadline ?? programme.registrationDeadline,
    );

    if (
      isNaN(start.getTime()) ||
      isNaN(end.getTime()) ||
      isNaN(deadline.getTime())
    ) {
      return res.status(400).json({
        message: "Invalid programme date",
      });
    }

    if (end <= start || deadline > start) {
      return res.status(400).json({
        message: "Please provide valid programme dates",
      });
    }

    if (updates.capacity !== undefined) {
      if (updates.capacity !== null) {
        const newCapacity = Number(updates.capacity);

        if (!Number.isInteger(newCapacity) || newCapacity < 1) {
          return res.status(400).json({
            message: "Capacity must be a positive whole number",
          });
        }

        const activeRegistrations = await Registration.countDocuments({
          programme: programme._id,
          status: "registered",
        });

        if (newCapacity < programme.registeredCount) {
          return res.status(409).json({
            message:
              "Capacity cannot be lower than the current number of registrations",
          });
        }

        updates.capacity = newCapacity;
      }
    }

    programme.set({
      ...updates,
      startDate: start,
      endDate: end,
      registrationDeadline: deadline,
    });

    await programme.save();

    return res.status(200).json({
      message: "Programme updated successfully",
      programme,
    });
  } catch (error) {
    next(error);
  }
};

// Delete programme
export const deleteProgramme = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid programme ID",
      });
    }

    const { programme, authorised, role } = await getProgrammePermission(
      id,
      userId,
    );

    if (!programme) {
      return res.status(404).json({
        message: "Programme not found",
      });
    }

    const allowedRoles = ["creator", "owner", "manager"];

    if (!authorised || !allowedRoles.includes(role)) {
      return res.status(403).json({
        message: "You do not have permission to delete this programme",
      });
    }

    const registrationsExist = await Registration.exists({
      programme: id,
    });

    if (registrationsExist) {
      return res.status(409).json({
        message:
          "Programme has registrations and cannot be deleted. Cancel it instead.",
      });
    }

    await Programme.findByIdAndDelete(id);

    return res.status(200).json({
      message: "Programme deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// change programme status
export const changeProgrammeStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user.userId;

    // Validate programme ID
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid programme ID",
      });
    }

    // Validate requested status
    const validStatuses = ["draft", "published", "cancelled", "completed"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid programme status",
        validStatuses,
      });
    }

    // Check programme permission
    const { programme, authorised, role } = await getProgrammePermission(
      id,
      userId,
    );

    if (!programme) {
      return res.status(404).json({
        message: "Programme not found",
      });
    }

    if (!authorised) {
      return res.status(403).json({
        message: "You are not authorised to manage this programme",
      });
    }

    // Only authorised management roles can change status
    const allowedRoles = ["creator", "owner", "manager", "editor", "organiser"];

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        message: "Your role does not permit programme status changes",
      });
    }

    // Define permitted transitions
    const allowedTransitions = {
      draft: ["published", "cancelled"],
      published: ["cancelled", "completed"],
      cancelled: [],
      completed: [],
    };

    const currentStatus = programme.status;

    if (!allowedTransitions[currentStatus].includes(status)) {
      return res.status(400).json({
        message: `Cannot change programme status from ${currentStatus} to ${status}`,
      });
    }

    // Update programme status
    programme.status = status;

    // Stop registration when programme is cancelled or completed
    if (["cancelled", "completed"].includes(status)) {
      programme.registrationEnabled = false;
    }

    if (status === "completed" && programme.endDate > new Date()) {
      return res.status(409).json({
        message: "A programme cannot be completed before its end date",
      });
    }

    if (status === "published") {
      const now = new Date();

      if (
        programme.registrationDeadline <= now ||
        programme.startDate <= now ||
        programme.registrationDeadline >= programme.startDate ||
        programme.endDate <= programme.startDate
      ) {
        return res.status(409).json({
          message: "Programme dates are not valid for publication",
        });
      }
    }

    await programme.save();

    return res.status(200).json({
      message: `Programme status successfully changed to ${status}`,
      programme,
    });
  } catch (error) {
    next(error);
  }
};
