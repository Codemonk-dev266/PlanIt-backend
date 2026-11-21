import mongoose from "mongoose";

const programmeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Programme title is required"],
      trim: true,
      minLength: [5, "Programme title is too short"],
      maxLength: [150, "Programme title is too long"],
    },

    image: {
      url: {
        type: String,
      },

      public_id: {
        type: String,
      },
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },

    description: {
      type: String,
      required: [true, "Programme description is required"],
      trim: true,
      maxLength: [2000, "Description cannot exceed 2000 characters"],
    },

    category: {
      type: String,
      enum: [
        "conference",
        "meeting",
        "seminar",
        "workshop",
        "party",
        "religious",
        "government",
        "social",
        "other",
      ],
      required: [true, "Programme category is required"],
    },

    organiser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    organisation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organisation",
      default: null,
    },

    venue: {
      type: String,
      required: [true, "Programme venue is required"],
      trim: true,
    },

    address: {
      type: String,
      trim: true,
      default: null,
    },

    startDate: {
      type: Date,
      required: [true, "Programme start date is required"],
    },

    endDate: {
      type: Date,
      required: [true, "Programme end date is required"],
    },

    registrationDeadline: {
      type: Date,
      required: [true, "Registration deadline is required"],
    },

    capacity: {
      type: Number,
      min: [1, "Capacity must be at least 1"],
      validate: {
        validator: Number.isInteger,
        message: "Capacity must be a whole number",
      },
      default: null,
    },

    registrationEnabled: {
      type: Boolean,
      default: true,
    },

    registeredCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Registered count must be a whole number",
      },
    },

    status: {
      type: String,
      enum: ["draft", "published", "cancelled", "completed"],
      default: "draft",
    },
  },
  { timestamps: true },
);

// Generate slug from programme title

programmeSchema.pre("validate", async function () {
  if (!this.isModified("title") || !this.title) {
    return;
  }

  const baseSlug = this.title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  let slug = baseSlug;
  let counter = 2;

  while (
    await mongoose.models.Programme.exists({
      slug,
      _id: { $ne: this._id },
    })
  ) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  this.slug = slug;
});
// Indexes
programmeSchema.index({ organiser: 1, createdAt: -1 });
programmeSchema.index({ organisation: 1 });
programmeSchema.index({ status: 1, startDate: 1 });

// programmeSchema.index({ slug: 1 }, { unique: true });

const Programme = mongoose.model("Programme", programmeSchema);

export default Programme;
