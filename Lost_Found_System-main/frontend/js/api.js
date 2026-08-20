const API_BASE_URL = "https://lostfoundsystem-production-3c15.up.railway.app";
 
 
// TOKEN STORAGE
// We store the JWT in localStorage so it survives page refreshes.
 
 
function saveToken(token) {
  localStorage.setItem("access_token", token);
}
 
function getToken() {
  return localStorage.getItem("access_token");
}
 
function clearToken() {
  localStorage.removeItem("access_token");
}
 
 
 
// Every API call goes through this function.
// It automatically attaches the JWT token if one exists.
 
async function apiRequest(endpoint, options = {}) {
  const token = getToken();
 
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
 
  // If we have a token, attach it as a Bearer token.
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
 
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
 
  // FastAPI returns JSON even for errors
  const data = await response.json().catch(() => null);
 
  if (!response.ok) {
    const errorMessage = data?.detail || "Something went wrong";
    throw new Error(errorMessage);
  }
 
  return data;
}
 
// Special version for file uploads (images) — does NOT set Content-Type,
// because the browser needs to set it automatically with the correct
// multipart boundary when sending FormData.
async function apiRequestFormData(endpoint, formData) {
  const token = getToken();
 
  const headers = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
 
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers,
    body: formData,
  });
 
  const data = await response.json().catch(() => null);
 
  if (!response.ok) {
    const errorMessage = data?.detail || "Something went wrong";
    throw new Error(errorMessage);
  }
 
  return data;
}
 
 
// AUTH ENDPOINTS
 
 
async function registerUser({ full_name, email, password, role, student_id }) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ full_name, email, password, role, student_id }),
  });
}
 
async function loginUser({ email, password }) {
  const data = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
 
  saveToken(data.access_token);
  return data;
}
 
async function getCurrentUser() {
  return apiRequest("/auth/me", {
    method: "GET",
  });
}
 
function logoutUser() {
  clearToken();
}
 
 
// FOUND ITEMS ENDPOINTS
 
 
async function listFoundItems() {
  return apiRequest("/found-items", {
    method: "GET",
  });
}
 
async function getFoundItem(itemId) {
  return apiRequest(`/found-items/${itemId}`, {
    method: "GET",
  });
}
 
// Security/admin only
async function createFoundItem({ title, description, category, location_found, date_found }) {
  return apiRequest("/found-items", {
    method: "POST",
    body: JSON.stringify({ title, description, category, location_found, date_found }),
  });
}
 
// Security/admin only
async function updateFoundItemStatus(itemId, status) {
  return apiRequest(`/found-items/${itemId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
 
 
// INQUIRIES ENDPOINTS
 
 
// Student only
async function submitInquiry(itemId, claim_description) {
  return apiRequest(`/found-items/${itemId}/inquiries`, {
    method: "POST",
    body: JSON.stringify({ claim_description }),
  });
}
 
// Security/admin only
async function listInquiriesForItem(itemId) {
  return apiRequest(`/found-items/${itemId}/inquiries`, {
    method: "GET",
  });
}
 
// Student only
async function listMyInquiries() {
  return apiRequest("/inquiries/my", {
    method: "GET",
  });
}
 
// Security/admin only
async function updateInquiryStatus(inquiryId, status) {
  return apiRequest(`/inquiries/${inquiryId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}
 
 
// MESSAGES ENDPOINTS
 
 
async function sendMessage(inquiryId, message) {
  return apiRequest(`/inquiries/${inquiryId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}
 
async function getMessages(inquiryId) {
  return apiRequest(`/inquiries/${inquiryId}/messages`, {
    method: "GET",
  });
}
 
 
// IMAGES ENDPOINTS
 
 
// Security/admin only. `file` is a File object from an <input type="file">
async function uploadImage(itemId, file) {
  const formData = new FormData();
  formData.append("file", file);
 
  return apiRequestFormData(`/found-items/${itemId}/images`, formData);
}
 
async function getImages(itemId) {
  return apiRequest(`/found-items/${itemId}/images`, {
    method: "GET",
  });
}
 
 
// EXPORTS
 
 
export {
  // auth
  registerUser,
  loginUser,
  getCurrentUser,
  logoutUser,
  getToken,
  // found items
  listFoundItems,
  getFoundItem,
  createFoundItem,
  updateFoundItemStatus,
  // inquiries
  submitInquiry,
  listInquiriesForItem,
  listMyInquiries,
  updateInquiryStatus,
  // messages
  sendMessage,
  getMessages,
  // images
  uploadImage,
  getImages,
};