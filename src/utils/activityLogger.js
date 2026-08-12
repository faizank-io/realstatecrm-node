const prisma = require("../config/db.config");

/**
 * Log an activity event linked to a property.
 * Call this inside any service method whenever a significant change happens.
 *
 * @param {string} action     - Human-readable description, e.g. "Price reduced to 4.94 Cr"
 * @param {string} propertyId - The property this event belongs to
 * @param {string} userId     - The user who triggered the action
 * @param {string} entityType - PROPERTY | CLIENT | DEAL | VIEWING (default: PROPERTY)
 * @param {string} entityId   - ID of the entity (defaults to propertyId)
 */
async function logActivity({ action, propertyId, userId, entityType = "PROPERTY", entityId }) {
  try {
    await prisma.activityLog.create({
      data: {
        action,
        entityType,
        entityId: entityId || propertyId,
        propertyId,
        userId
      }
    });
  } catch (err) {
    // Activity logging is non-critical — never crash the main flow
    console.error("[ActivityLog] Failed to log activity:", err.message);
  }
}

/**
 * Format a PKR price value into a human-readable string.
 * e.g. 4940000 → "49.4 Lac"  |  49400000 → "4.94 Cr"
 */
function formatPrice(amount) {
  if (amount >= 10_000_000) return `${(amount / 10_000_000).toFixed(2)} Cr`;
  if (amount >= 100_000)    return `${(amount / 100_000).toFixed(1)} Lac`;
  return `PKR ${amount.toLocaleString()}`;
}

module.exports = { logActivity, formatPrice };
