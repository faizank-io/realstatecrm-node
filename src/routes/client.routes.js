const { Router } = require("express");
const authenticate = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/authorize.middleware");
const clientController = require("../controllers/client.controller");
const router = Router();

router.use(authenticate);

router.get("/", clientController.getClients);
router.get("/export", clientController.exportClients); // Must be before /:id
router.post("/", clientController.createClient);
router.get("/:id", clientController.getClientById);

// Client tabs (Paginated)
router.get("/:id/timeline", clientController.getClientTimeline);
router.get("/:id/properties", clientController.getClientMatchedProperties);
router.get("/:id/viewings", clientController.getClientViewings);
router.get("/:id/documents", clientController.getClientDocuments);

// Update and Delete
router.put("/:id", clientController.updateClient);
router.delete("/:id", authorize("SUPER_ADMIN", "AGENCY_OWNER", "OFFICE_MANAGER"), clientController.deleteClient);

module.exports = router;
