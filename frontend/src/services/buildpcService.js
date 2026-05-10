import axios from "../setup/axios";

/**
 * Save the current PC build to the database.
 *
 * @param {Object} buildData
 * @param {string}  buildData.build_name  - Required. Human-readable build name.
 * @param {string}  [buildData.description] - Optional description.
 * @param {boolean} [buildData.is_public]   - Default true.
 * @param {Array}   buildData.items         - Array of { product_id, category_id, quantity }
 * @param {number|null} [buildData.user_id] - Passed for guest builds (backend also reads session).
 */
export const savePCBuild = async (buildData) => {
  try {
    const response = await axios.post("/build/save", buildData);
    return response;
  } catch (error) {
    console.error("Error saving build:", error);
    throw error?.response?.data ?? error;
  }
};

/**
 * Fetch the saved-build history for the current logged-in user.
 */
export const getBuildHistory = async () => {
  try {
    const response = await axios.get("/build/history");
    return response;
  } catch (error) {
    console.error("Error fetching build history:", error);
    throw error?.response?.data ?? error;
  }
};

/**
 * Fetch a single build by its slug (public or owned).
 *
 * @param {string} slug
 */
export const getBuildBySlug = async (slug) => {
  try {
    const response = await axios.get(`/build/${slug}`);
    return response;
  } catch (error) {
    console.error("Error fetching build:", error);
    throw error?.response?.data ?? error;
  }
};

/**
 * Delete a saved build by its numeric ID.
 *
 * @param {number} buildId
 */
export const deleteBuild = async (buildId) => {
  try {
    const response = await axios.delete(`/build/${buildId}`);
    return response;
  } catch (error) {
    console.error("Error deleting build:", error);
    throw error?.response?.data ?? error;
  }
};

/**
 * Fetch all shared public builds.
 */
export const getSharedBuilds = async () => {
  try {
    const response = await axios.get("/build/shared");
    return response;
  } catch (error) {
    console.error("Error fetching shared builds:", error);
    throw error?.response?.data ?? error;
  }
};

