import User from "../models/userModels.js";
import Organisation from "../models/organisationModels.js";
import Programme from "../models/programmeModel.js";

// create new organisation
export const createOrganisation = async (req, res, next) => {
  try {
    const { name, email, type, description, phone_number, website, address } =
      req.body;

    const userId = req.user.userId;

    // Validate required fields
    if (!name || !email || !type) {
      return res.status(400).json({
        message: "Name, email and organisation type are required",
      });
    }

    // Validate name
    if (
      typeof name !== "string" ||
      name.trim().length < 5 ||
      name.trim().length > 50
    ) {
      return res.status(400).json({
        message: "Organisation name must be between 5 and 50 characters",
      });
    }

    // Validate email
    if (typeof email !== "string") {
      return res.status(400).json({
        message: "Invalid organisation email",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        message: "Please provide a valid organisation email",
      });
    }

    // Validate organisation type
    const validTypes = [
      "company",
      "government",
      "educational",
      "non_profit",
      "religious",
      "other",
    ];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        message: "Invalid organisation type",
      });
    }

    // Check existing organisation email
    const existingOrganisation = await Organisation.findOne({
      email: normalizedEmail,
    });

    if (existingOrganisation) {
      return res.status(409).json({
        message: "Organisation email already exists",
      });
    }

    // Upload logo only after validating the submitted data
    let logo = {};

    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer);

      logo = {
        url: result.secure_url,
        public_id: result.public_id,
      };
    }

    const organisation = await Organisation.create({
      name: name.trim(),
      email: normalizedEmail,
      type,
      description,
      phone_number,
      website,
      logo,
      address,
      owner: userId,

      // Owner does not need to be added to members.
      // Ownership already grants full permissions.
      members: [],
    });

    return res.status(201).json({
      message: "Organisation created successfully",
      organisation,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Organisation email already exists",
      });
    }

    next(error);
  }
};

// get my organisation
export const getMyOrganisations = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const organisations = await Organisation.find({
      $or: [{ owner: userId }, { "members.user": userId }],
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Organisations fetched successfully",
      count: organisations.length,
      organisations,
    });
  } catch (error) {
    next(error);
  }
};

// get organisation by id
export const getOrganisationById = async (req, res, next) => {
  try {
    // organisationPermission middleware has already checked access.
    const organisation = req.organisation;

    return res.status(200).json({
      message: "Organisation fetched successfully",
      organisation,
      accessRole: req.organisationRole,
    });
  } catch (error) {
    next(error);
  }
};

// update organisation
export const updateOrganisation = async (req, res, next) => {
  try {
    // organisationPermission middleware has already checked access.
    const organisation = req.organisation;

    const allowedFields = [
      "name",
      "email",
      "type",
      "description",
      "phone_number",
      "website",
      "logo",
      "address",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        message: "No valid fields provided for update",
      });
    }

    // Validate name
    if (updates.name !== undefined) {
      if (
        typeof updates.name !== "string" ||
        updates.name.trim().length < 5 ||
        updates.name.trim().length > 50
      ) {
        return res.status(400).json({
          message: "Organisation name must be between 5 and 50 characters",
        });
      }

      updates.name = updates.name.trim();
    }

    // Validate email
    if (updates.email !== undefined) {
      if (typeof updates.email !== "string") {
        return res.status(400).json({
          message: "Invalid organisation email",
        });
      }

      updates.email = updates.email.trim().toLowerCase();

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailRegex.test(updates.email)) {
        return res.status(400).json({
          message: "Please provide a valid organisation email",
        });
      }
    }

    // Validate organisation type
    if (updates.type !== undefined) {
      const validTypes = [
        "company",
        "government",
        "educational",
        "non_profit",
        "religious",
        "other",
      ];

      if (!validTypes.includes(updates.type)) {
        return res.status(400).json({
          message: "Invalid organisation type",
        });
      }
    }

    // Apply updates
    Object.assign(organisation, updates);

    await organisation.save();

    return res.status(200).json({
      message: "Organisation updated successfully",
      organisation,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "Organisation email already exists",
      });
    }

    next(error);
  }
};

// delete organisation
export const deleteOrganisation = async (req, res, next) => {
  try {
    // organisationPermission middleware with ownerOnly: true
    // has already verified ownership.
    const organisation = req.organisation;

    const existingProgrammes = await Programme.exists({
      organisation: organisation._id,
    });

    if (existingProgrammes) {
      return res.status(409).json({
        message:
          "Organisation cannot be deleted while programmes are associated with it",
      });
    }

    await Organisation.findByIdAndDelete(organisation._id);

    return res.status(200).json({
      message: "Organisation deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

// add an organisation member
export const addOrganisationMember = async (req, res, next) => {
  try {
    const { email, role = "viewer" } = req.body;

    const organisation = req.organisation;
    const currentUserRole = req.organisationRole;

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        message: "Member email is required",
      });
    }

    const allowedRoles = ["manager", "editor", "check_in_staff", "viewer"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: "Invalid organisation member role",
      });
    }

    // Managers cannot appoint other managers.
    if (currentUserRole === "manager" && role === "manager") {
      return res.status(403).json({
        message: "Only the organisation owner can appoint managers",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (!user) {
      return res.status(404).json({
        message: "No registered user found with this email",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: "This user account is currently deactivated",
      });
    }

    const userId = user._id.toString();

    // Prevent the owner from being added as a member.
    if (organisation.owner.toString() === userId) {
      return res.status(400).json({
        message: "The organisation owner cannot be added as a member",
      });
    }

    // Prevent duplicate membership.
    const alreadyMember = organisation.members.some(
      (member) => member.user.toString() === userId,
    );

    if (alreadyMember) {
      return res.status(409).json({
        message: "This user is already a member of the organisation",
      });
    }

    organisation.members.push({
      user: user._id,
      role,
    });

    await organisation.save();

    await organisation.populate("members.user", "name email");

    return res.status(201).json({
      message: "Member added successfully",
      organisation,
    });
  } catch (error) {
    next(error);
  }
};

// update organisation member role
export const updateOrganisationMemberRole = async (req, res, next) => {
  try {
    const { memberId } = req.params;
    const { role } = req.body;

    const organisation = req.organisation;

    const allowedRoles = ["manager", "editor", "check_in_staff", "viewer"];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: "Invalid organisation member role",
      });
    }

    const member = organisation.members.find(
      (member) => member.user.toString() === memberId,
    );

    if (!member) {
      return res.status(404).json({
        message: "Organisation member not found",
      });
    }

    member.role = role;

    await organisation.save();

    await organisation.populate("members.user", "name email");

    return res.status(200).json({
      message: "Member role updated successfully",
      organisation,
    });
  } catch (error) {
    next(error);
  }
};

// remove organisation member
export const removeOrganisationMember = async (req, res, next) => {
  try {
    const { memberId } = req.params;

    const organisation = req.organisation;

    const memberExists = organisation.members.some(
      (member) => member.user.toString() === memberId,
    );

    if (!memberExists) {
      return res.status(404).json({
        message: "Organisation member not found",
      });
    }

    organisation.members = organisation.members.filter(
      (member) => member.user.toString() !== memberId,
    );

    await organisation.save();

    return res.status(200).json({
      message: "Member removed successfully",
    });
  } catch (error) {
    next(error);
  }
};
