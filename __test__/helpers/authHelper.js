/**
 * Authentication Test Helpers
 */

const request = require("supertest");
const app = require("../../src/app");

class AuthHelpers {
  /**
   * Login as superadmin
   */
  static async loginAsSuperAdmin() {
    const response = await request(app).post("/api/auth/login").send({
      username: "gem",
      password: "admin123",
    });

    if (!response.body.success) {
      throw new Error("Failed to login as superadmin");
    }

    return {
      accessToken: response.body.data.accessToken,
      refreshToken: response.body.data.refreshToken,
      user: response.body.data.user,
    };
  }

  /**
   * Login as admin
   */
  static async loginAsAdmin(username, password = "admin123") {
    const response = await request(app).post("/api/auth/login").send({
      username,
      password,
    });

    if (!response.body.success) {
      throw new Error(`Failed to login as admin: ${username}`);
    }

    return {
      accessToken: response.body.data.accessToken,
      refreshToken: response.body.data.refreshToken,
      user: response.body.data.user,
    };
  }

  /**
   * Login as teacher
   */
  static async loginAsTeacher(username, password = "teacher123") {
    const response = await request(app).post("/api/auth/login").send({
      username,
      password,
    });

    if (!response.body.success) {
      throw new Error(`Failed to login as teacher: ${username}`);
    }

    return {
      accessToken: response.body.data.accessToken,
      refreshToken: response.body.data.refreshToken,
      user: response.body.data.user,
    };
  }

  /**
   * Get authorization header
   */
  static getAuthHeader(accessToken) {
    return { Authorization: `Bearer ${accessToken}` };
  }
}

module.exports = AuthHelpers;
