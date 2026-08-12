const { Router } = require("express");
const authRoutes = require("./auth.routes");
const adminRoutes = require("./admin.routes");
const uploadRoutes = require("./upload.routes");
const propertyRoutes = require("./property.routes");
const lookupRoutes = require("./lookup.routes");
const clientRoutes = require("./client.routes");
const viewingRoutes = require("./viewing.routes");
const documentRoutes = require("./document.routes");

const router = Router();

router.use("/v1/auth", authRoutes);
router.use("/v1/admin", adminRoutes);
router.use("/v1/upload", uploadRoutes);
router.use("/v1/properties", propertyRoutes);
router.use("/v1/lookup", lookupRoutes);
router.use("/v1/clients", clientRoutes);
router.use("/v1/viewings", viewingRoutes);
router.use("/v1/documents", documentRoutes);

module.exports = router;
