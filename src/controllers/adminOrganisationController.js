import mongoose from "mongoose";
import Organisation from "../models/organisationModels.js";
import User from "../models/userModels.js";
import Programme from "../models/programmeModel.js";

const getOrganisationProgrammeStatistics = async (organisationIds) => {
  return Programme.aggregate([
    {
      $match: {
        organisation: { $in: organisationIds },
      },
    },
    {
      $group: {
        _id: "$organisation",

        totalProgrammes: {
          $sum: 1,
        },

        draftProgrammes: {
          $sum: {
            $cond: [{ $eq: ["$status", "draft"] }, 1, 0],
          },
        },

        publishedProgrammes: {
          $sum: {
            $cond: [{ $eq: ["$status", "published"] }, 1, 0],
          },
        },

        cancelledProgrammes: {
          $sum: {
            $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0],
          },
        },

        completedProgrammes: {
          $sum: {
            $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
          },
        },
      },
    },
  ]);
};

export const getAllOrganisationsForAdmin = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, type, isVerified } = req.query;

    // 1. Validate pagination
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

    const skip = (currentPage - 1) * pageLimit;

    // 2. Build filter
    const filter = {};

    const validTypes = [
      "company",
      "government",
      "educational",
      "non_profit",
      "religious",
      "other",
    ];

    if (type) {
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          message: "Invalid organisation type",
        });
      }

      filter.type = type;
    }

    if (isVerified !== undefined) {
      if (!["true", "false"].includes(isVerified)) {
        return res.status(400).json({
          message: "Invalid verification filter",
        });
      }

      filter.isVerified = isVerified === "true";
    }

    // 3. Search organisation details and owner details
    if (search) {
      const searchTerm = search.trim();

      if (searchTerm.length > 100) {
        return res.status(400).json({
          message: "Search term is too long",
        });
      }

      if (search !== undefined && typeof search !== "string") {
        return res.status(400).json({
          message: "Search must be a string",
        });
      }

      if (searchTerm) {
        const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const searchRegex = new RegExp(escapedSearch, "i");

        const matchingOwners = await User.find({
          $or: [{ name: searchRegex }, { email: searchRegex }],
        }).select("_id");

        const ownerIds = matchingOwners.map((user) => user._id);

        filter.$or = [
          { name: searchRegex },
          { email: searchRegex },
          { owner: { $in: ownerIds } },
        ];
      }
    }

    // 4. Fetch organisations and total count
    const [organisations, totalOrganisations] = await Promise.all([
      Organisation.find(filter)
        .populate("owner", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit)
        .lean(),

      Organisation.countDocuments(filter),
    ]);

    // 5. Get organisation IDs
    const organisationIds = organisations.map(
      (organisation) => organisation._id,
    );

    // 6. Get programme statistics
    const programmeStatistics =
      await getOrganisationProgrammeStatistics(organisationIds);

    const statisticsMap = new Map(
      programmeStatistics.map((item) => [item._id.toString(), item]),
    );

    // 7. Attach statistics
    const organisationsWithStatistics = organisations.map((organisation) => {
      const { members = [], ...organisationData } = organisation;

      const statistics = statisticsMap.get(organisation._id.toString());

      return {
        ...organisationData,

        memberCount: members.length,

        programmeStatistics: {
          totalProgrammes: statistics?.totalProgrammes || 0,
          draftProgrammes: statistics?.draftProgrammes || 0,
          publishedProgrammes: statistics?.publishedProgrammes || 0,
          cancelledProgrammes: statistics?.cancelledProgrammes || 0,
          completedProgrammes: statistics?.completedProgrammes || 0,
        },
      };
    });

    // 8. Return response
    return res.status(200).json({
      message: "Organisations fetched successfully",

      organisations: organisationsWithStatistics,

      pagination: {
        currentPage,
        pageLimit,
        totalOrganisations,

        totalPages: Math.ceil(totalOrganisations / pageLimit),

        hasNextPage: currentPage * pageLimit < totalOrganisations,

        hasPreviousPage: currentPage > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getOrganisationByIdForAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Validate ID
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid organisation ID",
      });
    }

    // 2. Find organisation
    const organisation = await Organisation.findById(id)
      .populate("owner", "name email phone_number")
      .populate("members.user", "name email phone_number role")
      .lean();

    if (!organisation) {
      return res.status(404).json({
        message: "Organisation not found",
      });
    }

    // 3. Get programme statistics
    const programmeStatistics = await getOrganisationProgrammeStatistics([
      organisation._id,
    ]);

    const statistics = programmeStatistics[0] || {
      totalProgrammes: 0,
      draftProgrammes: 0,
      publishedProgrammes: 0,
      cancelledProgrammes: 0,
      completedProgrammes: 0,
    };

    // 4. Fetch organisation programmes
    const programmes = await Programme.find({
      organisation: organisation._id,
    })
      .select(
        "title category status startDate endDate registrationEnabled registeredCount capacity",
      )
      .sort({ createdAt: -1 })
      .lean();

    // 5. Return response
    return res.status(200).json({
      message: "Organisation fetched successfully",

      organisation: {
        ...organisation,

        memberCount: organisation.members.length,

        programmeStatistics: statistics,

        programmes,
      },
    });
  } catch (error) {
    next(error);
  }
};
