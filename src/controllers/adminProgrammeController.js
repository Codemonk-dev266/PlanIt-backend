import mongoose from "mongoose";
import Programme from "../models/programmeModel.js";
import Registration from "../models/registrationModel.js";

const getRegistrationStatistics = async (programmeIds) => {
  const statistics = await Registration.aggregate([
    {
      $match: {
        programme: { $in: programmeIds },
      },
    },
    {
      $group: {
        _id: "$programme",

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
      },
    },
  ]);

  return statistics;
};

// get all programmes for admin
export const getAllProgrammesForAdmin = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, search, status, category } = req.query;

    // 1. Validate pagination
    const currentPage = Number(page);
    const pageLimit = Number(limit);

    if (
      !Number.isInteger(currentPage) ||
      !Number.isInteger(pageLimit) ||
      currentPage > 1000000 ||
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

    const validStatuses = ["draft", "published", "cancelled", "completed"];

    const validCategories = [
      "conference",
      "meeting",
      "seminar",
      "workshop",
      "party",
      "religious",
      "government",
      "social",
      "other",
    ];

    if (
      (search !== undefined && typeof search !== "string") ||
      (status !== undefined && typeof status !== "string") ||
      (category !== undefined && typeof category !== "string")
    ) {
      return res.status(400).json({
        message: "Invalid search or filter parameters",
      });
    }

    if (status) {
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          message: "Invalid programme status",
        });
      }

      filter.status = status;
    }

    if (category) {
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          message: "Invalid programme category",
        });
      }

      filter.category = category;
    }

    // 3. Search programmes
    if (search) {
      const searchTerm = search.trim();

      if (searchTerm.length > 100) {
        return res.status(400).json({
          message: "Search term is too long",
        });
      }

      if (searchTerm) {
        const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        const searchRegex = new RegExp(escapedSearch, "i");

        filter.$or = [
          { title: searchRegex },
          { description: searchRegex },
          { venue: searchRegex },
        ];
      }
    }

    // 4. Fetch programmes and total count
    const [programmes, totalProgrammes] = await Promise.all([
      Programme.find(filter)
        .populate("organiser", "name email")
        .populate("organisation", "name email type")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit)
        .lean(),

      Programme.countDocuments(filter),
    ]);

    // 5. Fetch registration statistics
    const programmeIds = programmes.map((programme) => programme._id);

    const statistics = await getRegistrationStatistics(programmeIds);

    // 6. Map statistics to programmes
    const statisticsMap = new Map(
      statistics.map((item) => [item._id.toString(), item]),
    );

    const programmesWithStatistics = programmes.map((programme) => {
      const stats = statisticsMap.get(programme._id.toString());

      const activeRegistrations = stats?.activeRegistrations || 0;

      const checkedIn = stats?.checkedIn || 0;

      const checkInPercentage =
        activeRegistrations === 0
          ? 0
          : Number(((checkedIn / activeRegistrations) * 100).toFixed(2));

      return {
        ...programme,

        statistics: {
          totalRegistrations: stats?.totalRegistrations || 0,

          activeRegistrations,

          cancelledRegistrations: stats?.cancelledRegistrations || 0,

          checkedIn,

          notCheckedIn: activeRegistrations - checkedIn,

          checkInPercentage,
        },
      };
    });

    // 7. Return response
    return res.status(200).json({
      message: "Programmes fetched successfully",

      programmes: programmesWithStatistics,

      pagination: {
        currentPage,
        pageLimit,
        totalProgrammes,
        totalPages: Math.ceil(totalProgrammes / pageLimit),
        hasNextPage: currentPage * pageLimit < totalProgrammes,
        hasPreviousPage: currentPage > 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

// get programme by if for admin
export const getProgrammeByIdForAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 1. Validate ID
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        message: "Invalid programme ID",
      });
    }

    // 2. Find programme
    const programme = await Programme.findById(id)
      .populate("organiser", "name email phone_number")
      .populate("organisation", "name email type")
      .lean();

    if (!programme) {
      return res.status(404).json({
        message: "Programme not found",
      });
    }

    // 3. Get registration statistics
    const statistics = await getRegistrationStatistics([programme._id]);

    const stats = statistics[0] || {};

    const totalRegistrations = stats.totalRegistrations || 0;
    const activeRegistrations = stats.activeRegistrations || 0;
    const cancelledRegistrations = stats.cancelledRegistrations || 0;
    const checkedIn = stats.checkedIn || 0;

    const checkInPercentage =
      activeRegistrations === 0
        ? 0
        : Number(((checkedIn / activeRegistrations) * 100).toFixed(2));

    const remainingCapacity =
      programme.capacity === null
        ? null
        : Math.max(programme.capacity - activeRegistrations, 0);

    return res.status(200).json({
      message: "Programme fetched successfully",

      programme,

      statistics: {
        totalRegistrations,
        activeRegistrations,
        cancelledRegistrations,
        checkedIn,
        notCheckedIn: activeRegistrations - checkedIn,
        checkInPercentage,
        remainingCapacity,
      },
    });
  } catch (error) {
    next(error);
  }
};
