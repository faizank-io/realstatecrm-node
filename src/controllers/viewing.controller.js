const asyncHandler = require("../utils/asyncHandler");
const viewingService = require("../services/viewing.service");
const ApiResponse = require("../utils/ApiResponse");

class ViewingController {
  createViewing = asyncHandler(async (req, res) => {
    // startAt and endAt must be Date objects
    if (req.body.startAt) req.body.startAt = new Date(req.body.startAt);
    if (req.body.endAt) req.body.endAt = new Date(req.body.endAt);

    const result = await viewingService.createViewing(
      req.user.agencyId,
      req.user.id,
      req.body
    );

    return ApiResponse.success(res, result, "Viewing Scheduled Successfully", 201);
  });

  getViewings = asyncHandler(async (req, res) => {
    const filters = { ...req.query, agencyId: req.user.agencyId };

    // Agent can only see their own assigned viewings. Managers/Owners see all.
    if (req.user.role === "AGENT") {
      filters.assignedToId = req.user.id;
    }

    const result = await viewingService.getViewings(filters);
    return ApiResponse.success(res, result, "Viewings retrieved successfully");
  });

  updateViewing = asyncHandler(async (req, res) => {
    const result = await viewingService.updateViewing(
      req.params.id,
      req.user.agencyId,
      req.user.id,
      req.body
    );
    return ApiResponse.success(res, result, "Viewing updated successfully");
  });

  deleteViewing = asyncHandler(async (req, res) => {
    await viewingService.deleteViewing(
      req.params.id,
      req.user.agencyId,
      req.user.id
    );
    return ApiResponse.success(res, null, "Viewing deleted successfully");
  });
}

module.exports = new ViewingController();
