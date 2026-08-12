const asyncHandler = require("../utils/asyncHandler");
const PropertyService = require("../services/property.service");
const ApiResponse = require("../utils/ApiResponse");

class PropertyController {
  createProperty = asyncHandler(async (req, res) => {
    req.body = req.body || {};

    // Parse numeric fields from FormData strings to proper types
    if (req.body.price)     req.body.price     = parseFloat(req.body.price);
    if (req.body.bedrooms)  req.body.bedrooms  = parseInt(req.body.bedrooms);
    if (req.body.bathrooms) req.body.bathrooms = parseInt(req.body.bathrooms);
    if (req.body.parking)   req.body.parking   = parseInt(req.body.parking);
    if (req.body.floors)    req.body.floors    = parseInt(req.body.floors);
    if (req.body.size)      req.body.size      = parseFloat(req.body.size);
    if (req.body.builtYear) req.body.builtYear = parseInt(req.body.builtYear);
    if (req.body.isFurnished === 'true')  req.body.isFurnished = true;
    if (req.body.isFurnished === 'false') req.body.isFurnished = false;

    // If amenities are sent as stringified JSON array (not as amenities[0], amenities[1])
    if (req.body.amenities && typeof req.body.amenities === 'string') {
      try { req.body.amenities = JSON.parse(req.body.amenities); } catch (e) {}
    }

    // Strip image-only fields so they don't get passed to the property create query
    const { names, mainIndex, ...propertyBody } = req.body;

    let result = await PropertyService.createProperty(
      req.user.agencyId,
      req.user.id,
      req.user.role,
      propertyBody
    );

    if (req.files && req.files.length > 0) {
      result = await PropertyService.uploadImages(result.id, req.files, names, mainIndex);
    }

    return ApiResponse.success(res, result, "Property created successfully", 201);
  });

  uploadImages = asyncHandler(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return ApiResponse.error(res, "No files uploaded", 400);
    }
    const result = await PropertyService.uploadImages(
      req.params.id,
      req.files,
      req.body.names,
      req.body.mainIndex
    );
    return ApiResponse.success(res, result, "Images uploaded successfully");
  });

  deleteImage = asyncHandler(async (req, res) => {
    const result = await PropertyService.deleteImage(req.params.id, req.params.imageId);
    return ApiResponse.success(res, result, "Image deleted");
  });

  setMainImage = asyncHandler(async (req, res) => {
    const result = await PropertyService.setMainImage(req.params.id, req.params.imageId);
    return ApiResponse.success(res, result, "Cover image updated");
  });

  getProperties = asyncHandler(async (req, res) => {
    // Agency users can only see their agency's properties
    const filters = { ...req.query };
    if (req.user.role !== "SUPER_ADMIN") {
      filters.agencyId = req.user.agencyId;
    }
    const result = await PropertyService.getProperties(filters);
    return ApiResponse.success(res, result, "Properties retrieved");
  });

  exportProperties = asyncHandler(async (req, res) => {
    const filters = { ...req.query };
    if (req.user.role !== "SUPER_ADMIN") {
      filters.agencyId = req.user.agencyId;
    }
    const csvContent = await PropertyService.exportPropertiesCSV(filters);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="properties-export.csv"');
    return res.status(200).send(csvContent);
  });

  getPropertyById = asyncHandler(async (req, res) => {
    const result = await PropertyService.getPropertyById(req.params.id);
    return ApiResponse.success(res, result, "Property retrieved");
  });

  updateProperty = asyncHandler(async (req, res) => {
    // Parse numeric fields (handles both JSON and multipart/form-data)
    if (req.body.price     !== undefined) req.body.price     = parseFloat(req.body.price);
    if (req.body.bedrooms  !== undefined) req.body.bedrooms  = parseInt(req.body.bedrooms);
    if (req.body.bathrooms !== undefined) req.body.bathrooms = parseInt(req.body.bathrooms);
    if (req.body.parking   !== undefined) req.body.parking   = parseInt(req.body.parking);
    if (req.body.floors    !== undefined) req.body.floors    = parseInt(req.body.floors);
    if (req.body.size      !== undefined) req.body.size      = parseFloat(req.body.size);
    if (req.body.builtYear !== undefined) req.body.builtYear = parseInt(req.body.builtYear);
    if (req.body.isFurnished === 'true')  req.body.isFurnished = true;
    if (req.body.isFurnished === 'false') req.body.isFurnished = false;

    // Amenities as JSON string or array
    if (req.body.amenities && typeof req.body.amenities === 'string') {
      try { req.body.amenities = JSON.parse(req.body.amenities); } catch (e) {}
    }

    const result = await PropertyService.updateProperty(req.params.id, req.user.id, req.body);
    return ApiResponse.success(res, result, "Property updated");
  });

  deleteProperty = asyncHandler(async (req, res) => {
    await PropertyService.deleteProperty(req.params.id);
    return ApiResponse.success(res, null, "Property deleted");
  });

  approveListing = asyncHandler(async (req, res) => {
    const result = await PropertyService.approveListing(req.params.id, req.user.id);
    return ApiResponse.success(res, result, "Property approved");
  });

  // ─── PAGINATED TAB ENDPOINTS ───────────────────────────────────────────────

  getPropertyLeads = asyncHandler(async (req, res) => {
    const result = await PropertyService.getPropertyLeads(req.params.id, req.query);
    return ApiResponse.success(res, result, "Property leads retrieved");
  });

  getPropertyViewings = asyncHandler(async (req, res) => {
    const result = await PropertyService.getPropertyViewings(req.params.id, req.query);
    return ApiResponse.success(res, result, "Property viewings retrieved");
  });

  getPropertyDocuments = asyncHandler(async (req, res) => {
    const result = await PropertyService.getPropertyDocuments(req.params.id, req.query);
    return ApiResponse.success(res, result, "Property documents retrieved");
  });

  getPropertyActivity = asyncHandler(async (req, res) => {
    const result = await PropertyService.getPropertyActivity(req.params.id, req.query);
    return ApiResponse.success(res, result, "Property activity retrieved");
  });
}

module.exports = new PropertyController();