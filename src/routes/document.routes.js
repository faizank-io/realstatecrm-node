const { Router } = require("express");
const authenticate = require("../middlewares/auth.middleware");
const documentController = require("../controllers/document.controller");

const router = Router();

router.use(authenticate);

router.post("/", documentController.addDocument);
router.get("/", documentController.getDocuments);
router.delete("/:id", documentController.deleteDocument);

module.exports = router;
