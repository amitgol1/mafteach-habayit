import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const refreshedToken = response.headers["x-refreshed-token"];
    // Only refresh a live session: a response still in flight when the user
    // logged out would otherwise write the token back and undo the logout.
    if (refreshedToken && localStorage.getItem("token")) {
      localStorage.setItem("token", refreshedToken);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== "/login") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
