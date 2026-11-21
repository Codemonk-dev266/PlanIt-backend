import app from "./src/app.js";
import connectDB from "./src/config/mongodb.js";
import userRoute from "./src/routes/userRoutes.js";
import organisationRoute from "./src/routes/organisationRoutes.js";
import programmeRoute from "./src/routes/programmeRoutes.js";
import registrationRoute from "./src/routes/registrationRoute.js";
import adminRoute from "./src/routes/adminRoutes.js";
import adminProgrammeRoute from "./src/routes/adminProgrammeRoute.js";
import adminOrganisationRoute from "./src/routes/adminOrganisationRoute.js";
import adminUserRoute from "./src/routes/adminUserRoute.js";
import adminProgrammeIntervention from "./src/routes/adminProgrammeInterventionRoute.js";
import adminRegistratioRoute from "./src/routes/adminRegistrationRoute.js";

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.json("api is reachable");
});

// public and organiser routes
app.use("/api/auth", userRoute);

app.use("/api/organisations", organisationRoute);

app.use("/api/programmes", programmeRoute);

app.use("/api/registrations", registrationRoute);

// General admin routes
app.use("/api/admin", adminRoute);

// admin routes
app.use("/api/admin/programmes", adminProgrammeRoute);

app.use("/api/admin/organisations", adminOrganisationRoute);

app.use("/api/admin/users", adminUserRoute);

app.use("/api/admin/programme-interventions", adminProgrammeIntervention);

app.use("/api/admin/registrations", adminRegistratioRoute);

// Start only after successful database connection
const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`API is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
