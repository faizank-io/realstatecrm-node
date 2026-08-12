const prisma = require("../config/db.config");
const ApiResponse = require("../utils/ApiResponse");
const asyncHandler = require("../utils/asyncHandler");

class LookupController {
  /**
   * GET /api/v1/lookup/property-form
   * Returns all dropdown data needed for property create/edit form in a single call.
   * Only returns ACTIVE items.
   */
  getPropertyFormData = asyncHandler(async (req, res) => {
    const [propertyTypes, listingStatuses, amenities, agents] =
      await Promise.all([
        // Property types WITH their categories nested
        prisma.propertyType.findMany({
          where: { status: "ACTIVE" },
          select: {
            id: true,
            name: true,
            slug: true,
            categories: {
              where: { status: "ACTIVE" },
              select: { id: true, name: true, slug: true },
              orderBy: { name: "asc" },
            },
          },
          orderBy: { name: "asc" },
        }),

        // Listing statuses (Available, Reserved, Rented, Sold etc.)
        prisma.listingStatus.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, name: true, slug: true, colorCode: true },
          orderBy: { name: "asc" },
        }),

        // Amenities (Lift, Parking, Generator etc.)
        prisma.amenity.findMany({
          where: { status: "ACTIVE" },
          select: { id: true, name: true, slug: true, icon: true },
          orderBy: { name: "asc" },
        }),

        // Agents of this agency only (for "Assigned Agent" dropdown)
        prisma.user.findMany({
          where: {
            agencyId: req.user.agencyId,
            status: "ACTIVE",
            role: {
              in: [
                "AGENT",
                "PROPERTY_MANAGER",
                "OFFICE_MANAGER",
                "AGENCY_OWNER",
              ],
            },
          },
          select: { id: true, name: true, role: true, avatar: true },
          orderBy: { name: "asc" },
        }),
      ]);

    return ApiResponse.success(
      res,
      {
        propertyTypes, // Includes nested categories
        listingStatuses,
        amenities,
        agents,
      },
      "Lookup data fetched",
    );
  });

  /**
   * GET /api/v1/lookup/lead-sources
   * Returns lead sources for Clients/Leads form.
   */
  getLeadSources = asyncHandler(async (req, res) => {
    const sources = await prisma.leadSource.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, slug: true },
      orderBy: { name: "asc" },
    });
    return ApiResponse.success(res, sources, "Lead sources fetched");
  });
}

module.exports = new LookupController();
