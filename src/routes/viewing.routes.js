const { Router } = require("express");
const authenticate = require("../middlewares/auth.middleware");
const viewingController = require("../controllers/viewing.controller");

const router = Router();

router.use(authenticate);

router.get("/", viewingController.getViewings);
router.post("/", viewingController.createViewing);
router.put("/:id", viewingController.updateViewing);
router.delete("/:id", viewingController.deleteViewing);

module.exports = router;