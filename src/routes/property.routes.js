const { Router } = require("express");
const PropertyController = require("../controllers/property.controller");
const authenticate = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/authorize.middleware");
const upload = require("../middlewares/upload.middleware");

const router = Router();

router.use(authenticate);

// List and Create
router.get("/", PropertyController.getProperties);
router.get("/export", PropertyController.exportProperties);  // must be before /:id
router.post("/", upload.array("images", 10), PropertyController.createProperty);

// Specific Property — Overview, Media & Amenities (no pagination)
router.get("/:id", PropertyController.getPropertyById);
router.put("/:id", upload.none(), PropertyController.updateProperty);
router.delete("/:id", PropertyController.deleteProperty);

// Property tab sub-resources (all paginated via ?page=&limit=)
router.get("/:id/leads",     PropertyController.getPropertyLeads);
router.get("/:id/viewings",  PropertyController.getPropertyViewings);
router.get("/:id/documents", PropertyController.getPropertyDocuments);
router.get("/:id/activity",  PropertyController.getPropertyActivity);

// Upload Images (up to 10 images at once)
router.post("/:id/images", upload.array("images", 10), PropertyController.uploadImages);
// Delete a specific image
router.delete("/:id/image/:imageId", PropertyController.deleteImage);
// Set a specific image as the main/cover
router.patch("/:id/image/:imageId/set-main", PropertyController.setMainImage);
// Approve Listing (Manager/Owner only)
router.patch("/:id/approve", authorize("AGENCY_OWNER", "OFFICE_MANAGER", "SUPER_ADMIN"), PropertyController.approveListing);

module.exports = router;
