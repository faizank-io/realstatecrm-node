const asyncHandler = require("../utils/asyncHandler");
const ClientService = require("../services/client.service");
const ApiResponse = require("../utils/ApiResponse");
const clientService = require("../services/client.service");

class ClientController {
  // create client
  createClient = asyncHandler(async (req, res) => {
    if (req.body.budget) req.body.budget = parseFloat(req.body.budget);

    const result = await clientService.createClient(
      req.user.agencyId,
      req.user.id,
      req.body,
    );

    return ApiResponse.success(res, result, "Client Created Successfully", 201);
  });

  // get clients
  getClients = asyncHandler(async (req, res) => {
    const filters = { ...req.query, agencyId: req.user.agencyId };

    if (req.user.role === "AGENT") {
      filters.assignedToId = req.user.id;
    }

    const result = await clientService.getClients(filters);
    return ApiResponse.success(res, result, "Client List Fetch", 200);
  });
  // get client by id
  getClientById = asyncHandler(async (req, res) => {
    const result = await clientService.getClientById(req.params.id, req.user.agencyId);
    return ApiResponse.success(res, result, "Client retrieved successfully");
  });

  getClientTimeline = asyncHandler(async (req, res) => {
    const result = await clientService.getClientTimeline(req.params.id, req.query);
    return ApiResponse.success(res, result, "Client timeline retrieved");
  });

  getClientMatchedProperties = asyncHandler(async (req, res) => {
    const result = await clientService.getClientMatchedProperties(req.params.id, req.query);
    return ApiResponse.success(res, result, "Client matched properties retrieved");
  });

  getClientViewings = asyncHandler(async (req, res) => {
    const result = await clientService.getClientViewings(req.params.id, req.query);
    return ApiResponse.success(res, result, "Client viewings retrieved");
  });

  getClientDocuments = asyncHandler(async (req, res) => {
    const result = await clientService.getClientDocuments(req.params.id, req.query);
    return ApiResponse.success(res, result, "Client documents retrieved");
  });

  updateClient = asyncHandler(async (req, res) => {
    const result = await clientService.updateClient(req.params.id, req.user.agencyId, req.user.id, req.body);
    return ApiResponse.success(res, result, "Client updated successfully");
  });

  deleteClient = asyncHandler(async (req, res) => {
    await clientService.deleteClient(req.params.id, req.user.agencyId, req.user.id);
    return ApiResponse.success(res, null, "Client deleted successfully");
  });

  exportClients = asyncHandler(async (req, res) => {
    const filters = { ...req.query, agencyId: req.user.agencyId };
    
    if (req.user.role === "AGENT") {
      filters.assignedToId = req.user.id;
    }

    const csvData = await clientService.exportClientsCSV(filters);
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=clients_export_${Date.now()}.csv`);
    return res.status(200).send(csvData);
  });
}

module.exports = new ClientController();
