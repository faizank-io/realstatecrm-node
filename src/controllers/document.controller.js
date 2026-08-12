const asyncHandler = require("../utils/asyncHandler");
const documentService = require("../services/document.service");
const ApiResponse = require("../utils/ApiResponse");

class DocumentController {
  addDocument = asyncHandler(async (req, res) => {
    const result = await documentService.addDocument(req.user.agencyId, req.user.id, req.body);
    return ApiResponse.success(res, result, "Document added successfully", 201);
  });

  getDocuments = asyncHandler(async (req, res) => {
    const result = await documentService.getDocuments(req.user.agencyId, req.query);
    return ApiResponse.success(res, result, "Documents retrieved successfully");
  });

  deleteDocument = asyncHandler(async (req, res) => {
    await documentService.deleteDocument(req.params.id, req.user.agencyId, req.user.id);
    return ApiResponse.success(res, null, "Document deleted successfully");
  });
}

module.exports = new DocumentController();
